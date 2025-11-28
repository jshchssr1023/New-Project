#!/usr/bin/env python3
"""
ChronosDataStore.py - Data Store Module for Chronos Scenario Engine

This module provides the data persistence layer and core data structures
for the Chronos Lease Release + Qualification Scenario Engine.

Contains:
- MasterDataStore: Central data management class with SQLite persistence
- ScheduledEvent: Represents a scheduled work event
- LeaseEvent: Represents a lease expiration/release event
- ShopCapacity: Represents shop capacity constraints
- WORK_DURATION: Dictionary of work type durations

Author: AITX Chronos Team
Version: 1.0.0
"""

from __future__ import annotations

import copy
import hashlib
import json
import sqlite3
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Union


# =============================================================================
# CONSTANTS
# =============================================================================

# Work duration constants (in business days)
WORK_DURATION: dict[str, int] = {
    "qualification": 3,
    "qual": 3,
    "cleaning": 1,
    "minor_repair": 2,
    "major_repair": 5,
    "repair": 3,  # Average repair
    "assignment": 1,
    "assignment_prep": 1,
    "inspection": 1,
    "return_prep": 1,
}

# Default capacity values
DEFAULT_MONTHLY_QUAL_CAPACITY = 50
DEFAULT_MONTHLY_ASSIGN_CAPACITY = 30
DEFAULT_MONTHLY_RETURN_CAPACITY = 40
DEFAULT_MONTHLY_REPAIR_CAPACITY = 20

# Planning horizon
PLANNING_HORIZON_MONTHS = 6


# =============================================================================
# ENUMERATIONS
# =============================================================================

class WorkType(Enum):
    """Types of work that can be performed on a railcar."""
    QUALIFICATION = "qualification"
    ASSIGNMENT = "assignment"
    CLEANING = "cleaning"
    MINOR_REPAIR = "minor_repair"
    MAJOR_REPAIR = "major_repair"
    INSPECTION = "inspection"
    RETURN_PREP = "return_prep"


class CarType(Enum):
    """Types of railcars handled by the system."""
    TANK = "tank"
    HOPPER = "hopper"
    BOXCAR = "boxcar"
    FLATCAR = "flatcar"
    GONDOLA = "gondola"
    INTERMODAL = "intermodal"
    COVERED_HOPPER = "covered_hopper"
    REFRIGERATED = "refrigerated"


class Priority(Enum):
    """Priority levels for scheduling."""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


class ShopType(Enum):
    """Types of shops in the network."""
    AITX_OWNED = "aitx_owned"
    AITX_PRIMARY = "aitx_primary"
    AITX_SECONDARY = "aitx_secondary"
    PARTNER = "partner"
    THIRD_PARTY = "third_party"


class EventStatus(Enum):
    """Status of a scheduled event."""
    PLANNED = "planned"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DELAYED = "delayed"
    CANCELLED = "cancelled"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class LeaseEvent:
    """
    Represents a lease expiration/release event for a railcar.

    This is the primary input for the planning queue, representing cars
    that are coming off lease and need processing.

    Attributes:
        car_id: Unique identifier for the railcar
        customer_id: Current lessee customer ID
        lease_end_date: Original lease expiration date
        actual_release_date: Actual date car was/will be released
        car_type: Type of railcar
        location: Current location code
        next_customer_id: Customer ID if reassignment is planned
        requires_qualification: Whether car needs qualification work
        requires_cleaning: Whether car needs cleaning
        requires_repair: Whether car needs repair work
        repair_type: Type of repair if needed (minor/major)
        priority: Scheduling priority level
        transit_days: Estimated transit days to nearest shop
        notes: Additional notes or comments
        is_bundled_with_assignment: Whether qual should be bundled with assignment
    """
    car_id: str
    customer_id: str
    lease_end_date: date
    actual_release_date: Optional[date] = None
    car_type: CarType = CarType.TANK
    location: str = ""
    next_customer_id: Optional[str] = None
    requires_qualification: bool = True
    requires_cleaning: bool = True
    requires_repair: bool = False
    repair_type: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    transit_days: int = 5
    notes: str = ""
    is_bundled_with_assignment: bool = False

    def __post_init__(self):
        """Initialize computed fields."""
        if self.actual_release_date is None:
            self.actual_release_date = self.lease_end_date

        # Convert string dates if needed
        if isinstance(self.lease_end_date, str):
            self.lease_end_date = datetime.strptime(self.lease_end_date, "%Y-%m-%d").date()
        if isinstance(self.actual_release_date, str):
            self.actual_release_date = datetime.strptime(self.actual_release_date, "%Y-%m-%d").date()

        # Convert enums if needed
        if isinstance(self.car_type, str):
            self.car_type = CarType(self.car_type)
        if isinstance(self.priority, (int, str)):
            if isinstance(self.priority, int):
                self.priority = Priority(self.priority)
            else:
                self.priority = Priority[self.priority.upper()]

        # Set bundled flag if there's a next customer
        if self.next_customer_id and not self.is_bundled_with_assignment:
            self.is_bundled_with_assignment = True

    @property
    def is_late_release(self) -> bool:
        """Check if the car release is late compared to lease end."""
        if self.actual_release_date is None:
            return False
        return self.actual_release_date > self.lease_end_date

    @property
    def days_late(self) -> int:
        """Calculate number of days late (0 if not late)."""
        if not self.is_late_release or self.actual_release_date is None:
            return 0
        return (self.actual_release_date - self.lease_end_date).days

    @property
    def has_next_assignment(self) -> bool:
        """Check if car has a pending assignment."""
        return self.next_customer_id is not None

    @property
    def release_slip_days(self) -> int:
        """Calculate slip days (difference between actual and planned release)."""
        if self.actual_release_date is None:
            return 0
        return (self.actual_release_date - self.lease_end_date).days

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "car_id": self.car_id,
            "customer_id": self.customer_id,
            "lease_end_date": self.lease_end_date.isoformat(),
            "actual_release_date": self.actual_release_date.isoformat() if self.actual_release_date else None,
            "car_type": self.car_type.value,
            "location": self.location,
            "next_customer_id": self.next_customer_id,
            "requires_qualification": self.requires_qualification,
            "requires_cleaning": self.requires_cleaning,
            "requires_repair": self.requires_repair,
            "repair_type": self.repair_type,
            "priority": self.priority.value,
            "transit_days": self.transit_days,
            "notes": self.notes,
            "is_bundled_with_assignment": self.is_bundled_with_assignment,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "LeaseEvent":
        """Create from dictionary."""
        return cls(
            car_id=data["car_id"],
            customer_id=data["customer_id"],
            lease_end_date=data["lease_end_date"],
            actual_release_date=data.get("actual_release_date"),
            car_type=data.get("car_type", "tank"),
            location=data.get("location", ""),
            next_customer_id=data.get("next_customer_id"),
            requires_qualification=data.get("requires_qualification", True),
            requires_cleaning=data.get("requires_cleaning", True),
            requires_repair=data.get("requires_repair", False),
            repair_type=data.get("repair_type"),
            priority=data.get("priority", 3),
            transit_days=data.get("transit_days", 5),
            notes=data.get("notes", ""),
            is_bundled_with_assignment=data.get("is_bundled_with_assignment", False),
        )


@dataclass
class ShopCapacity:
    """
    Represents shop capacity constraints for scheduling.

    Tracks both static capacity limits and dynamic slot availability
    across the planning horizon.

    Attributes:
        shop_id: Unique shop identifier
        shop_name: Human-readable shop name
        shop_type: Type of shop (AITX, partner, third-party)
        location: Shop location code/address
        qual_capacity: Monthly qualification capacity
        assign_capacity: Monthly assignment capacity
        return_capacity: Monthly returns capacity
        repair_capacity: Monthly repair capacity
        supported_car_types: List of car types this shop can handle
        is_active: Whether shop is currently active
        efficiency_rating: Shop efficiency rating (0.0 to 1.0)
        monthly_slots: Dictionary tracking available slots per month
    """
    shop_id: str
    shop_name: str
    shop_type: ShopType = ShopType.AITX_OWNED
    location: str = ""
    qual_capacity: int = DEFAULT_MONTHLY_QUAL_CAPACITY
    assign_capacity: int = DEFAULT_MONTHLY_ASSIGN_CAPACITY
    return_capacity: int = DEFAULT_MONTHLY_RETURN_CAPACITY
    repair_capacity: int = DEFAULT_MONTHLY_REPAIR_CAPACITY
    supported_car_types: list[CarType] = field(default_factory=list)
    is_active: bool = True
    efficiency_rating: float = 1.0
    monthly_slots: dict[str, dict[str, int]] = field(default_factory=dict)

    def __post_init__(self):
        """Initialize shop capacity tracking."""
        # Convert shop_type if string
        if isinstance(self.shop_type, str):
            try:
                self.shop_type = ShopType(self.shop_type)
            except ValueError:
                self.shop_type = ShopType.AITX_OWNED

        # Initialize supported car types if empty
        if not self.supported_car_types:
            self.supported_car_types = list(CarType)

        # Initialize monthly slots if empty
        if not self.monthly_slots:
            self._initialize_monthly_slots()

    def _initialize_monthly_slots(self):
        """Initialize monthly slot tracking for planning horizon."""
        today = date.today()
        for i in range(PLANNING_HORIZON_MONTHS + 2):
            month_date = today + timedelta(days=i * 30)
            month_key = month_date.strftime("%Y-%m")
            self.monthly_slots[month_key] = {
                "qualification": self.qual_capacity,
                "qual": self.qual_capacity,
                "assignment": self.assign_capacity,
                "assign": self.assign_capacity,
                "return": self.return_capacity,
                "repair": self.repair_capacity,
                "total": self.qual_capacity + self.assign_capacity,
            }

    def get_available_slots(self, month_key: str, slot_type: str = "total") -> int:
        """Get available slots for a specific month and type."""
        if month_key not in self.monthly_slots:
            # Auto-initialize if month not in range
            year, month = map(int, month_key.split("-"))
            self.monthly_slots[month_key] = {
                "qualification": self.qual_capacity,
                "qual": self.qual_capacity,
                "assignment": self.assign_capacity,
                "assign": self.assign_capacity,
                "return": self.return_capacity,
                "repair": self.repair_capacity,
                "total": self.qual_capacity + self.assign_capacity,
            }
        return self.monthly_slots.get(month_key, {}).get(slot_type, 0)

    def consume_slot(self, month_key: str, slot_type: str, count: int = 1) -> bool:
        """
        Consume slots from a specific month.

        Returns True if successful, False if insufficient capacity.
        """
        if month_key not in self.monthly_slots:
            self._initialize_monthly_slots()
            if month_key not in self.monthly_slots:
                # Still not present, create it
                self.monthly_slots[month_key] = {
                    "qualification": self.qual_capacity,
                    "qual": self.qual_capacity,
                    "assignment": self.assign_capacity,
                    "assign": self.assign_capacity,
                    "return": self.return_capacity,
                    "repair": self.repair_capacity,
                    "total": self.qual_capacity + self.assign_capacity,
                }

        available = self.monthly_slots[month_key].get(slot_type, 0)
        if available >= count:
            self.monthly_slots[month_key][slot_type] = available - count
            # Also decrement total if not the total slot itself
            if slot_type != "total":
                total = self.monthly_slots[month_key].get("total", 0)
                self.monthly_slots[month_key]["total"] = max(0, total - count)
            return True
        return False

    def release_slot(self, month_key: str, slot_type: str, count: int = 1):
        """Release previously consumed slots back to availability."""
        if month_key not in self.monthly_slots:
            return

        current = self.monthly_slots[month_key].get(slot_type, 0)

        # Get max capacity for this slot type
        max_capacity_map = {
            "qualification": self.qual_capacity,
            "qual": self.qual_capacity,
            "assignment": self.assign_capacity,
            "assign": self.assign_capacity,
            "return": self.return_capacity,
            "repair": self.repair_capacity,
            "total": self.qual_capacity + self.assign_capacity,
        }
        max_capacity = max_capacity_map.get(slot_type, self.qual_capacity)

        self.monthly_slots[month_key][slot_type] = min(current + count, max_capacity)

    def can_handle_car_type(self, car_type: CarType) -> bool:
        """Check if shop can handle a specific car type."""
        if isinstance(car_type, str):
            car_type = CarType(car_type)
        return car_type in self.supported_car_types

    @property
    def is_aitx_owned(self) -> bool:
        """Check if this is an AITX-owned shop."""
        return self.shop_type in (ShopType.AITX_OWNED, ShopType.AITX_PRIMARY, ShopType.AITX_SECONDARY)

    def get_month_utilization(self, month_key: str) -> float:
        """Calculate utilization percentage for a specific month."""
        if month_key not in self.monthly_slots:
            return 0.0

        slots = self.monthly_slots[month_key]
        total_capacity = self.qual_capacity + self.assign_capacity

        used = (
            (self.qual_capacity - slots.get("qualification", 0)) +
            (self.assign_capacity - slots.get("assignment", 0))
        )

        return used / total_capacity if total_capacity > 0 else 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "shop_id": self.shop_id,
            "shop_name": self.shop_name,
            "shop_type": self.shop_type.value,
            "location": self.location,
            "qual_capacity": self.qual_capacity,
            "assign_capacity": self.assign_capacity,
            "return_capacity": self.return_capacity,
            "repair_capacity": self.repair_capacity,
            "supported_car_types": [ct.value for ct in self.supported_car_types],
            "is_active": self.is_active,
            "efficiency_rating": self.efficiency_rating,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ShopCapacity":
        """Create from dictionary."""
        car_types = data.get("supported_car_types", [])
        if car_types and isinstance(car_types[0], str):
            car_types = [CarType(ct) for ct in car_types]

        return cls(
            shop_id=data["shop_id"],
            shop_name=data["shop_name"],
            shop_type=data.get("shop_type", "aitx_owned"),
            location=data.get("location", ""),
            qual_capacity=data.get("qual_capacity", DEFAULT_MONTHLY_QUAL_CAPACITY),
            assign_capacity=data.get("assign_capacity", DEFAULT_MONTHLY_ASSIGN_CAPACITY),
            return_capacity=data.get("return_capacity", DEFAULT_MONTHLY_RETURN_CAPACITY),
            repair_capacity=data.get("repair_capacity", DEFAULT_MONTHLY_REPAIR_CAPACITY),
            supported_car_types=car_types,
            is_active=data.get("is_active", True),
            efficiency_rating=data.get("efficiency_rating", 1.0),
        )


@dataclass
class ScheduledEvent:
    """
    Represents a scheduled work event in the planning output.

    Created by the scheduling engine when a car is successfully slotted
    into a shop for processing.

    Attributes:
        event_id: Unique event identifier (auto-generated if empty)
        car_id: Associated railcar ID
        shop_id: Assigned shop ID
        shop_name: Human-readable shop name
        work_types: List of work type strings to be performed
        scheduled_start: Date work is scheduled to begin
        scheduled_end: Estimated completion date
        status: Current event status
        priority: Event priority level
        customer_id: Associated customer (if applicable)
        next_customer_id: Next customer for assignment (if applicable)
        month_key: Month key for capacity tracking (YYYY-MM)
        created_at: Timestamp when event was created
        notes: Additional notes
    """
    event_id: str
    car_id: str
    shop_id: str
    shop_name: str = ""
    work_types: list[str] = field(default_factory=list)
    scheduled_start: date = field(default_factory=date.today)
    scheduled_end: date = field(default_factory=date.today)
    status: EventStatus = EventStatus.PLANNED
    priority: Priority = Priority.MEDIUM
    customer_id: Optional[str] = None
    next_customer_id: Optional[str] = None
    month_key: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    notes: str = ""

    def __post_init__(self):
        """Initialize computed fields."""
        # Auto-generate event ID if empty
        if not self.event_id:
            self.event_id = self._generate_event_id()

        # Set month_key if not provided
        if not self.month_key:
            self.month_key = self.scheduled_start.strftime("%Y-%m")

        # Convert dates if needed
        if isinstance(self.scheduled_start, str):
            self.scheduled_start = datetime.strptime(self.scheduled_start, "%Y-%m-%d").date()
        if isinstance(self.scheduled_end, str):
            self.scheduled_end = datetime.strptime(self.scheduled_end, "%Y-%m-%d").date()

        # Convert enums if needed
        if isinstance(self.status, str):
            self.status = EventStatus(self.status)
        if isinstance(self.priority, (int, str)):
            if isinstance(self.priority, int):
                self.priority = Priority(self.priority)
            else:
                self.priority = Priority[self.priority.upper()]

    def _generate_event_id(self) -> str:
        """Generate a unique event ID."""
        data = f"{self.car_id}{self.shop_id}{self.scheduled_start}{datetime.now().timestamp()}"
        return f"EVT-{hashlib.md5(data.encode()).hexdigest()[:8].upper()}"

    @property
    def duration_days(self) -> int:
        """Calculate event duration in days."""
        return (self.scheduled_end - self.scheduled_start).days

    @property
    def is_bundled(self) -> bool:
        """Check if this is a bundled work event (multiple work types)."""
        return len(self.work_types) > 1

    @property
    def includes_qualification(self) -> bool:
        """Check if event includes qualification work."""
        qual_types = {"qualification", "qual"}
        return any(wt.lower() in qual_types for wt in self.work_types)

    @property
    def includes_assignment(self) -> bool:
        """Check if event includes assignment work."""
        assign_types = {"assignment", "assign", "assignment_prep"}
        return any(wt.lower() in assign_types for wt in self.work_types)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "event_id": self.event_id,
            "car_id": self.car_id,
            "shop_id": self.shop_id,
            "shop_name": self.shop_name,
            "work_types": self.work_types,
            "scheduled_start": self.scheduled_start.isoformat(),
            "scheduled_end": self.scheduled_end.isoformat(),
            "status": self.status.value,
            "priority": self.priority.value,
            "customer_id": self.customer_id,
            "next_customer_id": self.next_customer_id,
            "month_key": self.month_key,
            "created_at": self.created_at.isoformat(),
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ScheduledEvent":
        """Create from dictionary."""
        return cls(
            event_id=data.get("event_id", ""),
            car_id=data["car_id"],
            shop_id=data["shop_id"],
            shop_name=data.get("shop_name", ""),
            work_types=data.get("work_types", []),
            scheduled_start=data.get("scheduled_start", date.today()),
            scheduled_end=data.get("scheduled_end", date.today()),
            status=data.get("status", "planned"),
            priority=data.get("priority", 3),
            customer_id=data.get("customer_id"),
            next_customer_id=data.get("next_customer_id"),
            month_key=data.get("month_key", ""),
            notes=data.get("notes", ""),
        )


# =============================================================================
# MASTER DATA STORE
# =============================================================================

class MasterDataStore:
    """
    Central data management class for the Chronos Scenario Engine.

    Provides persistence via SQLite and in-memory caching for:
    - Lease events (incoming cars from lease expirations)
    - Shop capacity data
    - Scheduled events (output from planning)
    - Customer information

    Usage:
        store = MasterDataStore("chronos_master_data.db")
        store.add_lease_event(lease)
        events = store.get_lease_events()
        store.close()

    Attributes:
        db_path: Path to SQLite database file
        lease_events: Cached list of LeaseEvent objects
        shop_capacities: Cached dict of shop_id -> ShopCapacity
        scheduled_events: Cached list of ScheduledEvent objects
        customers: Cached dict of customer_id -> customer info
    """

    def __init__(self, db_path: str = "chronos_master_data.db"):
        """
        Initialize the MasterDataStore.

        Args:
            db_path: Path to SQLite database file. Use ":memory:" for in-memory only.
        """
        self.db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None

        # In-memory caches
        self._lease_events: list[LeaseEvent] = []
        self._shop_capacities: dict[str, ShopCapacity] = {}
        self._scheduled_events: list[ScheduledEvent] = []
        self._customers: dict[str, dict[str, Any]] = {}

        # Initialize database
        self._init_database()

        # Load data from database into cache
        self._load_from_database()

    def _get_connection(self) -> sqlite3.Connection:
        """Get or create database connection."""
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def _init_database(self):
        """Initialize database schema."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Lease Events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lease_events (
                car_id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                lease_end_date TEXT NOT NULL,
                actual_release_date TEXT,
                car_type TEXT DEFAULT 'tank',
                location TEXT DEFAULT '',
                next_customer_id TEXT,
                requires_qualification INTEGER DEFAULT 1,
                requires_cleaning INTEGER DEFAULT 1,
                requires_repair INTEGER DEFAULT 0,
                repair_type TEXT,
                priority INTEGER DEFAULT 3,
                transit_days INTEGER DEFAULT 5,
                notes TEXT DEFAULT '',
                is_bundled_with_assignment INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Shop Capacities table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS shop_capacities (
                shop_id TEXT PRIMARY KEY,
                shop_name TEXT NOT NULL,
                shop_type TEXT DEFAULT 'aitx_owned',
                location TEXT DEFAULT '',
                qual_capacity INTEGER DEFAULT 50,
                assign_capacity INTEGER DEFAULT 30,
                return_capacity INTEGER DEFAULT 40,
                repair_capacity INTEGER DEFAULT 20,
                supported_car_types TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                efficiency_rating REAL DEFAULT 1.0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Scheduled Events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_events (
                event_id TEXT PRIMARY KEY,
                car_id TEXT NOT NULL,
                shop_id TEXT NOT NULL,
                shop_name TEXT DEFAULT '',
                work_types TEXT DEFAULT '[]',
                scheduled_start TEXT NOT NULL,
                scheduled_end TEXT NOT NULL,
                status TEXT DEFAULT 'planned',
                priority INTEGER DEFAULT 3,
                customer_id TEXT,
                next_customer_id TEXT,
                month_key TEXT,
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Customers table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS customers (
                customer_id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                contact_email TEXT,
                contact_phone TEXT,
                address TEXT,
                notes TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()

    def _load_from_database(self):
        """Load all data from database into memory cache."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # Load lease events
        cursor.execute("SELECT * FROM lease_events")
        for row in cursor.fetchall():
            lease = LeaseEvent(
                car_id=row["car_id"],
                customer_id=row["customer_id"],
                lease_end_date=row["lease_end_date"],
                actual_release_date=row["actual_release_date"],
                car_type=row["car_type"],
                location=row["location"],
                next_customer_id=row["next_customer_id"],
                requires_qualification=bool(row["requires_qualification"]),
                requires_cleaning=bool(row["requires_cleaning"]),
                requires_repair=bool(row["requires_repair"]),
                repair_type=row["repair_type"],
                priority=row["priority"],
                transit_days=row["transit_days"],
                notes=row["notes"],
                is_bundled_with_assignment=bool(row["is_bundled_with_assignment"]),
            )
            self._lease_events.append(lease)

        # Load shop capacities
        cursor.execute("SELECT * FROM shop_capacities")
        for row in cursor.fetchall():
            car_types = json.loads(row["supported_car_types"]) if row["supported_car_types"] else []
            shop = ShopCapacity(
                shop_id=row["shop_id"],
                shop_name=row["shop_name"],
                shop_type=row["shop_type"],
                location=row["location"],
                qual_capacity=row["qual_capacity"],
                assign_capacity=row["assign_capacity"],
                return_capacity=row["return_capacity"],
                repair_capacity=row["repair_capacity"],
                supported_car_types=[CarType(ct) for ct in car_types] if car_types else list(CarType),
                is_active=bool(row["is_active"]),
                efficiency_rating=row["efficiency_rating"],
            )
            self._shop_capacities[shop.shop_id] = shop

        # Load scheduled events
        cursor.execute("SELECT * FROM scheduled_events")
        for row in cursor.fetchall():
            work_types = json.loads(row["work_types"]) if row["work_types"] else []
            event = ScheduledEvent(
                event_id=row["event_id"],
                car_id=row["car_id"],
                shop_id=row["shop_id"],
                shop_name=row["shop_name"],
                work_types=work_types,
                scheduled_start=row["scheduled_start"],
                scheduled_end=row["scheduled_end"],
                status=row["status"],
                priority=row["priority"],
                customer_id=row["customer_id"],
                next_customer_id=row["next_customer_id"],
                month_key=row["month_key"],
                notes=row["notes"],
            )
            self._scheduled_events.append(event)

        # Load customers
        cursor.execute("SELECT * FROM customers")
        for row in cursor.fetchall():
            self._customers[row["customer_id"]] = {
                "customer_id": row["customer_id"],
                "customer_name": row["customer_name"],
                "contact_email": row["contact_email"],
                "contact_phone": row["contact_phone"],
                "address": row["address"],
                "notes": row["notes"],
                "is_active": bool(row["is_active"]),
            }

    # =========================================================================
    # LEASE EVENT METHODS
    # =========================================================================

    def add_lease_event(self, lease: LeaseEvent) -> bool:
        """
        Add a lease event to the data store.

        Args:
            lease: LeaseEvent object to add

        Returns:
            True if successful, False if car_id already exists
        """
        # Check for duplicate
        existing = [e for e in self._lease_events if e.car_id == lease.car_id]
        if existing:
            return False

        # Add to cache
        self._lease_events.append(lease)

        # Persist to database
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO lease_events (
                    car_id, customer_id, lease_end_date, actual_release_date,
                    car_type, location, next_customer_id, requires_qualification,
                    requires_cleaning, requires_repair, repair_type, priority,
                    transit_days, notes, is_bundled_with_assignment
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                lease.car_id,
                lease.customer_id,
                lease.lease_end_date.isoformat(),
                lease.actual_release_date.isoformat() if lease.actual_release_date else None,
                lease.car_type.value,
                lease.location,
                lease.next_customer_id,
                int(lease.requires_qualification),
                int(lease.requires_cleaning),
                int(lease.requires_repair),
                lease.repair_type,
                lease.priority.value,
                lease.transit_days,
                lease.notes,
                int(lease.is_bundled_with_assignment),
            ))
            conn.commit()
            return True
        except sqlite3.Error:
            conn.rollback()
            return False

    def get_lease_events(self) -> list[LeaseEvent]:
        """Get all lease events."""
        return list(self._lease_events)

    def get_lease_event(self, car_id: str) -> Optional[LeaseEvent]:
        """Get a specific lease event by car_id."""
        for lease in self._lease_events:
            if lease.car_id == car_id:
                return lease
        return None

    def update_lease_event(self, lease: LeaseEvent) -> bool:
        """Update an existing lease event."""
        for i, existing in enumerate(self._lease_events):
            if existing.car_id == lease.car_id:
                self._lease_events[i] = lease
                # Update database
                conn = self._get_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE lease_events SET
                        customer_id = ?, lease_end_date = ?, actual_release_date = ?,
                        car_type = ?, location = ?, next_customer_id = ?,
                        requires_qualification = ?, requires_cleaning = ?,
                        requires_repair = ?, repair_type = ?, priority = ?,
                        transit_days = ?, notes = ?, is_bundled_with_assignment = ?
                    WHERE car_id = ?
                """, (
                    lease.customer_id,
                    lease.lease_end_date.isoformat(),
                    lease.actual_release_date.isoformat() if lease.actual_release_date else None,
                    lease.car_type.value,
                    lease.location,
                    lease.next_customer_id,
                    int(lease.requires_qualification),
                    int(lease.requires_cleaning),
                    int(lease.requires_repair),
                    lease.repair_type,
                    lease.priority.value,
                    lease.transit_days,
                    lease.notes,
                    int(lease.is_bundled_with_assignment),
                    lease.car_id,
                ))
                conn.commit()
                return True
        return False

    def delete_lease_event(self, car_id: str) -> bool:
        """Delete a lease event by car_id."""
        for i, lease in enumerate(self._lease_events):
            if lease.car_id == car_id:
                del self._lease_events[i]
                conn = self._get_connection()
                cursor = conn.cursor()
                cursor.execute("DELETE FROM lease_events WHERE car_id = ?", (car_id,))
                conn.commit()
                return True
        return False

    # =========================================================================
    # SHOP CAPACITY METHODS
    # =========================================================================

    def add_shop_capacity(self, shop: ShopCapacity) -> bool:
        """Add a shop capacity record."""
        if shop.shop_id in self._shop_capacities:
            return False

        self._shop_capacities[shop.shop_id] = shop

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO shop_capacities (
                    shop_id, shop_name, shop_type, location, qual_capacity,
                    assign_capacity, return_capacity, repair_capacity,
                    supported_car_types, is_active, efficiency_rating
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                shop.shop_id,
                shop.shop_name,
                shop.shop_type.value,
                shop.location,
                shop.qual_capacity,
                shop.assign_capacity,
                shop.return_capacity,
                shop.repair_capacity,
                json.dumps([ct.value for ct in shop.supported_car_types]),
                int(shop.is_active),
                shop.efficiency_rating,
            ))
            conn.commit()
            return True
        except sqlite3.Error:
            conn.rollback()
            return False

    def get_shop_capacities(self) -> list[ShopCapacity]:
        """Get all shop capacities."""
        return list(self._shop_capacities.values())

    def get_shop_capacity(self, shop_id: str) -> Optional[ShopCapacity]:
        """Get a specific shop capacity by shop_id."""
        return self._shop_capacities.get(shop_id)

    def update_shop_capacity(self, shop: ShopCapacity) -> bool:
        """Update an existing shop capacity."""
        if shop.shop_id not in self._shop_capacities:
            return False

        self._shop_capacities[shop.shop_id] = shop

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE shop_capacities SET
                shop_name = ?, shop_type = ?, location = ?, qual_capacity = ?,
                assign_capacity = ?, return_capacity = ?, repair_capacity = ?,
                supported_car_types = ?, is_active = ?, efficiency_rating = ?
            WHERE shop_id = ?
        """, (
            shop.shop_name,
            shop.shop_type.value,
            shop.location,
            shop.qual_capacity,
            shop.assign_capacity,
            shop.return_capacity,
            shop.repair_capacity,
            json.dumps([ct.value for ct in shop.supported_car_types]),
            int(shop.is_active),
            shop.efficiency_rating,
            shop.shop_id,
        ))
        conn.commit()
        return True

    # =========================================================================
    # SCHEDULED EVENT METHODS
    # =========================================================================

    def add_scheduled_event(self, event: ScheduledEvent) -> bool:
        """Add a scheduled event."""
        self._scheduled_events.append(event)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO scheduled_events (
                    event_id, car_id, shop_id, shop_name, work_types,
                    scheduled_start, scheduled_end, status, priority,
                    customer_id, next_customer_id, month_key, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                event.event_id,
                event.car_id,
                event.shop_id,
                event.shop_name,
                json.dumps(event.work_types),
                event.scheduled_start.isoformat(),
                event.scheduled_end.isoformat(),
                event.status.value,
                event.priority.value,
                event.customer_id,
                event.next_customer_id,
                event.month_key,
                event.notes,
            ))
            conn.commit()
            return True
        except sqlite3.Error:
            conn.rollback()
            return False

    def get_scheduled_events(self) -> list[ScheduledEvent]:
        """Get all scheduled events."""
        return list(self._scheduled_events)

    def get_scheduled_events_by_shop(self, shop_id: str) -> list[ScheduledEvent]:
        """Get scheduled events for a specific shop."""
        return [e for e in self._scheduled_events if e.shop_id == shop_id]

    def get_scheduled_events_by_customer(self, customer_id: str) -> list[ScheduledEvent]:
        """Get scheduled events for a specific customer."""
        return [
            e for e in self._scheduled_events
            if e.customer_id == customer_id or e.next_customer_id == customer_id
        ]

    def get_scheduled_events_by_month(self, month_key: str) -> list[ScheduledEvent]:
        """Get scheduled events for a specific month."""
        return [e for e in self._scheduled_events if e.month_key == month_key]

    def clear_scheduled_events(self):
        """Clear all scheduled events (useful for re-running scenarios)."""
        self._scheduled_events = []
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM scheduled_events")
        conn.commit()

    # =========================================================================
    # CUSTOMER METHODS
    # =========================================================================

    def add_customer(self, customer_id: str, customer_name: str, **kwargs) -> bool:
        """Add a customer record."""
        if customer_id in self._customers:
            return False

        customer_data = {
            "customer_id": customer_id,
            "customer_name": customer_name,
            "contact_email": kwargs.get("contact_email"),
            "contact_phone": kwargs.get("contact_phone"),
            "address": kwargs.get("address"),
            "notes": kwargs.get("notes", ""),
            "is_active": kwargs.get("is_active", True),
        }

        self._customers[customer_id] = customer_data

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO customers (
                customer_id, customer_name, contact_email, contact_phone,
                address, notes, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            customer_id,
            customer_name,
            customer_data["contact_email"],
            customer_data["contact_phone"],
            customer_data["address"],
            customer_data["notes"],
            int(customer_data["is_active"]),
        ))
        conn.commit()
        return True

    def get_customer(self, customer_id: str) -> Optional[dict[str, Any]]:
        """Get a customer by ID."""
        return self._customers.get(customer_id)

    def get_all_customers(self) -> list[dict[str, Any]]:
        """Get all customers."""
        return list(self._customers.values())

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def clone(self) -> "MasterDataStore":
        """
        Create a deep copy of the data store for scenario analysis.

        Returns a new MasterDataStore instance with all data copied.
        The clone uses in-memory storage only (no database persistence).
        """
        clone = MasterDataStore(":memory:")
        clone._lease_events = copy.deepcopy(self._lease_events)
        clone._shop_capacities = copy.deepcopy(self._shop_capacities)
        clone._scheduled_events = copy.deepcopy(self._scheduled_events)
        clone._customers = copy.deepcopy(self._customers)
        return clone

    def get_planning_queue(self, sort_by: str = "lease_end_date") -> list[LeaseEvent]:
        """
        Get the planning queue sorted for processing.

        Sorts lease expirations first, then adds pure qualification needs.

        Args:
            sort_by: Sort key - "lease_end_date", "priority", or "customer_id"

        Returns:
            Sorted list of LeaseEvent objects
        """
        queue = list(self._lease_events)

        if sort_by == "lease_end_date":
            queue.sort(key=lambda x: (x.lease_end_date, x.priority.value))
        elif sort_by == "priority":
            queue.sort(key=lambda x: (x.priority.value, x.lease_end_date))
        elif sort_by == "customer_id":
            queue.sort(key=lambda x: (x.customer_id, x.lease_end_date))

        return queue

    def get_statistics(self) -> dict[str, Any]:
        """Get summary statistics from the data store."""
        total_leases = len(self._lease_events)
        total_shops = len(self._shop_capacities)
        total_events = len(self._scheduled_events)
        total_customers = len(self._customers)

        # Calculate lease statistics
        on_time_releases = sum(1 for l in self._lease_events if not l.is_late_release)
        bundled_count = sum(1 for l in self._lease_events if l.is_bundled_with_assignment)
        qual_required = sum(1 for l in self._lease_events if l.requires_qualification)

        # Calculate capacity totals
        total_qual_capacity = sum(s.qual_capacity for s in self._shop_capacities.values())
        total_assign_capacity = sum(s.assign_capacity for s in self._shop_capacities.values())

        return {
            "total_lease_events": total_leases,
            "total_shops": total_shops,
            "total_scheduled_events": total_events,
            "total_customers": total_customers,
            "on_time_release_count": on_time_releases,
            "release_compliance_pct": (on_time_releases / total_leases * 100) if total_leases > 0 else 100.0,
            "bundled_assignment_count": bundled_count,
            "qualification_required_count": qual_required,
            "total_monthly_qual_capacity": total_qual_capacity,
            "total_monthly_assign_capacity": total_assign_capacity,
        }

    def close(self):
        """Close the database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
        return False


# =============================================================================
# FACTORY FUNCTIONS
# =============================================================================

def create_sample_data_store() -> MasterDataStore:
    """
    Create a MasterDataStore populated with sample data for testing.

    Returns:
        MasterDataStore with sample leases, shops, and customers
    """
    import random

    store = MasterDataStore(":memory:")
    today = date.today()

    # Add sample shops
    shops = [
        ShopCapacity(
            shop_id="AITX-BC",
            shop_name="AITX Bossier City",
            shop_type=ShopType.AITX_OWNED,
            location="Bossier City, LA",
            qual_capacity=60,
            assign_capacity=40,
            efficiency_rating=0.95,
        ),
        ShopCapacity(
            shop_id="AITX-HOU",
            shop_name="AITX Houston",
            shop_type=ShopType.AITX_PRIMARY,
            location="Houston, TX",
            qual_capacity=55,
            assign_capacity=35,
            efficiency_rating=0.92,
        ),
        ShopCapacity(
            shop_id="PARTNER-DAL",
            shop_name="Partner Dallas",
            shop_type=ShopType.PARTNER,
            location="Dallas, TX",
            qual_capacity=40,
            assign_capacity=25,
            efficiency_rating=0.85,
        ),
        ShopCapacity(
            shop_id="TP-ATL",
            shop_name="Third Party Atlanta",
            shop_type=ShopType.THIRD_PARTY,
            location="Atlanta, GA",
            qual_capacity=30,
            assign_capacity=20,
            efficiency_rating=0.80,
        ),
    ]
    for shop in shops:
        store.add_shop_capacity(shop)

    # Add sample customers
    customers = [
        ("CUST-001", "Acme Chemical Corp"),
        ("CUST-002", "Global Petrochemicals"),
        ("CUST-003", "Midwest Agricultural"),
        ("CUST-004", "Pacific Energy"),
        ("CUST-005", "Atlantic Logistics"),
    ]
    for cust_id, cust_name in customers:
        store.add_customer(cust_id, cust_name)

    # Add sample lease events
    car_types = list(CarType)
    priorities = [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW]

    random.seed(42)  # For reproducibility

    for i in range(50):
        days_offset = (i * 3) + random.randint(0, 10)
        lease_end = today + timedelta(days=days_offset)

        cust_idx = i % len(customers)
        next_cust_idx = (i + 2) % len(customers)

        lease = LeaseEvent(
            car_id=f"UTLX-{10000 + i}",
            customer_id=customers[cust_idx][0],
            lease_end_date=lease_end,
            car_type=car_types[i % len(car_types)],
            location=f"LOC-{i % 10:02d}",
            next_customer_id=customers[next_cust_idx][0] if i % 3 == 0 else None,
            requires_qualification=True,
            requires_cleaning=i % 2 == 0,
            requires_repair=i % 7 == 0,
            repair_type="major" if i % 14 == 0 else ("minor" if i % 7 == 0 else None),
            priority=priorities[i % len(priorities)],
            transit_days=random.choice([3, 5, 7, 10]),
        )
        store.add_lease_event(lease)

    return store


# =============================================================================
# MODULE EXPORTS
# =============================================================================

__all__ = [
    # Constants
    "WORK_DURATION",
    "DEFAULT_MONTHLY_QUAL_CAPACITY",
    "DEFAULT_MONTHLY_ASSIGN_CAPACITY",
    "DEFAULT_MONTHLY_RETURN_CAPACITY",
    "DEFAULT_MONTHLY_REPAIR_CAPACITY",
    "PLANNING_HORIZON_MONTHS",
    # Enums
    "WorkType",
    "CarType",
    "Priority",
    "ShopType",
    "EventStatus",
    # Data Classes
    "LeaseEvent",
    "ShopCapacity",
    "ScheduledEvent",
    # Main Class
    "MasterDataStore",
    # Factory Functions
    "create_sample_data_store",
]


if __name__ == "__main__":
    # Quick test
    print("ChronosDataStore Module Test")
    print("=" * 50)

    store = create_sample_data_store()
    stats = store.get_statistics()

    print(f"Lease Events: {stats['total_lease_events']}")
    print(f"Shops: {stats['total_shops']}")
    print(f"Customers: {stats['total_customers']}")
    print(f"Release Compliance: {stats['release_compliance_pct']:.1f}%")
    print(f"Total Monthly Qual Capacity: {stats['total_monthly_qual_capacity']}")

    store.close()
    print("\nTest complete!")

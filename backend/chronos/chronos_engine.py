#!/usr/bin/env python3
"""
Chronos Lease Release + Qualification Scenario Engine for AITX

A complete, fully functional Python module for planning and simulating:
- Lease release scheduling
- Qualification planning
- Shop capacity management
- Scenario comparison and analysis

Author: AITX Chronos Team
Version: 1.0.0
"""

# =============================================================================
# SECTION 1 — IMPORTS & CONSTANTS
# =============================================================================

from __future__ import annotations

import copy
import hashlib
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    PageBreak,
    KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

# Transit days from customer location to shop
DEFAULT_TRANSIT_DAYS = 5
EXPRESS_TRANSIT_DAYS = 3
REMOTE_TRANSIT_DAYS = 10

# Work duration constants (in business days)
WORK_DURATION_QUALIFICATION = 3
WORK_DURATION_CLEANING = 1
WORK_DURATION_MINOR_REPAIR = 2
WORK_DURATION_MAJOR_REPAIR = 5
WORK_DURATION_ASSIGNMENT_PREP = 1
WORK_DURATION_INSPECTION = 1

# Planning horizon
PLANNING_HORIZON_MONTHS = 6
ROLLING_QUAL_WINDOW_MONTHS = 4

# Capacity thresholds
CAPACITY_WARNING_THRESHOLD = 0.85
CAPACITY_CRITICAL_THRESHOLD = 0.95

# Risk score weights
RISK_WEIGHT_BACKLOG = 0.25
RISK_WEIGHT_COMPLIANCE = 0.30
RISK_WEIGHT_CAPACITY = 0.25
RISK_WEIGHT_WAIT_TIME = 0.20

# Days in month approximation for planning
DAYS_PER_MONTH = 22  # Business days

# Bundling rules
BUNDLE_ASSIGNMENT_WITH_QUAL = True
BUNDLE_CLEANING_WITH_QUAL = True


# =============================================================================
# SECTION 2 — DATA MODELS
# =============================================================================

class WorkType(Enum):
    """Types of work that can be performed on a car."""
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


@dataclass
class LeaseExpiration:
    """
    Represents a lease expiration event for a railcar.

    Attributes:
        car_id: Unique identifier for the railcar
        customer_id: Current lessee customer ID
        lease_end_date: Original lease expiration date
        actual_release_date: Actual date car was/will be released (may differ from lease_end)
        car_type: Type of railcar
        location: Current location code
        next_customer_id: Customer ID if reassignment is planned (None if returning to pool)
        requires_qualification: Whether car needs qualification work
        requires_cleaning: Whether car needs cleaning
        requires_repair: Whether car needs repair work
        repair_severity: If repair needed, severity level (minor/major)
        priority: Scheduling priority
        transit_days: Estimated transit days to nearest shop
        notes: Additional notes or comments
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
    repair_severity: Optional[str] = None
    priority: Priority = Priority.MEDIUM
    transit_days: int = DEFAULT_TRANSIT_DAYS
    notes: str = ""

    def __post_init__(self):
        if self.actual_release_date is None:
            self.actual_release_date = self.lease_end_date

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


@dataclass
class QualCar:
    """
    Represents a car in the qualification queue.

    Attributes:
        car_id: Unique identifier for the railcar
        due_date: Date by which qualification must be completed
        priority: Priority level for scheduling
        car_type: Type of railcar
        preferred_shop: Preferred shop for qualification (if any)
        projected_arrival: Projected date car arrives at shop
        bundled_work: List of additional work to bundle with qualification
        customer_id: Customer ID if associated with specific customer
        status: Current status in the queue
        qualification_type: Type of qualification required
        estimated_duration: Estimated work duration in days
    """
    car_id: str
    due_date: date
    priority: Priority = Priority.MEDIUM
    car_type: CarType = CarType.TANK
    preferred_shop: Optional[str] = None
    projected_arrival: Optional[date] = None
    bundled_work: list[WorkType] = field(default_factory=list)
    customer_id: Optional[str] = None
    status: str = "pending"
    qualification_type: str = "standard"
    estimated_duration: int = WORK_DURATION_QUALIFICATION

    def __post_init__(self):
        if not self.bundled_work:
            self.bundled_work = []

    @property
    def total_work_duration(self) -> int:
        """Calculate total duration including bundled work."""
        total = self.estimated_duration
        for work in self.bundled_work:
            if work == WorkType.CLEANING:
                total += WORK_DURATION_CLEANING
            elif work == WorkType.MINOR_REPAIR:
                total += WORK_DURATION_MINOR_REPAIR
            elif work == WorkType.MAJOR_REPAIR:
                total += WORK_DURATION_MAJOR_REPAIR
            elif work == WorkType.ASSIGNMENT:
                total += WORK_DURATION_ASSIGNMENT_PREP
            elif work == WorkType.INSPECTION:
                total += WORK_DURATION_INSPECTION
        return total

    @property
    def is_overdue(self) -> bool:
        """Check if qualification is past due date."""
        return date.today() > self.due_date

    @property
    def days_until_due(self) -> int:
        """Calculate days until due (negative if overdue)."""
        return (self.due_date - date.today()).days


@dataclass
class ShopCapacity:
    """
    Represents shop capacity constraints.

    Attributes:
        shop_id: Unique shop identifier
        shop_name: Human-readable shop name
        shop_type: Type of shop (AITX, partner, third-party)
        location: Shop location code
        monthly_qualification_capacity: Max qualifications per month
        monthly_assignment_capacity: Max assignments per month
        monthly_return_capacity: Max returns processed per month
        monthly_repair_capacity: Max repairs per month
        supported_car_types: List of car types this shop can handle
        current_utilization: Current month utilization (0.0 to 1.0)
        monthly_slots: Dictionary of month -> remaining slots
        is_active: Whether shop is currently active
        efficiency_rating: Shop efficiency rating (0.0 to 1.0)
    """
    shop_id: str
    shop_name: str
    shop_type: ShopType = ShopType.AITX_PRIMARY
    location: str = ""
    monthly_qualification_capacity: int = 50
    monthly_assignment_capacity: int = 30
    monthly_return_capacity: int = 40
    monthly_repair_capacity: int = 20
    supported_car_types: list[CarType] = field(default_factory=list)
    current_utilization: float = 0.0
    monthly_slots: dict[str, dict[str, int]] = field(default_factory=dict)
    is_active: bool = True
    efficiency_rating: float = 1.0

    def __post_init__(self):
        if not self.supported_car_types:
            self.supported_car_types = list(CarType)
        if not self.monthly_slots:
            self._initialize_monthly_slots()

    def _initialize_monthly_slots(self):
        """Initialize monthly slot tracking for planning horizon."""
        today = date.today()
        for i in range(PLANNING_HORIZON_MONTHS + 2):
            month_date = today + timedelta(days=i * 30)
            month_key = month_date.strftime("%Y-%m")
            self.monthly_slots[month_key] = {
                "qualification": self.monthly_qualification_capacity,
                "assignment": self.monthly_assignment_capacity,
                "return": self.monthly_return_capacity,
                "repair": self.monthly_repair_capacity,
            }

    def get_available_slots(self, month_key: str, slot_type: str) -> int:
        """Get available slots for a specific month and type."""
        if month_key not in self.monthly_slots:
            self._initialize_monthly_slots()
        return self.monthly_slots.get(month_key, {}).get(slot_type, 0)

    def consume_slot(self, month_key: str, slot_type: str, count: int = 1) -> bool:
        """Consume slots from a specific month. Returns True if successful."""
        if month_key not in self.monthly_slots:
            self._initialize_monthly_slots()

        available = self.monthly_slots[month_key].get(slot_type, 0)
        if available >= count:
            self.monthly_slots[month_key][slot_type] = available - count
            return True
        return False

    def release_slot(self, month_key: str, slot_type: str, count: int = 1):
        """Release previously consumed slots."""
        if month_key not in self.monthly_slots:
            return

        current = self.monthly_slots[month_key].get(slot_type, 0)
        max_capacity = getattr(self, f"monthly_{slot_type}_capacity", 50)
        self.monthly_slots[month_key][slot_type] = min(current + count, max_capacity)

    def can_handle_car_type(self, car_type: CarType) -> bool:
        """Check if shop can handle a specific car type."""
        return car_type in self.supported_car_types

    @property
    def is_aitx_shop(self) -> bool:
        """Check if this is an AITX-owned shop."""
        return self.shop_type in (ShopType.AITX_PRIMARY, ShopType.AITX_SECONDARY)

    def get_month_utilization(self, month_key: str) -> float:
        """Calculate utilization for a specific month."""
        if month_key not in self.monthly_slots:
            return 0.0

        slots = self.monthly_slots[month_key]
        total_capacity = (
            self.monthly_qualification_capacity +
            self.monthly_assignment_capacity +
            self.monthly_return_capacity
        )

        used = (
            (self.monthly_qualification_capacity - slots.get("qualification", 0)) +
            (self.monthly_assignment_capacity - slots.get("assignment", 0)) +
            (self.monthly_return_capacity - slots.get("return", 0))
        )

        return used / total_capacity if total_capacity > 0 else 0.0


@dataclass
class ScheduledEvent:
    """
    Represents a scheduled work event.

    Attributes:
        event_id: Unique event identifier
        car_id: Associated railcar ID
        shop_id: Assigned shop ID
        work_types: List of work types to be performed
        scheduled_date: Date work is scheduled to begin
        estimated_completion: Estimated completion date
        status: Current event status
        priority: Event priority
        customer_id: Associated customer (if applicable)
        created_at: Timestamp when event was created
        notes: Additional notes
        month_key: Month key for capacity tracking
    """
    event_id: str
    car_id: str
    shop_id: str
    work_types: list[WorkType]
    scheduled_date: date
    estimated_completion: date
    status: EventStatus = EventStatus.PLANNED
    priority: Priority = Priority.MEDIUM
    customer_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    notes: str = ""
    month_key: str = ""

    def __post_init__(self):
        if not self.month_key:
            self.month_key = self.scheduled_date.strftime("%Y-%m")
        if not self.event_id:
            self.event_id = self._generate_event_id()

    def _generate_event_id(self) -> str:
        """Generate a unique event ID."""
        data = f"{self.car_id}{self.shop_id}{self.scheduled_date}{datetime.now().timestamp()}"
        return f"EVT-{hashlib.md5(data.encode()).hexdigest()[:8].upper()}"

    @property
    def duration_days(self) -> int:
        """Calculate event duration in days."""
        return (self.estimated_completion - self.scheduled_date).days

    @property
    def work_type_names(self) -> list[str]:
        """Get list of work type names."""
        return [wt.value for wt in self.work_types]

    @property
    def is_bundled(self) -> bool:
        """Check if this is a bundled work event."""
        return len(self.work_types) > 1


@dataclass
class InternalTeamPlan:
    """
    Internal team plan document data structure.

    Attributes:
        plan_id: Unique plan identifier
        scenario_name: Name of the scenario
        created_at: Plan creation timestamp
        planning_horizon_start: Start date of planning period
        planning_horizon_end: End date of planning period
        scheduled_events: List of all scheduled events
        backlog_cars: List of cars in backlog
        metrics: Calculated metrics dictionary
        shop_summaries: Summary data by shop
        monthly_summaries: Summary data by month
        notes: Plan notes and comments
    """
    plan_id: str
    scenario_name: str
    created_at: datetime = field(default_factory=datetime.now)
    planning_horizon_start: date = field(default_factory=date.today)
    planning_horizon_end: date = field(default_factory=lambda: date.today() + timedelta(days=180))
    scheduled_events: list[ScheduledEvent] = field(default_factory=list)
    backlog_cars: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    shop_summaries: dict[str, dict] = field(default_factory=dict)
    monthly_summaries: dict[str, dict] = field(default_factory=dict)
    notes: str = ""

    def __post_init__(self):
        if not self.plan_id:
            self.plan_id = f"PLAN-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    def add_event(self, event: ScheduledEvent):
        """Add a scheduled event to the plan."""
        self.scheduled_events.append(event)

    def get_events_by_shop(self, shop_id: str) -> list[ScheduledEvent]:
        """Get all events for a specific shop."""
        return [e for e in self.scheduled_events if e.shop_id == shop_id]

    def get_events_by_month(self, month_key: str) -> list[ScheduledEvent]:
        """Get all events for a specific month."""
        return [e for e in self.scheduled_events if e.month_key == month_key]

    def get_events_by_customer(self, customer_id: str) -> list[ScheduledEvent]:
        """Get all events for a specific customer."""
        return [e for e in self.scheduled_events if e.customer_id == customer_id]

    @property
    def total_scheduled(self) -> int:
        """Total number of scheduled events."""
        return len(self.scheduled_events)

    @property
    def total_backlog(self) -> int:
        """Total number of cars in backlog."""
        return len(self.backlog_cars)


@dataclass
class CustomerSchedulePDF:
    """
    Customer-facing schedule document data structure.

    Attributes:
        customer_id: Customer identifier
        customer_name: Customer display name
        generated_at: Document generation timestamp
        events: List of events for this customer
        summary: Summary statistics
        contact_info: Contact information for questions
    """
    customer_id: str
    customer_name: str
    generated_at: datetime = field(default_factory=datetime.now)
    events: list[ScheduledEvent] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)
    contact_info: str = "Contact your AITX representative for questions."

    def add_event(self, event: ScheduledEvent):
        """Add an event to the customer schedule."""
        self.events.append(event)

    def calculate_summary(self):
        """Calculate summary statistics for the customer."""
        if not self.events:
            self.summary = {
                "total_cars": 0,
                "earliest_date": None,
                "latest_date": None,
                "by_work_type": {},
            }
            return

        work_type_counts: dict[str, int] = {}
        for event in self.events:
            for wt in event.work_types:
                work_type_counts[wt.value] = work_type_counts.get(wt.value, 0) + 1

        self.summary = {
            "total_cars": len(set(e.car_id for e in self.events)),
            "total_events": len(self.events),
            "earliest_date": min(e.scheduled_date for e in self.events),
            "latest_date": max(e.estimated_completion for e in self.events),
            "by_work_type": work_type_counts,
        }


# =============================================================================
# SECTION 3 — SCHEDULING LOGIC
# =============================================================================

def calculate_projected_inbound(
    lease: LeaseExpiration,
    base_date: Optional[date] = None
) -> date:
    """
    Calculate the projected inbound date for a car based on lease expiration.

    Args:
        lease: LeaseExpiration object with release information
        base_date: Optional base date to use (defaults to actual_release_date)

    Returns:
        Projected date when car will arrive at a shop
    """
    if base_date is None:
        base_date = lease.actual_release_date or lease.lease_end_date

    # Add transit time
    transit_days = lease.transit_days

    # Adjust for weekends (simple approximation)
    total_days = transit_days
    weeks = total_days // 5
    extra_days = total_days % 5
    calendar_days = (weeks * 7) + extra_days

    projected = base_date + timedelta(days=calendar_days)

    # Ensure we don't land on a weekend
    while projected.weekday() >= 5:  # Saturday = 5, Sunday = 6
        projected += timedelta(days=1)

    return projected


def determine_required_work(lease: LeaseExpiration) -> list[WorkType]:
    """
    Determine all required work types based on lease requirements.

    Args:
        lease: LeaseExpiration object

    Returns:
        List of required WorkType enums
    """
    work_types = []

    # Qualification is typically always required
    if lease.requires_qualification:
        work_types.append(WorkType.QUALIFICATION)

    # Add cleaning if needed
    if lease.requires_cleaning:
        work_types.append(WorkType.CLEANING)

    # Add repair if needed
    if lease.requires_repair:
        if lease.repair_severity == "major":
            work_types.append(WorkType.MAJOR_REPAIR)
        else:
            work_types.append(WorkType.MINOR_REPAIR)

    # Add assignment prep if there's a next customer
    if lease.has_next_assignment:
        work_types.append(WorkType.ASSIGNMENT)

    return work_types


def align_and_bundle_work(
    lease: LeaseExpiration,
    work_types: list[WorkType]
) -> tuple[list[WorkType], int]:
    """
    Align and bundle work logically for efficiency.

    Args:
        lease: LeaseExpiration object
        work_types: List of required work types

    Returns:
        Tuple of (bundled work types list, total duration in days)
    """
    bundled = []
    total_duration = 0

    # Qualification should be primary work
    if WorkType.QUALIFICATION in work_types:
        bundled.append(WorkType.QUALIFICATION)
        total_duration += WORK_DURATION_QUALIFICATION

    # Bundle cleaning with qualification if enabled
    if BUNDLE_CLEANING_WITH_QUAL and WorkType.CLEANING in work_types:
        bundled.append(WorkType.CLEANING)
        # Cleaning adds partial time when bundled
        total_duration += max(1, WORK_DURATION_CLEANING - 1)
    elif WorkType.CLEANING in work_types:
        bundled.append(WorkType.CLEANING)
        total_duration += WORK_DURATION_CLEANING

    # Add repairs (not typically bundled with qual)
    if WorkType.MAJOR_REPAIR in work_types:
        bundled.append(WorkType.MAJOR_REPAIR)
        total_duration += WORK_DURATION_MAJOR_REPAIR
    elif WorkType.MINOR_REPAIR in work_types:
        bundled.append(WorkType.MINOR_REPAIR)
        total_duration += WORK_DURATION_MINOR_REPAIR

    # Bundle assignment prep if enabled and needed
    if BUNDLE_ASSIGNMENT_WITH_QUAL and WorkType.ASSIGNMENT in work_types:
        bundled.append(WorkType.ASSIGNMENT)
        # Assignment prep adds partial time when bundled
        total_duration += max(1, WORK_DURATION_ASSIGNMENT_PREP - 1)
    elif WorkType.ASSIGNMENT in work_types:
        bundled.append(WorkType.ASSIGNMENT)
        total_duration += WORK_DURATION_ASSIGNMENT_PREP

    # Add inspection if needed
    if WorkType.INSPECTION in work_types:
        bundled.append(WorkType.INSPECTION)
        total_duration += WORK_DURATION_INSPECTION

    return bundled, total_duration


def calculate_work_duration(work_types: list[WorkType]) -> int:
    """
    Calculate total work duration for a list of work types.

    Args:
        work_types: List of WorkType enums

    Returns:
        Total duration in business days
    """
    duration_map = {
        WorkType.QUALIFICATION: WORK_DURATION_QUALIFICATION,
        WorkType.CLEANING: WORK_DURATION_CLEANING,
        WorkType.MINOR_REPAIR: WORK_DURATION_MINOR_REPAIR,
        WorkType.MAJOR_REPAIR: WORK_DURATION_MAJOR_REPAIR,
        WorkType.ASSIGNMENT: WORK_DURATION_ASSIGNMENT_PREP,
        WorkType.INSPECTION: WORK_DURATION_INSPECTION,
        WorkType.RETURN_PREP: WORK_DURATION_CLEANING,
    }

    return sum(duration_map.get(wt, 1) for wt in work_types)


def find_best_shop(
    car_type: CarType,
    required_slots: dict[str, int],
    target_month: str,
    shops: list[ShopCapacity],
    preferred_shop: Optional[str] = None,
    prefer_aitx: bool = True
) -> Optional[ShopCapacity]:
    """
    Find the best available shop for a car based on capacity and preferences.

    Shop Selection Rules:
    1. Prefer AITX shops over third-party
    2. Respect car type compatibility
    3. Earliest available month slot wins
    4. Consider efficiency rating

    Args:
        car_type: Type of car to be serviced
        required_slots: Dictionary of slot type -> count needed
        target_month: Target month key (YYYY-MM)
        shops: List of available ShopCapacity objects
        preferred_shop: Optional preferred shop ID
        prefer_aitx: Whether to prefer AITX-owned shops

    Returns:
        Best matching ShopCapacity or None if no shop available
    """
    # Filter to active shops that can handle the car type
    eligible_shops = [
        shop for shop in shops
        if shop.is_active and shop.can_handle_car_type(car_type)
    ]

    if not eligible_shops:
        return None

    # Check preferred shop first
    if preferred_shop:
        for shop in eligible_shops:
            if shop.shop_id == preferred_shop:
                if _shop_has_capacity(shop, required_slots, target_month):
                    return shop

    # Score and sort shops
    def shop_score(shop: ShopCapacity) -> tuple[int, int, float, float]:
        """
        Score a shop for selection (lower is better).
        Returns (aitx_preference, has_capacity, utilization, efficiency_inverse)
        """
        aitx_pref = 0 if (prefer_aitx and shop.is_aitx_shop) else 1
        has_cap = 0 if _shop_has_capacity(shop, required_slots, target_month) else 1
        utilization = shop.get_month_utilization(target_month)
        efficiency_inv = 1.0 - shop.efficiency_rating

        return (aitx_pref, has_cap, utilization, efficiency_inv)

    # Sort by score
    eligible_shops.sort(key=shop_score)

    # Return first shop with capacity
    for shop in eligible_shops:
        if _shop_has_capacity(shop, required_slots, target_month):
            return shop

    # If no shop has capacity in target month, try next months
    for month_offset in range(1, 4):
        next_month = _add_months_to_key(target_month, month_offset)
        for shop in eligible_shops:
            if _shop_has_capacity(shop, required_slots, next_month):
                return shop

    return None


def _shop_has_capacity(
    shop: ShopCapacity,
    required_slots: dict[str, int],
    month_key: str
) -> bool:
    """Check if a shop has required capacity for a month."""
    for slot_type, count in required_slots.items():
        available = shop.get_available_slots(month_key, slot_type)
        if available < count:
            return False
    return True


def _add_months_to_key(month_key: str, months: int) -> str:
    """Add months to a month key string."""
    year, month = map(int, month_key.split("-"))
    month += months
    while month > 12:
        month -= 12
        year += 1
    return f"{year:04d}-{month:02d}"


def slot_qualification_cars(
    qual_cars: list[QualCar],
    shops: list[ShopCapacity],
    start_date: Optional[date] = None
) -> tuple[list[ScheduledEvent], list[str]]:
    """
    Slot qualification cars into shops based on priority and capacity.

    Sorting Logic:
    1. Priority (Critical first)
    2. Due date (earliest first)
    3. Projected arrival (earliest first)

    Args:
        qual_cars: List of QualCar objects to schedule
        shops: List of ShopCapacity objects
        start_date: Starting date for scheduling

    Returns:
        Tuple of (list of ScheduledEvents, list of backlog car IDs)
    """
    if start_date is None:
        start_date = date.today()

    scheduled_events = []
    backlog = []

    # Sort qual cars by priority, due date, then projected arrival
    sorted_cars = sorted(
        qual_cars,
        key=lambda c: (
            c.priority.value,  # Lower value = higher priority
            c.due_date,
            c.projected_arrival or date.max,
        )
    )

    for qual_car in sorted_cars:
        # Determine target month based on arrival
        arrival = qual_car.projected_arrival or start_date
        target_month = arrival.strftime("%Y-%m")

        # Determine required slots
        required_slots = {"qualification": 1}
        if WorkType.ASSIGNMENT in qual_car.bundled_work:
            required_slots["assignment"] = 1

        # Find best shop
        best_shop = find_best_shop(
            car_type=qual_car.car_type,
            required_slots=required_slots,
            target_month=target_month,
            shops=shops,
            preferred_shop=qual_car.preferred_shop,
            prefer_aitx=True
        )

        if best_shop is None:
            # No shop available - add to backlog
            backlog.append(qual_car.car_id)
            continue

        # Find the actual scheduling month (might be different from target)
        scheduling_month = _find_available_month(
            best_shop, required_slots, target_month
        )

        if scheduling_month is None:
            backlog.append(qual_car.car_id)
            continue

        # Consume the slots
        for slot_type, count in required_slots.items():
            best_shop.consume_slot(scheduling_month, slot_type, count)

        # Calculate scheduling date (first business day of month if arrival is earlier)
        year, month = map(int, scheduling_month.split("-"))
        month_start = date(year, month, 1)

        if arrival.strftime("%Y-%m") == scheduling_month:
            scheduled_date = arrival
        else:
            scheduled_date = month_start
            # Adjust to first business day
            while scheduled_date.weekday() >= 5:
                scheduled_date += timedelta(days=1)

        # Calculate completion date
        work_types = [WorkType.QUALIFICATION] + qual_car.bundled_work
        duration = qual_car.total_work_duration
        completion_date = _add_business_days(scheduled_date, duration)

        # Create the event
        event = ScheduledEvent(
            event_id="",  # Will be auto-generated
            car_id=qual_car.car_id,
            shop_id=best_shop.shop_id,
            work_types=work_types,
            scheduled_date=scheduled_date,
            estimated_completion=completion_date,
            status=EventStatus.PLANNED,
            priority=qual_car.priority,
            customer_id=qual_car.customer_id,
            month_key=scheduling_month,
        )

        scheduled_events.append(event)

    return scheduled_events, backlog


def _find_available_month(
    shop: ShopCapacity,
    required_slots: dict[str, int],
    start_month: str,
    max_months_ahead: int = PLANNING_HORIZON_MONTHS
) -> Optional[str]:
    """Find the first month with available capacity."""
    current_month = start_month

    for _ in range(max_months_ahead):
        if _shop_has_capacity(shop, required_slots, current_month):
            return current_month
        current_month = _add_months_to_key(current_month, 1)

    return None


def _add_business_days(start_date: date, days: int) -> date:
    """Add business days to a date."""
    result = start_date
    days_added = 0

    while days_added < days:
        result += timedelta(days=1)
        if result.weekday() < 5:  # Monday = 0, Friday = 4
            days_added += 1

    return result


def process_lease_releases(
    leases: list[LeaseExpiration],
    shops: list[ShopCapacity]
) -> tuple[list[ScheduledEvent], list[QualCar], list[str]]:
    """
    Process lease releases and schedule work.

    Args:
        leases: List of LeaseExpiration objects
        shops: List of ShopCapacity objects

    Returns:
        Tuple of (scheduled events, qual cars created, backlog car IDs)
    """
    scheduled_events = []
    qual_cars = []
    backlog = []

    for lease in leases:
        # Calculate projected inbound
        projected_inbound = calculate_projected_inbound(lease)

        # Determine required work
        work_types = determine_required_work(lease)

        # Bundle work
        bundled_work, duration = align_and_bundle_work(lease, work_types)

        # Create QualCar if qualification is needed
        if WorkType.QUALIFICATION in bundled_work:
            # Calculate due date (30 days from inbound for standard qual)
            due_date = projected_inbound + timedelta(days=30)

            qual_car = QualCar(
                car_id=lease.car_id,
                due_date=due_date,
                priority=lease.priority,
                car_type=lease.car_type,
                projected_arrival=projected_inbound,
                bundled_work=[wt for wt in bundled_work if wt != WorkType.QUALIFICATION],
                customer_id=lease.next_customer_id,
            )
            qual_cars.append(qual_car)
        else:
            # Schedule non-qual work directly
            target_month = projected_inbound.strftime("%Y-%m")
            required_slots = _get_required_slots_for_work(bundled_work)

            best_shop = find_best_shop(
                car_type=lease.car_type,
                required_slots=required_slots,
                target_month=target_month,
                shops=shops,
            )

            if best_shop is None:
                backlog.append(lease.car_id)
                continue

            # Consume slots and create event
            for slot_type, count in required_slots.items():
                best_shop.consume_slot(target_month, slot_type, count)

            completion_date = _add_business_days(projected_inbound, duration)

            event = ScheduledEvent(
                event_id="",
                car_id=lease.car_id,
                shop_id=best_shop.shop_id,
                work_types=bundled_work,
                scheduled_date=projected_inbound,
                estimated_completion=completion_date,
                status=EventStatus.PLANNED,
                priority=lease.priority,
                customer_id=lease.next_customer_id,
                month_key=target_month,
            )
            scheduled_events.append(event)

    return scheduled_events, qual_cars, backlog


def _get_required_slots_for_work(work_types: list[WorkType]) -> dict[str, int]:
    """Determine required capacity slots for work types."""
    slots = {}

    if WorkType.QUALIFICATION in work_types:
        slots["qualification"] = 1
    if WorkType.ASSIGNMENT in work_types:
        slots["assignment"] = 1
    if any(wt in work_types for wt in [WorkType.MINOR_REPAIR, WorkType.MAJOR_REPAIR]):
        slots["repair"] = 1
    if WorkType.RETURN_PREP in work_types:
        slots["return"] = 1

    return slots if slots else {"qualification": 1}


# =============================================================================
# SECTION 4 — SCENARIO RUNNER
# =============================================================================

class ScenarioRunner:
    """
    Runs planning scenarios and produces plans with metrics.
    """

    def __init__(
        self,
        leases: list[LeaseExpiration],
        qual_cars: list[QualCar],
        shops: list[ShopCapacity],
        planning_start: Optional[date] = None,
    ):
        """
        Initialize the scenario runner.

        Args:
            leases: List of lease expirations to process
            qual_cars: List of existing qualification queue cars
            shops: List of shop capacity objects
            planning_start: Start date for planning (defaults to today)
        """
        self.original_leases = leases
        self.original_qual_cars = qual_cars
        self.original_shops = shops
        self.planning_start = planning_start or date.today()

    def run_scenario(
        self,
        scenario_name: str,
        late_release_pct: float = 0.0,
        late_release_days: int = 0,
        capacity_overrides: Optional[dict[str, float]] = None,
        random_seed: int = 42
    ) -> InternalTeamPlan:
        """
        Run a planning scenario with specified modifications.

        Args:
            scenario_name: Name for this scenario
            late_release_pct: Percentage of leases to delay (0.0 to 1.0)
            late_release_days: Days to delay late releases
            capacity_overrides: Dict of shop_id -> capacity multiplier
            random_seed: Seed for reproducibility

        Returns:
            InternalTeamPlan with scheduled events and metrics
        """
        random.seed(random_seed)

        # Deep copy data for this scenario
        leases = copy.deepcopy(self.original_leases)
        qual_cars = copy.deepcopy(self.original_qual_cars)
        shops = copy.deepcopy(self.original_shops)

        # Apply late release simulation
        if late_release_pct > 0:
            leases = self._apply_late_releases(
                leases, late_release_pct, late_release_days
            )

        # Apply capacity overrides
        if capacity_overrides:
            shops = self._apply_capacity_overrides(shops, capacity_overrides)

        # Re-initialize shop slots after capacity changes
        for shop in shops:
            shop.monthly_slots = {}
            shop._initialize_monthly_slots()

        # Process lease releases
        release_events, new_qual_cars, release_backlog = process_lease_releases(
            leases, shops
        )

        # Combine qual cars
        all_qual_cars = qual_cars + new_qual_cars

        # Slot qualification cars
        qual_events, qual_backlog = slot_qualification_cars(
            all_qual_cars, shops, self.planning_start
        )

        # Combine all events
        all_events = release_events + qual_events
        all_backlog = list(set(release_backlog + qual_backlog))

        # Create the plan
        plan = InternalTeamPlan(
            plan_id="",
            scenario_name=scenario_name,
            planning_horizon_start=self.planning_start,
            planning_horizon_end=self.planning_start + timedelta(days=180),
            scheduled_events=all_events,
            backlog_cars=all_backlog,
        )

        # Calculate metrics
        plan.metrics = self._calculate_metrics(
            plan, leases, all_qual_cars, shops
        )

        # Calculate shop summaries
        plan.shop_summaries = self._calculate_shop_summaries(plan, shops)

        # Calculate monthly summaries
        plan.monthly_summaries = self._calculate_monthly_summaries(plan)

        return plan

    def _apply_late_releases(
        self,
        leases: list[LeaseExpiration],
        pct: float,
        days: int
    ) -> list[LeaseExpiration]:
        """Apply late release simulation to a percentage of leases."""
        num_late = int(len(leases) * pct)
        late_indices = random.sample(range(len(leases)), min(num_late, len(leases)))

        for idx in late_indices:
            lease = leases[idx]
            original_release = lease.actual_release_date or lease.lease_end_date
            lease.actual_release_date = original_release + timedelta(days=days)
            lease.notes = f"Late release: +{days} days"

        return leases

    def _apply_capacity_overrides(
        self,
        shops: list[ShopCapacity],
        overrides: dict[str, float]
    ) -> list[ShopCapacity]:
        """Apply capacity multipliers to shops."""
        for shop in shops:
            if shop.shop_id in overrides:
                multiplier = overrides[shop.shop_id]
                shop.monthly_qualification_capacity = int(
                    shop.monthly_qualification_capacity * multiplier
                )
                shop.monthly_assignment_capacity = int(
                    shop.monthly_assignment_capacity * multiplier
                )
                shop.monthly_return_capacity = int(
                    shop.monthly_return_capacity * multiplier
                )
                shop.monthly_repair_capacity = int(
                    shop.monthly_repair_capacity * multiplier
                )

        return shops

    def _calculate_metrics(
        self,
        plan: InternalTeamPlan,
        leases: list[LeaseExpiration],
        qual_cars: list[QualCar],
        shops: list[ShopCapacity]
    ) -> dict[str, Any]:
        """Calculate all required metrics for a plan."""
        # Release Compliance %
        total_leases = len(leases)
        on_time_releases = sum(1 for l in leases if not l.is_late_release)
        release_compliance = (on_time_releases / total_leases * 100) if total_leases > 0 else 100.0

        # Monthly Qual Plan Attainment %
        total_qual = len(qual_cars)
        scheduled_qual = len([
            e for e in plan.scheduled_events
            if WorkType.QUALIFICATION in e.work_types
        ])
        qual_attainment = (scheduled_qual / total_qual * 100) if total_qual > 0 else 100.0

        # Total Backlog
        total_backlog = len(plan.backlog_cars)

        # Longest Wait Time
        longest_wait = 0
        for event in plan.scheduled_events:
            # Find associated lease or qual car
            for lease in leases:
                if lease.car_id == event.car_id:
                    arrival = calculate_projected_inbound(lease)
                    wait = (event.scheduled_date - arrival).days
                    longest_wait = max(longest_wait, wait)
                    break

        # Capacity Usage by Shop
        capacity_usage = {}
        for shop in shops:
            monthly_usage = {}
            for month_key in shop.monthly_slots:
                monthly_usage[month_key] = shop.get_month_utilization(month_key)
            capacity_usage[shop.shop_id] = {
                "name": shop.shop_name,
                "average_utilization": sum(monthly_usage.values()) / len(monthly_usage) if monthly_usage else 0,
                "by_month": monthly_usage,
            }

        # Cars scheduled vs unscheduled
        cars_scheduled = len(set(e.car_id for e in plan.scheduled_events))
        cars_unscheduled = total_backlog

        # Assignment Readiness Impact
        assignment_events = [
            e for e in plan.scheduled_events
            if WorkType.ASSIGNMENT in e.work_types
        ]
        delayed_assignments = sum(
            1 for e in assignment_events
            if e.status == EventStatus.DELAYED
        )

        if len(assignment_events) > 0:
            if delayed_assignments == 0:
                assignment_impact = "All assignments on track"
            elif delayed_assignments / len(assignment_events) < 0.1:
                assignment_impact = "Minor delays (<10% of assignments)"
            elif delayed_assignments / len(assignment_events) < 0.25:
                assignment_impact = "Moderate delays (10-25% of assignments)"
            else:
                assignment_impact = "Significant delays (>25% of assignments)"
        else:
            assignment_impact = "No assignments scheduled"

        # Risk Score (1-10)
        risk_score = self._calculate_risk_score(
            release_compliance,
            qual_attainment,
            total_backlog,
            longest_wait,
            capacity_usage,
            total_leases
        )

        return {
            "release_compliance_pct": round(release_compliance, 1),
            "qual_plan_attainment_pct": round(qual_attainment, 1),
            "total_backlog": total_backlog,
            "longest_wait_days": longest_wait,
            "capacity_usage_by_shop": capacity_usage,
            "assignment_readiness_impact": assignment_impact,
            "risk_score": risk_score,
            "cars_scheduled": cars_scheduled,
            "cars_unscheduled": cars_unscheduled,
            "total_events": len(plan.scheduled_events),
        }

    def _calculate_risk_score(
        self,
        release_compliance: float,
        qual_attainment: float,
        backlog: int,
        longest_wait: int,
        capacity_usage: dict,
        total_cars: int
    ) -> int:
        """Calculate risk score from 1-10."""
        # Normalize factors to 0-10 scale

        # Compliance risk (inverted - lower compliance = higher risk)
        compliance_risk = (100 - release_compliance) / 10

        # Attainment risk
        attainment_risk = (100 - qual_attainment) / 10

        # Backlog risk
        backlog_ratio = backlog / max(total_cars, 1)
        backlog_risk = min(10, backlog_ratio * 20)

        # Wait time risk (30 days = risk level 5, 60 days = 10)
        wait_risk = min(10, longest_wait / 6)

        # Capacity risk (average utilization)
        avg_utilization = 0
        if capacity_usage:
            utils = [s["average_utilization"] for s in capacity_usage.values()]
            avg_utilization = sum(utils) / len(utils)
        capacity_risk = min(10, avg_utilization * 10)

        # Weighted average
        risk_score = (
            RISK_WEIGHT_COMPLIANCE * compliance_risk +
            RISK_WEIGHT_BACKLOG * backlog_risk +
            RISK_WEIGHT_CAPACITY * capacity_risk +
            RISK_WEIGHT_WAIT_TIME * wait_risk
        )

        # Scale to 1-10
        return max(1, min(10, round(risk_score)))

    def _calculate_shop_summaries(
        self,
        plan: InternalTeamPlan,
        shops: list[ShopCapacity]
    ) -> dict[str, dict]:
        """Calculate summary statistics by shop."""
        summaries = {}

        for shop in shops:
            events = plan.get_events_by_shop(shop.shop_id)

            qual_count = sum(
                1 for e in events if WorkType.QUALIFICATION in e.work_types
            )
            assignment_count = sum(
                1 for e in events if WorkType.ASSIGNMENT in e.work_types
            )
            repair_count = sum(
                1 for e in events
                if WorkType.MINOR_REPAIR in e.work_types or WorkType.MAJOR_REPAIR in e.work_types
            )

            summaries[shop.shop_id] = {
                "shop_name": shop.shop_name,
                "shop_type": shop.shop_type.value,
                "total_events": len(events),
                "qualifications": qual_count,
                "assignments": assignment_count,
                "repairs": repair_count,
                "avg_utilization": sum(
                    shop.get_month_utilization(m)
                    for m in shop.monthly_slots
                ) / max(len(shop.monthly_slots), 1),
            }

        return summaries

    def _calculate_monthly_summaries(
        self,
        plan: InternalTeamPlan
    ) -> dict[str, dict]:
        """Calculate summary statistics by month."""
        summaries: dict[str, dict] = {}

        for event in plan.scheduled_events:
            month = event.month_key
            if month not in summaries:
                summaries[month] = {
                    "total_events": 0,
                    "qualifications": 0,
                    "assignments": 0,
                    "repairs": 0,
                    "unique_cars": set(),
                }

            summaries[month]["total_events"] += 1
            summaries[month]["unique_cars"].add(event.car_id)

            if WorkType.QUALIFICATION in event.work_types:
                summaries[month]["qualifications"] += 1
            if WorkType.ASSIGNMENT in event.work_types:
                summaries[month]["assignments"] += 1
            if any(wt in event.work_types for wt in [WorkType.MINOR_REPAIR, WorkType.MAJOR_REPAIR]):
                summaries[month]["repairs"] += 1

        # Convert sets to counts
        for month in summaries:
            summaries[month]["unique_cars"] = len(summaries[month]["unique_cars"])

        return summaries


def run_base_scenario(
    leases: list[LeaseExpiration],
    qual_cars: list[QualCar],
    shops: list[ShopCapacity]
) -> InternalTeamPlan:
    """Run the base planning scenario."""
    runner = ScenarioRunner(leases, qual_cars, shops)
    return runner.run_scenario("Base Plan")


def run_late_release_scenario(
    leases: list[LeaseExpiration],
    qual_cars: list[QualCar],
    shops: list[ShopCapacity],
    late_pct: float = 0.20,
    late_days: int = 10
) -> InternalTeamPlan:
    """Run late release scenario (default: 20% slip by 10 days)."""
    runner = ScenarioRunner(leases, qual_cars, shops)
    return runner.run_scenario(
        "Late Release Scenario",
        late_release_pct=late_pct,
        late_release_days=late_days
    )


def run_capacity_shift_scenario(
    leases: list[LeaseExpiration],
    qual_cars: list[QualCar],
    shops: list[ShopCapacity],
    shop_to_reduce: str,
    reduction_pct: float = 0.20
) -> InternalTeamPlan:
    """Run capacity shift scenario (reduce one shop by specified percentage)."""
    runner = ScenarioRunner(leases, qual_cars, shops)
    return runner.run_scenario(
        "Capacity Shift Scenario",
        capacity_overrides={shop_to_reduce: 1.0 - reduction_pct}
    )


# =============================================================================
# SECTION 5 — SCENARIO COMPARISON METRICS
# =============================================================================

def compare_scenarios(
    scenarios: list[InternalTeamPlan]
) -> dict[str, dict[str, Any]]:
    """
    Compare metrics across multiple scenarios.

    Args:
        scenarios: List of InternalTeamPlan objects to compare

    Returns:
        Dictionary mapping scenario name to metrics
    """
    comparison = {}

    for plan in scenarios:
        comparison[plan.scenario_name] = {
            "Release Compliance %": plan.metrics.get("release_compliance_pct", 0),
            "Qual Plan Attainment %": plan.metrics.get("qual_plan_attainment_pct", 0),
            "Total Backlog": plan.metrics.get("total_backlog", 0),
            "Longest Wait (days)": plan.metrics.get("longest_wait_days", 0),
            "Risk Score": plan.metrics.get("risk_score", 0),
            "Cars Scheduled": plan.metrics.get("cars_scheduled", 0),
            "Cars Unscheduled": plan.metrics.get("cars_unscheduled", 0),
            "Total Events": plan.metrics.get("total_events", 0),
            "Assignment Impact": plan.metrics.get("assignment_readiness_impact", "N/A"),
        }

    return comparison


def print_comparison_table(scenarios: list[InternalTeamPlan]):
    """
    Print a Markdown comparison table of scenarios.

    Args:
        scenarios: List of InternalTeamPlan objects
    """
    comparison = compare_scenarios(scenarios)

    # Define metrics to display
    metrics = [
        "Release Compliance %",
        "Qual Plan Attainment %",
        "Total Backlog",
        "Longest Wait (days)",
        "Risk Score",
        "Cars Scheduled",
        "Cars Unscheduled",
        "Total Events",
        "Assignment Impact",
    ]

    # Build header
    scenario_names = list(comparison.keys())
    header = "| Metric | " + " | ".join(scenario_names) + " |"
    separator = "|" + "|".join(["---"] * (len(scenario_names) + 1)) + "|"

    print("\n## Scenario Comparison\n")
    print(header)
    print(separator)

    # Print each metric row
    for metric in metrics:
        values = [str(comparison[name].get(metric, "N/A")) for name in scenario_names]
        row = f"| {metric} | " + " | ".join(values) + " |"
        print(row)

    print()


def generate_comparison_markdown(scenarios: list[InternalTeamPlan]) -> str:
    """
    Generate Markdown comparison table as a string.

    Args:
        scenarios: List of InternalTeamPlan objects

    Returns:
        Markdown table string
    """
    comparison = compare_scenarios(scenarios)

    metrics = [
        "Release Compliance %",
        "Qual Plan Attainment %",
        "Total Backlog",
        "Longest Wait (days)",
        "Risk Score",
        "Cars Scheduled",
        "Cars Unscheduled",
        "Total Events",
        "Assignment Impact",
    ]

    scenario_names = list(comparison.keys())

    lines = [
        "## Scenario Comparison\n",
        "| Metric | " + " | ".join(scenario_names) + " |",
        "|" + "|".join(["---"] * (len(scenario_names) + 1)) + "|",
    ]

    for metric in metrics:
        values = [str(comparison[name].get(metric, "N/A")) for name in scenario_names]
        lines.append(f"| {metric} | " + " | ".join(values) + " |")

    return "\n".join(lines)


# =============================================================================
# SECTION 6 — PDF GENERATION
# =============================================================================

def generate_internal_pdf(
    plan: InternalTeamPlan,
    output_path: str = "internal_team_plan.pdf"
) -> str:
    """
    Generate Internal Team Plan PDF using ReportLab.

    Args:
        plan: InternalTeamPlan object
        output_path: Output file path

    Returns:
        Path to generated PDF
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(letter),
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=20,
    )

    subtitle_style = ParagraphStyle(
        "CustomSubtitle",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=12,
    )

    normal_style = ParagraphStyle(
        "CustomNormal",
        parent=styles["Normal"],
        fontSize=9,
    )

    elements = []

    # Title
    elements.append(Paragraph(
        f"Internal Team Plan: {plan.scenario_name}",
        title_style
    ))

    # Plan metadata
    meta_text = f"""
    <b>Plan ID:</b> {plan.plan_id}<br/>
    <b>Generated:</b> {plan.created_at.strftime('%Y-%m-%d %H:%M')}<br/>
    <b>Planning Period:</b> {plan.planning_horizon_start} to {plan.planning_horizon_end}<br/>
    <b>Total Events:</b> {plan.total_scheduled}<br/>
    <b>Backlog Cars:</b> {plan.total_backlog}
    """
    elements.append(Paragraph(meta_text, normal_style))
    elements.append(Spacer(1, 20))

    # Metrics Summary
    elements.append(Paragraph("Key Metrics", subtitle_style))

    metrics = plan.metrics
    metrics_data = [
        ["Metric", "Value"],
        ["Release Compliance", f"{metrics.get('release_compliance_pct', 0)}%"],
        ["Qual Plan Attainment", f"{metrics.get('qual_plan_attainment_pct', 0)}%"],
        ["Total Backlog", str(metrics.get('total_backlog', 0))],
        ["Longest Wait", f"{metrics.get('longest_wait_days', 0)} days"],
        ["Risk Score", f"{metrics.get('risk_score', 0)}/10"],
        ["Cars Scheduled", str(metrics.get('cars_scheduled', 0))],
        ["Cars Unscheduled", str(metrics.get('cars_unscheduled', 0))],
        ["Assignment Impact", str(metrics.get('assignment_readiness_impact', 'N/A'))],
    ]

    metrics_table = Table(metrics_data, colWidths=[2.5 * inch, 2 * inch])
    metrics_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#ECF0F1")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    elements.append(metrics_table)
    elements.append(Spacer(1, 20))

    # Shop Summary
    elements.append(Paragraph("Shop Summary", subtitle_style))

    shop_data = [["Shop", "Type", "Events", "Quals", "Assigns", "Repairs", "Utilization"]]
    for shop_id, summary in plan.shop_summaries.items():
        shop_data.append([
            summary.get("shop_name", shop_id),
            summary.get("shop_type", "N/A"),
            str(summary.get("total_events", 0)),
            str(summary.get("qualifications", 0)),
            str(summary.get("assignments", 0)),
            str(summary.get("repairs", 0)),
            f"{summary.get('avg_utilization', 0) * 100:.1f}%",
        ])

    shop_table = Table(shop_data, colWidths=[1.5 * inch, 1 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch, 0.7 * inch, 1 * inch])
    shop_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#ECF0F1")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
    ]))

    elements.append(shop_table)
    elements.append(PageBreak())

    # Scheduled Events Table
    elements.append(Paragraph("Scheduled Events", subtitle_style))

    event_data = [["Event ID", "Car ID", "Shop", "Work Types", "Start Date", "End Date", "Priority", "Customer"]]

    for event in sorted(plan.scheduled_events, key=lambda e: e.scheduled_date):
        work_str = ", ".join(event.work_type_names)
        if len(work_str) > 25:
            work_str = work_str[:22] + "..."

        event_data.append([
            event.event_id[:12],
            event.car_id,
            event.shop_id,
            work_str,
            event.scheduled_date.strftime("%Y-%m-%d"),
            event.estimated_completion.strftime("%Y-%m-%d"),
            event.priority.name,
            event.customer_id or "-",
        ])

        # Page break every 25 rows to prevent overflow
        if len(event_data) % 25 == 0 and len(event_data) < len(plan.scheduled_events):
            event_table = Table(
                event_data,
                colWidths=[0.9 * inch, 0.8 * inch, 0.8 * inch, 1.5 * inch, 0.9 * inch, 0.9 * inch, 0.7 * inch, 0.8 * inch]
            )
            event_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495E")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE", (0, 1), (-1, -1), 7),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
            ]))
            elements.append(event_table)
            elements.append(PageBreak())
            event_data = [["Event ID", "Car ID", "Shop", "Work Types", "Start Date", "End Date", "Priority", "Customer"]]

    # Add remaining events
    if len(event_data) > 1:
        event_table = Table(
            event_data,
            colWidths=[0.9 * inch, 0.8 * inch, 0.8 * inch, 1.5 * inch, 0.9 * inch, 0.9 * inch, 0.7 * inch, 0.8 * inch]
        )
        event_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE", (0, 1), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
        ]))
        elements.append(event_table)

    # Backlog Section
    if plan.backlog_cars:
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("Backlog Cars", subtitle_style))

        backlog_text = ", ".join(plan.backlog_cars)
        elements.append(Paragraph(backlog_text, normal_style))

    # Build PDF
    doc.build(elements)

    return output_path


def generate_customer_pdf(
    plan: InternalTeamPlan,
    customer_id: str,
    customer_name: str,
    output_path: Optional[str] = None
) -> str:
    """
    Generate Customer Schedule PDF.

    Args:
        plan: InternalTeamPlan object
        customer_id: Customer ID to filter events
        customer_name: Customer display name
        output_path: Output file path (auto-generated if None)

    Returns:
        Path to generated PDF
    """
    if output_path is None:
        safe_name = customer_id.replace(" ", "_").replace("/", "_")
        output_path = f"customer_schedule_{safe_name}.pdf"

    # Create customer schedule object
    customer_schedule = CustomerSchedulePDF(
        customer_id=customer_id,
        customer_name=customer_name,
    )

    # Filter events for this customer
    customer_events = plan.get_events_by_customer(customer_id)
    for event in customer_events:
        customer_schedule.add_event(event)

    customer_schedule.calculate_summary()

    # Generate PDF
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomerTitle",
        parent=styles["Heading1"],
        fontSize=16,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.HexColor("#1A5276"),
    )

    subtitle_style = ParagraphStyle(
        "CustomerSubtitle",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=10,
        textColor=colors.HexColor("#2C3E50"),
    )

    normal_style = ParagraphStyle(
        "CustomerNormal",
        parent=styles["Normal"],
        fontSize=10,
    )

    elements = []

    # Header
    elements.append(Paragraph("AITX Railcar Services", title_style))
    elements.append(Paragraph(f"Schedule for: {customer_name}", subtitle_style))

    # Summary
    summary = customer_schedule.summary
    summary_text = f"""
    <b>Customer ID:</b> {customer_id}<br/>
    <b>Generated:</b> {customer_schedule.generated_at.strftime('%Y-%m-%d')}<br/>
    <b>Total Cars:</b> {summary.get('total_cars', 0)}<br/>
    <b>Total Events:</b> {summary.get('total_events', 0)}
    """

    if summary.get("earliest_date") and summary.get("latest_date"):
        summary_text += f"""<br/>
        <b>Schedule Period:</b> {summary['earliest_date']} to {summary['latest_date']}
        """

    elements.append(Paragraph(summary_text, normal_style))
    elements.append(Spacer(1, 20))

    # Events Table
    if customer_schedule.events:
        elements.append(Paragraph("Scheduled Service Events", subtitle_style))

        event_data = [["Car ID", "Service Type", "Scheduled Date", "Est. Completion", "Status"]]

        for event in sorted(customer_schedule.events, key=lambda e: e.scheduled_date):
            # Format work types for customer view
            work_display = []
            for wt in event.work_types:
                if wt == WorkType.QUALIFICATION:
                    work_display.append("Certification")
                elif wt == WorkType.CLEANING:
                    work_display.append("Cleaning")
                elif wt == WorkType.ASSIGNMENT:
                    work_display.append("Assignment Prep")
                elif wt in [WorkType.MINOR_REPAIR, WorkType.MAJOR_REPAIR]:
                    work_display.append("Repair")
                elif wt == WorkType.INSPECTION:
                    work_display.append("Inspection")
                else:
                    work_display.append(wt.value.replace("_", " ").title())

            work_str = ", ".join(work_display)

            event_data.append([
                event.car_id,
                work_str,
                event.scheduled_date.strftime("%Y-%m-%d"),
                event.estimated_completion.strftime("%Y-%m-%d"),
                event.status.value.title(),
            ])

        event_table = Table(
            event_data,
            colWidths=[1.2 * inch, 2 * inch, 1.2 * inch, 1.2 * inch, 1 * inch]
        )
        event_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A5276")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EBF5FB")]),
        ]))

        elements.append(event_table)
    else:
        elements.append(Paragraph(
            "No scheduled events found for this customer.",
            normal_style
        ))

    # Footer / Contact Info
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Contact Information", subtitle_style))
    elements.append(Paragraph(customer_schedule.contact_info, normal_style))

    # Build PDF
    doc.build(elements)

    return output_path


# =============================================================================
# SECTION 7 — EXAMPLE DATA & RUN_ALL_SCENARIOS
# =============================================================================

def create_example_shops() -> list[ShopCapacity]:
    """Create example shop capacity data."""
    return [
        ShopCapacity(
            shop_id="SHOP-001",
            shop_name="AITX Houston Primary",
            shop_type=ShopType.AITX_PRIMARY,
            location="Houston, TX",
            monthly_qualification_capacity=60,
            monthly_assignment_capacity=40,
            monthly_return_capacity=50,
            monthly_repair_capacity=25,
            efficiency_rating=0.95,
        ),
        ShopCapacity(
            shop_id="SHOP-002",
            shop_name="AITX Chicago Secondary",
            shop_type=ShopType.AITX_SECONDARY,
            location="Chicago, IL",
            monthly_qualification_capacity=45,
            monthly_assignment_capacity=30,
            monthly_return_capacity=35,
            monthly_repair_capacity=20,
            efficiency_rating=0.90,
        ),
        ShopCapacity(
            shop_id="SHOP-003",
            shop_name="Partner Shop - Dallas",
            shop_type=ShopType.PARTNER,
            location="Dallas, TX",
            monthly_qualification_capacity=35,
            monthly_assignment_capacity=25,
            monthly_return_capacity=30,
            monthly_repair_capacity=15,
            efficiency_rating=0.85,
        ),
        ShopCapacity(
            shop_id="SHOP-004",
            shop_name="Third Party - Atlanta",
            shop_type=ShopType.THIRD_PARTY,
            location="Atlanta, GA",
            monthly_qualification_capacity=30,
            monthly_assignment_capacity=20,
            monthly_return_capacity=25,
            monthly_repair_capacity=10,
            efficiency_rating=0.80,
        ),
    ]


def create_example_leases() -> list[LeaseExpiration]:
    """Create example lease expiration data."""
    today = date.today()
    leases = []

    # Generate 50 sample leases over the next 6 months
    customers = ["CUST-001", "CUST-002", "CUST-003", "CUST-004", "CUST-005"]
    car_types = list(CarType)
    priorities = [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW]

    for i in range(50):
        # Spread expiration dates over 6 months
        days_offset = (i * 3) + random.randint(0, 10)
        lease_end = today + timedelta(days=days_offset)

        # Randomly assign properties
        customer = customers[i % len(customers)]
        car_type = car_types[i % len(car_types)]
        priority = priorities[i % len(priorities)]

        # Some cars have next assignments
        next_customer = customers[(i + 2) % len(customers)] if i % 3 == 0 else None

        # Some cars need repairs
        needs_repair = i % 7 == 0
        repair_severity = "major" if i % 14 == 0 else "minor" if needs_repair else None

        lease = LeaseExpiration(
            car_id=f"CAR-{1000 + i:04d}",
            customer_id=customer,
            lease_end_date=lease_end,
            car_type=car_type,
            location=f"LOC-{i % 10:02d}",
            next_customer_id=next_customer,
            requires_qualification=True,
            requires_cleaning=i % 2 == 0,
            requires_repair=needs_repair,
            repair_severity=repair_severity,
            priority=priority,
            transit_days=random.choice([3, 5, 7, 10]),
        )
        leases.append(lease)

    return leases


def create_example_qual_cars() -> list[QualCar]:
    """Create example qualification queue data."""
    today = date.today()
    qual_cars = []

    # Generate 20 cars already in qual queue
    for i in range(20):
        due_date = today + timedelta(days=random.randint(15, 90))
        arrival = today + timedelta(days=random.randint(3, 20))

        # Some have bundled work
        bundled = []
        if i % 3 == 0:
            bundled.append(WorkType.CLEANING)
        if i % 5 == 0:
            bundled.append(WorkType.ASSIGNMENT)

        qual_car = QualCar(
            car_id=f"QUAL-{2000 + i:04d}",
            due_date=due_date,
            priority=Priority.MEDIUM if i % 2 == 0 else Priority.HIGH,
            car_type=CarType.TANK if i % 2 == 0 else CarType.HOPPER,
            projected_arrival=arrival,
            bundled_work=bundled,
            customer_id=f"CUST-{(i % 5) + 1:03d}" if i % 4 == 0 else None,
        )
        qual_cars.append(qual_car)

    return qual_cars


def run_all_scenarios() -> list[InternalTeamPlan]:
    """
    Run all three required scenarios and return the plans.

    Returns:
        List of InternalTeamPlan objects for each scenario
    """
    # Create example data
    shops = create_example_shops()
    leases = create_example_leases()
    qual_cars = create_example_qual_cars()

    print("=" * 70)
    print("CHRONOS ENGINE - SCENARIO ANALYSIS")
    print("=" * 70)
    print(f"\nInput Data:")
    print(f"  - Shops: {len(shops)}")
    print(f"  - Lease Expirations: {len(leases)}")
    print(f"  - Qualification Queue: {len(qual_cars)}")
    print("\n" + "-" * 70)

    # Run Base Plan
    print("\nRunning Base Plan scenario...")
    base_plan = run_base_scenario(leases, qual_cars, shops)
    print(f"  ✓ Base Plan complete: {base_plan.total_scheduled} events scheduled")

    # Run Late Release Scenario
    print("\nRunning Late Release scenario (20% slip by 10 days)...")
    late_plan = run_late_release_scenario(leases, qual_cars, shops)
    print(f"  ✓ Late Release complete: {late_plan.total_scheduled} events scheduled")

    # Run Capacity Shift Scenario (reduce first shop by 20%)
    print("\nRunning Capacity Shift scenario (SHOP-001 reduced by 20%)...")
    capacity_plan = run_capacity_shift_scenario(
        leases, qual_cars, shops, "SHOP-001", 0.20
    )
    print(f"  ✓ Capacity Shift complete: {capacity_plan.total_scheduled} events scheduled")

    scenarios = [base_plan, late_plan, capacity_plan]

    # Print comparison table
    print("\n" + "-" * 70)
    print_comparison_table(scenarios)

    return scenarios


def main():
    """Main entry point for the Chronos Engine."""
    print("\n" + "=" * 70)
    print("  CHRONOS LEASE RELEASE + QUALIFICATION SCENARIO ENGINE")
    print("  AITX - Automated Planning System")
    print("=" * 70 + "\n")

    # Run all scenarios
    scenarios = run_all_scenarios()

    # Generate PDFs
    print("\n" + "-" * 70)
    print("GENERATING PDF REPORTS")
    print("-" * 70)

    base_plan = scenarios[0]

    # Generate Internal Team Plan PDF
    internal_pdf_path = generate_internal_pdf(base_plan, "internal_team_plan.pdf")
    print(f"\n✓ Internal Team Plan PDF generated: {internal_pdf_path}")

    # Generate Customer PDF for a sample customer
    customer_pdf_path = generate_customer_pdf(
        base_plan,
        customer_id="CUST-001",
        customer_name="Acme Chemical Corp",
        output_path="customer_schedule_acme.pdf"
    )
    print(f"✓ Customer Schedule PDF generated: {customer_pdf_path}")

    # Summary
    print("\n" + "=" * 70)
    print("SCENARIO ANALYSIS COMPLETE")
    print("=" * 70)

    for plan in scenarios:
        metrics = plan.metrics
        print(f"\n{plan.scenario_name}:")
        print(f"  - Risk Score: {metrics.get('risk_score', 0)}/10")
        print(f"  - Scheduled: {metrics.get('cars_scheduled', 0)} cars")
        print(f"  - Backlog: {metrics.get('total_backlog', 0)} cars")
        print(f"  - Release Compliance: {metrics.get('release_compliance_pct', 0)}%")

    print("\n" + "=" * 70 + "\n")

    return scenarios


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
ChronosScenarioEngine.py - Chronos Lease Release + Qualification Scenario Engine for AITX

A complete, fully functional Python module for planning and simulating:
- Lease release scheduling
- Qualification planning
- Shop capacity management
- Scenario comparison and analysis
- PDF report generation

Author: AITX Chronos Team
Version: 1.0.0
"""

# =============================================================================
# SECTION 1 - IMPORTS & CONSTANTS
# =============================================================================

import copy
import datetime
import random
from typing import List, Dict, Optional, Any, Tuple

from dateutil.parser import parse

# Import from the companion data store module
from ChronosDataStore import (
    MasterDataStore,
    ScheduledEvent,
    LeaseEvent,
    ShopCapacity,
    WORK_DURATION,
    # Also import supporting types
    WorkType,
    CarType,
    Priority,
    ShopType,
    EventStatus,
    create_sample_data_store,
)

# Import ReportLab components for PDF generation
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Define a standard transit time (in days)
TRANSIT_DAYS = 7

# Planning horizon in months
PLANNING_HORIZON_MONTHS = 6

# Late release simulation default days
DEFAULT_LATE_RELEASE_DAYS = 10

# Risk score weights
RISK_WEIGHT_BACKLOG = 0.25
RISK_WEIGHT_COMPLIANCE = 0.30
RISK_WEIGHT_CAPACITY = 0.25
RISK_WEIGHT_WAIT_TIME = 0.20


# =============================================================================
# SECTION 2 - CHRONOS ENGINE CLASS
# =============================================================================

class ChronosEngine:
    """
    Main scenario engine for Chronos Lease Release + Qualification planning.

    This class provides the core scheduling logic for:
    - Processing lease expirations and qualification needs
    - Finding optimal shop slots based on capacity and preferences
    - Running what-if scenarios with capacity/release variations
    - Generating comparison metrics and reports

    Usage:
        engine = ChronosEngine(data_store)
        results = engine.run_scenario("Base Plan")
        engine.generate_internal_team_plan_pdf(results, "output.pdf")

    Attributes:
        data_store: MasterDataStore instance containing all planning data
        scheduled_events: List of ScheduledEvent objects from last run
        backlog: List of car IDs that could not be scheduled
        metrics: Dictionary of calculated metrics from last run
    """

    def __init__(self, data_store: MasterDataStore):
        """
        Initialize the Chronos Engine.

        Args:
            data_store: MasterDataStore instance with lease events, shop capacities, etc.
        """
        self.data_store = data_store
        self.scheduled_events: List[ScheduledEvent] = []
        self.backlog: List[str] = []
        self.metrics: Dict[str, Any] = {}
        self._shop_name_cache: Dict[str, str] = {}

        # Cache shop names for quick lookup
        for shop in self.data_store.get_shop_capacities():
            self._shop_name_cache[shop.shop_id] = shop.shop_name

    # =========================================================================
    # CORE SCHEDULING LOGIC
    # =========================================================================

    def calculate_projected_inbound(
        self,
        lease_end_date: datetime.date,
        release_slip_days: int = 0
    ) -> datetime.date:
        """
        Calculate the projected inbound date for a car arriving at a shop.

        The inbound date is calculated as:
        Lease End Date + Transit Days + Release Slip Days

        Args:
            lease_end_date: The original lease expiration date
            release_slip_days: Additional days if release is delayed (default 0)

        Returns:
            Projected date when car will arrive at shop
        """
        # Start with lease end date
        if isinstance(lease_end_date, str):
            lease_end_date = parse(lease_end_date).date()

        # Add transit time and any slip
        total_days = TRANSIT_DAYS + release_slip_days
        projected = lease_end_date + datetime.timedelta(days=total_days)

        # Adjust for weekends - ensure arrival is on a business day
        while projected.weekday() >= 5:  # Saturday = 5, Sunday = 6
            projected += datetime.timedelta(days=1)

        return projected

    def find_best_shop_slot(
        self,
        car_type: CarType,
        projected_inbound: datetime.date,
        current_shop_capacity: Dict[str, ShopCapacity],
        requires_qual: bool = True,
        requires_assignment: bool = False,
        preferred_shop: Optional[str] = None,
    ) -> Optional[Tuple[str, datetime.date, datetime.date]]:
        """
        Find the best available shop slot for a car.

        Shop Selection Rules:
        1. Prioritize AITX-Owned shops first
        2. Check capacity constraints for the target month
        3. For bundled work (Assign+Qual), check both qual_capacity and assign_capacity
        4. Fall back to subsequent months if target month is full

        Args:
            car_type: Type of railcar being scheduled
            projected_inbound: Projected arrival date at shop
            current_shop_capacity: Mutable dictionary of shop_id -> ShopCapacity
            requires_qual: Whether qualification work is needed (default True)
            requires_assignment: Whether assignment prep is needed (default False)
            preferred_shop: Optional preferred shop ID

        Returns:
            Tuple of (shop_id, scheduled_start_date, scheduled_end_date) or None if no slot
        """
        target_month = projected_inbound.strftime("%Y-%m")

        # Sort shops by preference: AITX-owned first, then by efficiency
        def shop_priority(shop: ShopCapacity) -> Tuple[int, float]:
            aitx_priority = 0 if shop.is_aitx_owned else 1
            efficiency_inv = 1.0 - shop.efficiency_rating
            return (aitx_priority, efficiency_inv)

        shops = sorted(current_shop_capacity.values(), key=shop_priority)

        # If preferred shop specified, try it first
        if preferred_shop and preferred_shop in current_shop_capacity:
            preferred = current_shop_capacity[preferred_shop]
            result = self._try_slot_shop(
                preferred, target_month, projected_inbound,
                requires_qual, requires_assignment, car_type
            )
            if result:
                return result

        # Try each shop in priority order
        for shop in shops:
            if preferred_shop and shop.shop_id == preferred_shop:
                continue  # Already tried

            result = self._try_slot_shop(
                shop, target_month, projected_inbound,
                requires_qual, requires_assignment, car_type
            )
            if result:
                return result

        # If no shop has capacity in target month, try next months
        for month_offset in range(1, PLANNING_HORIZON_MONTHS):
            next_month = self._add_months_to_key(target_month, month_offset)
            # Calculate first day of that month
            year, month = map(int, next_month.split("-"))
            month_start = datetime.date(year, month, 1)
            # Adjust to first business day
            while month_start.weekday() >= 5:
                month_start += datetime.timedelta(days=1)

            for shop in shops:
                result = self._try_slot_shop(
                    shop, next_month, month_start,
                    requires_qual, requires_assignment, car_type
                )
                if result:
                    return result

        # No slot found in planning horizon
        return None

    def _try_slot_shop(
        self,
        shop: ShopCapacity,
        month_key: str,
        scheduled_date: datetime.date,
        requires_qual: bool,
        requires_assignment: bool,
        car_type: CarType,
    ) -> Optional[Tuple[str, datetime.date, datetime.date]]:
        """
        Try to slot a car into a specific shop for a specific month.

        Returns tuple of (shop_id, start_date, end_date) if successful, None otherwise.
        """
        # Check if shop can handle this car type
        if not shop.can_handle_car_type(car_type):
            return None

        # Check if shop is active
        if not shop.is_active:
            return None

        # Check capacity based on work type
        if requires_qual:
            qual_available = shop.get_available_slots(month_key, "qualification")
            if qual_available < 1:
                return None

        if requires_assignment:
            assign_available = shop.get_available_slots(month_key, "assignment")
            if assign_available < 1:
                return None

        # Also check total capacity (additional safeguard)
        total_available = shop.get_available_slots(month_key, "total")
        slots_needed = (1 if requires_qual else 0) + (1 if requires_assignment else 0)
        if total_available < slots_needed:
            return None

        # Calculate work duration
        duration_days = 0
        if requires_qual:
            duration_days += WORK_DURATION.get("qualification", 3)
        if requires_assignment:
            duration_days += WORK_DURATION.get("assignment", 1)
        if duration_days == 0:
            duration_days = 1  # Minimum 1 day

        # Calculate end date
        end_date = self._add_business_days(scheduled_date, duration_days)

        # Consume the slots
        if requires_qual:
            shop.consume_slot(month_key, "qualification", 1)
        if requires_assignment:
            shop.consume_slot(month_key, "assignment", 1)

        return (shop.shop_id, scheduled_date, end_date)

    def process_planning_queue(
        self,
        planning_queue: List[LeaseEvent],
        shop_capacity: Dict[str, ShopCapacity],
    ) -> Tuple[List[ScheduledEvent], List[str]]:
        """
        Process the planning queue and schedule cars into shops.

        This is the main scheduling function that iterates through the queue,
        finds slots using find_best_shop_slot, and decrements capacity.

        Sorting Logic:
        1. Lease Expirations sorted by lease_end_date, then priority
        2. Pure Qualification needs follow

        Args:
            planning_queue: Sorted list of LeaseEvent objects to process
            shop_capacity: Mutable dictionary of shop_id -> ShopCapacity

        Returns:
            Tuple of (list of ScheduledEvents, list of backlog car IDs)
        """
        scheduled_events: List[ScheduledEvent] = []
        backlog: List[str] = []

        for lease in planning_queue:
            # Calculate projected inbound based on actual release date
            release_slip = lease.release_slip_days
            projected_inbound = self.calculate_projected_inbound(
                lease.lease_end_date,
                release_slip
            )

            # Determine work requirements
            requires_qual = lease.requires_qualification
            requires_assignment = lease.has_next_assignment

            # Find best shop slot
            slot_result = self.find_best_shop_slot(
                car_type=lease.car_type,
                projected_inbound=projected_inbound,
                current_shop_capacity=shop_capacity,
                requires_qual=requires_qual,
                requires_assignment=requires_assignment,
            )

            if slot_result is None:
                # Could not schedule within planning horizon - add to backlog
                backlog.append(lease.car_id)
                continue

            shop_id, start_date, end_date = slot_result

            # Build work types list
            work_types = []
            if requires_qual:
                work_types.append("qualification")
            if requires_assignment:
                work_types.append("assignment")
            if lease.requires_cleaning:
                work_types.append("cleaning")
            if lease.requires_repair:
                work_types.append(lease.repair_type or "repair")

            # Create scheduled event
            event = ScheduledEvent(
                event_id="",  # Auto-generated
                car_id=lease.car_id,
                shop_id=shop_id,
                shop_name=self._shop_name_cache.get(shop_id, shop_id),
                work_types=work_types,
                scheduled_start=start_date,
                scheduled_end=end_date,
                status=EventStatus.PLANNED,
                priority=lease.priority,
                customer_id=lease.customer_id,
                next_customer_id=lease.next_customer_id,
                month_key=start_date.strftime("%Y-%m"),
                notes=f"Transit from {lease.location}" if lease.location else "",
            )

            scheduled_events.append(event)

        return scheduled_events, backlog

    # =========================================================================
    # SCENARIO RUNNER
    # =========================================================================

    def run_scenario(
        self,
        scenario_name: str,
        capacity_override: Optional[Dict[str, float]] = None,
        release_slip_pct: float = 0.0,
        release_slip_days: int = DEFAULT_LATE_RELEASE_DAYS,
        random_seed: int = 42,
    ) -> Dict[str, Any]:
        """
        Run a planning scenario with optional modifications.

        This method:
        1. Clones necessary data from the base data store
        2. Applies late release simulation if release_slip_pct > 0
        3. Applies capacity shifts if capacity_override is present
        4. Executes the core scheduling logic
        5. Computes and returns all required metrics

        Args:
            scenario_name: Name for this scenario (for reporting)
            capacity_override: Dict of shop_id -> capacity multiplier (e.g., {'AITX-BC': 0.8})
            release_slip_pct: Percentage of cars to delay (0.0 to 1.0)
            release_slip_days: Days to delay for affected cars (default 10)
            random_seed: Seed for reproducibility in random selection

        Returns:
            Dictionary containing:
            - scenario_name: Name of the scenario
            - scheduled_events: List of ScheduledEvent objects
            - backlog: List of car IDs not scheduled
            - metrics: All calculated metrics
            - shop_summaries: Summary by shop
            - monthly_summaries: Summary by month
        """
        random.seed(random_seed)

        # =====================================================================
        # Step 1: Clone data
        # =====================================================================
        cloned_leases = copy.deepcopy(self.data_store.get_lease_events())
        cloned_shops = {
            shop.shop_id: copy.deepcopy(shop)
            for shop in self.data_store.get_shop_capacities()
        }

        # =====================================================================
        # Step 2: Apply late release simulation
        # =====================================================================
        late_release_count = 0
        if release_slip_pct > 0:
            num_to_delay = int(len(cloned_leases) * release_slip_pct)
            if num_to_delay > 0:
                # Randomly select cars to delay
                indices = random.sample(
                    range(len(cloned_leases)),
                    min(num_to_delay, len(cloned_leases))
                )
                for idx in indices:
                    lease = cloned_leases[idx]
                    original_release = lease.actual_release_date or lease.lease_end_date
                    lease.actual_release_date = original_release + datetime.timedelta(days=release_slip_days)
                    lease.notes = f"Late release: +{release_slip_days} days"
                    late_release_count += 1

        # =====================================================================
        # Step 3: Apply capacity overrides
        # =====================================================================
        if capacity_override:
            for shop_id, multiplier in capacity_override.items():
                if shop_id in cloned_shops:
                    shop = cloned_shops[shop_id]
                    shop.qual_capacity = int(shop.qual_capacity * multiplier)
                    shop.assign_capacity = int(shop.assign_capacity * multiplier)
                    shop.return_capacity = int(shop.return_capacity * multiplier)
                    shop.repair_capacity = int(shop.repair_capacity * multiplier)
                    # Reinitialize monthly slots with new capacity
                    shop.monthly_slots = {}
                    shop._initialize_monthly_slots()

        # =====================================================================
        # Step 4: Sort and process planning queue
        # =====================================================================
        # Sort by: priority (ascending value = higher priority), then lease_end_date
        sorted_queue = sorted(
            cloned_leases,
            key=lambda x: (x.priority.value, x.lease_end_date)
        )

        scheduled_events, backlog = self.process_planning_queue(sorted_queue, cloned_shops)

        # Store results
        self.scheduled_events = scheduled_events
        self.backlog = backlog

        # =====================================================================
        # Step 5: Calculate metrics
        # =====================================================================
        metrics = self._calculate_metrics(
            scenario_name,
            cloned_leases,
            scheduled_events,
            backlog,
            cloned_shops,
            late_release_count,
        )
        self.metrics = metrics

        # Calculate summaries
        shop_summaries = self._calculate_shop_summaries(scheduled_events, cloned_shops)
        monthly_summaries = self._calculate_monthly_summaries(scheduled_events)

        return {
            "scenario_name": scenario_name,
            "scheduled_events": scheduled_events,
            "backlog": backlog,
            "metrics": metrics,
            "shop_summaries": shop_summaries,
            "monthly_summaries": monthly_summaries,
            "total_cars": len(cloned_leases),
            "late_release_count": late_release_count,
        }

    def _calculate_metrics(
        self,
        scenario_name: str,
        leases: List[LeaseEvent],
        events: List[ScheduledEvent],
        backlog: List[str],
        shops: Dict[str, ShopCapacity],
        late_release_count: int,
    ) -> Dict[str, Any]:
        """Calculate all required metrics for a scenario."""
        total_cars = len(leases)
        total_scheduled = len(events)
        total_backlog = len(backlog)

        # Release Compliance %
        on_time_releases = sum(1 for l in leases if not l.is_late_release)
        release_compliance_pct = (on_time_releases / total_cars * 100) if total_cars > 0 else 100.0

        # Qual Plan Attainment %
        qual_events = [e for e in events if e.includes_qualification]
        qual_needed = sum(1 for l in leases if l.requires_qualification)
        qual_attainment_pct = (len(qual_events) / qual_needed * 100) if qual_needed > 0 else 100.0

        # Longest Wait Time (days between projected inbound and scheduled start)
        longest_wait = 0
        total_wait = 0
        wait_count = 0

        for event in events:
            # Find corresponding lease
            lease = next((l for l in leases if l.car_id == event.car_id), None)
            if lease:
                projected_inbound = self.calculate_projected_inbound(
                    lease.lease_end_date,
                    lease.release_slip_days
                )
                wait_days = (event.scheduled_start - projected_inbound).days
                if wait_days > 0:
                    longest_wait = max(longest_wait, wait_days)
                    total_wait += wait_days
                    wait_count += 1

        avg_wait = total_wait / wait_count if wait_count > 0 else 0

        # Average Shop Utilization
        utilization_values = []
        for shop in shops.values():
            for month_key in shop.monthly_slots:
                util = shop.get_month_utilization(month_key)
                utilization_values.append(util)

        avg_utilization = sum(utilization_values) / len(utilization_values) if utilization_values else 0

        # Assignment Readiness Impact
        assignment_events = [e for e in events if e.includes_assignment]
        if assignment_events:
            delayed_assignments = sum(1 for e in assignment_events if e.status == EventStatus.DELAYED)
            delay_ratio = delayed_assignments / len(assignment_events)
            if delay_ratio == 0:
                assignment_impact = "All assignments on track"
            elif delay_ratio < 0.1:
                assignment_impact = "Minor delays (<10%)"
            elif delay_ratio < 0.25:
                assignment_impact = "Moderate delays (10-25%)"
            else:
                assignment_impact = "Significant delays (>25%)"
        else:
            assignment_impact = "No assignments scheduled"

        # Risk Score (1-10)
        risk_score = self._calculate_risk_score(
            release_compliance_pct,
            qual_attainment_pct,
            total_backlog,
            longest_wait,
            avg_utilization,
            total_cars,
        )

        return {
            "scenario_name": scenario_name,
            "total_cars": total_cars,
            "cars_scheduled": total_scheduled,
            "cars_unscheduled": total_backlog,
            "release_compliance_pct": round(release_compliance_pct, 1),
            "qual_plan_attainment_pct": round(qual_attainment_pct, 1),
            "total_backlog": total_backlog,
            "backlog_car_ids": backlog,
            "longest_wait_days": longest_wait,
            "average_wait_days": round(avg_wait, 1),
            "average_utilization_pct": round(avg_utilization * 100, 1),
            "assignment_readiness_impact": assignment_impact,
            "risk_score": risk_score,
            "late_release_count": late_release_count,
            "on_time_release_count": on_time_releases,
            "total_qual_events": len(qual_events),
            "total_assignment_events": len(assignment_events),
        }

    def _calculate_risk_score(
        self,
        compliance: float,
        attainment: float,
        backlog: int,
        longest_wait: int,
        utilization: float,
        total_cars: int,
    ) -> int:
        """
        Calculate risk score from 1-10.

        Higher score = higher risk.
        """
        # Compliance risk (inverted - lower compliance = higher risk)
        compliance_risk = (100 - compliance) / 10

        # Attainment risk
        attainment_risk = (100 - attainment) / 10

        # Backlog risk
        backlog_ratio = backlog / max(total_cars, 1)
        backlog_risk = min(10, backlog_ratio * 20)

        # Wait time risk (30 days = risk level 5, 60 days = 10)
        wait_risk = min(10, longest_wait / 6)

        # Capacity risk (utilization > 85% is concerning)
        capacity_risk = min(10, utilization * 12)

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
        events: List[ScheduledEvent],
        shops: Dict[str, ShopCapacity],
    ) -> Dict[str, Dict[str, Any]]:
        """Calculate summary statistics by shop."""
        summaries = {}

        for shop_id, shop in shops.items():
            shop_events = [e for e in events if e.shop_id == shop_id]

            qual_count = sum(1 for e in shop_events if e.includes_qualification)
            assign_count = sum(1 for e in shop_events if e.includes_assignment)
            repair_count = sum(
                1 for e in shop_events
                if any(wt in ["repair", "minor_repair", "major_repair"] for wt in e.work_types)
            )

            # Calculate utilization across months
            monthly_utils = []
            for month_key in shop.monthly_slots:
                monthly_utils.append(shop.get_month_utilization(month_key))
            avg_util = sum(monthly_utils) / len(monthly_utils) if monthly_utils else 0

            summaries[shop_id] = {
                "shop_name": shop.shop_name,
                "shop_type": shop.shop_type.value,
                "total_events": len(shop_events),
                "qualifications": qual_count,
                "assignments": assign_count,
                "repairs": repair_count,
                "avg_utilization_pct": round(avg_util * 100, 1),
                "qual_capacity": shop.qual_capacity,
                "assign_capacity": shop.assign_capacity,
            }

        return summaries

    def _calculate_monthly_summaries(
        self,
        events: List[ScheduledEvent],
    ) -> Dict[str, Dict[str, Any]]:
        """Calculate summary statistics by month."""
        summaries: Dict[str, Dict[str, Any]] = {}

        for event in events:
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

            if event.includes_qualification:
                summaries[month]["qualifications"] += 1
            if event.includes_assignment:
                summaries[month]["assignments"] += 1
            if any(wt in ["repair", "minor_repair", "major_repair"] for wt in event.work_types):
                summaries[month]["repairs"] += 1

        # Convert sets to counts
        for month in summaries:
            summaries[month]["unique_cars"] = len(summaries[month]["unique_cars"])

        return summaries

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def _add_months_to_key(self, month_key: str, months: int) -> str:
        """Add months to a month key string (YYYY-MM format)."""
        year, month = map(int, month_key.split("-"))
        month += months
        while month > 12:
            month -= 12
            year += 1
        while month < 1:
            month += 12
            year -= 1
        return f"{year:04d}-{month:02d}"

    def _add_business_days(self, start_date: datetime.date, days: int) -> datetime.date:
        """Add business days to a date, skipping weekends."""
        result = start_date
        days_added = 0

        while days_added < days:
            result += datetime.timedelta(days=1)
            if result.weekday() < 5:  # Monday = 0, Friday = 4
                days_added += 1

        return result


# =============================================================================
# SECTION 3 - OUTPUT GENERATION FUNCTIONS
# =============================================================================

def generate_scenario_comparison_markdown(
    scenario_results: List[Dict[str, Any]],
    include_details: bool = False,
) -> str:
    """
    Generate a Markdown comparison table for multiple scenarios.

    Args:
        scenario_results: List of result dictionaries from run_scenario()
        include_details: Whether to include additional detail sections

    Returns:
        Markdown formatted string with comparison table
    """
    if not scenario_results:
        return "No scenarios to compare."

    # Define metrics to display
    metrics_to_show = [
        ("Release Compliance %", "release_compliance_pct"),
        ("Qual Plan Attainment %", "qual_plan_attainment_pct"),
        ("Total Backlog", "total_backlog"),
        ("Longest Wait (days)", "longest_wait_days"),
        ("Avg Wait (days)", "average_wait_days"),
        ("Risk Score (1-10)", "risk_score"),
        ("Cars Scheduled", "cars_scheduled"),
        ("Cars Unscheduled", "cars_unscheduled"),
        ("Avg Utilization %", "average_utilization_pct"),
        ("Assignment Impact", "assignment_readiness_impact"),
    ]

    # Build header
    scenario_names = [r["scenario_name"] for r in scenario_results]
    header = "| Metric | " + " | ".join(scenario_names) + " |"
    separator = "|" + "|".join(["---"] * (len(scenario_names) + 1)) + "|"

    lines = [
        "## Chronos Scenario Comparison",
        "",
        f"*Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}*",
        "",
        header,
        separator,
    ]

    # Add metric rows
    for display_name, metric_key in metrics_to_show:
        values = []
        for result in scenario_results:
            val = result["metrics"].get(metric_key, "N/A")
            if isinstance(val, float):
                val = f"{val:.1f}"
            values.append(str(val))
        row = f"| {display_name} | " + " | ".join(values) + " |"
        lines.append(row)

    lines.append("")

    # Add recommendation based on risk scores
    risk_scores = [(r["scenario_name"], r["metrics"]["risk_score"]) for r in scenario_results]
    risk_scores.sort(key=lambda x: x[1])
    best_scenario = risk_scores[0][0]
    worst_scenario = risk_scores[-1][0]

    lines.extend([
        "### Analysis",
        "",
        f"- **Lowest Risk Scenario:** {best_scenario} (Risk Score: {risk_scores[0][1]})",
        f"- **Highest Risk Scenario:** {worst_scenario} (Risk Score: {risk_scores[-1][1]})",
        "",
    ])

    # Add details if requested
    if include_details:
        lines.append("### Backlog Details")
        lines.append("")
        for result in scenario_results:
            backlog = result.get("backlog", [])
            if backlog:
                lines.append(f"**{result['scenario_name']}:** {', '.join(backlog[:10])}")
                if len(backlog) > 10:
                    lines.append(f"  *(and {len(backlog) - 10} more)*")
            else:
                lines.append(f"**{result['scenario_name']}:** No backlog")
            lines.append("")

    return "\n".join(lines)


def generate_internal_team_plan_pdf(
    scenario_result: Dict[str, Any],
    output_path: str = "internal_team_plan.pdf",
) -> str:
    """
    Generate a detailed PDF summary for the A&R Team.

    This PDF includes:
    - Executive summary with key metrics
    - Shop-by-shop breakdown
    - Monthly schedule overview
    - Full event list
    - Backlog report

    Args:
        scenario_result: Result dictionary from run_scenario()
        output_path: Output file path for the PDF

    Returns:
        Path to the generated PDF file
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
        textColor=colors.HexColor("#1A5276"),
    )

    subtitle_style = ParagraphStyle(
        "CustomSubtitle",
        parent=styles["Heading2"],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.HexColor("#2C3E50"),
    )

    normal_style = ParagraphStyle(
        "CustomNormal",
        parent=styles["Normal"],
        fontSize=9,
    )

    elements = []

    # =========================================================================
    # Title Page
    # =========================================================================
    elements.append(Paragraph(
        f"Internal Team Plan: {scenario_result['scenario_name']}",
        title_style
    ))

    # Metadata
    meta_text = f"""
    <b>Generated:</b> {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}<br/>
    <b>Total Cars Processed:</b> {scenario_result.get('total_cars', 0)}<br/>
    <b>Successfully Scheduled:</b> {scenario_result['metrics']['cars_scheduled']}<br/>
    <b>Backlog:</b> {scenario_result['metrics']['total_backlog']}
    """
    elements.append(Paragraph(meta_text, normal_style))
    elements.append(Spacer(1, 20))

    # =========================================================================
    # Key Metrics Summary
    # =========================================================================
    elements.append(Paragraph("Key Metrics", subtitle_style))

    metrics = scenario_result["metrics"]
    metrics_data = [
        ["Metric", "Value", "Status"],
        ["Release Compliance", f"{metrics['release_compliance_pct']}%",
         "Good" if metrics['release_compliance_pct'] >= 90 else "Attention"],
        ["Qual Plan Attainment", f"{metrics['qual_plan_attainment_pct']}%",
         "Good" if metrics['qual_plan_attainment_pct'] >= 90 else "Attention"],
        ["Total Backlog", str(metrics['total_backlog']),
         "Good" if metrics['total_backlog'] == 0 else "Attention"],
        ["Longest Wait", f"{metrics['longest_wait_days']} days",
         "Good" if metrics['longest_wait_days'] <= 14 else "Attention"],
        ["Average Wait", f"{metrics['average_wait_days']} days", "-"],
        ["Risk Score", f"{metrics['risk_score']}/10",
         "Low" if metrics['risk_score'] <= 3 else ("Medium" if metrics['risk_score'] <= 6 else "High")],
        ["Avg Utilization", f"{metrics['average_utilization_pct']}%", "-"],
        ["Assignment Impact", str(metrics['assignment_readiness_impact']), "-"],
    ]

    metrics_table = Table(metrics_data, colWidths=[2.5 * inch, 1.5 * inch, 1.5 * inch])
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

    # =========================================================================
    # Shop Summary
    # =========================================================================
    elements.append(Paragraph("Shop Summary", subtitle_style))

    shop_summaries = scenario_result.get("shop_summaries", {})
    shop_data = [["Shop", "Type", "Events", "Quals", "Assigns", "Repairs", "Utilization"]]

    for shop_id, summary in shop_summaries.items():
        shop_data.append([
            summary.get("shop_name", shop_id),
            summary.get("shop_type", "N/A").replace("_", " ").title(),
            str(summary.get("total_events", 0)),
            str(summary.get("qualifications", 0)),
            str(summary.get("assignments", 0)),
            str(summary.get("repairs", 0)),
            f"{summary.get('avg_utilization_pct', 0):.1f}%",
        ])

    shop_table = Table(
        shop_data,
        colWidths=[2 * inch, 1.2 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 1 * inch]
    )
    shop_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 1), (0, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#ECF0F1")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
    ]))
    elements.append(shop_table)
    elements.append(PageBreak())

    # =========================================================================
    # Monthly Summary
    # =========================================================================
    elements.append(Paragraph("Monthly Schedule Overview", subtitle_style))

    monthly_summaries = scenario_result.get("monthly_summaries", {})
    if monthly_summaries:
        monthly_data = [["Month", "Total Events", "Unique Cars", "Quals", "Assigns", "Repairs"]]

        for month in sorted(monthly_summaries.keys()):
            summary = monthly_summaries[month]
            monthly_data.append([
                month,
                str(summary.get("total_events", 0)),
                str(summary.get("unique_cars", 0)),
                str(summary.get("qualifications", 0)),
                str(summary.get("assignments", 0)),
                str(summary.get("repairs", 0)),
            ])

        monthly_table = Table(
            monthly_data,
            colWidths=[1.2 * inch, 1.2 * inch, 1.2 * inch, 1 * inch, 1 * inch, 1 * inch]
        )
        monthly_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#34495E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FA")]),
        ]))
        elements.append(monthly_table)
    else:
        elements.append(Paragraph("No monthly data available.", normal_style))

    elements.append(Spacer(1, 20))

    # =========================================================================
    # Scheduled Events Detail
    # =========================================================================
    elements.append(Paragraph("Scheduled Events", subtitle_style))

    events = scenario_result.get("scheduled_events", [])
    if events:
        event_data = [["Event ID", "Car ID", "Shop", "Work Types", "Start", "End", "Priority", "Customer"]]

        for event in sorted(events, key=lambda e: e.scheduled_start):
            work_str = ", ".join(event.work_types)
            if len(work_str) > 25:
                work_str = work_str[:22] + "..."

            event_data.append([
                event.event_id[:12] if len(event.event_id) > 12 else event.event_id,
                event.car_id,
                event.shop_name[:15] if len(event.shop_name) > 15 else event.shop_name,
                work_str,
                event.scheduled_start.strftime("%Y-%m-%d"),
                event.scheduled_end.strftime("%Y-%m-%d"),
                event.priority.name,
                event.customer_id or "-",
            ])

            # Page break every 20 rows
            if len(event_data) % 20 == 0 and len(event_data) < len(events):
                _add_events_table_page(elements, event_data)
                event_data = [["Event ID", "Car ID", "Shop", "Work Types", "Start", "End", "Priority", "Customer"]]

        # Add remaining events
        if len(event_data) > 1:
            _add_events_table_page(elements, event_data)
    else:
        elements.append(Paragraph("No events scheduled.", normal_style))

    # =========================================================================
    # Backlog Section
    # =========================================================================
    backlog = scenario_result.get("backlog", [])
    if backlog:
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("Backlog Cars (Unable to Schedule)", subtitle_style))
        elements.append(Paragraph(
            f"The following {len(backlog)} cars could not be scheduled within the planning horizon:",
            normal_style
        ))
        elements.append(Spacer(1, 10))

        # Display backlog in columns
        backlog_text = ", ".join(backlog)
        elements.append(Paragraph(backlog_text, normal_style))

    # Build PDF
    doc.build(elements)

    return output_path


def _add_events_table_page(elements: List, event_data: List):
    """Helper to add an events table page."""
    event_table = Table(
        event_data,
        colWidths=[0.9 * inch, 0.9 * inch, 1.3 * inch, 1.5 * inch, 0.9 * inch, 0.9 * inch, 0.7 * inch, 0.9 * inch]
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


def generate_customer_inbound_pdf(
    scenario_result: Dict[str, Any],
    customer_id: str,
    customer_name: str,
    output_path: Optional[str] = None,
) -> str:
    """
    Generate a customer-facing PDF showing only their scheduled events.

    This is a simplified report filtered to show only events for the
    specified customer, with customer-friendly terminology.

    Args:
        scenario_result: Result dictionary from run_scenario()
        customer_id: Customer ID to filter events
        customer_name: Customer display name for the report
        output_path: Output file path (auto-generated if None)

    Returns:
        Path to the generated PDF file
    """
    if output_path is None:
        safe_name = customer_id.replace(" ", "_").replace("/", "_")
        output_path = f"customer_inbound_{safe_name}.pdf"

    # Filter events for this customer
    all_events = scenario_result.get("scheduled_events", [])
    customer_events = [
        e for e in all_events
        if e.customer_id == customer_id or e.next_customer_id == customer_id
    ]

    # Create PDF
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
    elements.append(Paragraph(f"Inbound Schedule for: {customer_name}", subtitle_style))

    # Summary
    unique_cars = set(e.car_id for e in customer_events)
    summary_text = f"""
    <b>Customer ID:</b> {customer_id}<br/>
    <b>Report Generated:</b> {datetime.datetime.now().strftime('%Y-%m-%d')}<br/>
    <b>Total Cars:</b> {len(unique_cars)}<br/>
    <b>Total Service Events:</b> {len(customer_events)}
    """

    if customer_events:
        earliest = min(e.scheduled_start for e in customer_events)
        latest = max(e.scheduled_end for e in customer_events)
        summary_text += f"""<br/>
        <b>Schedule Period:</b> {earliest.strftime('%Y-%m-%d')} to {latest.strftime('%Y-%m-%d')}
        """

    elements.append(Paragraph(summary_text, normal_style))
    elements.append(Spacer(1, 20))

    # Events Table
    if customer_events:
        elements.append(Paragraph("Scheduled Service Events", subtitle_style))

        event_data = [["Car ID", "Service Type", "Scheduled Date", "Est. Completion", "Facility"]]

        for event in sorted(customer_events, key=lambda e: e.scheduled_start):
            # Convert work types to customer-friendly names
            work_display = []
            for wt in event.work_types:
                wt_lower = wt.lower()
                if wt_lower in ["qualification", "qual"]:
                    work_display.append("Certification")
                elif wt_lower == "cleaning":
                    work_display.append("Cleaning")
                elif wt_lower in ["assignment", "assign", "assignment_prep"]:
                    work_display.append("Preparation")
                elif wt_lower in ["repair", "minor_repair", "major_repair"]:
                    work_display.append("Repair")
                elif wt_lower == "inspection":
                    work_display.append("Inspection")
                else:
                    work_display.append(wt.replace("_", " ").title())

            work_str = ", ".join(work_display)

            event_data.append([
                event.car_id,
                work_str,
                event.scheduled_start.strftime("%Y-%m-%d"),
                event.scheduled_end.strftime("%Y-%m-%d"),
                event.shop_name,
            ])

        event_table = Table(
            event_data,
            colWidths=[1.1 * inch, 1.8 * inch, 1.2 * inch, 1.2 * inch, 1.5 * inch]
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
            "No scheduled events found for this customer in the current planning period.",
            normal_style
        ))

    # Footer
    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Contact Information", subtitle_style))
    elements.append(Paragraph(
        "For questions about this schedule, please contact your AITX account representative "
        "or email scheduling@aitx.com",
        normal_style
    ))

    # Build PDF
    doc.build(elements)

    return output_path


def print_scenario_comparison(scenario_results: List[Dict[str, Any]]):
    """
    Print the scenario comparison table to stdout.

    Args:
        scenario_results: List of result dictionaries from run_scenario()
    """
    markdown = generate_scenario_comparison_markdown(scenario_results)
    print(markdown)


# =============================================================================
# SECTION 4 - MAIN EXECUTION BLOCK
# =============================================================================

if __name__ == "__main__":
    """
    Main execution block demonstrating the Chronos Scenario Engine.

    Runs three scenarios:
    - Scenario A: Base Plan (no modifications)
    - Scenario B: Late Release Scenario (20% of cars delayed by 10 days)
    - Scenario C: Capacity Shift Scenario (AITX Bossier City at 80% capacity)
    """
    print("=" * 70)
    print("  CHRONOS LEASE RELEASE + QUALIFICATION SCENARIO ENGINE")
    print("  AITX - Automated Planning System")
    print("=" * 70)
    print()

    # =========================================================================
    # Step 1: Initialize MasterDataStore
    # =========================================================================
    print("Initializing MasterDataStore...")

    # Try to load from file, fall back to sample data
    try:
        data_store = MasterDataStore("chronos_master_data.db")
        # Check if data exists
        if not data_store.get_lease_events():
            print("  Database empty, loading sample data...")
            data_store.close()
            data_store = create_sample_data_store()
    except Exception as e:
        print(f"  Could not load database ({e}), using sample data...")
        data_store = create_sample_data_store()

    stats = data_store.get_statistics()
    print(f"  - Lease Events: {stats['total_lease_events']}")
    print(f"  - Shops: {stats['total_shops']}")
    print(f"  - Customers: {stats['total_customers']}")
    print()

    # =========================================================================
    # Step 2: Initialize ChronosEngine
    # =========================================================================
    print("Initializing ChronosEngine...")
    engine = ChronosEngine(data_store)
    print("  Engine ready.")
    print()

    # =========================================================================
    # Step 3: Run Scenarios
    # =========================================================================
    print("-" * 70)
    print("RUNNING SCENARIOS")
    print("-" * 70)
    print()

    scenario_results = []

    # Scenario A: Base Plan
    print("Running Scenario A: Base Plan...")
    result_a = engine.run_scenario(
        scenario_name="Base Plan",
        release_slip_pct=0.0,
    )
    scenario_results.append(result_a)
    print(f"  - Scheduled: {result_a['metrics']['cars_scheduled']} cars")
    print(f"  - Backlog: {result_a['metrics']['total_backlog']} cars")
    print(f"  - Risk Score: {result_a['metrics']['risk_score']}/10")
    print()

    # Scenario B: Late Release Scenario
    print("Running Scenario B: Late Release Scenario (20% slip)...")
    result_b = engine.run_scenario(
        scenario_name="Late Release (20%)",
        release_slip_pct=0.2,
        release_slip_days=10,
    )
    scenario_results.append(result_b)
    print(f"  - Scheduled: {result_b['metrics']['cars_scheduled']} cars")
    print(f"  - Backlog: {result_b['metrics']['total_backlog']} cars")
    print(f"  - Risk Score: {result_b['metrics']['risk_score']}/10")
    print(f"  - Late Releases Simulated: {result_b['late_release_count']}")
    print()

    # Scenario C: Capacity Shift Scenario
    print("Running Scenario C: Capacity Shift (AITX-BC at 80%)...")
    result_c = engine.run_scenario(
        scenario_name="Capacity Shift (-20%)",
        capacity_override={"AITX-BC": 0.8},
    )
    scenario_results.append(result_c)
    print(f"  - Scheduled: {result_c['metrics']['cars_scheduled']} cars")
    print(f"  - Backlog: {result_c['metrics']['total_backlog']} cars")
    print(f"  - Risk Score: {result_c['metrics']['risk_score']}/10")
    print()

    # =========================================================================
    # Step 4: Print Comparison Table
    # =========================================================================
    print("-" * 70)
    print("SCENARIO COMPARISON")
    print("-" * 70)
    print()

    comparison_markdown = generate_scenario_comparison_markdown(scenario_results, include_details=True)
    print(comparison_markdown)

    # =========================================================================
    # Step 5: Generate PDF Reports
    # =========================================================================
    print("-" * 70)
    print("GENERATING PDF REPORTS")
    print("-" * 70)
    print()

    # Internal Team Plan PDF (using base plan)
    try:
        internal_pdf = generate_internal_team_plan_pdf(
            result_a,
            "internal_team_plan.pdf"
        )
        print(f"  - Internal Team Plan PDF: {internal_pdf}")
    except Exception as e:
        print(f"  - Error generating internal PDF: {e}")

    # Customer Inbound PDF
    try:
        customer_pdf = generate_customer_inbound_pdf(
            result_a,
            customer_id="CUST-001",
            customer_name="Acme Chemical Corp",
            output_path="customer_inbound_acme.pdf"
        )
        print(f"  - Customer Inbound PDF: {customer_pdf}")
    except Exception as e:
        print(f"  - Error generating customer PDF: {e}")

    print()

    # =========================================================================
    # Step 6: Summary
    # =========================================================================
    print("=" * 70)
    print("EXECUTION COMPLETE")
    print("=" * 70)
    print()
    print("Scenario Summary:")
    for result in scenario_results:
        m = result["metrics"]
        print(f"  {result['scenario_name']}:")
        print(f"    - Risk Score: {m['risk_score']}/10")
        print(f"    - Compliance: {m['release_compliance_pct']}%")
        print(f"    - Attainment: {m['qual_plan_attainment_pct']}%")
        print(f"    - Backlog: {m['total_backlog']} cars")
        print()

    # Recommendation
    risk_scores = [(r["scenario_name"], r["metrics"]["risk_score"]) for r in scenario_results]
    risk_scores.sort(key=lambda x: x[1])
    print(f"Recommendation: '{risk_scores[0][0]}' has the lowest risk profile.")
    print()

    # Cleanup
    data_store.close()
    print("Done.")

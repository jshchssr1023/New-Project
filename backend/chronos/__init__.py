"""
Chronos Lease Release + Qualification Scenario Engine for AITX

A complete planning and simulation system for:
- Lease release scheduling
- Qualification planning
- Shop capacity management
- Scenario comparison and analysis

Modules:
- chronos_engine: Original engine implementation with example data
- ChronosDataStore: Data persistence layer with MasterDataStore
- ChronosScenarioEngine: Main scenario engine with ChronosEngine class
"""

# Import from the new ChronosDataStore module
from .ChronosDataStore import (
    # Constants
    WORK_DURATION,
    DEFAULT_MONTHLY_QUAL_CAPACITY,
    DEFAULT_MONTHLY_ASSIGN_CAPACITY,
    DEFAULT_MONTHLY_RETURN_CAPACITY,
    DEFAULT_MONTHLY_REPAIR_CAPACITY,
    PLANNING_HORIZON_MONTHS as DATASTORE_PLANNING_HORIZON,
    # Main Class
    MasterDataStore,
    # Data Classes
    LeaseEvent,
    ScheduledEvent as DataStoreScheduledEvent,
    ShopCapacity as DataStoreShopCapacity,
    # Factory
    create_sample_data_store,
)

# Import from the new ChronosScenarioEngine module
from .ChronosScenarioEngine import (
    # Main Engine Class
    ChronosEngine,
    # Constants
    TRANSIT_DAYS,
    # Output Generation Functions
    generate_scenario_comparison_markdown,
    generate_internal_team_plan_pdf,
    generate_customer_inbound_pdf,
    print_scenario_comparison,
)

# Import from original chronos_engine for backwards compatibility
from .chronos_engine import (
    # Enums
    WorkType,
    CarType,
    Priority,
    ShopType,
    EventStatus,
    # Data Models
    LeaseExpiration,
    QualCar,
    ShopCapacity,
    ScheduledEvent,
    InternalTeamPlan,
    CustomerSchedulePDF,
    # Scheduling Logic
    calculate_projected_inbound,
    determine_required_work,
    align_and_bundle_work,
    calculate_work_duration,
    find_best_shop,
    slot_qualification_cars,
    process_lease_releases,
    # Scenario Runner
    ScenarioRunner,
    run_base_scenario,
    run_late_release_scenario,
    run_capacity_shift_scenario,
    # Comparison
    compare_scenarios,
    print_comparison_table,
    generate_comparison_markdown,
    # PDF Generation
    generate_internal_pdf,
    generate_customer_pdf,
    # Example Data
    create_example_shops,
    create_example_leases,
    create_example_qual_cars,
    run_all_scenarios,
    main,
    # Constants
    DEFAULT_TRANSIT_DAYS,
    EXPRESS_TRANSIT_DAYS,
    REMOTE_TRANSIT_DAYS,
    WORK_DURATION_QUALIFICATION,
    WORK_DURATION_CLEANING,
    WORK_DURATION_MINOR_REPAIR,
    WORK_DURATION_MAJOR_REPAIR,
    WORK_DURATION_ASSIGNMENT_PREP,
    WORK_DURATION_INSPECTION,
    PLANNING_HORIZON_MONTHS,
    ROLLING_QUAL_WINDOW_MONTHS,
)

__version__ = "1.0.0"
__author__ = "AITX Chronos Team"

__all__ = [
    # === NEW ChronosScenarioEngine Module ===
    # Main Engine Class
    "ChronosEngine",
    # Constants
    "TRANSIT_DAYS",
    "WORK_DURATION",
    # Output Generation
    "generate_scenario_comparison_markdown",
    "generate_internal_team_plan_pdf",
    "generate_customer_inbound_pdf",
    "print_scenario_comparison",

    # === NEW ChronosDataStore Module ===
    # Main Class
    "MasterDataStore",
    # Data Classes
    "LeaseEvent",
    "DataStoreScheduledEvent",
    "DataStoreShopCapacity",
    # Factory
    "create_sample_data_store",
    # Constants
    "DEFAULT_MONTHLY_QUAL_CAPACITY",
    "DEFAULT_MONTHLY_ASSIGN_CAPACITY",
    "DEFAULT_MONTHLY_RETURN_CAPACITY",
    "DEFAULT_MONTHLY_REPAIR_CAPACITY",
    "DATASTORE_PLANNING_HORIZON",

    # === Original chronos_engine Module (backwards compatibility) ===
    # Enums
    "WorkType",
    "CarType",
    "Priority",
    "ShopType",
    "EventStatus",
    # Data Models
    "LeaseExpiration",
    "QualCar",
    "ShopCapacity",
    "ScheduledEvent",
    "InternalTeamPlan",
    "CustomerSchedulePDF",
    # Scheduling Logic
    "calculate_projected_inbound",
    "determine_required_work",
    "align_and_bundle_work",
    "calculate_work_duration",
    "find_best_shop",
    "slot_qualification_cars",
    "process_lease_releases",
    # Scenario Runner
    "ScenarioRunner",
    "run_base_scenario",
    "run_late_release_scenario",
    "run_capacity_shift_scenario",
    # Comparison
    "compare_scenarios",
    "print_comparison_table",
    "generate_comparison_markdown",
    # PDF Generation
    "generate_internal_pdf",
    "generate_customer_pdf",
    # Example Data & Main
    "create_example_shops",
    "create_example_leases",
    "create_example_qual_cars",
    "run_all_scenarios",
    "main",
]

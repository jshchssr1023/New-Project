# PlanningGrid ↔ Qual Planner CSV — Parity Audit

> Status: audit / findings
> Scope: how close the app is to *replacing* the `Qual Planner Master.csv`, measured
> at the grid the scheduler would live in.
> Method: three-way comparison of the canonical CSV schema
> (`backend/src/services/qualPlannerSchema.ts`), what the UI renders
> (`PlanningGrid.tsx`, `CarsPage.tsx`, `CarFormModal.tsx`), and what export emits
> (`importExportService.ts`).

## Headline

**`PlanningGrid` is not a replacement for the Qual Planner sheet — it's a different
artifact.** The Qual Planner CSV is a **row-per-car** worksheet: ~40 attribute
columns plus ~70 shop columns whose cells hold a *scheduled date*.
`PlanningGrid` is a **shops × 12-months capacity heatmap** — rows are shops,
columns are months, cells are utilization/assignment counts. It answers "is this
shop full in March?", not "what's due on SHQX006002 and where is it going?".

The car-row equivalent of the spreadsheet is actually `CarsPage`, and even there
parity is far off: **8 of ~40 attribute columns are visible, 0 are inline-editable,
0 of the ~70 shop-date columns exist as cells, and export cannot reproduce the
Master CSV.** On the spreadsheet's own terms — see everything, edit any cell fast,
hand the file downstream — the app does not yet win.

## Parity scorecard

| Dimension | Spreadsheet | App today | Verdict |
|-----------|-------------|-----------|---------|
| **Row model** | One row per car | `PlanningGrid`: one row per *shop*. `CarsPage`: one row per car | Grid mismatch; CarsPage is the right shape |
| **Attribute columns visible** | ~40 | `CarsPage`: 8 (Railcar#, Customer, Project, Status, Shopping, Safety Relief, Service Equip, Tank Qual) | ~20% |
| **Attribute columns editable** | all, inline | `CarFormModal`: ~20 fields, **modal only** — no click-to-edit cell | ~50% of fields, wrong ergonomics |
| **Shop-date columns** | ~70 (cell = scheduled date) | none as cells; data lives as assignments and is aggregated to shop×month in PlanningGrid | 0% grid parity |
| **Inline edit / keyboard nav / paste** | native | none (open a modal to change one value) | 0% |
| **Bulk edit** | select + type | bulk *assign to shop* exists; bulk *attribute edit* does not | Partial |
| **Export the Master CSV** | it *is* the file | `exportCars` emits 13 generic columns, wrong headers, no shop columns | 0% |
| **Client-side sort/filter** | instant | filter dropdowns + search; not free-form per-column | Partial |

## Findings

### F1 — The grid the scheduler needs doesn't exist yet
`PlanningGrid.tsx` renders a sticky shop-name column + 12 month columns + a total
(`<thead>` at line ~1220). Its only car references are `railcarNumber`,
`reasonShopped`, `customer`, `projectNumber`, `isTankCar`, `carType` — used in the
assignment side-panel, none editable. It is a capacity planner, and a decent one.
It is **not** the Qual Planner. Closing "grid parity" means building (or promoting
`CarsPage` into) a **car-row grid with inline-editable cells**, not extending the
month heatmap.

### F2 — CarsPage shows 8 of ~40 columns
Displayed: Railcar #, Customer, Project, Status, Shopping, Safety Relief, Service
Equip, Tank Qual, Actions. **Not shown anywhere the scheduler can scan:** Car Mark,
FMS Lessee #, Contract, Contract Expiration, Commodity, CSR/CSL/Commercial,
Past/2026 Region, Jacketed/Lined/Lining Type, Car Age, Mark/Number/Mark2, Min (no
lining), Min w lining, Interior Lining, Rule 88B, Stub Sill, Tank Thickness,
Portfolio, Year, Full/Partial Qual, Perform Tank Qual, Scheduled, Adjusted Status,
Plan Status — plus every shop column. A scheduler used to seeing the whole row will
not accept an 8-column view.

### F3 — Editing is modal, not inline
There is no cell edit path. To change one value the user opens `CarFormModal`
(lazy-loaded). That modal itself covers only ~20 fields (Commodity, Customer,
Full/Partial Qual, Interior Lining, Lined, Lining Type, Min (no lining), Min w
lining, Notes, Portfolio, Project Number, Reason Shopped, Rule 88B, Safety Relief,
Scheduled, Service Equipment, Status, Stub Sill, Tank Qualification, Tank
Thickness). Missing even from the form: Car Mark, FMS Lessee #, Contract, Contract
Expiration, CSR, CSL, Commercial, Past/2026 Region, Jacketed, Car Age,
Mark/Number/Mark2, Adjusted Status, Plan Status, Year. **This is the single
biggest ergonomic gap** — a modal per edit is categorically slower than a cell,
and it's the reason the scheduler keeps Excel open.

### F4 — The ~70 shop-date columns have no cell home
In the sheet, each shop is a column and the cell is `MM/DD/YYYY` — that is *how the
scheduler schedules*: type a date under a shop, done. The app models this as
`PlanAssignment` / `CarShopEligibility` and surfaces it only as shop×month
aggregates in `PlanningGrid`. There is no per-car × per-shop date cell to type
into. Any credible replacement must reproduce this interaction (a car-row × shop
matrix, or a fast "schedule to shop on date" inline action).

### F5 — Export cannot reproduce the Master CSV (and is partly broken)
`exportCars()` emits a fixed 13-column generic set
(`vehicleNumber, carType, isTankCar, customer, commodity, status, currentLocation,
homeRegion, reasonShopped, projectedCost, daysInShop, lastServiceDate,
nextServiceDue`). It does **not** emit the canonical headers, does not preserve the
source quirks (`Commericial`, trailing spaces, `2026 Region`), and omits all shop
columns. Downstream consumers of the Master CSV would break on day one.
**Bug:** the export orders by and defaults to `vehicleNumber`, a field that does
not exist on the `Car` model (the field is `railcarNumber`) — so that `orderBy`
throws / the column exports empty. Export parity needs a dedicated
"emit Qual Planner Master" serializer built off `qualPlannerSchema` (which already
holds the exact headers), not the generic exporter.

### F6 — Qual-timing type mismatch (round-trip is lossy)
`qualPlannerSchema` types the timing columns (`Min (no lining)`, `Min w lining`,
`Rule 88B `, `Safety Relief`, `Service Equipment `, `Stub Sill`, `Tank Thickness`)
as **`year` (integer)**, and `Interior Lining` / `Tank Qualification` as
**`string`**. The `Car` model stores all of these as **`DateTime?`**. So the sheet
says "2026", the app stores a full date, and a re-export can't faithfully return
the original. Pin the intended type before building export parity, or the CSV you
emit won't match the CSV you ingested.

### F7 — Two identity models
The CSV keys on `Car Mark` (unique) and *also* carries separate `Mark`, `Number`,
`Mark2` columns. The app keys on `railcarNumber` (Mark+Number concatenated) with
separate `carMark`, `carNumber`, `mark2`. The mapping between "Car Mark" (CSV key)
and `railcarNumber` (app key) is ambiguous and should be pinned down — it's the
join that makes import *and* export round-trip correctly.

## What "win the spreadsheet" concretely requires

In priority order, smallest-to-largest:

1. **Fix the export bug (F5)** and add a `exportQualPlannerMaster()` serializer that
   emits `ALL_CANONICAL_HEADERS` verbatim (quirks preserved) + shop columns from
   `shopScheduledDates`. This is the safety bridge that makes switching reversible;
   it's mostly wiring against schema you already have.
2. **Settle the timing type (F6)** and the identity mapping (F7). One decision each;
   everything else depends on them.
3. **Turn `CarsPage` into a real grid (F2/F3):** show all ~40 columns (with column
   chooser), inline-edit any cell, keyboard nav, per-column filter/sort, bulk
   attribute edit. This is the switch-over feature.
4. **Add the shop-date matrix (F4):** a car-row × shop view where a cell is a
   scheduled date, mirroring the sheet's core interaction.
5. **Only then** lean on the things the sheet can't do — auto-computed
   `shoppingStatus`, validation on entry, live capacity — which are already partly
   built and are the reason to switch at all.

Items 1–2 are days of work against existing schema. Items 3–4 are the real build,
and they are what actually gets the scheduler to close the CSV.

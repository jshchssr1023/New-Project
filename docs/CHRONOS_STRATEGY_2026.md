# Chronos Strategy 2026 — Give It Back to the Scheduler

> Status: strategy memo / discussion draft
> Author context: written against the current codebase on branch `claude/chronos-scheduler-strategy`
> Date: 2026-07

## TL;DR

Chronos exists to **replace the Qual Planner** — the production
`Qual Planner Master.csv` spreadsheet a scheduler uses today to get the right
railcar to the right shop before its qualification deadline. That is the whole
job. But the app has grown well past it into an S&OP master-planning platform, a
customer-facing service-plan builder, an integration platform (API keys,
webhooks), and an admin suite.

That growth is the problem, not the achievement. Chronos has built features the
Qual Planner never had — **before it has fully won the job the Qual Planner does.**
The daily user still keeps the spreadsheet open in another tab. The strategic move
for 2026 is not to add intelligence on top of the platform. It is to **beat the
spreadsheet completely**, cut or defer everything that doesn't serve that, and
only then build anything the Qual Planner never did.

The one success metric: **does the scheduler close the CSV?**

## The evidence of scope creep

The surface area tells the story:

| Surface | Count | Serves the scheduler? |
|---------|-------|-----------------------|
| Frontend pages | 25 | ~5 core (Scheduling Dashboard/Queue, Cars, Planning Grid, Shop Management) |
| Backend services | 42 | ~8 core (shopping status, scheduler, allocation engine + validator, rule/lease engines, active assignments, shop history) |
| API route files | 25 | A minority; the rest are S&OP, service plans, reports, webhooks, API keys, permissions |
| Database tables | 42 | The scheduler touches ~10 |

Roughly **one-fifth** of the application is the scheduler's product. The other
four-fifths are S&OP planning (`SOP*`, `MasterPlan*`, `multiYearPlanning`),
customer service plans (`ServicePlan*`, `PlanOption*`), integration
(`apiKey`, `webhook`, `scheduledReport`), and platform plumbing (`permissions`,
`fieldSecurity`, `ssot*`). Each was a reasonable feature in isolation. Together
they buried the original job.

## What Chronos is replacing: the Qual Planner

The codebase makes the target explicit. `qualPlannerSchema.ts` is *auto-generated
from the production CSV* and preserves the source exactly — misspellings
(`Commericial`), trailing spaces (`Rule 88B `, `Service Equipment `), the
`2026 Region` column. There's a bulletproof header validator and a 1200-synonym
field mapper whose entire purpose is to ingest that one living spreadsheet.

Knowing the thing you're replacing is a **spreadsheet** changes the strategy more
than anything else in this memo, because a spreadsheet has three superpowers an
app usually *loses* to:

1. **Speed and total flexibility** — click any cell, sort/filter instantly,
   bulk-edit, paste a column, see everything at once. No dialogs, no permissions.
2. **Zero friction** — it's already open, everyone knows it, it never "loads."
3. **It's the master downstream too** — other people consume that CSV. Replacing
   it silently breaks them unless Chronos can *produce* the same file.

The scheduler will keep the spreadsheet open until Chronos is **strictly better**
on the spreadsheet's own terms. That yields three hard requirements that outrank
every platform feature:

- **Grid parity.** `PlanningGrid` must feel like a spreadsheet: fast inline edit,
  keyboard nav, instant client-side filter/sort, multi-select bulk actions. This
  is the single most important screen in the product and should be the best thing
  in it. If editing a cell is slower than Excel, the scheduler goes back to Excel.
- **Column parity.** Every column in the Master CSV needs a home and must be
  editable as fast as a cell. Import fidelity is already heavily invested — good;
  the gap is *edit* fidelity.
- **Export parity.** Chronos must be able to emit the `Qual Planner Master.csv`
  (same headers, same quirks) so downstream consumers don't break the day the
  scheduler switches. This is the bridge that makes the switch safe.

And then the part that earns the app its existence — the things the spreadsheet
**can't** do, which are the reason to switch at all:

- Compute `shoppingStatus`/urgency from the qual dates automatically — no manual
  formula drift, no stale "Urgent" flags.
- Validate on entry (bad shop for a lined DOT-117, capacity already full).
- Show shop capacity and prevent double-booking as you assign.
- Keep history and be genuinely multi-user — no more emailing `_v7_final.xlsx`.

Win those without losing the three superpowers, and the scheduler closes the CSV.

## The one job

Everything the scheduler does reduces to a single daily loop:

```
1. What's due?      → cars approaching a qualification deadline
2. Where is it?     → current location / status
3. Where can it go? → shops eligible (cert, hazmat, asset class) and with capacity
4. Commit it        → assign car → shop → month, before the deadline
5. Did it move?     → track it into and out of the shop
```

That's the product. A scheduler who can run this loop quickly, trust the data,
and never miss a deadline is fully served. Chronos already has every piece of
this — but the pieces are spread across pages and competing with features built
for other audiences.

## Keep / Cut / Defer

| Area | Verdict | Why |
|------|---------|-----|
| Cars + qualification due dates | **Keep — core** | The spine of the job |
| Shopping status / urgency scoring | **Keep — core** | "What's due" |
| Shop eligibility + capacity + allocation | **Keep — core** | "Where can it go" |
| Scheduling Dashboard / Queue / Planning Grid | **Keep — core** | The loop's home |
| Import/Export | **Keep — thin** | Data has to get in; keep it boring |
| S&OP master planning (SOP*, MasterPlan*, multi-year) | **Defer / separate** | A leadership planning function, not the scheduler's loop. Valuable, but it's a *different product* sharing the same data. Split it out rather than let it drive the schema. |
| Service Plan Builder + option comparison | **Defer / separate** | Customer/CSR-facing. Same argument. |
| API keys + webhooks + scheduled reports | **Cut for now** | Integration platform features with real maintenance cost and near-zero scheduler value at current scale |
| Field-level security, fine-grained permissions | **Simplify** | Weighty for the team size; a small role model likely suffices |
| SSOT-inside-the-app effort | **Redirect** | See below — reconcile against systems of record instead of perfecting an internal copy |

The point of the table is not to delete working code for its own sake. It's to
**stop letting non-scheduler features drive the roadmap, the schema, and the
scheduler's screen.** Split them into their own surface (or their own app) so
the core can move fast.

## The changes that *do* serve scheduling

From the broader list of possible improvements, these three directly make the
daily loop better and are worth doing. The rest (full constrained-optimization
solver, planner copilot, telematics) are attractive but are platform bets —
defer them until the core is tight.

### 1. Location and status should be *fed*, not *typed*
`currentLocation` is free text and `status` is a planner-maintained enum. In the
real world those already exist as data — Railinc **CLM** for movement, **UMLER**
for car characteristics, plus FMS. Every minute a scheduler spends retyping what
another system knows is waste and a source of stale data. Make Chronos a decision
layer on top of live feeds. This single change removes the largest chunk of
manual work from the loop.

### 2. Derive due dates from the rules, don't store nine nullable dates
The nine qualification date fields on `Car` are the spine of the business, yet
they're imported values that silently drift. Encode the regulatory intervals
(49 CFR 180.509, AAR Rule 88, SRV, lining cycles) as a **rule library** and
*compute* next-due from `last-qual + car spec`. A due date can then never be
stale, and an interval change is a one-line edit instead of a 30,000-row
migration. This is the most self-contained high-value build and the best place
to prove the "intelligent engine" thesis without adding surface area.

### 3. Reconcile against the systems of record
There's a whole SSOT rescue plan in `/docs`. In your world the sources of truth
live in UMLER/CLM/FMS/SAP. The win isn't a cleaner SSOT *inside* Chronos — it's a
reconciliation view that flags where Chronos disagrees with the system of record
and why. Effort spent perfecting an internal copy is effort spent defending a
copy.

## Sequencing

The goal of the sequence is a single milestone: **the scheduler closes the CSV.**
Everything before that milestone is priority; everything after is optional.

1. **Draw the line.** Agree what is "the Qual Planner replacement" vs. everything
   else. Move the everything-else (S&OP, service plans, integrations) behind a
   clear boundary — separate nav, separate deploy, or separate app — so it stops
   driving the core and the schema.
2. **Win the spreadsheet.** Grid parity + column parity + export parity in
   `PlanningGrid`, plus the four things the sheet can't do (auto status,
   validation, capacity, history). This is the switch-over milestone.
3. **Rule-derived due dates (#2).** Self-contained, kills stale-flag drift, and is
   the first thing that makes Chronos *more trustworthy* than the CSV rather than
   just equivalent.
4. **Live feeds for location/status (#1).** Removes the biggest remaining manual
   burden and the last reason to look elsewhere for "where is the car."
5. **Reconciliation view (#3).** Makes the data trustworthy end to end.
6. *Only then* revisit the bigger bets (optimizer, copilot, telematics) — now on a
   tight core the scheduler already lives in.

## Open questions that change the plan

- **~~Replace vs. integrate~~ — settled.** Chronos replaces the Qual Planner
  spreadsheet. Open sub-question: does it also become the *master* the downstream
  CSV consumers read from (export parity, above), or do those consumers migrate
  too? Answer decides how long export parity must be maintained.
- **Primary user:** If it's genuinely the scheduler, the cuts above are right. If
  leadership has quietly made S&OP the primary use, that's a different product and
  we should name it as such and split it — not blend it back into the scheduler's
  screen.
- **Team size / maintenance budget:** The platform features (API keys, webhooks,
  field security, SSOT batch jobs) carry ongoing cost. What is the team that has
  to keep them alive?

The through-line: **the product forgot what it was replacing.** 2026 is the year
to remember — beat the Qual Planner spreadsheet completely, make that daily loop
excellent, and let the planning and customer-facing functions live as their own
deliberate products rather than accreted weight on the core.

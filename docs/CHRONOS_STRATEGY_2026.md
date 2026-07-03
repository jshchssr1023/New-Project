# Chronos Strategy 2026 — Give It Back to the Scheduler

> Status: strategy memo / discussion draft
> Author context: written against the current codebase on branch `claude/chronos-scheduler-strategy`
> Date: 2026-07

## TL;DR

Chronos began life as a **scheduling tool** — a way for a scheduler to get the
right railcar to the right shop before its qualification deadline. It has since
grown into an S&OP master-planning platform, a customer-facing service-plan
builder, an integration platform (API keys, webhooks), and an admin suite.

That growth is the problem, not the achievement. The daily user — the
**scheduler** — now works a small corner of a large application built mostly
for other people. The strategic move for 2026 is not to add intelligence on top
of the platform. It is to **refocus the product on the scheduler's job**, cut or
defer everything that doesn't serve it, and then make that one job excellent.

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

1. **Draw the line.** Agree what is "the scheduler's product" vs. everything else.
   Move the everything-else behind a clear boundary (separate nav, separate
   deploy target, or separate app) so it stops driving the core.
2. **Rule-derived due dates (#2).** Self-contained, proves the engine thesis,
   kills a class of data-integrity bugs.
3. **Live feeds for location/status (#1).** Removes the biggest manual burden.
4. **Reconciliation view (#3).** Makes the data trustworthy end to end.
5. *Only then* revisit the bigger bets (optimizer, copilot, telematics) — now on
   a tight core with trustworthy data.

## Open questions that change the plan

- **Replace vs. integrate:** Is Chronos meant to *replace* an internal
  tool/spreadsheet, or *integrate with* SAP/Railinc/FMS as systems of record?
  This decides how much of the schema Chronos should even own.
- **Primary user:** If it's genuinely the scheduler, the cuts above are right. If
  leadership has quietly made S&OP the primary use, that's a different product and
  we should name it as such and split it — not blend it back into the scheduler's
  screen.
- **Team size / maintenance budget:** The platform features (API keys, webhooks,
  field security, SSOT batch jobs) carry ongoing cost. What is the team that has
  to keep them alive?

The through-line: **the product forgot who it was for.** 2026 is the year to
remember — return it to the scheduler, make the daily loop excellent, and let the
planning and customer-facing functions live as their own deliberate products
rather than accreted weight on the core.

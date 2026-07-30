# AI Routine Draft and Review - Plan Brief

> Full plan: `context/changes/ai-routine-draft-and-review/plan.md`

## What & Why

This slice adds an AI assistant to the existing AM/PM routine editor. It can build a first routine from products already on the shelf or review a manually edited draft, explain its choices, identify missing steps, and recommend suitable products from the application's own catalog.

The goal is a complete but controlled flow: the user gets practical next actions without AI silently adding products or changing the saved routine.

## Starting Point

Shelfie already has a manual base-routine editor and cached per-user product-fit interpretations. Product fit is available even for a shared product that is not on the user's shelf, which makes personalized catalog recommendations possible without a second analysis model.

## Desired End State

The routine screen guides the user through visible stages: preparing shelf analyses, generating a proposal, and evaluating catalog options for missing steps. The result is a separate AM/PM proposal that the user can inspect, then deliberately replace and save through a confirmation modal.

When a shelf is incomplete, the app evaluates a bounded catalog subset and shows at most three products with a fresh `recommended` fit result for each missing step. If none qualifies, it says so plainly.

## Key Decisions Made

| Decision                   | Choice                                                   | Why                                                                                   |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Product-analysis readiness | Automatically prepare all shelf analyses, then generate  | The draft must use complete current context rather than silently omit products.       |
| Existing routine review    | Separate full proposal, then explicit apply and save     | The saved and manually edited routine remain safe until the user chooses replacement. |
| Catalog recommendations    | Existing catalog only, automatically analyzed            | Recommendations can be genuinely personalized without external shopping claims.       |
| Candidate threshold        | Fresh `recommended` products only                        | A recommendation should not mix clear matches with caveated or unsuitable products.   |
| Candidate action           | Add to shelf and transient proposal                      | It closes the flow while preserving explicit user control over persistence.           |
| Safety scope               | Reasons and missing steps only                           | Conflict and overuse warnings stay in the dedicated future S-06 slice.                |
| Proposal persistence       | Transient until confirmed save                           | The proposal is cleared only after the user confirms its replacement and save.        |
| Batch limits               | Three missing steps, twelve evaluated candidates maximum | Keeps latency and AI cost bounded.                                                    |

## Scope

**In scope:**

- AI draft and review of the existing base AM/PM routine.
- Automatic preparation and reuse of cached shelf-product analyses.
- A visible multi-stage UI with targeted failure and retry states.
- Missing-step explanations and up to three personalized catalog candidates per gap.
- Explicit candidate shelf addition and proposal replacement with an in-modal save.

**Out of scope:**

- AI-initiated routine saving without the user's explicit modal confirmation, proposal history, external product search, prices, or shopping.
- Per-product schedules, rotation, frequency, selected-day overrides, and routine-level conflict analysis.
- Database resets, background jobs, or a new persistence table for proposals.

## Architecture / Approach

`RoutineWorkspace` owns the manual draft and a separate transient AI proposal. It calls authenticated JSON endpoints that re-load the user's profile, shelf, and cached interpretations on the server. A dedicated routine prompt may only reference server-supplied shelf IDs; candidate discovery maps routine roles to existing product categories, evaluates a bounded subset through the established product-fit cache, and returns only recommended results.

## Phases at a Glance

| Phase                               | What it delivers                                                                    | Key risk                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| 1. Domain contract and discovery    | Strict proposal types, validation, category lookup, and bounded candidate selection | Invalid AI output or unbounded catalog work |
| 2. AI orchestration APIs            | Authenticated preparation, proposal, evaluation, and shelf-add operations           | Ownership and lifecycle mistakes            |
| 3. Routine workspace                | Controlled draft, visible stages, proposal comparison, and styled confirmation      | Losing manual draft state during refactor   |
| 4. Recommendations and verification | Candidate cards, transient proposal updates, and end-to-end validation              | Confusing persistence boundaries            |

**Prerequisites:** S-03 manual routine management and S-11 personalized product fit analysis are complete.
**Estimated effort:** Approximately 3-4 implementation sessions across four phases.

## Open Risks & Assumptions

- The shared catalog must contain sufficiently categorized products for useful candidate results; no-match is an expected, honest result.
- Initial use may take longer because missing shelf and candidate analyses require provider calls; cached fresh results make later runs shorter.
- A provider failure blocks that run intentionally, so the UI must preserve the manual draft and expose a stage-specific retry.

## Success Criteria (Summary)

- The user can obtain, compare, edit, and explicitly save an AI-supported AM/PM routine without a hidden persistence action.
- Every AI proposal references only owned shelf items; every catalog recommendation has a fresh personalized `recommended` interpretation.
- Failure, retry, no-match, and dirty-draft replacement cases work through the UI while browser URLs remain free of response messages.

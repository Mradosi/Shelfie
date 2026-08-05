# Routine Warnings and Guidance - Plan Brief

> Full plan: `context/changes/routine-warnings-and-guidance/plan.md`

## What & Why

This slice adds a calm, actionable guidance layer to a user's existing routine. It shows product-specific cautions already produced by the personalized product-fit analysis, flags a limited form of treatment/exfoliation accumulation, and clearly says when product analysis is incomplete.

The result helps a user notice what deserves a closer look while preserving the current product boundary: Shelfie informs and links to the relevant context, but never diagnoses, blocks a routine, or changes it automatically.

## Starting Point

The application already stores ordered AM/PM routine entries, user shelf membership, and cached per-user product interpretations with lifecycle status and structured warnings. `/today` is a read-only current-day projection, while `RoutineWorkspace` holds an editable local routine draft.

## Desired End State

`/routine` displays full guidance that updates immediately as the user edits an unsaved draft. `/today` displays a compact version for only the steps that apply today. Both use the same deterministic projection, product-detail links, and advisory wording.

## Key Decisions Made

| Decision         | Choice                                                                      | Why                                                                 |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Evidence source  | Cached interpretation data and deterministic rules                          | Avoids repeated AI work, cost, and inconsistent advice.             |
| Display          | Full on `/routine`, compact on `/today`                                     | Supports both correction and daily use.                             |
| Save behavior    | Informational only                                                          | Guidance must not become an implicit medical or blocking system.    |
| Initial rules    | Stored product warnings plus repeated `treat`/`exfoliate` per AM/PM section | Useful MVP signal without ingredient-conflict claims.               |
| Missing analysis | Neutral incomplete state                                                    | Does not conceal uncertainty or invent risk.                        |
| Draft updates    | Pure local recomputation                                                    | Shows the consequence of edits before save without AI or a request. |
| Persistence      | Derived read model only                                                     | Keeps the result fresh and avoids invalidation complexity.          |
| Verification     | Sync, lint, build, and manual UI acceptance                                 | Matches the project's current no-test-runner policy.                |

## Scope

**In scope:**

- Advisory product warnings on `/routine` and `/today`.
- Role-level accumulation for repeated treatment or exfoliation steps in one section.
- Neutral visibility for missing, pending, failed, or stale product analyses.
- Live guidance updates for local routine drafts and links to product details or routine editing.

**Out of scope:**

- AI calls, migration, stored reports, acknowledgement history, notifications, and automatic routine changes.
- Ingredient-level interaction detection, frequency guidance, medical claims, and schedules beyond the current day.

## Architecture / Approach

`routine-guidance.ts` owns a pure, serializable projection over routine entries and cached interpretation inputs. Pages perform one user-scoped batch read to assemble inputs. The same function runs for server snapshots and in `RoutineWorkspace` for live draft updates; a reusable presentational panel renders full or compact output.

## Phases at a Glance

| Phase                    | What it delivers                                                | Key risk                                   |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------ |
| 1. Domain and read model | Deterministic guidance contract and batch interpretation lookup | Accidental provider work or N+1 reads      |
| 2. Server projections    | Fresh saved-routine and today snapshots                         | Making an advisory read block a core page  |
| 3. UI and live updates   | Shared panel plus pre-save feedback                             | Divergence between server and client rules |
| 4. Acceptance            | Regression matrix and documented manual check                   | Missing a cross-flow regression            |

**Prerequisites:** S-04 and S-05 are archived; cached product-fit interpretations and AM/PM routine storage are available.
**Estimated effort:** About 2-3 implementation sessions across four phases.

## Open Risks & Assumptions

- Existing product warning codes are provider-generated; this slice presents them rather than assigning new medical meaning.
- The first accumulation rule is intentionally broad and advisory. Ingredient-level conflicts remain outside scope.
- The project has no shared test runner, so deterministic domain coverage is deferred until that foundation exists.

## Success Criteria (Summary)

- Guidance is consistent between saved routine, live draft, and today's schedule while using no new AI call or persistence.
- A user can understand affected products and take a voluntary next action without being blocked.
- Missing analysis is visible as uncertainty, and normal save, reset, AI proposal, product details, and clean URLs continue to work.

---
project: Shelfie
version: 1
status: draft
created: 2026-05-28
updated: 2026-07-19
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
---

# Roadmap: Shelfie

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Shelfie ma pomóc użytkownikowi uporządkować pielęgnację na bazie jego realnych produktów, a nie ogólnych porad. Najpierw musi więc zrozumieć kontekst skóry, przyjąć produkty do półki, ręcznie ułożyć pierwszą bazową rutynę i dopiero potem przyspieszać ten przepływ draftem AI oraz codziennym użyciem, bo wtedy użytkownik widzi, że aplikacja pomaga podjąć decyzję, zamiast tylko przechowywać notatki. Dla tej roadmapy oznacza to sekwencję zorientowaną na szybkie sprawdzenie, czy przepływ "moja półka -> moja bazowa rutyna -> moje dzisiejsze użycie" rzeczywiście daje pierwszy moment wartości, zanim dołożymy AI jako akcelerator.

## North star

**S-03: First manual routine management** — to najmniejszy przepływ, który pozwala ręcznie ułożyć, edytować i usunąć bazową rutynę z realnych produktów użytkownika, przygotowując grunt pod codzienne użycie.

> Here, "north star" means the smallest end-to-end slice whose successful delivery would show that the product truly helps the user with its main job, so it is scheduled as early as its prerequisites allow.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                                                                                                | Prerequisites    | PRD refs                                                                           | Status   |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- | -------- |
| F-01 | user-domain-persistence-contract   | (foundation) minimal persistence contract for skin profile, shelf items, product schedules, and routine configuration is in place   | —                | Business Logic, Access Control, Non-Functional Requirements (privacy, persistence) | done     |
| F-02 | shared-product-provenance-contract | (foundation) shared product and provenance contract is in place for confirmed product reuse                                         | —                | FR-004, Non-Functional Requirements (inci_source, inci_confidence)                 | ready    |
| S-01 | first-skin-profile                 | user can sign in, provide skin context, and finish onboarding with an empty shelf ready for products                                | F-01             | US-01, FR-001, FR-002                                                              | done     |
| S-02 | first-product-intake               | user can add the first product to their shelf from shared sources or AI/manual fallback and confirm it before save                  | F-01, F-02, S-01 | US-01, FR-003, FR-004, FR-005, FR-016, FR-017                                      | done     |
| S-10 | ai-web-search-source-self-healing  | user can rely on AI web search fallback to retry dead product URLs automatically instead of failing on the first broken source      | S-02             | FR-004, FR-016, FR-017                                                              | proposed |
| S-03 | first-manual-routine-management    | user can create, edit, and delete the first base AM/PM routine from owned products and assigned routine roles                      | S-01, S-02       | US-01, FR-008, FR-009, FR-010                                                      | done     |
| S-11 | personalized-product-fit-analysis  | user can open any known product's details and see a cached AI analysis of how it fits their skin profile                         | S-01, S-02, F-02 | US-01, FR-010                                                                      | done     |
| S-13 | shelf-catalog-and-navigation       | user can browse their shelf, open product details, and move through the core product-to-routine flow from one clear navigation     | S-02, S-11      | US-01, FR-003, FR-008, FR-009                                                      | done     |
| S-12 | ingredient-details-and-glossary    | user can expand an INCI ingredient on product details and read a cached, plain-language description of its cosmetic role and caveats | S-11, F-02      | FR-004, FR-010                                                                      | proposed |
| S-04 | ai-routine-draft-and-review        | user can ask AI for a base-routine draft or improvement suggestions, then review and edit the result before save                    | S-03, S-11       | US-01, FR-008, FR-010                                                              | proposed |
| S-05 | todays-routine-consumption         | user can view today's AM/PM routine from the saved base configuration and make lightweight one-off usage edits from routine screens | S-03             | US-01, FR-009                                                                      | proposed |
| S-09 | day-specific-routine-overrides     | user can override selected weekdays without rebuilding the shared base AM/PM routine                                                | S-05             | US-01, FR-009                                                                      | proposed |
| S-06 | routine-warnings-and-guidance      | user can review soft warnings about conflicts or overuse, plus product-role and missing-step guidance while adjusting routine usage | S-04, S-05       | US-01, FR-010, FR-011                                                              | proposed |
| S-07 | shelf-notes-and-skin-checkins      | user can manage the shelf with notes/reactions and log a quick skin check-in for later guidance                                     | S-05             | US-01, FR-006, FR-007, FR-012                                                      | proposed |
| S-08 | mobile-first-pwa-flow              | user can use the core shelf and routine flow comfortably on mobile and as a PWA                                                     | S-05             | FR-015                                                                             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                                      | Note                                                                                                                                                     |
| ------ | ----------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Core routine loop       | `F-01` → `S-01` → `S-02` → `S-03` → `S-05` | This is the main market-feedback path; `S-05` is the first daily-consumption checkpoint after the user proves they can manage a base routine without AI. |
| B      | AI assistance layer     | `F-02` → `S-11` → `S-04` → `S-06`          | This stream first establishes per-user product interpretation, then lets AI use that cached understanding to draft and explain routines more consistently. |
| G      | Ingredient explainability | `F-02` → `S-11` → `S-12`                  | This extension makes existing INCI lists understandable through a shared, cacheable ingredient glossary without adding per-click AI calls. |
| H      | Shelf navigation         | `S-02` → `S-11` → `S-13` → `S-07`         | This stream turns stored shelf membership into a usable product hub before adding notes, reactions, or check-ins. |
| F      | Intake resilience       | `S-02` → `S-10`                            | This slice hardens the existing AI web search fallback so broken source URLs trigger bounded self-healing retries instead of user-visible dead-end errors. |
| C      | Weekly overrides        | `S-05` → `S-09`                            | This extension adds selected-day flexibility only after the base routine and today's routine have already proved their value.                             |
| D      | Post-routine adaptation | `S-07`                                     | This slice branches after `S-05` and keeps lightweight feedback separate from the core routine-validation path.                                          |
| E      | Mobile shell            | `S-08`                                     | This slice also branches after `S-05`, so mobile/PWA polish follows a proven daily-use loop.                                                             |

## Baseline

What's already in place in the codebase as of `2026-05-29` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands + Tailwind 4 are wired in the app shell and auth UI.
- **Backend / API:** partial — SSR app and auth route handlers exist, but product/routine domain endpoints do not.
- **Data:** partial — Supabase server client and local config exist, but there is no committed schema or migration contract yet.
- **Auth:** present — Supabase auth flows and `/dashboard` protection are already wired.
- **Deploy / infra:** present — Cloudflare Worker deployment path and CI are already configured.
- **Observability:** partial — platform observability is enabled, but app-level product/routine diagnostics are not yet defined.

## Foundations

### F-01: User domain persistence contract

- **Outcome:** (foundation) A minimal persistence contract exists for per-user skin context, shelf items, product schedules, and routine configuration, with ownership boundaries that match the authenticated single-user model. This is explicitly a shared domain contract for downstream slices, not a full backend buildout.
- **Change ID:** user-domain-persistence-contract
- **PRD refs:** Business Logic; Access Control; Non-Functional Requirements (privacy, persistence between sessions)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05; verification path for per-user persistence and editability
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This foundation must stop at the minimum shared contract needed by `S-01` through `S-05`; if it grows into a full backend, full routine engine, or speculative data-layer redesign, the roadmap loses the fast path to first user value.
- **Status:** done

### F-02: Shared product provenance contract

- **Outcome:** (foundation) A minimal contract exists for shared product records, confirmed-product reuse, and provenance/confidence tracking for ingredient sources.
- **Change ID:** shared-product-provenance-contract
- **PRD refs:** FR-004; Non-Functional Requirements (AI fallback handling, `inci_source`, `inci_confidence`)
- **Unlocks:** S-02, S-04; disclaimer path for product-source confidence
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this foundation tries to solve every import source up front, product intake turns into a backend-first integration project instead of an enabler for the core user flow.
- **Status:** ready

## Slices

### S-01: First skin profile

- **Outcome:** user can sign in, provide basic skin context, and finish onboarding with a saved profile and an empty shelf ready for product intake.
- **Change ID:** first-skin-profile
- **PRD refs:** US-01, FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this slice starts carrying product intake responsibilities, the onboarding boundary stops being clean and `S-02` loses its role as the first true product-domain slice.
- **Status:** done

### S-02: First product intake

- **Outcome:** user can add the first product to their shelf via shared source lookup, AI/photo assistance, barcode lookup, or manual fallback, then confirm or correct it before save.
- **Change ID:** first-product-intake
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-016, FR-017
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This slice has to stay focused on trusted intake and the first persisted shelf item; if it expands into full routine logic, the roadmap collapses two risks into one oversized change.
- **Status:** done

### S-03: First manual routine management

- **Outcome:** user can manually create the first base AM/PM routine from owned products and their assigned routine roles, edit that routine later, and delete it when they want to rebuild from scratch, without authoring seven separate weekday plans.
- **Change ID:** first-manual-routine-management
- **PRD refs:** US-01, FR-008, FR-009, FR-010
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This slice has to stay focused on proving the user can manage a useful base routine without AI; if it absorbs AI assistance, selected-day overrides, or daily-consumption UX, the main validation signal gets blurred. The manual routine model must also stay compatible with later AI-created or AI-edited drafts, so `S-03` cannot introduce a manual-only structure that turns `S-04` or `S-09` into migration problems instead of additive slices.
- **Status:** done

### S-10: AI web-search source self-healing

- **Outcome:** user can complete AI web-search-assisted product intake even when the first AI-proposed source URL is dead, because the backend validates the candidate source, feeds structured retry context back into AI, and retries with a bounded number of alternate live sources before surfacing a fallback error.
- **Change ID:** ai-web-search-source-self-healing
- **PRD refs:** FR-004, FR-016, FR-017
- **Prerequisites:** S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Which non-success responses should count as retryable source failures in MVP (`404`, `403`, redirect loops, DNS errors, timeout, content mismatch)? — Owner: team. Block: no.
- **Risk:** If this slice turns into a general crawler, unrestricted agent loop, or full source-ranking engine, it will sprawl far beyond the narrow goal of making AI web search fallback resilient to the first broken URL. The implementation should stay bounded: candidate URL -> backend validation -> structured retry prompt -> limited retry count -> graceful fallback.
- **Status:** done

### S-11: Personalized product fit analysis

- **Outcome:** user can open the details of any known product, whether or not it is already on their shelf, and see a cached AI interpretation of how that product fits their skin profile, including a clear verdict, benefits, cautions, and warnings, without re-running the full analysis on every view.
- **Change ID:** personalized-product-fit-analysis
- **PRD refs:** US-01, FR-010
- **Prerequisites:** S-01, S-02, F-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - Should routine AI wait for missing or stale product interpretations, or proceed in a visibly degraded mode when some shelf products have not been analyzed yet? — Owner: team. Block: S-04.
- **Risk:** This slice must define the per-user product-interpretation contract and lifecycle without drifting into full routine generation, full conflict detection, or medical-style product scoring. If it stores only raw prose instead of structured fields plus short explanations, later slices will re-run AI unnecessarily or rebuild a second interpretation layer beside it.
- **Status:** done

### S-13: Shelf catalog and navigation

- **Outcome:** user can open a user-facing “Moja półka” catalog of owned products, move from each item to the canonical product details page, add or remove products from that shelf, and use a clear global navigation to move through the core `Panel → Półka → Produkt → Dodaj produkt / Rutyna` flow.
- **Change ID:** shelf-catalog-and-navigation
- **PRD refs:** US-01, FR-003, FR-008, FR-009
- **Prerequisites:** S-02, S-11
- **Parallel with:** S-12, S-04
- **Blockers:** —
- **Unknowns:**
  - Which minimal shelf grouping or filtering is needed for the first useful catalog: no grouping, routine membership, product category, or a combination? — Owner: team. Block: no.
- **Risk:** This slice must establish only the core information architecture and shelf flow. If it absorbs notes, reactions, advanced filtering, analytics, mobile redesign, or routine recommendation logic, it becomes a broad application redesign instead of a clear navigation and catalog milestone.
- **Status:** done

### S-12: Ingredient details and glossary

- **Outcome:** user can expand any displayed INCI ingredient on a canonical product details screen and read a concise, plain-language explanation of its cosmetic role, likely benefits, and relevant caveats.
- **Change ID:** ingredient-details-and-glossary
- **PRD refs:** FR-004, FR-010
- **Prerequisites:** S-11, F-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Which shared ingredient source should supply the initial glossary and what fields can be treated as trustworthy enough for user-facing copy? — Owner: team. Block: no.
  - Should missing ingredient entries use a bounded on-demand enrichment flow or show a transparent “description unavailable” state in MVP? — Owner: team. Block: no.
- **Risk:** This slice must keep ingredient knowledge shared and cacheable by normalized INCI name. If every click invokes AI, the details screen becomes slow, costly, and inconsistent; if it becomes a full ingredient-science database, it will delay the core product and routine flows.
- **Status:** proposed

### S-04: AI routine draft and review

- **Outcome:** user can ask AI to draft the base routine from owned products and skin context, review missing-step or product-role suggestions, and accept or edit the result before saving it into the same base-routine model.
- **Change ID:** ai-routine-draft-and-review
- **PRD refs:** US-01, FR-008, FR-010
- **Prerequisites:** S-03, S-11
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - How should routine drafting behave when a shelf contains a mix of `ready`, `stale`, and missing product interpretations? — Owner: team. Block: no.
- **Risk:** This slice should improve or accelerate a manual routine the user already understands; if it becomes the place where product interpretation is recomputed ad hoc instead of consuming the cached per-user analysis from `S-11`, the system will duplicate AI work and drift between product-details guidance and routine guidance.
- **Status:** proposed

### S-05: Today's routine consumption

- **Outcome:** user can open today's AM/PM routine from the saved base configuration, understand what belongs in the current view, and make one-off usage edits from the routine screen without redefining the base routine.
- **Change ID:** todays-routine-consumption
- **PRD refs:** US-01, FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without a separate consumption slice, the MVP can organize a routine on paper but still fail the daily-use test that the product depends on.
- **Status:** proposed

### S-09: Day-specific routine overrides

- **Outcome:** user can keep one shared base AM/PM routine for the full week, then override selected weekdays when a specific day should differ from the baseline without rebuilding the whole routine.
- **Change ID:** day-specific-routine-overrides
- **PRD refs:** US-01, FR-009
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this slice grows into a general overlay engine, routine version history, or temporary-protocol framework, it will absorb complexity that the MVP explicitly tries to postpone.
- **Status:** proposed

### S-06: Routine warnings and guidance

- **Outcome:** user can review lightweight warnings about conflicts or overuse, plus product-role and missing-step guidance, while adjusting routine usage.
- **Change ID:** routine-warnings-and-guidance
- **PRD refs:** US-01, FR-010, FR-011
- **Prerequisites:** S-04, S-05
- **Parallel with:** S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - How should conflict detection be split between deterministic rules and AI explanations in the MVP warning flow? — Owner: team. Block: no.
- **Risk:** If this slice becomes a hard validation engine instead of soft guidance, it will consume disproportionate effort for a secondary success criterion.
- **Status:** proposed

### S-07: Shelf notes and skin check-ins

- **Outcome:** user can manage the shelf after routine generation by adding notes/reactions to products and logging a quick skin check-in for future adjustments.
- **Change ID:** shelf-notes-and-skin-checkins
- **PRD refs:** US-01, FR-006, FR-007, FR-012
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this slice drifts into heavy analytics or journaling, it stops being lightweight support for adaptation and becomes a different product surface.
- **Status:** proposed

### S-08: Mobile-first PWA flow

- **Outcome:** user can complete the core shelf-and-routine journey comfortably on mobile and install it as a lightweight PWA.
- **Change ID:** mobile-first-pwa-flow
- **PRD refs:** FR-015
- **Prerequisites:** S-05
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this ships before the core routine flow stabilizes, the team will polish the shell before learning whether the core behavior deserves polishing.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                                   | Ready for `/10x-plan` | Notes                                                                                               |
| ---------- | ---------------------------------- | ----------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| F-01       | user-domain-persistence-contract   | Define minimal user-domain persistence contract                         | yes                   | Smallest cross-cutting enabler for profile, shelf, and routine persistence.                         |
| F-02       | shared-product-provenance-contract | Define shared product provenance contract                               | yes                   | Can run in parallel with F-01; keep scope to reusable product intake contracts.                     |
| S-01       | first-skin-profile                 | Save initial skin profile and empty-shelf onboarding state              | no                    | Wait for F-01.                                                                                      |
| S-02       | first-product-intake               | Ship first confirmed product intake flow onto the shelf                 | no                    | Wait for F-01, F-02, and S-01.                                                                      |
| S-10       | ai-web-search-source-self-healing  | Add bounded retry + source validation for AI web-search product intake  | yes                   | Extends `S-02` by retrying dead AI-proposed URLs instead of failing immediately; keep scope to self-healing of the existing fallback path. |
| S-03       | first-manual-routine-management    | Ship first manual base-routine management flow from owned products      | yes                   | Manual scope settled: one base AM/PM routine applies across the week; selected-day overrides stay in a later slice. |
| S-11       | personalized-product-fit-analysis  | Add cached per-user product interpretation and product-details analysis | no                    | Implemented; archive before starting a new change.                                                    |
| S-13       | shelf-catalog-and-navigation       | Add a “Moja półka” catalog and core product navigation                  | yes                   | All prerequisites are complete; keep scope to catalog, details links, shelf membership actions, and primary navigation. |
| S-12       | ingredient-details-and-glossary    | Add expandable, cached ingredient descriptions on product details       | yes                   | All prerequisites are complete; use shared ingredient records keyed by normalized INCI name, not AI calls on click. |
| S-04       | ai-routine-draft-and-review        | Add AI draft and review flow on top of the manual base-routine model    | yes                   | All prerequisites are complete; this should accelerate, not replace, manual routine management.      |
| S-05       | todays-routine-consumption         | Ship today's AM/PM routine consumption flow from the saved base routine | yes                   | All prerequisites are complete; this is the first daily-use slice.                                   |
| S-09       | day-specific-routine-overrides     | Add selected-day overrides on top of the shared base AM/PM routine      | no                    | Wait for S-05 so overrides extend a proven base-and-today flow instead of expanding S-03.          |
| S-06       | routine-warnings-and-guidance      | Add soft routine warnings and guidance during routine use               | no                    | Wait for S-04 and S-05.                                                                             |
| S-07       | shelf-notes-and-skin-checkins      | Add shelf notes, reactions, and lightweight skin check-ins              | no                    | Wait for S-05.                                                                                      |
| S-08       | mobile-first-pwa-flow              | Polish the core flow for mobile and PWA use                             | no                    | Wait for S-05 so polish follows proven behavior.                                                    |

## Open Roadmap Questions

1. **How should conflict detection be split between deterministic rules and AI explanations?** — Owner: team. Block: S-06.
2. **How should AI-assisted routine editing and later selected-day overrides interact with the shared base AM/PM model?** — Owner: team. Block: S-04, S-09.
3. **When some shelf products lack a fresh personalized interpretation, should routine AI block, auto-refresh first, or proceed in degraded mode with explicit lower confidence?** — Owner: team. Block: S-04.

## Parked

- **Temporary short-term routine generation and apply flow (`FR-013`, `FR-014`)** — Why parked: PRD marks it as nice-to-have, and the chosen sequencing goal is to validate the core shelf-to-routine loop first.
- **Dermatological diagnosis or medical claims** — Why parked: PRD §Non-Goals keeps the MVP in skincare assistance, not medical advice.
- **Social or community features** — Why parked: PRD §Non-Goals keeps the product focused on one user's personal workflow.
- **Marketplace, shopping, or purchase integrations** — Why parked: PRD §Non-Goals excludes buying flows from the first value path.
- **Custom-built computer vision or enterprise OCR infrastructure** — Why parked: PRD §Non-Goals keeps product intake lightweight and confirmation-driven.
- **Facial analysis or progress-photo analysis** — Why parked: PRD §Non-Goals excludes visual skin evaluation.
- **Heavy tracking or analytics systems** — Why parked: PRD §Non-Goals and FR-012 keep feedback lightweight.
- **Complex overlay or merge routine engine** — Why parked: PRD §Non-Goals prefers simpler temporary handling over a full overlay model.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

- **F-01: (foundation) A minimal persistence contract exists for per-user skin context, shelf items, product schedules, and routine configuration, with ownership boundaries that match the authenticated single-user model. This is explicitly a shared domain contract for downstream slices, not a full backend buildout.** — Archived 2026-05-31 → `context/archive/2026-05-30-user-domain-persistence-contract/`. Lesson: —.
- **S-01: user can sign in, provide basic skin context, and finish onboarding with a saved profile and an empty shelf ready for product intake.** — Archived 2026-06-11 → `context/archive/2026-05-31-first-skin-profile/`. Lesson: —.
- **S-02: user can add the first product to their shelf from shared sources or AI/manual fallback and confirm it before save.** — Archived 2026-07-09 → `context/archive/2026-06-11-first-product-intake/`. Lesson: —.
- **S-03: user can manually create the first base AM/PM routine from owned products and their assigned routine roles, edit that routine later, and delete it when they want to rebuild from scratch, without authoring seven separate weekday plans.** — Archived 2026-07-12 → `context/archive/2026-07-09-first-manual-routine-management/`. Lesson: —.
- **S-11: user can open the details of any known product, whether or not it is already on their shelf, and see a cached AI interpretation of how that product fits their skin profile, including a clear verdict, benefits, cautions, and warnings, without re-running the full analysis on every view.** — Archived 2026-07-19 → `context/archive/2026-07-12-personalized-product-fit-analysis/`. Lesson: —.
- **S-13: user can open a user-facing “Moja półka” catalog of owned products, move from each item to the canonical product details page, add or remove products from that shelf, and use a clear global navigation to move through the core `Panel → Półka → Produkt → Dodaj produkt / Rutyna` flow.** — Archived 2026-07-19 → `context/archive/2026-07-19-shelf-catalog-and-navigation/`. Lesson: —.

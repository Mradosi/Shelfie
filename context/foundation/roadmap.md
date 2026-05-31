---
project: Shelfie
version: 1
status: draft
created: 2026-05-28
updated: 2026-05-31
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

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | user-domain-persistence-contract | (foundation) minimal persistence contract for skin profile, shelf items, product schedules, and routine configuration is in place | — | Business Logic, Access Control, Non-Functional Requirements (privacy, persistence) | done |
| F-02 | shared-product-provenance-contract | (foundation) shared product and provenance contract is in place for confirmed product reuse | — | FR-004, Non-Functional Requirements (inci_source, inci_confidence) | ready |
| S-01 | first-skin-profile | user can sign in, provide skin context, and finish onboarding with an empty shelf ready for products | F-01 | US-01, FR-001, FR-002 | proposed |
| S-02 | first-product-intake | user can add the first product to their shelf from shared sources or AI/manual fallback and confirm it before save | F-01, F-02, S-01 | US-01, FR-003, FR-004, FR-005, FR-016, FR-017 | proposed |
| S-03 | first-manual-routine-management | user can create, edit, and delete the first base routine from owned products and assigned routine roles | S-01, S-02 | US-01, FR-008, FR-009, FR-010 | proposed |
| S-04 | ai-routine-draft-and-review | user can ask AI for a base-routine draft or improvement suggestions, then review and edit the result before save | F-02, S-03 | US-01, FR-008, FR-010 | proposed |
| S-05 | todays-routine-consumption | user can view today's AM/PM routine from the saved base configuration and make lightweight one-off usage edits from routine screens | S-03 | US-01, FR-009 | proposed |
| S-06 | routine-warnings-and-guidance | user can review soft warnings about conflicts or overuse, plus product-role and missing-step guidance while adjusting routine usage | S-04, S-05 | US-01, FR-010, FR-011 | proposed |
| S-07 | shelf-notes-and-skin-checkins | user can manage the shelf with notes/reactions and log a quick skin check-in for later guidance | S-05 | US-01, FR-006, FR-007, FR-012 | proposed |
| S-08 | mobile-first-pwa-flow | user can use the core shelf and routine flow comfortably on mobile and as a PWA | S-05 | FR-015 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | Core routine loop | `F-01` → `S-01` → `S-02` → `S-03` → `S-05` | This is the main market-feedback path; `S-05` is the first daily-consumption checkpoint after the user proves they can manage a base routine without AI. |
| B | AI assistance layer | `F-02` → `S-04` → `S-06` | This stream joins the core loop after `S-03` and tests whether AI improves a routine the user can already manage manually. |
| C | Post-routine adaptation | `S-07` | This slice branches after `S-05` and keeps lightweight feedback separate from the core routine-validation path. |
| D | Mobile shell | `S-08` | This slice also branches after `S-05`, so mobile/PWA polish follows a proven daily-use loop. |

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
- **Status:** proposed

### S-02: First product intake

- **Outcome:** user can add the first product to their shelf via shared source lookup, AI/photo assistance, barcode lookup, or manual fallback, then confirm or correct it before save.
- **Change ID:** first-product-intake
- **PRD refs:** US-01, FR-003, FR-004, FR-005, FR-016, FR-017
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This slice has to stay focused on trusted intake and the first persisted shelf item; if it expands into full routine logic, the roadmap collapses two risks into one oversized change.
- **Status:** proposed

### S-03: First manual routine management

- **Outcome:** user can manually create the first base routine from owned products and their assigned routine roles, edit that routine later, and delete it when they want to rebuild from scratch.
- **Change ID:** first-manual-routine-management
- **PRD refs:** US-01, FR-008, FR-009, FR-010
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This slice has to stay focused on proving the user can manage a useful base routine without AI; if it absorbs AI assistance or daily-consumption UX, the main validation signal gets blurred. The manual routine model must also stay compatible with later AI-created or AI-edited drafts, so `S-03` cannot introduce a manual-only structure that turns `S-04` into a migration problem instead of an additive slice.
- **Status:** proposed

### S-04: AI routine draft and review

- **Outcome:** user can ask AI to draft the base routine from owned products and skin context, review missing-step or product-role suggestions, and accept or edit the result before saving it into the same base-routine model.
- **Change ID:** ai-routine-draft-and-review
- **PRD refs:** US-01, FR-008, FR-010
- **Prerequisites:** F-02, S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - How much of the per-user AI interpretation cache must land with the first AI-assist slice versus immediately after it? — Owner: team. Block: no.
- **Risk:** This slice should improve or accelerate a manual routine the user already understands; if it becomes the only workable path, the team loses the ability to tell whether the value comes from the routine model or only from the AI layer.
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

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
|---|---|---|---|---|
| F-01 | user-domain-persistence-contract | Define minimal user-domain persistence contract | yes | Smallest cross-cutting enabler for profile, shelf, and routine persistence. |
| F-02 | shared-product-provenance-contract | Define shared product provenance contract | yes | Can run in parallel with F-01; keep scope to reusable product intake contracts. |
| S-01 | first-skin-profile | Save initial skin profile and empty-shelf onboarding state | no | Wait for F-01. |
| S-02 | first-product-intake | Ship first confirmed product intake flow onto the shelf | no | Wait for F-01, F-02, and S-01. |
| S-03 | first-manual-routine-management | Ship first manual base-routine management flow from owned products | no | Wait for S-01 and S-02; clarify the boundary of manual routine management in US-01 before planning. |
| S-04 | ai-routine-draft-and-review | Add AI draft and review flow on top of the manual base-routine model | no | Wait for F-02 and S-03; this should accelerate, not replace, manual routine management. |
| S-05 | todays-routine-consumption | Ship today's AM/PM routine consumption flow from the saved base routine | no | Wait for S-03; this is the first daily-use slice. |
| S-06 | routine-warnings-and-guidance | Add soft routine warnings and guidance during routine use | no | Wait for S-04 and S-05. |
| S-07 | shelf-notes-and-skin-checkins | Add shelf notes, reactions, and lightweight skin check-ins | no | Wait for S-05. |
| S-08 | mobile-first-pwa-flow | Polish the core flow for mobile and PWA use | no | Wait for S-05 so polish follows proven behavior. |

## Open Roadmap Questions

1. **How should conflict detection be split between deterministic rules and AI explanations?** — Owner: team. Block: S-06.
2. **What are the acceptance criteria for US-01, especially where manual routine management ends and AI assistance begins?** — Owner: user. Block: S-03, S-04.

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

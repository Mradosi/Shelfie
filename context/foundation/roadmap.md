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

Shelfie ma pomóc użytkownikowi uporządkować pielęgnację na bazie jego realnych produktów, a nie ogólnych porad. Najpierw musi więc zrozumieć kontekst skóry, przyjąć produkty do półki, zbudować bazową konfigurację użycia i dopiero z niej wygenerować dzisiejszą rutynę, bo wtedy użytkownik widzi, że aplikacja pomaga podjąć decyzję, zamiast tylko przechowywać notatki. Dla tej roadmapy oznacza to sekwencję zorientowaną na szybkie sprawdzenie, czy przepływ "moja półka -> moja dzisiejsza rutyna" rzeczywiście daje pierwszy moment wartości.

## North star

**S-03: First personalized routine** — to najmniejszy przepływ, który buduje bazową logikę rutyny z prawdziwych produktów użytkownika i jego kontekstu skóry, przygotowując grunt pod codzienne użycie.

> Here, "north star" means the smallest end-to-end slice whose successful delivery would show that the product truly helps the user with its main job, so it is scheduled as early as its prerequisites allow.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
|---|---|---|---|---|---|
| F-01 | user-domain-persistence-contract | (foundation) minimal persistence contract for skin profile, shelf items, product schedules, and routine configuration is in place | — | Business Logic, Access Control, Non-Functional Requirements (privacy, persistence) | done |
| F-02 | shared-product-provenance-contract | (foundation) shared product and provenance contract is in place for confirmed product reuse | — | FR-004, Non-Functional Requirements (inci_source, inci_confidence) | ready |
| S-01 | first-skin-profile | user can sign in, provide skin context, and finish onboarding with an empty shelf ready for products | F-01 | US-01, FR-001, FR-002 | proposed |
| S-02 | first-product-intake | user can add the first product to their shelf from shared sources or AI/manual fallback and confirm it before save | F-01, F-02, S-01 | US-01, FR-003, FR-004, FR-005, FR-016, FR-017 | proposed |
| S-03 | first-personalized-routine | user can get the first personalized base routine configuration from owned products and skin context | S-01, S-02 | US-01, FR-002, FR-008, FR-010 | blocked |
| S-04 | todays-routine-consumption | user can view today's AM/PM routine generated from product schedules and make lightweight one-off usage edits from routine screens | S-03 | US-01, FR-009 | proposed |
| S-05 | routine-warnings-and-guidance | user can review soft warnings, product roles, and missing-step guidance while adjusting routine usage | S-04 | US-01, FR-010, FR-011 | proposed |
| S-06 | shelf-notes-and-skin-checkins | user can manage the shelf with notes/reactions and log a quick skin check-in for later guidance | S-04 | US-01, FR-006, FR-007, FR-012 | proposed |
| S-07 | mobile-first-pwa-flow | user can use the core shelf and routine flow comfortably on mobile and as a PWA | S-04 | FR-015 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
|---|---|---|---|
| A | First value path | `F-01` → `S-01` → `S-02` → `S-03` → `S-04` → `S-05` / `S-06` / `S-07` | This is the main market-feedback path; `S-04` is the first daily-consumption checkpoint after profile, intake, and base routine logic land. |
| B | Product intake confidence | `F-02` → `S-02` | This keeps trusted product intake separate and feeds the north-star slice without front-loading the whole backend. |

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
- **Unlocks:** S-01, S-02, S-03, S-04; verification path for per-user persistence and editability
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This foundation must stop at the minimum shared contract needed by `S-01` through `S-04`; if it grows into a full backend, full routine engine, or speculative data-layer redesign, the roadmap loses the fast path to first user value.
- **Status:** done

### F-02: Shared product provenance contract

- **Outcome:** (foundation) A minimal contract exists for shared product records, confirmed-product reuse, and provenance/confidence tracking for ingredient sources.
- **Change ID:** shared-product-provenance-contract
- **PRD refs:** FR-004; Non-Functional Requirements (AI fallback handling, `inci_source`, `inci_confidence`)
- **Unlocks:** S-02, S-03; disclaimer path for product-source confidence
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

### S-03: First personalized routine

- **Outcome:** user can request and receive the first personalized base routine configuration from owned products and skin context, including scheduled product usage and initial product-role structure.
- **Change ID:** first-personalized-routine
- **PRD refs:** US-01, FR-002, FR-008, FR-010
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - How much of the per-user AI interpretation cache must land with the first routine slice versus immediately after it? — Owner: team. Block: no.
- **Risk:** This slice has to stop at generating a usable base configuration; if it also absorbs daily-consumption UX, it becomes too broad to validate the routine logic cleanly.
- **Status:** proposed

### S-04: Today's routine consumption

- **Outcome:** user can open today's AM/PM routine generated from configured product usage, understand what belongs in the current view, and make one-off usage edits from the routine screen without redefining the base routine.
- **Change ID:** todays-routine-consumption
- **PRD refs:** US-01, FR-009
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Without a separate consumption slice, the MVP can generate a routine on paper but still fail the daily-use test that the new product model depends on.
- **Status:** proposed

### S-05: Routine warnings and guidance

- **Outcome:** user can review lightweight warnings about conflicts or overuse, plus product-role and missing-step guidance, while adjusting routine usage.
- **Change ID:** routine-warnings-and-guidance
- **PRD refs:** US-01, FR-010, FR-011
- **Prerequisites:** S-04
- **Parallel with:** S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - How should conflict detection be split between deterministic rules and AI explanations in the MVP warning flow? — Owner: team. Block: no.
- **Risk:** If this slice becomes a hard validation engine instead of soft guidance, it will consume disproportionate effort for a secondary success criterion.
- **Status:** proposed

### S-06: Shelf notes and skin check-ins

- **Outcome:** user can manage the shelf after routine generation by adding notes/reactions to products and logging a quick skin check-in for future adjustments.
- **Change ID:** shelf-notes-and-skin-checkins
- **PRD refs:** US-01, FR-006, FR-007, FR-012
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If this slice drifts into heavy analytics or journaling, it stops being lightweight support for adaptation and becomes a different product surface.
- **Status:** proposed

### S-07: Mobile-first PWA flow

- **Outcome:** user can complete the core shelf-and-routine journey comfortably on mobile and install it as a lightweight PWA.
- **Change ID:** mobile-first-pwa-flow
- **PRD refs:** FR-015
- **Prerequisites:** S-04
- **Parallel with:** S-05, S-06
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
| S-03 | first-personalized-routine | Generate first personalized base routine configuration from owned products | no | Blocked by US-01 acceptance criteria and by S-01/S-02 completion. |
| S-04 | todays-routine-consumption | Ship today's generated AM/PM routine consumption flow | no | Wait for S-03; this is the first daily-use slice. |
| S-05 | routine-warnings-and-guidance | Add soft routine warnings and guidance during routine use | no | Wait for S-04. |
| S-06 | shelf-notes-and-skin-checkins | Add shelf notes, reactions, and lightweight skin check-ins | no | Wait for S-04. |
| S-07 | mobile-first-pwa-flow | Polish the core flow for mobile and PWA use | no | Wait for S-04 so polish follows proven behavior. |

## Open Roadmap Questions

1. **How should conflict detection be split between deterministic rules and AI explanations?** — Owner: team. Block: S-05.
2. **What are the acceptance criteria for US-01?** — Owner: user. Block: S-03.

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

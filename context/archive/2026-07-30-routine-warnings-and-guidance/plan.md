# Routine Warnings and Guidance Implementation Plan

## Overview

This slice adds an advisory routine-guidance layer to the saved routine and the editable draft. It reuses each user's cached product-fit interpretations to surface product-specific cautions, a limited role-level accumulation signal, and an honest incomplete-analysis state. It is informational only: the user can always save and use their routine.

## Current State Analysis

Product-fit analyses already persist per `(user_id, product_id)` with lifecycle status, structured `warnings`, and `cautionFor`. The routine model stores ordered AM/PM entries by `shelf_item_id` and role. `/today` renders a static projection of the current day, while `RoutineWorkspace` owns a live, unsaved draft in React. Neither screen currently loads a batch of product interpretations or calculates routine-level guidance.

## Desired End State

On `/routine`, the user sees a clear "Wskazówki do rutyny" panel that updates while they add, remove, reorder, or reassign draft entries. On `/today`, the user sees a compact version for only the AM/PM steps scheduled for the current day. Both variants identify relevant products, explain the advisory signal in plain Polish, link to product details or routine editing, and never use an error or response message in the URL.

### Key Discoveries:

- `UserProductInterpretation` already exposes lifecycle `status`, user-specific `warnings`, and `cautionFor`; warnings have a stable `code`, severity, and Polish message, while cautions carry a localized reason. `src/lib/domain/product-interpretation.ts:83`, `src/lib/domain/product-interpretation.ts:89`, `src/lib/domain/product-interpretation.ts:95`
- The existing `getUserProductInterpretation` helper is single-product oriented, so the new route projections need a bounded batch read rather than an N+1 loop. `src/lib/domain/product-interpretation.ts:342`
- The schedule preserves ordered `morning` and `evening` entries per day, and the same shelf item may legitimately occur more than once. `src/lib/domain/routine-schedule.ts:64`, `src/lib/domain/routine-schedule.ts:220`
- `/today` already reads `schedule[dayKey]`, which keeps its guidance correct after future selected-day overrides in S-09. `src/pages/today.astro:23`, `src/pages/today.astro:50`
- `RoutineWorkspace` owns `draft` locally and can safely run a pure client-side projection without persisting it or calling AI. `src/components/routine/RoutineWorkspace.tsx:108`, `src/components/routine/RoutineWorkspace.tsx:155`
- Product details already establish the visual language for `low`, `medium`, and `high` warning severity. `src/components/products/ProductInterpretationPanel.tsx:22`, `src/components/products/ProductInterpretationPanel.tsx:86`

## What We're NOT Doing

- No OpenRouter call, raw-INCI re-analysis, provider queue, background refresh, or new AI prompt.
- No ingredient-versus-ingredient conflict engine, medical diagnosis, treatment instruction, recommended frequency, selected-day schedule advice, or product safety guarantee.
- No persistence table, migration, history, acknowledgement state, notification, or analytics for routine warnings.
- No automatic removal, reordering, moving, or replacement of a routine entry.
- No warning for repeated `moisturize`, `cleanse`, or other generally non-specific roles; only repeated `treat` and `exfoliate` in the same AM or PM section count as the initial accumulation signal.
- No `supabase db reset`; this slice requires no migration. Any later schema work uses a migration and `npx supabase migration up` only.

## Implemented Refinement: Persisted Full-Routine AI Assessment

The original live `/routine` guidance panel is superseded. It mixed product-level fit signals with an incomplete deterministic routine projection, so it could disagree with the AI assessment of a complete AM/PM combination.

- `/routine` now shows only a persisted AI assessment of the full saved base routine. The AI receives the current routine entries, their roles, the complete INCI for every product used in the routine, the current profile, and current product-fit context.
- The model returns structured findings with a section, referenced shelf items, exact INCI ingredient citations, severity, explanation, and a non-prescriptive recommendation. The backend rejects a finding if it references a product outside that AM/PM section or an ingredient absent from that product's supplied INCI.
- `user_routine_assessments` stores the latest result per user with an SHA-256 input fingerprint. The fingerprint covers profile data, ordered routine entries and roles, product INCI data, and the versions of the product-fit analyses used as context.
- On entry, a stored assessment is displayed only when its fingerprint exactly matches the saved routine's current inputs. A changed routine, profile, INCI, or product-fit analysis makes it stale and prompts an explicit refresh. The obsolete result is not shown as current.
- AI assessments are generated only for a saved routine. Local editor changes disable the action until the user explicitly saves them. Applying an AI proposal saves the new routine and marks the old assessment stale, so the new configuration is checked explicitly afterward.
- Product-level signals remain on `/today` only, behind the per-product `Uwaga` modal, and on product details. They are not presented as a substitute for whole-routine evaluation.
- One AI response produces the complete opinion: it combines product-fit context, the user's skin profile, routine completeness, skin-tolerance burden, and product-to-product formulation compatibility. The request makes OpenRouter web search available for supporting evidence and logs when the model decides not to use it. The model must return a Polish verdict, rationale, and exact INCI citations for every distinct product pair in each AM/PM section. Every material pair verdict must also become a visible finding. The backend validates full pair coverage and cited INCI, but does not hardcode a list of ingredients or deterministic compatibility rules.

## Implementation Approach

Create one pure, serializable `routine-guidance` domain projection. It receives a routine section, the owned shelf-product labels, and the current cached interpretation state; it returns advisory cards grouped by severity plus products whose analysis is not currently ready. Server routes use the projection for initial, saved data. `RoutineWorkspace` receives the same minimal guidance inputs and reruns the exact function whenever its local draft changes, so the preview is correct before save without duplicating decision logic or making client API calls.

## Critical Implementation Details

### State sequencing

The initial server projection is a snapshot of the persisted routine, but the workspace must immediately replace it with a projection of its current local draft after hydration. Product analysis is never refreshed as part of this flow: absent, pending, failed, or stale records yield the neutral incomplete-analysis state rather than a risk claim.

### User experience spec

Product warnings retain their stored severity. The role accumulation card uses a non-alarmist medium-level advisory: it says that several treatment or exfoliation steps occur in one section and asks the user to review them, rather than declaring an incompatibility. Cards link to product details; the compact `/today` variant also links to `/routine` when a correction may be useful.

## Phase 1: Guidance Domain Contract and Interpretation Read Model

### Overview

Define the shared, deterministic guidance contract and add the one batch read needed to feed it with current user-scoped interpretation records.

### Changes Required:

#### 1. Pure routine-guidance domain module

**File**: `src/lib/domain/routine-guidance.ts` (new)

**Intent**: Keep rule evaluation independent from Astro pages, React state, Supabase, and AI so server and client always make the same decision for the same draft.

**Contract**: Export serializable input types keyed by `shelfItemId`, including product identity, interpretation lifecycle status, stored warnings, and cautions. Export a `createRoutineGuidance` function accepting ordered AM/PM routine entries and those inputs. Its result must contain:

- product-signal cards for entries whose interpretation is `ready`: stored warnings preserve their severity and stored `cautionFor` entries become medium-level advisory cards, both preserving source-product identity;
- one medium advisory per section when it contains at least two `treat` and/or at least two `exfoliate` entries;
- a neutral incomplete-analysis list for entries with no interpretation or status other than `ready`;
- stable de-duplication by section, shelf item, and warning code so a duplicate draft entry does not create repeated identical cards.

**Contract**: The function must never infer a product-product conflict, medical risk, frequency, or schedule recommendation. It must preserve the caller's entry order for product names and affected product links.

#### 2. Batch interpretation read helper

**File**: `src/lib/domain/product-interpretation.ts`

**Intent**: Read the current cached state for all products used in one routine projection without starting, retrying, refreshing, or writing analyses.

**Contract**: Add a typed user-scoped helper that accepts a de-duplicated list of product IDs and returns the mapped current records in one query. It must filter by `user_id`, return an empty list for an empty input, and reuse the existing row mapper and selected columns. It must not invoke `getUserScopedProductDetails` or any provider lifecycle function.

#### 3. Guidance input assembly helper

**File**: `src/lib/domain/routine-guidance.ts` (new)

**Intent**: Make the mapping from `UserShelfCatalogItem` plus interpretation records to pure guidance input explicit and reusable by both pages.

**Contract**: Export a helper that joins owned shelf items to interpretations by `productId`, carries product name, product ID, shelf item ID, and lifecycle, warning, and caution fields only, and ignores any record not belonging to the provided shelf. Missing interpretation rows remain represented as unknown analysis state.

### Success Criteria:

#### Automated Verification:

- The project type-checks the new serializable domain contract without adding a test runner.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

## Phase 2: Server-Side Routine and Today Projections

### Overview

Load existing interpretation records alongside each page's existing shelf and schedule data, then derive a fresh server-side guidance snapshot without altering persistence.

### Changes Required:

#### 1. Routine page guidance snapshot

**File**: `src/pages/routine.astro`

**Intent**: Provide the routine workspace with the minimum data needed to render guidance for the saved routine and recompute it for its local draft.

**Contract**: After loading the profile, shelf catalog, and routine configuration, fetch interpretations for only the products on the current shelf, create the guidance input collection, and compute the initial base-routine guidance. Pass both serializable values to `RoutineWorkspace`; do not expose profile notes, raw INCI, provider keys, or full product-analysis basis fields.

#### 2. Today page guidance projection

**File**: `src/pages/today.astro`

**Intent**: Show only information relevant to the exact schedule used for the current Polish day.

**Contract**: Fetch the owned shelf interpretations in parallel with existing reads when possible, build guidance inputs, and call the pure projection with `daySchedule`. Preserve the existing empty-state behavior and route-error handling. No read from `/today` may write a routine or interpretation.

#### 3. Route error boundary

**Files**: `src/pages/routine.astro`, `src/pages/today.astro`

**Intent**: Ensure a failed interpretation read degrades safely rather than preventing the user from seeing or editing their routine.

**Contract**: Treat an unavailable guidance read as an absent guidance snapshot with a neutral, localized unavailable state in the panel. Preserve the current page-specific route error for failures of the core routine/shelf load. Do not redirect, append a query parameter, or turn an advisory read failure into a save block.

### Success Criteria:

#### Automated Verification:

- `/routine` and `/today` use one batch interpretation read and the same pure projection contract.
- Neither page introduces a mutation, AI call, migration, or response state in the URL.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

## Phase 3: Shared Guidance UI and Live Draft Updates

### Overview

Render the advisory result with the established product-analysis visual language and keep the routine editor's version synchronized with unsaved local changes.

### Changes Required:

#### 1. Reusable guidance panel

**File**: `src/components/routine/RoutineGuidancePanel.tsx` (new)

**Intent**: Present full and compact versions of the same guidance result without hiding critical information behind a browser prompt or duplicating severity labels.

**Contract**: Accept a serializable guidance result, a `variant` (`full` or `compact`), and optional edit context. Render:

- grouped advisory cards with clear severity hierarchy and the names of affected products;
- product-detail links using canonical `/products/[productId]` routes;
- a dedicated, neutral incomplete-analysis state naming products that cannot yet be assessed;
- a compact edit CTA to `/routine` when rendered from `/today`.

**Contract**: When no advisory cards or incomplete analyses exist, render a calm positive state rather than an empty panel. Do not render health diagnoses, numeric medical risk, blocking controls, or automatic repair actions.

#### 2. Routine workspace integration

**File**: `src/components/routine/RoutineWorkspace.tsx`

**Intent**: Make guidance immediately react to every local draft mutation, including changes not yet persisted.

**Contract**: Accept `initialGuidance` and `guidanceInputs` from the route. Derive current guidance from the local `draft` with the pure domain function and render the full panel near the editor context. The panel must update after product addition, removal, role change, ordering, AI proposal save, manual reset, and candidate shelf addition. Guidance must never change the draft, disable save, trigger fetch, or affect the existing proposal confirmation flow.

#### 3. Today routine composition

**Files**: `src/pages/today.astro`, `src/components/routine/TodayRoutine.astro`

**Intent**: Place compact guidance close to the current-day AM/PM plan without turning the read-only page into an editor.

**Contract**: Render `RoutineGuidancePanel` server-side with the current day's guidance either above the two sections or directly after their summary. Keep `TodayRoutine` read-only, preserve card ordering and product links, and do not hydrate a client island solely for static daily guidance.

### Success Criteria:

#### Automated Verification:

- The live workspace derives guidance from local draft state without an API request or persistence mutation.
- Product detail links and the `/today` edit CTA use canonical clean paths.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- A saved routine with a ready product warning or caution shows the correct product, severity, and details link on `/routine` and a compact equivalent on `/today`.
- Adding a second `treat` or `exfoliate` entry to one AM/PM draft section immediately shows one advisory; removing it immediately removes the advisory before save.
- A missing, pending, failed, or stale interpretation shows the neutral incomplete-analysis state and does not claim a product risk.
- The user can save, reset, apply an AI proposal, and use `/today` despite all guidance states; browser URLs remain free of response messages.

## Phase 4: Acceptance Documentation and Regression Check

### Overview

Record the concrete UI acceptance path and verify the advisory boundary remains intact across manual routine, AI proposal, and daily-consumption flows.

### Changes Required:

#### 1. Plan acceptance matrix

**File**: `context/changes/routine-warnings-and-guidance/plan.md`

**Intent**: Keep manual verification authoritative while the repository intentionally has no shared unit or integration test runner.

**Contract**: Preserve the scenarios below as the slice acceptance matrix. Do not add a one-off test framework for S-06; any future testing infrastructure belongs to a cross-project change and can cover the pure domain projection retroactively.

### Success Criteria:

#### Automated Verification:

- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- Complete every manual testing step below on desktop and a narrow viewport.
- Confirm the product-details analysis panel still renders independently of routine guidance.

## Testing Strategy

### Automated Coverage Decision

The project has no test runner and completed slices use Astro sync, lint, build, and manual UI acceptance. Do not introduce an isolated test framework in this slice. The pure guidance contract is deliberately structured to be straightforward to cover when a shared test foundation is adopted.

### Manual Testing Steps

1. Sign in with a complete profile, a saved AM/PM routine, and product analyses in `ready` state; open `/routine` and confirm a stored product warning appears with its expected severity and product details link.
2. Open `/today` on the same day and confirm only the guidance for that day's AM/PM steps appears, along with a clean link to edit `/routine`.
3. In `/routine`, add two different products as `Kuracja` to the same AM or PM section without saving; confirm a single accumulation advisory appears immediately. Remove or change one role and confirm it disappears immediately.
4. Repeat the previous scenario for two `Złuszczanie` entries. Add two `Nawilżenie` entries and confirm no accumulation advisory is created.
5. Use a shelf product with no interpretation, then a pending, failed, and stale interpretation when available; verify the neutral incomplete-analysis state names the affected product and no risk severity is invented.
6. Save a draft with an advisory, reset a routine, and apply and save an AI proposal; verify each action remains available and the guidance updates to the resulting draft.
7. Visit product details for an affected product and verify its existing product-fit warning panel still works independently.
8. Check all involved URLs after save, reset, and navigation: `/routine`, `/today`, and product details must contain no `error`, `success`, or other response-state query parameters.
9. Repeat core scenarios on a narrow viewport and confirm cards, links, and edit CTA remain usable.
10. Use a product with at least two stored warnings or cautions in the same routine section; confirm it renders as one product card with a list of distinct reasons, rather than repeated cards.
11. Click `Wyjaśnij z AI` on a product guidance card; confirm the response names only ingredients present in that product's INCI, explains its existing stored signals, and leaves the routine unchanged. Temporarily remove the API key or simulate a failed request if practical; confirm the inline error is shown without URL query parameters.

## Refinement: Grouped Product Signals and On-Demand AI Explanation

After the first manual UI pass, refine the product-specific presentation without changing the derived guidance boundary:

- A product can have several independently stored warnings and cautions. Present them as one card per product across the full AM/PM routine, with a distinct list of reasons and a label covering every section where the product occurs. Do not hide distinct signals or misrepresent them as duplicates.
- Add `Wyjaśnij z AI` only to a product guidance card. The client sends only the product ID; the authenticated endpoint rechecks shelf ownership and loads the product, its ready interpretation, saved profile basis, and INCI server-side.
- The AI response is transient. It must not persist, alter a routine, regenerate product fit, or make a route URL carry response state. It returns a concise Polish summary plus ingredient reasons. Ingredient names shown to the user must exactly match the supplied INCI list; unverified model ingredient names are discarded.
- Role-accumulation guidance remains deterministic and does not call AI.
- On `/routine`, keep the full advisory content collapsed by default behind a concise summary. On `/today`, do not place a global guidance panel above the routine: show a small `Uwaga` button only on affected product steps and open the existing product-specific guidance, including its optional AI explanation, in a scroll-locking modal.
- Product-fit prompt `v2` treats the finished formula as uncertain: it must not infer clogged pores, increased oiliness, or unsuitability from oils, esters, squalane, fatty alcohols, or emollients alone. Warnings are rare and direct; cautions use neutral, user-observable monitoring language. Barrier-supporting emollients remain a possible benefit when the profile supports that reading.
- Increment the product-fit prompt version and apply a data migration that marks every prior ready result as `stale` with `prompt_version_changed`. Preserve all previous fields and require a per-product explicit refresh; never reset the database.
- The on-demand AI explanation is transient, not a cached analysis. The client sends the current AM/PM draft with the request, including unsaved editor changes. The server validates all shelf item ownership before it builds context from companion products in the same section; a subsequent click always uses the current draft and requires no stale lifecycle.
- When guidance identifies a product with no ready interpretation, explain the next action and provide a per-product `Przygotuj analizę` CTA in the routine editor. It explicitly calls the existing product-interpretation endpoint, updates the local guidance input on success, and leaves the routine unchanged. Do not trigger provider work automatically merely because a product was added to a routine.

## Performance Considerations

The batch read must request only interpretations for products on the authenticated user's shelf. Guidance evaluation is linear in the small set of routine entries and shelf inputs; it performs no AI call, database write, or full catalog scan. The workspace recalculates only from already-loaded serializable inputs.

## Migration Notes

No migration is required. Guidance is a derived view of the existing schedule, shelf ownership, and product-interpretation cache. Do not run `supabase db reset`; there is no schema change to apply.

## References

- Roadmap scope: `context/foundation/roadmap.md:250`
- Product-fit interpretation contract: `src/lib/domain/product-interpretation.ts:89`
- Routine schedule contract: `src/lib/domain/routine-schedule.ts:64`
- Live routine workspace: `src/components/routine/RoutineWorkspace.tsx:108`
- Read-only daily projection: `src/pages/today.astro:50`
- Existing warning UI language: `src/components/products/ProductInterpretationPanel.tsx:86`
- No-URL-message rule: `context/foundation/lessons.md:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Guidance Domain Contract and Interpretation Read Model

#### Automated

- [x] 1.1 Pure guidance contract and batch interpretation read compile without provider or persistence side effects.
- [x] 1.2 `npx astro sync`, `npm run lint`, and `npm run build` pass.

### Phase 2: Server-Side Routine and Today Projections

#### Automated

- [x] 2.1 Both protected pages derive guidance from one batch interpretation read without mutations or URL response state.
- [x] 2.2 `npx astro sync`, `npm run lint`, and `npm run build` pass.

### Phase 3: Shared Guidance UI and Live Draft Updates

#### Automated

- [x] 3.1 The workspace recalculates guidance locally from its draft without fetch, save, or AI calls.
- [x] 3.2 `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual

- [ ] 3.3 Product warning, role accumulation, incomplete analysis, non-blocking save, and clean-URL scenarios work through the UI.

### Phase 4: Acceptance Documentation and Regression Check

#### Automated

- [x] 4.1 `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual

- [ ] 4.2 Full desktop and narrow-viewport acceptance matrix passes without regressing product details, AI routine proposals, or today's read-only flow.

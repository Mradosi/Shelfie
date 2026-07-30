# AI Routine Draft and Review Implementation Plan

## Overview

This slice turns the manual AM/PM routine editor into an AI-assisted workspace. The user can prepare current fit analyses for shelf products, ask AI to draft a first routine or review an in-progress one, inspect a separate proposal with short reasons and missing steps, and then deliberately apply and save the result. When the shelf cannot cover a missing step, the workspace can evaluate a bounded set of shared-catalog candidates and offer up to three products that are currently `recommended` for that user.

## Current State Analysis

The application already persists one base AM/PM routine, renders it in a React editor, and saves it through the routine API. It also has a per-user, cached product-fit analysis with explicit freshness states. What is missing is the routine-level orchestration that prepares those analyses, turns them into a strictly validated AI proposal, and presents that proposal without mutating the saved routine.

## Desired End State

On `/routine`, a logged-in user with a completed skin profile and shelf can run an understandable multi-stage AI flow. The UI first prepares every shelf product's current interpretation, then returns a valid AM/PM proposal using only shelf item IDs the user owns. The user can see concise reasons, missing steps, and up to three personally recommended catalog products per gap; adding one is explicit, idempotent for the shelf, and changes only the transient proposal. The routine changes only after the user explicitly confirms `Zastosuj i zapisz propozycję`; that action saves the full proposal and removes it from the workspace.

### Key Discoveries:

- The base routine is already normalized as `morning` and `evening` entries with `shelf_item_id` and `routine_role`; the same shelf item may legitimately occur more than once. `src/lib/domain/routine-schedule.ts:44`, `src/lib/domain/routine-schedule.ts:217`, `src/lib/domain/routine-schedule.ts:276`
- The routine route SSR-loads the profile, shelf catalog, and saved draft, while `ManualRoutineEditor` owns a local, currently uncontrolled draft. `src/pages/routine.astro:28`, `src/components/routine/ManualRoutineEditor.tsx:83`, `src/components/routine/ManualRoutineEditor.tsx:426`
- The existing routine endpoint accepts both form and JSON mutations and already keeps redirect messages out of URLs through flash cookies or JSON bodies. `src/pages/api/domain/routine.ts:18`, `src/pages/api/domain/routine.ts:144`
- Product interpretations are durable per `(user_id, product_id)`, have `pending | ready | failed | stale` lifecycle states, and use `ready` separately from the fit verdict. `supabase/migrations/20260712120000_user_product_interpretations.sql:24`, `src/lib/domain/product-interpretation.ts:43`, `src/lib/domain/product-interpretation.ts:384`
- The current OpenRouter product-fit prompt deliberately excludes AM/PM, routine order, and frequency; routine AI therefore needs its own prompt module and response validator. `src/lib/integrations/openrouter-product-fit.ts:106`
- Shared products already include category, INCI and identity fields, and `user_shelf_items` can be added idempotently via the domain helpers. `src/lib/domain/product-domain.ts:5`, `src/lib/domain/user-domain.ts:425`, `src/pages/api/domain/products/add-existing.ts:26`

## What We're NOT Doing

- No per-product scheduling, weekday overrides, rotation, frequency recommendation, or changes to the AM/PM base-routine model.
- No direct modification of the saved routine by an AI response, no persisted history of AI proposals, and no automatic saving without an explicit user confirmation. `Zastosuj i zapisz propozycję` is a user-initiated save action.
- No external shopping, web search, price or availability data; recommendations are only from existing shared `products` records.
- No recommendation of `mixed`, `not_recommended`, or `insufficient_data` products as catalog matches.
- No full routine-level conflict, overuse, contraindication, or medical diagnosis engine; S-06 owns that work.
- No background queue or notification system. The flow remains user-initiated on the routine screen.
- No database reset. This plan needs no migration; any future schema change must use `npx supabase migration up` only.

## Implementation Approach

Add a dedicated routine-AI domain and OpenRouter integration rather than overloading the product-fit prompt. The client runs short, visible API stages: prepare shelf interpretations, generate and validate a proposal, then evaluate catalog candidates for only the reported gaps. Server code always reloads the authenticated user's profile, shelf, and interpretations instead of trusting client product data. The UI keeps both the manual draft and AI proposal in memory; its styled confirmation explicitly replaces and saves the proposal, then clears the transient proposal state.

## Critical Implementation Details

### State sequencing

The preparation endpoint must complete successfully for every shelf product before draft generation is allowed. A failed or stale interpretation stops the flow at that exact stage and exposes retry; the routine model must never silently omit a shelf product. Catalog analysis is separate and bounded so it cannot turn one click into an unbounded set of OpenRouter calls.

### Performance constraints

Cap the draft response to three missing-step cards, inspect no more than four catalog candidates per missing step, and enforce a global maximum of twelve candidate product analyses per run. Return at most three `recommended` candidates per missing step, ranked by their stored `fit_score`; if none qualify, show an explicit no-match state.

## Phase 1: Routine AI Domain Contract and Candidate Discovery

### Overview

Define strict, reusable contracts for routine proposals and catalog recommendation selection. This phase adds no persistence schema because generated proposals remain transient and product interpretations already provide the required cache.

### Changes Required:

#### 1. Routine AI domain module

**File**: `src/lib/domain/routine-ai.ts` (new)

**Intent**: Keep routine-AI parsing, ownership validation, product interpretation preparation, and recommendation shaping outside pages and React components.

**Contract**: Export a validated proposal type containing `summary`, `routine`, `entryReasons`, and no more than three `missingSteps`. A routine entry must use only `BaseRoutineDraft` section keys, a known `RoutineRole`, and a shelf item ID from the server-loaded owned shelf. Provide helpers that reject unknown IDs, malformed section/role combinations, empty reasons, duplicate or oversized missing-step output, and a proposed routine with no entries.

**Contract**: Add a bounded preparation result for shelf analyses. For each owned shelf item, resolve its product interpretation, run the correct existing `start`, `refresh`, or `retry` path when needed, and return either a complete ready input set or a typed list of failed products. Do not send the free-form `notes` profile field to routine AI.

#### 2. Role-to-category catalog lookup

**File**: `src/lib/domain/routine-ai.ts` (new)

**Intent**: Make catalog candidates explainable and deterministic before their personalized fit is evaluated.

**Contract**: Define one explicit mapping from the existing routine roles to compatible `ProductCategory` values, for example `protect -> sunscreen`, `exfoliate -> exfoliant`, `cleanse -> cleanser`, and bounded category groups for `treat` or `moisturize`. `other` is never an automatically recommended missing step. The lookup excludes product IDs already present on the user's shelf, ignores products without usable category/INCI data, limits the pool to four per missing step and twelve overall, and returns only candidate records that can be analyzed with the existing product-fit contract.

#### 3. Shared product catalog query

**File**: `src/lib/domain/product-domain.ts`

**Intent**: Add a server-side read helper suitable for the bounded role/category lookup instead of loading the entire catalog into a client island.

**Contract**: Add a typed function that accepts allowed categories, excluded product IDs, and a hard limit; it returns `SharedProduct` records in a stable order. It must not expose user-specific fields or accept arbitrary filters from the browser.

#### 4. Routine AI prompt integration

**File**: `src/lib/integrations/openrouter-routine-draft.ts` (new)

**Intent**: Give routine planning a purpose-built, strict JSON prompt that consumes cached interpretations instead of re-analysing raw product INCI.

**Contract**: The request includes the structured profile basis, the current editable base draft, and one record per shelf item with product identity/category plus its ready personalized fit interpretation. The model returns only strict JSON with the domain proposal keys. The system prompt writes all user text in Polish; forbids medical claims, product IDs not supplied by the server, frequency or weekday advice, direct saving, catalog recommendations, and routine-level conflict analysis. Parse and validate every field before returning it to callers; malformed provider output becomes a safe typed error.

### Success Criteria:

#### Automated Verification:

- The proposal parser accepts a valid AM/PM proposal and rejects unknown shelf IDs, unsupported roles, malformed reasons, excessive missing steps, and empty proposed routines.
- Candidate lookup never returns an owned product, an unsupported category, or more records than the per-step and global limits.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

## Phase 2: Authenticated AI Orchestration APIs

### Overview

Expose small JSON-only operations that sequence the domain contract safely. Each operation re-reads server-owned data, returns actionable state for the visible progress UI, and never serializes errors into a redirect URL.

### Changes Required:

#### 1. Routine AI API route

**File**: `src/pages/api/domain/routine/ai.ts` (new)

**Intent**: Provide authenticated JSON actions for the multi-stage routine flow.

**Contract**: Support an allow-listed `action` value:

- `prepare_shelf`: authenticate, require a complete profile and non-empty shelf, and prepare every shelf interpretation. Return `ready` or `blocked` with safe product-level failure details; do not start draft generation after any failure.
- `generate_proposal`: authenticate, re-load the complete profile, owned shelf and ready interpretations, validate the submitted current local `BaseRoutineDraft` against owned shelf items, call the routine draft integration, and return a transient proposal.
- `evaluate_candidates`: authenticate, validate the transient missing-step payload against the domain limits, load candidates from the shared catalog, prepare their product interpretations, and return only fresh `recommended` candidates sorted by `fit_score` descending plus explicit no-match cards.

**Contract**: Reject absent/invalid JSON, unauthenticated access, incomplete profiles, empty shelves, attempts to reference another user's shelf item, and attempts to request arbitrary catalog products. Return `{ error }` JSON with a meaningful HTTP status. Do not use query-string messages or redirects for these client actions.

#### 2. Explicit shelf-add API for a chosen candidate

**File**: `src/pages/api/domain/routine/ai-candidates.ts` (new)

**Intent**: Let the AI workspace add a recommendation to the shelf without using the existing form-and-redirect endpoint.

**Contract**: Accept `productId`, the proposed section, and routine role; authenticate the user; then re-check server-side that the product exists, is outside the user's current shelf, maps to that role's allowed categories, and has a fresh `ready` / `recommended` interpretation for this user. Reuse `listUserShelfItems` / `addUserShelfItem` idempotently and return the resulting `UserShelfCatalogItem` as JSON. It persists shelf membership only; it never writes `user_routine_configs` or depends on a stored AI-proposal session.

#### 3. Product interpretation orchestration helpers

**File**: `src/lib/domain/product-interpretation.ts`

**Intent**: Reuse the existing cache lifecycle without duplicating `pending`, `stale`, `failed`, and `ready` logic in the new route.

**Contract**: Expose a narrow server-only helper for an explicitly provided, bounded product set that returns ready interpretations or structured failures. Keep the single-product details API behavior unchanged; preserve current cache freshness checks, prompt/model version invalidation, and the distinction between lifecycle status and `fitStatus`.

### Success Criteria:

#### Automated Verification:

- Every action returns JSON errors for invalid payloads, anonymous requests, incomplete profiles, non-owned shelf IDs, and unknown action names.
- `prepare_shelf` cannot continue to proposal generation when any shelf interpretation is not `ready`.
- Candidate responses contain at most three fresh `recommended` products per missing step and do not persist a routine.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

## Phase 3: AI-Assisted Routine Workspace

### Overview

Refactor the routine client island so it can own one editable manual draft and a separate AI proposal, then add the visible staged flow, proposal comparison, and retry states.

### Changes Required:

#### 1. Routine workspace client island

**File**: `src/components/routine/RoutineWorkspace.tsx` (new)

**Intent**: Coordinate manual editing, AI request states, transient proposal state, candidate evaluation, and confirmation without introducing page-level client state in Astro.

**Contract**: Receive the SSR `initialDraft` and `shelfCatalog`. Render an entry action that is labelled for the current state (`Ułóż rutynę z AI` when empty, `Sprawdź i popraw z AI` when a draft exists). Advance through visible states `preparing`, `generating`, `evaluating_candidates`, `ready`, `blocked`, and `error`; expose the failed product or stage-specific retry instead of a generic stuck loader.

**Contract**: Keep the AI proposal separate from the editable manual draft. Render proposal AM/PM sections, product-role reasons, and missing-step cards; do not use the proposal as the form's hidden routine value until the user explicitly applies it.

#### 2. Controlled manual editor

**File**: `src/components/routine/ManualRoutineEditor.tsx`

**Intent**: Allow the workspace to apply an AI proposal after confirmation while preserving every current manual editing capability.

**Contract**: Refactor the component from one-time `initialDraft` state to a controlled draft interface or lift its editable state to `RoutineWorkspace`. Preserve product add, role edit, ordering, removal, section switching, form save, reset behavior, duplicate shelf-item support, and the existing routine endpoint contract. Expose whether the current manual draft differs from the SSR-loaded saved routine.

#### 3. Routine route composition

**File**: `src/pages/routine.astro`

**Intent**: Mount the workspace instead of the standalone manual editor while preserving the SSR guardrails and existing page states.

**Contract**: Continue redirecting incomplete profiles to onboarding, continue loading only the current user's shelf and routine, and pass no provider key or sensitive profile internals into browser props. The existing manual workflow must remain usable when AI is unavailable.

#### 4. Proposal application confirmation

**File**: `src/components/routine/RoutineWorkspace.tsx` (new)

**Intent**: Protect unsaved manual changes before a user-confirmed proposal replaces and saves the routine.

**Contract**: Opening `Zastosuj i zapisz propozycję` shows an in-app styled modal with explicit cancel and save actions, including when the current draft is clean so the persistence boundary is clear. Never use `window.confirm` for this new flow. On confirmation, save the proposal through the existing JSON routine endpoint; only after success, replace the editable and saved drafts, clear the transient proposal and candidate cards, and close the modal. Keep the modal open with its own error message if saving fails.

### Success Criteria:

#### Automated Verification:

- The workspace sends only JSON requests to the AI route and keeps API errors in component state, not in the browser URL.
- Confirming `Zastosuj i zapisz propozycję` calls the existing routine save endpoint, updates the editable and saved drafts, and removes the proposal only after a successful response.
- Existing manual role, ordering, add, remove, reset, and save controls remain available after the refactor.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- A user with a non-empty shelf can observe preparation and generation states, receive a proposal, compare it with the existing draft, and explicitly replace and save it through the styled modal.
- A failed shelf interpretation stops the correct stage, names the affected product, and can be retried without losing the manual draft.
- Replacing a dirty manual draft requires the styled confirmation; cancel leaves the draft unchanged.

## Phase 4: Catalog Recommendations and End-to-End Verification

### Overview

Complete the missing-step recommendation interaction and verify the full flow, including the intentional no-match and failure paths.

### Changes Required:

#### 1. Catalog recommendation cards

**File**: `src/components/routine/RoutineWorkspace.tsx` (new)

**Intent**: Present the bounded recommendation results as understandable actions rather than an unstructured catalog dump.

**Contract**: For every missing-step card, show up to three evaluated `recommended` products with name, brand, image when available, fit verdict/score, short personalized summary, and a link to canonical product details. The primary explicit action adds the product to the shelf and to the matching entry in the transient AI proposal; it does not replace the manual draft and does not save the routine. If no candidate passes, show the agreed no-match state without falling back to `mixed` products or external search.

#### 2. Client-side shelf and proposal synchronization

**File**: `src/components/routine/RoutineWorkspace.tsx` (new)

**Intent**: Keep a successful explicit shelf addition usable in the same proposal without a page reload.

**Contract**: On a successful candidate-add response, merge the returned owned shelf item into the workspace catalog, append the suggested role/section to the transient proposal exactly once, disable or relabel the selected candidate, and preserve the manual draft. Handle an idempotent already-on-shelf response without duplicate catalog entries or proposal entries.

#### 3. Documentation of manual verification

**File**: `context/changes/ai-routine-draft-and-review/plan.md`

**Intent**: Keep the exact UI test matrix with the implementation contract so this slice can be validated without console-only steps.

**Contract**: Maintain the manual scenarios below as the authoritative acceptance path. Do not add a live external-model test to the automated suite; mock or pure-domain tests are appropriate for parser and selection rules.

### Success Criteria:

#### Automated Verification:

- Adding a candidate is idempotent for the shelf, updates only the transient proposal, and does not save the routine.
- Candidate cards never show a product whose current interpretation is not `ready` and `recommended`.
- `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual Verification:

- With an empty routine and enough suitable shelf products, generate a first AM/PM proposal, confirm `Zastosuj i zapisz propozycję`, and verify the proposal disappears and the routine survives a refresh.
- With a saved routine and an unsaved manual change, generate a review proposal, cancel the confirmation, then confirm that the manual draft is unchanged; repeat and accept to replace and save it.
- Use a recommendation card, confirm the product appears on the shelf and in the transient proposal, then confirm `Zastosuj i zapisz propozycję` and verify the updated routine persists.
- Force or observe a failed product interpretation, verify the flow stops with a targeted retry, and confirm the URL remains `/routine` without an error query parameter.
- Verify a missing step with no `recommended` catalog candidate shows the no-match state and never shows external or `mixed` fallback products.

## Testing Strategy

### Unit Tests:

- Add pure tests for routine-AI JSON parsing, validation of server-owned shelf references, missing-step bounds, role-to-category mapping, candidate pool limits, ranking, and no-match behavior.
- Test the product-interpretation preparation helper with ready, stale, pending, failed, and retryable inputs without contacting OpenRouter.
- Test controlled-draft comparison and proposal replacement decisions, including a dirty draft.

### Integration Tests:

- Exercise JSON actions with mocked OpenRouter responses: complete preparation, malformed proposal, product-analysis failure, candidate evaluation, ownership rejection, and candidate shelf add.
- Confirm the existing `/api/domain/routine` remains the only route that persists a routine configuration.

### Slice Acceptance Decision

This repository has no test runner and does not yet use automated unit or integration tests for its completed slices. The automated cases above are intentionally deferred to a future cross-project testing-foundation slice; they are not introduced only for this feature. This slice is accepted through the completed manual scenarios plus `npx astro sync`, lint, and production build verification.

### Manual Testing Steps:

1. Sign in with a completed profile, at least two shelf products, and no saved routine; use the AI action and verify each visible stage completes before reviewing a proposal.
2. Change one role or order manually without saving; generate a proposal, verify the manual draft remains visible, then test cancel and confirm in the `Zastosuj i zapisz propozycję` modal.
3. Generate a missing-step recommendation, add one candidate, inspect its details, confirm the updated proposal, and refresh to verify the routine persists while the proposal block stays gone.
4. Temporarily make one interpretation fail or use an unavailable provider; verify the targeted failure, retry, retained local draft, and clean URL.
5. Use a profile/catalog combination with no `recommended` candidate and verify the explicit no-match state.
6. Re-run `npx astro sync`, `npm run lint`, and `npm run build` after the final UI flow.

## Performance Considerations

All provider calls are bounded and server-side. The workflow evaluates shelf products first, then at most twelve catalog candidates per run; already fresh product interpretations are reused. The UI must show stage-specific progress rather than holding a single indeterminate button state through all requests.

## Migration Notes

No migration is planned. Product fit results already persist in `user_product_interpretations` and routine storage already accepts base AM/PM entries. Do not run `supabase db reset`; if a future implementation genuinely requires schema work, create a timestamped migration and run `npx supabase migration up`.

## References

- Roadmap scope and dependency: `context/foundation/roadmap.md:194`
- Base routine contract: `src/lib/domain/routine-schedule.ts:44`
- Manual routine UI: `src/components/routine/ManualRoutineEditor.tsx:83`
- Routine persistence route: `src/pages/api/domain/routine.ts:144`
- Product interpretation lifecycle: `src/lib/domain/product-interpretation.ts:369`
- Existing product-fit prompt boundary: `src/lib/integrations/openrouter-product-fit.ts:106`
- No-URL-message rule: `context/foundation/lessons.md:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Routine AI Domain Contract and Candidate Discovery

#### Automated

- [ ] 1.1 Proposal parsing and ownership validation pass their unit tests.
- [ ] 1.2 Candidate lookup respects category, ownership, and hard limits.
- [x] 1.3 `npx astro sync`, `npm run lint`, and `npm run build` pass.

### Phase 2: Authenticated AI Orchestration APIs

#### Automated

- [ ] 2.1 JSON action validation and authentication paths pass integration tests.
- [ ] 2.2 Preparation blocks proposal generation until all shelf interpretations are ready.
- [ ] 2.3 Candidate responses are bounded and never persist a routine.
- [x] 2.4 `npx astro sync`, `npm run lint`, and `npm run build` pass.

### Phase 3: AI-Assisted Routine Workspace

#### Automated

- [ ] 3.1 Workspace keeps AI errors out of the URL and persists a proposal only after the user confirms the styled save modal.
- [ ] 3.2 Existing manual editor behavior remains available after the controlled-draft refactor.
- [x] 3.3 `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual

- [x] 3.4 AI stages, targeted retry, proposal comparison, and dirty-draft confirmation work through the UI.

### Phase 4: Catalog Recommendations and End-to-End Verification

#### Automated

- [ ] 4.1 Candidate shelf additions are idempotent and do not save the routine.
- [ ] 4.2 Candidate cards only show fresh `recommended` interpretations.
- [x] 4.3 `npx astro sync`, `npm run lint`, and `npm run build` pass.

#### Manual

- [x] 4.4 First draft, review, candidate addition, no-match, retry, explicit save, and clean-URL scenarios pass through the UI.

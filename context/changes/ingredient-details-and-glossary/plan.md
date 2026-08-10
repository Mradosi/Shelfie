# Ingredient Details and Glossary Implementation Plan

## Overview

Ten slice dodaje współdzielony, cache'owany słownik składników INCI do canonical product details. Użytkownik zobaczy akordeon z opisami po polsku, gdzie jeden składnik jest rozwinięty naraz. Opisy będą edukacyjne: krótka rola kosmetyczna, możliwe korzyści i ostrożne uwagi. Nie będą personalizowaną oceną skóry ani oceną gotowej formuły.

Brakujące opisy użytkownik przygotuje świadomie jednym przyciskiem dla całego produktu. Backend pobierze wyłącznie składniki zapisane w canonical `products.inci_list`, wygeneruje ograniczony batch przez OpenRouter i zapisze wynik wspólnie dla wszystkich użytkowników. Rozwinięcie gotowej pozycji nie wykona requestu do AI.

## Current State Analysis

- Canonical details already render shared `products.inci_list`, but only as static numbered pills: `src/pages/products/[productId].astro:178-197`.
- `SharedProduct` is the correct shared source of INCI; its existing normalization only trims and removes exact duplicate strings: `src/lib/domain/product-domain.ts:289-295`, `:313-331`.
- Existing `user_product_interpretations` is deliberately private and profile-dependent, so it cannot host a reusable ingredient glossary: `supabase/migrations/20260712120000_user_product_interpretations.sql:43-142`, `src/lib/domain/product-interpretation.ts:282-335`.
- The app already uses strict JSON OpenRouter integrations and JSON endpoints for React islands: `src/lib/integrations/openrouter-product-fit.ts:120-201`, `src/pages/api/domain/products/interpretation.ts:67-108`.
- Current server client uses the authenticated user's Supabase key. A shared table must therefore be read-only to users; controlled writes need a server-only service-role client: `src/lib/supabase.ts:1-23`, `astro.config.mjs:20-26`.

## Desired End State

Every authenticated user can open any known product details page, regardless of shelf membership, and read already cached ingredient explanations. Clicking an INCI row opens its explanation without loading or calling AI. Only one row is expanded at a time.

For a product with missing entries, the INCI section clearly explains that descriptions are educational and offers `Przygotuj opisy składników`. A single user action processes a bounded group of missing entries. The UI preserves successful definitions, identifies entries that failed, and allows retrying only those entries. A stale entry remains visible and can be refreshed explicitly.

## Decisions Locked During Planning

| Decision | Choice | Rationale |
| --- | --- | --- |
| Definition source | Shared AI-generated descriptions | Supports any confirmed INCI without adding an uncertain third-party ingredient API to this MVP. |
| Generation timing | Explicit product-level action | Avoids hidden AI calls and never calls AI when a user merely expands an ingredient. |
| Description content | Role, concise summary, likely benefits, cautious caveats | Answers what the ingredient does while avoiding medical or formula-level certainty. |
| Partial failures | Keep ready entries and retry failures only | A single invalid provider response cannot hide useful definitions that were generated correctly. |
| Freshness | Preserve stale copy and expose manual refresh | New prompt/model versions can improve content without unexpected AI cost at page load. |
| Interaction | One-open-item accordion | Keeps long INCI lists readable, especially on mobile. |

## What We're Not Doing

- No external ingredient reference API, scientific citation directory, or full ingredient-science database.
- No AI request per expanded ingredient.
- No diagnosis, medical advice, guarantee of benefit, or personal skin recommendation in shared descriptions.
- No inference that a complete formula is comedogenic, irritating, or suitable/unsuitable based solely on one ingredient.
- No product intake blocking or automatic glossary enrichment during intake.
- No background queue, scheduled reprocessing, rate-limit platform, or admin glossary editor.
- No unit-test framework or new automated test suite; the repository has no such suite and the team explicitly deferred it.

## Critical Implementation Details

### Shared-data security

`ingredient_glossary_entries` is globally readable to authenticated users and never directly mutable by them. The browser sends only a `productId` and an allowed action. The endpoint verifies authentication, looks up the canonical product with the user-scoped client, derives all INCI names server-side, then performs shared writes with a server-only `SUPABASE_SERVICE_ROLE_KEY`. The key is never exposed to the client, committed, or returned in responses.

This aligns with Supabase's current model: exposed tables need explicit grants plus RLS, and a `SECURITY DEFINER` function should not be used as a shortcut in an exposed schema. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

### Normalized identity and cache lifecycle

The glossary key is deliberately conservative: Unicode NFKC normalization, whitespace collapsing, Unicode-dash normalization, then lowercase using an English locale. It preserves the original product spelling as display text and does not attempt chemical aliases or remove parenthetical names. A unique `inci_key` prevents repeated generation across products.

Each row stores `status`, `model_version`, `prompt_version`, generation timestamps and `last_error`. `ready` descriptions remain visible if a version mismatch makes them effectively `stale`; only the explicit `refresh` action rewrites them. The implementation must include a small migration pattern for future prompt/model invalidation, analogous to `supabase/migrations/20260730165705_invalidate_product_fit_v1_interpretations.sql`.

### Bounded generation contract

One click is one product-level operation, not one AI call per row. The operation processes at most 48 requested records and divides them into provider chunks of at most 12 INCI entries. This bounds request size and cost while covering normal product formulas. If more items remain, the response reports the count and leaves the action available for the next bounded operation.

The model must return strict JSON whose entries echo only requested `inci_key` values. The parser ignores unexpected keys and marks any requested but missing or malformed entry as `failed`; it does not manufacture a result. On a chunk-level provider failure, all entries allocated to that chunk become `failed` with a safe user-facing error. Concurrent actions rely on the unique key and pending-state allocation so an already pending entry is not regenerated by a second action.

## Phase 1: Shared Glossary Contract and Secure Persistence

### Overview

Create the shared cache table, service-role server client, glossary domain model, normalization rules and lifecycle helpers. This phase establishes a secure read/write boundary before any AI or UI calls use it.

### Changes Required

#### 1. Create the glossary migration through the Supabase CLI

**File**: `supabase/migrations/<generated-timestamp>_ingredient_glossary_entries.sql`

**Intent**: Persist one reusable definition per normalized INCI identity without modifying canonical product data or the private product-fit cache.

**Contract**: Before editing, run `npx supabase migration new ingredient_glossary_entries` to obtain the filename. The migration creates `public.ingredient_glossary_entries` with `id`, unique non-empty `inci_key`, non-empty `display_name`, `status` (`pending | ready | failed | stale`), nullable `cosmetic_role`, nullable `summary`, JSONB arrays `likely_benefits` and `caveats`, `source_kind` fixed to the current AI source, nullable `source_reference`, `model_version`, `prompt_version`, `generated_at`, `stale_at`, `stale_reason`, `last_error`, `created_at`, and `updated_at`.

Add check constraints for status and arrays of non-empty strings, comments documenting that descriptions are shared educational data, and the existing `set_updated_at` trigger. Revoke all direct privileges from `anon` and `authenticated`, grant only `SELECT` to `authenticated`, enable RLS, and add a select policy `using (true)` for authenticated users. Do not add insert/update/delete policies for normal users.

#### 2. Add server-only service-role support

**Files**: `astro.config.mjs`, `src/lib/supabase.ts`, `.env.example`, `README.md`

**Intent**: Let authenticated API routes safely write shared glossary records while preserving the existing cookie-bound client for normal user data.

**Contract**: Declare optional server secret `SUPABASE_SERVICE_ROLE_KEY`; export a separate `createServiceRoleClient()` that returns `null` if any required server value is missing and never accepts browser request data. Keep `createClient(requestHeaders, cookies)` unchanged for all user-scoped operations. Document the service-role key as a local `.env`/`.dev.vars`, Cloudflare secret and deployment secret, explicitly warning that it must never be a public environment variable or browser value.

#### 3. Add glossary domain module and normalized INCI helper

**File**: `src/lib/domain/ingredient-glossary.ts`

**Intent**: Give the API and product details page one typed boundary for shared glossary records, so raw Supabase rows and string normalization do not spread across components.

**Contract**: Export `IngredientGlossaryEntry`, `IngredientGlossaryStatus`, `IngredientGlossaryDefinition`, result/count types, `normalizeIngredientInciKey(value)`, `createIngredientGlossaryRequests(inciList)`, row mappers and structured-array validation. Provide bulk read by `inci_key`, insertion/allocation of pending records, saving ready results, marking failed records, exposing effective stale state when stored prompt/model versions differ, and selecting actionable entries for `prepare`, `retry` and `refresh`.

The original canonical INCI string remains the display label; only the normalized key is used for equality and cache lookup. All queries fetch groups with `.in("inci_key", keys)` rather than one query per ingredient.

#### 4. Define glossary configuration versions and migration convention

**Files**: `src/lib/integrations/openrouter-ingredient-glossary.ts`, `supabase/migrations/<future-prompt-change>.sql` (future convention only)

**Intent**: Make generated text reproducible and make future copy-quality upgrades explicit rather than silent.

**Contract**: Introduce exported `INGREDIENT_GLOSSARY_MODEL_VERSION` and `INGREDIENT_GLOSSARY_PROMPT_VERSION`. The first migration only creates rows; it does not fabricate a stale backfill. Whenever either version changes later, add a small forward-only migration that marks affected `ready` rows `stale`, preserving their last successful copy. Never use `supabase db reset` for this workflow.

### Success Criteria

#### Automated Verification

- Create the migration using `npx supabase migration new ingredient_glossary_entries` and apply it without a reset: `npx supabase migration up`.
- Confirm migration history with `npx supabase migration list --local`.
- Run `npx astro sync` and `npm run lint`.

#### Manual Verification

- Supabase Studio shows one glossary row per normalized `inci_key`, even when two product lists differ only in casing or whitespace.
- An authenticated browser client can select glossary entries but cannot insert, update or delete them directly.
- Removing `SUPABASE_SERVICE_ROLE_KEY` leaves normal reads intact and makes shared-generation actions fail with a clear configuration message, not a silent partial write.

## Phase 2: Bounded AI Enrichment API

### Overview

Implement strict, reusable batch generation for ingredient definitions and a protected JSON endpoint that derives work exclusively from a canonical product.

### Changes Required

#### 1. Implement strict OpenRouter ingredient glossary integration

**File**: `src/lib/integrations/openrouter-ingredient-glossary.ts`

**Intent**: Generate short Polish educational descriptions in a predictable, parseable format instead of saving raw model prose.

**Contract**: The integration accepts a maximum 12-item list of `{ inciKey, displayName }` values and returns only matching definitions. Its strict JSON schema uses `inci_key`, `cosmetic_role`, `summary`, `likely_benefits`, and `caveats`. Require all user-facing text to be Polish and concise.

The prompt must state that an INCI entry describes a possible cosmetic role in general, not an outcome for a finished formula or a person's skin. It must forbid diagnoses, treatment claims, routine instructions, concentration assumptions, absolute safety claims, comedogenicity claims based on an isolated ingredient, and invented ingredient names. It must permit empty benefit/caveat arrays when evidence is insufficient. Reuse the existing server-side fetch, status checking, strict parsing and typed error style from `openrouter-product-fit.ts`.

#### 2. Implement batch preparation lifecycle

**File**: `src/lib/domain/ingredient-glossary.ts`

**Intent**: Turn canonical product INCI into a bounded, concurrency-safe batch whose partial outcomes persist independently.

**Contract**: Add `prepareIngredientGlossaryEntries(serviceClient, product, action)` for `prepare | retry | refresh`:

- `prepare` allocates only entries absent from cache.
- `retry` selects only `failed` entries.
- `refresh` selects only effective/stored `stale` entries.
- At most 48 entries are processed per operation and calls to the model use 12-item chunks.
- Newly allocated pending entries are protected by the unique key. Existing pending entries are returned as pending and are not regenerated by this operation.
- Ready entries are saved independently. Invalid, absent or failed model records become `failed` without discarding ready sibling records.
- The returned result includes current entries for the product plus `readyCount`, `failedCount`, `pendingCount`, and `remainingCount` so the UI can describe partial success without another request.

#### 3. Add authenticated product glossary endpoint

**File**: `src/pages/api/domain/products/ingredient-glossary.ts`

**Intent**: Expose one safe client action for product-level preparation, retry and refresh without accepting free-form INCI or glossary copy from the browser.

**Contract**: `POST` accepts JSON `{ productId, action }`, validates `action` against `prepare | retry | refresh`, authenticates with the existing cookie-bound client, and checks that `productId` resolves to a shared product. It creates the service-role client only after authentication and product lookup. It returns JSON with `entries` and the lifecycle counts; all errors use the existing `{ error }` JSON body pattern and no redirect or URL parameter.

Log server-side failures with a route prefix, authenticated user ID, product ID and safe message. Do not log secrets, authorization headers or raw model payloads. Return a clear configuration error when the service-role key or OpenRouter key is absent.

#### 4. Keep API and user state separated

**Files**: `src/pages/api/domain/products/ingredient-glossary.ts`, `src/lib/domain/product-interpretation.ts` (no behavioral change expected)

**Intent**: Prevent future regressions where an ingredient explanation is treated as product-fit analysis.

**Contract**: The new endpoint must not read or write `user_product_interpretations`, profile data, shelf membership or routine configuration. Any authenticated user who can open a canonical product can request descriptions for that canonical product; only the generated shared record is reused. Product-fit generation and its UI remain untouched.

### Success Criteria

#### Automated Verification

- Run `npx astro sync`, `npm run lint`, and `npm run build` after adding the endpoint and integration.
- Confirm the endpoint only exposes allowed action values and derives the INCI set from the database, not the request body, through a code review of its parser and domain call.

#### Manual Verification

- On a product with several missing entries, one `prepare` action returns and persists ready descriptions for the product without adding query parameters to the URL.
- A temporary OpenRouter/configuration failure produces a visible inline error and leaves the affected entries retryable; already ready entries remain readable.
- After a partial failure, `retry` requests only failed entries and does not regenerate ready ones.
- Mark a row stale locally, then confirm it remains visible until an explicit `refresh` action completes.

## Phase 3: Product Details Glossary Experience

### Overview

Replace static INCI pills with the accessible, responsive glossary UI and connect it to the new server read model and batch endpoint.

### Changes Required

#### 1. Load glossary data alongside canonical product details

**File**: `src/pages/products/[productId].astro`

**Intent**: Render cached entries immediately on the canonical details page without client-side N+1 reads.

**Contract**: After loading `details.product`, derive its unique normalized keys and call the glossary bulk-read helper once with the existing authenticated Supabase client. Pass the product ID, original ordered INCI list and resolved entry state to a dedicated client island. If glossary data cannot be read, retain the product details page and show a contained glossary error state rather than failing the entire route.

Keep the existing `ProductInterpretationPanel` separate and preserve all shelf actions, product provenance and flash-message behavior.

#### 2. Build the interactive INCI glossary panel

**File**: `src/components/products/IngredientGlossaryPanel.tsx`

**Intent**: Make each displayed ingredient useful, compact and understandable without turning short definitions into a modal flow.

**Contract**: Replace the static list with a full-width accordion ordered exactly as `product.inciList`. Each closed row exposes the ordinal number, original INCI name, status cue and accessible expand/collapse control. Exactly one row can be open at a time; opening a ready row shows cosmetic role, summary, benefit list and caveat list. Empty lists are omitted rather than replaced with filler.

The section includes one persistent educational disclaimer and does not claim to assess the complete product or the user's skin. It shows:

- `Przygotuj opisy składników` when cache entries are missing;
- a disabled busy state while the request runs;
- a partial-success message and `Ponów dla brakujących` when failures remain;
- `Odśwież opisy` when stale entries exist, while showing the previous copy;
- a transparent state for entries that are pending because another operation already allocated them.

The component calls only the new JSON endpoint, updates its local entries/counts from the response, shows failures inline, and never changes browser location or puts messages into the URL.

#### 3. Preserve accessibility and mobile behavior

**Files**: `src/components/products/IngredientGlossaryPanel.tsx`, `src/pages/products/[productId].astro`

**Intent**: Ensure the new content remains usable with keyboard, screen reader and narrow viewport interactions.

**Contract**: Use semantic buttons or a correctly controlled disclosure primitive with `aria-expanded` and `aria-controls`; preserve visible focus styles and a sufficiently large tap target. The open content appears below its trigger without a modal or scroll lock. On desktop it remains a single readable list rather than a three-column grid that separates a trigger from its description; on mobile it fits within the established page padding.

#### 4. Document local and deployment configuration

**Files**: `.env.example`, `README.md`

**Intent**: Prevent a confusing first-run failure when the glossary endpoint requires its server-only write client.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY=###` placeholder to the example file and update local/cloud configuration instructions with where to get the local key, how to set it as a Cloudflare secret, and why it must not be exposed to browser code or committed. State that iterative schema work uses `npx supabase migration up`; do not suggest `supabase db reset` for this slice.

### Success Criteria

#### Automated Verification

- Run the required repository gate: `npx astro sync && npm run lint && npm run build`.
- Verify the generated page imports the new panel and the TypeScript props preserve original INCI order and entry status typing.

#### Manual Verification

- Open details of an existing product, prepare missing descriptions, then refresh the page and confirm descriptions remain available without another AI call.
- Expand multiple ingredient rows in succession and confirm only the most recently selected row remains open.
- Confirm the same normalized INCI description appears when opening another product containing that ingredient.
- Confirm a product not on the shelf can still display and prepare its ingredient descriptions.
- Check desktop and mobile widths, keyboard navigation, focus visibility, loading, partial-failure, retry and stale-refresh states.
- Confirm no user-facing success or error message appears in the URL during any glossary action.

## Testing Strategy

The repository currently has no committed unit or integration test suite, and the team has explicitly decided not to introduce one within individual slices. This change therefore uses the established executable gates plus focused manual acceptance testing.

### Automated Verification

1. `npx supabase migration up`
2. `npx supabase migration list --local`
3. `npx astro sync`
4. `npm run lint`
5. `npm run build`

### Manual Verification

1. Sign in, open a product details screen with at least three INCI entries and verify the initial missing state is clear.
2. Click `Przygotuj opisy składników`; confirm the URL stays clean, the action shows progress, ready definitions render in Polish and a browser refresh does not re-run generation.
3. Open different rows and verify one-open-item accordion behavior, keyboard accessibility and readable mobile layout.
4. Open another product that reuses one normalized INCI entry and verify its description comes from cache.
5. Temporarily reproduce a provider/configuration failure in a local development environment, verify the inline error and retry behavior, then restore configuration.
6. Mark a ready row stale in local data or through the future-version migration path; confirm its old content stays visible until manual refresh completes.

## Performance Considerations

- One database read loads all glossary entries for a product; no ingredient-level query loop is allowed.
- Opening/closing an already cached row has no network activity.
- A user action processes a maximum of 48 entries and sends OpenRouter groups of at most 12 entries, avoiding oversized prompts and unbounded provider costs.
- Cache reuse occurs by `inci_key` across the entire shared catalog, not by product or user.
- No generation happens during SSR product loading, product intake, or routine evaluation.

## Migration Notes

- Create the migration only with `npx supabase migration new ingredient_glossary_entries`; do not invent the filename manually.
- Apply it incrementally using `npx supabase migration up`. Do not run `supabase db reset`, preserving existing users, products, shelf items and routines.
- The migration starts with an empty glossary. Existing products get entries only when an authenticated user explicitly prepares them.
- The service-role secret is an operational prerequisite for write actions. Missing it must be a recoverable endpoint/UI configuration error, not a reason to weaken RLS or grant normal users shared writes.
- Future prompt/model changes require a new forward migration to mark existing ready entries stale; never rewrite existing descriptions silently at page render.

## References

- Research: `context/changes/ingredient-details-and-glossary/research.md`
- Roadmap outcome and scope: `context/foundation/roadmap.md:182-194`
- Current INCI details UI: `src/pages/products/[productId].astro:178-197`
- Shared product model: `src/lib/domain/product-domain.ts:289-331`, `:431-454`
- Existing AI integration pattern: `src/lib/integrations/openrouter-product-fit.ts:120-201`
- Existing JSON endpoint pattern: `src/pages/api/domain/products/interpretation.ts:67-108`
- Existing product-fit lifecycle/migration convention: `src/lib/domain/product-interpretation.ts:522-669`, `supabase/migrations/20260730165705_invalidate_product_fit_v1_interpretations.sql:1-9`
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Data API security: <https://supabase.com/docs/guides/api/securing-your-api>

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared Glossary Contract and Secure Persistence

#### Automated

- [x] 1.1 Create the `ingredient_glossary_entries` migration through `npx supabase migration new` and apply it with `npx supabase migration up`.
- [x] 1.2 Verify local migration history with `npx supabase migration list --local`.
- [x] 1.3 Run `npx astro sync` and `npm run lint` after the shared domain/configuration contract is added.

#### Manual

- [x] 1.4 Verify normalized-key reuse, read-only browser access and missing service-role configuration behavior locally.

### Phase 2: Bounded AI Enrichment API

#### Automated

- [x] 2.1 Run `npx astro sync`, `npm run lint` and `npm run build` after the integration and endpoint are added.
- [x] 2.2 Review the endpoint contract to confirm action validation and server-derived INCI input.

#### Manual

- [x] 2.3 Verify prepare, partial failure, retry-only-failures and manual stale-refresh API behavior through the UI/development environment.

### Phase 3: Product Details Glossary Experience

#### Automated

- [x] 3.1 Run `npx astro sync`, `npm run lint` and `npm run build` for the final details-screen integration.
- [x] 3.2 Verify typed panel props preserve canonical INCI order and glossary lifecycle state.

#### Manual

- [x] 3.3 Verify cache persistence, one-open-item accordion behavior, cross-product reuse, product-outside-shelf flow, responsive accessibility and clean URLs.

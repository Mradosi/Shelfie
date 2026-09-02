# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-12

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put an AI evaluator on top of a deterministic contract test that already catches the regression.
2. **User concerns are first-class evidence.** Risks raised by the user around AI quality, product intake, persistence, and actionable errors carry the same weight as product documentation and churn.
3. **Risks are scenarios, not code locations.** This plan documents what could fail and why it is likely, drawn from documents, interview, and codebase signal. It does not claim to know which line owns a failure. `/10x-research` establishes that ground truth for each rollout phase.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`. The scoped history contains 12 commits in 30 days; the main churn signals are `src/pages` (60 changed paths), `src/lib` (24), `src/components` (23), and `supabase/migrations` (4).

## 2. Risk Map

The top failure scenarios are ordered by impact × likelihood. Sources are evidence that surfaced each risk, not code anchors.

| #   | Risk (failure scenario)                                                                                                            | Impact | Likelihood | Source (evidence - not anchor)                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | AI returns malformed, incomplete, or unsuitable output and the app turns it into a wrong product record or routine recommendation. | High   | High       | [PRD](prd.md:71) [PRD](prd.md:87) [PRD](prd.md:95); interview Q1, Q3; hot-spot `src/lib` (24 changed paths/30d)    |
| 2   | Product intake fails to offer a clear fallback and confirmation path, or saves unverified product data.                            | High   | High       | [PRD](prd.md:44) [PRD](prd.md:71) [PRD](prd.md:119); interview Q1, Q3; hot-spot `src/pages` (60 changed paths/30d) |
| 3   | A user sees a state that appears saved but is lost after refresh, or sees an analysis stale for the current profile or routine.    | High   | Medium     | [PRD](prd.md:129) [PRD](prd.md:136) [PRD](prd.md:138); interview Q1; archived AI and routine slices                |
| 4   | An authenticated user accesses or changes another user's personal shelf, routine, profile, or generated data.                      | High   | Medium     | [PRD](prd.md:155); [PRD](prd.md:129); archived persistence and shelf slices                                        |
| 5   | A provider, validation, or network failure leaves the user without a next step, loses entered data, or exposes an internal detail. | Medium | High       | [PRD](prd.md:129) [PRD](prd.md:135); interview Q1; hot-spot `src/pages` (60 changed paths/30d)                     |
| 6   | Structurally valid AI guidance is semantically unsafe, overconfident, or inconsistent with the product's non-medical boundary.     | High   | Medium     | [PRD](prd.md:99) [PRD](prd.md:134) [PRD](prd.md:163); interview Q1                                                 |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                          | Must challenge                                                | Context `/10x-research` must ground                                                 | Likely cheapest layer       | Anti-pattern to avoid                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| #1   | Invalid provider output is rejected or converted to a safe, actionable state; valid output preserves the user-confirmation boundary. | A successful HTTP response means the output is usable.        | Provider boundary, structured-output contract, validation and persistence sequence. | Unit + contract integration | Copying expected values from production prompts or parser branches.         |
| #2   | Each intake branch ends in confirm, manual correction, retry, or a clear error without an unintended save.                           | A happy-path lookup proves all fallback branches are safe.    | Intake entry points, external-source boundaries, confirmation and save effects.     | Integration                 | E2e-only coverage or mock-only assertions with no persisted outcome.        |
| #3   | A save survives reload and dependent AI analysis is invalidated or refreshed when its input changes.                                 | A visible optimistic update proves persistence and freshness. | Persisted state, cache lifecycle, user/profile/routine change ordering.             | Integration                 | Testing only in-memory state or assuming timestamp ordering.                |
| #4   | Requests cannot read or mutate data outside the authenticated owner's scope; malformed client identifiers cannot bypass it.          | Being signed in proves ownership.                             | Authentication boundary, ownership rule, RLS/server enforcement, error shape.       | Integration                 | Mocking authorization internals or asserting only successful owner access.  |
| #5   | Expected failures retain safe form state where appropriate and show a Polish, actionable next step without leaking internals.        | Any error message is sufficient feedback.                     | Error translation, retry policy, form lifecycle, response and logging boundaries.   | Unit + targeted e2e         | Snapshotting error copy or exposing raw provider errors as expected output. |
| #6   | Curated high-risk skincare scenarios are flagged for human review when the guidance violates the defined safety rubric.              | Valid JSON and a completed request imply useful advice.       | Rubric, scenario fixtures, non-medical wording policy, output review lifecycle.     | AI-native rubric review     | Treating an LLM score as proof of factual or medical correctness.           |

## 3. Phased Rollout

Each row opens its own change folder. Status moves only through the fixed vocabulary below.

| #   | Phase name                                     | Goal (one line)                                                                                                | Risks covered  | Test types                    | Status       | Change folder                    |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------- | ------------ | -------------------------------- |
| 1   | Test foundation and deterministic AI contracts | Bootstrap a TypeScript test base and prove safe handling of AI output, cache lifecycle, and error contracts.   | #1, #3, #5     | unit + contract integration   | complete     | `testing-ai-contract-foundation` |
| 2   | Ownership and intake integration               | Prove product intake, persistence, and authenticated ownership boundaries through realistic server-side paths. | #2, #3, #4     | integration                   | not started  | —                                |
| 3   | Critical browser flows and AI rubric           | Prove the smallest end-to-end product/routine flows and selectively review AI guidance quality.                | #1, #2, #5, #6 | e2e + AI-native rubric review | not started  | —                                |
| 4   | Cookbook and quality-gate adoption             | Document shipped test patterns and make the required local test commands part of the delivery contract.        | cross-cutting  | quality gates + documentation | not started  | —                                |

Status vocabulary: `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

| Layer               | Tool                           | Version                              | Notes                                                                                                                              |
| ------------------- | ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration  | Vitest                         | 4.1.10                              | Vite-native TypeScript runner; use for pure contracts and server-boundary tests.                                                   |
| component rendering | Astro Container                | Astro 6.3.1                          | Consider only where an Astro component needs isolated rendering; do not use for static copy.                                       |
| e2e                 | Playwright                     | none yet - select and pin in Phase 3 | Limit to critical cross-route flows that cannot be proved cheaper.                                                                 |
| accessibility       | none yet                       | —                                    | Reassess in Phase 3 for the two e2e flows, not every screen.                                                                       |
| AI-native           | Provider-neutral rubric review | none yet - define in Phase 3         | Use only for bounded semantic checks of skincare guidance; never for authorization, JSON validation, persistence, or visual diffs. |

**Stack grounding tools (current session):**

- Docs: Context7 — checked Astro 6.3.1 isolated rendering and e2e guidance, plus Vitest 4.1.6 TypeScript, mocking, and coverage capabilities; checked: 2026-08-10.
- Search: no Exa.ai tool available; official documentation via Context7 was sufficient; checked: 2026-08-10.
- Runtime/browser: browser-control skill is available for later manual and critical-flow verification; no automation configuration is selected yet; checked: 2026-08-10.
- Provider/platform: no connected provider quality-gate tool was used; Supabase remains a Phase 2 integration boundary to research; checked: 2026-08-10.

## 5. Quality Gates

| Gate                            | Where               | Required?                                          | Catches                                                       |
| ------------------------------- | ------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `npx astro sync` + lint + build | local + existing CI | required now                                       | type, lint, and production-build drift                        |
| unit + integration command      | local               | required after §3 Phase 1                          | deterministic contract and persistence regressions            |
| critical-flow e2e command       | local               | required after §3 Phase 3                          | broken cross-route user journeys                              |
| test commands in CI             | CI                  | planned after a separate CI-configuration decision | regressions before merge                                      |
| selective multimodal review     | manual              | optional after §3 Phase 3                          | semantic or visual issues not reached by deterministic checks |

## 6. Cookbook Patterns

### 6.1 Adding a unit or contract test

Umieszczaj test obok modułu jako `*.test.ts`; reusable fixture'y są w `src/test/fixtures/` i nie mogą zawierać danych z lokalnej bazy. Importuj je przez `@/test/fixtures`, a zależności Astro/sekrety zastępuj mockiem w `src/test/mocks/`.

Test ma sprawdzać obserwowalny kontrakt, np. `src/lib/domain/ai-error-contract.test.ts` potwierdza dokładny, polski payload publicznego błędu, bez kopiowania implementacji mappera. Uruchom `npm test` jednorazowo albo `npm run test:watch` podczas pracy. Mockuj wyłącznie granicę providera lub klienta Supabase; test nigdy nie może wykonać requestu do OpenRoutera ani połączyć się z Supabase.

### 6.2 Adding an integration test for an authenticated flow

TBD - see §3 Phase 2 for ownership fixtures, persistence setup, mocking boundary, and local command.

### 6.3 Adding an e2e test for a critical flow

TBD - see §3 Phase 3 for browser setup, reference flow, and local command.

### 6.4 Evaluating a new AI guidance scenario

TBD - see §3 Phase 3 for the curated scenario format and human-review rubric.

### 6.5 Per-rollout-phase notes

- Faza 1: Vitest działa w Node i obejmuje czyste kontrakty domenowe, parsery oraz reprezentatywne endpointy z mockowanymi granicami AI i autoryzacji. `astro:env/server` jest zastąpione testową wartością bez sekretu, aby import adaptera nie zależał od lokalnego `.env`.

## 7. What We Deliberately Don't Test

- **Snapshots of every page's appearance** — static copy, Tailwind classes, and minor visual variants carry low business signal. Re-evaluate only if a critical visual regression becomes a demonstrated risk. (Source: interview Q5.)
- **Debug-only screens** — they are not part of the user value path. Re-evaluate if they become operationally required. (Source: interview Q5.)
- **Post-MVP scope** — batch catalog import, weekday overrides, notes/check-ins, and PWA packaging are outside the released MVP. Re-evaluate when a post-MVP slice is reopened. (Source: [roadmap](roadmap.md:57).)
- **Medical correctness claims** — automated tests do not certify dermatological advice; the product must instead preserve its non-medical boundary and route high-risk semantics to human review. (Source: [PRD](prd.md:163).)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-10
- Stack versions last verified: 2026-08-10
- AI-native tool references last verified: 2026-08-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes,
- §7 no longer matches the team's agreed scope.

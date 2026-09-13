## Overall concept

- GHA workflow run for every new pull request to master
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

## Code Review Criteria

Each criterion is scored from 1 to 10. Use the anchors below; scores between them indicate proportional confidence. A critical security or user-data issue fails the review regardless of the average score.

### 1. Functional correctness and contract preservation
- **1** — The implementation is incomplete, breaks an existing user-visible flow, or changes an API/domain contract without handling errors and edge cases.
- **10** — The change fully implements its stated behavior, preserves relevant page/API/domain contracts, and handles success, validation, empty, and failure paths predictably.

### 2. Security, privacy, and user-data isolation
- **1** — The diff can expose secrets, use a service-role key in client code, bypass authentication/RLS, allow cross-user data access, or accept unsafe input/redirects.
- **10** — Secrets remain server-only; authenticated identity and ownership are checked before data access; Supabase/RLS assumptions are preserved; external and form input is validated; no sensitive user data is exposed in the client or logs.

### 3. Framework and platform fit
- **1** — The change conflicts with Astro server-first rendering, uses React where a static Astro component is sufficient, introduces unsupported Cloudflare/Workers runtime behavior, or violates the existing Supabase integration pattern.
- **10** — The implementation follows Shelfie’s established split: Astro for routes/static UI, React only for interactive islands, server-only environment access through `astro:env`, and Cloudflare-compatible server code.

### 4. Maintainability, type safety, and scope discipline
- **1** — The code is unnecessarily complex, duplicated, weakly typed, hard to follow, or mixes unrelated refactors with the requested change.
- **10** — The diff is small and focused, uses strict TypeScript and existing domain/helpers, follows local conventions (`@/` imports, ESLint/Prettier, Tailwind), has clear names, and adds abstractions only where they reduce real duplication or complexity.

### 5. Regression protection and operational completeness
- **1** — Behavior with meaningful risk changes without regression protection, or migrations/configuration/documentation needed to operate the change are missing.
- **10** — Tests target the changed observable behavior and its riskiest edge/failure cases; auth/forms/middleware changes include the required manual-flow considerations; database/configuration changes are safe and documented where needed; the PR can pass `astro sync`, lint, and build.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
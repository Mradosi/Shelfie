# Repository Guidelines

Shelfie is an Astro 6 app with React 19 islands, TypeScript, Tailwind 4, Supabase auth, and a Cloudflare adapter. Use this file for repo-specific rules; use `@README.md` for setup details and deployment steps.

## Hard Rules

- Keep `SUPABASE_URL` and `SUPABASE_KEY` in `.env`, `.dev.vars`, or Cloudflare secrets only; do not hardcode them in `src/` or commit real values. See `@.env.example` and `@astro.config.mjs`.
- Before handing off a change, run `npx astro sync && npm run lint && npm run build`. CI enforces the same sequence in `@.github/workflows/ci.yml`.
- Use the `@/` path alias for imports from `src/`; do not introduce deep relative paths when the alias fits. See `@tsconfig.json`.

## Project Structure

- `src/pages/` holds Astro routes; `src/pages/api/auth/*.ts` exports named HTTP handlers such as `POST`.
- `src/components/auth/` contains interactive React form components; shared Astro shells live in `src/layouts/` and static Astro components in `src/components/`.
- `src/lib/` holds reusable helpers like Supabase client setup and config checks; `src/middleware.ts` owns route protection for `/dashboard`.
- `public/` stores public assets, and `supabase/` stores local Supabase CLI config.

## Build, Lint, and Local Dev

- `npm run dev` starts the local Astro dev server.
- `npx astro sync` refreshes generated Astro types before linting or building.
- `npm run lint` runs the type-aware ESLint config.
- `npm run build` produces the Cloudflare-targeted production build.
- `npm run format` applies Prettier, and `.husky/pre-commit` runs `npx lint-staged` on staged files.

## Style and Review Expectations

- Follow the existing split: `.astro` files for pages and layouts, `.tsx` files for interactive UI.
- Prettier enforces 2-space indentation, semicolons, double quotes, trailing commas, and `printWidth: 120`. See `@.prettierrc.json`.
- ESLint is strict and type-checked; React code must satisfy `react-compiler/react-compiler`, and unused variables must be prefixed with `_`. See `@eslint.config.js`.
- There is no committed test suite yet. If you change auth, forms, or middleware, manually verify the sign-in, sign-up, sign-out, and `/dashboard` protection flows in addition to lint/build.

## Commits and PRs

- Recent commits use short, lowercase, action-oriented subjects such as `bootstrap`, `techstack`, and `adjust prd`; keep the same style.
- Open PRs against `master` and expect CI to require lint + build before merge.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

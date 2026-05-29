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

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

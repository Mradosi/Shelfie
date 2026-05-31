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

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

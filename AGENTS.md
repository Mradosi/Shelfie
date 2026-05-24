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

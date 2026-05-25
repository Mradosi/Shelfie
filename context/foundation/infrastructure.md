---
project: shelfie
researched_at: 2026-05-25T09:00:53Z
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6.3.1 + React 19
  runtime: Cloudflare Workers
---

## Recommendation

**Deploy on Cloudflare Workers.**

This repo already uses `@astrojs/cloudflare@13.5.0`, and Astro 6's current first-class Cloudflare deployment path targets Workers rather than Pages. Given the small MVP scale, no persistent-process requirement, and willingness to keep Supabase and OpenRouter external, Cloudflare scored highest on CLI-first operations, managed runtime, agent-readable docs, deploy ergonomics, and cost at low traffic.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Netlify | Pass | Pass | Pass | Partial | Pass | 4.5/5 |
| Fly.io | Pass | Partial | Partial | Partial | Partial | 3/5 |
| Railway | Pass | Partial | Pass | Partial | Pass | 4/5 |
| Render | Partial | Partial | Partial | Partial | Partial | 2.5/5 |

Cloudflare Workers scored best because the current codebase is already aligned to the supported Astro adapter, `wrangler` covers deploy, rollback, secrets, and logs well, the docs are unusually agent-friendly through GitHub-backed content and `llms.txt`, and the free tier is generous for a low-QPS MVP. The main caveat is that this is a Workers deployment, not Cloudflare Pages SSR, because Astro 6 removed Pages support from the current Cloudflare adapter.

Vercel tied on the raw criteria but ranked second because it would require swapping adapters and reworking the current deployment path. Its CLI and docs are strong, and its MCP story is good, but it fits this repo less naturally than Cloudflare.

Netlify remains a viable third option with good Astro support and official MCP tooling. It ranked below Vercel because rollback is less clean from CLI and the repo would still need an adapter migration away from Cloudflare.

Fly.io is capable and handles persistent processes well, but this MVP does not need that strength. It would introduce containers, Docker-oriented setup, and a Node deployment path that increases operational surface relative to the current serverless setup.

Railway is a strong general-purpose platform with excellent docs and AI integration, but it would also require moving from the Cloudflare adapter to the Node adapter and running a standalone server. That is reasonable, but it is more moving parts than this repo needs today.

Render can host the app successfully, but its CLI and agent tooling are weaker than the top options, and its cleanest Astro path is also Node-based rather than aligned with the current repo. For this MVP it is a workable fallback, not the best fit.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

It won because the repo is already configured for the Cloudflare adapter, the Astro 6 local and deploy workflow is current, the pricing is favorable at MVP volume, and the platform has the strongest combined story across CLI, docs, and agent integration. It is the smallest-change path from the code already in the repository to production.

#### 2. Vercel

It scored second because it offers polished deploy workflows, strong docs, and good agent support. The gap versus Cloudflare is mainly repo fit: moving to Vercel means changing adapters and adopting a new operational path for no clear MVP advantage.

#### 3. Netlify

It scored third because it remains Astro-friendly and has official AI tooling, but its deploy and rollback surface is a bit less deterministic than the top two for unattended operations. It is still a credible fallback if organizational preference shifts away from Cloudflare.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate - Weaknesses

1. The project was originally framed around Cloudflare Pages, but the current Astro 6 adapter path targets Workers. Following outdated Pages-specific guidance would send the deployment setup in the wrong direction.
2. Workers are not full Node.js. If later MVP work introduces Node-only libraries for file handling, AI preprocessing, or auth utilities, compatibility problems may appear after architecture decisions are already baked in.
3. Cloudflare convenience can turn into lock-in if the app starts depending on Workers-specific bindings like KV, D1, R2, or Durable Objects instead of keeping external services clearly separated.
4. Code rollback is straightforward, but database or auth-related mistakes in Supabase are not rolled back with the Worker version. The app can return to older code while the data layer stays broken.
5. For this product, user-perceived latency may be dominated by Supabase region placement and OpenRouter response times, so the edge-first platform story can be overstated.

### Pre-Mortem - How This Could Fail

The team shipped quickly on Cloudflare Workers and assumed that early success meant the platform decision was settled for the whole MVP. Over time, they started layering in features that were easy to imagine in a general JavaScript app but less natural in an edge runtime, especially around image handling and more advanced AI-related preprocessing. Because the initial deployment worked, nobody revisited the runtime constraints until production behavior diverged from local expectations. At the same time, most users ended up clustered in one region, so the edge-first value proposition mattered less than expected, while Supabase and OpenRouter remained the dominant sources of latency anyway. The team had also internalized older Cloudflare Pages assumptions from stale docs and examples, which led to inconsistent scripts and confusion during deploy troubleshooting. When a rushed change touched both code and the Supabase data model, rollback confidence proved misplaced: code reverted cleanly, but the data-layer side effects did not. The decision did not fail because Cloudflare was bad; it failed because the team treated the easiest initial path as a universal fit and let platform-specific assumptions accumulate unchecked.

### Unknown Unknowns

- Astro 6 with `@astrojs/cloudflare@13` targets Workers, not Pages, even though older Pages guides are still easy to find.
- For this adapter, `astro dev` already runs against `workerd`, so older advice to build a separate local workflow around `wrangler pages dev` is usually obsolete.
- Preview behavior depends on whether deploys go through Git integration or direct `wrangler deploy`, and that choice should be intentional early.
- Cloudflare may be globally distributed while Supabase is single-region, so the actual latency profile is partly decided outside Cloudflare.
- Secret management can drift across `.env`, `.dev.vars`, Cloudflare secrets, and GitHub Actions if one source-of-truth process is not defined up front.

## Operational Story

- **Preview deploys**: Git-connected Workers builds can generate branch or PR previews, while direct CLI deploys are more explicit and scriptable; if previews expose real auth flows, protect them with Cloudflare Access or keep them tied to non-production secrets.
- **Secrets**: Local development uses `.env` or `.dev.vars`; production secrets live in Cloudflare Workers secrets via `wrangler secret put`; CI secrets live in GitHub only when automation truly needs them. Human maintainers with Cloudflare project access can rotate them, while agents should only use scoped tokens.
- **Rollback**: Use `wrangler versions list` to identify a prior version and `wrangler rollback` to restore it. Typical code rollback is minutes, but Supabase schema changes and data mutations must be handled separately because they do not roll back with the Worker.
- **Approval**: A human should approve first production publish, secret rotation, DNS changes, and any destructive Supabase action. An agent may handle builds, preview deploys, log inspection, and non-destructive production deploys once the workflow is stable.
- **Logs**: Runtime logs can be tailed read-only with `wrangler tail <worker-name>`. Deployment and CI logs stay available through GitHub Actions and Cloudflare build output, depending on the chosen deploy path.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Team follows outdated Cloudflare Pages guidance instead of the current Workers path | Research finding | M | H | Standardize docs and scripts around `@astrojs/cloudflare` Workers deployment only, and remove Pages wording from internal notes. |
| A future dependency requires full Node.js APIs not available in Workers | Devil's advocate | M | H | Add runtime-compatibility checks before adopting new libraries, and prefer web-standard or Worker-compatible packages for upload and AI flows. |
| Edge hosting hides latency from external Supabase or OpenRouter calls | Unknown unknowns | H | M | Benchmark the slowest user flows early, choose the closest practical Supabase region, and cache or batch external requests where possible. |
| Rollback restores code but not Supabase schema or bad writes | Devil's advocate | M | H | Treat database changes as separate deploy units, require reversible migrations where possible, and gate destructive changes behind manual approval. |
| Platform-specific bindings create future migration cost | Devil's advocate | M | M | Keep core product data in Supabase and isolate Cloudflare-specific services behind small adapters instead of spreading them through app code. |
| Secret values drift between local, CI, and Cloudflare environments | Unknown unknowns | M | M | Define one documented secret workflow now, with environment checklists for local, preview, and production. |
| Git-based preview behavior differs from direct CLI deploy expectations | Unknown unknowns | M | M | Pick one primary deployment path first, document it, and test preview behavior before relying on it for review or QA. |
| Team overestimates edge value for a mostly single-region user base | Pre-mortem | M | M | Revisit the hosting decision after real usage data, and avoid deep lock-in until traffic patterns are proven. |

## Getting Started

1. Keep the current Astro adapter path and treat Cloudflare Workers as the production target; do not configure a Pages SSR workflow for Astro 6 with `@astrojs/cloudflare@13.5.0`.
2. Authenticate Wrangler and confirm project access with `npx wrangler login` and `npx wrangler whoami`.
3. Set production secrets with `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`; keep the OpenRouter key in Workers secrets too once the app starts using it server-side.
4. Build and deploy with `npm run build` followed by `npx wrangler deploy`.
5. Verify runtime behavior using `npx wrangler tail <worker-name>` and smoke-test auth, protected routes, and the first OpenRouter-backed flow against production secrets.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)

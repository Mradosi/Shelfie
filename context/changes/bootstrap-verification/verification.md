---
bootstrapped_at: 2026-05-24T16:47:37Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: shelfie
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: shelfie
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

## Why this stack

Shelfie is a small, after-hours web-app MVP with a 6-week timeline, authenticated accounts, AI-assisted product extraction and guidance, and uploaded-photo handling. The recommended default for a JavaScript web app fits that shape well because it gives you a strongly opinionated full-stack baseline with TypeScript contracts, built-in auth, database and storage primitives through Supabase, and a deployment path that matches the starter out of the box. That keeps setup overhead low for a solo build while leaving enough flexibility for AI-driven product flows and mobile-first delivery.

## Pre-scaffold verification

| Signal      | Value                                      | Severity | Notes |
| ----------- | ------------------------------------------ | -------- | ----- |
| npm package | not run                                    | not run  | `cmd_template` uses `git clone`, so there is no `create-*` npm CLI to inspect |
| GitHub repo | recency check unavailable                  | not run  | `gh` CLI is not installed in this environment (`zsh:1: command not found: gh`) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 17
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

| Path | Result |
| ---- | ------ |
| `.env.example` | moved |
| `.github/` | moved |
| `.gitignore` | moved |
| `.husky/` | moved |
| `.nvmrc` | moved |
| `.prettierrc.json` | moved |
| `.vscode/` | moved |
| `CLAUDE.md` | moved |
| `README.md` | moved |
| `astro.config.mjs` | moved |
| `components.json` | moved |
| `eslint.config.js` | moved |
| `package-lock.json` | moved |
| `package.json` | moved |
| `public/` | moved |
| `src/` | moved |
| `supabase/` | moved |
| `tsconfig.json` | moved |
| `wrangler.jsonc` | moved |
| `context/` | preserved from cwd; scaffold copy not present |
| `.git/` | removed from cloned starter before move-up |
| `node_modules/` | removed after install; not moved into cwd |

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

- `devalue` `5.8.0` at `node_modules/devalue`
  Advisory: `GHSA-77vg-94rm-hx3p`
  Description: Svelte devalue DoS via sparse array deserialization.
  Fix: `fixAvailable: true`

#### MODERATE findings

- `@astrojs/check` `0.9.9` at `node_modules/@astrojs/check`
  Advisory chain: via `@astrojs/language-server`
  Fix: `@astrojs/check@0.9.2` flagged by audit as the available remediation path (semver-major).

- `@astrojs/language-server` `2.16.8` at `node_modules/@astrojs/language-server`
  Advisory chain: via `volar-service-yaml`
  Fix: `@astrojs/check@0.9.2` flagged by audit as the available remediation path (semver-major).

- `@cloudflare/vite-plugin` `1.36.3` at `node_modules/@cloudflare/vite-plugin`
  Advisory chain: via `miniflare`, `wrangler`, `ws`
  Fix: `fixAvailable: true`

- `miniflare` `4.20260507.1` at `node_modules/miniflare`
  Advisory chain: via `ws`
  Fix: `fixAvailable: true`

- `volar-service-yaml` `0.0.70` at `node_modules/volar-service-yaml`
  Advisory chain: via `yaml-language-server`
  Fix: `@astrojs/check@0.9.2` flagged by audit as the available remediation path (semver-major).

- `wrangler` `4.90.0` at `node_modules/wrangler`
  Advisory chain: via `miniflare`
  Fix: `fixAvailable: true`

- `ws` `8.20.0` at `node_modules/@supabase/realtime-js/node_modules/ws` and `ws` `8.18.0` at `node_modules/ws`
  Advisory: `GHSA-58qx-3vcg-4xpx`
  Description: Uninitialized memory disclosure.
  Fix: `fixAvailable: true`

- `yaml` `2.7.1` at `node_modules/yaml-language-server/node_modules/yaml`
  Advisory: `GHSA-48c2-rrv3-qjmp`
  Description: Stack overflow via deeply nested YAML collections.
  Fix: `@astrojs/check@0.9.2` flagged by audit as the available remediation path (semver-major).

- `yaml-language-server` `1.20.0` at `node_modules/yaml-language-server`
  Advisory chain: via `yaml`
  Fix: `@astrojs/check@0.9.2` flagged by audit as the available remediation path (semver-major).

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| ---- | ----- |
| bootstrapper_confidence | `first-class` |
| quality_override | `false` |
| path_taken | `standard` |
| self_check_answers | `null` |
| team_size | `solo` |
| deployment_target | `cloudflare-pages` |
| ci_provider | `github-actions` |
| ci_default_flow | `auto-deploy-on-merge` |
| has_auth | `true` |
| has_payments | `false` |
| has_realtime | `false` |
| has_ai | `true` |
| has_background_jobs | `false` |

## Next steps

Next: a future skill will set up agent context (`CLAUDE.md`, `AGENTS.md`). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.

---
date: 2026-09-06T10:13:20+02:00
researcher: Codex
git_commit: 3f88c8c6c8fbcb172b1eaa8dd4c999a4120da175
branch: master
repository: Shelfie
topic: "CI/CD PR code-review workflow based on ci-cd-code-review requirements"
tags: [research, github-actions, ci-cd, code-review, codex-sdk, structured-output]
status: complete
last_updated: 2026-09-06
last_updated_by: Codex
---

# Research: CI/CD PR code-review workflow

**Date**: 2026-09-06T10:13:20+02:00  
**Researcher**: Codex  
**Git Commit**: `3f88c8c6c8fbcb172b1eaa8dd4c999a4120da175`  
**Branch**: `master`  
**Repository**: Shelfie

## Research Question

What existing Shelfie code, CI configuration, AI integration patterns, quality rules, and security constraints should shape a PR code-review workflow described in `requirements.md`?

## Summary

Shelfie already has the two key foundations for this change:

1. a deterministic CI job for `astro sync`, lint, and Cloudflare build; and
2. an untracked, standalone `tools/code-review-agent` package that invokes Codex with a JSON output schema.

The agent package is the correct starting point, but it does not yet meet the requirements: it accepts only a diff, scores a different rubric, does not constrain scores to integers in the 1–10 range, has no structured findings, and trusts the model to decide `pass`/`fail`.

The implementation should keep the existing CI job independent, evolve the local agent into a validated reviewer with a deterministic verdict policy, then wrap it in a local composite action and a dedicated PR workflow. The workflow must treat PR title, body, and diff as untrusted text. It must never execute code from the PR head in a job that has `OPENAI_API_KEY` or write-capable GitHub permissions.

## Detailed Findings

### Existing CI is a separate, deterministic release gate

- The only tracked workflow is [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml). It runs on pushes and pull requests targeting `master`, then executes `npm ci`, `npx astro sync`, `npm run lint`, and `npm run build` with only Supabase build secrets ([`ci.yml:3-24`](../../../.github/workflows/ci.yml)). It neither runs tests nor invokes an AI reviewer.
- The deployment plan explicitly requires retaining this build gate ([`context/deployment/deploy-plan.md:439-454`](../../deployment/deploy-plan.md)). The AI review should therefore be its own job/workflow and must not replace or weaken the existing job.
- The root project does provide `npm test` ([`package.json:5-14`](../../../package.json)), but the test strategy deliberately leaves adding test execution to CI for a separate configuration decision ([`context/foundation/test-plan.md:75-83`](../../foundation/test-plan.md)). The plan must explicitly decide whether this change adopts `npm test` in existing CI; it must not silently assume that it already runs.

### A local Codex reviewer already provides the right technical base

- `tools/code-review-agent` is an untracked Node/TypeScript package with its own dependencies, including `@openai/codex-sdk` and Zod ([`tools/code-review-agent/package.json:1-19`](../../../tools/code-review-agent/package.json)). Root `npm ci` will not install it; CI must run `npm ci --prefix tools/code-review-agent` before its own review script.
- The current CLI reads only a diff from standard input ([`review.ts:13-20`](../../../tools/code-review-agent/src/review.ts)), creates a read-only Codex thread with approvals, network, and web search disabled ([`review.ts:50-58`](../../../tools/code-review-agent/src/review.ts)), requests an `outputSchema`, validates the returned JSON with Zod, and emits JSON on stdout ([`review.ts:59-75`](../../../tools/code-review-agent/src/review.ts)). Its metrics go to stderr, which is a useful CI boundary.
- It currently loads `OPENAI_API_KEY` from the local root `.env` ([`review.ts:8-12`](../../../tools/code-review-agent/src/review.ts)). CI must supply that value only as a GitHub secret environment variable and must never write it into `.env` or echo it.
- Its safety note accurately states that the diff will be transmitted to the model provider and therefore must not contain secrets or otherwise restricted data ([`tools/code-review-agent/README.md:21-27`](../../../tools/code-review-agent/README.md)). This is a residual privacy risk to document in the workflow and repository settings, not something a JSON schema can remove.

### The structured-output contract needs to be rebuilt around the new rubric

- The existing prompt and schema use the old criteria: implementation correctness, TypeScript idiomaticity, complexity, test-risk coverage, and security ([`review-schema.ts:3-27`](../../../tools/code-review-agent/src/review-schema.ts)). They do not match the five required dimensions in [`requirements.md:20-38`](requirements.md).
- The current score is only `z.number()` ([`review-schema.ts:16-18`](../../../tools/code-review-agent/src/review-schema.ts)); it can accept 0, 11, or a decimal. The revised schema should require `z.number().int().min(1).max(10)` for every criterion.
- The output has only flat scores, a model-declared verdict, and summary ([`review-schema.ts:20-27`](../../../tools/code-review-agent/src/review-schema.ts)). It needs one required, named object per criterion, each with score, Polish explanation, and an array of structured findings. Named fields are preferable to a free-form array because all five required criteria are then mechanically present exactly once.
- Findings should be bounded and actionable: `severity` (`low | medium | high | critical`), `file`, optional `line`, `message`, and `suggestedFix`. Add `requiredManualChecks` for changes in auth/forms/middleware instead of falsely requiring an end-to-end test for every PR.
- Final `pass` / `needs_changes` / `fail` must be calculated in ordinary TypeScript after schema validation. The model may provide evidence but must not be the policy authority. The requirements already make a critical security or user-data problem an unconditional failure ([`requirements.md:18`](requirements.md)).
- The revised prompt must include the PR title, optional/capped description, and diff, but delimit all three as untrusted data and explicitly state that they are not instructions. The current implementation interpolates only raw diff into the prompt ([`review.ts:59-61`](../../../tools/code-review-agent/src/review.ts)).

### Shelfie-specific review rules have concrete evidence

- Server secrets use Astro server-only environment fields ([`astro.config.mjs:20-26`](../../../astro.config.mjs)); the README prohibits exposing `SUPABASE_SERVICE_ROLE_KEY` in client code or commits ([`README.md:79-81`](../../../README.md), [`README.md:105-114`](../../../README.md)). A secret exposure, service-role client-side use, RLS/ownership bypass, or cross-user data access is a hard failure under the security/privacy criterion.
- Route protection lives in [`src/middleware.ts`](../../../src/middleware.ts), and the repo rules require manual verification of sign-in, sign-up, sign-out, and `/dashboard` protection when auth, forms, or middleware change ([`AGENTS.md:31`](../../../AGENTS.md)). The reviewer should emit explicit manual checks for those changes.
- Shelfie is Astro server-first with React only for interactive islands, strict TypeScript, Tailwind, `@/` imports, and a Cloudflare Workers adapter ([`AGENTS.md:13-31`](../../../AGENTS.md), [`README.md:7-14`](../../../README.md)). These form the evidence base for the framework/platform and maintainability criteria.
- The team test strategy is risk-first: use the cheapest test that proves the behavior and mock only provider/Supabase boundaries ([`context/foundation/test-plan.md:13-17`](../../foundation/test-plan.md), [`context/foundation/test-plan.md:87-91`](../../foundation/test-plan.md)). Review findings should ask for focused behavioral tests and failure cases, not blanket coverage or e2e tests.
- Known high-risk areas are AI-output validation, user confirmation, persistence/freshness, ownership isolation, safe actionable errors, and non-medical guidance boundaries ([`context/foundation/test-plan.md:25-43`](../../foundation/test-plan.md)). The agent may flag observable contract violations, but must not claim that static review proves dermatological correctness.
- The existing AI error contract suppresses raw provider details and uses a stable public `{ error: { code, message, action } }` response ([`context/archive/2026-08-10-testing-ai-contract-foundation/plan.md:79-125`](../../archive/2026-08-10-testing-ai-contract-foundation/plan.md)). Changes to AI endpoints should be reviewed against this boundary.
- The project lesson forbids redirect outcomes in query strings and requires short-lived HttpOnly flash cookies for redirect-based form feedback ([`context/foundation/lessons.md:8-12`](../../foundation/lessons.md)). This is relevant to correctness and security findings for changed forms and redirects.

### CI security determines the workflow shape

- GitHub states that secrets other than `GITHUB_TOKEN` are not supplied to workflows triggered from fork pull requests; the token is read-only there. It also warns that `pull_request_target` must not check out or run untrusted PR code because that can expose secrets or write privileges ([GitHub Actions event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use)).
- Consequently, the reviewer job must not simply check out the PR head and execute `tools/code-review-agent` with `OPENAI_API_KEY`: a contributor could change that script and exfiltrate the secret before Codex's own sandbox starts.
- Recommended v1 design: execute the workflow and composite action from the trusted base/default branch, retrieve the PR diff through the GitHub API as data, pass it to the trusted agent via stdin or a temporary file, and give the workflow only the narrowly required `pull-requests: write` and `issues: write` permissions for its comment and labels. Do not place untrusted PR fields in shell commands or YAML expressions that can be interpreted as commands.
- This safe design can be considered for fork PRs because it does not execute their code, but it still sends their diff to the AI provider. If that disclosure is not acceptable, v1 must explicitly skip fork PRs and surface that limitation.
- `ai-cr:review` retry needs `pull_request` `labeled` handling, a condition that checks exactly that label, and idempotent label management. The plan should decide whether the trigger label is removed after use to avoid accidental repeated, paid runs.

## Architecture Insights

The change has three separable layers:

```text
trusted base workflow
  → trusted composite action
    → Codex reviewer (untrusted PR metadata + diff as data)
      → validated review JSON
        → deterministic verdict policy
          → PR comment + mutually exclusive status label
```

This division keeps criteria/prompt/schema portable, leaves the current deterministic CI untouched, and allows a later evaluation suite to exercise the same reviewer contract.

Recommended implementation order:

1. Commit and refactor the existing local agent: exact five criteria, strict schema, prompt-injection boundary, PR metadata input, deterministic verdict policy, and hermetic unit tests.
2. Add the local composite action that installs and invokes only the trusted agent code and exposes a machine-readable verdict/report output.
3. Add a dedicated PR workflow with least-privilege permissions, trusted-base execution, diff retrieval, a PR summary comment, mutually exclusive labels, and retry-on-label behavior.
4. Decide separately whether the existing CI job also starts running `npm test`.

## Historical Context

- The deployment plan requires the existing Astro/lint/build gate to remain intact ([`context/deployment/deploy-plan.md:439-454`](../../deployment/deploy-plan.md)).
- The archived AI-contract change established a pattern of provider-boundary mocks, strict parsing, stable public error payloads, and no provider details in user-visible responses ([`context/archive/2026-08-10-testing-ai-contract-foundation/plan.md:79-125`](../../archive/2026-08-10-testing-ai-contract-foundation/plan.md)).
- The current test plan treats CI test execution as a conscious follow-on decision, even though local Vitest tests are available ([`context/foundation/test-plan.md:75-91`](../../foundation/test-plan.md)).

## Code References

- [`.github/workflows/ci.yml:3`](../../../.github/workflows/ci.yml:3) — current master PR/push CI gate.
- [`tools/code-review-agent/src/review.ts:35`](../../../tools/code-review-agent/src/review.ts:35) — existing Codex reviewer entry point and JSON boundary.
- [`tools/code-review-agent/src/review-schema.ts:3`](../../../tools/code-review-agent/src/review-schema.ts:3) — current prompt and insufficient output schema.
- [`context/changes/ci-cd-code-review/requirements.md:1`](requirements.md:1) — source requirements and the five review criteria.
- [`context/foundation/test-plan.md:13`](../../foundation/test-plan.md:13) — risk-first test strategy.
- [`AGENTS.md:7`](../../../AGENTS.md:7) — secret, verification, and project conventions.

## Open Questions

1. **Fork policy:** should the reviewer process fork PR diffs through the AI provider using trusted base code, or skip fork PRs to avoid that disclosure? The first option is technically safe only if no PR code is checked out or executed.
2. **PR description:** is the description required input, optional input with a character cap, or excluded in v1 to constrain cost and prompt size?
3. **Verdict thresholds:** the hard failure for critical security/user-data risk is decided. Confirm the remaining policy, for example `pass` only when all scores are at least 8 and there are no `high` findings.
4. **Test gate:** should this CI change also add `npm test` to the existing deterministic workflow, fulfilling the currently deferred CI-test decision?
5. **Diff limit:** what is the maximum diff size or file count before the reviewer should return `needs_changes`/manual-review rather than incur an uncontrolled model cost?

## Related Research

- [`context/archive/2026-08-10-testing-ai-contract-foundation/research.md`](../../archive/2026-08-10-testing-ai-contract-foundation/research.md) — prior investigation of deterministic AI contracts and provider-boundary tests.

> GitHub permalinks were not generated because the GitHub CLI could not reach `api.github.com` during research. Local links above refer to the inspected commit and working tree.

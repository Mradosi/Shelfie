---
change_id: ci-cd-code-review
title: Introduce CI/CD workflow for PR code reviews
status: implementing
created: 2026-09-06
updated: 2026-09-12
archived_at: null
---

## Notes

introducing first ci/cd workflow for pr code reviews

## Implementation adjustments

- 2026-09-12: Root CI installs, type-checks, and tests the nested code-review agent before root lint. ESLint scans this package, so a fresh GitHub runner must have its SDK types installed.
- 2026-09-12: The composite action invokes the reviewer through its installed `tsx` binary so the report file contains only JSON, without npm script output.
- 2026-09-12: The composite action exposes only the runner-temporary report path, while the full JSON stays outside `GITHUB_OUTPUT` for the next workflow step.
- 2026-09-12: A successful review removes a pending `ai-cr:review` retry label even if the successful run was triggered by a later commit update rather than by the label event itself.

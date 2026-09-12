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

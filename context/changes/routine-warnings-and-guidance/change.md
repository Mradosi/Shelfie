---
change_id: routine-warnings-and-guidance
title: Routine warnings and guidance
status: implementing
created: 2026-07-30
updated: 2026-07-30
---

## Notes

- The slice is advisory only: it never blocks saving or automatically changes a routine.
- It reuses cached per-user product interpretations and does not call AI or re-analyse INCI.
- Automated unit and integration tests are deferred until the project adopts a shared test runner; acceptance uses Astro sync, lint, build, and manual UI scenarios.

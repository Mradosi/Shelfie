---
change_id: routine-warnings-and-guidance
title: Routine warnings and guidance
status: archived
created: 2026-07-30
updated: 2026-08-05
archived_at: 2026-08-05T14:05:24Z
---

## Notes

- The slice is advisory only: it never blocks saving or automatically changes a routine.
- It reuses cached per-user product interpretations and does not call AI or re-analyse INCI.
- Automated unit and integration tests are deferred until the project adopts a shared test runner; acceptance uses Astro sync, lint, build, and manual UI scenarios.

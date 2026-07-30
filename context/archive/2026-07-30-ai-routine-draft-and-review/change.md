---
change_id: ai-routine-draft-and-review
title: AI routine draft and review
status: archived
created: 2026-07-30
updated: 2026-07-30
archived_at: 2026-07-30T15:23:46Z
---

## Notes

- The AI flow works only with the authenticated user's shelf, profile, the shared `products` catalog, and cached per-user product interpretations.
- A generated routine proposal is transient until the user confirms `Zastosuj i zapisz`; only then does the routine persist.
- This slice does not implement routine-level conflict or overuse warnings; that remains S-06.
- Automated tests are deliberately deferred until the project adopts a shared test runner; this slice was accepted through manual verification, Astro sync, lint, and build.

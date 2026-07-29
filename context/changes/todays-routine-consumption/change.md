---
change_id: todays-routine-consumption
title: Today's routine consumption
status: implemented
created: 2026-07-29
updated: 2026-07-29
---

## Notes

- S-05 jest celowo widokiem tylko do odczytu. Nie zapisuje wykonania krokow, historii uzycia ani jednorazowych zmian planu.
- Widok czyta aktualny dzien bezposrednio z `user_routine_configs.schedule`; po realizacji S-09 automatycznie pokaze zapisane nadpisanie dnia.
- "Dzisiaj" jest wyznaczane po stronie serwera w strefie `Europe/Warsaw`.

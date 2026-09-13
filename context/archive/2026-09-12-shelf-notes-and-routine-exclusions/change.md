---
change_id: shelf-notes-and-routine-exclusions
title: Add product notes and routine exclusions
status: archived
created: 2026-09-12
updated: 2026-09-13
archived_at: 2026-09-13T15:27:18Z
---

## Notes

Add a personal product note and an explicit "do not suggest in AI routines" setting. The note gives AI context; the explicit exclusion prevents the product from being a candidate before routine generation, so a product that irritates the user is never suggested by AI.

## Handoff do lokalnej weryfikacji

Implementacja i automatyczna weryfikacja są gotowe, lecz lokalna migracja nie została zastosowana na tym Macu. Docker Desktop po aktualizacji zakończył start błędem `service command exited with code 1`; nie wykonano żadnego resetu ani operacji na danych produktów.

Na drugim Macu, przed merge PR #2, pobierz gałąź feature'a:

1. W katalogu projektu uruchom `git fetch origin` oraz `git switch codex/shelf-notes-and-routine-exclusions`.
2. Uruchom Docker Desktop i potwierdź, że silnik działa.
3. Uruchom `npx supabase migration up` — **nie** używaj `npx supabase db reset`.
4. Wykonaj wszystkie kroki z sekcji `Manual Testing Steps` w `plan.md`, szczególnie zapis notatki, wykluczenie z AI, pustą kwalifikowaną półkę oraz konflikt zapisanego draftu.
5. Po udanej weryfikacji odznacz/uzupełnij pozostające pozycje manualne i `1.1` w `plan.md`; dopiero wtedy zmiana może zostać oznaczona jako w pełni zaimplementowana i zarchiwizowana.

Po zaakceptowaniu i zmergeowaniu PR #2 wróć do `master` oraz użyj zwykłego `git pull origin master`.

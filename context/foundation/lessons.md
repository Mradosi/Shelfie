# Lessons

## Supabase local migration workflow

- Podczas iteracyjnej pracy nad lokalną bazą preferuj `npx supabase migration up`, żeby zachować lokalnych użytkowników i dane testowe.
- `npx supabase db reset` rezerwuj na checkpointy i weryfikację świeżego startu migracji albo seeda.

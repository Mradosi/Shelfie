# Lessons

## Supabase local migration workflow

- Podczas iteracyjnej pracy nad lokalną bazą preferuj `npx supabase migration up`, żeby zachować lokalnych użytkowników i dane testowe.
- `npx supabase db reset` rezerwuj na checkpointy i weryfikację świeżego startu migracji albo seeda.

## Komunikaty po przekierowaniu

- Nigdy nie przekazuj komunikatów użytkownikowi przez query string (`?error=`, `?success=`, flagi typu `shelf=added` ani stanów akcji).
- Dla przekierowań po formularzu używaj jednorazowego komunikatu flash w ciasteczku `HttpOnly`, z krótkim TTL, odczytanego i usuniętego przy renderowaniu strony docelowej.
- Odpowiedzi JSON dla interaktywnych wysp mogą zawierać komunikat w body i powinny kierować wyłącznie na czystą ścieżkę bez parametrów odpowiedzi.

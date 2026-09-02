# Test Foundation and Deterministic AI Contracts — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Dodajemy pierwszy zestaw automatycznych testów Shelfie dla ryzyk o najwyższym znaczeniu: nieprawidłowych odpowiedzi AI, nieaktualnych analiz oraz błędów, które dziś mogą pokazać użytkownikowi techniczny szczegół. Celem nie jest maksymalna liczba testów, tylko szybka i powtarzalna ochrona kontraktów, od których zależą rutyny i dodawanie produktów.

## Starting Point

Projekt nie ma runnera testów ani skryptów testowych. Ma jednak gotowe, czyste granice domenowe: walidator propozycji rutyny, mechanizmy oznaczania analiz jako nieaktualnych oraz fingerprint zapisanej oceny rutyny.

## Desired End State

`npm test` uruchamia testy TypeScript bez sieci, kluczy AI i bazy Supabase. Wadliwa odpowiedź modelu nie przejdzie do zapisu, zmiana istotnych danych unieważni cache, a każdy endpoint AI zwróci polski komunikat z następną akcją bez ujawniania wiadomości providera.

## Key Decisions Made

| Decision    | Choice                              | Why                                                                      | Source   |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------ | -------- |
| Test runner | Vitest w Node                       | Najtańsza warstwa dla istniejących, czystych kontraktów TypeScript.      | Research |
| Zakres      | Rutyna, analiza produktu i intake   | Chroni oba zgłoszone ryzyka: odpowiedzi AI i dodawanie produktu.         | Plan     |
| Błędy       | Wspólny `{ code, message, action }` | UI nie zależy od surowej treści providera i może wskazać następną akcję. | Plan     |
| Provider    | Parser plus jeden adapter `fetch`   | Daje sygnał dla granicy requestu, bez rozbudowanych i kruchych mocków.   | Plan     |
| Coverage    | Bez progu procentowego              | Ochronę wyznaczają scenariusze ryzyka, nie liczba linii.                 | Plan     |

## Scope

**In scope:**

- Vitest, skrypty npm i małe fixture'y kontraktów AI.
- Bezpieczny kontrakt błędów dla endpointów i klientów AI.
- Deterministyczne testy walidacji rutyny, świeżości cache'u i parsera intake.
- Uzupełnienie cookbooka w `test-plan.md`.

**Out of scope:**

- Testowy Supabase, RLS, e2e/Playwright, coverage threshold i CI.
- Reset lub migracje bazy.
- Automatyczna ocena dermatologicznej poprawności porad AI.

## Architecture / Approach

Provider pozostaje granicą mockowaną przez `fetch`, a testy skupiają się na parserze, walidatorze, mapperze błędów i fingerprintach. Jeden wspólny kontrakt błędów oddzieli wewnętrzną diagnostykę serwera od danych przekazywanych do Reacta.

## Phases at a Glance

| Phase                      | What it delivers                        | Key risk                               |
| -------------------------- | --------------------------------------- | -------------------------------------- |
| 1. Foundation              | Vitest, skrypty i fixture'y             | Brak powtarzalnego testowania          |
| 2. Error contract          | Bezpieczne błędy AI na API i w UI       | Wyciek szczegółów, brak kolejnej akcji |
| 3. Deterministic contracts | Regresje AI, intake i cache'u           | Wadliwe dane oraz stale wynik          |
| 4. Cookbook                | Utrwalona konwencja i pełna weryfikacja | Testy pomijane w kolejnych zmianach    |

**Prerequisites:** Node/npm oraz aktualne zależności projektu; bez Supabase i bez klucza OpenRouter.
**Estimated effort:** około 2-3 sesje implementacyjne w 4 fazach.

## Open Risks & Assumptions

- Wydzielenie publicznego parsera intake może wymagać małego refaktoru bez zmiany zachowania produkcyjnego.
- Stabilne kody błędów muszą objąć wszystkie endpointy AI wskazane w planie, aby UI nie miało dwóch kontraktów równolegle.
- Faza 1 nie dowodzi trwałości w bazie ani poprawności dermatologicznej; te ryzyka są świadomie odroczone.

## Success Criteria (Summary)

- Testy uruchamiają się lokalnie bez zewnętrznych usług.
- Nieprawidłowe odpowiedzi AI i nieaktualne dane są deterministycznie wykrywane.
- Błędy AI są bezpieczne, po polsku i nie pojawiają się w URL-u.

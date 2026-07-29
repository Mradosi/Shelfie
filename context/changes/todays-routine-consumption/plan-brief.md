# Today's Routine Consumption — Plan Brief

> Full plan: `context/changes/todays-routine-consumption/plan.md`

## What & Why

Dodajemy strone `/today`, aby rutyna przestala byc tylko konfiguracja, a stala sie codziennym przypomnieniem: co zrobic rano i wieczorem. Uzytkownik widzi aktualny plan, role i kolejnosc produktow, ale nie musi nic odhaczac ani zapisywac.

## Starting Point

S-03 zapisuje weekly schedule z sekcjami AM/PM dla siedmiu dni, a `/routine` jest obecnie edytorem bazy. Nie ma natomiast widoku dla codziennego odczytu ani stalego wejscia "Dzisiaj" w nawigacji.

## Desired End State

Zalogowany uzytkownik otwiera `/today` z Topbar i widzi polska date w `Europe/Warsaw`, plus dwie zawsze otwarte sekcje: `Rano` i `Wieczorem`. Kroki zachowuja zapisana kolejnosc, maja role i prowadza do szczegolow produktu; bez rutyny strona prowadzi do edycji bazy.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Entry surface | Osobne `/today` | Oddziela codzienne przypomnienie od edytora bazy. | Plan |
| Interakcja | Tylko odczyt | Nie zbieramy statusow ani danych, ktorych obecnie nie wykorzystujemy. | Plan |
| Edycja | CTA do `/routine` | Zmiana bazy pozostaje jednym, zrozumialym flow. | Plan |
| Data source | Bezposredni `schedule[dayKey]` | Jest zgodny z przyszlymi nadpisaniami dni w S-09. | Research |
| Granica dnia | `Europe/Warsaw` na serwerze | Daje stabilny wynik po odswiezeniu dla obecnej grupy docelowej. | Plan |
| Prezentacja | Obie sekcje, zachowany porzadek | Pokazuje caly plan dnia bez zmiany intencji z edytora. | Plan |
| Szczegoly | Link do kanonicznej strony produktu | Nie dubluje istniejacego widoku analizy produktu. | Plan |

## Scope

**In scope:**

- protected route `/today`
- odczyt aktualnego dnia wedlug `Europe/Warsaw`
- AM/PM, role, kolejnosc i linki do szczegolow produktu
- pusty stan z CTA do `/routine`
- link `Dzisiaj` w Topbar

**Out of scope:**

- odhaczanie, pomijanie, historia i analiza wykonania
- edycja, jednorazowe zmiany i nadpisania na `/today`
- wybor innej daty, historia dni i przypomnienia
- tabela, migracja, endpoint mutujacy oraz zmiana dashboardu

## Architecture / Approach

Czysty helper domenowy wyznacza klucz aktualnego dnia i wyciaga jego AM/PM z normalizowanego weekly schedule. Static Astro route pobiera istniejaca konfiguracje rutyny oraz katalog polki, laczy wpisy z produktami i renderuje komponent prezentacyjny. Nie ma client-side state ani zapisu do Supabase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Daily schedule projection | Poprawny, testowalny odczyt konkretnego dnia | Niejawne uzycie bazy zamiast dnia z harmonogramu |
| 2. Today view and navigation | Widok `/today`, empty state i entrypoint w Topbar | Pomieszanie odczytu z edycja albo zgubienie kolejnosci |

**Prerequisites:** Dzialajace S-03, komplet profilu i lokalne migracje juz zastosowane przez `npx supabase migration up`.
**Estimated effort:** ~1-2 sesje implementacyjne przez 2 fazy.

## Open Risks & Assumptions

- `Europe/Warsaw` jest swiadomym ograniczeniem MVP; strefa profilu nie wchodzi do tego slice'a.
- Aktualny weekly schedule jest jednolity, ale resolver musi pozostac poprawny dla przyszlych roznic per dzien.
- Usuniecie produktu z polki juz przycina wpisy harmonogramu przez trigger; UI dodatkowo bezpiecznie pominie ewentualny osierocony wpis.

## Success Criteria (Summary)

- `/today` pokazuje aktualny plan AM/PM oraz produkty w zapisanej kolejnosci.
- Uzytkownik bez rutyny dostaje jasne przejscie do jej edycji.
- Widok nie zapisuje zadnych danych i nie dodaje komunikatow ani flag do URL.

# First skin profile — Plan Brief

> Full plan: `context/changes/first-skin-profile/plan.md`
> Research: `context/changes/first-skin-profile/research.md`

## What & Why

Budujemy pierwszy prawdziwy onboarding dla profilu skóry, oddzielony od technicznego dashboardu. Celem jest zebranie podstawowego skin context w formie zrozumiałej dla użytkownika, ale zapisanie go do już istniejącego kontraktu domenowego bez rozciągania `S-01` na intake produktów czy nową ontologię skincare.

## Starting Point

Dziś repo ma gotowy persisted kontrakt `user_profiles` i działający zapis/odczyt profilu, ale cały flow siedzi na `/dashboard`, który wprost opisuje siebie jako smoke-test contract, a nie finalny onboarding UX. Po sign-in użytkownik wraca na `/`, concerns/goals są wpisywane jako comma-separated free text, a routing nie rozróżnia jeszcze usera z gotowym profilem od usera, który dopiero zaczyna onboarding.

## Desired End State

Po wdrożeniu planu nowy użytkownik po pierwszym skutecznym wejściu do aplikacji trafia do dedykowanego 3-step wizardu dla skin profile. Odpowiada na pytania o zwykłą skórę z ostatnich 2-4 tygodni, zapisuje profil do istniejącego modelu (`skin_type`, `skin_aspects`, `concerns`, `goals`) i kończy onboarding na ekranie, który jasno komunikuje następny krok produktowy bez udawania, że `S-02` już istnieje.

## Key Decisions Made

| Decision                 | Choice                                                                       | Why (1 sentence)                                                                                                | Source          |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------- |
| Główny surface `S-01`    | Dedykowany onboarding route, dashboard zostaje debug/status surface          | Dashboard jest dziś jawnie technicznym smoke testem i nie powinien stać się finalnym onboarding UX.             | Plan            |
| Horyzont pytań           | Zwykła skóra z ostatnich 2-4 tygodni                                         | Daje stabilniejszy profil niż snapshot „dzisiaj”, ale pozostaje osadzony w obserwowalnym doświadczeniu usera.   | Plan            |
| Struktura flow           | Krótki wizard 3-step                                                         | Lepiej grupuje decyzje niż jedna długa strona, a jednocześnie nie ma kosztu „jedno pytanie na ekran”.           | Plan            |
| Zbieranie `skin_aspects` | Pytania obserwowalne + deterministyczne mapowanie do severity                | Lepsza jakość danych niż bezpośredni self-rating i zgodność z researchowym kierunkiem.                          | Research / Plan |
| `concerns` i `goals`     | Suggested chips + custom entries, zapis do istniejących arrays               | Zachowuje szybkość inputu bez przedwczesnego zamrażania canonical vocabulary.                                   | Research / Plan |
| Wymagalność pól          | `skin_type` i komplet `skin_aspects` wymagane; `concerns`/`goals` opcjonalne | To minimalny kontrakt personalizacji bez nadmiernego tarcia na otwartych polach.                                | Plan            |
| Edycja po onboardingu    | Osobny edit surface, bez rerunu first-run wizardu                            | Persisted model trzyma severity levels, a nie surowe odpowiedzi ankietowe, więc edycja musi być osobnym trybem. | Plan            |
| Completion flag          | Brak nowej kolumny; completion wynika z istniejącego profilu                 | Pozwala utrzymać zakres bez migracji schematu i bez driftu względem `F-01`.                                     | Plan            |

## Scope

**In scope:**

- dedykowany post-auth entry point i onboarding route dla skin profile
- 3-step wizard z pytaniami obserwowalnymi dla pięciu `skin_aspects`
- suggested chips + custom entries dla `concerns` i `goals`
- completion screen po pierwszym zapisie
- osobny route późniejszej edycji profilu
- utrzymanie `/dashboard` jako debug/status surface

**Out of scope:**

- zmiany schematu `user_profiles`
- canonical tags i normalizacja concerns/goals
- intake pierwszego produktu i zapisy do shelf
- globalny profile-completion gate dla wszystkich przyszłych authenticated route'ów

## Architecture / Approach

Flow rozdziela trzy odpowiedzialności. `POST /api/auth/signin` kieruje do nowego post-auth gate, który serwerowo sprawdza completion profilu i wybiera onboarding albo dalszy authenticated path. Sam onboarding używa osobnego modułu questionnaire z definicją pytań, chipsów i scoringu, a zapis kończy się w tym samym `UserProfileInput`, którego używa obecny kontrakt domenowy. Późniejsza edycja profilu dostaje własny route i pracuje bezpośrednio na zapisanych levelach, bo raw answers nie są persistowane.

## Phases at a Glance

| Phase                                                  | What it delivers                                                                      | Key risk                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Onboarding entry and route boundaries               | Post-auth gate, onboarding route, auth coverage i wyraźna granica względem dashboardu | Rozlanie scope na globalne gating wszystkich authenticated surface'ów |
| 2. Questionnaire model and persistence wiring          | Question bank, 3-step wizard i mapping do istniejącego kontraktu profilu              | Drift między onboarding payloadem a istniejącym `UserProfileInput`    |
| 3. Completion, edit surface, and verification boundary | Completion screen, osobny edit route i zachowany dashboard debug surface              | Próba odtwarzania pytań obserwowalnych z zapisanych severity levels   |

**Prerequisites:** działający `F-01`, auth flow Supabase, istniejący `user_profiles`
**Estimated effort:** ~2-4 sesje pracy przez 3 fazy

## Open Risks & Assumptions

- Signup z email confirmation oznacza, że onboarding startuje po pierwszym skutecznym sign-in, a nie bezpośrednio po `signUp`.
- Completion screen musi domknąć onboarding bez obiecywania działającego `S-02`.
- Edit surface nie może zakładać istnienia surowych odpowiedzi ankietowych w bazie, bo ich nie persistujemy.

## Success Criteria (Summary)

- Nowy użytkownik trafia do dedykowanego onboardingu skin profile po auth zamiast na techniczny formularz.
- Profil zapisuje się do istniejącego kontraktu bez zmian w schemacie i bez canonical normalization concerns/goals.
- Po onboardingu użytkownik ma czytelny completion state, a później może edytować profil z osobnego route'u bez rerunu first-run flow.

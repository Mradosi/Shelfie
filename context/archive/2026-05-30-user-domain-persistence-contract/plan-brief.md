# User domain persistence contract — Plan Brief

> Full plan: `context/changes/user-domain-persistence-contract/plan.md`

## What & Why

Budujemy minimalny kontrakt persistence dla domeny użytkownika: profil skóry, przynależność produktów do shelf i bazową konfigurację rutyny. Ten slice ma odblokować kolejne etapy roadmapy bez wciągania fundacji w pełny backend intake, AI interpretation czy gotowy UX rutyny.

## Starting Point

Kod ma już działający auth runtime i chroniony `/dashboard`, ale poza `auth.users` nie ma żadnych tabel domenowych, migracji ani helperów dostępu do danych. Dokumentacja repo nadal opisuje starterowy stan "auth only", więc pierwsza fundacja musi objąć także korektę setupu developerskiego.

## Desired End State

Po wdrożeniu planu projekt ma mieć migrację tworzącą minimalne tabele domenowe oraz pełne RLS dla danych user-owned. Aplikacja ma umieć zapisać i odczytać persisted profile data zalogowanego użytkownika przez cienki, chroniony smoke flow, a README ma prowadzić przez tę weryfikację bez rozjazdu z rzeczywistym stanem repo.

## Key Decisions Made

| Decision              | Choice                                                                     | Why (1 sentence)                                                                                                                |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Granica F-01          | Schema + RLS + typed server helpers + smoke path, bez pełnych feature flow | To jest najmniejszy zakres, który daje stabilny fundament dla kolejnych slice'ów i jednocześnie da się zweryfikować end-to-end. |
| Profil użytkownika    | Osobna tabela `user_profiles` 1:1 z `auth.users`                           | Domena skincare ma własny kontrakt i nie powinna mieszać się z warstwą auth.                                                    |
| Styk z F-02           | Minimalny stub `products` już w F-01                                       | Prawdziwy FK od początku zmniejsza ryzyko późniejszej bolesnej migracji relacji shelf -> shared product.                        |
| Model bazowej rutyny  | Jeden per-user `schedule jsonb`                                            | To upraszcza MVP i pozostaje zgodne z PRD oraz z product-centric modelem rutyny.                                                |
| Daily overrides       | Poza F-01                                                                  | `Use only today` ma osobny lifecycle i nie powinno zanieczyszczać bazowej rutyny na etapie fundacji.                            |
| Ownership enforcement | Pełne RLS od pierwszej migracji                                            | Prywatność per-user jest wymaganiem produktu i nie powinna zależeć wyłącznie od filtrów aplikacyjnych.                          |
| Smoke verification    | Minimalny write/read flow dla profilu w chronionym dashboardzie            | Pozwala sprawdzić realną integrację z auth i RLS bez budowania finalnego onboardingu.                                           |

## Scope

**In scope:**

- migracja Supabase z minimalnymi tabelami domenowymi i constraints
- RLS dla wszystkich tabel user-owned
- typed helper layer po stronie serwera
- chroniony smoke flow dla profilu skóry
- aktualizacja README pod nowy stan repo

**Out of scope:**

- shared product metadata i provenance contract z `F-02`
- AI interpretation cache, warnings, fit score, notes
- product intake flows i finalny onboarding UX
- routine editor, daily routine views i `Use only today`

## Architecture / Approach

Podejście jest DB-first z cienką warstwą aplikacyjną. Kontrakt danych powstaje w Supabase jako zestaw minimalnych tabel (`products`, `user_profiles`, `user_shelf_items`, `user_routine_configs`), potem jest opakowany w jeden moduł domenowy po stronie serwera, a istniejący `/dashboard` staje się prostym surface'em weryfikacyjnym dla odczytu i zapisu profilu zalogowanego usera.

## Phases at a Glance

| Phase                                         | What it delivers                                                | Key risk                                                                    |
| --------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Database contract and ownership boundaries | Tabele, FKs, constraints, RLS i seed/reset compatibility        | Rozlanie zakresu F-01 na pełny shared product model                         |
| 2. Typed server contract                      | Moduł helperów domenowych i minimalny write path dla profilu    | Rozproszenie logiki dostępu do tabel po route'ach zamiast jednego kontraktu |
| 3. Verification surface and developer handoff | Smoke flow na dashboardzie, finalna walidacja i aktualny README | Placeholder verification UI może zacząć udawać finalny feature surface      |

**Prerequisites:** działający lokalny Supabase stack, env z `SUPABASE_URL` i `SUPABASE_KEY`, istniejąca ścieżka auth
**Estimated effort:** ~2-3 sesje pracy przez 3 fazy

## Open Risks & Assumptions

- `products` jako stub musi pozostać naprawdę minimalne, inaczej F-01 wchłonie odpowiedzialność `F-02`.
- JSONB schedule zakłada, że MVP nie potrzebuje jeszcze ciężkiej analityki ani granularnych zapytań po każdym routine item.
- Smoke flow w dashboardzie weryfikuje kontrakt techniczny, nie doświadczenie końcowego onboardingu.

## Success Criteria (Summary)

- Repo ma działającą migrację domenową i pełne RLS dla danych user-owned.
- Zalogowany user może zapisać i po odświeżeniu odczytać persisted profile data.
- Dokumentacja setupu i weryfikacji odpowiada realnemu stanowi projektu po wejściu F-01.

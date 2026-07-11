# First manual routine management — Plan Brief

> Full plan: `context/changes/first-manual-routine-management/plan.md`

## What & Why

Budujemy pierwszy prawdziwy flow zarządzania rutyną, który zamyka przejście od "mam produkty na półce" do "mam zapisaną bazową rutynę". Celem `S-03` jest udowodnienie, że użytkownik potrafi ręcznie ułożyć, zapisać, edytować i skasować własną bazę `AM/PM` bez pomocy AI i bez osobnego konfigurowania siedmiu dni tygodnia. UX ma inspirować się mobile modelem z osobnym przełączaniem sekcji porannej i wieczornej.

## Starting Point

Repo ma już `user_routine_configs.schedule`, ale kontrakt jest dziś zbyt ubogi dla manual routine management: trzyma tylko `shelf_item_id`, a TypeScript normalizuje i gubi wszystkie dodatkowe pola wpisu. Jednocześnie po product intake nie istnieje jeszcze żaden entrypoint do rutyny poza powrotem na techniczny dashboard.

## Desired End State

Użytkownik wchodzi na dedykowany route rutyny, przełącza się między sekcją poranną i wieczorną, wybiera produkty z własnej półki, przypisuje im `routine_role` w aktywnej sekcji, zapisuje całość jednym kliknięciem i po odświeżeniu widzi ten sam persisted stan. Delete oznacza pełny reset rutyny do pustego stanu, ale nie usuwa produktów z półki.

## Key Decisions Made

| Decision           | Choice                                             | Why (1 sentence)                                                                                                                 |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Scope lifecycle    | Create + edit + delete                             | `S-03` ma domknąć pełny podstawowy lifecycle bazowej rutyny, a nie tylko jednorazowy wizard.                                     |
| Location of roles  | Role inside routine entries                        | To pozwala uniknąć przebudowy shelf contractu i zachowuje poprawną semantykę ownership.                                          |
| AM/PM ownership    | `AM/PM` wynika z sekcji `morning` / `evening`      | To upraszcza UX i lepiej pasuje do widoku, w którym user przełącza się między rutyną poranną i wieczorną.                        |
| Authoring model    | Jedna baza rutyny z sekcjami `morning` i `evening` | To minimalizuje tarcie przy tworzeniu pierwszej rutyny i zachowuje czytelny mental model "teraz układam poranną albo wieczorną". |
| Persisted model    | Expanded weekly schedule                           | Dzięki temu `S-05` i późniejsze overrides mogą budować na tym samym storage bez migracji.                                        |
| Save model         | Explicit draft + save button                       | To upraszcza walidację, delete flow i unika trudnego autosave na pierwszym editorze.                                             |
| Delete semantics   | Full reset to empty schedule                       | To najczyściej mapuje się do oczekiwania "zbuduj od nowa" bez dotykania półki.                                                   |
| Validation scope   | Technical validity only                            | Warningi i smart conflict logic należą do późniejszych slice'ów, nie do `S-03`.                                                  |
| Future flexibility | Selected-day overrides moved to `S-09`             | Dzięki temu `S-03` pozostaje małe, a pomysł nie ginie z roadmapy.                                                                |
| Frequency controls | Not in `S-03`                                      | `weekday` należy do `S-09`, a `custom interval` / `rotation` / `as needed` są poza obecnym zakresem.                             |

## Scope

**In scope:**

- dedykowany protected route do manualnej rutyny
- jedna bazowa rutyna tworzona z owned shelf items
- sekcje `morning` / `evening`, `routine_role`, reorder, explicit save
- możliwość grupowania wpisów pod nagłówkami ról jak na referencyjnym mobile flow
- CTA do rutyny po product intake i drugi entrypoint z nawigacji
- pełny reset persisted schedule do pustego stanu

**Out of scope:**

- selected-day overrides
- frequency controls (`weekday`, `custom interval`, `rotation`, `as needed`)
- AI draft i AI explanations
- warningi lub blokery dla kombinacji produktów
- autosave i partial section saves
- role zapisywane na poziomie shelf itemów lub shared products
- osobny persisted `step_type`

## Architecture / Approach

Editor operuje na lekkim modelu dwóch sekcji rutyny: `morning` i `evening`. Produkt z półki trafia do aktywnej sekcji i dostaje `routine_role` na poziomie przypisania do rutyny. Serwer przed zapisem rozwija ten draft do weekly schedule w `user_routine_configs`, gdzie `AM/PM` pozostaje reprezentowane przez sekcje `morning` / `evening`. Warstwa domenowa dostaje dedykowany adapter schedule + vocabulary roli, a route `/routine` korzysta z istniejących patterns auth, profile gatingu i redirect-based save handlers.

## Phases at a Glance

| Phase                     | What it delivers                                      | Key risk                                                       |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| 1. Contract and adapters  | SQL + TS contract, role-aware entries, save/reset API | Zgubienie roli lub orderu przy normalizacji schedule           |
| 2. Manual routine surface | Protected route, local draft editor, nav entrypoint   | Zbyt ciężki editor albo ukryta blokada dla usera z małą półką  |
| 3. Flow integration       | CTA po intake, czytelny create/edit/delete lifecycle  | Flow nadal może kończyć się na dashboardzie zamiast na rutynie |

**Prerequisites:** `S-01` i `S-02` muszą już istnieć; selected-day overrides pozostają późniejszym `S-09`.
**Estimated effort:** ~3-4 sesje implementacyjne przez 3 fazy.

## Open Risks & Assumptions

- SQL contract dla `schedule` może wymagać lekkiego uszczelnienia, jeśli chcemy traktować `routine_role` jako obowiązkowe persisted pole, a nie tylko convention app-level.
- Collapse z weekly schedule do bazowego `AM/PM` zakłada uniform weekly state zapisany przez `S-03`; gdy pojawią się overrides, adapter będzie musiał rozróżniać bazę od odstępstw.
- Vocabulary `RoutineRole` musi być wystarczająco małe dla MVP, ale nie tak wąskie, żeby od razu wymuszać migrację przy `S-04` lub `S-06`.
- Trzeba utrzymać spójność między UX opartym o sekcje `morning` / `evening` a obecnym storage, gdzie `AM/PM` również wynika z sekcji `morning` / `evening`.

## Success Criteria (Summary)

- użytkownik może stworzyć, zapisać, odświeżyć i ponownie edytować bazową rutynę, przypisując produktom `routine_role` w sekcji porannej albo wieczornej
- flow po dodaniu produktu prowadzi naturalnie do ułożenia pierwszej rutyny
- delete resetuje tylko rutynę, a półka i produkty pozostają nienaruszone

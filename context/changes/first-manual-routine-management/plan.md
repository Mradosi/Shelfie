# First manual routine management Implementation Plan

## Overview

Ten change dowozi pierwszy realny flow zarządzania bazową rutyną w Shelfie. Użytkownik ma przejść od półki z własnymi produktami do zapisanej, ręcznie ułożonej rutyny `AM/PM`, którą można później edytować albo w całości wyczyścić i zbudować od nowa.

Kluczowa decyzja tego planu brzmi: w `S-03` użytkownik **nie układa osobno siedmiu dni tygodnia**. Zamiast tego tworzy jedną bazową rutynę z dwiema sekcjami: `morning` i `evening`. Dodając produkt do wybranej sekcji, przypisuje mu `routine_role`, a aplikacja zapisuje ten stan w istniejącym weekly schedule tak, aby późniejsze slice'y mogły pokazać `today's routine` i dodać selected-day overrides bez migracji modelu.

## Current State Analysis

Repo ma już persistence contract dla rutyny, ale tylko w najcieńszej możliwej formie. `public.user_routine_configs` przechowuje `schedule jsonb`, a walidator SQL sprawdza wyłącznie strukturę `day -> section -> [{ shelf_item_id }]`, ownership shelf itemu i pruning po usunięciu produktu z półki (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:115`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:188`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:241`).

Po stronie TypeScript `RoutineScheduleEntry` również zawiera dziś tylko `shelf_item_id`, a `normalizeRoutineSchedule()` odrzuca wszystkie dodatkowe pola, więc aktualny kontrakt nie potrafi utrzymać ani roli produktu, ani semantyki potrzebnej do edycji bazowej rutyny (`src/lib/domain/user-domain.ts:139`, `src/lib/domain/user-domain.ts:238`, `src/lib/domain/user-domain.ts:401`).

Flow produktowy kończy się obecnie na dodaniu produktu do półki i success screenie. Ten ekran pozwala jedynie dodać kolejny produkt albo wrócić do dashboardu, a topbar nie ma jeszcze wejścia do surface'u rutyny (`src/pages/products/intake/complete.astro:113`, `src/components/Topbar.astro:12`). Jednocześnie istniejące surface'y już pokazują wzorzec, który warto powtórzyć: profile i produkty używają request-scoped Supabase clienta, profile-complete gatingu i redirect-based route handlers z walidacją `successRedirectTo` / `errorRedirectTo` (`src/pages/start.astro:29`, `src/pages/products/intake.astro:25`, `src/pages/api/domain/profile.ts:98`, `src/pages/api/domain/products/intake.ts:221`).

Roadmapa po aktualizacji jest już zgodna z podjętymi decyzjami. `S-03` ma dowieźć bazową rutynę `AM/PM` bez osobnego authoringu siedmiu dni, a selected-day overrides zostały wyniesione do osobnego `S-09` po `S-05` (`context/foundation/roadmap.md:36`, `context/foundation/roadmap.md:39`, `context/foundation/roadmap.md:124`, `context/foundation/roadmap.md:159`, `context/foundation/roadmap.md:216`). Ostatnie rozmowy doprecyzowały też UX target: wzorujemy się na mobilnym modelu z osobnym przełączaniem `rutyna poranna` / `rutyna wieczorna`, ale **nie kopiujemy** jeszcze pełnego harmonogramu per produkt z opcjami typu weekday / interval / rotation / as-needed.

## Desired End State

Po zakończeniu planu zalogowany użytkownik z uzupełnionym profilem i co najmniej jednym produktem na półce może wejść na dedykowany route rutyny, przełączać się między sekcją poranną i wieczorną, dodawać produkty z własnej półki do wybranej sekcji, przypisywać im `routine_role`, zmieniać kolejność pozycji, zapisać całość jawnie przyciskiem `Zapisz`, a później ponownie wczytać i edytować ten stan.

Persisted model pozostaje weekly schedule kompatybilny z późniejszym `S-05`, ale UX `S-03` operuje na jednej wspólnej bazie dla całego tygodnia. `AM/PM` należy do pojedynczego wpisu produktu w rutynie, a nie do osobno tworzonego "bytu porannej rutyny" w UI. Usunięcie rutyny oznacza pełny reset `schedule` do pustego stanu, bez naruszania półki i shared products.

Weryfikacja końca stanu docelowego:

- użytkownik po product intake widzi jasny CTA do ułożenia pierwszej rutyny;
- baza `AM/PM` zapisuje się, odświeża i wraca po ponownym wejściu na route rutyny;
- ten sam produkt może wystąpić wielokrotnie w różnych sekcjach/dniach, ale każda instancja ma jawnie przypisaną rolę;
- `routine_role` jest ustawiane na poziomie przypisania produktu do rutyny, a `AM/PM` wynika z sekcji `morning` albo `evening`, a nie z pola shared productu albo shelf itemu;
- delete czyści tylko rutynę i zostawia półkę bez zmian;
- selected-day overrides, frequency variants, warningi i AI draft nadal są poza zakresem tego slice'a.

### Key Discoveries:

- Weekly persistence contract już istnieje i jest wystarczająco elastyczny, żeby przechować bazową rutynę bez nowej tabeli, ale obecne normalizowanie schedule zjada wszystko poza `shelf_item_id`, więc nie utrzymamy roli produktu bez zmiany warstwy domenowej (`src/lib/domain/user-domain.ts:139`, `src/lib/domain/user-domain.ts:257`, `src/lib/domain/user-domain.ts:415`).
- SQL trigger prunujący usunięte shelf items już rozwiązuje ważny edge case dla rutyny, więc `S-03` nie powinno omijać `user_shelf_items.id` ani zapisywać wolnych nazw produktów w schedule (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:188`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:241`).
- Istniejący pattern route handlerów w repo jest oparty o bezpieczne parse'owanie redirectów, auth z request-scoped Supabase clienta i redirect/error messaging; nowy save path dla rutyny powinien zachować ten sam charakter zamiast wprowadzać osobny mechanizm sesji (`src/pages/api/domain/profile.ts:98`, `src/pages/api/domain/profile.ts:190`, `src/pages/api/domain/products/add-existing.ts:12`, `src/pages/api/domain/products/intake.ts:221`).
- Product success screen i topbar są dziś naturalnymi miejscami do wpięcia dwóch uzgodnionych entrypointów do rutyny: CTA po dodaniu produktu oraz późniejszego powrotu z nawigacji (`src/pages/products/intake/complete.astro:113`, `src/components/Topbar.astro:12`).
- Screenshoty referencyjne potwierdzają sens modelu "jedna rutyna, grupowanie po krokach, edycja produktu jako wpisu rutyny", ale ich pełny harmonogram per produkt wykracza poza granice `S-03`.

## What We're NOT Doing

- Nie wprowadzamy selected-day overrides w `S-03`; zostały wydzielone do `S-09`.
- Nie zapisujemy roli produktu na poziomie `products` ani `user_shelf_items`; role żyją wyłącznie w entry rutyny.
- Nie dodajemy osobnego `step_type` w `S-03`; jeśli UI chce pokazać typ produktu, korzysta z istniejącego `product.category` jako informacji pomocniczej, nie z nowego persisted pola.
- Nie dodajemy autosave ani częściowych mikro-zapisów sekcji; `S-03` używa jawnego draftu i przycisku `Zapisz`.
- Nie dodajemy AI draftu, AI explanations, warningów ani blockerów dla potencjalnie złych kombinacji produktów.
- Nie budujemy jeszcze per-entry frequency controls (`daily`, `weekday`, `custom interval`, `rotation`, `as needed`); selected weekdays należą do `S-09`, a pozostałe warianty są poza obecnym roadmapem.
- Nie budujemy daily consumption UI, `Use only today`, temporary routine overlays ani osobnych rutyn dla konkretnych dni.
- Nie zamieniamy półki w pełny shelf-management surface z rolami, notatkami czy reakcjami.

## Implementation Approach

Podejście opiera się na rozdzieleniu **authoring modelu** od **persisted modelu**. Użytkownik edytuje jedną bazową rutynę jako dwa zbiory wpisów produktów: `morning` i `evening`. Każdy wpis ma własny `routine_role`, a sama przynależność do sekcji określa `AM/PM`. Przed zapisem serwer rozwija ten draft do pełnego weekly schedule, w którym każdy dzień tygodnia ma identyczną bazę `morning` / `evening`. Dzięki temu `S-03` pozostaje lekkie w UX, a jednocześnie nie wprowadza alternatywnego, manual-only formatu danych, który później trzeba będzie migrować pod `S-05` albo `S-09`.

Druga oś decyzji to lokalizacja semantyki roli. `RoutineRole` nie trafia do shared productów ani shelf itemów, tylko do konkretnej instancji wpisu w rutynie. To utrzymuje poprawne ownership, pozwala temu samemu produktowi pojawić się wielokrotnie w różnych kontekstach i nie rozszerza contractu półki przed czasem. `AM/PM` nie jest natomiast osobnym polem wpisu: w authoringu i w persisted schedule wynika z tego, czy produkt leży w sekcji `morning`, czy `evening`.

Trzecia decyzja to write model: user edytuje lokalny draft, a zapis idzie jednym, jawnie wywoływanym requestem do nowego route handlera. To najlepiej pasuje do istniejących patterns repo, upraszcza walidację "co najmniej jedna niepusta sekcja" i pozwala sensownie obsłużyć pełny reset schedule.

## Critical Implementation Details

### State sequencing

Persisted `schedule` powinien pozostać **rozwiniętym weekly schedule**, nawet jeśli surface `S-03` pokazuje tylko bazowe `AM/PM`. Nie należy zapisywać w bazie osobnego formatu typu `{ morning: [...], evening: [...] }`, bo wtedy `S-05` i `S-09` dostałyby równoległy model danych wymagający migracji albo specjalnych adapterów.

### Routine-entry ownership

`RoutineRole` należy do **RoutineEntry**, czyli do przypisania `shelf_item` do rutyny. Nie należy do `products` ani `user_shelf_items` globalnie. `AM/PM` jest własnością sekcji authoringowej (`morning` albo `evening`), do której trafia wpis. UI może dodatkowo grupować wpisy pod nagłówkami typu "Oczyszczanie", "Kuracja" czy "Ochrona", ale to grupowanie jest projekcją z `routine_role`, a nie osobnym bytem danych.

### User experience spec

Delete w `S-03` oznacza **pełny reset** `user_routine_configs.schedule` do pustego obiektu. To nie jest usuwanie pojedynczego dnia ani sekcji, i nie może usuwać shelf items z `user_shelf_items`.

UI `S-03` może inspirować się referencyjnym mobile flow: jedna rutyna, przełączanie między sekcją poranną i wieczorną, lista produktów edytowanych jako wpisy rutyny. Nie należy jednak kopiować w tej fazie całej sekcji harmonogramu z conditional frequency options. W `S-03` user ustawia tylko `routine_role`, a `AM/PM` wybiera pośrednio przez aktywną sekcję; reszta harmonogramu zostaje na później.

## Phase 1: Routine contract and schedule adapters

### Overview

Ta faza uszczelnia kontrakt danych dla manualnej rutyny i przygotowuje adaptery między lekkim authoringiem `AM/PM` a istniejącym weekly persistence. Bez niej UI albo zgubi role, albo zapisze stan, którego kolejne slice'y nie będą w stanie bezpiecznie wykorzystać.

### Changes Required:

#### 1. Routine schedule database contract

**File**: `supabase/migrations/<timestamp>_routine_schedule_role_contract.sql`

**Intent**: Doprecyzować SQL-level contract dla `user_routine_configs.schedule`, tak aby manual routine entries mogły legalnie przechowywać semantykę roli bez rozmywania ownership ani kształtu bazowej rutyny.

**Contract**: Migracja aktualizuje walidator `public.validate_user_routine_schedule()` tak, aby entry rutyny nadal musiało wskazywać `shelf_item_id` należące do tego usera, ale dodatkowo wymagało jawnego `routine_role` jako stringu. Kontrakt pozostaje elastyczny na poziomie kluczy dni i sekcji, a array order pozostaje znaczący jako kolejność wykonywania kroków. Pruning po usunięciu shelf itemu nadal działa na `shelf_item_id` bez zmiany semantyki delete triggera.

#### 2. Schedule authoring and validation module

**File**: `src/lib/domain/routine-schedule.ts`

**Intent**: Wydzielić z warstwy UI i route'ów jedyne source of truth dla roli produktu, authoringu bazowej rutyny i transformacji do persisted weekly schedule.

**Contract**: Moduł definiuje zamknięty `RoutineRole` vocabulary, labelki i opisy user-facing, typ draftu bazowej rutyny w postaci dwóch sekcji `morning[]` i `evening[]`, parser payloadu od edytora, helper wymuszający warunek "co najmniej jedna niepusta sekcja", helper dopuszczający wielokrotne użycie tego samego `shelf_item_id`, oraz adaptery między authoringiem sekcyjnym a persisted weekly schedule. Adapter collapse działa poprawnie tylko dla uniform weekly state zapisanej przez `S-03`; selected-day divergence pozostaje domeną `S-09`.

#### 3. User-domain routine and shelf read model

**File**: `src/lib/domain/user-domain.ts`

**Intent**: Rozszerzyć warstwę domenową tak, aby przestała gubić dodatkowe pola wpisów rutyny i umiała podać editorowi owned shelf catalog z metadanymi produktów.

**Contract**: `RoutineScheduleEntry` przestaje być jednopolem i zachowuje co najmniej `shelf_item_id` oraz `routine_role`; `AM/PM` pozostaje reprezentowane przez położenie wpisu w sekcji `morning` albo `evening`. `normalizeRoutineSchedule()` nie odrzuca już wspieranych pól wpisu. Moduł eksportuje loader, który zwraca owned shelf items wraz z minimalnymi danymi produktu potrzebnymi do wyboru i opisu w edytorze (`name`, `brand`, `category`, opcjonalnie image). Jeśli UI chce pokazać "typ kroku", bierze go z `product.category` jako read-only hint. `getUserRoutineConfig()` i `upsertUserRoutineConfig()` pozostają głównym persistence API dla downstream slice'ów.

#### 4. Protected routine save/reset route

**File**: `src/pages/api/domain/routine.ts`

**Intent**: Dodać pierwszy server-side write path dla manualnej rutyny, spójny z dotychczasowymi patterns auth, redirectów i walidacji w repo.

**Contract**: Route działa wyłącznie dla aktualnie zalogowanego użytkownika, przyjmuje payload draftu rutyny z sekcjami `morning` i `evening`, rozwija go do persisted weekly schedule przed zapisem i obsługuje dwa tryby: `save` oraz `reset`. Save odrzuca pusty draft i nie pozwala zapisać entry bez `routine_role`; nie przyjmuje jeszcze frequency variants ani `step_type`. Reset czyści schedule do `{}`. Route używa wewnętrznych redirect pathów analogicznie do innych domain endpoints, z opcjonalną ścieżką JSON jeśli edytor będzie wysyłał fetch zamiast klasycznego submitu.

### Success Criteria:

#### Automated Verification:

- Routine schedule migration applies cleanly on local Supabase: `npx supabase db reset`
- Astro types and lint pass for the new routine schedule types and API contract: `npx astro sync && npm run lint`

#### Manual Verification:

- Role-bearing routine entries round-trip through the domain layer without losing role or array order
- Full reset clears `user_routine_configs.schedule` without removing owned shelf items

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Protected manual routine surface

### Overview

Ta faza wprowadza pierwszy user-facing editor rutyny. Jej zadaniem nie jest jeszcze codzienne użycie ani inteligentna walidacja skincare, tylko bezpieczne przejście od "mam produkty na półce" do "mam zapisaną bazową rutynę". UX może inspirować się mobile flow, który pokazuje jedną rutynę pogrupowaną po krokach i pozwala edytować produkt jako wpis rutyny.

### Changes Required:

#### 1. Manual routine route

**File**: `src/pages/routine.astro`

**Intent**: Stworzyć dedykowany, chroniony surface dla manual routine management zamiast rozpychać tę odpowiedzialność w dashboardzie albo product success screenie.

**Contract**: Route wymaga zalogowanego użytkownika, stosuje ten sam profile-complete gate co obecny product flow, ładuje owned shelf catalog i persisted routine config, mapuje ewentualne query param success/error do statusu strony i renderuje pierwszy editor rutyny. Główny ekran pokazuje jedną bazową rutynę z wyraźnym przełączaniem `poranna` / `wieczorna`, a w obrębie aktywnej sekcji może dodatkowo grupować wpisy pod nagłówkami `routine_role`. Jeśli user nie ma jeszcze produktów albo ma ich bardzo mało, route pokazuje miękkie guidance + CTA do `/products/intake`, ale nie blokuje wejścia.

#### 2. Interactive manual editor

**File**: `src/components/routine/ManualRoutineEditor.tsx`

**Intent**: Udostępnić lokalny draft editor dla bazowej rutyny, który pozwala userowi komponować `AM` i `PM` bez natychmiastowego zapisu każdej zmiany.

**Contract**: Komponent renderuje jedną bazową rutynę z dwoma sekcjami: poranną i wieczorną. UI może grupować wpisy pod nagłówkami ról, a dodanie/edycja produktu może odbywać się przez osobny detail surface (modal, sheet albo dedykowany panel) inspirowany referencyjnym mobile flow. Komponent pozwala wybierać produkty z owned shelf catalog, przypisywać rolę w obrębie aktywnej sekcji, usuwać wpisy, zmieniać kolejność wpisów w obrębie sekcji i wielokrotnie używać tego samego produktu w różnych miejscach. `step_type` nie jest osobnym polem do edycji; ewentualny typ produktu może być pokazany tylko informacyjnie z `product.category`. Editor ma stan dirty, wspiera jawny przycisk `Zapisz`, blokuje zapis pustego draftu i wystawia pełny reset z potwierdzeniem użytkownika. Nie renderuje jeszcze edytowalnych frequency controls.

#### 3. Auth and navigation entrypoint

**File**: `src/middleware.ts`

**Intent**: Rozszerzyć istniejący auth boundary tak, aby route rutyny był chroniony dokładnie tak samo jak pozostałe authenticated surfaces.

**Contract**: `/routine` trafia do listy `PROTECTED_ROUTES`; middleware nie podejmuje decyzji o tym, czy user ma już produkty albo rutynę, tylko utrzymuje existing session-only responsibility.

#### 4. Stable navigation entrypoint

**File**: `src/components/Topbar.astro`

**Intent**: Dodać uzgodniony drugi entrypoint do rutyny, żeby user mógł wrócić do niej później bez polegania wyłącznie na success screenie po product intake.

**Contract**: Topbar dodaje link do `/routine` obok istniejących protected surfaces. To jest entrypoint do create/edit/delete bazowej rutyny, nie do daily consumption ani AI draftu.

### Success Criteria:

#### Automated Verification:

- Production build passes with the new protected routine route and editor surface: `npm run build`

#### Manual Verification:

- User with owned shelf items can switch between morning and evening sections, assign `routine_role` per product entry, build a base routine, reorder entries, save it, refresh the page, and see the same state loaded back
- User with zero or very few products sees soft guidance and CTA to `/products/intake`, but the route itself remains accessible

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Flow integration and lifecycle polish

### Overview

Ta faza domyka `S-03` jako spójny flow, a nie tylko osobny editor. Użytkownik ma dostać czytelny następny krok po product intake oraz zrozumiały lifecycle pierwszej rutyny: create, edit i reset do pustego stanu.

### Changes Required:

#### 1. Product success handoff

**File**: `src/pages/products/intake/complete.astro`

**Intent**: Zamienić obecny koniec `S-02` w naturalne przejście do `S-03`, zamiast kończyć flow na dashboardzie technicznym.

**Contract**: Success screen zachowuje możliwość dodania kolejnego produktu, ale dodaje wyraźny CTA do `/routine`. Copy odróżnia sytuację "tworzysz pierwszą rutynę" od powrotu do edycji już istniejącej bazy, jeśli taki stan można ustalić z serwera albo query contextu.

#### 2. Routine lifecycle feedback

**File**: `src/pages/routine.astro`

**Intent**: Uczytelnić create/edit/delete lifecycle tak, aby użytkownik rozumiał, czy właśnie zapisuje pierwszą rutynę, edytuje istniejącą czy wrócił do pustego stanu po resecie.

**Contract**: Page ma osobne komunikaty i empty states dla: pierwszego wejścia bez rutyny, zapisanego stanu po save oraz pustego stanu po delete. Delete oznacza pełny reset schedule i pozostawia usera w clean slate gotowym do ponownego ułożenia bazy.

### Success Criteria:

#### Automated Verification:

- Final repository verification passes after the full slice lands: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- After product intake, the user can move directly into routine creation from the success surface and later re-enter routine editing from the main navigation
- After deleting the routine, the user sees a clean empty state ready to rebuild from scratch, with shelf products still intact

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests:

- Repo nadal nie ma committed test suite, więc transformacje `base AM/PM <-> weekly schedule` powinny być maksymalnie czystymi, małymi funkcjami w dedykowanym module, łatwymi do ręcznej weryfikacji przez kontrolowane przypadki wejścia.
- App-level parser rutyny powinien mieć jedno miejsce walidacji pustego draftu, roli produktu i wspieranych sekcji `morning` / `evening`, żeby ograniczyć rozproszone warunki w komponencie i route handlerze.

### Integration Tests:

- Local Supabase reset z nową migracją kontraktu rutyny i zapis manualnej rutyny przez nowy route handler.
- Round-trip persisted state: save -> refresh -> load -> edit -> save again.
- Reset flow: delete -> empty state -> rebuild from scratch.

### Manual Testing Steps:

1. Zalogować użytkownika z ukończonym profilem i co najmniej jednym produktem na półce.
2. Po dodaniu produktu przejść z success screenu do `/routine`.
3. Ułożyć bazową rutynę, przełączając się między sekcją poranną i wieczorną, przypisując produktom `routine_role` oraz zmieniając kolejność wpisów.
4. Zapisać rutynę, odświeżyć route i potwierdzić, że persisted stan wraca bez utraty roli i kolejności.
5. Dodać ten sam produkt w więcej niż jednym miejscu i potwierdzić, że zapis przechodzi.
6. Wykonać pełny reset rutyny i potwierdzić, że półka nadal zawiera wszystkie produkty.

## Performance Considerations

Dataset `S-03` jest mały i user-scoped, ale editor nie powinien wpadać w N+1 lookup po produktach. Owned shelf catalog powinien być ładowany jednym read modelem zwracającym shelf membership wraz z podstawowymi danymi produktu, zamiast osobno dociągać każdy `product_id`.

Authoring adapter nie powinien przechowywać dodatkowego `position` w bazie, jeśli kolejność i tak wynika z orderu tablicy w schedule. To upraszcza payload i zmniejsza liczbę miejsc, które mogłyby się rozjechać między UI a persistence.

## Migration Notes

Ta zmiana świadomie **nie wprowadza nowej tabeli** dla bazowej rutyny. Persisted weekly schedule z `user_routine_configs` pozostaje jedynym źródłem prawdy, a `S-03` dokłada tylko adapter authoringowy oraz rozszerza entry contract o `routine_role`. `AM/PM` pozostaje reprezentowane przez ułożenie wpisów w `morning` / `evening`, nawet jeśli w UI user ustawia to na poziomie produktu w rutynie.

Selected-day overrides są już zapisane w roadmapie jako `S-09`, więc `S-03` nie powinno utrwalać osobnego formatu bazy `AM/PM`, który później trzeba byłoby mapować na weekly varianty. Jeśli w przyszłości dany dzień ma odbiegać od bazy, stanie się to przez modyfikację konkretnego dnia względem już istniejącego weekly schedule, a nie przez zmianę formatu storage.

## References

- Roadmap north-star and `S-03` / `S-09` boundaries: `context/foundation/roadmap.md:24`, `context/foundation/roadmap.md:36`, `context/foundation/roadmap.md:124`, `context/foundation/roadmap.md:159`, `context/foundation/roadmap.md:216`
- Existing routine persistence contract: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:115`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:188`
- Current domain normalization and routine read/write helpers: `src/lib/domain/user-domain.ts:139`, `src/lib/domain/user-domain.ts:238`, `src/lib/domain/user-domain.ts:401`
- Current product categories that can inform routine-role vocabulary: `src/lib/domain/product-domain.ts:10`
- Existing profile-complete gate for protected product flows: `src/pages/start.astro:29`, `src/pages/products/intake.astro:25`
- Existing auth middleware boundary: `src/middleware.ts:4`
- Existing redirect-based domain route patterns: `src/pages/api/domain/profile.ts:98`, `src/pages/api/domain/products/add-existing.ts:12`, `src/pages/api/domain/products/intake.ts:221`
- Current post-intake success handoff and navigation gap: `src/pages/products/intake/complete.astro:113`, `src/components/Topbar.astro:12`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Routine contract and schedule adapters

#### Automated

- [x] 1.1 Routine schedule migration applies cleanly on local Supabase
- [x] 1.2 Astro types and lint pass for the new routine schedule types and API contract

#### Manual

- [x] 1.3 Role-bearing routine entries round-trip through the domain layer without losing role or array order — 7de8260
- [x] 1.4 Full reset clears `user_routine_configs.schedule` without removing owned shelf items — 7de8260

### Phase 2: Protected manual routine surface

#### Automated

- [x] 2.1 Production build passes with the new protected routine route and editor surface — 682800c

#### Manual

- [x] 2.2 User with owned shelf items can assign roles inline, build a base `AM/PM` routine, reorder entries, save it, refresh the page, and see the same state loaded back — 682800c
- [x] 2.3 User with zero or very few products sees soft guidance and CTA to `/products/intake`, but the route itself remains accessible — 682800c

### Phase 3: Flow integration and lifecycle polish

#### Automated

- [x] 3.1 Final repository verification passes after the full slice lands — 7de8260

#### Manual

- [x] 3.2 After product intake, the user can move directly into routine creation from the success surface and later re-enter routine editing from the main navigation — 7de8260
- [x] 3.3 After deleting the routine, the user sees a clean empty state ready to rebuild from scratch, with shelf products still intact — 7de8260

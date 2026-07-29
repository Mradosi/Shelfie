# Today's Routine Consumption Implementation Plan

## Overview

Dodajemy chroniony widok `/today`, w ktorym zalogowana osoba widzi obowiazujaca na dzis rutynę poranna i wieczorna. Jest to swiadomie prosty, tylko do odczytu punkt codziennego uzycia: przypomina kolejnosc produktow i ich role, prowadzi do szczegolow produktu oraz odsyla do edytora bazy, gdy planu jeszcze nie ma.

Nie budujemy trackera wykonania. Nie pytamy, czy krok zostal zrobiony, nie przechowujemy historii, nie edytujemy planu na ekranie "Dzisiaj" i nie tworzymy osobnego dziennego modelu danych. Taki zakres zapobiega zbieraniu danych bez aktualnego zastosowania i zachowuje wyrazna granice miedzy konsumpcja planu a jego authoringiem.

## Current State Analysis

`S-03` przechowuje rutynę jako `user_routine_configs.schedule`: rozwinięty obiekt siedmiu dni, z sekcjami `morning` i `evening`. Edytor `/routine` zapisuje dzisiaj jednolita baze do wszystkich dni, ale sam kontrakt juz pozwala odczytac konkretny dzien. Obecna strona rutyny sluzy wylacznie do tworzenia i edycji bazy, a Topbar nie ma entrypointu dla codziennego widoku.

## Desired End State

Zalogowany uzytkownik z kompletnym profilem moze otworzyc `/today` z glownej nawigacji i zobaczyc polska date oraz dwie zawsze widoczne sekcje: `Rano` i `Wieczorem`. Kazda sekcja zachowuje dokladnie kolejnosc zapisana w harmonogramie, pokazuje role kroku i prowadzi z karty produktu do kanonicznego `/products/[productId]`.

Gdy dla aktualnego dnia nie ma krokow, strona wyjasnia brak planu i daje jednoznaczne CTA `Edytuj bazowa rutynę` do `/routine`. Nie zachodzi zapis do bazy, niezaleznie od tego, czy uzytkownik tylko otwiera strone, odswieza ja, czy przechodzi do szczegolow produktu.

### Key Discoveries:

- `expandBaseRoutineToWeeklySchedule()` juz rozwija baze AM/PM do wpisow dla wszystkich siedmiu dni, a `RoutineSchedule` przechowuje role przy kazdym wpisie: `src/lib/domain/routine-schedule.ts:49`, `src/lib/domain/routine-schedule.ts:228`.
- `collapseWeeklyScheduleToBaseRoutine()` celowo zaklada identyczne dni i rzuca blad przy roznicach; widok dzienny nie moze go uzywac, bo S-09 wprowadzi przyszle roznice per dzien: `src/lib/domain/routine-schedule.ts:241`.
- `getUserRoutineConfig()` oraz `listUserShelfCatalog()` udostepniaja juz caly odczyt potrzebny do skojarzenia wpisow harmonogramu z produktami, bez N+1 zapytan: `src/lib/domain/user-domain.ts:425`, `src/lib/domain/user-domain.ts:472`.
- Chronione surfaces sa zabezpieczane w jednym miejscu przez `PROTECTED_ROUTES`, a Topbar buduje menu z jednej listy linkow: `src/middleware.ts:3`, `src/components/Topbar.astro:3`.
- Uzgodniona zasada aplikacji zabrania przekazywania komunikatow przez query string; ten read-only flow nie dodaje zadnego API ani parametrow odpowiedzi: `context/foundation/lessons.md`.

## What We're NOT Doing

- Nie zapisujemy statusu "uzyte", "pominięte" ani historii wykonania kroku.
- Nie dodajemy, nie usuwamy, nie zmieniamy kolejnosci i nie nadpisujemy krokow z `/today`.
- Nie wprowadzamy daily overrides, wyboru dnia, widoku historii ani harmonogramow typu interval/frequency; to odpowiedzialnosc przyszlego S-09 i pozniejszych slice'ow.
- Nie zmieniamy formatu `user_routine_configs.schedule`, nie dodajemy tabeli, migracji, triggera ani endpointu mutujacego.
- Nie zmieniamy dashboardu w domyslny ekran po zalogowaniu.
- Nie dublujemy szczegolow produktu w modalu.

## Implementation Approach

Dodajemy niewielka, czysta projekcje domenowa: z aktualnego czasu w `Europe/Warsaw` wyznacza ona klucz dnia (`monday`–`sunday`) i zwraca sekcje tego dnia z juz znormalizowanego harmonogramu. Strona `/today` pobiera jednym read modelem konfiguracje rutyny i katalog polki, laczy wpisy przez `shelf_item_id`, a nastepnie renderuje statyczny komponent Astro. To odczytuje bezposrednio konkretny dzien zamiast baze, dlatego po S-09 te same kontrakty pokaza odmienne zaplanowane kroki bez migracji ani refaktoru strony.

## Critical Implementation Details

### Timing & lifecycle

Klucz dnia trzeba wyznaczac na serwerze w `Europe/Warsaw` w chwili obslugi requestu. Helper musi przyjmowac `Date` jako argument, a nie wyliczac daty przy imporcie modulu; eliminuje to ukryty stan i pozwala jednoznacznie sprawdzic granice dnia.

### State sequencing

`/today` ma korzystac z wpisow `schedule[dayKey]`, nie z `collapseWeeklyScheduleToBaseRoutine()`. Obecnie oba odczyty dadza ten sam wynik, ale tylko pierwszy zachowa przyszle rozne dni po S-09.

## Phase 1: Daily schedule projection

### Overview

Faza wprowadza minimalny, czysty kontrakt odczytu konkretnego dnia nad juz istniejacym weekly schedule. Nie dotyka persistence i nie zmienia znaczenia bazy AM/PM.

### Changes Required:

#### 1. Daily routine resolver

**File**: `src/lib/domain/routine-schedule.ts`

**Intent**: Dodac jedno zrodlo prawdy dla wyznaczenia dzisiejszego dnia oraz pobrania jego sekcji z weekly schedule, zeby route nie powielal formatowania daty ani defensywnej normalizacji JSON.

**Contract**: Modul eksportuje helper przyjmujacy `Date` i zwracajacy wspierany `RoutineDayKey` dla strefy `Europe/Warsaw`, a takze resolver zwracajacy `morning` i `evening` dla wskazanego klucza dnia. Resolver normalizuje wejsciowy schedule, zachowuje array order i dla brakujacego dnia lub sekcji zwraca puste tablice. Nie zmienia ani nie zapisuje przekazanego obiektu.

### Success Criteria:

#### Automated Verification:

- Astro types and lint pass for the daily projection contract: `npx astro sync && npm run lint`

#### Manual Verification:

- Dla daty w strefie `Europe/Warsaw` resolver wybiera poprawny klucz dnia i zwraca produkty w zapisanej kolejnosci, a brakujace sekcje pozostaja puste
- Odczyt konkretnego dnia nie korzysta z `collapseWeeklyScheduleToBaseRoutine()` i nie zmienia zapisanego schedule

**Implementation Note**: Po zakonczeniu fazy i przejsciu weryfikacji automatycznej zatrzymaj sie na potwierdzenie manualnego testu przed kolejna faza. Checkboxy postepu znajduja sie tylko w sekcji `## Progress`.

---

## Phase 2: Today view and navigation

### Overview

Faza udostepnia gotowy do codziennego uzycia, tylko do odczytu surface. Uzytkownik widzi oba czasy rutyny na raz i moze przejsc do danych produktu albo do edycji bazy, ale nie wykona zadnej mutacji na stronie.

### Changes Required:

#### 1. Protected Today route

**File**: `src/pages/today.astro`

**Intent**: Utworzyc kanoniczny ekran dziennego podgladu, niezalezny od edytora `/routine` i odporny na brak zapisanej rutyny.

**Contract**: Route wymaga sesji oraz kompletnego profilu, zgodnie z `/routine`. Laduje rownolegle `getUserRoutineConfig()` i `listUserShelfCatalog()`, wyznacza dzien przez nowy helper i przekazuje tylko wpisy aktualnego dnia do warstwy prezentacji. Renderuje date po polsku, obie sekcje AM/PM zawsze widoczne, bez formularzy, requestow POST, query parametrow stanu lub client-side island. Jezeli nie ma konfiguracji albo obie sekcje sa puste, pokazuje empty state z CTA `/routine`; blad konfiguracji Supabase stosuje istniejacy wzorzec komunikatu route-level.

#### 2. Presentational daily routine component

**File**: `src/components/routine/TodayRoutine.astro`

**Intent**: Oddzielic projekcje danych od czytelnej prezentacji dziennej rutyny i utrzymac spojnosc wizualna z obecnymi kartami Shelfie.

**Contract**: Komponent przyjmuje dwie uporzadkowane listy wpisow, dla kazdego laczy `shelf_item_id` z itemem katalogu polki i renderuje karte z numerem kroku, etykieta `ROUTINE_ROLE_LABELS`, marka, nazwa oraz opcjonalnym obrazem. Nazwa lub karta prowadzi do `/products/[productId]`. Nie grupuje wpisow po roli i nie zmienia ich kolejnosci. Niespojny, nieodnaleziony shelf item jest pomijany defensywnie zamiast powodowac blad calej strony; normalna sciezka pozostaje pokryta istniejacym pruning triggerem bazy.

#### 3. Global route protection and entrypoint

**Files**: `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: Umiescic widok dzienny jako stale, bezpieczne wejscie w glownym flow aplikacji.

**Contract**: `/today` zostaje dodane do `PROTECTED_ROUTES`. Topbar dodaje link `Dzisiaj` jako osobna pozycje glownej nawigacji i zachowuje prawidlowe `aria-current` dla aktywnego route. `/dashboard` zachowuje obecne zachowanie.

### Success Criteria:

#### Automated Verification:

- Final repository verification passes with the new protected page: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Uzytkownik z zapisana rutyna otwiera `/today` z Topbar i widzi poprawna date oraz rownolegle sekcje `Rano` i `Wieczorem`
- Kroki w obu sekcjach zachowuja kolejnosc z `/routine`, maja czytelna role i prowadza do szczegolow wlasciwego produktu
- Uzytkownik bez rutyny widzi wyjasnienie oraz CTA `Edytuj bazowa rutynę`, ktore prowadzi do `/routine`, bez przekierowan, komunikatow lub flag w URL
- Zmiana kolejnosci lub skladu w bazowej rutynie, zapis w `/routine` i odswiezenie `/today` pokazuje nowy stan bez potrzeby dodatkowego zapisu dziennego

**Implementation Note**: Po zakonczeniu fazy i przejsciu weryfikacji automatycznej zatrzymaj sie na potwierdzenie manualnego testu przed zamknieciem slice'a. Checkboxy postepu znajduja sie tylko w sekcji `## Progress`.

## Testing Strategy

### Unit Tests:

- Repo nie ma committed test suite, wiec helper dziennej projekcji ma pozostac mala, czysta funkcja z parametrem `Date`, bez odczytow Supabase i stanu globalnego.
- Ręcznie sprawdzic mapowanie dnia oraz puste sekcje dla kontrolowanych danych na granicy dnia w `Europe/Warsaw`.

### Integration Tests:

- Zapisana baza AM/PM -> odczyt `/today` -> klikniecie produktu -> kanoniczne szczegoly produktu.
- Pusta konfiguracja albo reset rutyny -> `/today` pokazuje tylko empty state i przejscie do `/routine`.
- Przyszly kontrakt S-09: testowana projekcja czyta konkretny `schedule[dayKey]`, wiec nie zaklada jednorodnosci tygodnia.

### Manual Testing Steps:

1. Zalogowac uzytkownika z ukonczonym profilem, produktami na polce i zapisana baza AM/PM.
2. Otworzyc `Dzisiaj` z Topbar i potwierdzic polska date oraz dwie widoczne sekcje bez mozliwosci odhaczania lub edycji.
3. Porownac kolejnosc i role krokow z `/routine` oraz przejsc z kazdej karty do prawidlowych szczegolow produktu.
4. Zmienic kolejnosc lub sklad bazy w `/routine`, zapisac, wrocic do `/today` i odswiezyc strone, aby potwierdzic aktualny odczyt bez osobnego save.
5. Wykonac reset rutyny, wejsc na `/today` i potwierdzic empty state oraz dzialajace CTA `Edytuj bazowa rutynę`.
6. Sprawdzic URL podczas wszystkich powyzszych krokow: ma pozostac czysta sciezka, bez `error`, `success` ani flag stanu w query string.

## Performance Considerations

Widok wykonuje dwa istniejace user-scoped odczyty rownolegle: konfiguracji rutyny i katalogu polki. Nie dochodza N+1 lookupy ani wywolania AI. Join wpisow z produktami odbywa sie w pamieci przez indeks po `shelf_item_id`; przy przewidywalnie malej rutynie jest to prostsze i wystarczajace.

## Migration Notes

Brak migracji. S-05 jest read-only consumerem istniejacego `user_routine_configs.schedule`; nie wolno uruchamiac `supabase db reset`. Ewentualne przyszle migracje dla S-09 maja rozszerzac model nadpisan per dzien, a nie dodawac rownoleglego modelu "dzisiejszego wykonania".

## References

- S-05 outcome i granica wobec S-09: `context/foundation/roadmap.md`
- Routine entry, role vocabulary i weekly expansion: `src/lib/domain/routine-schedule.ts:1`, `src/lib/domain/routine-schedule.ts:49`, `src/lib/domain/routine-schedule.ts:228`
- Existing routine read model i shelf catalog: `src/lib/domain/user-domain.ts:425`, `src/lib/domain/user-domain.ts:472`
- Existing protected routine page and profile gate: `src/pages/routine.astro:20`
- Existing route protection and navigation patterns: `src/middleware.ts:3`, `src/components/Topbar.astro:3`
- No response state in URLs: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Daily schedule projection

#### Automated

- [x] 1.1 Astro types and lint pass for the daily projection contract — 4b34e31

#### Manual

- [x] 1.2 Resolver selects the correct `Europe/Warsaw` day and preserves entry order with empty-section handling
- [x] 1.3 Daily reading avoids base-routine collapse and does not mutate persisted schedule

### Phase 2: Today view and navigation

#### Automated

- [x] 2.1 Final repository verification passes with the new protected page

#### Manual

- [x] 2.2 Saved routine is visible from Topbar with both AM/PM sections and the current Polish date
- [x] 2.3 Cards preserve order and roles and open the matching product details page
- [x] 2.4 Empty routine state links to `/routine` without state in the URL
- [x] 2.5 Changes saved in the base routine are reflected on `/today` without a daily save

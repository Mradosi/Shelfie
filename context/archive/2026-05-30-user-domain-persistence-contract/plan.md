# User domain persistence contract Implementation Plan

## Overview

Ten change wprowadza pierwszy rzeczywisty kontrakt persistence dla domeny użytkownika w Shelfie. Celem jest zbudowanie minimalnego fundamentu dla profilu skóry, shelf membership i bazowej konfiguracji rutyny, z granicami ownership zgodnymi z modelem "jeden zalogowany user widzi tylko swoje dane", ale bez wchodzenia w pełny backend intake, AI interpretation ani końcowy UX kolejnych slice'ów.

## Current State Analysis

Aktualny kod ma już działający auth runtime oparty o Supabase SSR i middleware, ale nie ma jeszcze żadnej persisted warstwy domenowej poza `auth.users`. `createClient()` zwraca serwerowego klienta Supabase dla bieżącego requestu i cookies, a middleware ładuje `context.locals.user` oraz chroni `/dashboard` przed niezalogowanymi użytkownikami (`src/lib/supabase.ts:5`, `src/middleware.ts:6`).

Dashboard jest dziś tylko placeholderem dla zalogowanego użytkownika i nie wykonuje żadnych operacji na danych domenowych (`src/pages/dashboard.astro:7`). README nadal opisuje starterowy stan projektu, w którym nie ma tabel ani migracji poza auth (`README.md:73`, `README.md:114`).

Roadmapa definiuje `F-01` jako minimalny shared contract dla per-user skin context, shelf items, product schedules i routine configuration, z wyraźnym zakazem rozrostu do pełnego backend buildoutu (`context/foundation/roadmap.md:65`). PRD jednocześnie wymaga prywatności per-user, trwałości danych między sesjami oraz uproszczonego modelu schedule dla MVP (`context/foundation/prd.md:129`, `context/foundation/prd.md:136`, `context/foundation/prd.md:147`).

Notatki architektoniczne dobrze rozdzielają shared product catalog, osobisty shelf i bazową rutynę, ale proponowany model `user_products` jest szerszy niż potrzeba `F-01`. Dla tego slice'a bierzemy z nich tylko load-bearing granice: shared `products` jako osobny byt, shelf i routine jako osobne koncepty oraz JSON-owy model bazowej rutyny na MVP (`context/foundation/architecture-notes.md:87`, `context/foundation/architecture-notes.md:138`, `context/foundation/architecture-notes.md:150`, `context/foundation/architecture-notes.md:678`).

## Desired End State

Po zakończeniu tego planu repo ma zawierać działającą migrację Supabase, która tworzy minimalny kontrakt danych dla domeny użytkownika: stub shared product identity, per-user skin profile, per-user shelf membership i per-user base routine configuration. Profil skóry ma przechowywać `skin_type`, strukturalne `skin_aspects`, swobodne `concerns` i `goals` oraz opcjonalne `notes`, zamiast mieszać cały stan skóry w pojedynczej liście concernów. Wszystkie user-owned tabele są chronione przez RLS oparte o `auth.uid()`, a aplikacja ma cienką, typowaną warstwę serwerową i chroniony smoke flow, który pozwala zapisać i ponownie odczytać ten kontrakt dla zalogowanego użytkownika.

Weryfikacja końca stanu docelowego:
- lokalny reset bazy i migracje przechodzą czysto;
- zalogowany user może zapisać i odświeżyć persisted profile data;
- niezalogowany user nadal nie ma dostępu do surface'u weryfikacyjnego;
- README nie twierdzi już błędnie, że projekt nie ma tabel domenowych ani migracji.

### Key Discoveries:

- Istniejący runtime auth już dostarcza request-scoped Supabase client i `locals.user`, więc nowa warstwa domenowa powinna się na tym oprzeć, zamiast wprowadzać drugi mechanizm sesji (`src/lib/supabase.ts:5`, `src/middleware.ts:6`).
- Repo nie ma jeszcze żadnych migracji ani tabel domenowych; nawet dokumentacja setupu nadal opisuje stan "auth only" (`README.md:114`).
- Roadmapa wymaga, żeby `F-01` zatrzymał się na minimum potrzebnym dla `S-01` do `S-04`, a PRD preferuje uproszczony JSON schedule na MVP zamiast wczesnej normalizacji (`context/foundation/roadmap.md:67`, `context/foundation/prd.md:147`, `context/foundation/architecture-notes.md:678`).

## What We're NOT Doing

- Nie implementujemy pełnego shared product contract z metadanymi, provenance, `inci_source` i `inci_confidence`; to należy do `F-02`.
- Nie implementujemy product intake flows, search, barcode, AI extraction ani manual correction UX.
- Nie implementujemy AI interpretation cache per `(user, product)`, warnings, fit score ani personalized notes.
- Nie implementujemy finalnego edytora rutyny, daily/weekly routine screens ani `Use only today` persistence.
- Nie budujemy service-role admin tooling, background jobs ani migracji danych historycznych.

## Implementation Approach

Podejście jest wyraźnie DB-first, ale nie "SQL only". Najpierw powstaje kontrakt w Postgresie: minimalne tabele, klucze obce, constraints i RLS. Potem dochodzi cienka warstwa TypeScript po stronie serwera, która opakowuje raw odwołania do tabel i daje downstream slice'om stabilne wejście zamiast rozsianych zapytań. Na końcu dokładamy mały smoke surface w istniejącym, chronionym dashboardzie, żeby sprawdzić integrację end-to-end bez budowania finalnego UX.

Model danych zostaje celowo zawężony względem szerzej opisanej wizji w `architecture-notes`: zamiast pełnego `user_products` z interpretacją tworzymy oddzielne byty dla `user_profiles`, `user_shelf_items` i `user_routine_configs`. Dzięki temu `F-01` nie przejmuje odpowiedzialności za personalizację produktu ani shared metadata, ale nadal zamyka granice ownership i relacji potrzebne późniejszym slice'om.

## Critical Implementation Details

Nie tworzymy `public.users` ani nie duplikujemy emaila z `auth.users`; `auth.users` pozostaje jedynym źródłem tożsamości, a `user_profiles` przechowuje tylko pola domenowe.

`user_profiles` nie powinno już mieć osobnego pola `sensitivity`. W tym slice'ie `sensitivity` staje się jednym z obowiązkowych wymiarów `skin_aspects`, obok `pigmentation`, `firmness`, `breakouts` i `texture`. `skin_aspects` jest kontraktem strukturalnym, natomiast `concerns` i `goals` pozostają na razie swobodnymi `text[]`, bo ich słowniki tagów należą do kolejnych slice'ów.

Stub `public.products` w `F-01` ma być wyłącznie kotwicą referencyjną dla shelf i future shared product contract. Nie należy dodawać tu shared metadata wykraczających poza techniczną tożsamość i timestamps, bo wtedy `F-01` zacznie konsumować zakres `F-02`.

`public.products` mimo shared charakteru musi mieć jawnie określone zasady dostępu już w `F-01`: tabela jest read-only dla zwykłego runtime aplikacji, a ewentualny odczyt ma być dostępny wyłącznie dla zalogowanych użytkowników potrzebujących rozwiązać referencje shelf -> product. `insert/update/delete` do `products` nie są częścią `F-01` i nie mogą być wystawione przez zwykłe app route'y; jeśli jakiś rekord testowy będzie potrzebny lokalnie, powinien powstać przez migrację, seed lub manualny trusted SQL flow.

`user_routine_configs.schedule` powinno przechowywać referencje do owned shelf items przez stabilne `user_shelf_items.id`, nie do wolnego tekstu ani globalnych nazw produktów. Minimalny kontrakt MVP dla `schedule` to JSON w rodzaju `{ "monday": { "morning": [{ "shelf_item_id": "<id>" }], "evening": [] } }`, gdzie każda referencja wskazuje rekord należący do tego samego usera. Usunięcie elementu z `user_shelf_items` nie może zostawiać osieroconych wpisów w `schedule`; write path usuwający shelf item musi w tym samym flow usunąć lub przepisać wszystkie powiązane referencje z rutyny.

## Phase 1: Database contract and ownership boundaries

### Overview

Ta faza ustanawia minimalny kontrakt danych w Supabase/Postgres oraz zabezpiecza ownership przez constraints i RLS. Jej efektem ma być trwały fundament, na którym kolejne slice'y mogą zacząć budować onboarding, intake i bazową rutynę bez ponownego negocjowania kształtu tabel.

### Changes Required:

#### 1. Core migration

**File**: `supabase/migrations/<timestamp>_user_domain_persistence_contract.sql`

**Intent**: Dodać pierwszą domenową migrację tworzącą minimalne tabele i polityki potrzebne dla `F-01`, przy jednoczesnym utrzymaniu małej powierzchni odpowiedzialności tej fundacji.

**Contract**: Migracja tworzy `public.products` jako shared identity stub, `public.user_profiles` jako relację 1:1 do `auth.users`, `public.user_shelf_items` jako per-user shelf membership oraz `public.user_routine_configs` jako per-user bazową konfigurację rutyny z `schedule jsonb`. `user_profiles` ma przechowywać `skin_type text`, `skin_aspects jsonb`, `concerns text[]`, `goals text[]` i opcjonalne `notes text`; `skin_aspects` musi mieć stabilny, walidowany shape z kluczami `sensitivity`, `pigmentation`, `firmness`, `breakouts` i `texture`, a wartości dla każdego klucza są ograniczone do poziomów nasilenia uzgodnionych przez aplikację. `user_profiles.user_id` i `user_routine_configs.user_id` muszą być unikalne; `user_shelf_items` musi mieć stabilny techniczny klucz główny `id` oraz wymuszać unikalność `(user_id, product_id)`, tak aby `schedule` mogło referować konkretne rekordy przez `shelf_item_id`; wszystkie FKs do `auth.users` mają kasować dane kaskadowo przy usunięciu usera. Kontrakt tej fazy zakłada też, że write path usuwający shelf item nie może zostawić dangling references w `user_routine_configs.schedule`, mimo że sama relacja jest zapisana w JSONB. RLS ma być włączony na wszystkich tabelach user-owned i oparty o `auth.uid()`. `products` jako tabela shared ma dostać jawny access contract: odczyt dla authenticated users, brak app-level `insert/update/delete` w `F-01`, brak service-role write path w zwykłym runtime. Tabela `products` ma pozostać minimalna i nie przejmować jeszcze shared metadata z `F-02`.

#### 2. Seed/reset compatibility

**File**: `supabase/seed.sql`

**Intent**: Ustabilizować lokalny reset bazy tak, aby pierwsza domenowa migracja mogła być weryfikowana na czysto w aktualnym setupie CLI.

**Contract**: Plik seed istnieje i jest bezpieczny do uruchamiania przy `supabase db reset`, nawet jeśli na tym etapie nie seeduje żadnych rekordów domenowych. Jego obecność ma tylko zapewnić, że konfiguracja `supabase/config.toml` wskazująca `./seed.sql` nie rozjeżdża się z realnym stanem repo.

### Success Criteria:

#### Automated Verification:

- Migracje i polityki aplikują się czysto na lokalnym stacku: `npx supabase db reset`

#### Manual Verification:

- W Supabase Studio widać nowe tabele domenowe i przypisane do nich polityki RLS
- Dla tabel user-owned nie istnieje przypadkowy world-readable access dla niezwiązanego użytkownika

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Typed server contract

### Overview

Ta faza przekłada kontrakt bazy na cienką, typowaną warstwę po stronie aplikacji. Jej celem nie jest zbudowanie finalnych flow, tylko zamknięcie dostępu do nowych tabel w jednym miejscu oraz przygotowanie pierwszego bezpiecznego write path dla profilu skóry.

### Changes Required:

#### 1. Domain access module

**File**: `src/lib/domain/user-domain.ts`

**Intent**: Skupić operacje na domenie usera w jednym module, żeby późniejsze slice'y nie rozpraszały raw nazw tabel i kształtów payloadów po route'ach oraz komponentach.

**Contract**: Moduł eksportuje typy i helpery dla co najmniej `user_profiles`, `user_shelf_items` i `user_routine_configs`. Dla profilu użytkownika definiuje jawny shape `skin_type`, `skin_aspects`, `concerns`, `goals` i `notes`, z app-level typami dla aspektów skóry i ich poziomów. Funkcje przyjmują istniejącego request-scoped Supabase clienta lub jawny `userId`, opierają się na `src/lib/supabase.ts`, nie używają service-role i nie przyjmują cross-user identifiers z zewnątrz. To ten moduł ma być jedynym miejscem mapującym `schedule` na referencje `shelf_item_id` i pilnującym, że operacje na shelf nie zostawiają osieroconych wpisów w routine config.

#### 2. Profile write path

**File**: `src/pages/api/domain/profile.ts`

**Intent**: Udostępnić minimalny, chroniony write path do zapisu profilu skóry, który pozwoli zweryfikować kontrakt end-to-end bez budowania pełnego onboardingu.

**Contract**: Route obsługuje zapis wyłącznie dla aktualnie zalogowanego użytkownika, waliduje i mapuje pola należące do `user_profiles`, w tym strukturalne `skin_aspects` oraz opcjonalne `notes`, korzysta z helpera domenowego i utrzymuje wzorzec redirect/error znany z obecnych auth route'ów. Payload nie może zawierać arbitralnego `user_id`; ownership wynika z sesji.

#### 3. Dashboard data load integration

**File**: `src/pages/dashboard.astro`

**Intent**: Podłączyć dashboard do nowego kontraktu danych tak, aby stał się prostym surface'em weryfikacyjnym zamiast wyłącznie placeholderem.

**Contract**: Dashboard czyta persisted profile data dla `Astro.locals.user`, renderuje minimalny formularz lub status aktualnego profilu z `skin_type`, `skin_aspects`, `concerns`, `goals` i `notes`, i pozostaje dostępny wyłącznie dla zalogowanego usera przez istniejące middleware. Surface nie ma udawać finalnego UX onboardingu; ma jedynie potwierdzać odczyt i zapis kontraktu.

### Success Criteria:

#### Automated Verification:

- Astro typy odświeżają się bez błędów dla nowych route'ów i helperów: `npx astro sync`
- Lint przechodzi dla nowej warstwy domenowej i route'ów: `npm run lint`

#### Manual Verification:

- Zalogowany użytkownik może zapisać profil skóry z dashboardu i zobaczyć te same dane po odświeżeniu strony
- Niezalogowany użytkownik nadal jest przekierowywany z `/dashboard` do `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Verification surface and developer handoff

### Overview

Ta faza domyka zmianę jako fundament repo, a nie tylko lokalną migrację. Obejmuje końcową walidację, aktualizację instrukcji developerskich oraz dopilnowanie, że kontrakt danych jest czytelny dla kolejnych slice'ów i nie myli się z pełną implementacją feature'ów produktowych.

### Changes Required:

#### 1. Supabase setup documentation

**File**: `README.md`

**Intent**: Zaktualizować repo-level setup tak, aby odzwierciedlał nową rzeczywistość projektu po wejściu pierwszych tabel domenowych i smoke patha.

**Contract**: README przestaje twierdzić, że projekt używa wyłącznie `auth.users` i nie potrzebuje tabel ani migracji. Instrukcja setupu ma jasno wskazywać, że lokalna weryfikacja obejmuje migracje oraz minimalny smoke flow w chronionym dashboardzie.

#### 2. Contract visibility polish

**File**: `src/pages/dashboard.astro`

**Intent**: Dopracować dashboard jako surface weryfikacyjny tak, by jasno komunikował status kontraktu danych, ale nie rozszerzał zakresu na finalny onboarding czy product flows.

**Contract**: UI dashboardu pokazuje stan persisted profilu i podstawowe komunikaty sukcesu/błędu w sposób czytelny dla developera testującego zmianę. Nie dodajemy tu shelf management, routine editora ani dodatkowych feature flags.

### Success Criteria:

#### Automated Verification:

- Repo przechodzi końcową sekwencję weryfikacyjną: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Po wylogowaniu i ponownym zalogowaniu zapisany profil nadal istnieje i jest odczytywany z bazy
- README prowadzi przez lokalną weryfikację bez sprzeczności ze stanem repo

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests:

- Brak wydzielonego test suite w repo; logika helperów domenowych powinna być utrzymana na tyle mała i czysta, by ryzyko regresji było pokrywane przez lint, type-checking Astro i smoke flow
- Wszelkie mapowanie formularza do `user_profiles` powinno mieć minimalną liczbę gałęzi, jawne defaulty dla `skin_aspects` i jedno miejsce walidacji poziomów aspektów, żeby ograniczyć potrzebę testów jednostkowych na starcie

### Integration Tests:

- Reset lokalnej bazy z migracją `F-01` i weryfikacja działania route'a zapisu profilu dla zalogowanej sesji
- Weryfikacja, że middleware auth nadal współgra z nowymi odczytami danych domenowych na dashboardzie

### Manual Testing Steps:

1. Uruchomić lokalny Supabase stack i zresetować bazę z nową migracją.
2. Zarejestrować lub zalogować użytkownika i wejść na `/dashboard`.
3. Zapisać przykładowy skin context, odświeżyć stronę i potwierdzić, że dane nadal są renderowane.
4. Wylogować się, zalogować ponownie i potwierdzić persistence między sesjami.
5. Spróbować wejść na `/dashboard` bez sesji i potwierdzić redirect do `/auth/signin`.

## Performance Considerations

Nowe tabele są małe i user-scoped, więc główny koszt będzie dotyczył częstych lookupów po `user_id`. Należy zadbać o indeksy wspierające profile, shelf membership i single-row routine config. JSONB schedule pozostaje akceptowalnym kompromisem dla MVP, o ile trzymamy jeden rekord per user zamiast rosnącej historii wersji.

## Migration Notes

Migracja jest w pełni addytywna, bo projekt nie ma jeszcze istniejących danych domenowych do backfillu. Największe ryzyko leży w pomyleniu zakresów `F-01` i `F-02`, dlatego shared `products` powinno wystartować jako minimalny stub anchor, a nie pełny katalog produktowy. Daily one-off usage (`Use only today`) zostaje świadomie odłożone do późniejszego rozszerzenia schematu, najpewniej osobną tabelą typu `daily_usage_events` lub `routine_overrides`.

## References

- Roadmap item: `context/foundation/roadmap.md:65`
- PRD access + persistence: `context/foundation/prd.md:127`
- PRD schedule model: `context/foundation/prd.md:147`
- Architecture notes, data model and shelf/routine split: `context/foundation/architecture-notes.md:85`
- Architecture notes, JSON routine recommendation and daily override split: `context/foundation/architecture-notes.md:551`
- Existing Supabase client: `src/lib/supabase.ts:5`
- Existing auth middleware: `src/middleware.ts:6`
- Existing dashboard placeholder: `src/pages/dashboard.astro:7`
- Existing starter README claim about auth-only state: `README.md:114`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Database contract and ownership boundaries

#### Automated

- [x] 1.1 Migracje i polityki aplikują się czysto na lokalnym stacku — f4bd35c

#### Manual

- [x] 1.2 W Supabase Studio widać nowe tabele domenowe i przypisane do nich polityki RLS — f4bd35c
- [x] 1.3 Dla tabel user-owned nie istnieje przypadkowy world-readable access dla niezwiązanego użytkownika — f4bd35c

### Phase 2: Typed server contract

#### Automated

- [x] 2.1 Astro typy odświeżają się bez błędów dla nowych route'ów i helperów — 7b8da36
- [x] 2.2 Lint przechodzi dla nowej warstwy domenowej i route'ów — 7b8da36

#### Manual

- [x] 2.3 Zalogowany użytkownik może zapisać profil skóry z dashboardu i zobaczyć te same dane po odświeżeniu strony — 7b8da36
- [x] 2.4 Niezalogowany użytkownik nadal jest przekierowywany z `/dashboard` do `/auth/signin` — 7b8da36

### Phase 3: Verification surface and developer handoff

#### Automated

- [x] 3.1 Repo przechodzi końcową sekwencję weryfikacyjną — 814f449

#### Manual

- [x] 3.2 Po wylogowaniu i ponownym zalogowaniu zapisany profil nadal istnieje i jest odczytywany z bazy — 814f449
- [x] 3.3 README prowadzi przez lokalną weryfikację bez sprzeczności ze stanem repo — 814f449

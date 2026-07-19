# Personalized Product Fit Analysis Implementation Plan

## Overview

W tym slice budujemy trwałą, per-user interpretację dopasowania produktu do profilu skóry oraz canonical details screen produktu, który potrafi ją pokazać bez ponownego analizowania produktu przy każdym wejściu. Ekran ma być product-centric: zalogowany użytkownik może otworzyć szczegóły dowolnego produktu z `products`, zobaczyć shared dane i swoją własną analizę, nawet jeśli nie dodał produktu na półkę.

## Current State Analysis

Repo ma już rozdzielony model shared productów i per-user danych, ale brakuje jeszcze trwałej warstwy interpretacji produktu per `(user, product)`. Shared product intake, shelf membership i manual routine już istnieją, podobnie jak wzorzec dla AI integrations przez `src/lib/integrations/*`, natomiast nie istnieje canonical product-details route ani read model, który zwracałby stany `pending | ready | failed | stale`.

## Desired End State

Po zakończeniu tego planu zalogowany użytkownik może wejść na canonical details produktu po `productId`, zobaczyć shared metadata produktu oraz własną, zcache’owaną analizę AI z jasnym werdyktem, korzyściami, ostrzeżeniami i stanem świeżości. Interpretacja jest przechowywana per `(user_id, product_id)`, generuje się leniwie przy pierwszym wejściu na details, może zostać oznaczona jako `stale` po zmianie istotnych danych wejściowych i później stanie się wejściem dla `ai-routine-draft-and-review`.

### Key Discoveries:

- Aktualny kontrakt danych kończy się na `user_profiles`, `user_shelf_items` i `user_routine_configs`; nie ma jeszcze tabeli dla personalizowanej interpretacji produktu. `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:19`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:37`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46`
- Shared product layer jest już dojrzała: `products` ma tożsamość, kategorię, INCI i provenance, a kod domenowy umie wyszukiwać i wczytywać produkt po `productId`. `supabase/migrations/20260611180000_shared_product_intake_contract.sql:1`, `src/lib/domain/product-domain.ts:5`, `src/lib/domain/product-domain.ts:373`
- Search flow już dziś zwraca produkty z `products` niezależnie od shelf membership i prowadzi do shared review screen, więc details mogą i powinny być product-centric. `src/pages/api/domain/products/search.ts:44`, `src/pages/api/domain/products/search.ts:123`, `src/pages/products/intake/review/shared.astro:14`, `src/pages/products/intake/review/shared.astro:38`
- Zapis nowego produktu nadal automatycznie dodaje go na półkę użytkownika, więc ten slice musi obsłużyć dwa wejścia: produkt dodany do shelf oraz produkt tylko oglądany z shared search. `src/pages/api/domain/products/intake.ts:210`, `src/pages/api/domain/products/intake.ts:283`
- Repo ma już serwerowy wzorzec AI integration przez wyspecjalizowane moduły OpenRouter z własnym promptem, walidacją i logowaniem, więc interpretacja produktu powinna dostać osobny moduł integracyjny zamiast dopinania się do intake fallbacków. `src/lib/integrations/openrouter.ts:1`, `src/lib/integrations/openrouter.ts:97`, `src/lib/integrations/openrouter.ts:334`

## What We're NOT Doing

- Nie budujemy w tym slice AI routine drafting ani routine review.
- Nie wprowadzamy routine-level conflict engine ani AM/PM scheduling logic.
- Nie zapisujemy długich surowych esejów AI jako canonical source of truth.
- Nie blokujemy wejścia na details produktu na czas generacji analizy.
- Nie wymagamy, żeby produkt był na półce, zanim użytkownik zobaczy jego analizę.
- Nie dodajemy pełnego background job systemu ani okresowego reprocessingu.
- Nie używamy pola `notes` z profilu użytkownika jako wejścia do MVP interpretacji.
- Nie dokładamy automatycznych live-call testów do zewnętrznego modelu.

## Implementation Approach

Trzonem rozwiązania będzie nowa tabela `user_product_interpretations` z unikalnym kluczem `(user_id, product_id)` oraz oddzieleniem `status` od `fit_status`. Canonical route produktu będzie SSR-owo ładował shared product i aktualny stan interpretacji, a mały client island będzie wyzwalał generację lub refresh tylko wtedy, gdy rekord jest `pending` albo `stale`, dzięki czemu ekran otworzy się od razu z danymi produktu. Dla flow intake z dodaniem na półkę system może utworzyć lub podtrzymać rekord `pending`, ale details muszą też umieć lazy-create ten rekord dla produktu, który użytkownik tylko ogląda z shared search.

## Critical Implementation Details

### Timing & lifecycle

Ponieważ w repo nie ma job queue, pierwszy render details nie może próbować synchronously kończyć całej analizy w SSR. Serwer ma zapewnić istnienie rekordu interpretacji i oddać ekran natychmiast, a generacja ma ruszyć przez jawny mutation flow z UI dla stanów `pending` i `stale`, z późniejszym odświeżeniem sekcji analizy.

### State sequencing

`status` odpowiada za używalność rekordu (`pending | ready | failed | stale`), a `fit_status` za werdykt skincare (`recommended | mixed | not_recommended | insufficient_data`). Implementacja nie może mieszać tych pojęć ani używać `fit_score` jako jedynego źródła prawdy dla UI lub przyszłego routine AI.

## Phase 1: Persistence & Domain Contract

### Overview

Ta faza dodaje trwałą warstwę danych dla interpretacji per `(user, product)`, wraz z enum-like constraints, RLS, helperami domenowymi i regułami invalidation.

### Changes Required:

#### 1. Supabase migration for `user_product_interpretations`

**File**: `supabase/migrations/<timestamp>_user_product_interpretations.sql`

**Intent**: Dodać nową tabelę interpretacji, która formalizuje kontrakt opisany w `contract-draft.md` bez naruszania istniejącego podziału `products` vs `user_*`.

**Contract**: Tabela przechowuje co najmniej `id`, `user_id`, `product_id`, `status`, `fit_status`, `fit_score`, `confidence`, `summary_short`, `reasoning_short`, `recommended_for`, `caution_for`, `warnings`, `profile_basis`, `product_basis`, `model_version`, `prompt_version`, `generated_at`, `stale_at`, `stale_reason`, `last_error`, `created_at`, `updated_at`; ma unikalność `(user_id, product_id)`, check constraints dla dozwolonych statusów i severity, trigger `set_updated_at`, RLS ograniczone do `auth.uid() = user_id`, oraz komentarze opisujące semantykę kontraktu.

#### 2. Domain module for personalized interpretation

**File**: `src/lib/domain/product-interpretation.ts`

**Intent**: Wydzielić nowy moduł domenowy, żeby nie rozpychać `user-domain.ts` i dać późniejszym slice’om jedno miejsce do obsługi interpretacji produktu.

**Contract**: Moduł eksportuje typy `UserProductInterpretation`, `InterpretationStatus`, `FitStatus`, `InterpretationWarning`, helpery mapujące rekordy Supabase, helper `shouldMarkInterpretationStale(...)`, funkcje read/write typu `getUserProductInterpretation`, `ensurePendingUserProductInterpretation`, `markInterpretationStale`, `saveReadyUserProductInterpretation`, `markFailedUserProductInterpretation`, oraz normalizację structured arrays i basis snapshots.

#### 3. Product and user domain touchpoints

**File**: `src/lib/domain/product-domain.ts`

**Intent**: Uzupełnić shared product read model o to, czego potrzebuje canonical details screen i interpretacja per user.

**Contract**: Shared product contract pozostaje shared-only; moduł udostępnia bezpieczny read po `productId` i ewentualny lekki view helper dla canonical route. Nie wolno przenosić personalization fields do `products`.

**File**: `src/lib/domain/user-domain.ts`

**Intent**: Zachować spójność z istniejącym profile contract i dołożyć jawne snapshot helpers dla pól używanych przez interpretację.

**Contract**: Snapshot profilu dla AI używa `skin_type`, `skin_aspects`, `concerns` i `goals`, ale nie używa `notes`. Reguły `stale` patrzą tylko na structured input użyty w promptcie, plus `inci_list`, `category`, `prompt_version` i `model_version`.

### Success Criteria:

#### Automated Verification:

- Nowa migracja stosuje się lokalnie bez resetu: `npx supabase migration up`
- Type-safe domain contract kompiluje się po synchronizacji Astro: `npx astro sync`
- Lint przechodzi po dodaniu nowego modułu domenowego: `npm run lint`

#### Manual Verification:

- W lokalnej bazie istnieje tabela `user_product_interpretations` z ograniczeniem `unique (user_id, product_id)`
- Zmiana istotnych pól profilu lub produktu może oznaczyć interpretację jako `stale`, a zmiana `notes` nie powoduje invalidation
- Zalogowany użytkownik nie może odczytać ani zmodyfikować interpretacji innego użytkownika

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: AI Orchestration & Read Model

### Overview

Ta faza dodaje właściwą orkiestrację interpretacji: tworzenie `pending`, dedykowany call do modelu, zapis `ready/failed` i read model dla UI.

### Changes Required:

#### 1. Dedicated AI integration for product-fit analysis

**File**: `src/lib/integrations/openrouter-product-fit.ts`

**Intent**: Stworzyć osobny, wyspecjalizowany moduł AI dla personalizowanej interpretacji produktu zamiast rozszerzać intake web search.

**Contract**: Moduł przyjmuje shared product + profile snapshot i zwraca strict JSON zgodny z kontraktem persisted fields: `fit_status`, `fit_score`, `confidence`, `summary_short`, `reasoning_short`, `recommended_for`, `caution_for`, `warnings`. Nie zwraca AM/PM, schedule, routine order ani medical claims. Błędy integracji zwracają kontrolowany failure payload do zapisania w `last_error`.

#### 2. Server-side interpretation service

**File**: `src/lib/domain/product-interpretation.ts`

**Intent**: Dodać use-case layer, która łączy product read, profile snapshot, invalidation rules i AI integration.

**Contract**: Serwis udostępnia operacje typu `getUserScopedProductDetails`, `startInterpretationGeneration`, `refreshStaleInterpretation`, `retryFailedInterpretation`. Jeśli rekord nie istnieje, serwis potrafi utworzyć `pending`; jeśli rekord jest `ready`, zwraca cache; jeśli `stale`, zachowuje ostatni wynik do wyświetlenia i oznacza potrzebę refreshu. Dla produktów dodanych do shelf można opportunistycznie utworzyć `pending`, ale canonical trigger generacji pozostaje details-driven.

#### 3. Interpretation API for client-triggered generation and polling

**File**: `src/pages/api/domain/products/interpretation.ts`

**Intent**: Udostępnić jeden spójny mutation/read endpoint dla client islandu na details screenie.

**Contract**: Endpoint przyjmuje `productId` i akcję typu `start`, `retry`, `refresh`, zwraca aktualny serialized interpretation state i jest dostępny tylko dla zalogowanego użytkownika. Dla `start` może lazy-create rekord `pending` nawet wtedy, gdy produkt nie jest na półce. Live AI call nie jest wykonywany w zwykłym SSR route renderze.

#### 4. Intake integration without making shelf mandatory

**File**: `src/pages/api/domain/products/intake.ts`

**Intent**: Zachować obecne automatyczne dodawanie produktu do shelf po zapisie, ale wykorzystać ten moment do ewentualnego utworzenia `pending` interpretacji bez rozpoczynania pełnej analizy.

**Contract**: Po zapisaniu shared produktu i zapewnieniu `user_shelf_items` flow może wywołać `ensurePendingUserProductInterpretation(...)`, ale brak tego kroku nie może blokować success redirect. Canonical details screen nadal samodzielnie umie lazy-create rekord dla użytkownika oglądającego produkt poza shelf.

### Success Criteria:

#### Automated Verification:

- Payload AI jest mapowany do persisted contract bez błędów typu: `npx astro sync`
- API route i nowy moduł integracyjny przechodzą lint oraz build: `npm run lint` i `npm run build`
- Migration-first workflow pozostaje zachowany bez `db reset`: `npx supabase migration up`

#### Manual Verification:

- Dla produktu bez istniejącej interpretacji details lub endpoint potrafi utworzyć rekord `pending`
- Udany AI call zapisuje rekord `ready` z wypełnionymi polami structured arrays i krótkimi opisami
- Nieudany AI call ustawia `failed` oraz zapisuje `last_error`, a retry może ponowić generację
- Zmiana profilu użytego w promptcie powoduje przejście z `ready` do `stale`, ale ostatnia analiza nadal może być czytelna dla UI

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Canonical Product Details UI

### Overview

Ta faza wprowadza właściwy ekran produktu, który jest canonical miejscem odczytu shared danych i personalizowanej analizy.

### Changes Required:

#### 1. Product-centric details route

**File**: `src/pages/products/[productId].astro`

**Intent**: Dodać canonical details page dla produktu z `products`, niezależną od intake review i niezależną od shelf membership.

**Contract**: Route wymaga sesji użytkownika, przyjmuje `productId` z path param, SSR-owo ładuje shared product oraz aktualny interpretation snapshot i renderuje ekran nawet wtedy, gdy analiza jest dopiero `pending`. Brak produktu kończy się czytelnym error state lub redirectem do intake search, a brak ukończonego profilu nadal kieruje do onboarding/profile completion.

#### 2. Analysis panel island

**File**: `src/components/products/ProductInterpretationPanel.tsx`

**Intent**: Obsłużyć interaktywne stany `pending/ready/failed/stale` bez blokowania całej strony produktu.

**Contract**: Komponent przyjmuje initial state z SSR i potrafi:
- pokazać `pending` z informacją, że analiza trwa,
- pokazać `ready` z werdyktem, summary, recommended/caution/warnings,
- pokazać `failed` z akcją retry,
- pokazać `stale` z ostatnią analizą i akcją refresh.

Client island jest jedynym miejscem, które wywołuje endpoint generacji po pierwszym renderze.

#### 3. Details-page shared product presentation

**File**: `src/pages/products/[productId].astro`

**Intent**: Zmienić shared product view z technicznego review-like układu na długoterminowy details screen, który będzie później miejscem dalszych rozszerzeń.

**Contract**: Ekran pokazuje co najmniej nazwę, markę, kategorię, zdjęcie, INCI, provenance/confidence oraz stan „na półce / poza półką” jako informację pomocniczą, ale nie uzależnia sekcji analizy od shelf ownership.

### Success Criteria:

#### Automated Verification:

- Nowy route i komponent przechodzą typecheck/lint/build: `npx astro sync`, `npm run lint`, `npm run build`
- Client island poprawnie serializuje initial interpretation state bez błędów hydration

#### Manual Verification:

- Zalogowany użytkownik może wejść na `/products/<productId>` dla produktu z shared bazy bez wcześniejszego dodania go na półkę
- Ekran otwiera się natychmiast z shared danymi produktu, a sekcja analizy pokazuje poprawny stan `pending/ready/failed/stale`
- Produkt będący już na półce nadal otwiera ten sam canonical details screen i nie wymaga osobnego shelf-only widoku

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Entry Points & Verification

### Overview

Ta faza spina nowy ekran z istniejącymi flow search/intake oraz domyka realistyczną strategię weryfikacji dla slice’a opartego o AI.

### Changes Required:

#### 1. Shared search and intake entry points

**File**: `src/components/products/ProductIntakeFlow.tsx`

**Intent**: Zmienić wejście dla shared produktów tak, żeby user mógł świadomie przejść do canonical details zamiast tylko do ekranu „potwierdź i dodaj na półkę”.

**Contract**: Dla shared candidates flow powinno prowadzić do `/products/[productId]` jako canonical details. Jeśli produkt nie jest jeszcze na półce, details page może oferować akcję „Dodaj do półki”, ale samo wejście na details nie wymaga dodania do shelf.

**File**: `src/pages/products/intake/review/shared.astro`

**Intent**: Ograniczyć obecny shared review screen do roli pomocniczej lub przepiąć go na redirect/link do nowego details route, żeby nie utrzymywać dwóch konkurencyjnych widoków produktu.

**Contract**: Po wdrożeniu tego slice’a canonical source of truth dla oglądania produktu jest `/products/[productId]`, a nie review screen osadzony w intake.

#### 2. Success redirect after add-to-shelf

**File**: `src/pages/api/domain/products/intake.ts`

**Intent**: Skierować sukces po dodaniu nowego produktu do miejsca, w którym użytkownik zobaczy także analizę dopasowania.

**Contract**: Success redirect może wskazywać canonical details screen z czytelnym success state lub query params, zamiast kończyć wyłącznie na technicznym ekranie „produkt dodany”.

#### 3. Deterministic verification surface

**File**: `context/changes/personalized-product-fit-analysis/plan.md`

**Intent**: Domknąć slice realistyczną strategią weryfikacji: bez live-model tests, ale z pełnym manualnym smoke testem UI i automatyczną weryfikacją kontraktu przez migration/lint/build.

**Contract**: Ten slice nie wprowadza ogólnego frameworka testowego tylko po to, żeby testować zewnętrzny model. Logika invalidation i mappingu ma być utrzymana maksymalnie deterministyczna i wyizolowana, żeby można ją było łatwo objąć testami w kolejnym etapie, jeśli repo dostanie test runner.

### Success Criteria:

#### Automated Verification:

- Końcowa weryfikacja repo przechodzi: `npx astro sync`
- Lint przechodzi dla nowych route’ów, komponentów i warstwy domenowej: `npm run lint`
- Build przechodzi z nowym details route i API: `npm run build`

#### Manual Verification:

- User wyszukuje produkt już obecny w `products`, nie dodaje go na półkę, wchodzi na details i widzi swoją analizę po wygenerowaniu
- User dodaje produkt na półkę z intake i trafia do canonical details, gdzie widzi shared dane oraz sekcję analizy
- Po zmianie `skin_type`, `skin_aspects`, `concerns` lub `goals` interpretacja wcześniej `ready` staje się `stale`, a `notes` nie powoduje invalidation
- Jeśli AI call zakończy się błędem, UI pokazuje `failed` i pozwala na ręczny retry

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests:

- Nie dokładamy w tym slice pełnego live-model testowania zewnętrznego AI.
- Logika mappingu, statusów i invalidation ma zostać wyizolowana do czystych helperów, żeby przyszłe testy jednostkowe mogły objąć `status` transitions, snapshot comparison i stale rules bez dotykania modelu.

### Integration Tests:

- W tym repo nie ma dziś committed test runnera, więc automatyczna integracja dla tego slice’a opiera się na migracji lokalnej oraz pełnym `astro sync + lint + build`.
- Endpoint interpretacji i client island mają być projektowane tak, żeby ich deterministic branches były czytelne do późniejszego objęcia testami, jeśli projekt dołoży test harness.

### Manual Testing Steps:

1. Zaloguj się użytkownikiem z uzupełnionym profilem skóry.
2. Wyszukaj produkt istniejący już w `products` i przejdź do jego canonical details bez dodawania go na półkę.
3. Potwierdź, że ekran od razu pokazuje shared dane, a analiza przechodzi z `pending` do `ready` albo do `failed`.
4. Dodaj inny produkt do shelf przez intake i potwierdź redirect do tego samego canonical details screen.
5. Zmień `skin_type`, jeden z `skin_aspects`, `concerns` albo `goals`, wróć na details i potwierdź stan `stale` oraz możliwość refreshu.
6. Zmień tylko `notes`, wróć na details i potwierdź, że interpretacja nie stała się `stale`.

## Performance Considerations

- Interpretacja nie może być liczona przy każdym wejściu na details; `ready` cache jest podstawowym trybem odczytu.
- `stale` ma pokazywać ostatnią używalną analizę i dopiero dodatkowo sygnalizować potrzebę refreshu.
- Client island nie może odpalać nieskończonej pętli retry; generacja i polling muszą być bounded.
- Shared product read i personalized interpretation read powinny pozostać lekkie i rozdzielone, żeby SSR details nie zamienił się w ciężki endpoint AI.

## Migration Notes

- Zgodnie z `context/foundation/lessons.md` podczas iteracyjnej pracy lokalnej preferuj `npx supabase migration up`, a nie `npx supabase db reset`.
- Ten slice nie wymaga backfillu istniejących produktów ani shelf items; tabela interpretacji może być zapełniana leniwie przy wejściach na details i przy add-to-shelf.
- Jeśli potrzebna będzie świeża weryfikacja całego łańcucha migracji, użyj resetu tylko jako osobnego checkpointu, nie jako domyślnego workflow deweloperskiego.

## References

- Frame brief: `context/changes/personalized-product-fit-analysis/frame.md`
- Contract draft: `context/changes/personalized-product-fit-analysis/contract-draft.md`
- Shared product schema: `supabase/migrations/20260611180000_shared_product_intake_contract.sql:1`
- User-domain baseline: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:19`
- Shared product domain helpers: `src/lib/domain/product-domain.ts:5`
- Existing shared product search flow: `src/pages/api/domain/products/search.ts:44`
- Existing shared review screen: `src/pages/products/intake/review/shared.astro:14`
- Existing add-to-shelf after intake: `src/pages/api/domain/products/intake.ts:210`
- Existing OpenRouter integration pattern: `src/lib/integrations/openrouter.ts:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Persistence & Domain Contract

#### Automated

- [x] 1.1 Nowa migracja stosuje się lokalnie bez resetu
- [x] 1.2 Type-safe domain contract kompiluje się po synchronizacji Astro
- [x] 1.3 Lint przechodzi po dodaniu nowego modułu domenowego

#### Manual

- [ ] 1.4 Tabela `user_product_interpretations` istnieje z `unique (user_id, product_id)`
- [ ] 1.5 Reguły invalidation rozróżniają pola strukturalne od `notes`
- [ ] 1.6 RLS blokuje odczyt i zapis interpretacji innego użytkownika

### Phase 2: AI Orchestration & Read Model

#### Automated

- [ ] 2.1 Payload AI mapuje się do persisted contract bez błędów typu
- [ ] 2.2 API route i moduł integracyjny przechodzą lint oraz build
- [ ] 2.3 Migration-first workflow pozostaje zachowany bez `db reset`

#### Manual

- [ ] 2.4 Brakująca interpretacja może zostać utworzona jako `pending`
- [ ] 2.5 Udany AI call zapisuje rekord `ready`
- [ ] 2.6 Błąd AI zapisuje `failed` i pozwala na retry
- [ ] 2.7 Zmiana danych wejściowych powoduje stan `stale`

### Phase 3: Canonical Product Details UI

#### Automated

- [ ] 3.1 Nowy route i komponent przechodzą `astro sync`, lint i build
- [ ] 3.2 Initial interpretation state serializuje się bez błędów hydration

#### Manual

- [ ] 3.3 Użytkownik może otworzyć `/products/<productId>` bez dodawania produktu do półki
- [ ] 3.4 Ekran od razu pokazuje shared dane i poprawny stan analizy
- [ ] 3.5 Produkt na półce używa tego samego canonical details screen

### Phase 4: Entry Points & Verification

#### Automated

- [ ] 4.1 Końcowa weryfikacja repo przechodzi przez `npx astro sync`
- [ ] 4.2 Lint przechodzi dla nowych route’ów, komponentów i warstwy domenowej
- [ ] 4.3 Build przechodzi z nowym details route i API

#### Manual

- [ ] 4.4 Shared search pozwala wejść w details bez dodawania produktu do półki
- [ ] 4.5 Add-to-shelf redirect prowadzi do canonical details
- [ ] 4.6 Zmiana structured profile fields oznacza interpretację jako `stale`, a `notes` nie
- [ ] 4.7 Stan `failed` pozwala na ręczny retry z UI

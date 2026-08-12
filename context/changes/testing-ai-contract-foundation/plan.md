# Test Foundation and Deterministic AI Contracts Implementation Plan

## Overview

Wprowadzamy pierwszy, szybki i deterministyczny zestaw testów dla największych ryzyk MVP: nieprawidłowych odpowiedzi AI, nieaktualnych analiz oraz błędów providera widocznych dla użytkownika. Plan nie buduje testowego Supabase, nie zmienia schematu i nie dodaje e2e.

## Current State Analysis

Projekt nie ma jeszcze runnera testów, skryptów testowych ani ustalonego miejsca dla fixture'ów. Walidatory domenowe są jednak już wyodrębnione: rutyna sprawdza pełną strukturę propozycji i par produktów, a analizy produktu oraz rutyny mają deterministyczne mechanizmy świeżości.

Odpowiedzi błędów w API dla wysp React nadal są niespójne. Kilka tras przekazuje `error.message` bezpośrednio do JSON, a komponenty odczytują tylko tekst z `payload.error`. Powoduje to ryzyko ujawnienia technicznego szczegółu providera i uniemożliwia UI pewne dobranie następnej akcji.

### Key Discoveries:

- `parseRoutineAiProposal` weryfikuje własność produktów, kompletność uzasadnień, cytaty INCI i pełny audit każdej pary w danej sekcji. [routine-ai.ts:147](../../../../src/lib/domain/routine-ai.ts:147)
- `getInterpretationStaleReason` porównuje snapshot profilu, danych produktu oraz wersji promptu/modelu. [product-interpretation.ts:312](../../../../src/lib/domain/product-interpretation.ts:312)
- Fingerprint oceny rutyny obejmuje profil, wpisy rutyny, INCI i wersje dopasowań produktu, a strona rutyny uznaje zapisany wynik za aktualny wyłącznie przy równych hashach. [routine-ai-assessment.ts:77](../../../../src/lib/domain/routine-ai-assessment.ts:77) [routine.astro:80](../../../../src/pages/routine.astro:80)
- Trasy interaktywne używają JSON, a przekierowania używają flash cookie; komunikaty nie mogą wracać do URL-a. [lessons.md](../../foundation/lessons.md)

## Desired End State

`npm test` uruchamia w Node szybkie testy TypeScript bez internetu, OpenRoutera, Supabase ani sekretów. Najważniejsze dane wejściowe AI są weryfikowane przez testy kontraktowe, a identyczne dane zawsze dają identyczną decyzję cache'u.

Wszystkie endpointy, które obsługują błędy AI, zwracają jeden stabilny kształt `{ error: { code, message, action } }`. Użytkownik widzi polski komunikat i możliwą kolejną akcję, natomiast diagnostyczna treść providerów pozostaje tylko w logach serwera.

## What We're NOT Doing

- Nie uruchamiamy testowego Supabase, nie sprawdzamy RLS ani trwałego `upsert`/odczytu po odświeżeniu; to zakres rollout'u 2.
- Nie dodajemy Playwrighta, testów DOM, screenshotów ani automatycznej weryfikacji wpisanego formularza; to zakres rollout'u 3.
- Nie używamy testów jako dowodu medycznej lub dermatologicznej poprawności porady AI.
- Nie dodajemy progów coverage ani nowych bramek CI w tym rollout'cie.
- Nie wykonujemy requestów do OpenRoutera, stron źródłowych ani bazy podczas testów.
- Nie resetujemy bazy ani nie dodajemy migracji.

## Implementation Approach

Vitest w środowisku Node będzie obsługiwać czyste funkcje domenowe i kontrakty adapterów. Małe, współdzielone fixture'y będą modelować minimalny profil oraz dwa produkty z półki, dzięki czemu testy weryfikują reguły, a nie pełne dane katalogu.

Wprowadzony zostanie wspólny kontrakt błędów AI z kategorią, polskim komunikatem i opcjonalną akcją UI. Endpointy AI będą mapować wyjątki na ten kontrakt, nadal logując pełny szczegół po stronie serwera. Komponenty będą odczytywać nowy kontrakt przez współdzielony parser, z zachowaniem bezpiecznego komunikatu awaryjnego dla nieznanego payloadu.

## Critical Implementation Details

Status `failed` analizy produktu jest zapisywany wraz z `last_error` i wyświetlany w UI, więc translator błędów musi działać zanim tekst zostanie utrwalony. Nie zapisuj surowej wiadomości OpenRoutera ani szczegółu HTTP w `last_error`; do logów zachowaj oryginalny wyjątek i trace ID. Nie zmieniaj powodzenia ani kolejności zapisu propozycji rutyny: UI może zastąpić zapisany draft wyłącznie po udanym `POST /api/domain/routine`.

## Phase 1: Test Runner and Shared Fixtures

### Overview

Dodajemy minimalny, zgodny z aliasem `@/` runner Vitest i wspólne fixture'y dla kontraktów AI. Ta faza tworzy podstawę, ale nie implementuje testów zależnych od prawdziwej bazy ani UI.

### Changes Required:

#### 1. Test configuration and package scripts

**Files**: `package.json`, `package-lock.json`, `vitest.config.ts`

**Intent**: Dodać Vitest jako dev dependency i dwa jednoznaczne skrypty: `npm test` dla jednorazowego uruchomienia oraz `npm run test:watch` dla pracy lokalnej.

**Contract**: Test runner używa środowiska `node`, znajduje tylko `src/**/*.test.ts`, rozpoznaje alias `@/` tak jak `tsconfig.json`, nie ma ustawionego coverage threshold i nie uruchamia testów przeglądarkowych.

#### 2. Reusable AI contract fixtures and runner smoke test

**Files**: `src/test/fixtures/ai-contracts.ts`, `src/test/fixtures/index.ts`, `src/test/test-environment.test.ts`

**Intent**: Udostępnić mały zestaw fabryk i danych testowych oraz dodać test smoke potwierdzający, że runner i alias działają zanim pojawią się właściwe kontrakty domenowe.

**Contract**: Fixture'y zwracają świeże obiekty na każde użycie i pozwalają testowi nadpisać tylko dane istotne dla scenariusza. Smoke test importuje fixture przez alias `@/`, sprawdza brak współdzielonej mutacji i daje `npm test` co najmniej jeden rzeczywisty przypadek. Dane nie zawierają identyfikatorów użytkownika z lokalnej bazy, sekretów ani pełnego katalogu produktów.

### Success Criteria:

#### Automated Verification:

- `npm test` uruchamia początkowy test fixture'ów bez połączenia z zewnętrzną usługą.
- `npm run test:watch` jest dostępny jako osobny skrypt deweloperski.
- `npx astro sync && npm run lint && npm run build` przechodzi po dodaniu konfiguracji.

---

## Phase 2: Safe AI Error Contract

### Overview

Definiujemy jeden publiczny kontrakt błędów AI i stosujemy go na wszystkich endpointach, które wywołują AI. UI otrzymuje stabilny kod, polski komunikat i akcję, a szczegóły techniczne nie opuszczają serwera.

### Changes Required:

#### 1. Shared server and client error-contract utilities

**Files**: `src/lib/domain/ai-error-contract.ts`, `src/lib/client/api-error.ts`, `src/lib/domain/ai-error-contract.test.ts`, `src/lib/client/api-error.test.ts`

**Intent**: Zastąpić rozproszone odczyty `payload.error` współdzielonym kontraktem i mapperem wyjątków providera, błędów walidacji oraz błędów sieciowych.

**Contract**: Publiczna odpowiedź ma dokładnie strukturę `{ error: { code, message, action } }`, gdzie `code` jest stabilną kategorią (`provider_unavailable`, `invalid_model_output`, `network_failure`, `source_validation_failed` albo `unknown`), `message` jest po polsku, a `action` jest `retry`, `refine_input`, `use_manual_entry` albo `null`. Nieznany payload po stronie klienta mapuje się na bezpieczny, polski fallback. Mapper nie zwraca `error.message`, URL-a źródła, statusu providera, sekretu ani trace ID.

#### 2. Provider-facing API endpoints

**Files**: `src/pages/api/domain/products/ai-web-search.ts`, `src/pages/api/domain/products/interpretation.ts`, `src/pages/api/domain/products/photo-vision.ts`, `src/pages/api/domain/products/ingredient-glossary.ts`, `src/pages/api/domain/routine/ai.ts`, `src/pages/api/domain/routine/guidance-explanation.ts`

**Intent**: Zastosować wspólny mapper na ścieżkach błędów AI i pozostawić pełne dane diagnostyczne wyłącznie w istniejących logach serwera.

**Contract**: Każda nieudana odpowiedź AI używa wspólnego JSON error payload oraz prawidłowego statusu HTTP. Autoryzacja pozostaje osobną, prostą odpowiedzią 401 i również nie przekazuje surowego `authError.message`. Sukcesy endpointów oraz ich request payloady nie zmieniają się.

#### 3. React consumers of JSON error payloads

**Files**: `src/components/products/ProductIntakeFlow.tsx`, `src/components/products/ProductInterpretationPanel.tsx`, `src/components/products/IngredientGlossaryPanel.tsx`, `src/components/routine/RoutineWorkspace.tsx`, `src/components/routine/RoutineGuidancePanel.tsx`

**Intent**: Przełączyć komponenty na wspólny parser błędów, aby komunikat był spójny, a aktualny stan formularza, draftu, interpretacji lub propozycji nie był nadpisywany przez nieudany request.

**Contract**: Komponent wykorzystuje `message` do prezentacji, a `action` tylko do właściwego istniejącego CTA lub bezpiecznego fallbacku. Nie wykonuje przekierowania i nie buduje komunikatu w query stringu. Stan sukcesu zmienia się wyłącznie po odpowiedzi `response.ok` z oczekiwanym payloadem.

#### 4. Error-contract route tests

**Files**: `src/pages/api/domain/products/ai-web-search.test.ts`, `src/pages/api/domain/products/interpretation.test.ts`, `src/pages/api/domain/routine/ai.test.ts`

**Intent**: Przetestować reprezentatywne endpointy przy błędzie providera, nieprawidłowej odpowiedzi modelu i błędzie sieci.

**Contract**: Testy mockują wyłącznie granicę AI i klienta Supabase wymagany do autoryzacji; asercje sprawdzają status, publiczny kształt błędu, polski komunikat, akcję i brak surowej wiadomości w `Response` body. Nie wywołują prawdziwego Supabase ani fetch zewnętrznego.

### Success Criteria:

#### Automated Verification:

- Wszystkie kategorie wspólnego mappera oraz nieznany błąd mają testy kontraktowe.
- Reprezentatywne endpointy AI zwracają bezpieczny kształt błędu bez surowego szczegółu providera.
- `npm test`, `npx astro sync`, `npm run lint` i `npm run build` przechodzą.

---

## Phase 3: Deterministic AI and Freshness Contracts

### Overview

Dodajemy regresyjne testy dla walidacji rutyny, świeżości analizy produktu, fingerprintu oceny rutyny oraz tolerancyjnego parsera intake. Testy opisują granice danych AI, nie próbują oceniać medycznej treści odpowiedzi.

### Changes Required:

#### 1. Routine proposal and compatibility-audit tests

**Files**: `src/lib/domain/routine-ai.test.ts`

**Intent**: Zabezpieczyć walidator przed odpowiedziami modelu, które wyglądają poprawnie syntaktycznie, ale są niekompletne lub nie odnoszą się do danych użytkownika.

**Contract**: Testy obejmują poprawną ocenę dwóch produktów, brak wymaganej pary, obcy `shelf_item_id`, składnik spoza INCI, parę z niewłaściwej sekcji oraz istotny werdykt bez odpowiadającego ustalenia. Każdy odrzucony przypadek kończy się czytelnym wyjątkiem walidatora, zanim może powstać zapis lub UI proposal.

#### 2. Product-interpretation and routine-assessment freshness tests

**Files**: `src/lib/domain/product-interpretation.test.ts`, `src/lib/domain/routine-ai-assessment.test.ts`

**Intent**: Utrwalić decyzje stale cache'u bez zależności od zegara lub bazy danych.

**Contract**: `getInterpretationStaleReason` zwraca brak powodu dla identycznego stanu `ready` oraz właściwy powód po zmianie profilu, podstawy produktu, promptu albo modelu. `createRoutineAiAssessmentFingerprint` jest równy dla identycznego wejścia i różny po zmianie profilu, wpisu rutyny, INCI lub wersji dopasowania; brak danych produktu wymaganych przez wpis rutyny jest błędem.

#### 3. Product-intake parser and representative provider adapter tests

**Files**: `src/lib/integrations/openrouter.ts`, `src/lib/integrations/openrouter.test.ts`, `src/lib/integrations/openrouter-routine-draft.test.ts`

**Intent**: Udostępnić małą, czystą granicę parsowania odpowiedzi AI web search oraz sprawdzić jeden request adaptera rutyny z mockowanym `fetch`.

**Contract**: Parser intake akceptuje czysty JSON, JSON w fenced blocku i tekst z jednym poprawnym obiektem, natomiast odrzuca brak obiektu kontrolowanym błędem. Jedyny test adaptera rutyny sprawdza `POST`, `response_format: json_object`, brak zewnętrznego requestu oraz przekazanie wyniku do istniejącego walidatora; nie testuje dosłownie treści promptu ani liczby requestów web search.

### Success Criteria:

#### Automated Verification:

- Testy deterministyczne potwierdzają wszystkie opisane negatywne kontrakty AI i przypadki świeżości.
- Żaden test nie wymaga `OPENROUTER_API_KEY`, `SUPABASE_*`, internetu ani lokalnej bazy.
- `npm test`, `npx astro sync`, `npm run lint` i `npm run build` przechodzą.

---

## Phase 4: Verification and Test Cookbook

### Overview

Utrwalamy sposób pracy z nową bazą testów w planie jakości i sprawdzamy, że nowy zestaw pozostaje niezależny od usług zewnętrznych.

### Changes Required:

#### 1. Quality-plan cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Zastąpić placeholdery w §6.1 i §6.5 konkretną, krótką instrukcją tworzenia testu jednostkowego/kontraktowego w tym repozytorium.

**Contract**: Dokument zawiera lokalizację testów i fixture'ów, konwencję nazewnictwa, referencyjny test, komendy `npm test` i `npm run test:watch`, granicę mockowania oraz przypomnienie o zakazie requestów do providera i Supabase. Nie zmienia zamrożonej strategii §1-§5.

#### 2. Full local verification

**Files**: no source-file change expected

**Intent**: Uruchomić finalny zestaw jakości i potwierdzić, że testy nie zależą od lokalnego stanu bazy.

**Contract**: Sekwencja `npm test`, `npx astro sync`, `npm run lint` i `npm run build` kończy się sukcesem w zwykłym środowisku deweloperskim, bez uruchomionego kontenera Supabase i bez klucza OpenRouter.

### Success Criteria:

#### Automated Verification:

- §6.1 oraz §6.5 `context/foundation/test-plan.md` opisują gotowy do skopiowania wzorzec testu kontraktowego.
- Pełna lokalna sekwencja jakości przechodzi bez sekretów i połączeń zewnętrznych.

## Testing Strategy

### Unit Tests

- Walidator `parseRoutineAiProposal` dla kompletności propozycji, własności produktów, INCI i par zgodności.
- `getInterpretationStaleReason` oraz `createRoutineAiAssessmentFingerprint` dla deterministycznej świeżości.
- Parser AI web search dla czystego i opakowanego JSON.
- Mapper błędów i parser payloadu błędu dla stabilnych kodów, polskich komunikatów i fallbacku.

### Contract Integration Tests

- Jeden mockowany request adaptera rutyny do OpenRoutera.
- Reprezentatywne endpointy AI, które zamieniają błąd providera, walidacji lub sieci na bezpieczny JSON.

### Manual Testing Steps

Nie ma osobnych kroków manualnych w tym rollout'cie, ponieważ plan nie zmienia workflow użytkownika. Ręczna kontrola UI po błędzie sieciowym i podczas intake jest jawnie odroczona do rollout'u 3, gdzie da rzeczywisty sygnał przeglądarkowy.

## Performance Considerations

Testy muszą działać wyłącznie w pamięci i nie wykonywać requestów sieciowych, dlatego ich czas uruchomienia nie zależy od providera, bazy ani katalogu produktów. Fixture'y pozostają minimalne, aby nie zwiększać kosztu utrzymania wraz z rozwojem katalogu.

## Migration Notes

Brak zmian schematu i migracji. Plan nie uruchamia `supabase db reset` ani `supabase migration up`.

## References

- Research: [context/changes/testing-ai-contract-foundation/research.md](research.md)
- Quality contract: [context/foundation/test-plan.md](../../foundation/test-plan.md)
- Project lesson: [context/foundation/lessons.md](../../foundation/lessons.md)
- Existing routine validation: [src/lib/domain/routine-ai.ts](../../../../src/lib/domain/routine-ai.ts)
- Existing cache freshness: [src/lib/domain/product-interpretation.ts](../../../../src/lib/domain/product-interpretation.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Test Runner and Shared Fixtures

#### Automated

- [x] 1.1 Add Vitest configuration and local test scripts
- [x] 1.2 Add reusable AI contract fixtures
- [x] 1.3 Verify test runner, Astro sync, lint, and production build

### Phase 2: Safe AI Error Contract

#### Automated

- [ ] 2.1 Define shared AI error contract and client payload parser
- [ ] 2.2 Apply safe AI error responses to provider-facing endpoints
- [ ] 2.3 Update React consumers and add error-contract route tests
- [ ] 2.4 Verify error contract tests, Astro sync, lint, and production build

### Phase 3: Deterministic AI and Freshness Contracts

#### Automated

- [ ] 3.1 Add routine proposal and compatibility-audit contract tests
- [ ] 3.2 Add product and routine cache-freshness tests
- [ ] 3.3 Add intake parser and representative provider-adapter tests
- [ ] 3.4 Verify deterministic contract tests, Astro sync, lint, and production build

### Phase 4: Verification and Test Cookbook

#### Automated

- [ ] 4.1 Document the unit and contract-test cookbook patterns
- [ ] 4.2 Run the complete local quality sequence without external services

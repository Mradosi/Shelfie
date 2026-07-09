# First product intake Implementation Plan

## Overview

Ten change dowozi pierwszy prawdziwy flow dodawania produktu do Shelfie po zakończeniu onboardingu profilu skóry. Użytkownik ma móc wyszukać kosmetyk po nazwie albo barcode, najpierw sprawdzić shared `products`, potem odpytac Open Beauty Facts, a gdy lookup jest niepełny przejść przez fallback AI web search, photo extraction lub manual entry, po czym zawsze zobaczyć ekran review i dopiero wtedy zapisać produkt na swoją półkę.

Plan świadomie absorbuje minimalny brakujący kontrakt `F-02`, bo obecny repo state nie ma jeszcze realnego shared product schema ani trusted write path do `products`. Zakres pozostaje jednak zawężony do confirmed product intake i pierwszego persisted shelf itemu; nie obejmuje jeszcze downstream enrichment, interpretacji AI per `(user, product)` ani routine logic.

## Current State Analysis

Repo ma już działający auth funnel, protected routes i post-auth gate. `signin` kieruje użytkownika do `/start`, a `start.astro` decyduje dziś tylko o profilu skóry: kompletny profil trafia na `/dashboard`, niekompletny na onboarding (`src/pages/api/auth/signin.ts:19`, `src/pages/start.astro:29-36`). Middleware chroni tylko aktualne surface'y profilu i dashboard (`src/middleware.ts:4-24`), a topbar nie ma jeszcze żadnego wejścia do shelf/product flow (`src/components/Topbar.astro:9-27`).

Po stronie danych istnieje jedynie stub `public.products` z `id` i timestamps oraz osobna tabela `user_shelf_items`, która wymaga istniejącego `product_id` (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-17`, `:37-44`). Runtime users mają na `products` wyłącznie `select`, więc obecna aplikacja nie ma żadnej zwykłej ścieżki do tworzenia lub aktualizacji shared products (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315`). `user-domain.ts` potrafi tylko dodać rekord shelf membership dla już istniejącego produktu (`src/lib/domain/user-domain.ts:354-383`).

Produktowe dokumenty są spójne co do docelowego UX: internal lookup first, potem OBF, potem AI/photo/manual fallback i obowiązkowe user confirmation (`context/foundation/architecture-notes.md:57-81`, `context/foundation/prd.md:71-77`). Research potwierdził też, że Open Beauty Facts jest najlepszym MVP source, a repo potrzebuje ingredient-aware provider, nie tylko retail barcode API (`context/changes/first-product-intake/research.md:31-43`, `:141-147`).

## Desired End State

Po zakończeniu planu zalogowany użytkownik z ukończonym profilem skóry może przejść z onboardingu lub nawigacji do chronionego flow intake produktu. Flow pozwala rozpocząć od search po nazwie albo barcode, najpierw sprawdza lokalne shared products, a gdy nie ma trafienia lub dane są niepełne odpytuje OBF i w razie potrzeby prowadzi do AI web search, photo extraction albo manual entry. Niezależnie od źródła, finalny payload trafia na obowiązkowy review screen, gdzie użytkownik potwierdza lub poprawia dane przed zapisem.

Po potwierdzeniu aplikacja zapisuje albo reuse'uje canonical shared product z minimalnym kontraktem (`name`, `brand`, `category`, `barcode`, raw `inci_list`, `image_url`, `inci_source`, `inci_confidence`, `inci_updated_at`), a następnie dodaje go do `user_shelf_items`. Użytkownik kończy flow na pierwszym shelf/success surface z jasnym komunikatem, że produkt został dodany, a shared-product reuse działa zarówno dla lookupów po barcode, jak i dla name-only matches przez fallback `barcode -> normalized brand + name`.

Weryfikacja końca stanu docelowego:

- użytkownik może dodać pierwszy produkt po nazwie albo barcode z obowiązkowym review przed zapisem,
- confirmed product zapisuje się do shared `products` z provenance/confidence i jest powiązany z `user_shelf_items`,
- ponowny intake tego samego produktu reuse'uje shared record zamiast tworzyć kolejny duplikat,
- fallbacki OBF -> AI web search / photo / manual działają w ramach jednego chronionego flow,
- repo przechodzi `npx astro sync && npm run lint && npm run build`, a manual smoke obejmuje lookup, fallback, dedupe i auth boundaries.

### Key Discoveries:

- `products` jest dziś tylko stubem i nie ma żadnych pól potrzebnych do confirmed intake ani provenance (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-17`, `context/foundation/architecture-notes.md:87-101`).
- App runtime nie ma write permissions do `products`, więc shared product create/update musi przejść przez trusted server-side path, nie przez zwykłe clientowe inserty (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315`).
- Najbliższy wzorzec UX to onboardingowy React wizard z form POST do API route, a najbliższy wzorzec backendowy to cienki route delegujący logikę do modułu domenowego (`src/components/onboarding/SkinProfileWizard.tsx:176-181`, `src/pages/api/domain/profile.ts:190-245`).
- `S-01` kończy się dziś ekranem, który wprost komunikuje pustą półkę i kolejny slice produktowy; to naturalny handoff point dla `S-02` (`src/pages/onboarding/skin-profile/complete.astro:49-53`, `:71-79`).

## What We're NOT Doing

- Nie implementujemy AI-generated `ingredient_groups`, `concern_tags`, `routine_roles` ani pełnego downstream product enrichment; zapisujemy tylko minimalny confirmed product contract potrzebny do reuse i późniejszych slice'ów.
- Nie implementujemy personalized interpretation cache per `(user, product)`, fit score, warnings ani product card z pełną analizą.
- Nie budujemy zakupowych integracji, marketplace sources ani szerokiego multi-provider federation beyond OBF + wskazane fallbacki.
- Nie rozwiązujemy zaawansowanego barcode scanning UX na poziomie natywnego aparatu lub rozbudowanego OCR pipeline; zakres obejmuje barcode lookup w first intake flow, nie osobny scanning platform project.
- Nie przebudowujemy routine managementu, dashboardu ani globalnego app shell poza zmianami koniecznymi do wejścia w product intake i zobaczenia pierwszego shelf result.

## Implementation Approach

Podejście dzieli zmianę na trzy warstwy. Najpierw ląduje minimalny shared-product foundation wewnątrz tego streamu: schema, provenance contract i serwerowy moduł produktowy zdolny rozstrzygać `reuse vs create` bez wystawiania write access do `products` zwykłemu klientowi. Następnie powstaje właściwa orkiestracja intake: search/name/barcode input, OBF lookup, fallback branches, review state i POST save flow. Na końcu flow zostaje wpięty w istniejący authenticated lifecycle, tak by onboarding completion, `/start`, topbar i pierwszy shelf result tworzyły spójne end-to-end doświadczenie.

Kluczowa decyzja architektoniczna to utrzymanie dwóch oddzielnych granic: shared product contract i per-user shelf membership. Product-domain module dostaje odpowiedzialność za canonical lookup/upsert i provider mapping, natomiast istniejący `user-domain.ts` pozostaje właścicielem `user_shelf_items` oraz późniejszych relacji routine -> shelf item. Dzięki temu S-02 wykorzystuje już istniejący fundament ownership zamiast go rozsadzać, ale nie próbuje też wtłoczyć shared-product reguł do modułu czysto userowego.

## Critical Implementation Details

### Timing & lifecycle

Intake nie może pisać do `user_shelf_items` zanim nie rozstrzygnie canonical shared product identity, bo obecny kontrakt shelf wymaga realnego `product_id` FK. Kolejność w save path jest więc load-bearing: resolve existing shared product -> ewentualny trusted upsert do `products` -> attach to `user_shelf_items` -> redirect na result surface.

### User experience spec

Review step jest obowiązkowy nawet dla czystych OBF hitów. To nie jest opcjonalna korekta po błędzie, tylko stały guardrail z PRD i plan nie powinien dopuszczać shortcutu "auto-save on exact match".

### AI fallback contract

`AI web search` w tym change oznacza realny server-side flow oparty o OpenRouter, a nie ręczny draft podszywający się pod AI. Użytkownik może podać nazwę, markę, kategorię i ewentualnie barcode, ale nie powinien być zmuszany do wpisywania INCI przed wejściem na review screen; to backend ma spróbować znaleźć i zsyntetyzować draft składu, a gdy to się nie uda, dopiero wtedy UI prowadzi do `photo extraction` albo `manual entry`.

## Phase 1: Shared product contract and server-side orchestration

### Overview

Ta faza dostarcza minimalny brakujący foundation potrzebny, by intake mógł w ogóle materializować confirmed products. Jej efektem ma być realny shared-product schema, provider-facing moduł domenowy i bezpieczny write path, który działa w modelu server-only oraz respektuje provenance i dedupe rules.

### Changes Required:

#### 1. Shared product schema migration

**File**: `supabase/migrations/<timestamp>_shared_product_intake_contract.sql`

**Intent**: Rozszerzyć `public.products` z technicznego stubu do minimalnego confirmed product contract, którego wymaga `S-02`, bez rozlewania tego od razu do pełnego metadata/enrichment layer.

**Contract**: Migracja dodaje do `public.products` pola co najmniej `name`, `brand`, `category`, `barcode`, `normalized_name`, `normalized_brand`, `inci_list`, `image_url`, `inci_source`, `inci_confidence`, `inci_updated_at` oraz constraints/indexy wspierające lookup po barcode i fallback po znormalizowanej parze `brand + name`. `barcode` pozostaje opcjonalne, bo flow wspiera też name-only intake; dedupe contract to `barcode` jako najsilniejszy match i fallback do `normalized_brand + normalized_name`, gdy barcode brak. Provenance contract obsługuje minimum: `open_beauty_facts`, `ai_web_search`, `photo_vision`, `manual` oraz poziomy confidence zgodne z `architecture-notes.md`.

#### 2. Product-domain module

**File**: `src/lib/domain/product-domain.ts`

**Intent**: Zamknąć w jednym serwerowym module reguły canonical product resolution, provider payload mapping i confirmed-product upsert, zamiast rozpraszać je po route'ach i komponentach.

**Contract**: Moduł eksportuje typy dla shared product summary, confirmed product input, review payload i provider resultów, a także funkcje do: lookupu local-first, matchowania po `barcode -> normalized brand + name`, mapowania OBF/fallback payloadów do internal contractu oraz trusted create-or-reuse save flow. Moduł działa na request-scoped Supabase clientcie, nie wymaga client-side secrets i nie miesza odpowiedzialności `user_shelf_items`; attach do półki pozostaje osobnym krokiem po rozstrzygnięciu shared product identity.

#### 3. Product intake API route

**File**: `src/pages/api/domain/products/intake.ts`

**Intent**: Udostępnić cienki server-side endpoint dla confirmed intake save, który obsługuje auth, bezpieczne redirecty i deleguje logikę do modułu produktowego.

**Contract**: Route przyjmuje review-confirmed payload z hidden inputs albo równoważnego form submitu, waliduje wewnętrzne redirect paths i wymaga zalogowanego użytkownika. Po stronie domenowej wykonuje canonical shared-product resolve/create, a następnie używa istniejącego `addUserShelfItem()` do zapisania shelf membership. W przypadku duplikatu dla tego samego usera endpoint ma zwrócić czytelny success/result state zamiast traktować reuse jako błąd krytyczny.

#### 4. External provider adapter layer

**File**: `src/lib/integrations/open-beauty-facts.ts`

**Intent**: Wyizolować HTTP contract wobec OBF i uniknąć mieszania fetch details z domenowym flow intake.

**Contract**: Moduł udostępnia Worker-compatible fetch-first client dla lookupu po barcode i po nazwie, mapuje najważniejsze pola OBF do wewnętrznego result shape i jawnie oznacza incomplete responses, gdy payload nie zawiera wystarczającego INCI do direct review. Integracja nie bierze na siebie user confirmation ani shelf attach; jej kontrakt kończy się na provider resultach gotowych do dalszego decision flow.

### Success Criteria:

#### Automated Verification:

- Shared-product migracja i polityki aplikują się czysto: `npx supabase db reset`
- Astro typy odświeżają się dla nowego modułu domenowego i route'u intake: `npx astro sync`
- Lint przechodzi dla schema helpers, product-domain module i provider adaptera: `npm run lint`

#### Manual Verification:

- W Supabase Studio `products` ma nowe pola shared contractu i wspiera lookup po barcode oraz fallback po znormalizowanej nazwie/brandzie
- Zwykły authenticated client nadal nie ma bezpośredniego write access do `products`, a confirmed save działa tylko przez server-side route

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Intake UX, fallback branches, and review flow

### Overview

Ta faza dostarcza właściwy product-facing flow `S-02`: search-first entry, barcode path, OBF lookup, wszystkie uzgodnione fallbacki oraz obowiązkowy review przed zapisem. Celem jest pierwszy kompletny intake journey, nie tylko backend capability.

### Changes Required:

#### 1. Protected intake route

**File**: `src/pages/products/intake.astro`

**Intent**: Dodać dedykowany, chroniony entry surface dla first product intake, który nie miesza się ani z dashboard debug surface, ani z profile settings.

**Contract**: Route jest dostępny tylko dla zalogowanego użytkownika z kompletnym skin profile i ładuje server-side dane potrzebne do startu flow. Surface startuje od wyszukania po nazwie albo barcode, komunikuje local-first/shared-source behavior i nie zapisuje nic do bazy przed finalnym review submit.

#### 2. Intake flow React island

**File**: `src/components/products/ProductIntakeFlow.tsx`

**Intent**: Zbudować multi-step, search-first flow z mandatory review stepem i obsługą wszystkich gałęzi fallbackowych w jednym spójnym interaktywnym komponencie.

**Contract**: Komponent prowadzi użytkownika przez: input search/barcode, listę local/shared/OBF wyników, fallback options, review/edit state i finalny POST submit. Barcode pozostaje pełnoprawną ścieżką `S-02`, nie tylko bonusowym quick path. Niezależnie od źródła, komponent kończy na editable review payloadzie, który zawiera minimalny confirmed product contract oraz provenance marker.

#### 3. Fallback adapters and branch handling

**File**: `src/lib/integrations/product-intake-fallbacks.ts`

**Intent**: Uporządkować branch logic dla AI web search, photo extraction i manual entry tak, by nie kodować każdej ścieżki ad hoc w komponencie UI.

**Contract**: Moduł definiuje wspólny result shape dla fallbacków oraz granice ich odpowiedzialności. `ai_web_search` musi być zasilane przez realny server-side provider flow i zwracać albo prefilled draft do review, albo stan `ambiguous`, gdy query jest zbyt szerokie lub prowadzi do kilku sensownych wariantów tego samego kosmetyku. W stanie `ambiguous` UI pokazuje maksymalnie 3-5 najlepszych wariantów oraz pole do własnego doprecyzowania tekstem, zamiast wymuszać wybór z pełnej listy wszystkich trafień. Ten branch może korzystać z OpenRoutera oraz zewnętrznych źródeł pomocniczych takich jak INCIDecoder, ale kontrakt użytkowy pozostaje AI-first i nie może arbitralnie wybierać „pierwszego lepszego” wariantu przy braku rozróżnienia. `photo_vision` również ma zwracać draft do review, choć technicznie może pozostać lżejszą integracją MVP. `manual` pozostaje pełnoprawnym final fallbackiem i zawsze może uzupełnić brakujące pola minimalnego contractu.

#### 4. OpenRouter-backed AI web search integration

**File**: `src/lib/integrations/openrouter.ts`

**Intent**: Dodać jednoznaczną, server-side integrację z modelem AI używanym do fallbacku `AI web search`, tak aby implementacja nie zastępowała AI ręcznym formularzem ani heurystycznym scraperem udającym model.

**Contract**: Moduł czyta `OPENROUTER_API_KEY` wyłącznie po stronie serwera, wysyła do OpenRoutera prompt z danymi wejściowymi produktu (`name`, `brand`, `category`, opcjonalnie `barcode`) i zwraca jeden z dwóch stanów użytkowych: `resolved` z ustrukturyzowanym draftem zawierającym co najmniej `name`, `brand`, `category`, `inciText`, `imageUrl?`, `source=ai_web_search`, `confidence=medium`, albo `ambiguous`, gdy model widzi kilka prawdopodobnych wariantów i query nie zawiera wystarczającego discriminatora. W stanie `ambiguous` model zwraca krótkie pytanie doprecyzowujące oraz maksymalnie 3-5 wariantów z cechami rozróżniającymi; przy bardzo szerokich zapytaniach typu `krem CeraVe` ma zawęzić listę do kilku najbardziej prawdopodobnych opcji i pozwolić użytkownikowi wpisać dokładniejszą nazwę samodzielnie. Moduł nie może arbitralnie wybierać jednego wariantu tylko dlatego, że był pierwszy w searchu. Awaria OpenRoutera albo brak wiarygodnego wyniku nie może wywracać całego flow; endpoint ma zwrócić kontrolowany błąd prowadzący użytkownika do `photo extraction` lub `manual entry`.

#### 5. AI fallback API route

**File**: `src/pages/api/domain/products/ai-web-search.ts`

**Intent**: Wystawić cienki endpoint serwerowy dla `AI web search`, żeby UI wysyłało jedynie minimalny kontekst produktu, a nie próbowało samo budować draftu składu.

**Contract**: Route wymaga zalogowanego użytkownika, przyjmuje payload z nazwą produktu i dodatkowymi polami kontekstowymi, deleguje wyszukiwanie do integracji OpenRoutera i zwraca albo draft gotowy do review, albo stan `ambiguous` z listą wariantów i komunikatem doprecyzowującym. Route nie zapisuje nic do `products` ani `user_shelf_items`; kończy się na przygotowaniu review payloadu, stanie doprecyzowania wariantu albo na kontrolowanym błędzie, który uruchamia kolejny fallback branch.

#### 6. Review and result routes

**File**: `src/pages/products/intake/complete.astro`

**Intent**: Domknąć flow czytelnym success/result surface'em po confirmed save i uniknąć zrzucania użytkownika z powrotem na techniczny dashboard.

**Contract**: Route renderuje wynik dodania pierwszego produktu z informacją, czy doszło do nowego shared-product create czy reuse istniejącego rekordu, oraz daje dalszą nawigację do kolejnych produktów lub przyszłego shelf surface'u. Route nie pokazuje jeszcze pełnej product card ani routine guidance; kończy tylko `S-02` jako first persisted shelf item flow.

### Success Criteria:

#### Automated Verification:

- Typy i routing dla intake surface'ów przechodzą bez błędów: `npx astro sync`
- Lint przechodzi dla nowego flow UI i fallback branch handlingu: `npm run lint`
- Produkcyjny build przechodzi z nowymi protected product routes: `npm run build`
- Konfiguracja środowiskowa obejmuje server-side sekret dla OpenRoutera i nie eksponuje go do klienta

#### Manual Verification:

- Użytkownik może rozpocząć intake po nazwie albo barcode i przejść przez obowiązkowy review przed zapisem
- Brak danych z OBF prowadzi do działających fallbacków AI web search, photo extraction i manual entry zamiast ślepego końca flow
- `AI web search` sam próbuje znaleźć draft INCI na podstawie nazwy/marki/kategorii i nie wymaga ręcznego wpisania składu przed review
- Dla zapytań wieloznacznych albo zbyt szerokich `AI web search` nie wybiera arbitralnie jednego wariantu, tylko pokazuje maksymalnie kilka najlepszych opcji oraz pozwala doprecyzować własnym tekstem
- Użytkownik może poprawić nazwę, markę, INCI lub źródło na review screenie przed finalnym save

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: App integration, reuse verification, and developer handoff

### Overview

Ta faza wpina intake w istniejący lifecycle aplikacji i domyka change jako realny authenticated journey, a nie odizolowany eksperyment. Obejmuje routing po onboardingu, nawigację, dedupe smoke checks oraz końcowe instrukcje weryfikacyjne.

### Changes Required:

#### 1. Post-onboarding and start handoff

**File**: `src/pages/start.astro`

**Intent**: Włączyć `S-02` do istniejącego authenticated funnel tak, by użytkownik po ukończonym profilu skóry trafiał do pierwszego sensownego następnego kroku, a nie na debug dashboard.

**Contract**: `start.astro` rozstrzyga co najmniej trzy stany: brak profilu -> onboarding skin profile, kompletny profil bez shelf items -> product intake, oraz użytkownik z istniejącą półką -> dotychczasowy authenticated destination. Logika opiera się na istniejących modułach domenowych i nie przenosi provider lookupu do route gate'a.

#### 2. Navigation and onboarding completion updates

**File**: `src/pages/onboarding/skin-profile/complete.astro`

**Intent**: Zastąpić obecny placeholder „półka nadal jest pusta” realnym handoffem do `first-product-intake` i uczytelnić nawigację produktu w app shellu.

**Contract**: Completion screen po zapisaniu profilu wskazuje dodanie pierwszego produktu jako następny aktywny krok, a topbar/nawigacja dostają czytelny entry point do intake/shelf flow dla zalogowanego użytkownika. Zmiana nie ma jeszcze udawać kompletnego shelf managementu; ma jedynie usunąć mylący stan, w którym onboarding kończy się na debugowym dead-endzie.

#### 3. End-to-end verification surface and docs polish

**File**: `src/pages/dashboard.astro`

**Intent**: Utrzymać dashboard jako techniczny surface weryfikacyjny, ale rozszerzyć go tak, by wspierał smoke testy `S-02` bez mieszania go z finalnym UX produktu.

**Contract**: Dashboard albo powiązana dokumentacja dev-level wskazuje jak ręcznie sprawdzić local lookup, OBF hit, fallback branch, dedupe reuse i auth boundaries. Surface może linkować do intake route'u lub pokazać podstawowy status shelf count, ale nie staje się głównym UI do dodawania produktów.

### Success Criteria:

#### Automated Verification:

- Repo przechodzi końcową sekwencję jakości dla całego slice'a: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Nowy użytkownik po ukończeniu profilu trafia do product intake zamiast na techniczny dead-end
- Powtórne dodanie tego samego produktu reuse'uje istniejący shared record zamiast tworzyć duplikat
- Smoke test obejmuje clean name search, clean barcode flow, incomplete OBF fallback, review edits i auth protection nowych route'ów

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests:

- Repo nadal nie ma committed test suite, więc najwięcej logiki ryzykownej trzeba zamknąć w małych, czystych modułach: canonical product normalization, dedupe matching, provider payload mapping i review payload validation.
- Helpery `barcode -> normalized brand + name`, provenance mapping i fallback result normalization powinny mieć jedno source of truth w module domenowym lub integracyjnym, żeby uniknąć driftu między UI i route'ami.

### Integration Tests:

- `supabase db reset` z nową migracją shared products i local validation write pathu do `products`
- End-to-end flow: sign-in -> `/start` -> product intake -> review -> save -> result route -> persisted `user_shelf_items`
- Re-run intake dla tego samego produktu z potwierdzeniem, że shared product reuse działa przez barcode albo fallback normalization
- Server-side AI fallback flow: input product context -> OpenRouter draft -> review payload albo controlled fallback error

### Manual Testing Steps:

1. Zalogować nowego użytkownika z kompletnym profilem i potwierdzić, że `/start` kieruje do product intake.
2. Wyszukać produkt po nazwie, wybrać OBF hit, sprawdzić review screen i zapisać pierwszy produkt.
3. Powtórzyć flow po barcode dla produktu z jednoznacznym trafieniem i potwierdzić poprawny save.
4. Wymusić przypadek niepełnego OBF i potwierdzić, że `AI web search` zwraca draft do review bez ręcznego wpisywania INCI przed review.
5. Wysłać wieloznaczne zapytanie AI, np. produkt z kilkoma stężeniami lub szeroką rodziną wariantów, i potwierdzić, że UI pokazuje maksymalnie kilka propozycji oraz pole do własnego doprecyzowania zamiast arbitralnie wybierać pierwszy wynik.
6. Jeśli AI web search nie znajdzie wiarygodnego draftu, potwierdzić kontrolowane przejście do `photo extraction` albo `manual entry` zamiast martwego końca flow.
7. Na review screenie ręcznie poprawić co najmniej jedną wartość produktu i potwierdzić, że zapis respektuje korektę użytkownika.
8. Spróbować dodać ten sam produkt drugi raz i potwierdzić, że reuse shared product nie tworzy duplikatu w `products`.
9. Otworzyć nowe product routes bez sesji i potwierdzić redirect do `/auth/signin`.

## Performance Considerations

Najdroższe operacje w tym slice'ie to external lookups i ewentualne fallbacki AI/photo, nie lokalne zapisy do Supabase. Dlatego local-first lookup po shared `products`, indeks na `barcode` oraz na znormalizowanym `brand + name` i zachowanie minimalnego shared contractu są ważniejsze niż rozbudowana optymalizacja UI.

Provider integrations powinny używać prostego `fetch`, bez Node-only SDK, bo runtime docelowy to Cloudflare Workers (`context/foundation/infrastructure.md:15-18`, `:60-64`). Photo branch może być kosztowniejszy i wolniejszy, więc UI musi pokazywać czytelny progress/branch state zamiast ukrywać opóźnienia.

## Migration Notes

Ta zmiana jest addytywna wobec obecnego schema, ale funkcjonalnie absorbuje minimalny brakujący foundation `F-02`, bo `S-02` nie ma dziś na czym się oprzeć. Największe ryzyko migracyjne leży w zbyt szerokim rozroście shared product contractu; trzeba zatrzymać się na polach potrzebnych do confirmed intake, a nie próbować od razu lądować całego enrichment pipeline.

Barcode dedupe i fallback `normalized_brand + normalized_name` będą decyzją kontraktową od pierwszego dnia, więc migracja powinna od razu przewidzieć pola normalizacyjne oraz indeksy wspierające reuse. Nie należy jednak budować jeszcze osobnych merge tools ani backfill jobs; ich potrzeba pojawi się dopiero, gdy katalog shared produktów realnie urośnie.

## References

- Related research: `context/changes/first-product-intake/research.md`
- Roadmap slice boundary and risk: `context/foundation/roadmap.md:108`
- Foundation prerequisite warning: `context/foundation/roadmap.md:81`
- PRD guardrail for review before save: `context/foundation/prd.md:44`
- PRD intake cascade and shared-source search: `context/foundation/prd.md:71`
- Architecture intake flow and provenance contract: `context/foundation/architecture-notes.md:57`
- Architecture shared product fields: `context/foundation/architecture-notes.md:87`
- Infrastructure note about OpenRouter as external server-side dependency: `context/foundation/infrastructure.md:17`
- Current `products` stub and read-only access: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13`
- Existing shelf attach helpers: `src/lib/domain/user-domain.ts:354`
- Existing auth/start gate: `src/pages/start.astro:29`
- Existing onboarding completion handoff: `src/pages/onboarding/skin-profile/complete.astro:49`
- Existing multi-step wizard pattern: `src/components/onboarding/SkinProfileWizard.tsx:176`
- Existing API route pattern: `src/pages/api/domain/profile.ts:190`
- Existing protected-route boundary: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared product contract and server-side orchestration

#### Automated

- [x] 1.1 Shared-product migracja i polityki aplikują się czysto — c019f34
- [x] 1.2 Astro typy odświeżają się dla nowego modułu domenowego i route'u intake — c019f34
- [x] 1.3 Lint przechodzi dla schema helpers, product-domain module i provider adaptera — c019f34

#### Manual

- [x] 1.4 W Supabase Studio `products` ma nowe pola shared contractu i wspiera lookup po barcode oraz fallback po znormalizowanej nazwie/brandzie — c019f34
- [x] 1.5 Zwykły authenticated client nadal nie ma bezpośredniego write access do `products`, a confirmed save działa tylko przez server-side route — c019f34

### Phase 2: Intake UX, fallback branches, and review flow

#### Automated

- [x] 2.1 Typy i routing dla intake surface'ów przechodzą bez błędów — e44a88b
- [x] 2.2 Lint przechodzi dla nowego flow UI i fallback branch handlingu — e44a88b
- [x] 2.3 Produkcyjny build przechodzi z nowymi protected product routes — e44a88b

#### Manual

- [x] 2.4 Użytkownik może rozpocząć intake po nazwie albo barcode i przejść przez obowiązkowy review przed zapisem — e44a88b
- [x] 2.5 Brak danych z OBF prowadzi do działających fallbacków AI web search, photo extraction i manual entry zamiast ślepego końca flow — e44a88b
- [x] 2.6 `AI web search` sam próbuje znaleźć draft INCI na podstawie nazwy/marki/kategorii i nie wymaga ręcznego wpisania składu przed review — e44a88b
- [x] 2.7 Użytkownik może poprawić nazwę, markę, INCI lub źródło na review screenie przed finalnym save — e44a88b

### Phase 3: App integration, reuse verification, and developer handoff

#### Automated

- [x] 3.1 Repo przechodzi końcową sekwencję jakości dla całego slice'a — e44a88b

#### Manual

- [x] 3.2 Nowy użytkownik po ukończeniu profilu trafia do product intake zamiast na techniczny dead-end — e44a88b
- [x] 3.3 Powtórne dodanie tego samego produktu reuse'uje istniejący shared record zamiast tworzyć duplikat — e44a88b
- [x] 3.4 Smoke test obejmuje clean name search, clean barcode flow, incomplete OBF fallback, review edits i auth protection nowych route'ów — e44a88b

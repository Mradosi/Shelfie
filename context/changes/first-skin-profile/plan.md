# First skin profile Implementation Plan

## Overview

Ten change zamienia obecny smoke-testowy zapis profilu w pierwszy realny onboarding flow dla kontekstu skóry. Użytkownik po pierwszym skutecznym wejściu do aplikacji ma trafić do dedykowanego, 3-krokowego wizardu, odpowiedzieć na pytania o zwykłą skórę z ostatnich 2-4 tygodni, zapisać podstawowy profil i zakończyć onboarding na ekranie, który jasno komunikuje, że kolejnym krokiem będzie dodanie pierwszego produktu.

Plan świadomie nie rozszerza schematu bazy i nie wciąga do `S-01` żadnej odpowiedzialności produktowej z `S-02`. Persisted kontrakt pozostaje taki jak dziś: `skin_type`, pięć strukturalnych `skin_aspects`, `concerns`, `goals` i opcjonalne `notes`; zmienia się sposób wejścia, copy, routing i mapowanie odpowiedzi onboardingowych do istniejącego modelu.

## Current State Analysis

Repo ma już gotowy minimalny kontrakt profilu i chroniony write path, ale aktualny surface jest jawnie developerskim smoke testem, a nie onboardingiem produktowym. `user-domain.ts` definiuje stabilne opcje `skin_type`, pięć kluczy `skin_aspects` i cztery poziomy nasilenia, a `createEmptyUserProfile()` ustawia puste concerns/goals oraz defaultowe poziomy aspektów (`src/lib/domain/user-domain.ts:9-15`, `src/lib/domain/user-domain.ts:67-92`, `src/lib/domain/user-domain.ts:135-143`).

Dashboard renderuje dziś prosty formularz z selectami dla aspektów oraz tekstowymi polami comma-separated dla `concerns` i `goals`, a copy wprost mówi, że to "smoke-test contract", nie finalny onboarding UX (`src/pages/dashboard.astro:53-109`, `src/pages/dashboard.astro:155-181`). API `/api/domain/profile` waliduje ten payload w formie prostego formularza i po sukcesie zawsze wraca na `/dashboard` (`src/pages/api/domain/profile.ts:17-21`, `src/pages/api/domain/profile.ts:130-185`).

Auth flow nadal kieruje po sign-in na `/`, a signup w środowisku produkcyjnym kończy się ekranem potwierdzenia maila i dopiero późniejszym sign-inem (`src/pages/api/auth/signin.ts:4-20`, `src/pages/api/auth/signup.ts:4-20`, `src/pages/auth/confirm-email.astro:4-33`). Middleware chroni dziś tylko `/dashboard`, a Topbar dla zalogowanego użytkownika eksponuje wyłącznie link do dashboardu jako głównego authenticated entry pointu (`src/middleware.ts:4-24`, `src/components/Topbar.astro:8-22`).

Research i roadmapa już ustaliły najważniejsze granice zmiany. `S-01` ma dowieźć "saved profile and an empty shelf ready for product intake", ale nie może przejąć samego product intake z `S-02` (`context/foundation/roadmap.md:98-105`). Jednocześnie concerns i goals mają pozostać na tym etapie nienormalizowane, a repo nie chce zamykać ich słownika wyłącznie w predefined tags (`context/changes/first-skin-profile/research.md:52-58`, `src/pages/dashboard.astro:166-181`).

## Desired End State

Po zakończeniu planu Shelfie ma mieć osobny onboarding route dla pierwszego skin profile, uruchamiany jako pierwszy product-facing krok po skutecznym wejściu do aplikacji. Onboarding zbiera `skin_type`, pięć `skin_aspects` przez obserwowalne pytania mapowane deterministycznie do `none|low|medium|high`, oraz `concerns` i `goals` przez sugerowane chipy z opcją własnych wpisów, po czym zapisuje wszystko do istniejącego kontraktu domenowego bez migracji schematu.

Po pierwszym zapisie użytkownik ma zobaczyć ekran ukończenia z jasnym komunikatem, że profil został zapisany, a następnym krokiem będzie dodanie pierwszego produktu w kolejnym slice'ie. Późniejsza edycja profilu ma być dostępna z osobnego, chronionego surface'u ustawień/profilu, natomiast `/dashboard` pozostaje debugowo-statusowym ekranem weryfikacji persisted state.

Weryfikacja końca stanu docelowego:

- nowy użytkownik po sign-in trafia do dedykowanego onboarding flow zamiast na publiczny landing lub techniczny formularz,
- onboarding zapisuje profil zgodny z obecnym kontraktem `user_profiles`,
- concerns/goals pozostają zapisywane w istniejących arrayach tekstowych bez canonical normalization,
- istniejący użytkownik z zapisanym profilem może wejść na osobny ekran edycji i zmienić profil bez rerunu first-run onboardingu,
- dashboard nadal pokazuje persisted status profilu, ale nie pełni roli głównego first-run UX.

### Key Discoveries:

- Obecny model domenowy już rozstrzyga shape persisted profilu; `S-01` nie potrzebuje zmiany schematu, tylko nowego flow wejścia i lepszego mapowania odpowiedzi do istniejącego kontraktu (`src/lib/domain/user-domain.ts:9-15`, `src/lib/domain/user-domain.ts:67-92`).
- Dashboard jest dziś wprost opisany jako technical verification surface, więc przerabianie go na onboarding byłoby sprzeczne z aktualną intencją repo (`src/pages/dashboard.astro:97-100`).
- `concerns` i `goals` są w obecnym repo celowo free-form; najbezpieczniejszy kierunek to suggested chips + custom entries przy zachowaniu raw phrasing w istniejących polach (`context/changes/first-skin-profile/research.md:33-40`, `context/changes/first-skin-profile/research.md:197-203`).
- Signup flow w produkcji wymaga potwierdzenia maila, więc onboarding nie powinien być wpinany bezpośrednio po `signUp`; naturalnym entry pointem jest pierwszy skuteczny sign-in lub dedykowany post-auth gate (`src/pages/api/auth/signup.ts:13-19`, `src/pages/auth/confirm-email.astro:13-33`).

## What We're NOT Doing

- Nie zmieniamy schematu bazy ani shape `user_profiles`; brak nowych kolumn dla completion flag, raw questionnaire answers czy canonical tags.
- Nie implementujemy intake produktu, pustej półki z możliwością dodania produktu ani żadnego zapisu do `user_shelf_items`; onboarding kończy się tylko product-facing handoffem do przyszłego `S-02`.
- Nie wprowadzamy canonical normalization dla concerns/goals ani mapowania ich do product-level `concern_tags`.
- Nie budujemy globalnego "profile completion required" gate dla wszystkich przyszłych authenticated route'ów; scope ogranicza się do post-auth entry pointu i nowych surface'ów tej zmiany.
- Nie próbujemy odtwarzać odpowiedzi ankietowych z persisted severity levels; późniejsza edycja pracuje bezpośrednio na zapisanych levelach.

## Implementation Approach

Podejście opiera się na rozdzieleniu trzech warstw odpowiedzialności. Pierwsza to routing i lifecycle: po auth wchodzimy przez dedykowany gate, który sprawdza, czy użytkownik ma już kompletny profil, i kieruje go albo do onboardingu, albo dalej do istniejącego authenticated surface'u. Druga to questionnaire layer: osobny, declarative moduł z pytaniami obserwowalnymi, chipsami i deterministycznym mappingiem do `SkinAspects`, bez rozszerzania persisted kontraktu. Trzecia to rozdzielenie first-run onboarding od późniejszej edycji: onboarding używa pytań obserwowalnych i prowadzi do completion screen, a edit surface pracuje już bezpośrednio na zapisanych levelach i listach tekstowych.

Kluczowa decyzja architektoniczna to brak nowego DB-level completion flag. "Profil ukończony" jest pochodną istniejącego persisted stanu: zapisany rekord z nie-nullowym `skinType` i pełnym zestawem pięciu `skinAspects` wystarcza, bo aspekty są kontraktowo obowiązkowe, a `concerns` i `goals` pozostają opcjonalne. Dzięki temu `S-01` nie rusza migracji i nie rozjeżdża się z fundacją `F-01`.

## Critical Implementation Details

Onboarding nie może być osadzony bezpośrednio po `signUp`, bo obecny production flow kończy się ekranem "Check your email" i dopiero późniejszym logowaniem. Najbezpieczniejszy punkt wejścia to dedykowany post-auth gate po `signIn`, który na serwerze rozstrzyga, czy user ma już ukończony profil.

Persisted model przechowuje tylko końcowe poziomy `skin_aspects`, a nie surowe odpowiedzi ankietowe. To oznacza, że first-run wizard i późniejszy edit screen nie są symetryczne: onboarding może pytać obserwowalnie i mapować do severity, ale edit surface musi pracować bezpośrednio na levelach oraz listach concerns/goals, bo reverse mapping byłby sztuczny i niestabilny.

Write path powinien pozostać pojedynczy. Nowy onboarding payload może być bogatszy niż obecne comma-separated inputy z dashboardu, ale serwer powinien nadal kończyć w tym samym `UserProfileInput`, żeby dashboard/debug surface i edit surface nie rozjechały się względem kontraktu domenowego.

Zakres nie obejmuje globalnego forcingu onboardingu na wszystkich signed-in route'ach. W tej zmianie gate dotyczy post-auth entry pointu oraz dedykowanych onboarding/edit surface'ów; debugowy dashboard pozostaje dostępny jako surface developerski, a nie jako część finalnego app shell enforcement.

## Phase 1: Onboarding entry and route boundaries

### Overview

Ta faza ustanawia product-facing wejście do `S-01` oraz rozdziela onboarding od technicznego dashboardu. Jej celem jest takie wpięcie flow po auth, żeby nowy użytkownik trafiał do skin-profile onboardingu, ale jednocześnie żeby repo nie musiało jeszcze budować pełnego, globalnego completion gate dla wszystkich przyszłych ekranów.

### Changes Required:

#### 1. Post-auth gate route

**File**: `src/pages/start.astro`

**Intent**: Wprowadzić pojedynczy, serwerowy entry point po auth, który centralizuje decyzję "onboarding vs dalszy authenticated flow", zamiast duplikować ją w wielu route'ach albo rozpraszać po kliencie.

**Contract**: Route jest dostępny tylko dla zalogowanego użytkownika, ładuje persisted profile przez istniejący moduł domenowy i rozstrzyga completeness bez nowej flagi w bazie. Jeśli profil nie istnieje lub nie spełnia warunku first-run completion, redirectuje do dedykowanego onboardingu; jeśli profil jest kompletny, redirectuje do aktualnego authenticated destination uzgodnionego dla repo na tym etapie. Route nie renderuje własnego UI poza minimalnym fallbackiem błędu.

#### 2. Auth redirect handoff

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Przełączyć pierwszy skuteczny post-login redirect z publicznego landingu na nowy entry point onboardingowy, bez zmiany semantics samego logowania.

**Contract**: Po udanym `signInWithPassword` route nie wraca już na `/`, tylko kieruje do post-auth gate z poprzedniego kroku. Obsługa błędów, brak konfiguracji Supabase i redirect do `/auth/signin` pozostają zgodne z istniejącym wzorcem. Signup production flow pozostaje bez zmian: w środowisku z email confirmation onboarding zaczyna się dopiero po późniejszym sign-inie.

#### 3. Protected onboarding and edit surfaces

**File**: `src/pages/onboarding/skin-profile.astro`

**Intent**: Dodać dedykowany, chroniony shell dla first-run wizardu, niezależny od dashboardu i future product surfaces.

**Contract**: Route jest dostępny tylko dla zalogowanego użytkownika, ładuje stan potrzebny do first-run flow i nie udaje jeszcze końcowego app shell. Jeśli user ma już ukończony profil, route nie uruchamia ponownie onboardingu, tylko odsyła go do uzgodnionego post-onboarding destination albo ekranu edycji, zależnie od przyjętej semantyki flow.

#### 4. Auth coverage in middleware

**File**: `src/middleware.ts`

**Intent**: Rozszerzyć auth protection na nowe route'y tej zmiany bez wprowadzania DB-heavy global guards do middleware.

**Contract**: Middleware chroni nowy post-auth gate, onboarding route i dedykowany route edycji profilu w tym samym auth-only modelu co obecny `/dashboard`. Middleware nie podejmuje decyzji o completeness profilu i nie odpyta bazy o `user_profiles`; jego odpowiedzialność pozostaje ograniczona do sesji.

#### 5. Navigation boundary polish

**File**: `src/components/Topbar.astro`

**Intent**: Ustawić czytelne granice między debugowym dashboardem a nowym profile/edit flow, tak aby authenticated navigation nie sugerowała, że dashboard jest jedyną ścieżką użytkownika.

**Contract**: Nawigacja dla zalogowanego użytkownika nadal może eksponować dashboard jako status/debug surface, ale powinna też przewidywać wejście do route'u profilu lub settings po ukończeniu onboardingu. Zmiana nie buduje pełnego app navigation system; tylko usuwa mylący sygnał, że `/dashboard` jest głównym first-run destination.

### Success Criteria:

#### Automated Verification:

- Typy i routing dla nowych surface'ów przechodzą bez błędów: `npx astro sync`
- Lint przechodzi dla nowych redirectów auth i middleware: `npm run lint`

#### Manual Verification:

- Użytkownik bez persisted profilu po skutecznym sign-in trafia na onboarding zamiast na `/`
- Użytkownik z kompletnym profilem omija onboarding i przechodzi przez nowy post-auth gate bez pętli redirectów
- Wejście na `/start`, `/onboarding/skin-profile` i późniejszy route edycji bez sesji nadal kończy się redirectem do `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Questionnaire model and persistence wiring

### Overview

Ta faza projektuje właściwy input model dla skin profile i mapuje go na istniejący kontrakt domenowy. Jej rezultat ma być zrozumiały dla użytkownika bez wiedzy eksperckiej, zgodny z researchowym kierunkiem pytań obserwowalnych i jednocześnie bezpieczny wobec późniejszego wykorzystania danych przez kolejne slice'y.

### Changes Required:

#### 1. Questionnaire definition module

**File**: `src/lib/domain/skin-profile-questionnaire.ts`

**Intent**: Wyciągnąć treść pytań, answer scale, scoring i suggested chips do jednego source of truth, zamiast zakodować te decyzje bezpośrednio w komponencie UI albo w route handlerze.

**Contract**: Moduł eksportuje pełną definicję 3-step onboarding flow: copy dla "usual skin in the last 2-4 weeks", listę pytań obserwowalnych dla każdego z pięciu `skin_aspects`, skalę odpowiedzi 0-3 lub równoważny deterministyczny answer model, mapping z odpowiedzi do `none|low|medium|high`, oraz suggested concern/goal chips zgodne z researchowym rozróżnieniem problemów i outcome-oriented goals. Moduł nie wprowadza nowych persisted typów i nie modyfikuje `UserProfileInput`.

#### 2. Onboarding wizard UI

**File**: `src/components/onboarding/SkinProfileWizard.tsx`

**Intent**: Zbudować 3-step first-run wizard, który zbiera wymagane minimum profilu przy niskim tarciu i bez epatowania usera terminologią severity z modelu domenowego.

**Contract**: Komponent renderuje trzy kroki: `skin_type`, pytania dla `skin_aspects`, oraz `concerns + goals`. `skin_type` i komplet odpowiedzi potrzebnych do wyliczenia wszystkich pięciu aspektów są wymagane; `concerns` i `goals` są opcjonalne. Wizard pokazuje progres, waliduje krok po kroku, pozwala wrócić do poprzednich etapów bez utraty wpisanych danych i serializuje submit do jednego payloadu obsługiwanego przez istniejący write path.

#### 3. Shared profile completeness helper

**File**: `src/lib/domain/user-domain.ts`

**Intent**: Zamknąć w jednym miejscu logikę "czy persisted profil jest wystarczająco kompletny, by uznać onboarding za zakończony", zamiast rozpraszać warunki po route'ach.

**Contract**: Moduł eksportuje helper określający completion na bazie istniejącego persisted profilu. Helper opiera się wyłącznie na obecnych polach kontraktu i jest wykorzystywany przez post-auth gate, onboarding route i completion/edit surfaces; nie zmienia shape `UserProfile`, nie tworzy nowej flagi i nie uznaje concerns/goals za wymagane.

#### 4. Profile write path evolution

**File**: `src/pages/api/domain/profile.ts`

**Intent**: Rozszerzyć istniejący endpoint tak, aby przyjął onboardingowy payload z wizardu, a jednocześnie nie zerwał kompatybilności z debugowym dashboardem i późniejszym edit surface'em.

**Contract**: Route dalej zapisuje końcowy `UserProfileInput`, ale akceptuje dwa tryby wejścia: onboardingowy payload potrzebny do obliczenia `skinAspects` z pytań obserwowalnych oraz prostszy payload z już ustalonymi levelami dla edit/debug surface'ów. `concerns` i `goals` są przyjmowane jako wielowartościowe wybory z opcjonalnymi custom entries, normalizowane do istniejących `string[]`, deduplikowane i walidowane długościowo bez canonical normalization. Zapis sukcesu nie musi już zawsze wracać na `/dashboard`; redirect destination zależy od kontekstu surface'u.

### Success Criteria:

#### Automated Verification:

- Nowy moduł questionnaire i jego integracja z route'ami przechodzą lint bez błędów: `npm run lint`
- Produkcyjny build przechodzi z nowym wizardem i nowym payload mappingiem: `npm run build`

#### Manual Verification:

- Wizard działa jako 3 kroki z poprawnym stanem progresu, walidacją i nawigacją wstecz
- Odpowiedzi obserwowalne zapisują się jako poprawne `skin_aspects` w istniejącym kontrakcie, bez dodawania nowych pól do `user_profiles`
- Suggested chips i własne wpisy dla `concerns`/`goals` kończą jako oczekiwane wartości w persisted `string[]`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Completion, edit surface, and verification boundary

### Overview

Ta faza domyka onboarding jako kompletny first-run flow i jednocześnie przygotowuje bezpieczny model późniejszej edycji bez cofania użytkownika do ankiety startowej. Efektem ma być jasny moment zakończenia `S-01`, osobny edit surface oraz utrzymanie dashboardu jako technicznego status/debug view.

### Changes Required:

#### 1. Onboarding completion screen

**File**: `src/pages/onboarding/skin-profile/complete.astro`

**Intent**: Dodać wyraźny koniec first-run flow, który domyka onboarding i ustawia użytkownikowi kolejną mentalną akcję bez udawania, że `S-02` już istnieje.

**Contract**: Ekran jest osiągalny tylko po skutecznym first-run save i komunikuje trzy rzeczy: profil został zapisany, shelf jest jeszcze pusta, a następnym krokiem będzie dodanie pierwszego produktu w kolejnym slice'ie. Surface może oferować bezpieczne aktualne działania, takie jak przejście do dashboardu/statusu albo do edycji profilu, ale nie może obiecywać działającego product-intake flow.

#### 2. Dedicated profile edit surface

**File**: `src/pages/settings/skin-profile.astro`

**Intent**: Zapewnić późniejszą edytowalność profilu z osobnego ekranu ustawień/profilu, zamiast traktować onboarding jako jednorazowy i niezmienialny snapshot.

**Contract**: Route ładuje persisted profil dla zalogowanego użytkownika i pozwala go modyfikować bez rerunu first-run wizardu. Edit surface pracuje bezpośrednio na zapisanych levelach `skin_aspects`, istniejących `concerns`/`goals` oraz opcjonalnych notes; może współdzielić część prymitywów wizualnych i walidacyjnych z onboardingiem, ale nie próbuje rekonstruować odpowiedzi na pytania obserwowalne.

#### 3. Dashboard boundary and verification polish

**File**: `src/pages/dashboard.astro`

**Intent**: Zachować dashboard jako deweloperski status/debug surface po wejściu nowego onboardingu, zamiast pozwolić mu ponownie stać się domyślnym UI dla `S-01`.

**Contract**: Dashboard nadal ładuje persisted profil i pomaga weryfikować stan kontraktu, ale copy i entry points jasno wskazują, że to nie jest onboarding. Surface może linkować do nowego edit route'u i prezentować bardziej czytelny completion status profilu, lecz nie przejmuje pytań obserwowalnych ani completion screen.

### Success Criteria:

#### Automated Verification:

- Końcowa sekwencja repo przechodzi po wdrożeniu całego slice'a: `npx astro sync && npm run lint && npm run build`

#### Manual Verification:

- Po pierwszym skutecznym zapisie onboarding kończy się na dedykowanym ekranie ukończenia, a nie na technicznym formularzu
- Zapisany profil da się później zmienić z osobnego route'u ustawień/profilu bez powrotu do first-run wizardu
- `/dashboard` nadal pokazuje persisted status profilu i nie myli się z głównym onboarding surface'em

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests:

- Repo nadal nie ma wydzielonego committed test suite, więc logika kwestionariusza i mappingu severity powinna być zamknięta w małym, czystym module, który łatwo zweryfikować przez type-aware lint oraz prostą analizę przypadków granicznych.
- Helper completeness i transformacja concerns/goals powinny mieć jedną, wspólną definicję używaną przez route'y, aby nie mnożyć ręcznie utrzymywanych warunków i nie wprowadzać driftu między onboardingiem, edycją i gate route'em.

### Integration Tests:

- End-to-end flow sign-in -> `/start` -> onboarding -> save -> completion screen -> późniejszy edit route
- Kompatybilność istniejącego debug/dashboard surface'u z rozszerzonym write path profile API
- Redirect behavior dla użytkownika z kompletnym profilem vs bez profilu, bez pętli i bez mieszania onboarding route'ów z dashboardem

### Manual Testing Steps:

1. Zalogować nowego użytkownika i potwierdzić, że po pierwszym sign-in trafia do `first-skin-profile` onboardingu.
2. Przejść cały 3-step wizard, wypełniając wymagane pola i przynajmniej jeden custom entry dla concerns albo goals.
3. Zapisać profil i potwierdzić pojawienie się dedykowanego completion screen z komunikatem o następnym kroku produktowym.
4. Wejść na dedykowany route edycji profilu i zmienić przynajmniej jeden aspect level oraz jedną wartość concerns/goals.
5. Otworzyć `/dashboard` i potwierdzić, że pokazuje persisted stan po edycji, ale nie renderuje się jako onboarding wizard.
6. Spróbować wejść na onboarding/edit routes bez sesji i potwierdzić redirect do `/auth/signin`.

## Performance Considerations

Ta zmiana nie dodaje nowej tabeli ani kosztownych zapytań zbiorczych; główny koszt to pojedynczy odczyt `user_profiles` w post-auth gate i nowych surface'ach. Najważniejsze jest, żeby nie wykonywać tego odczytu w middleware dla każdego requestu, bo to niepotrzebnie rozciągnęłoby scope i koszt wszystkich authenticated route'ów.

Questionnaire definition powinna być statyczna i importowana jako kod aplikacji, bez runtime fetchy. Mapowanie odpowiedzi do severity ma być deterministyczne i lekkie obliczeniowo, tak żeby wizard pozostawał responsywny także na mobilnym first-run flow.

## Migration Notes

Plan nie zakłada żadnej migracji schematu. Persisted kontrakt `user_profiles` pozostaje bez zmian; nowe zachowanie powstaje wyłącznie przez routing, UI, helpery domenowe i ewolucję istniejącego write path.

## References

- Related research: `context/changes/first-skin-profile/research.md`
- Roadmap outcome and slice boundary: `context/foundation/roadmap.md:98`
- Roadmap risk against product-intake scope creep: `context/foundation/roadmap.md:105`
- PRD requirement for basic skin context: `context/foundation/prd.md:63`
- PRD requirement for understandable non-expert UI: `context/foundation/prd.md:133`
- PRD persistence requirement: `context/foundation/prd.md:136`
- Existing domain contract and defaults: `src/lib/domain/user-domain.ts:9`
- Existing profile API parsing and dashboard redirect pattern: `src/pages/api/domain/profile.ts:17`
- Existing dashboard smoke-test positioning: `src/pages/dashboard.astro:97`
- Existing sign-in redirect target: `src/pages/api/auth/signin.ts:19`
- Existing signup confirmation flow: `src/pages/auth/confirm-email.astro:4`
- Existing auth-only middleware boundary: `src/middleware.ts:4`
- Existing authenticated navigation bias toward dashboard: `src/components/Topbar.astro:13`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Onboarding entry and route boundaries

#### Automated

- [x] 1.1 Typy i routing dla nowych surface'ów przechodzą bez błędów — 0d8e9a5
- [x] 1.2 Lint przechodzi dla nowych redirectów auth i middleware — 0d8e9a5

#### Manual

- [x] 1.3 Użytkownik bez persisted profilu po skutecznym sign-in trafia na onboarding zamiast na `/` — 0d8e9a5
- [x] 1.4 Użytkownik z kompletnym profilem omija onboarding i przechodzi przez post-auth gate bez pętli redirectów — 0d8e9a5
- [x] 1.5 Wejście na `/start`, `/onboarding/skin-profile` i route edycji bez sesji kończy się redirectem do `/auth/signin` — 0d8e9a5

### Phase 2: Questionnaire model and persistence wiring

#### Automated

- [x] 2.1 Moduł questionnaire i jego integracja z route'ami przechodzą lint bez błędów — b98653a
- [x] 2.2 Produkcyjny build przechodzi z nowym wizardem i payload mappingiem — b98653a

#### Manual

- [x] 2.3 Wizard działa jako 3 kroki z poprawnym stanem progresu, walidacją i nawigacją wstecz — b98653a
- [x] 2.4 Odpowiedzi obserwowalne zapisują się jako poprawne `skin_aspects` w istniejącym kontrakcie — b98653a
- [x] 2.5 Suggested chips i własne wpisy dla `concerns`/`goals` kończą jako oczekiwane wartości w persisted `string[]` — b98653a

### Phase 3: Completion, edit surface, and verification boundary

#### Automated

- [x] 3.1 Końcowa sekwencja repo przechodzi po wdrożeniu całego slice'a — 97aee40

#### Manual

- [x] 3.2 Po pierwszym skutecznym zapisie onboarding kończy się na dedykowanym ekranie ukończenia — 97aee40
- [x] 3.3 Zapisany profil da się później zmienić z osobnego route'u ustawień/profilu bez rerunu onboardingu — 97aee40
- [x] 3.4 `/dashboard` nadal pokazuje persisted status profilu i nie myli się z onboarding surface'em — 97aee40

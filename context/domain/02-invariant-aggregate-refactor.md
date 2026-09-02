---
title: "Shelfie — plan refaktoru niezmiennika i agregatu"
created: 2026-08-30
type: refactor-plan
---

# Plan refaktoru: deterministyczna ocena bezpieczeństwa rutyny

## Decyzja w skrócie

Do refaktoru #1 wybrany zostaje następujący niezmiennik:

> **Każda zaakceptowana mutacja rutyny musi, przed zapisem, zakończyć deterministyczną ocenę tej samej wersji rutyny na podstawie należących do użytkownika produktów i ich sklasyfikowanych grup składnikowych. Rutyna i raport oceny zapisują się atomowo pod jednym numerem rewizji. Wykryte ostrzeżenia nie blokują zapisu, ale brak możliwości wykonania oceny blokuje operację. AI może wyłącznie objaśnić deterministyczne ustalenie — nie może go utworzyć, usunąć ani zmienić jego wagi.**

To rozróżnia dwie rzeczy, które obecny model miesza: **ostrzeżenie jest advisoryjne**, lecz **obowiązek wykonania i zachowania oceny jest twardy**. Pierwsza część wynika z decyzji o „soft guidance”, druga z wymagania, aby konflikt detection używał deterministic ingredient-group triggers, a AI skupiało się na wyjaśnieniu (`context/foundation/prd.md:99-101`).

Plan nie definiuje konkretnych reguł kosmetologicznych ani list grup składnikowych. PRD pozostawia podział deterministic rules / AI jako pytanie otwarte (`context/foundation/prd.md:171-174`), więc ich treść wymaga osobnego oracle zatwierdzonego przed implementacją. Dokument projektuje granicę, lifecycle, atomowość i błędy, nie wypełnia brakującej wiedzy domenowej przypuszczeniami.

## Krok 0 — odkrycie kontekstu

### Źródła i ograniczenia

- Aktualnym źródłem wymagań jest PRD o statusie `draft` (`context/foundation/prd.md:1-5`). Wizja wskazuje problem łączenia produktów, składników aktywnych i zmian rutyny (`context/foundation/prd.md:18-28`), a primary success criteria stawiają na pracę z rzeczywistymi produktami użytkownika zamiast generic advice (`context/foundation/prd.md:30-35`).
- Główna historia wymaga ostrzegania o problematycznych kombinacjach, overuse i brakach (`context/foundation/prd.md:49-55`). Szczegółowy kontrakt wymaga hybrydy deterministic ingredient-group rules oraz AI explanation (`context/foundation/prd.md:99-101`, `context/foundation/prd.md:141-151`).
- Rozszerzona historia wdrożenia świadomie wykluczyła ingredient-versus-ingredient engine (`context/archive/2026-07-30-routine-warnings-and-guidance/plan.md:24-31`), a następnie zastąpiła live guidance persisted full-routine AI assessmentem, który nie hardcoduje deterministic compatibility rules (`context/archive/2026-07-30-routine-warnings-and-guidance/plan.md:33-43`). Jest to konflikt późniejszej implementacji z aktualnym PRD, nie źródło nowego niezmiennika.
- Istniejący plan jakości nakazuje wybierać najtańszy test dający realny sygnał, wyprowadzać oracle ze źródeł i ma już Vitest jako runner unit/integration (`context/foundation/test-plan.md:11-19`, `context/foundation/test-plan.md:58-66`). Test-first jest więc dostępny, ale nie wolno pisać testów konkretnych konfliktów przed rozstrzygnięciem oracle.
- README nadal opisuje wcześniejszy, mniejszy slice (`README.md:5`, `README.md:131`), dlatego nie jest miarodajne dla aktualnej logiki rutyny.

### Stack i warstwy

Stack to Astro 6, React 19, TypeScript, Tailwind 4, Supabase i Cloudflare Workers (`README.md:7-14`; wersje i skrypty: `package.json:6-36`). Logika dotycząca wybranego niezmiennika jest dziś rozłożona następująco:

| Warstwa | Gdzie żyje | Obecna odpowiedzialność |
|---|---|---|
| UI | `src/components/routine/**` | Edycja draftu, wywołanie zapisu i AI, lokalne oznaczanie assessmentu jako stale (`src/components/routine/RoutineWorkspace.tsx:222-248`, `src/components/routine/RoutineWorkspace.tsx:285-291`). |
| SSR / read composition | `src/pages/routine.astro`, `src/pages/today.astro` | Łączenie profilu, shelf, schedule, interpretacji i ocen; błędy advisory są redukowane do braku wyniku (`src/pages/routine.astro:66-100`, `src/pages/today.astro:51-80`). |
| API / application | `src/pages/api/domain/routine.ts`, `src/pages/api/domain/routine/ai.ts` | Zapis schedule bez safety evaluation oraz osobny flow AI (`src/pages/api/domain/routine.ts:200-215`, `src/pages/api/domain/routine/ai.ts:284-306`). |
| Domena | `src/lib/domain/routine-guidance.ts`, `routine-ai.ts`, `routine-ai-assessment.ts`, `routine-schedule.ts` | Ograniczona projekcja warningów, walidacja struktury AI, fingerprint assessmentu i shape rutyny; brak agregatu będącego jedyną granicą mutacji. |
| Integracja AI | `src/lib/integrations/openrouter-routine-draft.ts` | Prompt każe modelowi ocenić każdą parę produktów; brak web search jest tylko logowany (`src/lib/integrations/openrouter-routine-draft.ts:87-99`, `:142-150`). |
| Persystencja | `user_routine_configs`, `user_routine_assessments` | Schedule i assessment są osobnymi rekordami bez wspólnej rewizji i atomowego zapisu (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46-52`; `supabase/migrations/20260731033458_routine_ai_assessments.sql:1-17`). |

## Krok 1 — identyfikacja niezmienników biznesowych

Poniższa lista zawiera reguły odkryte w wymaganiach i kodzie. „Naruszalny” oznacza, że publiczna granica zapisu potrafi przyjąć stan łamiący pełne brzmienie reguły; nie oznacza, że każdy obecny flow ją faktycznie łamie.

| ID | Niezmiennik: co musi być zawsze prawdziwe | Źródło | Stan faktyczny |
|---|---|---|---|
| INV-01 | Mutacja rutyny ma deterministycznie wykryć ingredient-group conflicts/overuse dla tej samej wersji danych; AI tylko objaśnia; warning nie blokuje samej rutyny. | `context/foundation/prd.md:99-101`, `context/foundation/prd.md:141-151`. | **Naruszalny / zasadniczo brak.** Zapis rutyny nie uruchamia guidance (`src/pages/api/domain/routine.ts:200-215`); deterministyka obejmuje tylko powtórzone role `treat`/`exfoliate` (`src/lib/domain/routine-guidance.ts:66-82`, `:164-179`), a pełna ocena kompatybilności jest decyzją AI (`src/lib/integrations/openrouter-routine-draft.ts:91-99`). |
| INV-02 | AI-generated product data i routine changes nie mogą zostać zapisane bez jawnego potwierdzenia użytkownika. | Guardrail produktu: `context/foundation/prd.md:42-45`; review rutyny: `context/foundation/prd.md:127-135`. | **Tylko częściowo egzekwowany.** UI rutyny pokazuje confirmation przed POST (`src/components/routine/RoutineWorkspace.tsx:213-248`, `:567-625`), lecz endpoint przyjmuje dowolny poprawny draft bez tokenu/transition potwierdzenia (`src/pages/api/domain/routine.ts:80-123`, `:200-215`). Analogicznie intake endpoint ufa polom `ConfirmedProductInput` (`src/pages/api/domain/products/intake.ts:191-203`, `:267-283`), podczas gdy review istnieje tylko w UI (`src/components/products/NewProductReviewForm.tsx:81-107`). |
| INV-03 | Każdy wpis rutyny wskazuje pozycję z półki właściciela i ma wspieraną rolę. | Rutyny powstają z owned products (`context/foundation/prd.md:87-101`, `context/foundation/prd.md:147-149`). | **Egzekwowany.** Parser zamyka role (`src/lib/domain/routine-schedule.ts:102-117`), a trigger DB sprawdza role i ownership (`supabase/migrations/20260709123000_routine_schedule_role_contract.sql:86-195`). |
| INV-04 | AI assessment jest current tylko dla identycznego fingerprintu wejścia, obejmuje każdą parę w sekcji, a cytowany INCI rzeczywiście należy do wskazanego produktu. | Historyczny refinement: `context/archive/2026-07-30-routine-warnings-and-guidance/plan.md:37-43`. | **Egzekwowany aplikacyjnie, słabiej w DB.** Parser sprawdza citations i pełne pokrycie par (`src/lib/domain/routine-ai.ts:147-225`, `:228-325`), fingerprint obejmuje profil/rutynę/INCI/wersje (`src/lib/domain/routine-ai-assessment.ts:77-121`), a SSR porównuje go przed pokazaniem (`src/pages/routine.astro:80-93`). Baza wymaga jedynie obiektu JSON i jednego rekordu per user (`supabase/migrations/20260731033458_routine_ai_assessments.sql:1-17`). |
| INV-05 | Cache interpretacji produktu jest prywatny i unikalny per user-product; wynik `ready` nie powinien być używany po zmianie basis profilu, produktu, promptu lub modelu. | Cache per pair: `context/foundation/prd.md:138`; prywatność: `context/foundation/prd.md:130`. | **Częściowo egzekwowany.** Unique, słowniki i RLS są w DB (`supabase/migrations/20260712120000_user_product_interpretations.sql:43-93`, `:113-142`), a stale detection porównuje basis/wersje (`src/lib/domain/product-interpretation.ts:278-339`). DB nie wymusza kompletności pól dla `ready`. |
| INV-06 | Potwierdzony canonical product ma wiarygodną tożsamość, niepuste INCI oraz jawne provenance/confidence; AI nie zapisuje go bez review. | `context/foundation/prd.md:42-45`, `context/foundation/prd.md:71-77`, `context/foundation/prd.md:138-139`. | **Częściowo egzekwowany.** RPC wymaga nazwy i INCI (`supabase/migrations/20260611180000_shared_product_intake_contract.sql:70-103`) i istnieją constraints provenance (`:36-53`), lecz samo potwierdzenie jest konwencją UI/API, nie stanem domenowym (`src/pages/api/domain/products/intake.ts:267-283`). |
| INV-07 | Prywatne dane skóry, rutyny i uploady są dostępne tylko właścicielowi. | `context/foundation/prd.md:127-136`, `context/foundation/prd.md:155-159`. | **Niespójnie egzekwowany.** RLS chroni profile/shelf/routine (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:316-389`), lecz bucket zdjęć jest publiczny, a select policy obejmuje cały bucket (`supabase/migrations/20260628180000_product_images_bucket.sql:1-25`). |
| INV-08 | Ten sam produkt występuje na półce użytkownika najwyżej raz, a usunięcie shelf item nie pozostawia dangling reference w rutynie. | Owned shelf jako osobny stan: `context/foundation/prd.md:67-85`. | **Egzekwowany.** Unique `(user_id, product_id)` (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:37-44`) oraz trigger prune (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:188-252`, `:284-287`). |
| INV-09 | Personalized guidance wymaga kompletnego skin context; brak profilu nie może udawać spersonalizowanego wyniku. | `context/foundation/prd.md:49-53`, `context/foundation/prd.md:63-65`. | **Egzekwowany na wejściach głównych flow.** SSR rutyny przekierowuje przy niekompletnym profilu (`src/pages/routine.astro:49-53`), a AI route odrzuca brak profilu (`src/pages/api/domain/routine/ai.ts:101-115`). Nie jest to constraint persystencji. |

## Krok 2 — klasyfikacja i wybór #1

Skale: **rdzeń 1–5** oznacza związek z primary success criteria i przewagą „actual products, not generic advice”; **rozsmarowanie 1–5** oznacza liczbę warstw i niezależnych miejsc, które muszą współpracować; status to **egzekwowany**, **deklarowany/częściowy** albo **naruszalny**.

| ID | Skrót | Rdzeń | Rozsmarowanie | Warstwy / przykładowe miejsca | Egzekucja | Wniosek |
|---|---|---:|---:|---|---|---|
| **INV-01** | Deterministyczna safety evaluation tej samej rewizji | **5** | **5** | PRD, domain projection, AI parser/prompt, API save, UI/read models, 2 tabele | **Naruszalny** | Najwyższa wartość i najsłabsza ochrona; aktualny mechanizm odwraca role deterministic/AI. |
| INV-02 | Jawne potwierdzenie zmian AI | 5 | 4 | UI product/routine, API product/routine, RPC produktu | Deklarowany/częściowy | Bardzo ważny guardrail, ale happy path ma confirmation; luka dotyczy obejścia UI. |
| INV-03 | Owned shelf item + poprawna rola | 4 | 3 | parser, API, DB trigger/RLS | Egzekwowany | Dobre defense in depth; niski priorytet refaktoru. |
| INV-04 | Current, kompletna i ugruntowana AI assessment | 5 | 5 | prompt, parser, fingerprint, API, SSR, DB | Częściowy, głównie mocny | Struktura jest dobrze chroniona, ale semantyczny verdict nadal pochodzi z AI. |
| INV-05 | Current cache per user-product | 5 | 4 | domain lifecycle, API, DB, UI | Częściowy | Rdzeniowy, lecz ma dojrzały model i istniejącą ochronę stale. |
| INV-06 | Confirmed canonical product + provenance | 4 | 4 | review UI, intake API, domain, RPC/constraints | Częściowy | Strategiczny supporting; confirmation nadal nie jest twardym transition. |
| INV-07 | Prywatność danych i uploadów | 4 | 5 | auth, API, RLS, Storage, URL | Naruszalny | Krytyczny operacyjnie i powinien mieć osobny pilny fix, ale jest guardrailem bezpieczeństwa, nie wyróżniającą logiką Core. |
| INV-08 | Unikalna shelf i brak dangling routine refs | 3 | 2 | DB constraint + trigger, domain helper | Egzekwowany | Ważna integralność supporting subdomain, obecnie dobrze zabezpieczona. |
| INV-09 | Kompletny profil przed personalizacją | 4 | 3 | SSR, AI API, helper domenowy | Egzekwowany aplikacyjnie | Nie jest najsłabszym punktem. |

### Dlaczego INV-01

INV-01 realizuje wprost secondary success criterion dotyczący conflicts/overuse (`context/foundation/prd.md:37-40`) i główną obietnicę US-01 (`context/foundation/prd.md:49-55`). Jednocześnie zapis rutyny kończy się po samym `upsertUserRoutineConfig` (`src/pages/api/domain/routine.ts:200-215`), więc nie istnieje granica, która wymagałaby wykonania deterministic ingredient-group evaluation. Obecna funkcja deterministyczna liczy role i przenosi wcześniej wygenerowane product signals (`src/lib/domain/routine-guidance.ts:111-218`), natomiast kompletne decyzje pair compatibility pochodzą z modelu AI (`src/lib/integrations/openrouter-routine-draft.ts:91-99`).

INV-07 jest pilniejszy jako incydent bezpieczeństwa, ale nie jest wyborem dla tego refaktoru agregatu: naprawa publicznego bucketu powinna być oddzielnym, małym i natychmiastowym change'em. INV-01 jest właściwym #1 dla refaktoru domenowego, bo bez niego Shelfie może poprawnie zapisać i wyświetlić rutynę, której centralna obietnica bezpieczeństwa nigdy nie została oceniona według reguły deklarowanej w PRD.

## Krok 3 — diagnoza INV-01

### Gdzie reguła żyje dzisiaj

| Warstwa / miejsce | Co robi dziś | Co nie domyka niezmiennika |
|---|---|---|
| Wymagania | Wymagają deterministic ingredient-group triggers, AI explanation i soft guidance (`context/foundation/prd.md:99-101`, `:141-151`). | Brakuje katalogu grup, macierzy triggerów i acceptance criteria; PRD jawnie pozostawia podział jako TBD (`context/foundation/prd.md:171-174`). |
| Schedule domain | Parsuje role i rozwija jedną bazę AM/PM na tydzień (`src/lib/domain/routine-schedule.ts:241-285`). | Nie przyjmuje product safety facts i nie ocenia konfliktów ani overuse składników. |
| Deterministic guidance | Przenosi cached product warnings/cautions i wykrywa co najmniej dwa `treat` lub `exfoliate` w sekcji (`src/lib/domain/routine-guidance.ts:111-179`). | Nie ma `IngredientGroup`, `CompatibilityTrigger` ani reguły para/grupa. Brak wejścia jest reprezentowany jako incomplete analysis, nie jako część transakcji zapisu (`src/lib/domain/routine-guidance.ts:136-140`, `:182-187`). |
| Manual save API | Parsuje draft, generuje schedule i zapisuje go (`src/pages/api/domain/routine.ts:71-78`, `:200-215`). | Nie ładuje produktów/INCI/grup, nie uruchamia oceny i nie zapisuje reportu. To główne miejsce naruszalności. |
| AI route | Ładuje pełne INCI i gotowe interpretacje, generuje proposal oraz opcjonalnie zapisuje assessment osobnym upsertem (`src/pages/api/domain/routine/ai.ts:101-155`, `:284-306`). | Działa tylko na żądanie użytkownika, po zapisie bazowej rutyny; nie jest częścią każdej mutacji i nie jest deterministyczny. |
| AI prompt | Każe modelowi sprawdzić każdą parę, cytować INCI i stworzyć finding dla problemu (`src/lib/integrations/openrouter-routine-draft.ts:87-99`). | Prompt wprost mówi „Do not use a predefined list of ingredients”; jest źródłem verdictu, choć PRD przypisuje trigger deterministyce. |
| AI parser | Twardo odrzuca zły shape, obce shelf IDs, fałszywe cytaty, brak par i brak visible finding (`src/lib/domain/routine-ai.ts:147-225`, `:228-325`). | Waliduje spójność odpowiedzi, nie prawdziwość reguły kosmetologicznej. Poprawny JSON może nadal pominąć domenowy trigger, którego parser nie zna. |
| Fingerprint | Hashuje profil, rutynę, role, INCI, confidence i wersje fit (`src/lib/domain/routine-ai-assessment.ts:77-121`). | Gwarantuje freshness snapshotu, nie deterministyczną kompletność safety rules. |
| Routine SSR | Pokazuje assessment tylko przy zgodnym fingerprint (`src/pages/routine.astro:80-93`). | Przy błędzie optional read połyka wyjątek i ustawia `none` (`src/pages/routine.astro:95-100`), więc brak safety informacji nie zatrzymuje ani nie wyróżnia operacji. |
| Today SSR | Liczy ograniczone guidance na odczycie (`src/pages/today.astro:59-77`). | Błąd jest połykany do `null` (`src/pages/today.astro:78-80`); użytkownik zachowuje rutynę bez aktualnej oceny. |
| UI | Blokuje przycisk AI dla dirty draftu i lokalnie oznacza assessment jako stale po zmianie (`src/components/routine/RoutineWorkspace.tsx:285-317`). | Nie chroni zapisu manualnego. Stan `stale` jest reakcją prezentacji, nie warunkiem commit. |
| Guidance UI | Komunikuje, że wskazówki nie blokują zapisu (`src/components/routine/RoutineGuidancePanel.tsx:204-215`). | To poprawna semantyka ostrzeżeń, ale komponent nie może być strażnikiem wykonania oceny. |
| Persystencja schedule | Trigger sprawdza role i ownership (`supabase/migrations/20260709123000_routine_schedule_role_contract.sql:86-195`). | Nie istnieją kolumny/relation safety report, rules version, input fingerprint ani wspólna rewizja. |
| Persystencja assessment | Trzyma latest AI object i fingerprint (`supabase/migrations/20260731033458_routine_ai_assessments.sql:1-17`). | Brak FK lub constraintu wiążącego go z konkretną rewizją `user_routine_configs`; zapis schedule i assessment nie jest jedną operacją. |

### Niespójności, klient jako strażnik i połykane błędy

1. **Dwie konkurencyjne decyzje.** PRD przydziela wykrycie deterministic rules, a AI wyjaśnienie (`context/foundation/prd.md:99-101`); prompt i refinement przydzielają AI sam pair verdict (`context/archive/2026-07-30-routine-warnings-and-guidance/plan.md:43`; `src/lib/integrations/openrouter-routine-draft.ts:91-99`).
2. **Zapis omija oba mechanizmy.** Manual save nie uruchamia ani `createRoutineGuidance`, ani AI assessment (`src/pages/api/domain/routine.ts:200-215`). Poprawny ownership i role wystarczają do commit.
3. **UI nie jest skutecznym strażnikiem INV-01.** Dla wybranego niezmiennika nie ma nawet ochrony „tylko w UI”; przycisk zapisu manualnego zależy jedynie od niepustego, zmienionego draftu (`src/components/routine/ManualRoutineEditor.tsx:469-513`). UI blokuje wyłącznie uruchomienie AI dla dirty draftu (`src/components/routine/RoutineWorkspace.tsx:310-317`), a serwer niezależnie sprawdza zgodność draftu z zapisem przed utrwaleniem assessmentu (`src/pages/api/domain/routine/ai.ts:72-82`, `:289-296`).
4. **Read failures są degradowane do braku guidance.** `/routine` i `/today` łapią błąd bez propagacji (`src/pages/routine.astro:95-100`; `src/pages/today.astro:78-80`). To było rozsądne dla opcjonalnej karty, ale nie może pozostać semantyką twardego obowiązku wykonania oceny przy mutacji.
5. **Brak web search jest logowany i operacja jedzie dalej.** Integracja wymaga go w promptcie, lecz po zerowej liczbie requestów tylko loguje warning, a następnie parsuje odpowiedź (`src/lib/integrations/openrouter-routine-draft.ts:142-150`). Po refaktorze nie ma to wpływu na deterministic finding; może jedynie obniżyć/uniemożliwić opcjonalne objaśnienie AI.
6. **Obecny save poprawnie fail-fastuje tylko na błędzie samego zapisu.** `upsertUserRoutineConfig` rzuca przy błędzie DB (`src/lib/domain/user-domain.ts:486-505`), a route zwraca error bez success (`src/pages/api/domain/routine.ts:216-229`). Tę właściwość trzeba zachować i rozszerzyć na evaluation + atomic commit.

## Krok 4 — projekt agregatu-strażnika

### Granica i model

Proponowany root: **`PersonalizedRoutine`**, identyfikowany przez `ownerId` (obecny model ma jeden `user_routine_configs` na użytkownika: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46-52`). Root posiada:

- `BaseRoutine` — uporządkowane `morning` / `evening` i contextual `RoutineRole`;
- `RoutineRevision` — monotoniczny numer do optimistic concurrency;
- `RoutineSafetyReport` — wynik dokładnie dla zapisywanej rewizji;
- `SafetyInputFingerprint` — hash candidate routine + wersji `ProductSafetyFacts` + `RuleSetVersion`;
- `SafetyFinding[]` — deterministyczne `triggered`, `no_trigger` pomijane w UI, oraz jawne `insufficient_data`;
- opcjonalne `AiExplanation` przy konkretnym `SafetyFindingId`, bez prawa do zmiany kodu reguły, severity ani statusu.

`ProductSafetyFacts` są snapshotem wejścia do komendy, nie encjami w agregacie: `shelfItemId`, ownership, product id, INCI provenance/confidence, wersja danych i przypisane `IngredientGroup`. `IngredientGroupRuleBook` jest wersjonowaną polityką domenową. Tylko metoda roota może przyjąć wynik polityki i utworzyć nowy stan; nie istnieje publiczny setter schedule lub reportu.

```text
PersonalizedRoutine (aggregate root, ownerId)
├── BaseRoutine
│   ├── morning: RoutineEntry[]
│   └── evening: RoutineEntry[]
├── RoutineRevision
└── RoutineSafetyReport
    ├── routineRevision
    ├── inputFingerprint
    ├── ruleSetVersion
    ├── evaluationStatus: evaluated | insufficient_data
    └── findings: SafetyFinding[]
        └── optional AiExplanation (supplement, never decision)
```

### Metody domenowe i błędy

Sygnatury są pseudokodem kontraktu, nie propozycją gotowej implementacji:

```ts
class PersonalizedRoutine {
  static restore(snapshot: PersonalizedRoutineSnapshot): PersonalizedRoutine

  replaceBaseRoutine(
    candidate: BaseRoutine,
    safetyFacts: ProductSafetyFacts[],
    ruleBook: IngredientGroupRuleBook,
  ): RoutineChanged

  reset(ruleBookVersion: RuleSetVersion): RoutineReset

  attachAiExplanation(
    findingId: SafetyFindingId,
    explanation: AiExplanation,
  ): SafetyExplanationAttached

  snapshot(): PersonalizedRoutineSnapshot
}
```

```text
replaceBaseRoutine(candidate, safetyFacts, ruleBook):
  assert candidate ma tylko morning/evening i wspierane role
  assert każdy shelfItemId ma dokładnie jeden owned ProductSafetyFacts
  assert ruleBook.version jest jawna

  report = ruleBook.evaluate(candidate, safetyFacts)
  if evaluator nie zakończył pełnego przebiegu:
      throw RoutineSafetyEvaluationFailedError
  if brak danych da się uczciwie sklasyfikować:
      report.addInsufficientDataFinding(...)   // zapis dozwolony, brak fałszywego "safe"

  nextRevision = revision.next()
  assert report.routineRevision == nextRevision
  assert report.inputFingerprint == fingerprint(candidate, safetyFacts, ruleBook.version)

  state = { candidate, nextRevision, report }
  emit RoutineChanged
```

```text
attachAiExplanation(findingId, explanation):
  finding = report.requireFinding(findingId)
  if explanation próbuje ustawić verdict/severity/ruleCode:
      throw AiExplanationCannotChangeSafetyDecisionError
  finding.attach(explanation.withReportFingerprint(report.inputFingerprint))
```

Nazwane błędy domenowe:

| Błąd | Warunek |
|---|---|
| `RoutineEntryNotOwnedError` | Candidate wskazuje shelf item bez owned safety facts. |
| `UnsupportedRoutineRoleError` | Entry używa roli poza zamkniętym słownikiem. |
| `RoutineSafetyFactsMissingError` | Repozytorium nie potrafi dostarczyć produktu/wersji danych dla entry; nie da się nawet zbudować jawnego `insufficient_data`. |
| `RoutineSafetyEvaluationFailedError` | Deterministyczny evaluator nie zakończył pełnego przebiegu. |
| `RoutineVersionConflictError` | `expectedRevision` nie odpowiada bieżącej rewizji. |
| `UnknownSafetyFindingError` | AI explanation wskazuje finding spoza bieżącego reportu. |
| `AiExplanationCannotChangeSafetyDecisionError` | Supplement AI próbuje zmienić deterministyczny verdict, severity lub rule code. |

Wykryty `SafetyFinding` **nie jest błędem** i nie rzuca wyjątku. Agregat zapisuje rutynę razem z findingami, zgodnie z wymaganiem „soft guidance” (`context/foundation/prd.md:99-101`). Fail-fast dotyczy nielegalnej mutacji i braku wykonanej oceny, a nie obecności ostrzeżenia.

### Repozytorium i atomowość

```ts
interface PersonalizedRoutineRepository {
  load(ownerId: UserId): Promise<{
    aggregate: PersonalizedRoutine;
    safetyFacts: ProductSafetyFacts[];
  }>;

  save(
    aggregate: PersonalizedRoutine,
    expectedRevision: RoutineRevision,
  ): Promise<void>;
}
```

`load` wykonuje server-side, user-scoped odczyt configu, shelf i wersjonowanych product safety facts. Route nie składa samodzielnie zapytań do `user_routine_configs`, `user_shelf_items`, `products` i assessmentów. `save` przyjmuje wyłącznie snapshot utworzony przez root; nie przyjmuje osobno dowolnego schedule i dowolnego reportu.

Plan persystencji:

1. Rozszerzyć `user_routine_configs` o `revision`, `safety_report`, `safety_input_fingerprint` i `safety_rule_set_version`; raport i schedule są jednym rekordem aggregate snapshotu.
2. Dodać constrainty: raport jest obiektem, jego `routineRevision` odpowiada kolumnie `revision`, fingerprint i rule-set version są niepuste dla niepustej rutyny. Pusty/reset state ma jawny raport `not_applicable`, a nie `NULL` o niejasnej semantyce.
3. Wycofać bezpośrednie `insert/update/delete` na `user_routine_configs` dla roli `authenticated`; pozostawić owner-scoped `select`. Bez tego klient mógłby ominąć agregat obecnymi grantami (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:301-303`, `:366-389`).
4. Zapisywać przez jedną funkcję Postgres `save_personalized_routine(...)` wywoływaną wyłącznie przez server-only repository. Istniejący projekt ma już osobnego klienta service-role i nie utrwala sesji (`src/lib/supabase.ts:27-38`), ale route tworzy go dopiero po uwierzytelnieniu użytkownika zwykłym cookie-bound clientem.
5. Funkcja wykonuje w jednej transakcji: compare-and-swap `expectedRevision` → update schedule + report + fingerprint + version → usunięcie lub jawne oznaczenie starego `user_routine_assessments` jako stale. Błąd dowolnego kroku wycofuje całość.
6. Funkcja ma `SECURITY INVOKER`, jawnie odebrane `EXECUTE` od `PUBLIC`, `anon` i `authenticated`, a nadane tylko roli serwerowej. `ownerId` pochodzi wyłącznie z uwierzytelnionego kontekstu route, nigdy z body klienta. Po migracji wymagany jest osobny przegląd RLS/grants i test próby bezpośredniego write.

Transakcja w pseudokodzie:

```text
BEGIN  // wewnątrz pojedynczego wywołania funkcji Postgres
  UPDATE user_routine_configs
     SET schedule = :snapshot.schedule,
         revision = :snapshot.revision,
         safety_report = :snapshot.report,
         safety_input_fingerprint = :snapshot.fingerprint,
         safety_rule_set_version = :snapshot.ruleSetVersion
   WHERE user_id = :authenticatedOwnerId
     AND revision = :expectedRevision;

  if affected_rows != 1:
      raise RoutineVersionConflict

  DELETE FROM user_routine_assessments
   WHERE user_id = :authenticatedOwnerId;
COMMIT
```

Nie wolno robić sekwencji „zapisz schedule → spróbuj zapisać report → zaloguj błąd i zwróć sukces”. To odtworzyłoby stan, którego plan ma zabronić.

### Cienkie API

Docelowy `POST /api/domain/routine`:

```text
authenticate request
parse { mode, routine, expectedRevision }
repository.load(authenticatedUser.id)

if mode == save:
  aggregate.replaceBaseRoutine(parsedRoutine, loadedSafetyFacts, ruleBook)
else:
  aggregate.reset(ruleBook.version)

repository.save(aggregate, expectedRevision)
return 200 { routine, revision, safetyReport }
```

Mapowanie błędów:

| Błąd | HTTP | Publiczna odpowiedź |
|---|---:|---|
| malformed payload / unsupported role | 400 / 422 | Stabilny, polski komunikat walidacyjny. |
| `RoutineEntryNotOwnedError` | 403 | Bez ujawniania danych obcego użytkownika. |
| `RoutineVersionConflictError` | 409 | „Rutyna zmieniła się w innym miejscu; odśwież i spróbuj ponownie.” |
| `RoutineSafetyFactsMissingError` | 409 | Operacja zatrzymana; użytkownik dostaje następny krok dotyczący danych produktu. |
| `RoutineSafetyEvaluationFailedError` | 503 | Zapis nie nastąpił; bez `ok: true`. |
| nieznany błąd repozytorium | 500 | Bez raw Supabase/provider detail. |

Endpoint `guidance-explanation` po refaktorze przyjmuje `routineRevision` i `findingId`, a nie ufany przez klienta cały `routineContext`. Ładuje aggregate/report, sprawdza finding i dopiero wtedy pyta AI. Odpowiedź AI jest supplementem do findingu; awaria AI nie usuwa deterministycznego ostrzeżenia i nie zmienia zapisu rutyny.

## Krok 5 — before/after, fazy i testy

### Before / after dla obecnych miejsc reguły

| Dzisiejsze miejsce | Before | After |
|---|---|---|
| `src/lib/domain/routine-schedule.ts` | Parser i mapper schedule; brak safety semantics (`:241-285`). | Value objects `BaseRoutine` / `RoutineEntry` pozostają, ale mutowalne wejście przechodzi wyłącznie przez `PersonalizedRoutine`. |
| `src/lib/domain/routine-guidance.ts` | Read-time projection z cached product signals + role accumulation (`:111-218`). | Reguły deterministyczne przechodzą do wersjonowanego `IngredientGroupRuleBook`; UI projection tylko mapuje zapisany `RoutineSafetyReport`, bez ponownej decyzji. |
| `src/pages/api/domain/routine.ts` | Route sam generuje schedule i bezpośrednio wywołuje upsert (`:200-215`). | Parse → repository load → metoda aggregate → atomic repository save → error mapping. Brak logiki reguł w route. |
| `src/lib/domain/user-domain.ts` | Publiczny helper zapisuje dowolny znormalizowany schedule (`:486-505`). | Usunąć write helper z publicznej ścieżki rutyny; zastąpić `PersonalizedRoutineRepository.save(snapshot, expectedRevision)`. |
| `src/pages/api/domain/routine/ai.ts` | Osobno generuje i zapisuje assessment dla zgodnego saved draft (`:284-306`). | AI nie tworzy safety verdictu. Może generować propozycję oraz explanations referujące istniejące deterministic finding IDs. |
| `src/lib/domain/routine-ai.ts` | Waliduje pair coverage, citations i AI verdict/finding coupling (`:228-325`). | Zachować walidację AI jako kontrakt supplementu, ale usunąć z niej autorytet nad deterministic finding. Pair audit nie zastępuje reportu agregatu. |
| `src/lib/integrations/openrouter-routine-draft.ts` | Prompt prosi AI o pair verdicts i zabrania predefined list (`:91-99`). | Prompt otrzymuje deterministic findings i prosi tylko o contextual explanation; nie może zwrócić/zmienić rule code lub severity. |
| `src/lib/domain/routine-ai-assessment.ts` | Fingerprint osobnego AI assessmentu (`:77-121`). | Fingerprint aggregate safety reportu powstaje deterministycznie przed commit; AI supplement dziedziczy report fingerprint/revision. |
| `src/pages/routine.astro` | Optional assessment read może zostać bezgłośnie pominięty (`:66-100`). | Ładuje aggregate snapshot; brak/mismatch obowiązkowego safety reportu jest error state, nie `none`. Awaria samego AI explanation nadal może być advisory. |
| `src/pages/today.astro` | Przelicza guidance read-time i połyka błąd do `null` (`:59-80`). | Czyta zapisany report dla tej rewizji i projektuje findings dla dzisiejszych sekcji; brak reportu jest jawnie niedozwolonym stanem danych. |
| `src/components/routine/RoutineWorkspace.tsx` | Lokalnie zarządza `assessmentState`; manual save nie zależy od safety evaluation (`:285-317`). | Wyświetla report zwrócony przez save API. Może pokazać preview, ale preview nie autoryzuje zapisu i nie jest źródłem prawdy. |
| `src/components/routine/RoutineGuidancePanel.tsx` | Renderuje read-time guidance i opcjonalnie prosi AI o wyjaśnienie (`:204-215`, `:243-324`). | Renderuje deterministic findings z revision/rule code; AI explanation jest wizualnie i kontraktowo podpisane jako supplement. |
| `user_routine_configs` + `user_routine_assessments` | Osobne rekordy, brak wspólnej rewizji (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:46-52`; `supabase/migrations/20260731033458_routine_ai_assessments.sql:1-17`). | Jeden aggregate snapshot schedule + mandatory report + revision; AI assessment/supplement ma FK/logiczne powiązanie do revision lub jest kasowany jako stale w tej samej transakcji. |

### Plan faz refaktoru

| Faza | Tryb | Zakres i warunek ukończenia |
|---:|---|---|
| 0. Oracle i decyzja domenowa | **Nie test-first** | Zamknąć pytanie PRD `context/foundation/prd.md:173`: zdefiniować `IngredientGroup`, reguły triggerów, severity, znaczenie `insufficient_data`, właściciela merytorycznego i `RuleSetVersion`. Bez tego stop — nie wolno utrwalać testami obecnego promptu jako oracle. |
| 1. Kontrakt agregatu | **Test-first** | Czyste typy/value objects, nazwane błędy, `replaceBaseRoutine`, `reset`, fingerprint i zasada „warning saves, failed evaluation does not”. Brak Astro/Supabase/AI w testach. |
| 2. Deterministyczny rule book | **Test-first** | Jedna wersjonowana implementacja zatwierdzonych reguł. Tabele przypadków pochodzą wyłącznie z oracle Fazy 0. Mutation testing tylko dla modułu reguł, zgodnie z selektywną praktyką repo. |
| 3. Persistence contract i repository | **Test-first integration** | Migracja przez standardowy workflow projektu; revision/CAS, mandatory report, odebranie direct writes, atomic function, owner isolation. Test na prawdziwym lokalnym Postgres/Supabase, bo mock nie dowiedzie transakcji, constraintów ani grants. |
| 4. Cienkie API | **Test-first contract** | Endpoint używa repozytorium/agregatu; wszystkie nazwane błędy mają stabilne statusy; brak ścieżki zapisującej sam schedule. Provider AI jest poza tym testem. |
| 5. Read models i UI | **Implement-first + istniejące testy domenowe** | `/routine` i `/today` czytają persisted report; usunięta duplikacja decyzji; UI pokazuje warning bez blokowania zapisu i nie traktuje braku reportu jak „brak problemów”. Manual verification mobile/desktop. |
| 6. AI jako explanation-only | **Test-first contract** | Endpoint działa po `findingId + revision`, odrzuca obcy/stale finding i nie może zmienić verdictu. Testy hermetyczne stubują provider; zero realnych requestów. |
| 7. Cutover i cleanup | **Integracja + regresja** | Backfill istniejących rutyn przez jawne `needs_evaluation`, potem kontrolowane przeliczenie; dopiero po pokryciu usunąć stary authority path. Uruchomić `npm test`, `npx astro sync`, `npm run lint`, `npm run build` zgodnie z repo. |

Fazy 1–4 i 6 spełniają kryterium TDD: pierwszy red test można nazwać obserwowalnym zdaniem. Faza 0 nie spełnia tego kryterium, bo brak jeszcze oracle; Faza 5 jest głównie wiringiem/prezentacją, więc `/10x-implement` jest właściwsze niż wymuszanie testów kopiujących implementację. Jest to zgodne z aktualną strategią „cost × signal” (`context/foundation/test-plan.md:11-17`) i cookbookiem Vitest (`context/foundation/test-plan.md:85-95`).

### Przypadki testowe INV-01

#### Unit — agregat i rule book

| Przypadek | Oczekiwany wynik |
|---|---|
| Legalny candidate bez triggerów, pełne safety facts | Nowa rewizja, `evaluated`, pusty visible findings, poprawny fingerprint. Nie nazywać wyniku „safe”; tylko „brak triggera w tej wersji rules”. |
| Legalny candidate uruchamia zatwierdzony conflict trigger | Zapis dozwolony; report zawiera stabilny `ruleCode`, severity, products/section i revision. |
| Legalny candidate uruchamia zatwierdzony overuse trigger | Zapis dozwolony; jeden deterministyczny finding po regułach deduplikacji oracle. |
| Dane pozwalają jedynie stwierdzić niepewność | Zapis dozwolony z `insufficient_data`; nigdy cichy „brak uwag”. |
| Entry wskazuje shelf item bez owned facts | `RoutineEntryNotOwnedError`; stan aggregate bez zmian. |
| Brak produktu/wersji danych uniemożliwia ocenę | `RoutineSafetyFactsMissingError`; stan bez zmian. |
| Evaluator rzuca lub zwraca niepełny przebieg | `RoutineSafetyEvaluationFailedError`; stan bez zmian. |
| Nieobsługiwana rola | `UnsupportedRoutineRoleError`; stan bez zmian. |
| Reset | Pusta rutyna i report `not_applicable` w następnej rewizji. |
| AI explanation dla istniejącego finding | Supplement dołączony bez zmiany `ruleCode`, severity i fingerprintu reportu. |
| AI explanation próbuje zmienić decision fields | `AiExplanationCannotChangeSafetyDecisionError`. |
| Explanation dla finding z poprzedniej rewizji | `UnknownSafetyFindingError` lub stale-revision error. |

#### Integration — repository, DB i API

| Przypadek | Regresja, którą ma złapać |
|---|---|
| Commit schedule + report z tym samym revision | Powrót do niezależnych zapisów. |
| Wymuszony błąd zapisu reportu | Schedule pozostaje w poprzedniej wersji; dowód rollbacku. |
| Stare `expectedRevision` | HTTP 409 i brak utraty nowszej zmiany. |
| Direct insert/update jako authenticated poza route | Operacja odrzucona; klient nie omija agregatu. |
| User A próbuje użyć shelf item usera B | 403 / DB rejection bez ujawnienia szczegółów B. |
| Niepusty schedule bez report/fingerprint/version | Constraint lub funkcja odrzuca zapis. |
| Zapis nowej rutyny przy istniejącym AI assessment | Assessment zostaje atomowo usunięty/oznaczony stale; nie jest pokazany jako current. |
| API otrzymuje finding | Zwraca 200 wraz z reportem; warning nie staje się blockerem. |
| API nie może wykonać deterministic evaluation | Zwraca błąd, nie `ok: true`, a DB pozostaje bez zmian. |
| AI explanation provider pada | Deterministyczny report pozostaje; endpoint explanation zwraca kontrolowany błąd. |

### Load-bearing names

W repo nie znaleziono osobnego rejestru nazw/kontraktów. Jeśli taki rejestr zostanie dodany, albo jako rozszerzenie Ubiquitous Language w `context/domain/01-domain-distillation.md`, należy zarejestrować:

- `PersonalizedRoutine` — aggregate root, nie ekran i nie JSON schedule;
- `RoutineRevision` — wersja optimistic concurrency i powiązania reportu;
- `RoutineSafetyReport` — deterministyczny wynik dla jednej rewizji;
- `SafetyInputFingerprint` — hash candidate routine, product safety facts i rule set;
- `ProductSafetyFacts` — wersjonowany snapshot danych potrzebnych do oceny, nie shared product jako cały agregat;
- `IngredientGroup` — klasyfikacja z zatwierdzonego oracle, nie dowolny tag AI;
- `IngredientGroupRuleBook` / `RuleSetVersion` — wersjonowany autorytet deterministic triggers;
- `CompatibilityTrigger` i `OveruseTrigger` — dwie jawne kategorie reguł;
- `SafetyFinding` — advisoryjne ustalenie, które nie blokuje rutyny;
- `InsufficientSafetyData` — jawny wynik niepewności, nie synonim „brak ryzyka”;
- `AiExplanation` — supplement do findingu, nigdy verdict;
- nazwane błędy domenowe wymienione w sekcji metod.

Nie należy ponownie używać nazwy `RoutineAiAssessment` dla deterministycznego reportu. Obecny termin oznacza provider-generated, persisted rezultat (`src/lib/domain/routine-ai.ts:82-87`; `src/lib/domain/routine-ai-assessment.ts:29-39`) i połączenie tych pojęć odtworzyłoby dzisiejszą niejednoznaczność.

## Warunki wejścia do implementacji

Implementacja może rozpocząć się dopiero po zatwierdzeniu oracle Fazy 0: konkretnych grup, triggerów, severity i zachowania przy niepełnych danych. Do tego czasu plan nie zakłada żadnego konfliktu kosmetologicznego. Osobny pilny change powinien zamknąć publiczny bucket zdjęć, ponieważ bieżąca konfiguracja (`supabase/migrations/20260628180000_product_images_bucket.sql:1-19`) przeczy wymaganiu prywatności (`context/foundation/prd.md:130`). Żadna faza tego planu nie może przy okazji zmieniać reguł intake, weekly schedule ani feedback/check-ins; są to odrębne granice wskazane w mapie domeny.

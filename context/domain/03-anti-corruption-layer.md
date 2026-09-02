---
title: "Shelfie — plan warstwy antykorupcyjnej dla zależności zewnętrznych"
created: 2026-08-31
type: refactor-plan
---

# Plan refaktoru: izolacja Supabase za portami i adapterami

## Decyzja w skrócie

Najgorszym przeciekiem jest **klient Supabase jako parametr i język zapytań warstwy domenowej**. Pięć plików w `src/lib/domain/` importuje `SupabaseClient` (`src/lib/domain/ingredient-glossary.ts:1`, `src/lib/domain/product-domain.ts:1`, `src/lib/domain/product-interpretation.ts:1`, `src/lib/domain/routine-ai-assessment.ts:1`, `src/lib/domain/user-domain.ts:1`), a API i SSR samodzielnie tworzą klienta i przekazują go dalej. W efekcie nazwa tabeli, lista kolumn, format wiersza, PostgREST query DSL, auth i storage są częścią kodu, który powinien mówić językiem Shelfie.

Refaktor ma izolować **biblioteki** `@supabase/supabase-js` i `@supabase/ssr`, nie udawać, że migracja całej platformy Supabase nie dotknęłaby schematu, RLS i operacji. Po zmianie wymiana klienta danych przy zachowaniu tego samego PostgreSQL schema ma dotknąć wyłącznie `src/lib/infrastructure/supabase/**`; API, UI i domena mają znać domenowe obiekty oraz porty.

Plan nie zmienia kodu produkcyjnego. Pseudokod opisuje kontrakty docelowe.

## Krok 0 — odkrycie kontekstu

### Źródła i intencja produktu

- PRD jest dokumentem roboczym (`status: draft`) (`context/foundation/prd.md:1-5`). Rdzeniem produktu jest guidance na rzeczywistych produktach użytkownika, a nie generic advice (`context/foundation/prd.md:30-35`).
- Prywatność danych skóry, zdjęć i rutyn oraz niezawodna persystencja są jawnymi wymaganiami (`context/foundation/prd.md:127-139`). Flat user model zakłada, że użytkownik widzi i zmienia wyłącznie własne dane (`context/foundation/prd.md:155-159`). Porty persystencji muszą więc zachować kontekst właściciela i nie mogą ukryć RLS za nieograniczonym klientem.
- Tech stack świadomie wybiera Supabase dla auth, bazy i storage (`context/foundation/tech-stack.md:22-24`; `README.md:7-14`). Dokumenty **nie deklarują wymienialności Supabase**. Jedyna jawna reguła wymienialności dotyczy izolowania usług specyficznych dla Cloudflare za małymi adapterami (`context/foundation/infrastructure.md:88-95`).
- Infrastruktura nazywa Supabase i OpenRouter usługami zewnętrznymi (`context/foundation/infrastructure.md:17`) oraz wskazuje osobny cykl rollbacku bazy (`context/foundation/infrastructure.md:60-64`). Jest to argument za granicą, nie dowód, że cała platforma ma być zamienna bez kosztu.
- README opisuje strukturę tylko na poziomie `pages/components/assets` (`README.md:65-77`) i nadal nazywa bieżący zakres „first persisted user-domain contract” (`README.md:5`, `README.md:131`), więc bieżące granice trzeba odczytać z kodu.

### Stack, manifest i warstwy

| Obszar | Stan zweryfikowany |
|---|---|
| Framework / UI | Astro 6, React 19, TypeScript 5, Tailwind 4 (`README.md:7-14`); wersje pakietów: `package.json:16-36`. |
| Runtime | Cloudflare Workers (`README.md:188-204`), adapter `@astrojs/cloudflare` (`package.json:18`). |
| Auth / data / storage | `@supabase/ssr` i `@supabase/supabase-js` (`package.json:23-24`), Supabase CLI jako dev dependency (`package.json:54`). Lockfile rozwiązuje SSR `0.10.3` i JS client `2.105.3` (`package-lock.json:2740-2750`, `package-lock.json:2765-2779`). |
| AI / źródła produktu | OpenRouter, Open Beauty Facts i INCIDecoder są wołane przez `fetch`, bez osobnych runtime packages (`src/lib/integrations/openrouter.ts:5-6`, `src/lib/integrations/open-beauty-facts.ts:3`, `src/lib/integrations/incidecoder.ts:3`). |
| UI | React islands w `src/components/**`; nie znaleziono importu `@supabase/*` w komponentach. |
| Transport | Astro pages i API w `src/pages/**`; middleware w `src/middleware.ts`. |
| Domena | Reguły, encje i jednocześnie zapytania persistence w `src/lib/domain/**`. |
| Integracje | Provider-specific HTTP w `src/lib/integrations/**`; fabryki Supabase w `src/lib/supabase.ts`. |
| Persystencja | SQL, RLS, RPC i storage policy w `supabase/migrations/**`. |
| Testy | Vitest (`package.json:10-11`, `package.json:57`); repo nakazuje mockować wyłącznie granicę providera lub klienta Supabase (`context/foundation/test-plan.md:87-91`). |

### Ograniczenie weryfikacji dokumentacji biblioteki

W tej sesji Context7 nie udostępnił narzędzi `resolve-library-id` / `query-docs`, konektor dokumentacji Supabase zwrócił HTTP 403, a bezpośredni odczyt oficjalnego changelogu i strony dokumentacji został zablokowany. Dlatego nie przyjmuję żadnego nowego szczegółu API ponad kontrakt realnie użyty w repo i wersje z lockfile. Przed implementacją faz korzystających z konkretnej metody SDK trzeba ponowić dokumentacyjny gate; sam projekt portów nie zależy od sygnatury konkretnej wersji.

## Krok 1 — identyfikacja przeciekających zależności

„Plik zna zależność” oznacza co najmniej jedno z: importuje jej typ/pakiet, używa jej query/protocol API, nazywa provider w kontrakcie lub otrzymuje vendor-specific wynik. Testy i mocki są liczone osobno.

### 1. Supabase SDK / SSR — przeciek krytyczny

**Bezpośrednia zależność kompilacyjna — wszystkie 7 plików:**

- `src/env.d.ts:3` — globalny `App.Locals.user` ma typ `@supabase/supabase-js.User`.
- `src/lib/supabase.ts:1-2` — fabryka zna oba pakiety.
- `src/lib/domain/ingredient-glossary.ts:1`, `src/lib/domain/product-domain.ts:1`, `src/lib/domain/product-interpretation.ts:1`, `src/lib/domain/routine-ai-assessment.ts:1`, `src/lib/domain/user-domain.ts:1` — domena importuje `SupabaseClient`.

**Wiedza semantyczna / przekazywanie klienta — wszystkie miejsca runtime poza powyższymi:**

- Middleware: `src/middleware.ts:17-23`.
- Auth API: `src/pages/api/auth/signin.ts:10-15`, `src/pages/api/auth/signout.ts:5-7`, `src/pages/api/auth/signup.ts:10-15`.
- Product API: `src/pages/api/domain/products/add-existing.ts:63-72`, `src/pages/api/domain/products/ai-web-search.ts:19-27`, `src/pages/api/domain/products/ingredient-glossary.ts:35-43`, `src/pages/api/domain/products/intake.ts:235-248`, `src/pages/api/domain/products/interpretation.ts:36-44`, `src/pages/api/domain/products/photo-vision.ts:43-69`, `src/pages/api/domain/products/remove-from-shelf.ts:51-60`, `src/pages/api/domain/products/search.ts:78-87`.
- Profile/routine API: `src/pages/api/domain/profile.ts:200-209`, `src/pages/api/domain/routine.ts:168-181`, `src/pages/api/domain/routine/ai-candidates.ts:43-51`, `src/pages/api/domain/routine/ai.ts:229-238`, `src/pages/api/domain/routine/guidance-explanation.ts:90-98`.
- SSR pages: `src/pages/dashboard.astro:22-28`, `src/pages/debug/products.astro:12-20`, `src/pages/onboarding/skin-profile.astro:23-31`, `src/pages/onboarding/skin-profile/complete.astro:19-26`, `src/pages/products/[productId].astro:39-58`, `src/pages/products/intake.astro:21-28`, `src/pages/products/intake/review/new.astro:21-28`, `src/pages/routine.astro:38-57`, `src/pages/settings/skin-profile.astro:23-31`, `src/pages/shelf.astro:24-37`, `src/pages/start.astro:18-25`, `src/pages/today.astro:36-53`.
- Testy znające moduł fabryki: `src/pages/api/domain/products/ai-web-search.test.ts:8`, `src/pages/api/domain/products/interpretation.test.ts:8`, `src/pages/api/domain/routine/ai.test.ts:5`.

Łącznie: 36 plików runtime/typów i 3 testy. `src/lib/config-status.ts:16` zawiera jedynie link pomocy z nazwą Supabase i nie jest zależnością architektoniczną.

### 2. OpenRouter HTTP API — przeciek wysoki

**Wszystkie pliki runtime (14):**

- Domena: `src/lib/domain/ai-error-contract.ts:94-98`, `src/lib/domain/ingredient-glossary.ts:2-6`, `src/lib/domain/product-interpretation.ts:15-19`.
- Integracje: `src/lib/integrations/openrouter.ts:1-6`, `src/lib/integrations/openrouter-ingredient-glossary.ts:1-9`, `src/lib/integrations/openrouter-product-fit.ts:1-18`, `src/lib/integrations/openrouter-routine-draft.ts:1-15`, `src/lib/integrations/openrouter-routine-guidance.ts:1-8`, `src/lib/integrations/openrouter-vision.ts:1-14`.
- API: `src/pages/api/domain/products/ai-web-search.ts:6`, `src/pages/api/domain/products/photo-vision.ts:7-8`, `src/pages/api/domain/routine/ai.ts:39`, `src/pages/api/domain/routine/guidance-explanation.ts:11`.
- SSR: `src/pages/products/[productId].astro:14-17`.

**Testy/mocki (4):** `src/lib/integrations/openrouter-routine-draft.test.ts:3`, `src/lib/integrations/openrouter.test.ts:2`, `src/pages/api/domain/products/ai-web-search.test.ts:11-22` oraz `src/test/mocks/astro-env-server.ts:2`.

Sześć plików integracji rekonstruuje osobno URL, response shape, `Authorization`, body i odczyt `choices[0].message.content`, np. `src/lib/integrations/openrouter-ingredient-glossary.ts:4-9`, `:134-156`; `src/lib/integrations/openrouter-product-fit.ts:11-18`, `:176-198`; `src/lib/integrations/openrouter-routine-draft.ts:11-15`, `:63-73`, `:120-131`; `src/lib/integrations/openrouter-routine-guidance.ts:5-8`, `:88-98`, `:125-134`; `src/lib/integrations/openrouter-vision.ts:4-14`, `:143-174`; `src/lib/integrations/openrouter.ts:5-27`, `:601-649`. To jest realna duplikacja ACL, choć transport pozostaje głównie w katalogu `integrations`.

### 3. Open Beauty Facts — przeciek średni

**Wszystkie pliki znające provider (6):** adapter `src/lib/integrations/open-beauty-facts.ts:3-44`; API importuje jego vendor-named typ i mapuje go lokalnie `src/pages/api/domain/products/search.ts:3-7`, `:61-75`; domena utrwala provider jako wartość słownika `src/lib/domain/product-domain.ts:8-9`; UI zna wire discriminator i nazwę `src/components/products/ProductIntakeFlow.tsx:27-31`, `:673-678`; SSR reklamuje provider `src/pages/products/intake.astro:51`; constraint DB utrwala literal `open_beauty_facts` (`supabase/migrations/20260611180000_shared_product_intake_contract.sql:36-43`).

Sam payload zewnętrzny jest poprawnie schowany w adapterze (`src/lib/integrations/open-beauty-facts.ts:15-32`, mapowanie `:65-80`). Przeciek dotyczy nazwy typu w API i technicznego source code w UI/DB, nie surowego payloadu.

### 4. INCIDecoder — przeciek niski

**Wszystkie pliki znające provider (3):** `src/lib/integrations/incidecoder.ts:3-11`, `src/lib/integrations/openrouter.ts:3`, `src/components/products/ProductIntakeFlow.tsx:56-62`. Parser HTML i wynik są zamknięte w integracji (`src/lib/integrations/incidecoder.ts:39-51`, `:118-142`); UI zna jedynie wartość provenance przekazaną w metadata.

### Zależności, których nie klasyfikuję jako przeciek domenowy

Astro jest obecne w routes/middleware i React wraz z bibliotekami wizualnymi w komponentach — to ich docelowe warstwy. W `src/lib/domain/**` nie znaleziono importów Astro, React, Lucide, Radix, Tailwind ani Cloudflare. Samo użycie tych bibliotek nie łamie więc granicy domeny.

## Krok 2 — klasyfikacja i wybór #1

Skala kosztu: 1 — lokalna podmiana; 5 — zmiana wielu kontraktów i warstw. „Deklarowana wymienialność” odróżnia jawny zapis źródłowy od naszej preferencji architektonicznej.

| Rank | Zależność | Warstwy / pliki | Koszt wymiany dziś | Deklaracja w dokumentach | Ocena |
|---:|---|---|---:|---|---|
| **1** | **Supabase SDK/SSR w domenie** | 6 warstw; 36 runtime/typów + 3 testy | **5** | Brak deklaracji wymienialności Supabase; stack wybiera go świadomie (`context/foundation/tech-stack.md:22-24`). | Najgorszy przeciek: typ SDK jest częścią globalnego locals i pięciu domenowych sygnatur; query DSL, auth i storage są rozsmarowane. |
| 2 | OpenRouter HTTP | 4 warstwy; 14 runtime + 4 testy/mocki | 5 | Provider jest zewnętrzny (`context/foundation/infrastructure.md:17`), ale brak jawnej obietnicy wymiany. | Sześć kopii protokołu oraz zależność domain → integration; ważny następny ACL. |
| 3 | Open Beauty Facts | 5 warstw; 5 runtime + 1 migration | 4 | Provider jest jawnie częścią obowiązkowej kaskady (`context/foundation/prd.md:71-73`) i provenance (`context/foundation/prd.md:138-139`). | Techniczny provider code wszedł do domeny, wire i DB; payload zewnętrzny jest jednak mapowany w jednym adapterze. |
| 4 | INCIDecoder | 2 warstwy; 3 runtime | 2 | Jest fallbackiem źródłowym, nie elementem success criteria (`context/foundation/architecture-notes.md:65-75`). | W większości izolowany; UI zna tylko provenance. |

### Dlaczego #1

Supabase jest jedyną zależnością, której **typ biblioteczny występuje w publicznych sygnaturach domenowych**. Alias `type ProductDomainClient = SupabaseClient` nie tworzy abstrakcji (`src/lib/domain/product-domain.ts:1-3`); domena nadal może i faktycznie wywołuje `.from()`, `.rpc()`, `.select()`, `.eq()` i `.maybeSingle()` (`src/lib/domain/product-domain.ts:350-386`, `:431-477`). Ten sam wzorzec obejmuje profile/shelf/routine (`src/lib/domain/user-domain.ts:374-502`), interpretations (`src/lib/domain/product-interpretation.ts:342-500`), assessment (`src/lib/domain/routine-ai-assessment.ts:124-168`) i glossary (`src/lib/domain/ingredient-glossary.ts:218-378`).

OpenRouter ma zduplikowany transport, ale jest przynajmniej nazwany integracją. Supabase powoduje odwrotną zależność w samym sercu modelu: kod domenowy zna vendor API, a API/SSR zna konstrukcję infrastruktury. Dlatego refaktor Supabase daje większe odsprzężenie i tworzy wzorzec, który później można zastosować do OpenRouter.

## Krok 3 — diagnoza wybranego przecieku

### Gdzie dokładnie żyje wiedza Supabase

| Miejsce | Obecna wiedza o vendorze | Skutek |
|---|---|---|
| Globalny kontrakt Astro | `App.Locals.user` jest bezpośrednio typem Supabase (`src/env.d.ts:1-4`). | Typ auth providera przenika do każdego route/page używającego locals. |
| Fabryka | Cookie bridge, SSR client i service-role client są razem (`src/lib/supabase.ts:1-38`). | Jeden moduł miesza sesję użytkownika i uprzywilejowany dostęp; oba zwracają nieopakowany klient. |
| Domena produktu | Kolumny/row/mapping i reguły identity żyją razem (`src/lib/domain/product-domain.ts:5-8`, `:57-73`, `:313-332`). | Zmiana query clienta dotyka modelu, a zmiana modelu dotyka adaptera w tym samym pliku. |
| Domena produktu | Buduje PostgREST filter string (`src/lib/domain/product-domain.ts:389-413`) i wywołuje vendor RPC (`:456-477`). | Query syntax i procedura persystencji są częścią „domain”. |
| Domena user/shelf/routine | Cztery column lists i pięć row shapes (`src/lib/domain/user-domain.ts:11-15`, `:86-123`) oraz mapery (`:292-358`). | Jeden moduł łączy kilka agregatów i adapter danych. |
| Interpretacje | Row shape/mapping (`src/lib/domain/product-interpretation.ts:23-81`, `:251`) i lifecycle persistence (`:342-500`) są w jednym pliku. | Test reguły lifecycle wymaga klienta lub rozbudowanego stuba SDK. |
| Glossary | Domena importuje jednocześnie Supabase i konkretny OpenRouter (`src/lib/domain/ingredient-glossary.ts:1-6`). | Zależności wskazują na zewnątrz w dwóch kierunkach; orchestration nie jest czysta. |
| API | Routes powtarzają `createClient` → null check → `auth.getUser`, np. search (`src/pages/api/domain/products/search.ts:78-95`) i routine AI (`src/pages/api/domain/routine/ai.ts:229-244`). | Auth provider i mapowanie błędów są powielone w transport layer. |
| API helper signatures | Helpery przyjmują `ReturnType<typeof createClient>` (`src/pages/api/domain/products/add-existing.ts:28-36`; `src/pages/api/domain/routine/ai.ts:72-77`, `:101-108`). | Nawet lokalna logika aplikacyjna jest typowana wynikiem fabryki vendora. |
| Storage | Route zna bucket, upload DSL i public URL (`src/pages/api/domain/products/photo-vision.ts:11-12`, `:43-75`). | Zmiana storage SDK albo polityki URL dotyka API. PRD wymaga prywatności uploadów (`context/foundation/prd.md:129-131`). |
| Privileged access | API tworzy service-role client i podaje go funkcji nazwanej domenową (`src/pages/api/domain/products/ingredient-glossary.ts:73-79`). | Uprawnienie jest właściwością obiektu technicznego, a nie jawnego portu/capability. |
| SSR pages | Pages tworzą klienta i kompozycjonują read model, np. product details (`src/pages/products/[productId].astro:39-70`) i routine (`src/pages/routine.astro:38-78`). | Prezentacja zależy od fabryki danych, choć React islands nie importują SDK. |
| Błędy | Domain re-eksponuje surowe `error.message`, np. product (`src/lib/domain/product-domain.ts:415-417`) i user profile (`src/lib/domain/user-domain.ts:381-405`). | Publiczne błędy mogą zależeć od tekstu PostgREST; klasyfikacja nie ma stabilnego kontraktu. |

### Duplikacja kształtu danych

Każdy moduł ręcznie tworzy ten sam zestaw elementów: `*_COLUMNS`, `*Row`, `map*`, zapytanie SDK i interpolację `error.message`. Przykłady:

- Product: `src/lib/domain/product-domain.ts:5-8`, `:57-73`, `:313-332`, `:431-438`.
- User profile/shelf/routine: `src/lib/domain/user-domain.ts:11-15`, `:86-123`, `:292-358`, `:374-502`.
- Product interpretation: `src/lib/domain/product-interpretation.ts:23-81`, `:251`, `:342-500`.
- Ingredient glossary: `src/lib/domain/ingredient-glossary.ts:16-56`, `:136-156`, `:218-378`.
- Routine assessment: `src/lib/domain/routine-ai-assessment.ts:14-27`, `:46-57`, `:124-168`.

To nie jest duplikacja identycznych pól między różnymi tabelami; problemem jest powtarzanie **tego samego wzorca translacji vendor row → domena i vendor error → `Error`** w warstwie domenowej.

### Co nie jest problemem

- Nie ma dowodu, że `@supabase/supabase-js` trafia do browser bundle: żaden plik `src/components/**` nie importuje pakietu. Problem dotyczy granic serwerowych i typów, nie aktualnego wycieku sekretu do klienta.
- Tabele i RLS są częścią persistence modelu i mogą pozostać w Supabase. ACL izoluje SDK oraz vendor result types; nie usuwa SQL ani nie obiecuje bezkosztowej migracji całego backendu.
- Domena może zachować `ProductSource = "open_beauty_facts" | ...`, jeśli jest to świadoma provenance biznesowa. Nie może natomiast zachować `SupabaseClient`, PostgREST filter string ani `PostgrestError`.

## Krok 4 — projekt ACL

### Reguła zależności

```text
Astro API / SSR
      |
      v
application use case ---> domain entity / value objects
      |                         ^
      v                         |
application port <--- infrastructure/supabase adapter
                               |
                               v
                    @supabase/ssr + @supabase/supabase-js
```

Warstwa domenowa nie importuje `application`, `infrastructure`, Astro ani Supabase. Application zna porty i domenę. Composition root w middleware/route tworzy adaptery, ale route dostaje gotowy `RequestServices` albo wywołuje jeden use case — nie klient SDK.

### Pilotażowa encja domenowa

`UserProductInterpretation` jest dobrym pilotem: ma realny lifecycle `pending | ready | failed | stale` (`src/lib/domain/product-interpretation.ts:48-56`, `:95-118`), freshness i wiele operacji zapisu, więc udowodni, że port nie jest tylko zmianą nazwy klienta.

```ts
type UserId = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;

class UserProductInterpretation {
  static start(userId: UserId, productId: ProductId, basis: InterpretationBasis): UserProductInterpretation;
  static rehydrate(snapshot: InterpretationSnapshot): UserProductInterpretation;

  markStale(reason: StaleReason): void;
  complete(result: ProductFitResult, generation: GenerationStamp): void;
  fail(reason: GenerationFailure): void;
  isFreshFor(basis: InterpretationBasis, generation: GenerationStamp): boolean;
  snapshot(): InterpretationSnapshot;
}
```

Preconditions:

- `complete` jest legalne wyłącznie z `pending`; niepoprawny transition rzuca `IllegalInterpretationTransition`.
- `ready` wymaga kompletnego `ProductFitResult` i `GenerationStamp`; nieznany status z bazy rzuca `InterpretationMappingError`, zamiast cicho zamieniać go na inny status.
- `userId` i `productId` nie zmieniają się po utworzeniu.
- Encja zna wyłącznie kształt domenowy. **Jedynym miejscem wiedzy o snake_case, tabeli i wyniku SDK jest mapper wewnątrz adaptera**, nie encja; umieszczenie vendor row w encji byłoby kolejnym przeciekiem.

### Wąski port

```ts
interface ProductInterpretationRepository {
  find(owner: UserId, product: ProductId): Promise<UserProductInterpretation | null>;
  findMany(owner: UserId, products: readonly ProductId[]): Promise<readonly UserProductInterpretation[]>;
  save(interpretation: UserProductInterpretation): Promise<UserProductInterpretation>;
}

interface ProductFitGenerator {
  generate(input: ProductFitInput): Promise<ProductFitResult>;
}
```

Port nie ma `SupabaseClient`, row type, column string, statusu HTTP, `PostgrestError`, modelu OpenRouter ani sekretu. Operation-specific use case ładuje product/profile przez ich porty, wykonuje transition encji, woła generator i zapisuje repozytorium. Dzięki temu obecne bezpośrednie importy OpenRouter w `product-interpretation.ts` (`src/lib/domain/product-interpretation.ts:15-19`) również znikają przy migracji pilota.

### Adapter Supabase i mapper

```ts
// infrastructure/supabase/persistence/product-interpretation.mapper.ts
type SupabaseInterpretationRow = {
  user_id: string;
  product_id: string;
  status: string;
  profile_basis: unknown;
  product_basis: unknown;
  // ...pozostałe kolumny istniejącego kontraktu
};

function toDomain(row: SupabaseInterpretationRow): UserProductInterpretation {
  return UserProductInterpretation.rehydrate(validateRow(row));
}

function toRow(entity: UserProductInterpretation): SupabaseInterpretationRow {
  return mapValidatedSnapshot(entity.snapshot());
}

class SupabaseProductInterpretationRepository implements ProductInterpretationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async find(owner, product) {
    const result = await this.client.from(TABLE).select(COLUMNS)
      .eq("user_id", owner.value).eq("product_id", product.value).maybeSingle();
    if (result.error) throw mapSupabaseError(result.error);
    return result.data ? toDomain(result.data) : null;
  }

  async save(entity) {
    const result = await this.client.from(TABLE).upsert(toRow(entity)).select(COLUMNS).single();
    if (result.error) throw mapSupabaseError(result.error);
    return toDomain(result.data);
  }
}
```

`SupabaseInterpretationRow`, `TABLE`, `COLUMNS`, `.from()`, `.select()`, `.maybeSingle()` i mapping błędów są prywatne dla `src/lib/infrastructure/supabase/**`. Domena nie zna żadnego z nich.

### Pozostałe porty i capabilities

| Dzisiejszy obszar | Docelowy wąski port | Adapter Supabase |
|---|---|---|
| Session / `getUser` | `AuthSession.currentActor(): Promise<AuthenticatedActor | null>` | `SupabaseAuthSession` |
| Product catalog | `ProductCatalog.find`, `search`, `saveConfirmed` | `SupabaseProductCatalogRepository` |
| Profile | `UserProfileRepository.find/save` | `SupabaseUserProfileRepository` |
| Shelf | `UserShelfRepository.list/add/remove` | `SupabaseUserShelfRepository` |
| Routine | `RoutineRepository.find/save` | `SupabaseRoutineRepository` |
| Product interpretation | `ProductInterpretationRepository` | `SupabaseProductInterpretationRepository` |
| Routine assessment | `RoutineAssessmentRepository.find/save` | `SupabaseRoutineAssessmentRepository` |
| Ingredient glossary | read port i osobny privileged command port | `SupabaseIngredientGlossaryReader/Writer` |
| Product photo | `ProductPhotoStore.savePrivate/readUrl` zwracający `ProductPhotoRef` | `SupabaseProductPhotoStore` |

Uprzywilejowany writer nie jest `SupabaseClient` przekazywanym przez route. Jest capability o kilku dozwolonych metodach; dzięki temu use case glossary nie może przypadkowo czytać lub zmieniać dowolnej tabeli. Obecne rozdzielenie zwykłego i service-role clienta (`src/lib/supabase.ts:6-38`) zostaje zachowane wewnątrz infrastructure, ale nie jest widoczne w domenie.

### Cienkie API i UI

```ts
export const POST: APIRoute = async (context) => {
  const actor = requireActor(context.locals.actor);
  const command = parseInterpretationCommand(await context.request.json());

  try {
    const view = await context.locals.services.prepareProductInterpretation.execute(actor.id, command);
    return Response.json(view);
  } catch (error) {
    return mapApplicationError(error);
  }
};
```

Route parsuje transport, wywołuje use case i mapuje nazwany błąd. Nie wywołuje `auth.getUser`, `.from`, `.storage` ani providera AI. UI otrzymuje `ProductInterpretationView`, `ProductSearchCandidateView` i `ProductPhotoRef/View`; nie otrzymuje `User`, `PostgrestResponse`, raw storage object ani OpenRouter response. Obecne React components już nie importują Supabase, więc refaktor ma tę właściwość utrzymać.

## Krok 5 — dowód izolacji i before/after

### Zakres obietnicy wymiany

Po refaktorze wymiana `@supabase/supabase-js` / `@supabase/ssr` na inny klient tego samego PostgreSQL/Auth/Storage backendu dotyka tylko adapterów. Wymiana **całej platformy Supabase** nadal wymaga zmian w `supabase/migrations/**`, RLS, auth i storage; twierdzenie przeciwne byłoby fałszywe. Stabilne pozostają domena, use cases, API DTO i UI.

### Docelowe jedyne pliki znające pakiety

```text
src/lib/infrastructure/supabase/client-factory.ts
src/lib/infrastructure/supabase/auth/supabase-auth-session.ts
src/lib/infrastructure/supabase/persistence/*.repository.ts
src/lib/infrastructure/supabase/persistence/*.mapper.ts
src/lib/infrastructure/supabase/storage/supabase-product-photo-store.ts
```

Composition root może importować te **własne adaptery**, ale nie `@supabase/*`. `src/env.d.ts` używa `AuthenticatedActor`, a nie `User` z SDK.

### Before / after dla wszystkich klas miejsc

| Dzisiejsze miejsce | Before | After |
|---|---|---|
| `src/env.d.ts:3` | Globalny locals ma vendor `User`. | `actor: AuthenticatedActor | null`; mapping `User → AuthenticatedActor` tylko w auth adapterze. |
| `src/lib/supabase.ts:1-38` | Wspólna fabryka ujawnia surowy user i service-role client. | Przeniesiona do `infrastructure/supabase/client-factory.ts`, nieeksportowana poza składanie adapterów. |
| Pięć plików `src/lib/domain/**` wskazanych w Kroku 1 | Przyjmują `SupabaseClient`; trzymają columns, rows, maps i queries. | Zostają encje/VO/policies; persistence przenosi się do repozytoriów i mapperów adaptera. |
| Middleware `src/middleware.ts:17-23` | Tworzy klienta i wywołuje `auth.getUser`. | Wywołuje `AuthSession.currentActor`; zapisuje plain actor i złożone `RequestServices`. |
| Auth routes `src/pages/api/auth/*.ts` | Znają `signInWithPassword`, `signUp`, `signOut` (`src/pages/api/auth/signin.ts:10-15`, `src/pages/api/auth/signup.ts:10-15`, `src/pages/api/auth/signout.ts:5-7`). | Znają `SignIn`, `SignUp`, `SignOut` application services i nazwane błędy. |
| 13 domain API routes z Kroku 1 | Tworzą klienta, sprawdzają auth i przekazują vendor object. | Pobierają actor/services z locals; parse → use case → response. |
| Product photo API `src/pages/api/domain/products/photo-vision.ts:43-75` | Zna bucket, upload DSL i `publicUrl`. | Woła `ProductPhotoStore`; dostaje opaque `ProductPhotoRef` lub bezpieczny read URL według polityki prywatności. |
| Glossary API `src/pages/api/domain/products/ingredient-glossary.ts:73-79` | Tworzy service-role client i przekazuje go do domain function. | Woła use case z `IngredientGlossaryWriter`; uprzywilejowanie jest zamknięte w adapterze. |
| 12 SSR pages z Kroku 1 | Tworzą klienta i składają zapytania domenowe. | Wołają query/use-case ports zwracające gotowe read models. |
| Trzy testy routes z Kroku 1 | Mockują moduł `@/lib/supabase`. | Mockują port/use case; osobne contract tests testują adapter Supabase. |

### Drugorzędny ACL OpenRouter

Po ustabilizowaniu wzorca repozytoriów należy wydzielić jeden `OpenRouterChatClient`, który jako jedyny zna URL, headers i `choices`. Domena `ingredient-glossary` i `product-interpretation` ma zależeć od portów `IngredientGlossaryGenerator` i `ProductFitGenerator`, nie od konkretnych plików OpenRouter. To usuwa sześć kopii protokołu wykazanych w Kroku 1, ale jest fazą po usunięciu przecieku Supabase.

### Pytania zależne od kontraktu biblioteki

1. **Jak przekazać cookie/session do adaptera SSR?** Decyzja architektoniczna: dokładny cookie bridge pozostaje w `client-factory`; port auth nie przyjmuje `AstroCookies`. Obecny kontrakt repo pokazuje `parseCookieHeader` oraz `getAll/setAll` (`src/lib/supabase.ts:6-24`). Dokładną aktualną sygnaturę trzeba ponownie sprawdzić w oficjalnej dokumentacji przed implementacją.
2. **Jak reprezentować „brak rekordu” i błąd?** Port zwraca `null` wyłącznie dla braku; każdy vendor error mapuje do nazwanego application/infrastructure error. Adapter izoluje aktualne `.maybeSingle()` (`src/lib/domain/product-domain.ts:431-438`) i `.single()` (`src/lib/domain/user-domain.ts:398-408`).
3. **Jak obsłużyć privileged writes?** Port rozdziela zwykłe user-scoped repozytoria od minimalnego writer capability. Service-role object nigdy nie przechodzi do domeny ani route; obecne miejsce wymagające migracji to `src/pages/api/domain/products/ingredient-glossary.ts:73-79`.
4. **Czy storage ma zwracać public URL?** Nie jako ogólny kontrakt, ponieważ PRD wymaga prywatności zdjęć (`context/foundation/prd.md:129-131`), a obecny route tworzy public URL (`src/pages/api/domain/products/photo-vision.ts:67-75`). Właściwy mechanizm bezpiecznego odczytu musi zostać potwierdzony w aktualnej dokumentacji Supabase Storage podczas fazy storage; decyzja należy do ACL, nie API.

Brak dostępu do aktualnej dokumentacji jest gate'em fazy implementacyjnej, nie blockerem projektu portów. Lockfile dodatkowo pokazuje istotny fakt do sprawdzenia: deklaracja `^2.99.1` rozwiązała się do `2.105.3`, wymaganej przez peer dependency SSR (`package-lock.json:2740-2750`, `:2765-2779`).

## Krok 6 — weryfikacja i plan faz

### Kryteria sukcesu

Po migracji:

```bash
rg -n '@supabase/(supabase-js|ssr)' src
# wynik: wyłącznie src/lib/infrastructure/supabase/**

rg -n 'SupabaseClient|\.from\(|\.rpc\(|\.storage\.' src/lib/domain src/lib/application src/pages src/components src/env.d.ts
# wynik: pusty

rg -n '@/lib/supabase' src
# wynik: pusty; stary facade usunięty po migracji wszystkich call sites
```

Drugi dowód jest ważniejszy niż samo przeniesienie importu: zapobiega ukryciu klienta pod aliasem podobnym do obecnego `type ProductDomainClient = SupabaseClient` (`src/lib/domain/product-domain.ts:1-3`).

### Fazy refaktoru

| Faza | Zakres | Tryb | Gate |
|---:|---|---|---|
| 0 | Ponowić Context7/Supabase docs, zatwierdzić listę portów i snapshot obecnych kontraktów; bez zmian zachowania. | Research / characterization | Udokumentowane wersje oraz zachowanie auth, `single/maybeSingle`, RLS i storage. |
| 1 | Dodać `UserId`, `ProductId`, `AuthenticatedActor`, encję `UserProductInterpretation`, nazwane błędy i `ProductInterpretationRepository`. | **Test-first** | Pierwszy red test: nielegalne przejście lifecycle rzuca `IllegalInterpretationTransition`. |
| 2 | Dodać mapper i `SupabaseProductInterpretationRepository`; przełączyć jeden use case jako vertical slice. | **Test-first + integration** | Mapper contract, error mapping, owner scoping i parity odpowiedzi API. |
| 3 | Rozdzielić pozostałe pięć skupisk danych na małe porty/repozytoria: product, profile, shelf, routine/assessment, glossary. | Strangler, moduł po module | Po każdym module brak `SupabaseClient` w migrowanym pliku; istniejące endpoints zachowują DTO. |
| 4 | Wydzielić `AuthSession` i auth commands; zastąpić vendor `User` w `App.Locals`; usunąć powtarzane `auth.getUser`. | Test-first dla mapping/error contract | Middleware i auth routes nie importują ani nie wywołują SDK. |
| 5 | Wydzielić `ProductPhotoStore` i privileged glossary writer; zaprojektować prywatny odczyt zdjęć po dokumentacyjnym gate. | Integration-first | Żaden route nie zna bucketu, storage result ani service-role clienta. |
| 6 | Przełączyć SSR read composition na query services; usunąć `src/lib/supabase.ts`; dodać architecture grep/check. | Mechaniczny + regression | Wszystkie trzy polecenia `rg` spełniają oczekiwany wynik. |
| 7 | Drugorzędnie scalić protokół OpenRouter do jednego client adaptera i odwrócić zależności domain → provider. | Test-first | URL/header/response shape występują raz; domain importuje tylko port. |

Plan stosuje konwencję repo: testy obok modułu jako `*.test.ts`, fixture'y w `src/test/fixtures`, mockowanie na granicy providera/klienta (`context/foundation/test-plan.md:87-91`). Unit/integration używa Vitest (`context/foundation/test-plan.md:58-66`), a realne reguły ownership/RLS należą do późniejszego integration setup, który obecny plan testów nadal oznacza jako TBD (`context/foundation/test-plan.md:93-99`).

### Minimalny zestaw testów chroniących granicę

- Domain: legalne i nielegalne transition `pending → ready/failed`, `ready → stale`; błędny transition fail-fast.
- Mapper: pełny snake_case row mapuje się do snapshotu domenowego; nieznany status, brak identity lub zły JSON rzuca `InterpretationMappingError`, nie tworzy częściowego obiektu.
- Repository contract: brak wiersza daje `null`; vendor error daje stabilny `RepositoryUnavailable`/`PersistenceConflict`; surowy message nie trafia do DTO.
- Auth adapter: user SDK mapuje się do `AuthenticatedActor`; brak sesji daje `null`; auth error nie udaje anonymous.
- Ownership integration: repozytorium user-scoped nie odczytuje ani nie zmienia danych innego użytkownika — zgodnie z `context/foundation/prd.md:155-159`.
- Storage integration: adapter nie zwraca publicznego vendor object i nie pozwala zapisać poza przestrzenią ownera.
- Architecture: statyczny check importów i query DSL zgodny z trzema poleceniami `rg`.
- API regression: representative profile, intake, routine AI i glossary endpoints zachowują publiczne statusy/DTO przy mockowanych portach.

### Load-bearing names

Repo nie ma pliku `docs/reference/contract-surfaces.md`; wyszukiwanie nie znalazło istniejącego rejestru. Jeśli zostanie dodany, zarejestrować:

- `AuthenticatedActor`, `UserId`, `ProductId` — provider-neutral identity.
- `UserProductInterpretation`, `InterpretationSnapshot`, `IllegalInterpretationTransition`, `InterpretationMappingError`.
- `ProductInterpretationRepository`, `ProductCatalog`, `UserProfileRepository`, `UserShelfRepository`, `RoutineRepository`, `RoutineAssessmentRepository`.
- `AuthSession`, `ProductPhotoStore`, `ProductPhotoRef`, `IngredientGlossaryReader`, `IngredientGlossaryWriter`.
- `SupabaseProductInterpretationRepository`, `SupabaseAuthSession`, `SupabaseProductPhotoStore` — jawnie adapterowe, nigdy używane jako język domenowy.
- `RepositoryUnavailable`, `PersistenceConflict` — stabilne błędy granicy; bez `PostgrestError` poza ACL.

## Następny kandydat po #1

OpenRouter powinien być drugim refaktorem. Najpierw wspólny transport `OpenRouterChatClient`, potem porty per capability; nie jeden szeroki `AiService`. Usuwa to duplikację sześciu request/response implementations i provider name z domeny (`src/lib/domain/ai-error-contract.ts:94-98`, `src/lib/domain/ingredient-glossary.ts:2-6`, `src/lib/domain/product-interpretation.ts:15-19`) bez mieszania tego zakresu z migracją persistence.

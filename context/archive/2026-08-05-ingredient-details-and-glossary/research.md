---
date: 2026-08-05T16:18:06+02:00
researcher: Codex
git_commit: 4b0f713c3c0a7c4a40059d1d8fb222a43fc4dc33
branch: master
repository: Shelfie
topic: "Ingredient details and glossary: shared, cached INCI explanations on product details"
tags: [research, codebase, ingredients, inci, product-details, cache]
status: complete
last_updated: 2026-08-05
last_updated_by: Codex
---

# Research: Ingredient details and glossary

## Research Question

Jak dodać do szczegółów produktu rozwijane opisy składników INCI, tak aby opis był wspólny dla wszystkich produktów, cache'owany, nie uruchamiał AI przy każdym kliknięciu i nie mieszał się z analizą dopasowania produktu do konkretnego użytkownika?

## Summary

Aktualny kontrakt produktów ma już właściwy punkt wejścia: `products.inci_list` jest wspólną, zatwierdzoną listą INCI i jest dostępna na canonical product details. Brakuje tylko warstwy słownikowej nad pojedynczym składnikiem. Nie należy używać `user_product_interpretations`, ponieważ tamta tabela zawiera wynik zależny od profilu skóry i wersji formuły produktu.

Rekomendowany kierunek dla S-12:

1. Dodać osobny, współdzielony rekord słownikowy kluczowany stabilnym, znormalizowanym kluczem INCI; zachować oryginalną pisownię jako etykietę.
2. Zapisywać krótki opis roli kosmetycznej, możliwe korzyści i ostrożne caveaty wraz ze statusem generacji, wersją promptu/modelu, datą i błędem ostatniej próby.
3. Wczytywać wszystkie rekordy dla INCI danego produktu jednym odczytem strony, a nie osobno po kliknięciu składnika.
4. Rozwijać gotowe opisy zwykłym semantycznym `<details>`; brak opisu komunikować jasno albo uzupełniać jednym ograniczonym żądaniem dla całej listy brakujących składników, nigdy AI per kliknięcie.
5. Traktować wyjaśnienia jako edukacyjne informacje o składniku, bez diagnoz, gwarancji działania gotowego produktu ani osobistej rekomendacji. Te ostatnie należą do istniejącej analizy per user-product.

## Current State

### 1. INCI jest już wspólnym atrybutem canonical product

- `SharedProduct` zawiera `inciList`, `inciSource`, `inciConfidence` i `inciUpdatedAt`; wszystkie są odczytywane przez wspólny `PRODUCT_COLUMNS` (`src/lib/domain/product-domain.ts:5-18`, `:75-92`).
- `getSharedProductById` pobiera canonical product z `products`, więc detal jest dostępny także dla produktu, którego użytkownik nie ma na półce (`src/lib/domain/product-domain.ts:431-439`).
- Migracja kontraktu intake dodała `products.inci_list` i wymaga listy INCI przy zapisie zatwierdzonego produktu (`supabase/migrations/20260611180000_shared_product_intake_contract.sql:1-12`, `:70-103`).
- Wejście ręczne, AI i vision finalnie trafiają przez `parseInciList`; parser trimuje wartości i usuwa tylko identyczne duplikaty (`src/pages/api/domain/products/intake.ts:142-188`). Pomocniczy parser intake robi to samo (`src/lib/integrations/product-intake-fallbacks.ts:58-67`).

Wniosek: S-12 nie musi zmieniać samego flow intake, by umieć wyświetlić INCI istniejących produktów. Musi natomiast stworzyć własny klucz normalizacyjny, ponieważ obecne usuwanie duplikatów nie scala np. różnic wielkości liter lub spacji między produktami.

### 2. Produkt details ma dokładne miejsce na słownik

- Strona `/products/[productId]` ładuje produkt, profil i per-user interpretation równolegle z membership półki (`src/pages/products/[productId].astro:28-64`).
- Na stronie jest już sekcja „Skład produktu / INCI”, która obecnie renderuje statyczne, numerowane pozycje (`src/pages/products/[productId].astro:180-197`). To jest właściwe miejsce na rozwijane rekordy słownika.
- `ProductInterpretationPanel` jest niezależną wyspą React i obsługuje stan `pending/ready/stale/failed` przez JSON endpoint (`src/components/products/ProductInterpretationPanel.tsx:109-263`). S-12 może użyć tej konwencji dla ewentualnego zbiorczego uzupełnienia braków, ale nie powinien dołączać składnikowego stanu do tego komponentu.

### 3. Obecna analiza produktu nie jest modelem słownika

- `user_product_interpretations` ma klucz unikalny `(user_id, product_id)` i przechowuje profil, snapshot produktu, wynik dopasowania, ostrzeżenia oraz wersje promptu/modelu (`supabase/migrations/20260712120000_user_product_interpretations.sql:43-66`, `:96-106`).
- RLS świadomie ogranicza te wyniki wyłącznie do właściciela (`supabase/migrations/20260712120000_user_product_interpretations.sql:113-142`).
- Warstwa domenowa oznacza taki wynik jako nieaktualny, gdy zmieni się profil, lista INCI, confidence/aktualizacja INCI, model lub prompt (`src/lib/domain/product-interpretation.ts:282-335`, `:522-545`).
- Prompt product-fit jest personalizowany i ma opisywać gotowy produkt w kontekście jednego profilu, nie abstrakcyjny składnik (`src/lib/integrations/openrouter-product-fit.ts:144-165`).

Wniosek: ponowne wykorzystanie tej tabeli lub promptu doprowadziłoby do nieprawidłowego cache'a i mieszałoby edukację o składniku z oceną produktu dla konkretnej osoby.

### 4. Dostęp i bezpieczeństwo danych wspólnych

- `products` ma RLS i użytkownicy uwierzytelnieni mają tylko `SELECT` (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315`).
- Server-side client powstaje z ciasteczek aktualnego żądania, zatem działa jako aktualnie zalogowany użytkownik, a nie jako ukryty service role (`src/lib/supabase.ts:5-23`).
- Endpointy domenowe w aplikacji weryfikują użytkownika przez `supabase.auth.getUser()` i zwracają JSON dla interaktywnych wysp (`src/pages/api/domain/products/interpretation.ts:38-65`, `:67-108`).

Wniosek: tabela słownika powinna być publicznie odczytywalna tylko dla `authenticated`, ale zapis generowanych opisów musi być kontrolowany po stronie serwera. Plan musi świadomie wybrać bezpieczny write path, zamiast grantować wszystkim użytkownikom dowolny insert/update wspólnych definicji.

### 5. Są już wzorce UI dla rozwijania i asynchronicznego wyjaśnienia

- `RoutineAiAssessmentPanel` używa kontrolowanego `aria-expanded` dla rozwijanej zawartości (`src/components/routine/RoutineAiAssessmentPanel.tsx:62-90`).
- `RoutineGuidancePanel` ma wzorzec stanu oczekiwania, błędu i zagnieżdżonego wyjaśnienia AI (`src/components/routine/RoutineGuidancePanel.tsx:239-319`). To jest użyteczne jako referencja ergonomii, ale nie jako źródło danych: tamte wyjaśnienia są kontekstowe dla ostrzeżenia rutyny i nie są shared-cache.
- Dla prostej, gotowej treści opisanej w HTML semantyczne `<details>/<summary>` jest lżejsze niż klientowy modal i nie wymaga JavaScriptu tylko po to, by rozwinąć tekst.

### 6. Historia i aktualny zakres roadmapy

- S-12 jest nadal `proposed`; commit `b0bc0b1` przywrócił jego status, ponieważ nie był wcześniej zaimplementowany (`git show b0bc0b1`, `context/foundation/roadmap.md:182-194`).
- Roadmap dokładnie wymaga shared, cacheable records keyed by normalized INCI i zakazuje AI calls na każde kliknięcie (`context/foundation/roadmap.md:182-194`, `:296`).
- Architektura intake zakłada globalne zatwierdzone produkty i provenance dla INCI (`context/foundation/architecture-notes.md:55-81`, `:85-101`).
- PRD wymaga edukacyjnej, zrozumiałej prezentacji bez medycznych deklaracji oraz wspólnego reuse danych produktów (`context/foundation/prd.md:119-139`).

## Proposed Contract (for planning)

Poniższy kontrakt jest propozycją techniczną wynikającą z kodu, nie gotową decyzją implementacyjną.

### Shared record

Tabela roboczo nazwana `ingredient_glossary_entries`:

| Pole | Cel |
| --- | --- |
| `id` | techniczny identyfikator UUID |
| `inci_key` | unikalny, znormalizowany klucz współdzielonego składnika |
| `display_name` | zachowana, czytelna nazwa INCI do UI |
| `status` | `pending`, `ready`, `failed` albo `stale` |
| `cosmetic_role` | krótka rola, np. humektant/emolient/regulator pH; `null` przy niepewności |
| `summary` | zwięzłe, neutralne wyjaśnienie po polsku |
| `likely_benefits` | kontrolowana lista krótkich benefitów kosmetycznych |
| `caveats` | kontrolowana lista ostrożnych, niezero-jedynkowych uwag |
| `source_kind` | wybrane źródło/opis pochodzenia treści |
| `source_reference` | opcjonalny URL lub identyfikator źródła, jeśli jest dostępny |
| `model_version`, `prompt_version` | reprodukowalność i invalidacja przy zmianie generatora |
| `generated_at`, `stale_at`, `stale_reason`, `last_error` | lifecycle cache'a |
| `created_at`, `updated_at` | audyt techniczny |

Nie należy zapisywać w tym rekordzie produktu, użytkownika, score'a, rekomendacji dla typu skóry ani wskazania, czy składnik „zapycha”. To są informacje zależne od formuły lub profilu i należą do innych warstw.

### Normalizacja `inci_key`

Minimalny, konserwatywny algorytm powinien:

1. normalizować Unicode (`NFKC`),
2. usuwać spacje brzegowe i scalać wewnętrzne sekwencje białych znaków,
3. zamieniać warianty myślnika na ASCII `-`,
4. wykonywać `toLocaleLowerCase("en-US")` dla stabilności klucza,
5. zachowywać oryginalną nazwę z listy produktu jako `display_name`.

Nie należy automatycznie usuwać nawiasów, aliasów ani łączyć nazw na podstawie heurystyk chemicznych. Takie skróty mogą połączyć różne INCI i spowodować błędne przypisanie opisu.

### Lifecycle i pobieranie

1. Serwer strony details normalizuje `product.inciList` i jedną operacją pobiera wszystkie istniejące rekordy słownika.
2. Każda pozycja INCI renderuje gotową definicję, stan przygotowania albo jasny stan braku danych.
3. Rozwinięcie gotowej definicji jest lokalne i natychmiastowe; nie wywołuje requestu.
4. Ewentualne generowanie dotyczy wyłącznie całego, ograniczonego zbioru brakujących `inci_key` dla produktu. Konkurencyjne żądania nie mogą tworzyć duplikatów dzięki unique index i obsłudze konfliktu.
5. Zmiana `prompt_version` lub źródła oznacza rekordy ready jako `stale`, analogicznie do istniejącej migracji invalidującej product-fit (`supabase/migrations/20260730165705_invalidate_product_fit_v1_interpretations.sql:1-9`).

## Decisions Needed During Planning

### D1. Initial source of definitions

**Option A: source-backed reference first.** Użyć zewnętrznego źródła danych składnikowych jako źródła struktury/atrybucji i ewentualnie AI wyłącznie do zwięzłego polskiego streszczenia.

- Zaleta: większa audytowalność i możliwość źródłowego linkowania.
- Koszt: trzeba ustalić API, licencję, coverage, limit oraz format danych.

**Option B: shared AI-generated glossary for MVP.** Jeden kontrolowany prompt generuje wspólny opis i zapisuje go z `model_version` oraz `prompt_version`.

- Zaleta: najmniejsza integracja, działa dla dowolnego INCI z potwierdzonej listy.
- Ryzyko: brak pierwotnego źródła naukowego; treść musi pozostać ostrożna i zawsze oznaczona jako informacja edukacyjna.

**Recommendation:** dla MVP wybrać B, o ile interfejs transparentnie opisuje treść jako edukacyjną i generator zapisuje wersję oraz błąd. W osobnym, późniejszym slice można dodać source-backed enrichment bez zmiany klucza ani UI. Nie należy udawać, że produktowa provenance INCI jest provenance opisu pojedynczego składnika.

### D2. Missing entries on existing and new products

**Option A: transparent missing state.** Brak wpisu pokazuje „Opis tego składnika nie jest jeszcze dostępny”; brak automatycznego AI.

**Option B: explicit bounded enrichment.** Jeden przycisk na sekcji INCI przygotowuje wszystkie brakujące opisy tylko dla bieżącego produktu, po czym odświeża dane. To nie jest request per kliknięcie składnika.

**Recommendation:** B, z limitem liczby składników na żądanie, loading state i możliwością retry po błędzie. Jest zgodne z oczekiwaniem rozwijalnych opisów dla obecnego katalogu, nie ukrywa kosztu operacji i nie wydłuża zapisu produktu podczas intake. Przyszły import administracyjny może ten słownik wypełniać wcześniej.

## Risks and Guards

- **Błędne utożsamienie nazw:** użyć jednego helpera normalizacji po stronie serwera oraz przechowywać `display_name`; nie stosować agresywnych heurystyk aliasów.
- **N+1 i koszt AI:** jeden odczyt po liście kluczy oraz co najwyżej jedno zbiorcze enrichment request dla produktu; zakaz requestu po rozwinieciu pojedynczej pozycji.
- **Mieszanie z personalizacją:** słownik nie daje werdyktów dla skóry użytkownika ani gotowej formuły. UI powinno wyraźnie oddzielić go od `ProductInterpretationPanel`.
- **Nadmiar pewności:** prompt/schema muszą wymuszać język „może”, „zwykle”, „rola w kosmetykach”, a nie obietnice efektu czy automatyczne ostrzeżenia.
- **Wspólny write path:** nie udzielać użytkownikom bezpośredniego CRUD na rekordach słownika; endpoint ma walidować listę kluczy z canonical product i limitować batch.
- **Migracje:** przy implementacji użyć nowej migracji oraz `npx supabase migration up`; nie resetować lokalnej bazy. To jest stała zasada projektu (`context/foundation/lessons.md:3-6`).
- **Komunikaty:** endpoint enrichment ma zwracać JSON, a UI pokazywać stan/błąd lokalnie, bez parametrów odpowiedzi w URL (`context/foundation/lessons.md:8-12`).

## Code References

- `src/pages/products/[productId].astro:28-64` — serwerowe ładowanie produktu details i prywatnej interpretacji.
- `src/pages/products/[productId].astro:178-197` — aktualna statyczna sekcja INCI, docelowy punkt integracji S-12.
- `src/lib/domain/product-domain.ts:5-18` — wspólny select kontraktu produktu z `inci_list` i provenance.
- `src/lib/domain/product-domain.ts:289-310` — obecna normalizacja listy i snapshot produktu dla analizy per-user.
- `src/lib/domain/product-domain.ts:431-454` — lookup shared products.
- `src/pages/api/domain/products/intake.ts:142-188` — aktualne parsowanie i exact-match dedupe INCI przy zapisie.
- `src/lib/integrations/product-intake-fallbacks.ts:58-67` — pomocniczy parser ingredient text.
- `supabase/migrations/20260611180000_shared_product_intake_contract.sql:1-12` — utrwalone `inci_list` na shared product.
- `supabase/migrations/20260712120000_user_product_interpretations.sql:43-142` — prywatny, per-user cache product-fit, którego nie należy używać jako glossary.
- `src/lib/domain/product-interpretation.ts:282-335` — istniejący wzorzec invalidacji na podstawie snapshotu i wersji.
- `src/lib/integrations/openrouter-product-fit.ts:144-201` — bieżący personalizowany request AI i strict JSON parsing.
- `src/components/products/ProductInterpretationPanel.tsx:109-263` — wzorzec wyspy React i lokalnych stanów requestu.
- `src/pages/api/domain/products/interpretation.ts:38-108` — wzorzec autoryzowanego endpointu JSON.
- `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315` — obecny model uprawnień dla danych wspólnych.
- `context/foundation/roadmap.md:182-194` — outcome, ryzyka i niezamknięte decyzje S-12.

## Recommendation

Przejść do `/10x-plan ingredient-details-and-glossary` z powyższym kontraktem jako punktem wyjścia. Plan powinien najpierw zamknąć D1 i D2, potem zaprojektować migrację słownika, bezpieczny batch enrichment endpoint, serwerowy read model dla details oraz komponent rozwijający opisy. Nie powinien włączać pełnej bazy naukowej składników, analizy składu formuły ani automatycznej oceny zdrowotnej.

# Personalized Product Fit Analysis — Plan Brief

> Full plan: `context/changes/personalized-product-fit-analysis/plan.md`
> Frame brief: `context/changes/personalized-product-fit-analysis/frame.md`

## What & Why

Budujemy trwały kontrakt domenowy dla spersonalizowanej interpretacji produktu per `(user, product)` oraz jego lifecycle, tak aby product details, późniejsze AI routine draft/review i kolejne warning flows korzystały z tego samego źródła prawdy. W praktyce oznacza to canonical ekran produktu z własną sekcją analizy AI, która jest cache’owana, odświeżalna i nie wymaga ponownego liczenia przy każdym wejściu.

## Starting Point

Repo ma już stabilny podział na `products`, `user_profiles`, `user_shelf_items` i `user_routine_configs`, plus gotowy wzorzec integracji AI przez `src/lib/integrations/*`. Brakuje natomiast jednego ogniwa pomiędzy shared produktem a przyszłym AI routine: per-user interpretacji produktu oraz canonical details route, który potrafi ją pokazać.

## Desired End State

Zalogowany użytkownik może wejść na details dowolnego produktu z `products`, nawet jeśli nie ma go jeszcze na półce, i zobaczyć shared dane plus własną analizę dopasowania do skóry. Analiza ma stany `pending | ready | failed | stale`, zapisuje structured fields i może zostać później wykorzystana przez `ai-routine-draft-and-review` bez ponownego analizowania tego samego produktu od zera.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Główny byt domenowy | `user_product_interpretations` per `(user_id, product_id)` | To zachowuje czyste oddzielenie shared produktu od personalizacji i pozwala przetrwać brak shelf membership. | Frame / Plan |
| Klucz ekranu | Product-centric details screen | Użytkownik ma móc obejrzeć analizę produktu bez wcześniejszego dodania go na półkę. | Plan |
| Trigger generacji | Lazy generation on first details access | To utrzymuje non-blocking UX bez dokładania background job systemu do MVP. | User / Plan |
| Zachowanie UI | Shared product data renderuje się od razu, analiza ma osobne stany | Ekran nie może sprawiać wrażenia zawieszonego tylko dlatego, że AI jeszcze pracuje. | User |
| Invalidacja | Structured profile fields użyte w promptcie + INCI/category + versioning | To daje przewidywalne `stale` bez hałaśliwego odświeżania po zmianie `notes`. | User / Contract Draft |
| Zakres promptu | Brak AM/PM, schedule i routine order | Ten slice ma pozostać product-level, a nie przejmować logiki routine AI. | Contract Draft |
| Strategia testów | Migration/lint/build + pełny manual smoke test, bez live-model tests | Repo nie ma dziś test harnessu dla stabilnego E2E zewnętrznego AI, więc lepiej trzymać MVP realistycznym. | User / Plan |

## Scope

**In scope:**

- nowa tabela `user_product_interpretations`
- dedicated AI integration dla product-fit analysis
- canonical route `/products/[productId]`
- UI stanów `pending/ready/failed/stale`
- wejście w details także bez shelf membership
- invalidation i refresh rules

**Out of scope:**

- AI routine draft/review
- routine-level warnings i conflict engine
- background jobs i okresowy reprocessing
- medical claims
- live-model automation tests

## Architecture / Approach

SSR details route ładuje shared product i aktualny snapshot interpretacji. Jeśli interpretacja nie istnieje, serwer może utworzyć `pending`, ale sam ekran renderuje się natychmiast. Client island uruchamia generację lub refresh tylko dla `pending` i `stale`, zapisuje wynik do `user_product_interpretations`, a UI odświeża się do `ready` albo `failed`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Persistence & Domain Contract | Tabela, typy, RLS i reguły invalidation | Rozmycie granicy między shared product a personalization |
| 2. AI Orchestration & Read Model | Generacja `pending/ready/failed/stale` i endpoint interpretacji | Próba robienia AI synchronously w SSR |
| 3. Canonical Product Details UI | Product-centric details screen z analysis panel | Duplikacja z obecnym intake review screen |
| 4. Entry Points & Verification | Spięcie z search/intake i końcowy smoke test | Niespójne wejścia do dwóch różnych widoków produktu |

**Prerequisites:** `S-01`, `S-02`, `F-02`; gotowa lokalna baza z migracjami zastosowanymi przez `npx supabase migration up`
**Estimated effort:** ~2-3 sesje implementacyjne przez 4 fazy

## Open Risks & Assumptions

- Bez job queue generacja będzie client-triggered po pierwszym renderze, więc UI musi dobrze komunikować stany pośrednie.
- Repo nadal nie ma ogólnego test harnessu, więc deterministic logic trzeba projektować tak, by dało się ją łatwo objąć testami później.
- Existing intake review screen nie powinien zostać drugim canonical details view po wdrożeniu tego slice’a.

## Success Criteria (Summary)

- Użytkownik może otworzyć details dowolnego produktu z `products` i zobaczyć własną analizę dopasowania.
- Analiza jest cache’owana per `(user, product)` i nie liczy się ponownie przy każdym wejściu.
- Zmiana istotnych danych wejściowych ustawia `stale`, a UI pozwala na świadomy refresh lub retry.

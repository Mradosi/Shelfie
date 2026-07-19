---
date: 2026-07-19T09:46:53+02:00
researcher: Codex
git_commit: 18689666b61dcfecf080e3181f1a1f77cfdc5237
branch: master
repository: Shelfie
topic: "shelf-catalog-and-navigation"
tags: [research, codebase, shelf, navigation, product-details, routine]
status: complete
last_updated: 2026-07-19
last_updated_by: Codex
---

# Research: shelf-catalog-and-navigation

**Date**: 2026-07-19T09:46:53+02:00
**Researcher**: Codex
**Git Commit**: `18689666b61dcfecf080e3181f1a1f77cfdc5237`
**Branch**: `master`
**Repository**: `Shelfie`

## Research Question

Jak dodać użytkownikowi katalog „Moja półka” oraz spójną nawigację dla przepływu `Panel → Półka → Produkt → Dodaj produkt / Rutyna`, wykorzystując już istniejące modele półki, szczegółów produktu i rutyny?

## Summary

`S-13` może zostać zrealizowany bez migracji Supabase i bez tworzenia drugiego modelu półki. Warstwa domenowa ma już gotowy, user-scoped read model `listUserShelfCatalog`, a także `addUserShelfItem` i `removeUserShelfItem`. Katalog powinien używać właśnie tych funkcji, pokazywać podstawowe dane produktu, prowadzić do canonical route `/products/<productId>` i mieć prosty empty state z CTA do `/products/intake`.

Największa luka nie leży w danych, lecz w shellu aplikacji. `Topbar` jest obecnie ręcznie dodawany tylko na części ekranów, nie zawiera „Moja półka”, a canonical product details i intake go w ogóle nie renderują. Plan powinien scentralizować nawigację w jednym współdzielonym, chronionym shellu i usunąć duplikaty z obecnych stron.

Usuwanie z półki wymaga świadomego UX: baza automatycznie usuwa dany `shelf_item_id` z `user_routine_configs.schedule`. To jest poprawne zachowanie integralnościowe, ale UI musi wyraźnie uprzedzić użytkownika przed usunięciem produktu, który może należeć do rutyny.

## Detailed Findings

### 1. Model półki jest gotowy do katalogu

- `listUserShelfCatalog` wykonuje jeden odczyt `user_shelf_items` z dołączonym produktem i sortuje według `created_at`; nie ma potrzeby wykonywać N+1 lookupów w nowej stronie. [user-domain.ts:425](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L425)
- Każdy wynik zawiera `shelfItem.id`, `product.id`, nazwę, markę, kategorię i wybrany URL obrazu, czyli pełny minimalny payload karty katalogu. [user-domain.ts:112](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L112), [user-domain.ts:167](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L167), [user-domain.ts:425](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L425)
- Domena już zapewnia add i remove po przynależności konkretnego użytkownika. Nowy endpoint usuwający powinien wywołać `removeUserShelfItem`, a nie usuwać bezpośrednio z komponentu lub tworzyć osobny SQL. [user-domain.ts:439](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L439), [user-domain.ts:456](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/lib/domain/user-domain.ts#L456)
- Minimalny pierwszy katalog nie potrzebuje filtra ani grupowania. Kategoria może być etykietą na karcie, ale brak wiarygodnego, potrzebnego obecnie przypadku użycia dla sortowania lub zaawansowanego filtrowania. To pozostaje poza `S-13`.

### 2. Usunięcie z półki ma istotny efekt na rutynę

- `user_routine_configs.schedule` przechowuje odniesienia do `user_shelf_items.id`, nie bezpośrednio do produktów. [user-domain-persistence-contract.sql:46](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/supabase/migrations/20260530090000_user_domain_persistence_contract.sql#L46)
- Trigger `remove_deleted_shelf_item_from_routine_schedule` wywołuje funkcję `prune_schedule_shelf_item`, więc usunięcie pozycji z półki automatycznie czyści ją z rutyny użytkownika. [user-domain-persistence-contract.sql:152](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/supabase/migrations/20260530090000_user_domain_persistence_contract.sql#L152), [user-domain-persistence-contract.sql:229](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/supabase/migrations/20260530090000_user_domain_persistence_contract.sql#L229)
- Z tego powodu UI nie powinno obiecywać, że usunięcie zmieni wyłącznie katalog. Minimalny właściwy wzorzec to natywne potwierdzenie albo czytelny etap potwierdzenia z komunikatem, że produkt zniknie też z rutyny, jeśli był użyty.

### 3. Canonical product details są gotowym celem kart katalogu

- `/products/[productId]` już rozpoznaje, czy produkt jest na półce, i renderuje stan „Na Twojej półce” albo „Poza Twoją półką”. [products/[productId].astro:40](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/products/%5BproductId%5D.astro#L40), [products/[productId].astro:113](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/products/%5BproductId%5D.astro#L113)
- Dla produktu poza półką details używa już bezpiecznego endpointu `add-existing` oraz wraca po sukcesie na ten sam canonical screen. [products/[productId].astro:128](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/products/%5BproductId%5D.astro#L128), [add-existing.ts:44](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/api/domain/products/add-existing.ts#L44)
- Katalog powinien więc linkować po `product.id`, natomiast akcję usunięcia wykonywać po `shelfItem.id`. Mieszanie tych identyfikatorów byłoby błędem, ponieważ jeden opisuje shared product, a drugi per-user membership.

### 4. Nawigacja jest obecnie rozproszona

- `Topbar` ma tylko linki do profilu, rutyny, panelu i technicznego debug view. Brakuje „Moja półka” i wejścia do dodawania produktu. [Topbar.astro:13](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/components/Topbar.astro#L13)
- `Layout` renderuje globalne style, banner konfiguracji i slot, ale nie renderuje aplikacyjnego shellu. [Layout.astro:14](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/layouts/Layout.astro#L14)
- `Topbar` jest dodawany ręcznie na `/dashboard` i `/routine`, ale nie na product details. [dashboard.astro:45](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/dashboard.astro#L45), [routine.astro:122](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/routine.astro#L122), [products/[productId].astro:68](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/products/%5BproductId%5D.astro#L68)
- Najmniejsza spójna zmiana to jeden wariant layoutu lub dedykowany shell dla zalogowanych ekranów domenowych. Nie należy robić pełnego redesignu stron publicznych, mobile navigation ani PWA w tym slice’ie.

### 5. Obecne trasy i security wspierają nową stronę

- Middleware chroni prefiksy `/products` i `/routine`; nowa samodzielna trasa `/shelf` musi zostać dodana do `PROTECTED_ROUTES`. [middleware.ts:4](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/middleware.ts#L4)
- Intake jest właściwym CTA dla empty state i dodawania kolejnych produktów. Aktualna rutyna już używa `/products/intake` jako wejścia do rozszerzenia półki. [routine.astro:143](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/pages/routine.astro#L143)
- Search-result flow dla shared products prowadzi do canonical details zamiast automatycznie dodawać produkt do półki. [ProductIntakeFlow.tsx:230](https://github.com/Mradosi/Shelfie/blob/18689666b61dcfecf080e3181f1a1f77cfdc5237/src/components/products/ProductIntakeFlow.tsx#L230) To należy zachować; katalog nie może zmienić confirmation-first charakteru intake.

## Architecture Insights

- `products` to wspólne rekordy katalogowe, a `user_shelf_items` to prywatna relacja użytkownika z produktem. Każdy UI flow musi świadomie wybierać odpowiedni identyfikator: `productId` dla details i add, `shelfItemId` dla remove oraz routine entries.
- RLS chroni ownership, ale warstwa domenowa w `removeUserShelfItem` dodatkowo filtruje `user_id`; nowy route powinien trzymać ten istniejący wzorzec.
- Centralizacja shellu jest zmianą strukturalną, nie kosmetyczną. Bez niej nowy link „Moja półka” nadal będzie znikać po wejściu w details lub intake.
- Nowa lista półki może być stroną SSR Astro, tak jak `/routine`: dane są małe, już server-side, a usuwanie może być zwykłym POST z redirectem i komunikatem sukcesu/błędu. Nie ma uzasadnienia dla klientowskiego cache’a lub nowej React island wyłącznie dla listy.

## Historical Context

- [first-manual-routine-management plan](/Users/mradosiewicz/Desktop/projects/Shelfie/context/archive/2026-07-09-first-manual-routine-management/plan.md) ustalił, że rutyna używa wyłącznie produktów z półki, a reset rutyny nie usuwa produktów. `S-13` powinien zachować tę granicę.
- [personalized-product-fit-analysis plan](/Users/mradosiewicz/Desktop/projects/Shelfie/context/archive/2026-07-12-personalized-product-fit-analysis/plan.md) ustanowił `/products/<productId>` jako canonical, product-centric details route dostępny także przed dodaniem produktu na półkę. Katalog ma jedynie być kolejnym wejściem do tej trasy.
- [first-product-intake research](/Users/mradosiewicz/Desktop/projects/Shelfie/context/archive/2026-06-11-first-product-intake/research.md) opisuje confirmation-first intake i shared `products` jako współdzielony katalog. Nie należy wprowadzać automatycznego dodawania z wyników wyszukiwania.

## Related Research

- [First product intake research](/Users/mradosiewicz/Desktop/projects/Shelfie/context/archive/2026-06-11-first-product-intake/research.md)
- [First skin profile research](/Users/mradosiewicz/Desktop/projects/Shelfie/context/archive/2026-05-31-first-skin-profile/research.md)

## Open Questions

1. Czy przy usuwaniu z półki wystarczy potwierdzenie z komunikatem o wycofaniu z rutyny, czy przed usunięciem trzeba wyświetlić konkretną liczbę miejsc w rutynie? Rekomendacja: prosty, jasny komunikat bez licznika.
2. Czy „Panel” ma pozostać linkiem w primary navigation, mimo że obecny `/dashboard` jest ekranem technicznym? Rekomendacja: zachować go tymczasowo jako punkt startowy, ale nie rozwijać go w tym slice’ie.
3. Czy minimalny katalog ma grupować produkty po kategorii? Rekomendacja: nie; zachować chronologiczną listę/karty i category badge, a filtrowanie odłożyć do osobnego slice’a.

## Recommendation

Zaplanować `S-13` w trzech małych fazach:

1. Wspólny, chroniony shell nawigacyjny oraz nowa trasa `/shelf` z SSR catalogem i empty state.
2. Bezpieczny POST do usunięcia z półki, potwierdzenie użytkownika i komunikaty po redirectach; rozszerzyć details o usuwanie pozycji już należącej do półki.
3. Spiąć entry points (`/routine`, intake, product details), wykonać build/lint i manualny test pełnego flow, w tym konsekwencji usunięcia produktu w rutynie.

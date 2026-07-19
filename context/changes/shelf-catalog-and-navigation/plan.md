# Shelf catalog and navigation Implementation Plan

## Overview

`S-13` wprowadza użytkowy katalog „Moja półka” oraz spójną, stale dostępną nawigację dla zalogowanej części Shelfie. Użytkownik będzie mógł przejść od panelu do półki, otworzyć canonical product details, dodać produkt przez intake, ułożyć rutynę oraz bezpiecznie usunąć produkt z półki.

## Current State Analysis

Model danych dla półki już istnieje: `user_shelf_items` jest prywatną relacją użytkownika z shared `products`, a `listUserShelfCatalog` zwraca jeden read model z danymi wystarczającymi do renderowania kart. Szczegóły produktu działają pod `/products/<productId>`, rozróżniają produkt na i poza półką oraz mają bezpieczny flow dodawania.

Brakuje jednak użytkowego route’u katalogu, endpointu usuwania i jednego shellu nawigacyjnego. `Topbar` jest obecnie ręcznie osadzany tylko w części ekranów, nie zawiera „Moja półka” ani „Dodaj produkt”, a jednocześnie eksponuje techniczny debug route.

## Desired End State

Zalogowany użytkownik widzi spójną primary navigation na ekranach domenowych: `Panel`, `Moja półka`, `Dodaj produkt`, `Rutyna`. Route `/shelf` pokazuje chronologiczną siatkę należących do niego produktów z obrazem, marką, nazwą i kategorią; każda karta prowadzi do canonical details i pozwala usunąć pozycję po potwierdzeniu.

Po dodaniu nowego produktu przez intake użytkownik trafia do półki, natomiast dodanie istniejącego produktu z details pozostawia go na tym samym ekranie. Usunięcie z katalogu wraca do katalogu, a usunięcie z details pozostawia użytkownika na details już jako produktu poza półką. W obu miejscach komunikat ostrzega, że produkt może zostać równocześnie wycofany z rutyny.

### Key Discoveries

- `listUserShelfCatalog` zapewnia już user-scoped, jednozapytaniowy payload kart, więc ta zmiana nie wymaga migracji ani nowego read modelu: `src/lib/domain/user-domain.ts:425`.
- Usunięcie `user_shelf_items` automatycznie oczyszcza odwołania w `user_routine_configs.schedule` przez trigger bazy: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:152` i `:229`.
- Canonical details pracują po `productId`, a operacja remove musi pracować po per-user `shelfItemId`: `src/pages/products/[productId].astro:40`, `src/lib/domain/user-domain.ts:456`.
- `Topbar` nie jest globalny, więc należy scentralizować jego rendering tylko dla zalogowanego shellu, zamiast dodawać kolejne ręczne instancje: `src/components/Topbar.astro:13`, `src/layouts/Layout.astro:14`.

## What We're NOT Doing

- Filtrowania, wyszukiwania, sortowania lub grupowania katalogu poza kolejnością `created_at` i badge kategorii.
- Notatek, reakcji, check-inów skóry, analityki półki ani zaawansowanych akcji batch.
- Nowej migracji, zmiany RLS, nowego klientowskiego cache’a albo React island tylko dla SSR katalogu.
- Automatycznego dodawania produktu do półki z wyników shared search.
- Mobilnego redesignu, PWA oraz zmiany stron publicznych lub auth.
- Liczenia miejsc użycia produktu w rutynie przed usunięciem.

## Implementation Approach

Rozszerzyć istniejący `Layout` o jawny wariant nawigacji aplikacyjnej dla zalogowanych ekranów domenowych i uczynić `Topbar` jedynym miejscem primary navigation. Zbudować `/shelf` jako SSR Astro page na istniejącym `listUserShelfCatalog`; karta użyje `product.id` do details, a `shelfItem.id` wyłącznie do mutacji usunięcia.

Nowy form POST będzie naśladował `add-existing`: waliduje wewnętrzne ścieżki redirectu, odczytuje sesję serwerowo i deleguje do `removeUserShelfItem`. W obu UI entry pointach należy użyć jednego współdzielonego komponentu/formularza usunięcia, aby copy potwierdzenia i kontrakt redirectu nie rozjechały się.

## Critical Implementation Details

Nie usuwać produktu bezpośrednio po `productId`: `user_shelf_items` jest per-user membership i jest jedynym poprawnym obiektem do delete. Trigger bazy usuwa potem jego wystąpienia z rutyny, dlatego potwierdzenie przed POST-em musi nazwać ten efekt uboczny, ale nie musi wykonywać dodatkowego odczytu ani liczyć wystąpień.

## Phase 1: Application shell and shelf catalog

### Overview

Ta faza ustanawia jedną primary navigation dla zalogowanego flow oraz pierwszy użytkowy katalog półki. Nie wprowadza jeszcze operacji usuwania.

### Changes Required

#### 1. Central application navigation

**Files**: `src/layouts/Layout.astro`, `src/components/Topbar.astro`, `src/pages/dashboard.astro`, `src/pages/routine.astro`, `src/pages/products/intake.astro`, `src/pages/products/intake/review/new.astro`, `src/pages/products/intake/review/shared.astro`, `src/pages/products/[productId].astro`, `src/pages/settings/skin-profile.astro`

**Intent**: Wprowadzić jeden opcjonalny shell dla zalogowanych ekranów domenowych, usunąć ręcznie osadzone duplikaty topbara i zapewnić użytkownikowi tę samą nawigację podczas przechodzenia między panelem, półką, intake, details, rutyną i profilem.

**Contract**: `Layout` dostaje jawny wariant renderujący `Topbar` tylko dla stron aplikacyjnych. `Topbar` ma primary links `Panel` (`/dashboard`), `Moja półka` (`/shelf`), `Dodaj produkt` (`/products/intake`) i `Rutyna` (`/routine`), natomiast profil i wylogowanie pozostają akcjami konta. `Debug produktów` nie jest linkowany, lecz route pozostaje dostępny bezpośrednio.

#### 2. Protected shelf route and SSR catalog

**Files**: `src/pages/shelf.astro`, `src/middleware.ts`, `src/lib/domain/user-domain.ts`

**Intent**: Udostępnić zalogowanemu użytkownikowi pierwszy katalog „Moja półka” oparty wyłącznie o jego membership records i obecny product read model.

**Contract**: `/shelf` jest chronione w middleware, wykonuje server-side `listUserShelfCatalog(supabase, user.id)`, obsługuje brak konfiguracji/migracji tym samym stylem błędów co obecne domain pages i renderuje karty w kolejności zwracanej przez domenę. Karta pokazuje obraz lub placeholder, markę, nazwę i kategorię; link „Zobacz szczegóły” używa `/products/<product.id>`. Empty state ma CTA do `/products/intake`; pierwsza wersja nie ma filtra, searcha ani groupingu.

### Success Criteria

#### Automated Verification

- `npx astro sync` przechodzi z nowym route’em `/shelf` i wariantem layoutu.
- `npm run lint` przechodzi dla shellu, katalogu i chronionej trasy.
- `npm run build` generuje produkcyjną aplikację z katalogiem i bez zdublowanego topbara na dotychczasowych ekranach domenowych.

#### Manual Verification

- Zalogowany użytkownik może użyć primary navigation na panelu, półce, intake, details, rutynie i profilu skóry; `Debug produktów` nie występuje w primary navigation.
- Użytkownik z produktami na półce widzi chronologiczne karty, otwiera z nich poprawne `/products/<productId>` i wraca do katalogu z nawigacji.
- Użytkownik z pustą półką widzi jasny empty state i CTA do `/products/intake`; niezalogowane wejście na `/shelf` przekierowuje do logowania.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Safe shelf removal

### Overview

Ta faza pozwala usuwać membership z półki z katalogu i canonical product details, przy zachowaniu istniejącej integralności z rutyną.

### Changes Required

#### 1. Server-side shelf removal endpoint

**File**: `src/pages/api/domain/products/remove-from-shelf.ts`

**Intent**: Dodać jedyny write path do usunięcia produktu z półki, zgodny z aktualnym stylem `add-existing` i bez zaufania do danych przesłanych przez przeglądarkę.

**Contract**: `POST` przyjmuje `shelfItemId`, `successRedirectTo` i `errorRedirectTo`; akceptuje wyłącznie wewnętrzne ścieżki redirectu, pobiera zalogowanego usera przez Supabase i wywołuje `removeUserShelfItem(supabase, user.id, shelfItemId)`. Brak lub nieposiadany `shelfItemId` kończy się bezpiecznym redirectem błędu; sukces dodaje komunikat query string bez ujawniania danych innego użytkownika.

#### 2. Shared removal control

**Files**: `src/components/products/RemoveShelfItemForm.astro`, `src/pages/shelf.astro`, `src/pages/products/[productId].astro`

**Intent**: Udostępnić tę samą, wyraźnie ostrzegającą akcję usunięcia zarówno przy karcie katalogu, jak i na ekranie szczegółów produktu, bez duplikowania pól formularza i copy.

**Contract**: Współdzielony formularz przyjmuje `shelfItemId`, kontekst redirectów i label akcji. Przed wysłaniem wymaga potwierdzenia użytkownika z komunikatem: usunięcie produktu z półki może równocześnie usunąć go z zapisanej rutyny. Usunięcie z katalogu wraca do `/shelf`; usunięcie z details wraca na ten sam `/products/<productId>?shelf=removed`, gdzie screen pokazuje stan poza półką i istniejącą akcję ponownego dodania.

#### 3. Product membership lookup for details

**File**: `src/pages/products/[productId].astro`

**Intent**: Zachować rozróżnienie shared product vs per-user shelf membership po dodaniu akcji remove.

**Contract**: Route zachowuje `isOnShelf`, ale przekazuje także odpowiadający mu `shelfItem.id` do shared removal control. Jeśli membership nie istnieje, nie renderuje akcji remove; status i add flow dla produktu poza półką pozostają bez zmian.

### Success Criteria

#### Automated Verification

- `npx astro sync` przechodzi z nowym route’em API i współdzielonym formularzem.
- `npm run lint` przechodzi dla walidacji requestu, SSR pages i komponentu formularza.
- `npm run build` przechodzi z obsługą obu entry pointów usuwania.

#### Manual Verification

- Usunięcie z karty półki wymaga potwierdzenia, usuwa wyłącznie bieżącą pozycję użytkownika i pokazuje komunikat sukcesu po powrocie do `/shelf`.
- Usunięcie z details wymaga takiego samego potwierdzenia, zostawia użytkownika na tym samym produkcie w stanie „Poza Twoją półką” i pozwala dodać go ponownie.
- Produkt obecny w zapisanej rutynie znika z rutyny po usunięciu z półki i po odświeżeniu route’u rutyny; anulowanie potwierdzenia nie zmienia półki ani rutyny.
- Błędny lub nieposiadany `shelfItemId` pokazuje błąd na bezpiecznym, wewnętrznym redirectcie i nie usuwa innej pozycji.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Flow handoffs and lifecycle verification

### Overview

Ta faza domyka przepływ dodawania, przeglądania i używania produktów tak, aby półka była naturalnym hubem, a nie izolowaną listą.

### Changes Required

#### 1. Intake success handoff

**Files**: `src/pages/api/domain/products/intake.ts`, `src/components/products/NewProductReviewForm.tsx`, `src/pages/products/intake/review/new.astro`

**Intent**: Po potwierdzonym zapisie nowego produktu prowadzić użytkownika do jego katalogu, gdzie może od razu sprawdzić, że produkt jest na półce.

**Contract**: Flow zapisu nowego produktu przekierowuje do `/shelf?shelf=added` z komunikatem sukcesu. Shared product search zachowuje obecne przejście do canonical details bez automatycznego dodania do półki.

#### 2. Cross-flow calls to action and copy

**Files**: `src/pages/routine.astro`, `src/pages/shelf.astro`, `src/pages/products/[productId].astro`

**Intent**: Uczytelnić następny krok między półką, intake, details i rutyną bez zamieniania tej fazy w redesign aplikacji.

**Contract**: Rutyna odsyła użytkownika do półki jako miejsca zarządzania posiadanymi produktami i zachowuje CTA do intake dla rozszerzenia katalogu. Półka ma CTA do intake oraz rutyny. Details z produktem na półce linkują do półki; po dodaniu z details pozostają na details, zgodnie z istniejącym canonical flow.

### Success Criteria

#### Automated Verification

- Pełna weryfikacja repo przechodzi przez `npx astro sync && npm run lint && npm run build`.
- Wszystkie nowe i zmienione linki używają wewnętrznych ścieżek, a codebase nie zawiera aktywnego primary linku do `/debug/products`.

#### Manual Verification

- Użytkownik może przejść pełną ścieżkę `Panel → Moja półka → szczegóły produktu → dodaj produkt / usuń z półki → Rutyna` bez ręcznego wpisywania URL.
- Zapis nowego produktu przez intake prowadzi do półki z komunikatem sukcesu, a dodanie istniejącego produktu z details pozostaje na details.
- Po usunięciu produktu z półki routine editor nie oferuje już tej pozycji i zachowuje wszystkie pozostałe produkty oraz wpisy.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the commit step. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

## Testing Strategy

### Unit Tests

Repo nie ma committed test suite. Walidację wewnętrznego redirect path oraz parse `shelfItemId` należy trzymać w małych, łatwych do skontrolowania funkcjach wewnątrz route handlera, na wzór `add-existing`.

### Integration Tests

- Local Supabase z istniejącymi migracjami: dodać produkt na półkę, umieścić go w rutynie, usunąć membership przez route i odświeżyć rutynę.
- Wymusić remove z `shelfItemId` bieżącego użytkownika oraz nieistniejącym/nieposiadanym id; tylko pierwszy przypadek ma zmienić dane.
- Potwierdzić, że shared product search nadal otwiera details bez tworzenia `user_shelf_items`.

### Manual Testing Steps

1. Zalogować użytkownika z ukończonym profilem, kilkoma produktami na półce i co najmniej jednym produktem użytym w zapisanej rutynie.
2. Otworzyć wszystkie primary links z panelu, półki, intake, details, rutyny i profilu; potwierdzić, że debug nie jest eksponowany w navigation.
3. Otworzyć `/shelf`, sprawdzić kartę produktu, placeholder obrazu oraz przejście do `/products/<productId>`.
4. Otworzyć użytkownika z pustą półką i potwierdzić empty state oraz CTA do intake.
5. Usunąć produkt z karty półki, zaakceptować ostrzeżenie i sprawdzić komunikat sukcesu; powtórzyć usunięcie z details oraz anulowanie potwierdzenia.
6. Odświeżyć `/routine` po usunięciu produktu używanego w rutynie i potwierdzić, że zniknął tylko ten produkt.
7. Zapisać nowy produkt przez intake i potwierdzić redirect do półki; dla istniejącego shared produktu wejść w details, dodać go i potwierdzić pozostanie na details.

## Performance Considerations

Katalog używa istniejącego pojedynczego join read modelu i mały, per-user dataset. Nie wprowadzać klientowskiego cache’a, paginacji ani dodatkowych odczytów rutyny tylko po to, aby przed delete policzyć wystąpienia produktu.

## Migration Notes

Brak migracji. Istniejący trigger bazy obsługuje konsekwencję usunięcia membership z rutyny; podczas całej zmiany obowiązuje migration-first workflow bez `supabase db reset`.

## References

- Research: `context/changes/shelf-catalog-and-navigation/research.md`
- Existing shelf read/write helpers: `src/lib/domain/user-domain.ts:425`, `src/lib/domain/user-domain.ts:456`
- Existing add endpoint pattern: `src/pages/api/domain/products/add-existing.ts:12`
- Canonical details route: `src/pages/products/[productId].astro:40`
- Routine and shelf integrity trigger: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:152`
- Existing protected route boundary: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Application shell and shelf catalog

#### Automated

- [x] 1.1 Astro types, lint and production build pass with the protected shelf route and application shell

#### Manual

- [x] 1.2 Primary navigation is available on every signed-in domain screen and excludes the debug route
- [x] 1.3 Shelf cards, empty state and details links work for owned products; `/shelf` redirects unauthenticated users

### Phase 2: Safe shelf removal

#### Automated

- [ ] 2.1 Astro types, lint and production build pass with the removal endpoint and shared control

#### Manual

- [ ] 2.2 User can confirm or cancel removal from a shelf card; success changes only their membership
- [ ] 2.3 User can remove from details, see the outside-shelf state and add the product again
- [ ] 2.4 Removing a product used in the routine prunes only that product from the routine; invalid ownership does not delete data

### Phase 3: Flow handoffs and lifecycle verification

#### Automated

- [ ] 3.1 Final repository verification passes through Astro sync, lint and production build
- [ ] 3.2 Active primary navigation contains no debug-products link and uses only internal application paths

#### Manual

- [ ] 3.3 Full Panel-to-shelf-to-details-to-routine flow works without typing a URL
- [ ] 3.4 New product intake redirects to the shelf while existing-product addition from details remains on details
- [ ] 3.5 Routine editor reflects shelf removal while preserving remaining products and entries

# Shelf catalog and navigation — Plan Brief

> Full plan: `context/changes/shelf-catalog-and-navigation/plan.md`
> Research: `context/changes/shelf-catalog-and-navigation/research.md`

## What & Why

Budujemy użytkowy katalog „Moja półka” i jedną primary navigation dla zalogowanej części Shelfie. Obecne produkty, details i rutyna istnieją, ale są połączone niepełnie: nawigacja znika między ekranami, a półka nie ma własnego widoku zarządzania.

## Starting Point

`listUserShelfCatalog` już zwraca per-user karty produktów w jednym odczycie, a product details są canonical route’em działającym zarówno dla produktów na półce, jak i poza nią. Brakuje route’u `/shelf`, server-side remove flow oraz wspólnego shellu nawigacyjnego.

## Desired End State

Użytkownik porusza się po `Panel → Moja półka → Produkt → Dodaj produkt / Rutyna` z każdego zalogowanego ekranu. Może przeglądać produkty na półce, wejść w details, dodać produkt, a także usunąć pozycję po jasnym ostrzeżeniu o wpływie na rutynę.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Navigation scope | One signed-in application shell | Prevents navigation disappearing between the core domain screens. | Plan |
| Shelf presentation | Chronological cards with category badge | Existing read model supports it; filtering and grouping are premature. | Research |
| Removal UX | Shared confirmed removal from cards and details | Preserves one ownership-safe mutation and explains the routine consequence. | Plan |
| Intake handoff | New product goes to shelf; details add stays on details | Makes the shelf the management hub without breaking canonical details flow. | Plan |
| Routine impact | No pre-delete usage count | Database already prunes schedule; a clear warning is enough for MVP. | Research |

## Scope

**In scope:**

- Protected SSR `/shelf` catalog and empty state.
- Signed-in primary navigation for the core product and routine flow.
- Confirmed, ownership-safe removal from shelf cards and product details.
- Intake redirect to the shelf after saving a new product.

**Out of scope:**

- Filters, search, sorting, grouping, notes, reactions and check-ins.
- New database schema, client cache, PWA/mobile redesign and public/auth redesign.
- Routine recommendations or analysis changes.

## Architecture / Approach

The existing domain layer remains the source of truth: `/shelf` reads `listUserShelfCatalog`; cards use `productId` for details and `shelfItemId` for removal. A new POST route validates session and internal redirects before calling `removeUserShelfItem`; the existing database trigger then prunes any routine references. A layout variant hosts the shared navigation only on signed-in domain pages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shell and catalog | Shared navigation and protected `/shelf` route | Avoiding duplicate topbars and inconsistent protected-page coverage |
| 2. Safe removal | Shared remove control and ownership-safe endpoint | Explaining automatic routine pruning clearly |
| 3. Flow verification | Intake handoff and cross-screen lifecycle | Preserving existing shared-search and details behavior |

**Prerequisites:** Existing `S-02` product intake and `S-11` canonical product details are complete.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- The catalog is intentionally adequate for a small shelf; a larger inventory will need a later filtering/search slice.
- Removing a shelf item uses the existing database trigger; manual verification must confirm the resulting routine state.
- The current dashboard remains a temporary primary entry point, not a redesign target for this change.

## Success Criteria (Summary)

- A logged-in user can reach all core product and routine screens from consistent navigation.
- The user can manage owned products through `/shelf` and open canonical details.
- Removal is explicit, ownership-safe and correctly removes only the deleted product from the saved routine.

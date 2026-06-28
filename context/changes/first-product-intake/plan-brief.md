# First product intake — Plan Brief

> Full plan: `context/changes/first-product-intake/plan.md`
> Research: `context/changes/first-product-intake/research.md`

## What & Why

Budujemy pierwszy pełny flow dodawania produktu do Shelfie po ukończeniu profilu skóry. Użytkownik ma wyszukać kosmetyk po nazwie lub barcode, skorzystać z shared-source lookup i fallbacków, a potem zawsze potwierdzić lub poprawić dane przed zapisem, żeby Shelfie zaczęło pracować na realnych produktach zamiast kończyć onboarding na pustej półce.

## Starting Point

Dziś repo ma auth funnel, onboarding profilu i minimalny kontrakt shelf membership, ale nie ma jeszcze intake flow ani realnego shared product schema. `products` to tylko stub z `id`, a `user-domain.ts` potrafi dodać produkt na półkę tylko wtedy, gdy shared record już istnieje.

## Desired End State

Po wdrożeniu użytkownik z kompletnym profilem trafia do chronionego flow intake, może wyszukać produkt po nazwie lub barcode, przejść przez OBF oraz fallbacki AI/photo/manual i zapisać wynik dopiero po review screenie. Confirmed product jest zapisywany albo reuse'owany w shared `products`, a potem dołączany do `user_shelf_items` bez tworzenia niepotrzebnych duplikatów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Primary provider | Open Beauty Facts | To najlepszy zweryfikowany fit dla barcode + name lookup + INCI payload w MVP | Research |
| Barcode scope | Barcode zostaje w `S-02` | Aktualny PRD i roadmap traktują barcode jako część docelowego intake flow | Plan |
| Dedupe rule | Barcode first, normalized brand+name fallback | Pozwala reuse'ować shared products także dla name-only intake bez opierania wszystkiego wyłącznie na barcode | Plan |
| Shared metadata scope | Minimal confirmed product contract | Utrzymuje `S-02` w ryzach i nie zamienia go w pełny enrichment project | Plan |
| Save boundary | Dedicated product-domain module + thin route | Pasuje do obecnego wzorca `user-domain.ts` i zostawia route bez ciężkiej logiki domenowej | Plan |
| Review behavior | Mandatory review before every save | To twardy guardrail z PRD i najważniejsze zabezpieczenie jakości danych | Research |
| Fallback scope | AI web search + photo extraction + manual all ship in first flow | Użytkownik wyraźnie wybrał pełną drabinkę fallbacków już w `S-02` | Plan |

## Scope

**In scope:** minimal shared product schema, OBF integration, barcode and name lookup, AI/photo/manual fallback branches, review screen, confirmed save, shelf attach, post-onboarding handoff into product intake, dedupe/reuse verification.

**Out of scope:** product interpretation, fit score, warnings, product card UX, routine logic, full metadata enrichment (`ingredient_groups`, `concern_tags`, `routine_roles`), shopping integrations, merge tooling dla duplikatów.

## Architecture / Approach

Plan ma trzy warstwy: najpierw minimalny shared-product contract i serwerowy moduł produktowy, potem właściwy intake UX z search-first flow i obowiązkowym review, a na końcu integrację z istniejącym lifecycle aplikacji. Save path ma stałą kolejność: local/shared lookup -> external/fallback resolution -> review-confirmed payload -> canonical shared product reuse/create -> attach to `user_shelf_items`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared product contract and server-side orchestration | Real shared `products` schema, provenance contract, OBF adapter i trusted save path | Rozrost foundation ponad minimalny intake contract |
| 2. Intake UX, fallback branches, and review flow | Search-first UI z barcode, OBF, AI/photo/manual fallback i mandatory review | Zbyt duża złożoność UI/state przy wielu branchach fallbackowych |
| 3. App integration, reuse verification, and developer handoff | Start/onboarding handoff, navigation updates i end-to-end smoke path | Niespójny lifecycle między onboardingiem, intake i debug surfaces |

**Prerequisites:** istniejący `S-01` onboarding profilu; dostęp do OBF; zgoda, że ten change absorbuje minimalny brakujący foundation `F-02`
**Estimated effort:** ~3-4 sesje implementacyjne przez 3 fazy

## Open Risks & Assumptions

- Plan zakłada, że minimalny shared product foundation może wylądować w tym samym streamie co `S-02`, bo bez niego intake nie ma gdzie zapisać confirmed product.
- Photo extraction wchodzi do pierwszego flow, ale może wymagać lżejszej integracji technicznej niż docelowe, bogatsze przetwarzanie obrazu.
- OBF coverage dla części produktów może być słabe, więc UX fallbacków i manual correction jest równie ważny jak sam happy path lookup.

## Success Criteria (Summary)

- Użytkownik może dodać pierwszy produkt po nazwie lub barcode i zawsze przechodzi przez review przed zapisem.
- Shared `products` zapisuje provenance/confidence i reuse'uje istniejące rekordy zamiast dublować katalog.
- Repo przechodzi `npx astro sync && npm run lint && npm run build`, a manual smoke potwierdza lookup, fallbacki, dedupe i auth boundaries.

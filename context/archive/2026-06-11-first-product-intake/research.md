---
date: 2026-06-11T16:12:23Z
researcher: OpenCode
git_commit: 2b09298bf0dceebc284467d125a17790a6394930
branch: master
repository: Shelfie
topic: "Czy mozemy skorzystac z jakiejs bazy lub gotowego API produktow do wyszukiwania po nazwie lub barcode zgodnie z architecture-notes"
tags: [research, codebase, product-intake, open-beauty-facts, barcode, inci]
status: complete
last_updated: 2026-06-11
last_updated_by: OpenCode
---

# Research: Czy mozemy skorzystac z jakiejs bazy lub gotowego API produktow do wyszukiwania po nazwie lub barcode zgodnie z architecture-notes

**Date**: 2026-06-11T16:12:23Z
**Researcher**: OpenCode
**Git Commit**: `2b09298bf0dceebc284467d125a17790a6394930`
**Branch**: `master`
**Repository**: `Shelfie`

## Research Question

Czy dla `first-product-intake` mozemy oprzec sie na gotowej bazie lub API produktow, zeby wyszukiwac kosmetyki po nazwie albo barcode i jednoczesnie zachowac flow z `context/foundation/architecture-notes.md`:

- najpierw lookup w naszej bazie,
- potem zewnetrzne zrodlo,
- potem fallback AI / photo / manual,
- zawsze z potwierdzeniem usera przed zapisem.

## Summary

Tak: najlepszym kandydatem na primary source dla MVP jest **Open Beauty Facts**. To jedyne zweryfikowane zrodlo, ktore sensownie spina trzy wymagania naraz: lookup po barcode, lookup po nazwie i dostep do danych kosmetycznych z ingredient/INCI payloadem. To dobrze pasuje do obecnej architektury, bo `architecture-notes.md` i PRD juz zakladaja OBF jako glowny external lookup layer (`context/foundation/architecture-notes.md:61-79`, `context/foundation/prd.md:71-77`).

Najlepsza strategia na MVP to:

1. Wlasna baza `products` jako pierwszy lookup.
2. **Open Beauty Facts** jako glowny zewnetrzny provider.
3. User confirmation przed zapisem jako twardy guardrail.
4. AI web search / photo extraction / manual entry jako fallback, nie jako primary source.
5. Opcjonalnie pozniej **CosIng** jako ingredient reference layer i komercyjny fallback typu **Barcode Lookup** tylko jesli coverage OBF okaze sie za slabe.

Najwazniejszy wniosek techniczny: problemem nie jest brak potencjalnego API, tylko to, ze repo nie ma jeszcze wdrozonego intake flow ani rozszerzonego kontraktu `products`. Kod ma tylko stub shared product record i per-user shelf membership, wiec dowolny provider musi wejsc przez nowy serwerowy write path i zapis provenance/confidence (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-17`, `:289-315`).

## Detailed Findings

### 1. Repo juz zaklada OBF-first architecture

- Aktualna architektura produktu wprost mowi: po missie we wlasnej bazie aplikacja ma pytac **Open Beauty Facts**, a dopiero potem przechodzic do AI web search lub zdjecia etykiety (`context/foundation/architecture-notes.md:61-79`).
- PRD potwierdza ten sam cascade jako requirement `FR-004`: internal DB -> Open Beauty Facts -> AI web search / photo extraction -> manual entry (`context/foundation/prd.md:71-77`).
- Roadmap dla `S-02 first-product-intake` zaklada shared source lookup, barcode lookup i manual/AI fallback, ale ostrzega, zeby nie rozszerzyc tego slice'a do pelnego backend integration project (`context/foundation/roadmap.md:108-118`, `:81-92`).

W praktyce oznacza to, ze wybor OBF nie jest nowym pomyslem, tylko potwierdzeniem juz przyjetego direction.

### 2. Kod nie ma jeszcze intake integration, tylko foundation pod shared products

- Tabela `public.products` istnieje, ale jest tylko stubem z `id`, `created_at`, `updated_at` bez pol typu `name`, `brand`, `category`, `inci_list`, `image_url`, `inci_source`, `inci_confidence` (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-17`).
- Komentarz w migracji potwierdza, ze to tylko "Shared product identity stub for future shared product metadata" (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:54`).
- Authenticated users maja na `products` tylko `select`; nie ma runtime write path dla normalnego klienta (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315`).
- Domain layer umie jedynie dodac `product_id` na polke usera, zakladajac ze rekord produktu juz istnieje (`src/lib/domain/user-domain.ts:368-383`).
- Nie ma jeszcze endpointow `src/pages/api/products/*`, lookup klienta OBF, barcode search, ani confirmation UX.

To wazne dla decyzji: nawet najlepsze API nie bedzie po prostu "podlaczone", dopoki nie powstanie foundation pod shared product metadata i trusted server-side create/update flow.

### 3. Open Beauty Facts jest najlepszym verified MVP source

- Oficjalne materialy OBF i zweryfikowane endpointy potwierdzaja lookup po barcode na `product/{barcode}.json` oraz dostep do ingredient data (`ingredients_text`, `ingredients_tags`) w odpowiedzi produktu.
- Official docs potwierdzaja, ze search po nazwie istnieje, ale pelnotekstowy search nie jest jeszcze first-class w v2/v3 i trzeba uzyc legacy `/cgi/search.pl` albo nowszego Search-a-licious search layer.
- OBF jest kosmetycznie wyspecjalizowane, a nie ogolnoretailowe, co dobrze pasuje do Shelfie, gdzie kluczowa wartoscia sa INCI i provenance, nie pelny katalog e-commerce.
- OBF jest open-data, co obniza koszt MVP, ale ma reuse caveat: production use jest akceptowalny dopoki `1 API call = 1 real scan by a user`; nie nadaje sie do hurtowego scrapingu.

To spina sie z architektura Shelfie lepiej niz API ogolnoretailowe, bo produkt potrzebuje nie tylko nazwy i brandu, ale tez ingredient payloadu do dalszej interpretacji.

### 4. Inne opcje istnieja, ale gorzej pasuja jako primary source

#### Barcode Lookup

- Daje barcode + name/title search i ma w API pole `ingredients`.
- Jest komercyjne, z limitem ok. `100 requests/minute` i kosztem od ok. `$99/mo`.
- Terms sa wyraznie bardziej restrykcyjne niz w open-data source i wymagaja ostroznosci przy przechowywaniu/retencji danych.

Wniosek: sensowny jako paid fallback, jesli OBF coverage zawiedzie, ale nie jako domyslny backbone MVP.

#### UPCitemdb

- Daje lookup po barcode i search po frazie.
- Dobrze nadaje sie do barcode-to-title bootstrapu.
- W oficjalnie zweryfikowanych docs nie bylo jasnego, twardego potwierdzenia supportu dla ingredient/INCI data.

Wniosek: za slabe jako primary cosmetic source, bo Shelfie potrzebuje ingredient-aware intake.

#### Amazon SP-API i podobne retail APIs

- Moga dawac duzy katalog i search capability.
- Sa ciezsze integracyjnie, maja auth/compliance overhead i nie sa ingredient-first.

Wniosek: zbyt ciezkie na MVP i slabo dopasowane do problemu Shelfie.

#### CosIng

- To bardzo mocne zrodlo ingredient-level reference od Komisji Europejskiej.
- Nie jest baza produktow i nie rozwiązuje lookupu po barcode ani po nazwie produktu.

Wniosek: dobry companion source do walidacji/normalizacji skladnikow, ale nie zastapi OBF.

### 5. Najlepszy fit do architecture-notes to OBF + confirmed fallback pipeline

`architecture-notes.md` opisuje intake jako provenance-aware flow, a nie "automatyczny import produktow". To oznacza, ze provider ma wspierac nie tylko search, ale tez wiarygodne `inci_source` i `inci_confidence` (`context/foundation/architecture-notes.md:243-264`).

OBF dobrze pasuje do tego modelu, bo:

- dostarcza dane kosmetyczne,
- moze byc oznaczone jako `open_beauty_facts` z `high` confidence zgodnie z juz spisana architektura (`context/foundation/architecture-notes.md:251-258`),
- naturalnie wchodzi jako external source pomiedzy internal DB a AI/manual fallback,
- pozwala budowac shared product reuse, co jest jednym z glownych powodow istnienia `products` jako global table (`context/foundation/prd.md:119-125`).

### 6. Istnieje jedna wazna sprzecznosc dokumentacyjna

- `shape-notes.md` ma starszy, wezszy framing: manual entry + lightweight image AI assistance, bez ambicji na szerszy barcode/search scope (`context/foundation/shape-notes.md:91-104`, `:151-155`).
- Nowsze dokumenty, czyli PRD i roadmap, rozszerzaja scope o product search, barcode lookup i OBF-driven cascade (`context/foundation/prd.md:71-77`, `context/foundation/roadmap.md:108-118`).

Na potrzeby decyzji architektonicznej obecnym source of truth wygladaja PRD + roadmap, ale to jest warte odnotowania przy planowaniu, bo barcode scope byl wczesniej traktowany jako kandydat do odciecia.

## Code References

- `context/foundation/architecture-notes.md:57-81` - Docelowy flow intake: internal DB, OBF, AI/photo, manual, potem confirmation before save.
- `context/foundation/architecture-notes.md:87-101` - Docelowy shared product contract, w tym `inci_source` i `inci_confidence`.
- `context/foundation/architecture-notes.md:243-264` - Mapowanie source confidence dla `open_beauty_facts`, `photo_vision`, `manual`, `ai_web_search`.
- `context/foundation/prd.md:44-45` - AI-assisted adding nie moze zapisac produktu bez potwierdzenia usera.
- `context/foundation/prd.md:71-77` - `FR-004` definiuje cascade z OBF jako primary external source.
- `context/foundation/prd.md:119-125` - `FR-016` i `FR-017` wymagaja shared-source search i confirmed-product reuse.
- `context/foundation/roadmap.md:81-92` - `F-02` ma byc minimalnym provenance contractem, bez rozwiazywania wszystkich import sources.
- `context/foundation/roadmap.md:108-118` - `S-02` ma zostac focused on trusted intake i first persisted shelf item.
- `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-17` - Aktualna tabela `products` jest tylko stubem.
- `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:54-60` - Komentarze migracji potwierdzaja future shared metadata intent.
- `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315` - Runtime users maja tylko read access do `products`; potrzebny bedzie trusted write path.
- `src/lib/domain/user-domain.ts:131-137` - `UserShelfItem` trzyma tylko `productId` reference.
- `src/lib/domain/user-domain.ts:354-383` - Domain layer obsluguje shelf membership, ale nie tworzy shared products.
- `context/foundation/infrastructure.md:15-18` - Runtime target to Cloudflare Workers, wiec integracja z providerem powinna byc fetch-first i Worker-compatible.

## Architecture Insights

- Shelfie potrzebuje **ingredient-aware product source**, nie tylko retail catalog. To od razu eliminuje wiele zwyklych barcode APIs jako glowny backbone.
- Obecna architektura jest **confirmation-first**, wiec nawet slabsze lub niepelne zrodlo moze byc uzyteczne, jesli user zawsze akceptuje wynik przed zapisem.
- Provider musi byc obslugiwany **server-side**, bo repo nie ma klientowskiego write access do `products`, a sekrety powinny zostac po stronie serwera (`supabase/migrations/20260530090000_user_domain_persistence_contract.sql:289-315`, `AGENTS.md:5-9`).
- Z perspektywy kosztu i scope `S-02`, najwazniejsze jest dowiezienie jednego dobrego primary source oraz solidnych fallbackow, a nie maksymalizacja coverage przez wiele rownoleglych integracji.
- Cloudflare Workers jako runtime wzmacnia preference dla prostych HTTP integrations przez `fetch`, a nie ciezkich Node-only SDK (`context/foundation/infrastructure.md:60-64`, `:91-95`).

## Historical Context (from prior changes)

- `context/archive/2026-05-30-user-domain-persistence-contract/plan.md` - Wczesniejszy foundation slice celowo nie implementowal intake flows, search, barcode ani AI extraction; zostawil `products` jako reference anchor pod przyszle shared metadata.
- `context/archive/2026-05-31-first-skin-profile/plan.md` - Onboarding mial konczyc sie empty shelf, zeby product intake zostal osobnym nastepnym slice'em.
- `context/foundation/shape-notes.md:91-104` - Starsza wersja scope ograniczala intake bardziej do manual + image assistance.
- `context/foundation/prd.md:71-77` - Nowszy source of truth rozszerzyl ten scope do product search + barcode + OBF cascade.

## Related Research

- Brak osobnych, wczesniejszych `research.md` dla `first-product-intake`.
- Najblizszy kontekst architektoniczny i produktowy jest w:
  - `context/foundation/architecture-notes.md`
  - `context/foundation/prd.md`
  - `context/foundation/roadmap.md`
  - `context/archive/2026-05-30-user-domain-persistence-contract/plan.md`

## Recommendation

### MVP recommendation

Uzyc **Open Beauty Facts jako primary external source** dla `first-product-intake`.

### Why

- Jest juz zgodne z obecna architektura i PRD.
- Ma najlepszy verified fit do lookupu po barcode + name + ingredient payload.
- Jest darmowe/open-data, co pasuje do MVP.
- Pozwala zachowac prosty, zrozumialy provenance model: `open_beauty_facts` -> `high` confidence.

### Suggested fallback strategy

1. Internal `products` lookup po canonical/shared records.
2. OBF lookup po barcode lub nazwie.
3. Jesli OBF nie ma wystarczajacych danych INCI:
   - AI web search
   - photo extraction
4. Manual correction / manual entry jako final fallback.
5. Pozniej, jesli coverage bedzie zbyt slabe:
   - dodac `CosIng` do ingredient normalization,
   - rozwazyc komercyjny fallback typu `Barcode Lookup` dla lepszego hit-rate barcode/title.

## Open Questions

- Czy barcode lookup ma pozostac twardym MVP requirementem dla `S-02`, czy przy nacisku na scope mozna go zdegradowac do partial support lub delayed path, biorac pod uwage starszy narrower framing w `shape-notes.md`?
- Jak dokladnie chcemy mapowac wynik OBF do przyszlego canonical product identity: po samym barcode, po normalized `brand + name`, czy po obu?
- Czy chcemy juz w `S-02` dodawac ingredient normalization layer, czy wystarczy zapis raw `inci_list` i provenance, a enrichment zrobic pozniej?

# Raport architektoniczny — moduł 4 / 10xArchitect

## 1. Opisane projekty

| Repozytorium | Artefakty | Stack i skala orientacyjna (wyłącznie z artefaktów) |
| --- | --- | --- |
| `opay-adnew` | L2 mapa, L3 research CICO refund, L4 plan refaktoryzacji | Legacy panel administracyjny Vue 2. W badanym `src` ma wspólny klient HTTP, Vuex, router i widoki; L4 dokumentuje 45 modułów API korzystających z `request` oraz 19 konsumentów `routeQueryPage`. |
| `Shelfie` | L5 notatki domenowe/DDD | Server-first: Astro 6, React 19 islands, TypeScript, Tailwind 4, Supabase i Cloudflare Workers. Artefakt ACL rozpoznaje 6 warstw oraz 36 plików runtime/typów i 3 testy znające Supabase. |

## 2. Mapa projektu (L2: `opay-adnew`)

- Największe ryzyko jest w pętli `views → api → request → router → views`: 384 z 411 zgłoszeń cykli obejmowało równocześnie `request.js` i `router/index.js`.
- Lokalne centra to `router`, `utils/request`, `store` i `layout`; ich wpływ przekracza granice feature’ów. Entry pointy do zrozumienia systemu to kolejno `request.js`, router i moduły permission/user store.
- Transaction/refund to aktywna strefa ryzyka: refund współzmieniał się z transaction w całym badanym oknie, a `cico-detail.vue` jest historycznym hotspotem.
- Granice feature’ów są nieszczelne: agent używa agent-sales, komponent shared zależy od merchant view, a standardowe i iframe’owe warianty merchant/agent/funds są utrzymywane równolegle.
- Backend, runtime i zależności niewidoczne dla grafu importów są **unknown**, nie są dowodem braku powiązania.

## 3. Analiza ficzera (L3: `opay-adnew`)

Badano inicjowanie refundu CICO z widoku szczegółu transakcji. Wybrano go, bo L2 wskazuje [transaction/refund jako strefę ryzyka nr 2](/Users/mradosiewicz/Desktop/projects/opay-adnew/context/map/repo-map.md) i `cico-detail.vue` jako hotspot.

Lista CICO przekazuje `orderNo` i `checkoutNo` w query do detailu; widok pobiera szczegół przez `cicoDetail({ orderNo })`. Przycisk refundu zależy od `isRefund`, `orderStatus`, `orderNo` i uprawnienia UI. Po potwierdzeniu widok wysyła `cicoOrderRefund({ orderNo })`, komunikuje sukces, zamyka dialog i ponownie pobiera detail; oba requesty dziedziczą globalne efekty klienta HTTP (sesja, redirect, komunikaty, locale).

Najważniejszy dług: (1) UI interpretuje nieudokumentowaną w repo semantykę statusów; backendowa kwalifikacja, idempotencja i pełne znaczenie statusów są **unknown**. (2) Nie znaleziono lokalnych testów ścieżki ani lokalnego e2e, a coverage nie obejmuje views, API, routera ani mixinów. (3) Query/keep-alive zwiększa ryzyko starych danych lub zdublowanego odczytu. Ast-grep potwierdził strukturę tego sprzężenia: dokładnie dwa wywołania `getData()` w komponencie (mount i sukces refundu), dodatkowe wywołanie z mixinu przy zmianie query oraz po jednym call-site `cicoDetail({ orderNo })` i `cicoOrderRefund({ orderNo })`.

## 4. Plan refaktoryzacji (L4: `opay-adnew`, status: `planned`)

Aktywny plan wybiera C1 z lokalnym pilotem C7: transport `request` ma zależeć od neutralnego portu efektów konfigurowanego w bootstrapie, a CICO jawnie odróżnia błąd sesji od błędu domain/transport. Zachowane są default export Axios, API wrappers i kontrakty endpointów. C2 (factory iframe routes) i C8 (19 widoków query lifecycle) są odroczone do osobnych zmian.

Świadomie poza zakresem: semantyka CICO/refundu, rozdzielenie refund–transaction, unifikacja standard/iframe, przenoszenie batch/`ChangeImg`, C2/C8, query-aware cache/TagsView oraz naprawa legacy baseline testów, lintu i CI.

| Faza | Zakres i weryfikacja |
| --- | --- |
| 1 | Charakterystyka request/permission/query lifecycle i baseline — testy targetowane, baseline, `diff --check`. |
| 2 | C1: port efektów + adapter bootstrapu — testy, guardrail zależności, lint/build; ręczny smoke sesji/SSO/loadingu. |
| 3 | C7: lokalna prezentacja błędu, pilot CICO — testy global/local i ręczny smoke komunikatu/redirectu. |

## 5. Domena wg DDD (L5: `Shelfie`)

Ubiquitous language: **skin context** (profil personalizacji), **canonical product** (globalna tożsamość produktu), **shelf item** (prywatne członkostwo produktu), **routine role** (funkcja w kroku rutyny) i **full-routine AI assessment**. Najważniejsze rozjazdy model–kod: PRD oczekuje automatycznej roli produktu, kod przypisuje ją do wpisu rutyny; `Use only today`, check-ins oraz model ingredient groups/deterministic triggers mają status **BRAK w kodzie**; obecny pełny verdict kompatybilności tworzy AI.

Niezmiennik #1 należy do agregatu **`PersonalizedRoutine`**: każda zaakceptowana mutacja rutyny ma najpierw otrzymać deterministyczną ocenę tej samej rewizji na owned products i ich ingredient groups, a rutyna z raportem zapisują się atomowo. Warnings są advisoryjne, ale niemożność wykonania oceny blokuje zapis; AI może tylko objaśniać finding. **BRAK artefaktu:** konkretnego oracle grup i reguł do implementacji.

ACL: krytycznie przecieka Supabase SDK/SSR — w sześciu warstwach; artefakt liczy 36 plików runtime/typów i 3 testy. Typ `SupabaseClient`, query DSL i rezultaty vendora są w pięciu plikach domenowych, a API/SSR tworzą i przekazują klienta; docelowo SDK ma znać wyłącznie `src/lib/infrastructure/supabase/**`, za portami/repozytoriami.

## 6. Decyzje, które należą do mnie

AI wskazało C1, C2 i C8 jako najwyżej ocenione kierunki; wybieram jednak tylko C1 z pilotem C7 jako pierwszy, wąski change, a C2/C8 odkładam do osobnych zmian, by nie łączyć trzech globalnych blast radiusów. W CICO wybieram jawne rozróżnienie błędu sesji od błędu domain/transport, aby globalny redirect nie wywołał drugiego lokalnego komunikatu. Factory iframe pozostaje po stronie routera wyłącznie jako materializacja już przefiltrowanego modelu; dokumentuję to jako ograniczony wyjątek od lokalnej reguły. Najpierw realizuję osobny fix prywatności zdjęć, a po nim `PersonalizedRoutine`, bo bezpieczeństwo danych jest twardym wymaganiem, a agregat pozostaje najważniejszym refaktorem domenowym.

### Artefakty źródłowe

- L2: `/Users/mradosiewicz/Desktop/projects/opay-adnew/context/map/repo-map.md`
- L3: `/Users/mradosiewicz/Desktop/projects/opay-adnew/context/changes/cico-refund-flow/research.md`
- L4: `/Users/mradosiewicz/Desktop/projects/opay-adnew/context/changes/refactor-opportunities/plan.md`
- L5: `context/domain/01-domain-distillation.md`, `context/domain/02-invariant-aggregate-refactor.md`, `context/domain/03-anti-corruption-layer.md`

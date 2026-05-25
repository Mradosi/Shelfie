---
project: shelfie
created_at: 2026-05-25
based_on: context/foundation/infrastructure.md
recommended_platform: Cloudflare Workers
status: draft
---

# Deploy Plan

## Cel dokumentu

Ten dokument opisuje plan integracji i pierwszego deploymentu aplikacji Shelfie na `Cloudflare Workers`, zgodnie z decyzją zapisaną w `context/foundation/infrastructure.md`.

Plan jest operacyjny: każda faza ma checklistę, kryteria gotowości oraz dodatkowe kroki wsparcia dla edge case'ów. Priorytetem jest bezpieczne uruchomienie auth opartego o `Supabase`, utrzymanie spójności sekretów i uniknięcie błędów wynikających z mieszania ścieżki `Workers` z przestarzałą ścieżką `Pages`.

## Stan wyjściowy

- [x] Repo używa `@astrojs/cloudflare` i jest skonfigurowane pod `Cloudflare Workers`.
- [x] `wrangler.jsonc` wskazuje entrypoint Workers oraz assety z `./dist`.
- [x] Aplikacja działa w trybie SSR (`output: "server"`).
- [x] Auth używa `@supabase/ssr` po stronie serwera.
- [x] Middleware chroni `/dashboard`.
- [x] CI uruchamia `npx astro sync`, `npm run lint`, `npm run build`.
- [ ] Środowiska `preview` i `production` nie mają jeszcze opisanej, spisanej polityki sekretów i redirectów.
- [ ] Flow potwierdzania emaila i resetu hasła wymaga świadomego domknięcia przed publicznym release.

## Zasady wykonawcze

- [ ] Traktować `Cloudflare Workers` jako jedyny docelowy runtime deploymentu.
- [ ] Nie używać `Cloudflare Pages` ani `wrangler pages` w tym projekcie.
- [ ] Rozdzielać rollback kodu od rollbacku danych i konfiguracji auth w Supabase.
- [ ] Utrzymywać jeden jawny source of truth dla sekretów per środowisko.
- [ ] Każdy deploy dotykający auth musi kończyć się smoke testem ręcznym.
- [ ] Integracje AI wdrażać dopiero po ustabilizowaniu auth i observability.

## Prerequisites

### Cel

Przygotować lokalne środowisko, CLI i dostęp do usług zewnętrznych tak, aby zespół mógł przejść przez dalsze fazy bez blokad środowiskowych.

### Narzędzia lokalne

- [ ] Zainstalować `Node.js` zgodny z repo.
- [ ] Potwierdzić wersję z `.nvmrc` i uruchamiać projekt na tej wersji.
- [ ] Mieć zainstalowane `npm`.
- [ ] Mieć zainstalowanego `git`.
- [ ] Mieć działający Docker-compatible runtime dla lokalnego Supabase:
  - Docker Desktop
  - albo OrbStack
  - albo inny zgodny runtime kontenerów

### Sanity checks lokalnego środowiska

- [ ] `node -v`
- [ ] `npm -v`
- [ ] `git --version`
- [ ] Docker lub alternatywa uruchamia kontenery lokalnie

### Cloudflare CLI i dostęp do platformy

- [ ] Założyć konto Cloudflare, jeśli jeszcze go nie ma:
  - wejść na `https://dash.cloudflare.com/sign-up/workers-and-pages`
  - utworzyć konto przez email i hasło albo dostępny provider logowania
  - potwierdzić adres email, jeśli Cloudflare tego wymaga
- [ ] Po pierwszym logowaniu wejść do dashboardu Cloudflare i sprawdzić, czy konto otwiera się poprawnie.
- [ ] Wejść do sekcji `Workers & Pages` w dashboardzie.
- [ ] Skonfigurować własny `workers.dev` subdomain w dashboardzie, jeśli Cloudflare o to poprosi.
- [ ] Zrozumieć rolę `workers.dev`:
  - to techniczny adres testowy typu `<worker-name>.<subdomain>.workers.dev`
  - przydaje się do pierwszych deployów i smoke testów
  - nie powinien być traktowany jako finalna domena produkcyjna dla biznesowej aplikacji
- [ ] Potwierdzić, że `wrangler` jest zainstalowany lokalnie w projekcie jako dev dependency.
- [ ] Zrozumieć, jak uruchamiamy `wrangler` w tym repo:
  - przez `npx wrangler ...`
  - nie zakładamy globalnej instalacji CLI
- [ ] Sprawdzić wersję `wrangler`:
  - `npx wrangler --version`
- [ ] Zalogować się do Cloudflare z terminala:
  - `npx wrangler login`
- [ ] Po uruchomieniu logowania dokończyć autoryzację w przeglądarce.
- [ ] Jeśli logowanie przez przeglądarkę się powiedzie, wrócić do terminala i sprawdzić status konta:
  - `npx wrangler whoami`
- [ ] Potwierdzić, że `whoami` pokazuje właściwe konto Cloudflare.
- [ ] Upewnić się, że osoba deployująca ma dostęp do właściwego konta Cloudflare oraz projektu Worker.
- [ ] Upewnić się, że konto ma uprawnienia do:
  - deployu Worker-a
  - odczytu logów
  - zarządzania sekretami dla tego projektu

### Cloudflare od zera krok po kroku

- [ ] Otworzyć dashboard: `https://dash.cloudflare.com/`
- [ ] Utworzyć konto lub zalogować się na istniejące.
- [ ] Przejść do `Workers & Pages`.
- [ ] Jeśli to pierwsze użycie platformy, zaakceptować podstawowy onboarding Workers.
- [ ] Ustawić własny `workers.dev` subdomain, jeśli platforma wymaga wyboru subdomeny.
- [ ] Zapamiętać, że nazwa Worker-a z `wrangler.jsonc` wpływa na końcowy adres `workers.dev`.
- [ ] Zrozumieć podstawowy model pracy:
  - `wrangler dev` uruchamia lokalny runtime developerski
  - `wrangler deploy` publikuje aplikację do Cloudflare
  - po deployu aplikacja może być dostępna przez `workers.dev` lub custom domain
- [ ] Wykonać pierwszy bezpieczny test konta przez komendę tylko odczytową:
  - `npx wrangler whoami`
- [ ] Nie wykonywać produkcyjnego deployu, dopóki nie są ustawione sekrety i redirecty auth.

### Co oznacza logowanie do Cloudflare w praktyce

- [ ] `npx wrangler login` otwiera przeglądarkę i łączy lokalny terminal z kontem Cloudflare.
- [ ] Po poprawnym logowaniu `wrangler` może wykonywać deploye, odczytywać informacje o koncie i zarządzać zasobami zgodnie z uprawnieniami.
- [ ] Logowanie jest per użytkownik i per maszyna, więc nowy laptop wymaga ponownej autoryzacji.
- [ ] To, że aplikacja buildzi się lokalnie, nie oznacza jeszcze, że konto Cloudflare jest poprawnie podpięte.

### Jak myśleć o `workers.dev`

- [ ] `workers.dev` to szybki techniczny adres publikacji bez konfiguracji własnej domeny.
- [ ] Jest dobry do:
  - pierwszego deployu
  - smoke testów
  - weryfikacji, czy Worker działa po stronie Cloudflare
- [ ] Nie jest docelową domeną produktu.
- [ ] Jeśli kiedyś `workers.dev` zostanie wyłączone w dashboardzie, a `wrangler.jsonc` nie ma `workers_dev: false`, kolejny deploy może je znowu włączyć.

### Support steps dla Cloudflare CLI

- [ ] Jeśli `npx wrangler` używa innej wersji niż oczekiwana przez repo, wykonać `npm install` i ponownie sprawdzić wersję.
- [ ] Jeśli logowanie otwiera złe konto Cloudflare, wylogować się i powtórzyć autoryzację na właściwym koncie.
- [ ] Jeśli uprawnienia nie pozwalają na deploy lub secrets, nie obchodzić problemu kontem admin bez potrzeby; nadać scoped access do konkretnego projektu.
- [ ] Jeśli `npx wrangler login` nie otwiera przeglądarki albo autoryzacja zawiesza się po drodze, sprawdzić domyślną przeglądarkę i powtórzyć logowanie.
- [ ] Jeśli konto Cloudflare istnieje, ale nie widać `Workers & Pages`, sprawdzić, czy użytkownik jest na właściwym koncie lub workspace.
- [ ] Jeśli po deployu aplikacja nie ma adresu `workers.dev`, sprawdzić konfigurację subdomeny w dashboardzie oraz nazwę Worker-a.
- [ ] Jeśli deploy działa, ale URL publiczny zwraca błędy chwilę po pierwszej publikacji, dać platformie krótką chwilę na propagację pierwszego `workers.dev` endpointu.

### Instalacja i konfiguracja Supabase CLI

- [ ] Zdecydować, czy zespół używa:
  - lokalnej zależności `supabase` z repo przez `npx supabase`
  - czy globalnej instalacji przez Homebrew
- [ ] Dla macOS preferować jedną z dwóch ścieżek:
  - `brew install supabase/tap/supabase`
  - albo używanie wersji z repo przez `npx supabase`
- [ ] Nie instalować Supabase CLI przez `npm install -g supabase`, bo ta ścieżka nie jest wspierana.
- [ ] Sprawdzić wersję CLI:
  - `npx supabase --help`
  - albo `supabase --help`, jeśli używana jest wersja globalna z Homebrew

### Lokalny Supabase

- [ ] Upewnić się, że w repo istnieje katalog `supabase/`.
- [ ] Jeśli środowisko lokalne ma być uruchamiane od zera, wystartować stack:
  - `npx supabase start`
- [ ] Spisać lokalne wartości wypisane przez CLI:
  - `Project URL`
  - `Publishable` lub zgodny klucz używany w aplikacji
  - URL Studio
  - URL Mailpit
- [ ] Utrzymać `supabase/config.toml` pod kontrolą wersji jako źródło lokalnej konfiguracji.

### Lokalne sekrety aplikacji

- [ ] Skopiować `.env.example` do `.env`, jeśli plik nie istnieje.
- [ ] Skopiować `.env.example` do `.dev.vars`, jeśli plik nie istnieje.
- [ ] Uzupełnić lokalne wartości:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- [ ] Jeśli AI ma być testowane lokalnie, uzupełnić też `OPENROUTER_API_KEY` w lokalnym źródle sekretów.
- [ ] Potwierdzić, że żadne realne sekrety nie trafiają do commita.

### Support steps dla lokalnego Supabase

- [ ] Jeśli `supabase start` nie działa, najpierw sprawdzić Docker runtime i wolne zasoby, a nie sam kod aplikacji.
- [ ] Jeśli lokalny stack uruchamia się wolno, pamiętać, że pierwszy start pobiera obrazy kontenerów.
- [ ] Jeśli auth lokalny nie działa mimo uruchomionego stacka, porównać wartości z `supabase start` z `.env` i `.dev.vars`.
- [ ] Jeśli zespół przechodzi na hostowany projekt Supabase zamiast lokalnego, jawnie oznaczyć to w dokumentacji środowiska.

### Dostęp do hostowanego projektu Supabase

- [ ] Upewnić się, że zespół ma dostęp do właściwego projektu Supabase.
- [ ] Spisać z dashboardu wartości potrzebne do aplikacji:
  - `SUPABASE_URL`
  - właściwy klucz używany przez aplikację
- [ ] Skonfigurować w Supabase podstawowe elementy auth przed testami preview/production:
  - `Site URL`
  - `Redirect URLs`
  - politykę email confirmation

### Support steps dla hostowanego Supabase

- [ ] Jeśli lokalnie wszystko działa, a hosted project nie, zacząć od porównania URL-i, redirectów i kluczy.
- [ ] Jeśli pojawia się wątpliwość, którego klucza używać w SSR flow, potwierdzić to jawnie w zespole i nie używać `service_role` do zwykłego auth.
- [ ] Jeśli preview ma korzystać z nieprodukcyjnego projektu Supabase, założyć go przed rozpoczęciem testów UAT, nie w trakcie release'u.

### Inne potrzebne konta i dostęp

- [ ] Upewnić się, że maintainer ma dostęp do repo GitHub i sekretów CI, jeśli bierze udział w deployu.
- [ ] Upewnić się, że maintainer ma dostęp do domeny lub do osoby zarządzającej DNS.
- [ ] Jeśli OpenRouter wchodzi do MVP, upewnić się, że klucz API i limit usage są gotowe przed integracją runtime.

### Minimalna checklista gotowości przed fazami deploymentu

- [ ] `npm install` zostało wykonane bez błędów.
- [ ] `npx wrangler --version` działa.
- [ ] `npx wrangler whoami` działa na właściwym koncie.
- [ ] `npx supabase start` działa albo świadomie używany jest hosted Supabase.
- [ ] `.env` i `.dev.vars` są skonfigurowane lokalnie.
- [ ] `npm run dev` uruchamia aplikację.
- [ ] Lokalne sign-in / sign-up mogą zostać przetestowane przed przejściem do preview lub production.

## Faza 0. Decyzje operacyjne i ownership

### Cel

Ustalić jeden sposób deployu, jeden model zarządzania sekretami i odpowiedzialności operacyjne.

### Checklist

- [ ] Wybrać primary deployment path:
  - `Wrangler CLI` jako główna ścieżka publikacji
  - albo `Workers Builds` jako główna ścieżka publikacji
- [ ] Nie mieszać deployów z CLI i ręcznych zmian w dashboardzie bez jawnej procedury.
- [ ] Ustalić ownera dla:
  - Cloudflare runtime
  - Supabase Auth
  - domeny i DNS
  - przyszłej integracji OpenRouter
- [ ] Ustalić, czy pierwszy production deploy wymaga formalnej akceptacji człowieka.
- [ ] Ustalić nazwę Worker-a jako nazwę operacyjną używaną w logach, rollbacku i tailingu.

### Definition of done

- [ ] Zespół wie, czy publikuje przez `npx wrangler deploy`, czy przez zintegrowany build Workers.
- [ ] Istnieje wskazany owner odpowiedzialny za incydenty auth i runtime.
- [ ] Nie ma w wewnętrznej dokumentacji odniesień sugerujących deploy przez `Pages`.

### Support steps

- [ ] Jeśli istnieją stare notatki o `Cloudflare Pages`, usunąć je albo oznaczyć jako nieaktualne.
- [ ] Jeśli ktoś wdraża z dashboardu, a ktoś inny z CLI, zatrzymać publikację do czasu ustalenia jednej ścieżki.
- [ ] Jeśli nazwa Worker-a różni się od nazwy repo, spisać to wprost, żeby uniknąć błędów w `wrangler tail`, `wrangler rollback` i `wrangler versions list`.

## Faza 1. Inwentaryzacja integracji zewnętrznych

### Cel

Ustalić, które zewnętrzne usługi są krytyczne dla działania aplikacji i jakim ryzykiem operacyjnym są obciążone.

### Checklist

- [ ] Spisać wszystkie integracje runtime używane dziś i planowane na MVP.
- [ ] Dla każdej integracji określić:
  - właściciela
  - środowiska użycia
  - sekret lub binding wymagany do działania
  - tryb awarii
  - wpływ na użytkownika
- [ ] Oznaczyć integracje jako `hard dependency` albo `soft dependency`.

### Aktualna lista integracji

- [x] `Supabase` jako integracja krytyczna dla auth i ochrony tras.
- [ ] `OpenRouter` jako planowana integracja server-side dla funkcji AI.
- [x] `Cloudflare Workers` jako runtime i warstwa logów/deployu.

### Zalecana klasyfikacja

- [ ] `Supabase`: hard dependency
- [ ] `OpenRouter`: soft dependency z kontrolowanym degraded mode
- [ ] `Cloudflare`: hard dependency platformowe

### Definition of done

- [ ] Każda integracja ma jawny owner, status i środowiska.
- [ ] Zespół wie, które awarie blokują release, a które tylko degradują funkcjonalność.

### Support steps

- [ ] Nie blokować pierwszego release na OpenRouter, jeśli nie ma jeszcze aktywnego flow AI w kodzie.
- [ ] Jeśli dojdą uploady, przetwarzanie plików albo background tasks, uruchomić osobny runtime review pod Workers.

## Faza 2. Polityka sekretów i konfiguracji środowisk

### Cel

Zapewnić spójne nazewnictwo, rotację i źródła sekretów dla `local`, `preview` i `production`.

### Checklist

- [ ] Utworzyć tabelę sekretów per środowisko.
- [ ] Ustalić, że nazwy zmiennych są identyczne między środowiskami.
- [ ] Ustalić źródła sekretów:
  - local: `.env` i `.dev.vars`
  - production: `wrangler secret put` albo `wrangler secret bulk`
  - CI: GitHub Secrets tylko wtedy, gdy build lub deploy tego wymaga
- [ ] Potwierdzić, które sekrety są build-time, a które runtime.
- [ ] Spisać procedurę rotacji sekretów.

### Minimalna macierz sekretów

#### Local

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_KEY`
- [ ] opcjonalnie `OPENROUTER_API_KEY`

#### Preview

- [ ] `SUPABASE_URL` dla środowiska nieprodukcyjnego albo jawnie zaakceptowany shared config
- [ ] `SUPABASE_KEY` dla środowiska nieprodukcyjnego
- [ ] opcjonalnie `OPENROUTER_API_KEY` dla preview

#### Production

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_KEY`
- [ ] `OPENROUTER_API_KEY`, gdy AI trafi do runtime produkcyjnego

### Definition of done

- [ ] Każde środowisko ma znany zestaw sekretów.
- [ ] Nie ma niejawnych sekretów ustawianych tylko w dashboardzie bez dokumentacji.
- [ ] Zespół wie, gdzie sprawdzać brakujący sekret.

### Support steps

- [ ] Jeśli lokalnie działa, a na produkcji nie, najpierw porównać sekrety runtime w Cloudflare, nie tylko `.env`.
- [ ] Jeśli CI przechodzi, ale runtime nie działa, pamiętać, że GitHub Secrets nie są tym samym co Workers secrets.
- [ ] Jeśli w dashboardzie zmieniono vars ręcznie, a kolejny deploy je nadpisał, przejść na jedną deklaratywną politykę konfiguracji.

## Faza 3. Supabase Auth readiness

### Cel

Domknąć konfigurację auth tak, aby login, signup, ochrona tras i przyszłe flow emaili działały poprawnie w local, preview i production.

### Checklist

- [ ] Potwierdzić docelowy model auth na MVP:
  - email + password
  - czy email confirmation jest wymagane
  - czy password reset jest wymagany
- [ ] Ustawić `Site URL` w Supabase na produkcyjny URL aplikacji.
- [ ] Skonfigurować `Redirect URLs` dla:
  - local
  - preview
  - production
- [ ] Zdecydować, czy preview ma mieć prawdziwe flow auth.
- [ ] Zweryfikować, czy dla włączonego email confirmation istnieje poprawny endpoint do obsługi token exchange / verify flow.
- [ ] Zweryfikować, czy dla resetu hasła istnieje gotowy plan obsługi `verifyOtp` i zmiany hasła.

### Current gap

- [ ] Aplikacja ma dziś prosty sign-up/sign-in/sign-out, ale nie ma jeszcze jawnie spiętego produkcyjnego flow potwierdzenia emaila i resetu hasła.

### Decision gate

- [ ] Wybrać jedną z dwóch ścieżek przed publicznym release:
  - wyłączyć email confirmation dla pierwszej iteracji MVP
  - albo wdrożyć pełny flow `confirm email` przed premierą

### Definition of done

- [ ] Sign-up działa zgodnie z polityką produktu.
- [ ] Redirecty auth nie wychodzą na złą domenę.
- [ ] Preview i production nie mieszają redirectów ani danych bez świadomej decyzji.

### Support steps

- [ ] Jeśli email confirmation wysyła użytkownika pod zły adres, najpierw sprawdzić `Site URL` i `Redirect URLs` w Supabase.
- [ ] Jeśli local działa, a preview nie działa, założyć najpierw błąd konfiguracji redirectów.
- [ ] Jeśli sesje znikają lub zachowują się niestabilnie, sprawdzić cookie handling i brak nadmiernego cache'owania odpowiedzi SSR.
- [ ] Jeśli rollout auth dotyka też konfiguracji Supabase, nie zakładać, że rollback Worker-a przywróci poprawny stan.

## Faza 4. Przygotowanie ścieżki deployu Cloudflare Workers

### Cel

Ustandaryzować build i deploy tak, aby odpowiadały obecnej konfiguracji repo i oficjalnej ścieżce Astro dla Workers.

### Checklist

- [ ] Zachować sekwencję weryfikacyjną przed deployem:
  - `npx astro sync`
  - `npm run lint`
  - `npm run build`
- [ ] Wykonywać deploy przez `npx wrangler deploy` lub zautomatyzowany odpowiednik w Workers Builds.
- [ ] Nie używać `wrangler pages`.
- [ ] Zweryfikować nazwę Worker-a w `wrangler.jsonc` przed pierwszą publikacją.
- [ ] Zweryfikować `compatibility_date` i aktualizować ją świadomie, a nie przypadkiem.
- [ ] Pozostawić `compatibility_flags` zgodne z potrzebami projektu, w tym `nodejs_compat` tylko tak długo, jak jest potrzebne.

### Recommended command path

- [ ] `npx astro sync`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npx wrangler deploy`

### Definition of done

- [ ] Deploy jest powtarzalny i zgodny z dokumentacją Astro/Cloudflare.
- [ ] Zespół nie opiera procesu na przestarzałych guide'ach Pages.

### Support steps

- [ ] Jeśli build lokalny przechodzi, ale runtime pada po deployu, sprawdzić Node-only dependency lub importy niekompatybilne z Workers.
- [ ] Jeśli pojawią się hydration mismatch po podpięciu domeny, sprawdzić ustawienia `Auto Minify` po stronie Cloudflare.
- [ ] Jeśli routing 404 zachowuje się inaczej niż oczekiwano, sprawdzić `assets.not_found_handling`.

## Faza 5. Strategia preview i środowisk nieprodukcyjnych

### Cel

Uruchomić preview w sposób użyteczny dla zespołu i bezpieczny dla auth.

### Checklist

- [ ] Zdecydować, czy preview jest środowiskiem technicznym, czy także UAT/biznesowym.
- [ ] Jeśli preview ma prawdziwy auth, użyć nieprodukcyjnych sekretów albo jawnie zaakceptowanego izolowanego modelu danych.
- [ ] Jeśli preview ma przyjmować realne linki auth, dodać odpowiednie redirect patterns w Supabase.
- [ ] Jeśli preview nie powinno być publicznie dostępne, rozważyć ochronę przez Cloudflare Access.
- [ ] Opisać różnice między preview i production:
  - dane
  - sekrety
  - domeny
  - redirecty

### Definition of done

- [ ] Preview ma znany model dostępu.
- [ ] Testy auth na preview nie wpływają nieświadomie na produkcję.

### Support steps

- [ ] Jeśli preview używa produkcyjnego Supabase bez świadomej decyzji, potraktować to jako ryzyko wysokie.
- [ ] Jeśli preview URL zmienia się per branch, dodać wildcard redirecty tylko dla non-prod; production powinno używać exact URL.
- [ ] Jeśli preview działa na `workers.dev`, a nie działa w innym wariancie preview URL, sprawdzić konfigurację preview builds oraz redirect allowlistę.

## Faza 6. CI/CD i bramki release

### Cel

Rozdzielić walidację kodu od walidacji integracji runtime i przygotować bezpieczny release flow.

### Checklist

- [ ] Zachować obecną bramkę CI:
  - `npx astro sync`
  - `npm run lint`
  - `npm run build`
- [ ] Dodać release checklistę operacyjną przed pierwszym production deployem.
- [ ] Ustalić, czy production publish jest manualny, czy zautomatyzowany po merge.
- [ ] Zdefiniować osobny gate dla zmian auth-related.
- [ ] Potwierdzić, że wszystkie wymagane sekrety istnieją przed publikacją.

### Recommended release policy for MVP

- [ ] Preview może być automatyczne.
- [ ] Pierwszy production deploy powinien być manual-approved.
- [ ] Rotacja sekretów, DNS i destrukcyjne akcje w Supabase pozostają human-only.

### Definition of done

- [ ] Release flow jest powtarzalny.
- [ ] Zespół wie, które kroki są automatyczne, a które wymagają człowieka.

### Support steps

- [ ] Jeśli build wymaga sekretów Supabase, upewnić się, że są to poprawne wartości dla build/test i nie są mylone z runtime config.
- [ ] Jeśli CI jest zielone, ale production nie działa, najpierw sprawdzić runtime secrets w Workers.
- [ ] Jeśli wdrożony zostanie Workers Builds, pamiętać, że build environment i runtime environment nie są tym samym.

## Faza 7. Smoke testy po deployu

### Cel

Zweryfikować, że aplikacja działa poprawnie po publikacji i że najważniejsze przepływy użytkownika nie zostały uszkodzone.

### Checklist

#### Podstawowy smoke test

- [ ] Strona główna ładuje się poprawnie.
- [ ] `/auth/signin` renderuje się i przyjmuje dane.
- [ ] `/auth/signup` renderuje się i przyjmuje dane.
- [ ] `/dashboard` bez sesji przekierowuje na `/auth/signin`.
- [ ] Sign-in tworzy poprawną sesję.
- [ ] Sign-out zamyka sesję.

#### Gdy email confirmation jest aktywne

- [ ] Signup wysyła email.
- [ ] Link w emailu trafia na poprawną domenę.
- [ ] Potwierdzenie kończy się poprawnym redirectem.

#### Gdy password reset jest aktywne

- [ ] Reset wysyła email.
- [ ] Link resetujący trafia na poprawny URL.
- [ ] Użytkownik może ustawić nowe hasło.

#### Gdy OpenRouter jest aktywne

- [ ] Pierwszy request AI działa end-to-end.
- [ ] Timeouty są obsługiwane kontrolowanym komunikatem.
- [ ] Sekret OpenRouter nie jest eksponowany do klienta.

### Definition of done

- [ ] Każdy krytyczny flow użytkownika przeszedł smoke test.
- [ ] Błędy z logów zostały przejrzane po pierwszym produkcyjnym deployu.

### Support steps

- [ ] Jeśli auth psuje się tylko na produkcji, porównać hostname, redirecty, sekrety i zachowanie cookies.
- [ ] Jeśli AI ma losowe timeouty, nie zakładać od razu błędu Workers; sprawdzić opóźnienia dostawcy zewnętrznego.
- [ ] Jeśli błędy są niereprodukowalne lokalnie, odpalić `wrangler tail` podczas ręcznego smoke testu.

## Faza 8. Observability, rollback i incident handling

### Cel

Przygotować podstawowy runbook operacyjny dla rollbacku, logów i pierwszej diagnostyki incydentów.

### Checklist

- [ ] Ustalić podstawowy zestaw poleceń operacyjnych:
  - `npx wrangler tail <worker-name>`
  - `npx wrangler versions list`
  - `npx wrangler deployments status`
  - `npx wrangler rollback`
- [ ] Dla każdego produkcyjnego deployu zapisać:
  - commit lub release point
  - datę i autora deployu
  - zmianę sekretów, jeśli wystąpiła
  - informację, czy zmieniano konfigurację Supabase
- [ ] Rozdzielić procedurę rollbacku:
  - kod Workers
  - konfiguracja auth w Supabase
  - ewentualne dane i migracje

### Definition of done

- [ ] Zespół zna minimalny runbook reakcji na błąd produkcyjny.
- [ ] Istnieje świadomość, że rollback kodu nie cofa zmian w Supabase.

### Support steps

- [ ] Jeśli problem wynika tylko z kodu, rollback Worker-a jest pierwszym ruchem.
- [ ] Jeśli problem wynika z redirectów, konfiguracji auth lub danych Supabase, rollback kodu może nie pomóc.
- [ ] Jeśli problem dotyczy tylko preview, nie wykonywać rollbacku production bez potwierdzenia wpływu.
- [ ] Jeśli wdrożono zmianę sekretów, rollback kodu nie przywróci poprzednich wartości sekretów.

## Faza 9. OpenRouter readiness

### Cel

Przygotować bezpieczne wdrożenie przyszłych funkcji AI bez psucia stabilności auth i edge runtime.

### Checklist

- [ ] Wprowadzać OpenRouter wyłącznie server-side.
- [ ] Utrzymywać klucz API wyłącznie jako sekret runtime.
- [ ] Zdefiniować timeouty, retry policy i degraded mode.
- [ ] Zaprojektować fallback UX, gdy provider AI nie odpowiada.
- [ ] Zmierzyć realną latencję całego flow, nie tylko samego edge runtime.
- [ ] Trzymać integrację przez mały adapter, bez rozlewania vendor-specific logiki po całej aplikacji.

### Definition of done

- [ ] AI nie blokuje podstawowych funkcji auth i nawigacji.
- [ ] Awaria OpenRouter nie degraduje całej aplikacji do stanu niedostępności.

### Support steps

- [ ] Jeśli provider AI zwraca 429 lub 5xx, aplikacja ma kończyć flow kontrolowanym błędem, nie wyjątkiem bez obsługi.
- [ ] Jeśli nowa funkcja AI wymaga Node-only bibliotek do przetwarzania plików, wykonać runtime review przed merge.
- [ ] Jeśli logowane są prompty lub odpowiedzi, sprawdzić ryzyko PII i treści wrażliwych.

## Faza 10. Go-live checklist

### Checklist końcowa

- [ ] Worker jest osiągalny przez `workers.dev`.
- [ ] Sekrety produkcyjne istnieją w Cloudflare.
- [ ] `SUPABASE_URL` i `SUPABASE_KEY` są poprawne dla produkcji.
- [ ] `Site URL` w Supabase wskazuje produkcyjny adres aplikacji.
- [ ] `Redirect URLs` w Supabase obejmują local, preview i production zgodnie z polityką.
- [ ] Auth smoke test przeszedł.
- [ ] Ochrona `/dashboard` działa poprawnie.
- [ ] Runbook rollbacku jest znany i gotowy.
- [ ] Log tail i podgląd wersji zostały sprawdzone operacyjnie.
- [ ] Właściciel incydentu produkcyjnego jest wskazany.

### Release candidate gate

- [ ] Build green
- [ ] Lint green
- [ ] Deploy green
- [ ] Auth green
- [ ] Protected routes green
- [ ] Observability green
- [ ] Rollback readiness green

## Najważniejsze edge case'y

### 1. Redirect mismatch w Supabase

- [ ] Sprawdzić `Site URL`.
- [ ] Sprawdzić `Redirect URLs`.
- [ ] Sprawdzić, czy host preview różni się od hosta produkcyjnego.
- [ ] Sprawdzić, czy flow wymaga endpointu do `verifyOtp`.

### 2. Pomylenie Workers z Pages

- [ ] Sprawdzić, czy deploy nie używa `wrangler pages`.
- [ ] Sprawdzić, czy dokumentacja zespołu nie prowadzi na przestarzałą ścieżkę.

### 3. Sekrety istnieją w CI, ale nie istnieją w runtime

- [ ] Sprawdzić `wrangler secret list`.
- [ ] Sprawdzić aktywne środowisko i nazwę Worker-a.
- [ ] Porównać local, CI i production runtime.

### 4. Rollback nie naprawia problemu auth lub danych

- [ ] Sprawdzić zmiany w Supabase Auth.
- [ ] Sprawdzić ewentualne zmiany danych i konfiguracji.
- [ ] Rozdzielić incident code od incident config/data.

### 5. Niekompatybilność biblioteki z Workers

- [ ] Sprawdzić importy Node-only.
- [ ] Zweryfikować zgodność biblioteki z Workers/Web APIs.
- [ ] W razie potrzeby wymienić pakiet albo wydzielić logikę poza edge path.

### 6. Preview uderza w dane produkcyjne

- [ ] Sprawdzić, z jakich sekretów korzysta preview.
- [ ] Ograniczyć preview access lub wydzielić środowisko danych.
- [ ] Dodać politykę testowych kont i testowych emaili.

## Runbook operacyjny

### Weryfikacja przed deployem

- [ ] `npx astro sync`
- [ ] `npm run lint`
- [ ] `npm run build`

### Deploy

- [ ] `npx wrangler deploy`

### Diagnostyka

- [ ] `npx wrangler tail <worker-name>`
- [ ] `npx wrangler versions list`
- [ ] `npx wrangler deployments status`

### Rollback

- [ ] `npx wrangler rollback`

### Sekrety

- [ ] `npx wrangler secret list`
- [ ] `npx wrangler secret put KEY`

## Rekomendowana kolejność realizacji

- [ ] Najpierw domknąć politykę auth i redirectów Supabase.
- [ ] Następnie ustalić jedną ścieżkę deployu na Workers.
- [ ] Potem spisać macierz sekretów local/preview/production.
- [ ] W kolejnym kroku przeprowadzić pierwszy smoke-tested deploy.
- [ ] OpenRouter wdrażać dopiero po ustabilizowaniu auth i obserwowalności.

## Decyzje do potwierdzenia przez zespół

- [ ] Czy email confirmation ma być włączone już w pierwszym publicznym release?
- [ ] Czy preview ma używać osobnego projektu Supabase lub odseparowanych sekretów?
- [ ] Czy pierwszy production deploy wykonujemy ręcznie z `Wrangler CLI`, czy przez `Workers Builds`?
- [ ] Czy funkcje AI z OpenRouter są częścią pierwszego release, czy kolejną iteracją po stabilizacji auth?

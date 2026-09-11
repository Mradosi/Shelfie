# CI/CD review kodu dla pull requestów — plan implementacji

## Przegląd

Wprowadzamy niezależną bramkę AI dla pull requestów do `master`. Wykorzysta ona istniejący lokalny pakiet `tools/code-review-agent`, ale najpierw otrzyma ścisły kontrakt odpowiedzi zgodny z Definition of Done Shelfie. Wynik review będzie maszynowo walidowany, a werdykt wyliczany deterministycznie przed wystawieniem komentarza i etykiety w GitHubie.

## Analiza stanu obecnego

Repozytorium ma już deterministyczny workflow CI w `.github/workflows/ci.yml`, który wykonuje `astro sync`, lint i build. Nie należy dodawać do niego sekretu OpenAI ani zastępować nim obecnej bramki.

Niezatwierdzony jeszcze pakiet `tools/code-review-agent` korzysta z `@openai/codex-sdk` i Zod, zwraca JSON na stdout oraz działa w sandboxie read-only. Jego obecny prompt ocenia inny zestaw kryteriów, przyjmuje wyłącznie diff, a schema nie ogranicza wyniku do skali 1–10. Nie ma też testów pakietu ani composite action.

Workflow przetwarzający PR musi uruchamiać wyłącznie kod z zaufanej gałęzi bazowej. Checkout ani wykonanie kodu z gałęzi autora PR w jobie z `OPENAI_API_KEY` byłoby naruszeniem granicy bezpieczeństwa.

## Docelowy stan

Każdy PR z gałęzi tego samego repozytorium do `master` otrzymuje automatyczne review po otwarciu, aktualizacji lub ręcznym dodaniu etykiety `ai-cr:review`. Agent ocenia pięć kryteriów Shelfie, zwraca zwalidowany JSON po polsku, a kod TypeScript wylicza `pass`, `needs_changes` lub `fail` według ustalonej polityki.

Workflow aktualizuje jeden komentarz pod PR-em, ustawia dokładnie jedną etykietę wyniku (`ai-cr:passed` albo `ai-cr:failed`), usuwa etykietę retry po użyciu i blokuje merge dla wyniku innego niż `pass`. PR-y z forków nie są wysyłane do dostawcy AI w wersji v1; ograniczenie jest opisane w dokumentacji wdrożenia.

### Kluczowe ustalenia

- `.github/workflows/ci.yml:3-24` jest obecną, obowiązkową bramką builda; plan zachowuje ją bez zmian.
- `tools/code-review-agent/src/review.ts:50-68` ma już wywołanie Codex SDK z `outputSchema` i walidacją Zod, więc rozszerzamy istniejący pakiet zamiast tworzyć drugiego agenta.
- `tools/code-review-agent/src/review-schema.ts:3-28` zawiera poprzednią rubrykę i nieograniczone `z.number()`, dlatego potrzebuje nowego kontraktu.
- `context/changes/ci-cd-code-review/requirements.md:20-38` jest źródłem prawdy dla pięciu kryteriów oraz bezwarunkowego faila dla krytycznego problemu bezpieczeństwa lub izolacji danych.
- `context/foundation/test-plan.md:75-91` pozostawia dodanie rootowego `npm test` do CI jako odrębną decyzję; nie rozszerzamy nim istniejącego `ci.yml` w tej zmianie.

## Czego nie robimy

- Nie modyfikujemy obecnego workflow `ci.yml` ani nie dodajemy do niego `OPENAI_API_KEY`.
- Nie analizujemy diffów PR-ów z forków i nie wysyłamy ich do modelu.
- Nie checkoutujemy ani nie uruchamiamy kodu z gałęzi autora PR w jobie posiadającym sekrety lub uprawnienia zapisu.
- Nie dodajemy evali promptfoo, dodatkowych narzędzi agenta, architektonicznego/business review ani automatycznych komentarzy inline.
- Nie konfigurujemy ani nie zapisujemy sekretu `OPENAI_API_KEY`; właściciel repozytorium robi to w ustawieniach GitHub po wdrożeniu.

## Podejście implementacyjne

Zmiana składa się z trzech warstw: agent zbiera ustrukturyzowane dowody, polityka w zwykłym TypeScript wylicza werdykt, a osobny workflow publikuje mechaniczny rezultat. Composite action jest reużywalnym, zaufanym adapterem pomiędzy workflow a lokalnym pakietem agenta.

```text
pull_request_target na kodzie gałęzi bazowej
  → composite action
    → metadane PR + diff jako nieufne dane
      → Codex + ścisła walidacja JSON
        → deterministyczny werdykt
          → jeden komentarz + jedna etykieta wyniku
```

## Krytyczne szczegóły implementacyjne

Job review użyje `pull_request_target`, checkoutu dokładnego `base.sha` z `persist-credentials: false` i lokalnej composite action z tego checkoutu. Diff, tytuł oraz opis pobieramy przez GitHub API do plików lub przekazujemy przez bezpieczne zmienne środowiskowe; nie interpolujemy ich w poleceniach shella. To odcina sekrety i uprawnienia zapisu od dowolnego kodu zmienionego w PR.

## Faza 1: Kontrakt reviewera i deterministyczna polityka werdyktu

### Przegląd

Przekształcamy lokalny agent w testowalny scorer, który przyjmuje metadane PR i diff, a następnie zwraca pełny raport zgodny z wymaganiami Shelfie. Werdykt będzie efektem polityki aplikacyjnej, nie decyzją modelu.

### Wymagane zmiany

#### 1. Schema, prompt i typy raportu

**Plik**: `tools/code-review-agent/src/review-schema.ts`

**Cel**: Zastąpić starą rubrykę pięcioma kryteriami z `requirements.md`, ich kotwicami 1/10 oraz zasadami Shelfie dotyczącymi sekretów, RLS, Astro/React, Cloudflare i testów proporcjonalnych do ryzyka.

**Kontrakt**: Modelowy JSON zawiera dokładnie pięć nazwanych obiektów: `functionalCorrectness`, `securityPrivacy`, `platformFit`, `maintainability` i `regressionProtection`. Każdy ma całkowity `score` 1–10, niepuste polskie `summary` oraz tablicę findings. Finding zawiera severity (`low`, `medium`, `high`, `critical`), ścieżkę zmienionego pliku, opcjonalny numer linii, opis po polsku i sugerowaną poprawkę. Raport zawiera również niepusty summary oraz ustrukturyzowane `manualChecks` z polami `check` i `reason`.

Prompt oddziela tytuł, opis i diff wyraźnymi granicami danych nieufnych; zabrania traktowania ich jako instrukcji. Nakazuje nie zgłaszać braku kontekstu jako defektu oraz dodać manualne kroki dla zmian auth, formularzy i middleware.

#### 2. Polityka werdyktu i wejście CLI

**Pliki**: `tools/code-review-agent/src/review-policy.ts`, `tools/code-review-agent/src/review-input.ts`, `tools/code-review-agent/src/review.ts`

**Cel**: Rozdzielić walidację danych wejściowych, wyliczanie werdyktu i wywołanie SDK, aby polityka była niezależna od modelu i testowalna hermetycznie.

**Kontrakt**: Tytuł PR jest obowiązkowy; opis jest opcjonalny i ma limit 4 000 znaków; diff pochodzi ze standardowego wejścia i musi mieścić się w 60 000 znaków. Logi techniczne raportują wyłącznie rozmiary danych, nigdy ich zawartość. Po udanej walidacji modelowego raportu funkcja polityki wylicza werdykt: `fail` dla dowolnego findingu `critical` lub oceny ≤4; `needs_changes` dla findingu `high` lub oceny 5–7; `pass` wyłącznie dla wszystkich ocen ≥8 bez `high` i `critical`.

#### 3. Hermetyczne testy pakietu i dokumentacja

**Pliki**: `tools/code-review-agent/src/review-schema.test.ts`, `tools/code-review-agent/src/review-policy.test.ts`, `tools/code-review-agent/src/review-input.test.ts`, `tools/code-review-agent/package.json`, `tools/code-review-agent/package-lock.json`, `tools/code-review-agent/vitest.config.ts`, `tools/code-review-agent/README.md`

**Cel**: Dodać lokalne testy kontraktu bez wywoływania modelu oraz udokumentować nowe wejścia, wyjścia, limity, politykę i granicę przekazywania danych do providera.

**Kontrakt**: Testy nie importują kodu wykonującego `thread.run` ani nie wymagają `OPENAI_API_KEY`. Odrzucają 0, 11 i wartości dziesiętne, brakujące kryterium lub nieprawidłowy finding/manual check. Sprawdzają granice trzech werdyktów, krytyczny finding bezpieczeństwa przy wysokich pozostałych ocenach, limit opisu/diffu oraz odporność promptu na instrukcje osadzone w metadanych PR. Istniejący fixture `unsafe-remove-user.diff` pozostaje smoke fixture'em, ale nie jest wyrocznią oceny modelu.

### Kryteria sukcesu

#### Automatyczna weryfikacja

- `npm run --prefix tools/code-review-agent typecheck` przechodzi.
- Nowy skrypt testowy pakietu przechodzi bez `OPENAI_API_KEY`, sieci i wywołania modelu.
- Testy potwierdzają pełną obecność pięciu kryteriów, ograniczenie score do liczb całkowitych 1–10 oraz deterministyczne progi werdyktu.
- `npx astro sync`, `npm run lint` i `npm run build` w katalogu głównym przechodzą.

#### Weryfikacja ręczna

- Lokalny smoke run na `unsafe-remove-user.diff` zwraca poprawny JSON po ustawieniu testowego/dozwolonego klucza i nie wypisuje diffu ani sekretu do stderr.
- Dokumentacja pakietu pozwala uruchomić review lokalnie z tytułem, opcjonalnym opisem i diffem bez znajomości implementacji.

**Notatka implementacyjna**: Po ukończeniu fazy i automatycznych testach potwierdź ręcznie wynik smoke runu przed przejściem do fazy 2.

---

## Faza 2: Zaufana composite action dla uruchomienia review

### Przegląd

Dodajemy lokalną composite action, która instaluje niezależne zależności agenta, pobiera metadane oraz diff PR-a jako dane i publikuje minimalne outputy potrzebne workflowowi.

### Wymagane zmiany

#### 1. Composite action i bezpieczne przekazanie danych PR

**Plik**: `.github/actions/ai-code-review/action.yml`

**Cel**: Opakować wykonanie agenta w reużywalny krok GitHub Actions, tak aby główny workflow zawierał tylko trigger, checkout, wywołanie action oraz obsługę wyniku.

**Kontrakt**: Action przyjmuje token GitHub, `OPENAI_API_KEY` i numer PR. Z wykorzystaniem tokenu pobiera tytuł, opis i diff przez GitHub API do tymczasowych plików, bez wykonywania lub checkoutowania head SHA. Instaluje wyłącznie zależności `tools/code-review-agent` z checkoutu gałęzi bazowej. Udostępnia scalar `verdict` przez `GITHUB_OUTPUT` i zapisuje pełny raport JSON w znanej ścieżce roboczej dla kolejnych kroków workflow. Nie przekazuje wieloliniowego diffu/JSON-a przez outputy ani argumenty shella.

#### 2. Formatowanie komentarza na podstawie raportu

**Plik**: `tools/code-review-agent/src/format-pr-comment.ts`

**Cel**: Wydzielić renderowanie komentarza PR z workflow, aby raport zachował jeden kontrakt dla lokalnego narzędzia i CI, a Markdown był generowany deterministycznie.

**Kontrakt**: Formatter przyjmuje wyłącznie zwalidowany raport końcowy i zwraca polski Markdown z trwałym markerem HTML, werdyktem, tabelą pięciu ocen, findings oraz manual checks. Treść jest ograniczona do informacji z raportu i nie interpoluje nieufnego diffu, tytułu ani opisu PR.

#### 3. Testy oraz dokumentacja granicy action

**Pliki**: `tools/code-review-agent/src/format-pr-comment.test.ts`, `tools/code-review-agent/README.md`, `.github/actions/ai-code-review/README.md`

**Cel**: Sprawdzić deterministyczne formatowanie komentarza i opisać wejścia, outputy, wymagane uprawnienia oraz zakaz uruchamiania kodu autora PR.

**Kontrakt**: Test formattera pokrywa wszystkie trzy werdykty, brak findings i manual checks oraz bezpieczne renderowanie tekstu modelowego. Dokumentacja action wyjaśnia, że action wymaga trusted-base checkoutu i nie obsługuje forków w v1.

### Kryteria sukcesu

#### Automatyczna weryfikacja

- Testy formattera przechodzą hermetycznie razem z pozostałymi testami pakietu.
- `action.yml` deklaruje jawne wejścia i output `verdict`, a wszystkie kroki `run` określają `shell`.
- Action instaluje zależności z `tools/code-review-agent` i przekazuje diff przez plik/stdin, nie przez argument polecenia ani `GITHUB_OUTPUT`.
- Typecheck, testy pakietu, `npx astro sync`, lint i build przechodzą.

#### Weryfikacja ręczna

- Przegląd pliku `action.yml` potwierdza, że nie istnieje checkout ani wykonanie `github.event.pull_request.head.sha`.
- Przykładowy zwalidowany raport generuje jeden czytelny komentarz po polsku z markerem umożliwiającym późniejszą aktualizację.

**Notatka implementacyjna**: Po ukończeniu fazy i automatycznych testach potwierdź ręcznie granicę trusted-base przed przejściem do fazy 3.

---

## Faza 3: Workflow PR, bramka merge i obsługa retry

### Przegląd

Dodajemy dedykowany workflow, który bezpiecznie uruchamia action na PR-ach z tego repozytorium, publikuje wynik i wystawia status blokujący merge dla wyniku niebędącego `pass`.

### Wymagane zmiany

#### 1. Workflow automatycznego review

**Plik**: `.github/workflows/ai-code-review.yml`

**Cel**: Obsłużyć automatyczne i ręczne uruchamianie review bez zmiany obecnego CI.

**Kontrakt**: Workflow uruchamia się dla `pull_request_target` do `master` w zdarzeniach `opened`, `reopened`, `synchronize` i `labeled`. Job wykonuje się tylko dla PR-a, którego `head.repo.full_name` jest równe `github.repository`; w przypadku `labeled` wyłącznie dla etykiety `ai-cr:review`. Stosuje minimalne uprawnienia `contents: read`, `pull-requests: write` i `issues: write`, timeout i concurrency per numer PR. Checkoutuje dokładne `github.event.pull_request.base.sha` z `persist-credentials: false`, a następnie wywołuje lokalną composite action.

Po wyniku job tworzy albo aktualizuje komentarz z markerem, zapewnia istnienie etykiet `ai-cr:passed`, `ai-cr:failed` oraz `ai-cr:review`, usuwa poprzednią etykietę wyniku i nakłada właściwą. Wynik `needs_changes` jest oznaczany `ai-cr:failed`, ale zachowuje szczegółowy werdykt w komentarzu. Retry usuwa `ai-cr:review` po obsłużeniu. Błąd action, brak sekretu, niepoprawny raport i każdy werdykt poza `pass` kończą job niepowodzeniem.

#### 2. Widoczna obsługa PR-ów z forków i instrukcje wdrożenia

**Pliki**: `.github/workflows/ai-code-review.yml`, `README.md`

**Cel**: Jednoznacznie zakomunikować brak wysyłania forkowych diffów do providera oraz podać wymagane działania administratora repozytorium.

**Kontrakt**: Workflow nie udostępnia `OPENAI_API_KEY` jobowi wykonującemu kod lub review forka. Dokumentacja wymienia sekret `OPENAI_API_KEY`, wymagane permissions i zachowanie forków, a także wyjaśnia, że branch protection ma wymagać status checka review dopiero po zweryfikowaniu pierwszego przebiegu na testowym PR.

### Kryteria sukcesu

#### Automatyczna weryfikacja

- `npx prettier --check .github/workflows/ai-code-review.yml .github/actions/ai-code-review/action.yml` przechodzi, a workflow zawiera wyłącznie wymagane eventy, warunki i minimalne permissions.
- Existing `.github/workflows/ci.yml` nie zmienia się; nadal wykonuje `astro sync`, lint i build.
- Testy polityki i formattera potwierdzają wybór `ai-cr:passed` dla `pass` oraz `ai-cr:failed` dla `needs_changes`/`fail`; workflow wykorzystuje te outputy i kończy job niepowodzeniem dla wyniku non-pass.
- Typecheck i testy pakietu, `npx astro sync`, lint i build przechodzą przed wysłaniem PR-a.

#### Weryfikacja ręczna

- Administrator dodaje `OPENAI_API_KEY` jako sekret repozytorium bez ujawniania go w kodzie lub logach.
- Testowy PR z tego repozytorium tworzy/aktualizuje jeden komentarz, dodaje jedną etykietę wyniku i pokazuje blokujący status dla `needs_changes`/`fail`.
- Dodanie `ai-cr:review` do istniejącego PR-a uruchamia retry i usuwa etykietę po obsłużeniu.
- PR z forka nie uruchamia płatnego review i otrzymuje zachowanie opisane w dokumentacji.
- Po pierwszym udanym przebiegu administrator włącza wymaganie status checka AI review w branch protection, jeżeli zespół chce używać go jako twardej bramki merge.

**Notatka implementacyjna**: Faza wymaga ręcznej konfiguracji sekretu i testowego PR-a przez administratora; bez niej nie można potwierdzić działania na GitHubie.

## Strategia testowania

### Testy jednostkowe

- Schema raportu: pięć nazwanych kryteriów, skala 1–10, finding i manual check.
- Polityka werdyktu: granice ocen, severity i niezmienny fail dla critical.
- Wejście/prompt: limity tytułu, opisu i diffu oraz granica prompt injection.
- Formatter komentarza: trzy werdykty, puste sekcje i marker aktualizacji.

### Testy integracyjne

- Nie wywołujemy prawdziwego modelu ani GitHub API w testach pakietu.
- W środowisku GitHub testowy PR potwierdza działanie composite action, komentarzy, etykiet i statusu checka.

### Kroki ręczne

1. Dodać sekret `OPENAI_API_KEY` w ustawieniach repozytorium.
2. Otworzyć mały PR z tego repozytorium i sprawdzić komentarz, etykietę oraz status workflow.
3. Dodać `ai-cr:review` i potwierdzić idempotentne odświeżenie komentarza oraz etykiet.
4. Zweryfikować, że PR z forka nie dostaje sekretu ani nie uruchamia kodu review.
5. Dopiero po poprawnym przebiegu skonfigurować branch protection, jeśli AI review ma blokować merge.

## Wydajność i koszty

- Limit 60 000 znaków diffu i limit 4 000 znaków opisu zatrzymują niekontrolowany wzrost kosztu oraz czasu odpowiedzi.
- Workflow działa raz na zdarzenie PR, a concurrency per PR ogranicza równoległe, przestarzałe przebiegi.
- Retry wymaga świadomego dodania etykiety i usuwa ją po użyciu.
- Długie diffy nie są dzielone ani automatycznie ponawiane; zwracają `needs_changes` z prośbą o manualne review.

## Uwagi migracyjne

- Nie ma migracji bazy danych ani zmian w danych aplikacji.
- Nowe pliki workflow/action i niezatwierdzony pakiet reviewera wejdą do repozytorium wraz z tą zmianą.
- Wycofanie polega na usunięciu wymagania status checka i wyłączeniu/usunięciu workflow; nie usuwa danych użytkownika.

## Referencje

- Research: `context/changes/ci-cd-code-review/research.md`
- Wymagania: `context/changes/ci-cd-code-review/requirements.md`
- Obecny CI: `.github/workflows/ci.yml:3-24`
- Agent: `tools/code-review-agent/src/review.ts:35-75`
- Obecna schema: `tools/code-review-agent/src/review-schema.ts:3-28`
- Zasady testów: `context/foundation/test-plan.md:75-91`
- Bezpieczne użycie `pull_request_target`: https://docs.github.com/en/actions/reference/security/secure-use

## Postęp

> Konwencja: `- [ ]` oznacza krok oczekujący, `- [x]` ukończony. Po wdrożeniu dopisz ` — <sha commita>`. Nie zmieniaj nazw kroków.

### Faza 1: Kontrakt reviewera i deterministyczna polityka werdyktu

#### Automatyczne

- [x] 1.1 Zastąp rubrykę agenta pięcioma kryteriami Shelfie i ścisłą schema raportu.
- [x] 1.2 Dodaj walidację wejścia, politykę werdyktu i przekazanie metadanych PR do reviewera.
- [x] 1.3 Dodaj hermetyczne testy oraz skrypty testowe pakietu.
- [x] 1.4 Uruchom typecheck i testy pakietu oraz `npx astro sync`, lint i build.

#### Ręczne

- [x] 1.5 Potwierdź lokalny smoke run na fixture bez ujawnienia diffa lub sekretu w logach.

### Faza 2: Zaufana composite action dla uruchomienia review

#### Automatyczne

- [ ] 2.1 Dodaj composite action pobierającą dane PR przez API i uruchamiającą wyłącznie zaufany pakiet agenta.
- [ ] 2.2 Dodaj formatter komentarza, jego testy oraz dokumentację action.
- [ ] 2.3 Zweryfikuj manifest action, typecheck i testy pakietu oraz repozytoryjne sync, lint i build.

#### Ręczne

- [ ] 2.4 Potwierdź, że action nie checkoutuje ani nie wykonuje head SHA PR-a.

### Faza 3: Workflow PR, bramka merge i obsługa retry

#### Automatyczne

- [ ] 3.1 Dodaj workflow `pull_request_target` z minimalnymi uprawnieniami, trusted-base checkoutem i warunkiem retry.
- [ ] 3.2 Dodaj idempotentny komentarz, wzajemnie wykluczające się etykiety oraz blokujący wynik dla non-pass.
- [ ] 3.3 Zweryfikuj YAML workflow i pełną lokalną bramkę jakości bez modyfikacji istniejącego `ci.yml`.

#### Ręczne

- [ ] 3.4 Skonfiguruj sekret repozytorium i potwierdź zachowanie workflow na testowym PR-ze oraz retry.
- [ ] 3.5 Zweryfikuj pominięcie forków i dopiero wtedy opcjonalnie włącz status check jako branch protection.

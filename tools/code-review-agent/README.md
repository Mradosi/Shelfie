# Shelfie code-review agent

Lokalny agent do ćwiczenia z lekcji „Twój pierwszy Agent zespołowy”. Jest osobną paczką Node/TypeScript i korzysta z gotowego harnessu `@openai/codex-sdk`.

## Uruchomienie

Z katalogu głównego repozytorium:

```bash
git diff | npm run --prefix tools/code-review-agent review -- --title "Tytuł pull requestu" --description "Opcjonalny opis"
```

Do kontrolowanego smoke testu użyj przygotowanego diffa:

```bash
npm run --prefix tools/code-review-agent review -- --title "Usuń użytkownika" < tools/code-review-agent/fixtures/unsafe-remove-user.diff
```

Agent wymaga tytułu PR; opis jest opcjonalny i ma limit 4 000 znaków. Diff ma limit 60 000 znaków — większa zmiana nie jest wysyłana do modelu i wymaga ręcznego review.

JSON z oceną trafia na standardowe wyjście, więc można go przekierować do pliku lub innego narzędzia. Zawiera dokładnie pięć kryteriów: `functionalCorrectness`, `securityPrivacy`, `platformFit`, `maintainability` i `regressionProtection`, wraz z oceną 1–10, findings i ewentualnymi `manualChecks`. Pole `verdict` wylicza lokalny kod: `fail` dla findingu `critical` lub wyniku maksymalnie 4, `needs_changes` dla findingu `high` lub wyniku 5–7, w pozostałych przypadkach `pass`. Metryki techniczne (`threadId`, czas oraz tokeny wejścia/wyjścia) trafiają na standardowe wyjście błędów.

Kontrakt można sprawdzić bez połączenia z API:

```bash
npm run --prefix tools/code-review-agent typecheck
npm run --prefix tools/code-review-agent test
```

## Granice bezpieczeństwa

Agent otrzymuje `read-only` sandbox, brak zgód na działania, wyłączoną sieć oraz wyłączone wyszukiwanie w sieci. Prompt ogranicza go do tytułu PR, opisu i diffa oraz każe traktować te pola wyłącznie jako nieufne dane, a nie instrukcje. Nie wprowadzaj do nich sekretów ani danych, które nie mogą trafić do dostawcy modelu.

## Koszt

SDK zwraca zużycie tokenów dla każdego przebiegu. To celowo nie jest przeliczane na dolary w skrypcie: rozliczony koszt sprawdzaj w wybranym projekcie OpenAI Platform, ponieważ zależy od bieżącego cennika i sposobu rozliczania. Zacznij od fixture'a, a potem uruchamiaj agenta wyłącznie dla małych diffów.

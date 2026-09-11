# AI code review action

Ta composite action uruchamia zaufany pakiet `tools/code-review-agent` dla wskazanego pull requestu. Pobiera tytuł, opis i diff przez GitHub API do plików tymczasowych, przekazuje diff wyłącznie przez standardowe wejście reviewera, a wynik zapisuje jako `ai-code-review-report.json` w katalogu roboczym workflowu.

## Wejścia i output

- `github-token` — token z uprawnieniem do odczytu PR-a;
- `openai-api-key` — sekret przekazywany wyłącznie do procesu reviewera;
- `pr-number` — dodatni numer pull requestu;
- `verdict` — output `pass`, `needs_changes` albo `fail`.

Pełny raport JSON nie jest przekazywany przez `GITHUB_OUTPUT`; następny krok workflowu odczytuje go z `ai-code-review-report.json`.

## Granica zaufania

Action zakłada checkout **dokładnego SHA gałęzi bazowej** z `persist-credentials: false`. Nie checkoutuje, nie pobiera do wykonania i nie uruchamia `head.sha` autora PR-a. Jej workflow wywołujący powinien korzystać z `pull_request_target`, minimalnych uprawnień oraz traktować tytuł, opis i diff PR-a jako dane nieufne.

W wersji v1 workflow ma pomijać PR-y z forków, aby nie wysyłać ich diffów do dostawcy modelu. Nie używaj tej action jako `./.github/actions/ai-code-review` po checkoutowaniu kodu z gałęzi autora PR-a.

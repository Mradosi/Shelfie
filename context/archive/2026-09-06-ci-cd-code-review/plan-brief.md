# CI/CD review kodu dla pull requestów — skrót planu

> Pełny plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## Co i dlaczego

Shelfie dostanie automatyczne review kodu dla PR-ów do `master`, oparte na pięciu zdefiniowanych kryteriach Definition of Done. Celem jest zamiana opinii modelu w sprawdzalny kontrakt: model wskazuje dowody, a zwykły kod wylicza werdykt, na którym może oprzeć się bramka merge.

## Punkt startowy

Obecne CI nadal będzie odpowiedzialne za `astro sync`, lint i build. Repozytorium ma już lokalny pakiet Codex reviewera z JSON outputem, ale jego rubryka, wejście i schema nie odpowiadają nowym wymaganiom, a sam pakiet nie ma testów.

## Docelowy stan

PR z tego repozytorium otrzymuje jeden aktualizowany komentarz, dokładnie jedną etykietę wyniku oraz status blokujący merge dla `needs_changes` i `fail`. Agent pracuje na tytule, ograniczonym opisie i diffie jako danych nieufnych; jego kod uruchamia się wyłącznie z gałęzi bazowej.

## Kluczowe decyzje

| Decyzja           | Wybór                                   | Dlaczego                                                                | Źródło          |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------- | --------------- |
| Kryteria          | Pięć kryteriów Shelfie                  | Są już opisane kotwicami 1/10 i obejmują ryzyka produktu.               | Wymagania       |
| Werdykt           | Polityka TypeScript po walidacji Zod    | Model nie może samodzielnie decydować o bramce merge.                   | Research / Plan |
| Bezpieczeństwo PR | `pull_request_target` i base checkout   | Sekret nie może trafić do kodu z gałęzi autora PR.                      | Research        |
| Forki             | Pomijane w v1                           | Nie wysyłamy diffów z forków do providera AI.                           | Plan            |
| Koszt             | 4 000 znaków opisu, 60 000 znaków diffu | Limity chronią czas i koszt pojedynczego review.                        | Plan            |
| CI testy root     | Bez zmian                               | Dodanie `npm test` do istniejącego CI jest osobną decyzją z test planu. | Research / Plan |

## Zakres

**W zakresie:** schema i prompt reviewera, polityka werdyktu, hermetyczne testy, composite action, workflow PR, komentarz, etykiety, retry, dokumentacja wdrożenia.

**Poza zakresem:** promptfoo, narzędzia agenta, review biznesowe/architektoniczne, komentarze inline, PR-y z forków, zmiana obecnego `ci.yml` i konfiguracja sekretu przez agenta.

## Architektura / podejście

```text
zaufany workflow na base SHA → composite action → modelowy raport JSON
→ Zod + polityka werdyktu → komentarz, etykieta i status check
```

Tytuł, opis i diff są wyłącznie danymi wejściowymi; żaden kod z PR-a nie jest wykonywany w jobie z sekretem OpenAI.

## Fazy w skrócie

| Faza                  | Dostarcza                                        | Główne ryzyko                                   |
| --------------------- | ------------------------------------------------ | ----------------------------------------------- |
| 1. Kontrakt reviewera | Pięć kryteriów, testy i deterministyczny werdykt | Niedeterministyczny lub nieważny JSON modelu    |
| 2. Composite action   | Bezpieczne uruchomienie i raport dla workflow    | Przekazanie nieufnych danych do shella/outputów |
| 3. Workflow PR        | Komentarz, etykiety, retry i bramka merge        | Sekret lub uprawnienia dostępne dla kodu PR     |

**Warunki wstępne:** pakiet `tools/code-review-agent` zostanie zatwierdzony w repo; administrator doda sekret `OPENAI_API_KEY` przed testem na GitHubie.

**Szacowany nakład:** około 2–3 sesje implementacyjne w trzech fazach, plus ręczny test administratora na PR-ze.

## Otwarte ryzyka i założenia

- `pull_request_target` jest bezpieczny tylko przy bezwzględnym zakazie checkoutu i wykonania head SHA PR-a.
- Niedostępność modelu lub niepoprawny raport blokuje merge zgodnie z decyzją fail-closed; zespół musi zaakceptować ten wpływ na dostępność procesu.
- Późniejsze rozszerzenie o forki wymaga osobnej decyzji o przekazywaniu ich diffów do OpenAI.

## Podsumowane kryteria sukcesu

- Agent zwraca i waliduje pełny raport dla pięciu kryteriów, a jego werdykt jest deterministyczny.
- Workflow bezpiecznie publikuje jeden komentarz i jedną etykietę dla PR-ów z repozytorium.
- Obecna bramka builda działa bez zmian, a testowy PR potwierdza retry oraz blokowanie merge dla niepomyślnego review.

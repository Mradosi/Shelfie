# Frame Brief: Personalized product fit analysis

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

Przed `ai-routine-draft-and-review` chcemy wprowadzić AI-analizę produktu względem profilu skóry użytkownika, pokazywaną na stronie szczegółów produktu i zapisywaną tak, żeby późniejsze AI do draftowania albo review rutyny mogło z niej korzystać zamiast analizować produkt od zera za każdym razem.

## Initial Framing (preserved)

- **User's stated cause or approach**: AI routine draft/review będzie jakościowo lepsze i tańsze, jeśli najpierw powstanie warstwa zapisanej analizy dopasowania produktu do konkretnego użytkownika.
- **User's proposed direction**: najpierw ustalić jak ma wyglądać sama analiza AI, jak strukturyzować odpowiedzi, jakie pola zapisywać do bazy i kiedy analiza ma się generować lub regenerować.
- **Pre-dispatch narrowing**: to nie jest jeden wąski problem; to kilka równorzędnych, powiązanych tematów naraz: zakres produktu, kontrakt danych, lifecycle i zależność z późniejszym AI routine.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Semantyka analizy użytkowej** — jakie komunikaty analiza ma dawać użytkownikowi i jak bardzo mają być edukacyjne vs. operacyjne.
2. **Granica kontraktu domenowego** — co jest shared metadata produktu, a co jest personalizowaną interpretacją per `(user, product)`. ← initial framing
3. **Lifecycle interpretacji** — kiedy analiza powstaje, kiedy jest uznawana za nieaktualną i czy ma blokować zapis produktu lub widok szczegółów.
4. **Relacja do downstream AI** — czy analiza produktu ma być samodzielnym artefaktem domenowym, czy tylko pomocniczym cache dla przyszłego generowania rutyny.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **Semantyka analizy jest głównym problemem** | PRD już zawęża ton i rolę tych treści: guidance ma być wspierające, niemedyczne i zrozumiałe dla nietechnicznego użytkownika, a cached interpretation ma obejmować `fit score`, `compatibility`, `warnings`, `personal notes` [context/foundation/prd.md:133-139]. Architektura też już wskazuje zestaw wyników: `fit score`, `compatibility`, `warnings`, `contextual notes` [context/foundation/architecture-notes.md:197-213]. | **WEAK** |
| **Brakuje przede wszystkim kontraktu per-user product interpretation** | Architektura explicite rozdziela `products` od `user_products`, gdzie analiza ma być generowana raz per `(user, product)` i przechowywać personalizowane pola [context/foundation/architecture-notes.md:30-38, 114-130, 197-213]. PRD wymaga cache per user-product pair [context/foundation/prd.md:138-145]. Aktualna schema ma `products`, `user_profiles`, `user_shelf_items`, `user_routine_configs`, ale nie ma jeszcze tabeli lub kontraktu na spersonalizowaną interpretację produktu [supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-60]. Aktualny model TS też kończy się na `UserShelfItem` i `UserShelfCatalogItem` bez pola na analizę [src/lib/domain/user-domain.ts:11-18, 97-177]. | **STRONG** |
| **Najpierw trzeba rozstrzygnąć lifecycle generowania** | Architektura już sugeruje preferowany kierunek: interpretacja jest generowana jednokrotnie per `(user, product)`, nie przy każdym wejściu na kartę, a jeśli jest nieaktualna lub nie istnieje, backend może zwrócić dane produktu od razu i wygenerować interpretację asynchronicznie w tle [context/foundation/architecture-notes.md:197-213, 231-239]. To ważna decyzja, ale wygląda na pochodną kontraktu, nie jego zamiennik. | **MEDIUM** |
| **To przede wszystkim przygotowanie pod AI routine draft/review** | Architektura mówi, że AI routine generation działa wyłącznie na produktach z shelf i na profilu skóry, a generated routine używa tego samego modelu co manual editing [context/foundation/architecture-notes.md:165-177]. Jednocześnie PRD pozycjonuje personalized interpretation jako osobny cache i osobny user-facing output na product review screens [context/foundation/prd.md:138-153]. To znaczy, że downstream AI jest ważnym konsumentem, ale nie definiuje całego problemu. | **MEDIUM** |

## Narrowing Signals

Decisive observations from Step 4 (user reports + repository findings) that
narrowed the hypothesis space:

- Użytkowniczka wyraźnie wskazała kilka równorzędnych tematów naraz, więc framing nie może redukować sprawy do samego promptu albo samego UI.
- Repo już ma utrwalony wzorzec rozdzielania shared danych od per-user danych: `products` vs `user_shelf_items` vs `user_routine_configs` [supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-60].
- W dokumentach projektowych personalizowana interpretacja produktu jest już traktowana jako byt domenowy między shelf a routine, a nie jako detal przyszłego promptu do AI routine [context/foundation/architecture-notes.md:30-38, 165-177, 197-239].

## Cross-System Convention

W tym projekcie dane są konsekwentnie rozdzielane na warstwę shared i warstwę per-user. `products` przechowuje globalną tożsamość i potwierdzony INCI, `user_profiles` trzyma kontekst skóry, `user_shelf_items` sam fakt posiadania produktu, a `user_routine_configs` konfigurację użycia [supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-60]. Architektura-notes rozszerza ten sam wzorzec o brakującą warstwę `user_products`, czyli per-user interpretację produktu [context/foundation/architecture-notes.md:114-130, 392-430]. Leading hypothesis zgadza się więc z już przyjętą konwencją systemu.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: zdefiniowanie trwałego kontraktu domenowego dla spersonalizowanej interpretacji produktu per `(user, product)` oraz jego lifecycle, tak aby product details, późniejsze AI routine draft/review i kolejne warning flows korzystały z tego samego źródła prawdy.

To nie jest przede wszystkim problem „jak dokładnie ma wyglądać odpowiedź modelu AI”. To jest problem warstwy domenowej między shelf a routine: jakie pola są shared, jakie są per-user, co musi być strukturalne dla logiki aplikacji, a co może pozostać objaśnieniem tekstowym, kiedy wynik jest ważny, oraz które zmiany profilu lub produktu go unieważniają. Jeśli rozwiążemy tylko prompt bez tego kontraktu, ryzykujemy ponowne analizowanie tych samych produktów, brak spójności między ekranem produktu a AI routine i szybki drift w kolejnych slice’ach.

## Confidence

- **HIGH** — strong evidence + matches convention + decisive narrowing signal

Dowody w PRD, architekturze i aktualnej schemie są spójne: personalizowana interpretacja produktu była zakładana wcześniej jako osobny byt, ale nie została jeszcze wprowadzona do kontraktu danych.

## What Changes for /10x-plan

Plan nie powinien zaczynać od projektowania promptu ani samego UI szczegółów produktu. Powinien najpierw zdefiniować kontrakt `user-product interpretation`: strukturę persisted fields, minimalny payload AI, reguły invalidation/regeneration i dopiero potem ekrany/details API oraz zależność przyszłego `ai-routine-draft-and-review` od tego kontraktu.

## References

- Source files: `context/foundation/architecture-notes.md:30-38`, `context/foundation/architecture-notes.md:114-130`, `context/foundation/architecture-notes.md:165-177`, `context/foundation/architecture-notes.md:197-239`, `context/foundation/architecture-notes.md:392-430`, `context/foundation/prd.md:133-153`, `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:13-60`, `src/lib/domain/user-domain.ts:11-18`, `src/lib/domain/user-domain.ts:97-177`
- Related research: —
- Investigation tasks: none (local repository evidence pass only)

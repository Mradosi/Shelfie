# Notatki produktów i wykluczenia z rutyn AI — Plan Brief

> Pełny plan: `context/changes/shelf-notes-and-routine-exclusions/plan.md`

## What & Why

Użytkownik zapisze prywatną notatkę przy produkcie z własnej półki oraz opcjonalnie wykluczy go z propozycji AI. To umożliwia przekazanie osobistego doświadczenia, np. podrażnienia po użyciu kremu, bez polegania wyłącznie na tym, czy model poprawnie zinterpretuje wolny tekst.

## Starting Point

Pozycja na półce jest już prywatnym wierszem `user_shelf_items`, a AI rutyn obecnie bierze do analizy całą półkę. Ręczny edytor i zapis rutyny mają pozostać dostępne dla wszystkich posiadanych produktów.

## Desired End State

Notatka i wykluczenie są trwałe, prywatne i edytowalne na stronie szczegółów własnego produktu. AI nigdy nie otrzyma produktu z aktywnym wykluczeniem; notatka niewykluczonego produktu będzie jedynie ograniczonym kontekstem. Ręczna rutyna nie zmieni się automatycznie.

## Key Decisions Made

| Decyzja            | Wybór                                        | Dlaczego                                                                                  |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Miejsce danych     | `user_shelf_items`                           | Preferencja należy do relacji użytkownika z produktem, nie do wspólnego katalogu.         |
| Reguła wykluczenia | Filtr serwerowy przed promptem               | Model nie może zasugerować produktu, którego w ogóle nie otrzymał.                        |
| Rola notatki       | Kontekst tylko dla niewykluczonych produktów | Pomaga AI, ale nie zastępuje jawnej decyzji użytkownika.                                  |
| Ręczna rutyna      | Nadal dozwolona z etykietą                   | Zachowuje kontrolę użytkownika i ogranicza zasadę dokładnie do AI.                        |
| Baza danych        | Tylko `npx supabase migration up`            | Nowa migracja zachowuje obecne produkty; reset jest zakazany.                             |
| Testy              | Mock AI + test ręczny                        | Reguła braku wykluczonego produktu jest deterministyczna i nie wymaga prawdziwego modelu. |

## Scope

**In scope:**

- Notatka do 500 znaków i przełącznik wykluczenia per własna pozycja półki.
- Formularz na szczegółach produktu, właścicielski endpoint i flash message.
- Serwerowy filtr AI, ograniczony kontekst notatki, jasne błędy graniczne i testy.

**Out of scope:**

- Reset bazy, check-iny skóry, historia reakcji, analityka i diagnostyka medyczna.
- Automatyczne usuwanie wpisów rutyny, harmonogramy tygodniowe i pełny dziennik pielęgnacji.

## Architecture / Approach

`user_shelf_items` otrzyma dwa pola preferencji. Odczyt półki buduje pełną listę dla UI ręcznego, natomiast endpoint AI tworzy z niej `eligibleShelf`. Tylko ta druga lista płynie przez przygotowanie interpretacji, prompt i walidator odpowiedzi modelu.

## Phases at a Glance

| Faza              | Co dostarcza                         | Główne ryzyko                                    |
| ----------------- | ------------------------------------ | ------------------------------------------------ |
| 1. Dane prywatne  | Migrację i helper preferencji        | Zachowanie obecnych danych bez resetu            |
| 2. UI preferencji | Formularz i etykietę manualną        | Właściwy zakres ustawienia „tylko z AI”          |
| 3. Bramka AI      | Filtrowanie, kontekst, błędy i testy | Wykluczony produkt nie może dostać się do modelu |

**Prerequisites:** lokalna baza z istniejącymi danymi; możliwość uruchomienia `npx supabase migration up`.
**Estimated effort:** około 2–3 sesje w trzech fazach.

## Open Risks & Assumptions

- Notatka jest wysyłana do aktualnego dostawcy AI tylko dla niewykluczonych produktów; użytkownik potwierdził tę granicę prywatności.
- Jeśli rutyna już zawiera wykluczony produkt, AI zatrzyma się do świadomej korekty — nie zmieni rutyny samodzielnie.

## Success Criteria (Summary)

- Użytkownik zapisuje notatkę i wykluczenie bez utraty obecnych produktów.
- Wykluczony produkt nie trafia do promptu ani propozycji AI, ale pozostaje dostępny ręcznie.
- Automatyczne testy, lint i build przechodzą, a ręczne scenariusze potwierdzają trwałość i zachowanie graniczne.

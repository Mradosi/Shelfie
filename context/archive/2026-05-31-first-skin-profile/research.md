---
date: 2026-05-31T10:12:41+0200
researcher: Codex
git_commit: 6863148878f9926059228cd420010356c1b50386
branch: master
repository: Shelfie
topic: "Jak zaprojektować pytania ankietowe dla skin aspects oraz jak tagować concerns i goals w first-skin-profile?"
tags: [research, codebase, skin-profile, onboarding, questionnaire]
status: complete
last_updated: 2026-05-31
last_updated_by: Codex
---

# Research: Jak zaprojektować pytania ankietowe dla skin aspects oraz jak tagować concerns i goals w first-skin-profile?

**Date**: 2026-05-31T10:12:41+0200
**Researcher**: Codex
**Git Commit**: 6863148878f9926059228cd420010356c1b50386
**Branch**: master
**Repository**: Shelfie

## Research Question

Jakie pytania powinny zostać zadane użytkownikowi w ankiecie, żeby dobrze ocenić każdy ze `skin aspects`? Po 2-4 pytania na każdy aspekt. Jak otagować `skin concerns` i `goals`? Czy powinny to być predefiniowane opcje dla usera?

## Summary

Repo już rozróżnia dwa poziomy modelu profilu:

1. `skin_aspects` są zamkniętym, strukturalnym kontraktem z pięcioma wymiarami i czterema poziomami nasilenia (`none|low|medium|high`).
2. `concerns` i `goals` są celowo pozostawione jako free-form w obecnym slice'ie, żeby nie zablokować zbyt wcześnie słownika domenowego.

Najbezpieczniejszy kierunek dla `first-skin-profile` to:

- utrzymać predefiniowane odpowiedzi dla `skin_type` i poziomów `skin_aspects`,
- oprzeć ocenę każdego aspektu na 2-4 prostych, obserwowalnych pytaniach o częstotliwość i wpływ,
- nie zamykać `concerns` i `goals` wyłącznie w predefiniowanych opcjach,
- zamiast tego użyć modelu hybrydowego: sugerowane chipy + opcja własnego wpisu + ewentualna późniejsza normalizacja do tagów canonical.

Pure predefined options dla `concerns` i `goals` byłyby sprzeczne z obecną intencją repo dla tego slice'a i groziłyby przedwczesnym zamrożeniem słownika.

## Detailed Findings

### 1. Obecny kontrakt danych jest już częściowo zamknięty

- `skin_aspects` mają dziś dokładnie pięć kluczy: `sensitivity`, `pigmentation`, `firmness`, `breakouts`, `texture`, a każdy ma poziom `none|low|medium|high` (`src/lib/domain/user-domain.ts:9-15`, `src/lib/domain/user-domain.ts:67-73`).
- UI na dashboardzie renderuje te pięć aspektów jako osobne selecty z predefiniowanymi poziomami, co wzmacnia kierunek "structured severity", a nie pełny quiz diagnostyczny (`src/pages/dashboard.astro:128-149`).
- API zapisu wymaga obecności wszystkich skin aspects i waliduje je wobec wspólnej listy poziomów (`src/pages/api/domain/profile.ts:82-91`, `src/pages/api/domain/profile.ts:120-140`).

Wniosek: ankieta dla `skin_aspects` powinna kończyć się mapowaniem do jednego z czterech poziomów, a nie do otwartego opisu tekstowego.

### 2. Concerns i goals są celowo jeszcze nienormalizowane

- Dashboard mówi wprost: concerns mają pozostać "free-form specifics for now", a canonical concern tags należą do późniejszego slice'a (`src/pages/dashboard.astro:155-167`).
- To samo dotyczy goals: "do not lock the vocabulary too early" (`src/pages/dashboard.astro:170-182`).
- Historyczny plan `F-01` potwierdza tę decyzję architektonicznie: `concerns` i `goals` mają zostać na razie swobodnymi `text[]`, bo słowniki tagów należą do kolejnych slice'ów (`context/archive/2026-05-30-user-domain-persistence-contract/plan.md:19`, `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:51`, `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:73`).

Wniosek: dla `first-skin-profile` nie należy wprowadzać twardego, zamkniętego słownika concerns/goals jako jedynej drogi wejścia.

### 3. Produkt potrzebuje tagów concerns, ale bardziej po stronie semantyki niż onboardingowego UX

- W `architecture-notes` shared products mają mieć `concern_tags` opisujące, jakie problemy skórne produkt adresuje (`context/foundation/architecture-notes.md:95-101`).
- Ten sam dokument zakłada, że AI będzie zestawiać `concern tags` produktu z profilem skóry usera przy generowaniu interpretacji (`context/foundation/architecture-notes.md:200-213`).
- PRD wymaga basic skin context jako wejścia do personalizacji, ale nie narzuca jeszcze szczegółowej taksonomii ankiety (`context/foundation/prd.md:49-65`).

Wniosek: tagi concerns są potrzebne, ale głównie jako warstwa semantyczna dla późniejszego dopasowania produktów i rutyny. To nie oznacza, że pierwszy onboarding musi już zmuszać usera do wyboru wyłącznie z zamkniętej listy.

### 4. Zakres S-01 powinien zostać onboardingowy, nie produktowy

- Roadmapa definiuje `S-01` jako "provide basic skin context" i zakończyć onboarding pustą półką, bez wchodzenia jeszcze w intake produktów (`context/foundation/roadmap.md:96-106`).
- Ryzyko w roadmapie jest jawne: jeśli ten slice zacznie brać na siebie odpowiedzialność produktową, rozmyje granicę z `S-02` (`context/foundation/roadmap.md:105`).

Wniosek: projekt ankiety powinien być wystarczająco dobry, żeby zasilić późniejsze dopasowanie, ale nie powinien wymuszać już pełnego modelu ontologii skincare.

## Recommended Questionnaire Design

### Zasady ogólne

- Pytania powinny dotyczyć rzeczy obserwowalnych przez użytkownika, nie terminów eksperckich ani diagnoz.
- Każde pytanie powinno odnosić się do niedawnego, powtarzalnego stanu, np. "zwykle" lub "w ostatnich 2-4 tygodniach".
- Odpowiedzi najlepiej zbierać jako skala częstotliwości lub nasilenia, a potem agregować do `none|low|medium|high`.
- Dla usera pytania mogą być wielokrotnego wyboru lub krótką skalą; dla modelu domenowego wynik nadal powinien zostać sprowadzony do pięciu poziomów aspektów.

### Proponowane pytania per skin aspect

#### Sensitivity

1. Jak często skóra piecze, szczypie lub robi się nieprzyjemna po nowym produkcie?
2. Jak często pojawia się zaczerwienienie lub podrażnienie po aktywnych składnikach albo zapachu?
3. Jak często musisz uprościć pielęgnację, bo skóra "ma dość"?
4. Jak bardzo skóra reaguje na zmiany pogody, temperatury albo tarcie?

#### Pigmentation

1. Jak często zostają ślady lub ciemniejsze plamki po wypryskach?
2. Na ile nierówny jest koloryt skóry bez makijażu?
3. Jak widoczne są przebarwienia posłoneczne lub plamy, które trudno rozjaśnić?
4. Jak często masz wrażenie, że skóra wygląda na poszarzałą lub matową przez nierówny ton?

#### Firmness

1. Na ile skóra wydaje się mniej sprężysta niż wcześniej?
2. Jak widoczne są drobne linie lub oznaki utraty jędrności w spoczynku?
3. Jak często masz wrażenie, że skóra wygląda na "zmęczoną" lub mniej napiętą?
4. Na ile poprawa jędrności jest dziś realnym problemem skóry, a nie tylko drobną obserwacją?

#### Breakouts

1. Jak często pojawiają się nowe wypryski lub stany zapalne?
2. Jak często masz zapchane pory, grudki albo zaskórniki?
3. Jak duży obszar twarzy zwykle obejmują niedoskonałości?
4. Jak często niedoskonałości wracają mimo podobnej rutyny?

#### Texture

1. Jak często skóra w dotyku jest nierówna, szorstka albo "grudkowata"?
2. Jak często makijaż albo SPF układają się nierówno przez powierzchnię skóry?
3. Jak widoczne są suche skórki, drobne nierówności albo "kaszka"?
4. Jak bardzo tekstura skóry przeszkadza Ci wizualnie na co dzień?

## Recommended Mapping Logic

- 2-4 pytania per aspekt to dobry zakres, ale nie każde musi być wymagane, jeśli agregacja umie działać na 2-3 odpowiedziach.
- Najprostszy model MVP:
  - odpowiedzi na każde pytanie na skali 0-3,
  - średnia albo maksimum mapowane do `none|low|medium|high`,
  - ewentualnie jedno pytanie "impact" jako tie-breaker przy granicznych wynikach.
- Nie rób z tego testu "diagnostycznego". To ma być uporządkowany self-report wspierający personalizację.

## Tagging Recommendation

### Concerns

`concerns` powinny oznaczać obecny problem lub stan, który user chce adresować.

Proponowany canonical styl tagów:

- kebab-case
- rzeczownikowo-problemowy
- bez brandowego języka
- bez poziomu nasilenia w samym tagu

Przykładowe concern tags:

- `sensitivity`
- `redness`
- `dehydration`
- `breakouts`
- `clogged-pores`
- `pigmentation`
- `dark-spots`
- `uneven-tone`
- `texture`
- `dullness`
- `fine-lines`
- `loss-of-firmness`

### Goals

`goals` powinny oznaczać pożądany efekt, nie problem wyjściowy.

Proponowany canonical styl tagów:

- kebab-case
- czasownikowo-efektowy lub outcome-oriented
- możliwie user-facing i zrozumiały

Przykładowe goal tags:

- `calm-skin`
- `hydrate-skin`
- `clear-breakouts`
- `fade-post-acne-marks`
- `brighten-skin`
- `even-skin-tone`
- `smooth-texture`
- `strengthen-barrier`
- `reduce-oiliness`
- `improve-firmness`

### Relacja między concerns i goals

- Concern i goal nie powinny być tym samym słownikiem.
- Mogą być mapowane parami, np.:
  - `breakouts` -> `clear-breakouts`
  - `pigmentation` / `dark-spots` -> `even-skin-tone`, `brighten-skin`
  - `sensitivity` / `redness` -> `calm-skin`, `strengthen-barrier`
- Taki rozdział lepiej pasuje do późniejszego dopasowania produktów: produkt może adresować concern, a user może jednocześnie deklarować bardziej aspiracyjny goal.

## Should The UI Use Predefined Options?

Nie jako jedyny mechanizm.

Rekomendowany model:

1. `skin_type`: predefiniowane opcje.
2. `skin_aspects`: predefiniowane pytania i predefiniowana skala odpowiedzi.
3. `concerns`: sugerowane chipy + "other" + opcjonalny free text.
4. `goals`: sugerowane chipy + "other" + opcjonalny free text.

Powód:

- To jest zgodne z obecnym kierunkiem repo, które jeszcze nie chce zamykać vocabulary dla concerns/goals (`src/pages/dashboard.astro:166-181`).
- Daje szybkie, porównywalne dane do downstream AI.
- Nie blokuje usera w przypadku nietypowego problemu albo celu.

Najgorsza opcja dla tego slice'a to "tylko wolny tekst" albo "tylko twarde predefined chips".

- tylko wolny tekst: słabe do normalizacji i personalizacji,
- tylko predefined: zbyt sztywne na obecnym etapie domeny.

Najlepszy kompromis to hybryda: user wybiera z listy, ale może dopisać własne sformułowanie.

## Code References

- `src/lib/domain/user-domain.ts:9-15` - canonical enums dla `skin_type`, `skin_aspect_keys` i `skin_aspect_levels`
- `src/lib/domain/user-domain.ts:67-73` - stabilny shape `SkinAspects`
- `src/pages/api/domain/profile.ts:82-140` - walidacja wszystkich pięciu aspektów oraz wolnych list concerns/goals
- `src/pages/dashboard.astro:128-181` - obecny smoke-test UI: strukturalne skin aspects i free-form concerns/goals
- `context/foundation/roadmap.md:96-106` - zakres `S-01`
- `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:19-19` - profil ma łączyć `skin_type`, strukturalne `skin_aspects`, swobodne `concerns` i `goals`
- `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:51-51` - concerns/goals pozostają free-form, bo słownik tagów należy do kolejnych slice'ów
- `context/foundation/architecture-notes.md:95-97` - product-level `concern_tags`
- `context/foundation/architecture-notes.md:200-213` - AI łączy concern tags produktu z profilem usera

## Architecture Insights

- Repo ma już wyraźny podział pomiędzy zamkniętym kontraktem wejściowym do personalizacji (`skin_aspects`) a otwartą warstwą semantyczną, która jeszcze dojrzewa (`concerns`, `goals`).
- Jeśli onboarding ma być trwały i prosty, pytania ankietowe powinny zasilać stabilny model severity, a nie próbować rozwiązać od razu całą ontologię skincare.
- Concern tags po stronie produktu i concern/goals po stronie usera prawdopodobnie spotkają się później w warstwie mapowania lub rankingu, ale repo jeszcze nie chce zamykać tego słownika w `S-01`.

## Historical Context (from prior changes)

- `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:19` - foundation już przesądził, że profil ma łączyć structured aspects z free-form concerns/goals.
- `context/archive/2026-05-30-user-domain-persistence-contract/plan.md:51` - sensitivity zostało wchłonięte do `skin_aspects`, a concerns/goals celowo nie dostały jeszcze canonical vocabulary.
- `context/foundation/roadmap.md:96-106` - `S-01` ma dowieźć zapis podstawowego skin context, nie pełną semantyczną warstwę produktową.

## Related Research

- Brak wcześniejszych `research.md` dla tego change'a.
- Najbliższy powiązany artefakt historyczny: `context/archive/2026-05-30-user-domain-persistence-contract/plan.md`.

## Open Questions

- Czy canonical `concern_tags` produktu mają docelowo być tym samym słownikiem co normalized user concerns, czy tylko mapowanym słownikiem pokrewnym?
- Czy goals mają być wyłącznie outcome-based, czy również priority-based, np. "fast-results", "gentle-routine"?
- Czy warto zachować osobno raw user phrasing dla concerns/goals po wprowadzeniu canonical tags, np. do lepszych promptów AI?
- Czy onboarding ma pytać o "baseline skin" czy "current situation in the last 2-4 weeks"? To wpływa na stabilność odpowiedzi.

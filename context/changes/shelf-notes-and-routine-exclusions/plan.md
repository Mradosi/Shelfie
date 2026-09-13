# Notatki produktów i wykluczenia z rutyn AI — plan implementacji

## Overview

Ta zmiana pozwoli użytkownikowi zapisać krótką, prywatną notatkę przy własnym produkcie oraz oznaczyć go jako niewskazywany przez AI w propozycjach rutyny. Notatka będzie ograniczonym kontekstem dla AI, lecz tylko jawne wykluczenie będzie twardą regułą: produkt nie trafi do danych wejściowych modelu ani do zwalidowanej propozycji.

## Current State Analysis

`user_shelf_items` opisuje własność produktu przez użytkownika i ma już RLS ograniczone do właściciela, ale nie przechowuje preferencji produktu. Strona szczegółów produktu potrafi odczytać należącą do użytkownika pozycję półki, a istniejące formularze produktów używają bezpiecznego przekierowania oraz jednorazowego flash message.

Rutyna AI ładuje obecnie całą półkę podczas przygotowania analiz, budowy promptu i walidacji odpowiedzi modelu. Ręczny edytor korzysta z tej samej listy produktów i ma pozostać niezależny od wykluczenia AI.

## Desired End State

Właściciel produktu na swojej półce może na stronie szczegółów zapisać albo wyczyścić notatkę do 500 znaków i przełączyć opcję „Nie proponuj w rutynach AI”. Preferencje pozostają prywatne, przetrwają odświeżenie i nie zmieniają kanonicznego produktu ani zapisanej rutyny.

AI dostaje wyłącznie aktualne, niewykluczone produkty; dla każdego z nich może otrzymać krótką notatkę jako kontekst. Produkt wykluczony nie jest analizowany, nie trafia do promptu i nie może zostać zaakceptowany w odpowiedzi modelu. Przy pustej puli albo drafcie zawierającym wykluczony produkt użytkownik dostaje jasne, bezpieczne wyjaśnienie bez wywołania dostawcy AI.

### Key Discoveries:

- `user_shelf_items` jest właściwą granicą danych osobistych: ma relację do właściciela, trigger `updated_at` i RLS do własnego wiersza. `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:37`
- `listUserShelfCatalog` jest wspólnym odczytem dla półki, szczegółów produktu i rutyny; rozszerzenie jego typu propaguje preferencje po stronie serwera. `src/lib/domain/user-domain.ts:425`
- `parseRoutineAiProposal` ogranicza odpowiedź modelu do przekazanych `shelfItemId`, więc podanie wyłącznie dozwolonej puli mechanicznie blokuje wykluczone produkty. `src/lib/domain/routine-ai.ts:370`
- Obecny prompt zawiera także `currentDraft`; draft z wykluczonym produktem trzeba zatrzymać przed serializacją, a nie cicho modyfikować. `src/lib/domain/routine-ai.ts:482`
- Projekt już ma kontrakt publicznych błędów AI i testy Vitest, więc komunikaty dla pustej puli oraz konfliktu draftu powinny mieć stabilne, polskie kody i testy. `src/lib/domain/ai-error-contract.ts:1`

## What We're NOT Doing

- Nie wykonujemy `supabase db reset`, nie usuwamy istniejących produktów i nie modyfikujemy dotychczasowych wierszy poza bezpiecznymi wartościami domyślnymi nowej migracji.
- Nie wdrażamy pełnego S-07: taksonomii reakcji, historii reakcji, check-inów skóry, analityki ani dziennika.
- Nie zmieniamy harmonogramu rutyny, nie usuwamy automatycznie wpisów ręcznej rutyny i nie wprowadzamy wyjątków dni tygodnia.
- Nie traktujemy notatki jako diagnozy, kategorycznej porady medycznej ani polecenia dla modelu.
- Nie wysyłamy notatek produktów wykluczonych do dostawcy AI i nie wykonujemy testów z prawdziwym modelem jako bramki jakości.

## Implementation Approach

Nowa migracja addytywnie doda pola preferencji do `user_shelf_items`. Warstwa domenowa i endpoint formularza będą zawsze aktualizowały wiersz po `id` oraz `user_id`. UI szczegółów produktu posłuży do edycji, a ręczny edytor jedynie wyświetli etykietę wykluczenia.

Po stronie rutyn AI powstanie jedna serwerowa lista `eligibleShelf`, wyliczona po odczycie pełnej własnej półki. Ta sama lista będzie używana do przygotowania interpretacji, budowania danych promptu, odczytu produktów, walidacji propozycji i odcisku oceny. Nieufna notatka pojawi się tylko przy elemencie tej listy, z instrukcją dla modelu, by traktować ją jako dane kontekstowe, a nie polecenie.

## Critical Implementation Details

Wykluczony produkt pozostaje dostępny w ręcznym edytorze, ale AI nie może go nawet zobaczyć. Jeżeli aktualny zapisany draft go zawiera, endpoint zwraca zdefiniowany błąd konfliktu z instrukcją ręcznego usunięcia wpisu albo cofnięcia wykluczenia; nie może samodzielnie zmienić ani zapisać rutyny.

## Phase 1: Preferencje prywatnej pozycji półki

### Overview

Rozszerzyć trwały model własnej pozycji na półce bez ingerowania w dane produktów współdzielonych oraz bez resetowania lokalnej bazy.

### Changes Required:

#### 1. Addytywna migracja preferencji

**File**: `supabase/migrations/<timestamp>_shelf_item_preferences.sql`

**Intent**: Dodać do istniejących wierszy półki opcjonalną notatkę i trwałe wykluczenie z AI, zachowując wszystkie obecne dane.

**Contract**: Dodać `note text null` oraz `exclude_from_ai_routines boolean not null default false`; ograniczyć niepustą notatkę do 500 znaków w bazie. Nie zmieniać istniejących polityk RLS, triggerów ani danych. Migracja jest uruchamiana tylko przez `npx supabase migration up`.

#### 2. Typy i helper domenowy

**File**: `src/lib/domain/user-domain.ts`

**Intent**: Udostępnić preferencje wszystkim bezpiecznym odczytom pozycji półki oraz dodać jeden właścicielski zapis.

**Contract**: Rozszerzyć selekcje, row mappers, `UserShelfItem` i `UserShelfCatalogItem` o `note` oraz `excludeFromAiRoutines`. Dodać `updateUserShelfItemPreferences`, który normalizuje pustą notatkę do `null`, ogranicza zapis do `id` i `user_id` oraz zwraca zaktualizowaną pozycję lub jawny brak własnego wiersza.

#### 3. Kontrakt danych i migracji

**File**: nowe lub istniejące testy domeny użytkownika

**Intent**: Utrwalić normalizację notatki i domyślne wykluczenie, aby interfejs nie zależał wyłącznie od zachowania formularza.

**Contract**: Testy obejmują pustą notatkę, przycięcie tekstu, domyślne `false` oraz brak możliwości aktualizacji wiersza innego użytkownika przez helper.

### Success Criteria:

#### Automated Verification:

- Nowa migracja stosuje się przez `npx supabase migration up` bez resetu bazy.
- Typy oraz helper poprawnie mapują i zapisują `note` oraz `excludeFromAiRoutines`.
- Testy domeny i `npm test` przechodzą.

#### Manual Verification:

- Po migracji istniejące produkty użytkownika nadal są widoczne, a ich nowe wartości mają `note = null` i wykluczenie wyłączone.

## Phase 2: Edycja preferencji na szczegółach produktu

### Overview

Dać właścicielowi prostą, bezpieczną edycję notatki i wykluczenia dokładnie w miejscu, gdzie ogląda dany produkt.

### Changes Required:

#### 1. Endpoint preferencji pozycji półki

**File**: `src/pages/api/domain/products/shelf-preferences.ts`

**Intent**: Obsłużyć formularz właściciela, walidację i przekierowanie bez przekazywania komunikatów w URL.

**Contract**: Endpoint `POST` przyjmuje `shelfItemId`, `note`, checkbox wykluczenia i wewnętrzne ścieżki sukcesu/błędu. Wymaga zalogowanego użytkownika, odrzuca notatkę dłuższą niż 500 znaków, traktuje brak checkboxa jako `false`, używa helpera domenowego oraz ustawia flash message. Nie ujawnia, czy cudzy identyfikator istnieje.

#### 2. Formularz preferencji

**File**: `src/components/products/ShelfItemPreferencesForm.astro`

**Intent**: Pokazać notatkę i niezależny przełącznik wykluczenia w języku zrozumiałym dla użytkownika.

**Contract**: Formularz zawiera textarea z licznikiem/limitem 500 znaków oraz checkbox „Nie proponuj w rutynach AI”. Wyjaśnia, że ustawienie nie usuwa produktu z półki ani ręcznej rutyny, a notatka niewykluczonego produktu może być przekazana do AI jako kontekst.

#### 3. Szczegóły produktu i ręczny edytor

**Files**: `src/pages/products/[productId].astro`, `src/components/routine/ManualRoutineEditor.tsx`

**Intent**: Zamontować formularz tylko dla własnego produktu z półki i wyraźnie zachować manualną kontrolę.

**Contract**: Strona szczegółów przekazuje pełną pozycję półki do formularza. Ręczny edytor pozostawia wykluczone elementy w selektorze i istniejących wpisach, ale oznacza je tekstem/chipem „Wykluczony tylko z AI”. Nie zmienia zapisu `user_routine_configs`.

### Success Criteria:

#### Automated Verification:

- Endpoint odrzuca anonimowe żądanie, błędny/cudzy identyfikator oraz notatkę ponad 500 znaków.
- Pusty tekst zapisuje się jako brak notatki, a przełączenie wykluczenia nie kasuje notatki.
- `npm test`, `npx astro sync` i `npm run lint` przechodzą.

#### Manual Verification:

- Właściciel może zapisać, odświeżyć, zmienić i usunąć notatkę na szczegółach własnego produktu.
- Wykluczony produkt pozostaje na półce i w ręcznym edytorze, ale jest wyraźnie oznaczony.

## Phase 3: Twarde wykluczenie w rutynach AI

### Overview

Wprowadzić jednoznaczny serwerowy filtr przed każdym etapem AI i ograniczony, odporny na prompt injection kontekst notatek.

### Changes Required:

#### 1. Publiczne błędy dla ograniczeń AI

**File**: `src/lib/domain/ai-error-contract.ts`

**Intent**: Zamiast ogólnego błędu zwrócić użytkownikowi stabilny komunikat, gdy nie ma produktu dostępnego dla AI albo draft zawiera wykluczony wpis.

**Contract**: Dodać bezpieczne kody/komunikaty dla pustej kwalifikowanej półki i dla drafu zawierającego produkt wykluczony z AI. Nie przekazywać surowej treści notatki, błędów providera ani danych innego użytkownika.

#### 2. Kwalifikowana półka w endpointcie rutyn AI

**File**: `src/pages/api/domain/routine/ai.ts`

**Intent**: Ustanowić `eligibleShelf` jako jedyne źródło produktów dla AI.

**Contract**: Po sprawdzeniu pełnej własności produktu wyliczać niewykluczone elementy. `prepare_shelf` przygotowuje interpretacje tylko dla tej listy; `generate_proposal` odrzuca draft z wykluczonym elementem, pustą listę oraz brak gotowych interpretacji tylko w kwalifikowanej puli. `evaluate_candidates` nadal wyklucza wszystkie produkty już posiadane przez użytkownika. Żadna z tych ścieżek nie zmienia zapisanej rutyny.

#### 3. Prompt, walidacja i odcisk oceny

**Files**: `src/lib/domain/routine-ai.ts`, `src/lib/domain/routine-ai-assessment.ts`, `src/lib/integrations/openrouter-routine-draft.ts`, `src/pages/routine.astro`

**Intent**: Ograniczyć dane modelu do kwalifikowanej półki oraz unieważniać ocenę, kiedy źródłowe preferencje wpływają na jej aktualność.

**Contract**: Serializacja promptu zawiera `note` wyłącznie przy kwalifikowanych produktach, z ograniczoną długością. Prompt mówi, że notatka jest nieufnym opisem doświadczenia użytkownika, a nie instrukcją, nie może być cytowana jako porada medyczna i nie zastępuje serwerowej polityki. Parser propozycji otrzymuje wyłącznie kwalifikowane identyfikatory. Zwiększyć wersję promptu/kontraktu odcisku tam, gdzie zmienia się semantyka wejścia; ocena zapisanej rutyny z wykluczonym wpisem ma stan nieaktualny zamiast cichego częściowego przetworzenia.

#### 4. Obsługa komunikatu w workspace

**File**: `src/components/routine/RoutineWorkspace.tsx`

**Intent**: Wytłumaczyć blokadę AI bez kasowania ręcznego draftu i bez pozostawienia nieokreślonego loadera.

**Contract**: Pusta kwalifikowana półka pokazuje instrukcję przywrócenia co najmniej jednego produktu do AI. Draft zawierający wykluczony produkt pokazuje instrukcję usunięcia go z ręcznej rutyny lub cofnięcia ustawienia. Po korekcie użytkownik może ponowić działanie; proposal i manual draft nie są automatycznie modyfikowane.

### Success Criteria:

#### Automated Verification:

- Produkt wykluczony nie jest przygotowywany do analizy, nie występuje w danych promptu i nie przechodzi walidacji odpowiedzi zawierającej jego ID.
- Niewykluczona notatka trafia do danych promptu jako kontekst, a notatka wykluczonego produktu nie trafia do providera.
- Pusta kwalifikowana półka i draft z wykluczonym wpisem kończą się deterministycznym, publicznym błędem bez wywołania providera.
- Zmiana notatki/wykluczenia istotna dla zapisanej oceny nie pozwala pokazać jej jako aktualnej.
- `npm test`, `npx astro sync`, `npm run lint` i `npm run build` przechodzą.

#### Manual Verification:

- Użytkownik wyklucza produkt, uruchamia AI i widzi, że produkt nie jest proponowany; ręcznie może go nadal pozostawić lub dodać do rutyny.
- Po wykluczeniu wszystkich produktów AI pokazuje instrukcję bez kosztownego żądania do modelu.
- Gdy zapisany draft zawiera później wykluczony produkt, AI prosi o świadomą korektę; nie usuwa wpisu ani nie zapisuje rutyny samodzielnie.

## Testing Strategy

### Unit Tests:

- Normalizacja i właścicielski zapis preferencji półki.
- Serializacja promptu: obecność notatki dozwolonego produktu i nieobecność wykluczonego.
- Parser propozycji: odrzucenie ID wykluczonego produktu mimo jego własności przez użytkownika.
- Publiczne kody błędów dla braku produktów dostępnych dla AI i konfliktu draftu.

### Integration Tests:

- Route preferencji z autoryzacją, walidacją długości i flash redirect.
- Route AI z mockowanym providerem: filtr przed przygotowaniem, brak wywołania przy wszystkich wykluczonych oraz blokada drafu.
- Odcisk oceny nie uznaje starej oceny za aktualną po zmianie danych wejściowych istotnych dla AI.

### Manual Testing Steps:

1. Na szczegółach produktu z półki zapisz notatkę, odśwież stronę, wyczyść notatkę i potwierdź trwałość obu stanów.
2. Włącz wykluczenie, sprawdź etykietę w ręcznym edytorze i potwierdź, że produkt nadal można dodać ręcznie.
3. Wygeneruj propozycję AI z jednym wykluczonym produktem oraz z niepustą notatką przy innym produkcie; potwierdź, że model nie widzi wykluczonego produktu, a wynik pozostaje do zatwierdzenia.
4. Wyklucz wszystkie produkty i sprawdź czytelny komunikat bez generowania propozycji.
5. Umieść produkt w ręcznej rutynie, potem go wyklucz i sprawdź, że AI żąda korekty bez zmiany zapisanej rutyny.

## Performance Considerations

Filtr zmniejsza, a nie zwiększa liczbę analiz AI: wykluczone produkty nie są przygotowywane ani wysyłane do modelu. Notatki są ograniczone do 500 znaków na produkt; nie dodajemy pętli, kolejki ani dodatkowego wywołania providera.

## Migration Notes

Migracja jest wyłącznie addytywna. Wdrożenie lokalne używa `npx supabase migration up`, zgodnie z regułą projektu zachowania bieżących danych. `npx supabase db reset` jest poza zakresem tej zmiany i nie może być użyte podczas jej implementacji ani weryfikacji.

## References

- Zmiana: `context/changes/shelf-notes-and-routine-exclusions/change.md`
- Wymagania notatek i prywatności: `context/foundation/prd.md:83`, `context/foundation/prd.md:127`
- Granica S-07: `context/foundation/roadmap.md:263`
- Reguła migracji bez resetu: `context/foundation/lessons.md:3`
- Pozycje półki i RLS: `supabase/migrations/20260530090000_user_domain_persistence_contract.sql:37`
- Obecny przepływ AI: `src/pages/api/domain/routine/ai.ts:98`
- Walidacja propozycji: `src/lib/domain/routine-ai.ts:370`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Preferencje prywatnej pozycji półki

#### Automated

- [ ] 1.1 Addytywna migracja preferencji stosuje się bez resetu bazy.
- [x] 1.2 Typy, helper i testy preferencji pozycji półki przechodzą.

#### Manual

- [ ] 1.3 Istniejące produkty pozostają widoczne po migracji.

### Phase 2: Edycja preferencji na szczegółach produktu

#### Automated

- [x] 2.1 Endpoint preferencji waliduje właściciela, notatkę i bezpieczne przekierowanie.
- [x] 2.2 Formularz i ręczny edytor kompilują się z widocznym stanem wykluczenia.
- [x] 2.3 Testy, Astro sync i lint przechodzą.

#### Manual

- [ ] 2.4 Notatkę i wykluczenie można zapisać, odświeżyć i zmienić bez wpływu na ręczną rutynę.

### Phase 3: Twarde wykluczenie w rutynach AI

#### Automated

- [x] 3.1 Filtr AI usuwa wykluczone produkty z przygotowania, promptu i walidacji propozycji.
- [x] 3.2 Notatki dozwolonych produktów oraz bezpieczne błędy graniczne mają testy.
- [x] 3.3 Odcisk oceny i UI nie pokazują nieaktualnej oceny po zmianie preferencji.
- [x] 3.4 Testy, Astro sync, lint i build przechodzą.

#### Manual

- [ ] 3.5 AI respektuje wykluczenie, a użytkownik może zachować ręczną rutynę i świadomie naprawić konflikt draftu.

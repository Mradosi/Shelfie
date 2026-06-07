# Shelfie — Wstępny Pomysł Produktu i Notatki MVP

## Główna Idea Produktu

Shelfie to mobilna aplikacja skincare skoncentrowana na pomaganiu użytkownikom w zarządzaniu kosmetykami, rutynami pielęgnacyjnymi, reakcjami skóry oraz tymczasowymi modyfikacjami rutyny w jednym miejscu.

Aplikacja łączy:

- zarządzanie kosmetycznym inventory,
- AI-assisted understanding produktów,
- planowanie rutyn pielęgnacyjnych,
- tymczasowe dostosowywanie rutyn,
- analizę konfliktów składników i rutyn,
- historię oraz feedback użytkownika.

Główną ideą nie jest jedynie śledzenie produktów, ale pomaganie użytkownikowi zrozumieć:

- co już posiada,
- jak poprawnie używać produktów,
- jak bezpiecznie łączyć produkty,
- jak upraszczać rutyny,
- jak tymczasowo dostosowywać rutynę do realnych sytuacji.

Aplikacja powinna sprawiać wrażenie inteligentnego skincare assistanta, a nie statycznej checklisty czy kosmetycznej bazy danych.

---

# Pozycjonowanie Produktu

Shelfie ma być:

- osobistym skincare companionem,
- AI-assisted organizerem pielęgnacji,
- systemem do zarządzania rutyną i kosmetykami.

Produkt nie ma stać się:

- aplikacją do diagnoz dermatologicznych,
- narzędziem medycznym,
- beauty social networkiem,
- marketplace’em,
- pełną encyklopedią kosmetyków.

Aplikacja powinna pozostać praktyczna, lekka i skupiona na pomaganiu użytkownikowi w zarządzaniu własnymi produktami i rutynami.

---

# Główne Problemy Użytkownika

Użytkownicy często:

- posiadają zbyt wiele kosmetyków,
- zapominają, co już mają,
- przypadkowo kupują duplikaty,
- używają zbyt wielu aktywnych składników jednocześnie,
- nie wiedzą, jak poprawnie układać rutyny,
- są przytłoczeni skincare poradami z internetu,
- zapominają o terminach ważności i datach otwarcia,
- mają problem z tymczasowym dostosowywaniem rutyn po zabiegach lub podrażnieniach.

Wielu użytkowników również:

- testuje wiele produktów jednocześnie,
- nie wie, czy produkt pomaga czy podrażnia,
- chce AI assistance bez konieczności posiadania zaawansowanej wiedzy skincare.

---

# Główny Kierunek Produktu

Shelfie powinno łączyć:

- uporządkowane cosmetic inventory,
- AI-powered assistance,
- persistent user context,
- personalizowane rutyny,
- dostosowywanie rutyn w czasie.

Aplikacja nie powinna działać jak generic chatbot.

AI powinno operować na:

- rzeczywistych produktach użytkownika,
- historii rutyn,
- metadatach produktów,
- reakcjach i feedbacku,
- tymczasowych sytuacjach skóry.

To tworzy bardziej użyteczne i personalizowane doświadczenie niż zwykłe promptowanie AI.

---

# Główne Obszary Produktu

## 1. Cosmetic Shelf / Inventory

Użytkownicy mogą:

- dodawać produkty,
- organizować produkty,
- widzieć, co aktualnie posiadają,
- śledzić otwarte produkty,
- śledzić expiration/PAO,
- dodawać notatki i reakcje.

Inventory jest centralnym source of truth aplikacji.

Produkty mogą obejmować:

- cleanser,
- serum,
- moisturizer,
- SPF,
- toner,
- acids,
- retinoids,
- masks,
- eye creams,
- barrier-repair products,
- itd.

---

## 2. AI-Assisted Dodawanie Produktów

Użytkownik powinien mieć możliwość dodawania produktów na kilka sposobów.

### Opcja A — Upload Zdjęcia

Użytkownik:

- uploaduje zdjęcie,
- robi zdjęcie aparatem telefonu,
- uploaduje screenshot,
- uploaduje zdjęcie z galerii.

AI wyciąga:

- markę,
- nazwę produktu,
- kategorię,
- potencjalne aktywne składniki,
- potencjalne ostrzeżenia,
- preview zdjęcia.

Aplikacja zawsze powinna pokazywać ekran potwierdzenia przed zapisaniem.

AI powinno pomagać, a nie automatycznie modyfikować dane użytkownika bez potwierdzenia.

---

### Opcja B — Wyszukiwanie po Nazwie

Jeżeli użytkownik nie może zrobić zdjęcia:

- może ręcznie wpisać markę + nazwę produktu.

System:

- wyszukuje potencjalne dopasowania,
- proponuje istniejące produkty,
- pozwala użytkownikowi potwierdzić wybór.

Jeżeli produkt nie istnieje:

- można stworzyć nowy wpis produktu.

---

### Opcja C — W Pełni Manualne Dodawanie

Użytkownik może dodać produkt całkowicie ręcznie bez AI.

Aplikacja nadal powinna:

- wyszukiwać potencjalne dopasowania,
- pozwalać stworzyć nowy produkt, jeśli potrzeba.

---

# Kierunek Modelu Danych

Aplikacja powinna prawdopodobnie używać dwóch połączonych modeli.

## Product

Ogólne/wspólne dane kosmetyku.

Reprezentuje:

- czym jest kosmetyk.

Możliwe pola:

- marka,
- nazwa,
- kategoria,
- tekst składu,
- aktywne składniki,
- zdjęcie,
- ostrzeżenia,
- source type,
- confidence level.

To działa jako współdzielony katalog produktów.

---

## UserProduct

Reprezentuje konkretny egzemplarz produktu należący do użytkownika.

Reprezentuje:

- jak użytkownik korzysta z produktu.

Możliwe pola:

- data otwarcia,
- data ważności,
- notatki,
- status reakcji,
- częstotliwość użycia,
- favorite flag,
- osobiste obserwacje.

Ten podział pozwala unikać duplikatów produktów, jednocześnie wspierając personalizację.

Użytkownik głównie korzysta ze swojej półki, a nie bezpośrednio z globalnego katalogu.

---

# AI Routine Builder

Jedna z głównych funkcji AI.

Użytkownik może:

- mieć już istniejącą rutynę,
- nie mieć rutyny i chcieć, żeby AI ją stworzyło.

---

## Analiza Istniejącej Rutyny

Użytkownik może:

- wprowadzić aktualną rutynę,
- dodać istniejące produkty,
- pozwolić AI przeanalizować rutynę.

AI może:

- wykrywać overuse aktywnych składników,
- wykrywać potencjalnie drażniące połączenia,
- identyfikować duplikujące się role produktów,
- upraszczać rutyny,
- sugerować lepszą kolejność,
- sugerować recovery/rest days,
- wykrywać brak SPF,
- sugerować bardziej zbalansowaną strukturę tygodnia.

---

## Rutyna Generowana przez AI

Użytkownik może również:

- zacząć od zera.

AI powinno brać pod uwagę:

- typ skóry,
- cele skincare,
- wrażliwość skóry,
- posiadane produkty,
- preferowany poziom skomplikowania,
- preferowaną liczbę kroków,
- aktywne składniki.

AI może generować:

- poranne rutyny,
- wieczorne rutyny,
- tygodniowe rutyny,
- strukturę active/recovery days.

Przykład:

- retinol nights,
- acid nights,
- hydration/recovery nights,
- simplified barrier repair days.

---

# Tygodniowa Struktura Rutyny

Aplikacja powinna wspierać rutyny różniące się zależnie od dnia.

Przykład:

- poniedziałek: retinol,
- wtorek: nawilżanie,
- środa: kwasy,
- czwartek: recovery,
- piątek: retinol,
- itd.

Aplikacja nie powinna zakładać, że skincare routine jest codziennie identyczna.

---

# Tymczasowe Modyfikacje Rutyny

Jeden z najważniejszych pomysłów produktowych.

Użytkownicy powinni móc tymczasowo modyfikować rutyny w zależności od sytuacji.

Przykłady:

- post-microneedling,
- irritated skin,
- damaged barrier,
- strong breakout,
- sunny vacation,
- introducing new active ingredient,
- temporary sensitivity.

Przykładowy flow:

- użytkownik mówi, że miał mezoterapię,
- AI tymczasowo usuwa retinol/kwasy,
- AI zwiększa nacisk na recovery-focused products,
- AI tworzy tymczasową recovery routine,
- po określonym czasie rutyna wraca do normalnego stanu.

Bazowa rutyna powinna pozostać nienaruszona.

Tymczasowe zmiany powinny działać jako overlays/overrides, a nie permanentne edycje.

---

# AI Check-Ins & Feedback Loop

Użytkownik powinien móc przekazywać feedback w czasie.

Przykłady:

- irritation,
- dryness,
- breakouts,
- redness,
- improvement,
- sensitivity,
- uncertainty.

AI może wtedy:

- sugerować tymczasowe uproszczenie,
- zmniejszać częstotliwość aktywnych składników,
- sugerować recovery routines,
- identyfikować potencjalnie drażniące produkty,
- sugerować odstawienie niektórych produktów.

Produkt powinien pozostać w obszarze wellness/skincare assistance, a nie diagnozy medycznej.

---

# Analiza Składów / Produktów

Użytkownik może:

- uploadować zdjęcia produktów,
- uploadować zdjęcia składów,
- wyszukiwać produkty manualnie.

AI może:

- identyfikować aktywne składniki,
- identyfikować potencjalnie drażniące składniki,
- porównywać produkty z istniejącymi produktami użytkownika,
- identyfikować duplikaty,
- tłumaczyć role produktów,
- tłumaczyć potencjalne konflikty.

Przykładowe odpowiedzi AI:

- ten produkt jest podobny do innego produktu, który już posiadasz,
- ten produkt może dublować działanie innego serum,
- to połączenie może być drażniące,
- ten produkt może pasować do Twojej aktualnej rutyny,
- ten produkt może być niepotrzebny.

---

# Mobile-First / Kierunek PWA

Aplikacja powinna być projektowana przede wszystkim pod:

- telefony,
- szybkie codzienne użycie,
- użycie w łazience/sklepie,
- skanowanie produktów,
- szybkie sprawdzanie rutyny.

Aplikacja powinna być prawdopodobnie:

- web appką opartą o React,
- mobile-first,
- instalowalna jako PWA.

Potencjalne korzyści PWA:

- instalacja na ekranie głównym,
- push notifications w przyszłości,
- bardziej app-like experience.

---

# Voice / Dyktowanie

Aplikacja może później wspierać AI-assisted voice dictation.

Przykład:

- użytkownik klika mikrofon,
- nagrywa krótką wiadomość,
- speech-to-text generuje tekst,
- użytkownik przegląda wygenerowany tekst,
- użytkownik potwierdza wysłanie,
- AI przetwarza request.

Przykład:
"Miałam dziś mezoterapię igłową. Usuń retinol i kwasy na tydzień."

Wygenerowany tekst powinien zawsze być widoczny i edytowalny przed wykonaniem akcji.

MVP może głównie opierać się na:

- standardowym wpisywaniu tekstu,
- natywnym dyktowaniu z klawiatury telefonu.

Pełna obsługa voice może pozostać późniejszym enhancementem.

---

# Sugerowany Zakres MVP

Potencjalne funkcje MVP:

- authentication,
- cosmetic shelf/inventory,
- AI-assisted product adding,
- wsparcie uploadu zdjęć,
- manualne dodawanie produktów,
- prosty reusable product catalog,
- AI routine builder,
- tygodniowa struktura rutyny,
- temporary routine overrides,
- analiza konfliktów składników,
- feedback/check-ins,
- basic mobile-first UI,
- wsparcie PWA.

---

# Explicit Non-Goals / Poza Zakresem MVP

MVP NIE powinno zawierać:

- diagnoz dermatologicznych,
- medical claims,
- social feedu,
- influencer ecosystem,
- marketplace/e-commerce,
- advanced ingredient science engine,
- barcode scanning,
- advanced OCR pipelines,
- automatycznej analizy twarzy,
- analizy progress photos,
- pełnej encyklopedii kosmetyków,
- zaawansowanego recommendation engine,
- community moderation,
- shopping integrations,
- automatycznych zakupów,
- zaawansowanego systemu push notifications,
- zaawansowanej analityki.

---

# Filozofia Produktu

Aplikacja powinna sprawiać wrażenie:

- spokojnej,
- personalnej,
- inteligentnej,
- wspierającej,
- lekkiej,
- skoncentrowanej na skincare.

Powinna redukować:

- confusion,
- routine chaos,
- ingredient misuse,
- product overload,
- decision fatigue.

Aplikacja nie powinna stać się:

- enterprise dashboardem,
- beauty social networkiem,
- scientific laboratory,
- generic AI wrapperem.

Kluczową wartością jest persistent personalized skincare context połączony z praktyczną AI assistance.

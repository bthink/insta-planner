# InstaPlanner - Plan implementacji

Wersja: 0.2, 2026-10-10. Roboczy plan dla agenta Codex, powiązany z [[InstaPlanner - PRD]].

## Zasady przekazania

- Najpierw przeczytaj [[InstaPlanner]] i PRD. Potwierdzone wymagania mają pierwszeństwo przed rekomendacjami.
- Otwarte decyzje produktowe domknąć z użytkownikiem przed zależną implementacją. Drobne wybory bibliotek rozstrzyga agent na podstawie wymagań i oficjalnej dokumentacji.
- Kod aplikacji powstaje w osobnym repozytorium wskazanym przez użytkownika, poza vaultem. Vault zawiera dokumentację.
- Folder danych jest osobny od repozytorium. Nie dodawać do Git bazy, zdjęć ani sekretów.
- Implementuj kolejne działające etapy. Każdy etap ma demonstrację i konkretne kryterium zakończenia.
- Aktualizuj krótką listę wykonanych etapów, decyzji i znanych ograniczeń w repozytorium. Nie zastępuj funkcjonalności rozbudowaną dokumentacją.

## Etap 0. Domknięcie zakresu i konfiguracji

Zadania:
- Uwzględnić potwierdzone ustalenia: publikacja oznaczana wyłącznie ręcznie, gotowe media i wspólny podpis IG/FB. Nie pytać ponownie o te decyzje.
- Bazowa rekomendacja oszczędzania dysku: historia w bazie i media w bibliotece, usuwanie dodatkowej paczki po ręcznym oznaczeniu publikacji, bez katalogu `opublikowane` z kopiami.
- Domknąć pozostałe propozycje PRD wpływające na zakres pierwszej wersji.
- Ustalić ścieżkę repozytorium oraz folder danych.
- Potwierdzić docelowy Mac, przeglądarkę i sposób jednorazowego podania klucza.
- Dobrać aktualne zgodne wersje zależności. Dla kalendarza sprawdzić podstawowy widok miesiąca, drag and drop i licencję; nie używać płatnych dodatków bez potrzeby.
- Przygotować fixture: dwa konta, kilka własnych/testowych zdjęć, krótki MP4/MOV i polski podpis z nowymi liniami.

Wynik: jednoznaczny zakres pierwszej wersji, wybrane ścieżki i sposób uruchamiania. Nie trzeba przygotowywać kompletnego design systemu.

## Etap 1. Fundament lokalnej aplikacji

Zadania:
- Next.js + TypeScript, obsługa API i plików w Node.js runtime.
- SQLite i migracje schematu. Metadane w bazie, pliki poza bazą.
- Konfiguracja folderu danych po stronie serwera; tworzenie wymaganych katalogów i czytelne zgłaszanie braku dostępu.
- CRUD kont, ich kolory, kontekst i wybór aktywnego konta.
- Szkielet widoku: pasek konta, kalendarz, panel boczny, ustawienia.
- Serwer nasłuchuje na `127.0.0.1`. Kontrola pochodzenia żądań zmieniających dane i ograniczenie operacji plikowych do skonfigurowanego folderu.
- Ścieżki plików wyprowadzać z identyfikatorów po stronie serwera. Nie przyjmować dowolnych ścieżek z UI; uwzględnić symlinki i próby wyjścia poza katalog.

Koniec etapu: dwa konta z kolorami i kontekstem pozostają dostępne po restarcie. Użytkownik może pokazać działający ekran w przeglądarce.

## Etap 2. Biblioteka mediów

Zadania:
- Import wielu zdjęć i filmów; czytelny postęp oraz wynik dla każdego pliku.
- Bezpieczny zapis kopii z własnym identyfikatorem, niezależnie od nazwy źródłowej.
- Miniatury zdjęć i filmów. Ustalić jednorazową instalację lub dostarczenie FFmpeg na Macu i opisać ją.
- Siatka, zaznaczanie i dodawanie wybranych mediów do posta.
- Kopiowanie medium do konta docelowego przez niezależny rekord i zarządzaną kopię; optymalizacja deduplikacji między kontami poza MVP.
- Opcjonalna deduplikacja importu w obrębie konta po hash zawartości; duplikat nie może cicho nadpisać istniejącego pliku.
- Import i miniatury przetwarzać z ograniczoną współbieżnością. Nie ładować całych dużych filmów do pamięci.
- Sprawdzać rzeczywisty obsługiwany typ, a nie tylko rozszerzenie. Brak miniatury nie oznacza utraty oryginału.

Koniec etapu: zdjęcia i film dają się importować, oglądać jako miniatury i kopiować między kontami. Przeniesienie źródła w Finderze nie psuje zaimportowanego medium.

## Etap 3. Posty i pomysły

Zadania:
- Rekord posta/pomysłu, dialog edycji, tytuł, notatka, podpis, typ i opcjonalna data.
- Siatka zdjęć, numeracja, zmiana kolejności, dodawanie i odpinanie mediów.
- Kolejka bez daty. Konwersja pomysłu do posta przez uzupełnienie tego samego rekordu.
- Kopiowanie podpisu z zachowaniem formatowania.
- Wyraźne zapisywanie, obsługa niezapisanych zmian i usuwanie posta bez usuwania źródłowych mediów.
- Ręczne oznaczenie opublikowania i możliwość cofnięcia pomyłki. Data nigdy nie uruchamia oznaczania publikacji.
- Jeżeli zatwierdzone: ręczna gotowość i informacja o wcześniejszym użyciu medium; „opublikowane” dla mediów wynika wyłącznie z ręcznej akcji na poście.
- Jeden wspólny podpis IG/FB. Import i eksport gotowych mediów zachowuje oryginalną jakość.

Koniec etapu: można przygotować kilka kompletnych postów i kilka pomysłów, wrócić do nich po restarcie i skopiować podpis.

## Etap 4. Kalendarz

Zadania:
- Widok miesiąca z polskimi nazwami, poniedziałkiem jako początkiem tygodnia i przyciskiem „Dzisiaj”.
- Kafelki postów, otwieranie dialogu, przeciąganie z kolejki i między dniami.
- Równoważne ustawianie/usuwanie daty w dialogu.
- Serwerowa walidacja limitu jednego posta na konto i dzień, z ograniczeniem unikalności w bazie.
- Odrzucenie kolizji bez częściowego zapisu i przywrócenie kafelka w UI.
- Przechowywać dzień jako `YYYY-MM-DD`, bez konwersji przez UTC przesuwającej datę.
- Oznaczenie „Zaległy” wyliczać z daty i braku ręcznego potwierdzenia publikacji. Nie zmieniać statusu, nie usuwać paczki i nie odznaczać mediów po upływie terminu.
- Zaległe posty można przekładać; publikacja jest potwierdzana ręcznie również po terminie.

Koniec etapu: dziesięć postów daje się rozplanować i przełożyć. Dwa konta mają niezależną dostępność dni; zajęty dzień nie powoduje utraty postów.

## Etap 5. Automatyczne paczki

To kluczowy etap produktu. Zrealizować przed integracją AI.

Zadania:
- Eksport numerowanych kopii mediów, `podpis.txt` i manifestu dla każdego zapisanego nieopublikowanego posta z datą, również zaległego.
- Zapamiętana ścieżka poprzedniego eksportu i wersja posta.
- Zmiana daty/tytułu przenosi aktualną paczkę; zmiana mediów usuwa nieaktualne kopie z zarządzanej paczki.
- Strategia odporna na przerwanie: zapis do folderu tymczasowego na tym samym dysku, podmiana paczki z możliwością odzyskania poprzedniej wersji, oznaczenie sukcesu dopiero po zakończeniu.
- Nie zakładać wspólnej transakcji SQLite i systemu plików. Zapisać potrzebę eksportu razem ze zmianą posta, a jego wykonanie rozliczać oddzielnie.
- Eksporty serializować per post; wersję weryfikować, żeby starszy eksport nie zastąpił nowszego.
- Rekonsyliacja przy starcie: wykrycie niezakończonego eksportu, ponowienie i bezpieczne uporządkowanie zarządzanych starych ścieżek.
- Status aktualności, komunikat błędu, ręczne ponowienie i otwieranie folderu w Finderze przez lokalny serwer.
- Brak daty usuwa aktywny eksport. Usunięcie posta czyści tylko paczkę rozpoznaną po identyfikatorze i nie kasuje biblioteki.
- Ręczne oznaczenie publikacji utrwala status i historię w bazie, następnie usuwa zarządzaną paczkę z `kolejka`. Zachować podpis, kolejność i media w bibliotece; nie tworzyć archiwalnych kopii mediów.
- Oddzielny stan czyszczenia umożliwia ponowienie po awarii bez cofania zapisanego potwierdzenia publikacji. Przy starcie dokończyć czyszczenie, zamiast odtwarzać paczkę opublikowanego posta.
- Eksport w toku nie może ponownie utworzyć kolejki po oznaczeniu publikacji. Przed finalizacją sprawdzić wersję i bieżące uprawnienie posta do automatycznego eksportu.
- Cofnięcie ręcznego oznaczenia odtwarza paczkę dla posta z datą. Zachowanie daty przeszłej daje ponownie oznaczenie „Zaległy”.
- Eksport z historii na żądanie zapisuje jedną paczkę na post w `eksporty`, bez zmiany statusu, z możliwością usunięcia dodatkowej kopii. Sama edycja opublikowanego posta nie generuje paczki.
- Błąd eksportu zachowuje zapisane dane i ostatnią dobrą paczkę, ale nie może oznaczać jej jako aktualnej.

Koniec etapu: pełny przebieg od mediów do folderu działa również po edycji, zmianie daty i restarcie po przerwaniu eksportu.

## Etap 6. Podpisy przez OpenAI

Zadania:
- Oficjalny SDK, Responses API z wejściem obrazowym i model wskazany w lokalnej konfiguracji.
- Klucz po stronie serwera, poza kopiami danych. Bez klucza aplikacja pozostaje używalna.
- Składanie kontekstu konta, danych posta i wybranych obrazów. Do API wysyłać osobne, zmniejszone obrazy, pozostawiając oryginały eksportowe nietknięte.
- Rolka korzysta z miniatury i notatki, bez wysyłania filmu.
- Stan ładowania, propozycja do zaakceptowania, ponowne generowanie i zachowanie istniejącego tekstu.
- Jeżeli użytkownik w trakcie żądania przełączy konto lub post, odpowiedź pozostaje przypisana do pierwotnego posta i nie nadpisuje innego.
- Jasna informacja, jakie materiały zostają wysłane do OpenAI.
- Brak automatycznych płatnych żądań po każdej edycji i nieograniczonych ponowień.

Koniec etapu: podpis uwzględnia właściwe konto i zdjęcie, można go świadomie przyjąć, a awaria API nie zakłóca planowania.

## Etap 7. Codzienne używanie i odbiór

Zadania:
- Skrót macOS uruchamia produkcyjnie zbudowaną aplikację lokalną i otwiera właściwy adres w przeglądarce.
- Powtórne użycie skrótu otwiera istniejącą instancję. Nie tworzy kolejnych serwerów na przypadkowych portach; przed otwarciem strony sprawdza gotowość serwera.
- Proste zatrzymanie aplikacji i krótka instrukcja jednorazowej instalacji oraz aktualizacji.
- Kopia zapasowa: spójna baza przez SQLite backup API lub przy zatrzymanej aplikacji, media i potrzebna konfiguracja bez klucza. Nie kopiować samego pliku aktywnej bazy ignorując WAL.
- Próba odtworzenia kopii do nowego folderu. Przechowywać ścieżki względne, żeby dane dało się przenieść.
- Zweryfikować polskie znaki, brak mediów, większy import, brak FFmpeg, pełny dysk/brak uprawnień, brak internetu i błędy API.
- Uporządkować mikrokomunikaty i wizualne rozróżnienie kont.
- Odbiór przez użytkownika na jego rzeczywistym przebiegu przygotowania kilku publikacji.

Koniec etapu: użytkownik uruchamia aplikację skrótem i przygotowuje posty bez terminala, ma aktualne paczki oraz potrafi odtworzyć swoje dane.

## Minimalny model danych

| Encja | Istotne pola |
|---|---|
| Account | id, name, slug, accent, aiContext |
| Media | id, accountId, originalName, storedRelativePath, thumbnailRelativePath, mediaType, mimeType, hash, createdAt |
| Post | id, accountId, title, type, caption, internalNotes, scheduledDate nullable, readiness, publicationConfirmedAt nullable, revision |
| PostMedia | postId, mediaId, position |
| ExportState | postId, desiredRevision, exportedRevision, relativePath, purpose (queue/manual), status (including cleanup_pending), lastError |

To szkic odpowiedzialności, nie gotowy schemat ORM. Nazwy i reprezentacja stanów mogą się zmienić. Powiązania mediów muszą należeć do konta posta; przy kopiowaniu do innego konta powstaje niezależne przypisanie.

Unikalność `(accountId, scheduledDate)` dla niepustej daty zabezpiecza limit dzienny. Historia opublikowanych postów również zajmuje swój dzień. Kolejność `PostMedia` jest jednoznaczna i identyczna w UI oraz paczce.

`publicationConfirmedAt` to czas ręcznego oznaczenia przez użytkownika, nie wykryty czas publikacji na Instagramie. „Zaległy” wylicza się w UI/serwerze, bez zapisywania potwierdzenia. Domyślny cel eksportu to aktualna paczka dla nieopublikowanego posta z datą albo brak paczki po publikacji/usunięciu daty. Eksport na żądanie jest osobną operacją.

## Weryfikacja

Automatyzować przede wszystkim reguły, których awaria powoduje utratę danych lub błędną paczkę:
- Izolacja kont, limit dzienny i brak częściowych zmian po kolizji.
- Eksport do tymczasowego katalogu: poprawna kolejność, bajty oryginałów, dokładny TXT, kolejne edycje i zmiana ścieżki.
- Przerwanie eksportu oraz odzyskanie przy starcie, idempotencja i brak usuwania obcych plików.
- Poprawne dni przy zmianie miesiąca i czasu letniego.
- Mock API dla przypisania odpowiedzi do posta, błędów i zachowania podpisu.
- Upływ terminu i restart nie zmieniają potwierdzenia publikacji; zaległy post zachowuje paczkę i można go przełożyć.
- Ręczne potwierdzenie usuwa tylko zarządzaną paczkę, zachowuje historię i media; awaria czyszczenia jest odtwarzalna, a eksport w toku nie przywraca usuniętej paczki.
- Cofnięcie pomyłkowego oznaczenia odtwarza kolejkę, a eksport historii na żądanie nie zmienia statusu.

Testy przepływu w przeglądarce: konto -> import -> post -> data -> edycja -> eksport. Uruchamianie skrótem, Finder, miniatury MOV i odtworzenie kopii sprawdzić na macOS.

Nie wywoływać płatnego API w zwykłych testach. Test jakości realnego podpisu wykonuje się oddzielnie, na wybranym przez użytkownika materiale i z jego kluczem.

## Status etapów

- [ ] 0. Domknięcie zakresu
- [ ] 1. Fundament i konta
- [ ] 2. Media
- [ ] 3. Posty i pomysły
- [ ] 4. Kalendarz
- [ ] 5. Paczki
- [ ] 6. AI
- [ ] 7. Skrót, kopia zapasowa i odbiór

## Instrukcja startowa dla agenta

> Zrealizuj InstaPlanner na podstawie PRD i planu implementacji. Najpierw sprawdź status decyzji i wskazane ścieżki. Nie traktuj niezatwierdzonych propozycji jako nowych wymagań. Zbuduj działający proces od importu mediów do aktualnej paczki na dysku, następnie dodaj AI i uruchamianie skrótem. Weryfikuj przede wszystkim trwałość danych, izolację kont, limit dzienny i poprawność eksportu. Po każdym etapie pokaż wynik, zapisz istotne decyzje i przejdź do następnego etapu w zatwierdzonym zakresie.

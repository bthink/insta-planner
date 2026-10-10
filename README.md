# InstaPlanner

Prywatny, lokalny planer publikacji na Instagram i Facebook. Polski interfejs, osobne konta i biblioteki, kalendarz z przeciąganiem postów, gotowe paczki na dysku. Publikujesz ręcznie.

## Uruchomienie na tym Macu

Otwórz **Uruchom InstaPlanner.command** dwuklikiem w Finderze. Otworzy domyślną przeglądarkę pod adresem http://127.0.0.1:3210. Ponowne uruchomienie otwiera działającą instancję. Serwer korzysta ze stałego portu i nasłuchuje wyłącznie lokalnie.

Wybierz „Dodaj pierwsze konto”, potem zakładkę „Media”. Zaimportuj gotowe zdjęcia albo film, zaznacz materiały i utwórz post. Zapisz podpis i przypisz datę w edytorze lub przeciągnij pomysł na kalendarz. „Otwórz paczkę” otworzy folder w Finderze.

Zatrzymanie: **Zatrzymaj InstaPlanner.command**. Nie trzeba zostawiać otwartego Terminala. Skrypty i log `.runtime/server.log` pozostają w folderze projektu.

## Pierwsza instalacja na innym Macu

Wymagany Node.js 22.13 lub nowszy oraz opcjonalnie FFmpeg do miniatur filmów. Na tym Macu FFmpeg jest już w `/opt/homebrew/bin/ffmpeg`. Na nowym Macu z Homebrew: `brew install ffmpeg`. Nie dołączamy binarnego FFmpeg do repozytorium. Bez niego import filmu i eksport oryginału działają z placeholderem.

```sh
npm ci
cp .env.example .env.local
npm run build
```

Potem uruchamiaj plikiem `.command`. Skrypt zbuduje aplikację, jeśli nie ma jeszcze wersji produkcyjnej. Jeżeli macOS ostrzega o pliku pobranym z internetu, użyj menu kontekstowego Findera „Otwórz”.

## Dane i konfiguracja

Domyślnie dane są w `~/Pictures/InstaPlanner-data`. Ustawienie `INSTAPLANNER_DATA_DIR` w `.env.local` pozwala wybrać inny folder poza repozytorium. Zmiana folderu wymaga restartu. Baza, media i paczki nie trafiają do Git. Folder danych i jego ścieżki nie mogą zawierać dowiązań symbolicznych.

```text
InstaPlanner-data/
  instaplanner.sqlite
  media/<id-konta>/<id-medium>.<oryginalne-rozszerzenie>
  miniatury/<id-medium>.jpg
  kolejka/<konto>/2026-10-14-tytul-<id-posta>/
    01.jpeg
    02.png
    podpis.txt
    .instaplanner.json
  eksporty/<konto>/...       # odtworzenie historii tylko na żądanie
  backups/<data-i-id>/...    # kompletne kopie zapasowe
```

Import kopiuje pliki. Oryginały poza aplikacją pozostają nietknięte. Obsługiwane JPEG, PNG, WebP, MP4 i MOV; do 2 GB na plik. Typ jest sprawdzany z zawartości. Pliki przetwarzamy kolejno i filmy zapisujemy strumieniowo. Eksport kopiuje oryginalne bajty, bez konwersji i pogorszenia jakości. Tytuł i notatka nie trafiają do `podpis.txt`.

Jedna publikacja na konto i dzień, także w historii. Zaległość jest wyliczana w Europe/Warsaw i nie oznacza publikacji. Po ręcznym oznaczeniu „Opublikowany” paczka z `kolejka` jest usuwana, a historia i biblioteka pozostają. Cofnięcie oznaczenia odtwarza paczkę. „Odtwórz paczkę z historii” zapisuje dodatkową paczkę w `eksporty`; nie zmienia statusu. Edycja historii nie eksportuje automatycznie.

Post jest utrwalany przed operacją na plikach. Błąd paczki nie usuwa danych ani ostatniej dobrej paczki. Interfejs pokazuje błąd i przycisk ponowienia. Restart naprawia przerwane eksporty i czyszczenie. Usuwane są wyłącznie foldery z manifestem danego posta. Eksport nie synchronizuje ręcznych zmian z paczki do aplikacji.

## Opcjonalne AI

Dodaj własny `OPENAI_API_KEY` do `.env.local` i uruchom ponownie. Klucz pozostaje na serwerze, poza bazą i kopiami zapasowymi. Model można zmienić przez `OPENAI_MODEL`, domyślnie `gpt-4.1-mini`.

Przycisk „Zapisz i zaproponuj podpis” zapisuje post i wykonuje jedno żądanie przez oficjalny SDK i Responses API, bez automatycznych ponowień. Wysyła kontekst właściwego konta, tytuł, notatkę, wskazówki i maksymalnie trzy wskazane podglądy (do 1024 px). Dla rolki wysyła miniaturę, nigdy film. Propozycja pojawia się osobno; podpis zmienisz przez „Użyj tej propozycji” i zapis. Aplikacja działa bez internetu i klucza, poza tą funkcją.

Źródła: [Responses i obrazy](https://developers.openai.com/api/docs/guides/images-vision), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [oficjalny SDK](https://developers.openai.com/api/reference/typescript).

## Kopia zapasowa i odtworzenie

W ustawieniach wybierz „Utwórz kopię zapasową”. Wynikowy folder jest w `backups` i zawiera spójną bazę przez SQLite backup API oraz media, miniatury i paczki. Klucz i `.env.local` nie są kopiowane. Przenieś cały folder kopii na drugi dysk dla ochrony przed awarią dysku Maca.

Alternatywnie, przy zatrzymanej aplikacji: `npm run backup`.

Aby odtworzyć, zatrzymaj aplikację i wybierz **nowy, nieistniejący folder**:

```sh
npm run restore -- "/pełna/ścieżka/do/kopii" "/pełna/ścieżka/do/nowych-danych"
```

Ustaw `INSTAPLANNER_DATA_DIR` na nowy folder w `.env.local`, uruchom aplikację i sprawdź konta oraz posty. Ścieżki w bazie są względne. Przy odtworzeniu sprawdzamy integralność bazy. Nigdy nie kopiuj samego pliku aktywnej bazy z pominięciem WAL.

## Aktualizacja i rozwój

Zatrzymaj aplikację, utwórz kopię danych, następnie:

```sh
git pull --ff-only
npm ci
npm run build
```

Do pracy nad kodem: `npm run dev`. Nie uruchamiaj równocześnie wersji produkcyjnej i deweloperskiej na tym samym porcie.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

Test przeglądarkowy używa osobnych danych testowych w `/private/tmp`. Nie wykonuje płatnych wywołań API. Stan realizacji i ograniczenia: [docs/STATUS.md](docs/STATUS.md).

## Technologia

Next.js 16.4, React 19.3, TypeScript, better-sqlite3 i migracje `user_version`, sharp, FullCalendar 6 (darmowe standardowe moduły, [MIT](https://fullcalendar.io/license)). Interfejs korzysta z własnego CSS. Nie używa płatnych dodatków kalendarza, usług Meta ani serwera w chmurze.

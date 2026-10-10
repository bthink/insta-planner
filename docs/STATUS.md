# Stan implementacji

## Przyjęte decyzje

- 2026-10-10: użytkownik zatwierdził MVP bez podglądu siatki profilu, z kolejnością mediów, oznaczeniami użycia, Finderem i kopią zapasową.
- Repozytorium: `https://github.com/bthink/insta-planner`, checkout w `~/dzikieProjekty/instaPlanner`.
- Dane: `~/Pictures/InstaPlanner-data`, konfiguracja i klucz w `.env.local`. Ten Mac, domyślna przeglądarka, skróty `.command`.
- Publikacja zawsze ręczna, wspólny podpis IG/FB, eksport oryginalnych bajtów. Po publikacji usuwamy paczkę kolejki, pozostawiamy historię i bibliotekę.
- Konta mają niezmienny identyfikator techniczny; nazwa, identyfikator profilu (np. @konto), akcent i kontekst są edytowalne.
- CSS własny zamiast Tailwind. Standardowy FullCalendar 6 na licencji MIT. Zainstalowany FFmpeg, bez dystrybucji dodatkowego binarnego pliku.
- Operacje zmieniające dane są serializowane w lokalnym procesie. Wersje postów zabezpieczają także przed nadpisaniem zmian z drugiej karty przeglądarki.

## Etapy

- [x] 0. Zakres i konfiguracja.
- [x] 1. Lokalny fundament, SQLite, konta, kontrola pochodzenia i ścieżek.
- [x] 2. Import strumieniowy, miniatury, kopiowanie między kontami, blokada usunięcia powiązanych mediów.
- [x] 3. Pomysły i posty, edytor, kolejność mediów, kopiowanie podpisu, ręczna publikacja i cofnięcie.
- [x] 4. Polski kalendarz z przeciąganiem, limit dzienny i zaległość.
- [x] 5. Automatyczne paczki, wersje, odzyskiwanie, ponowienie, historia na żądanie.
- [x] 6. Podpisy OpenAI, wskazane podglądy, propozycja do akceptacji, testy mock bez płatnych żądań.
- [x] 7. Skróty i kopie zapasowe: zweryfikowane na tym Macu. Aplikacja gotowa do odbioru na własnych materiałach użytkownika.

## Weryfikacja

- TypeScript i build produkcyjny przechodzą.
- 11 testów danych i mock AI przechodzi: izolacja kont, kolizje, dokładny TXT, bajty mediów i kolejność, przerwane eksporty, błąd czyszczenia, cofnięcie publikacji, brak automatycznej publikacji, przenośna kopia z WAL, daty Europe/Warsaw, symlinki i pochodzenie żądań.
- Test przeglądarkowy przechodzi: tworzenie kont, wieloplikowy import JPEG/PNG/MP4/MOV, kolejność karuzeli, przeciąganie na kalendarz, edycja i zmiana daty, dokładne media i TXT, Finder, ręczna publikacja, izolacja kont i oryginalny eksport rolki. Brak błędów JavaScript.
- Skrót produkcyjny sprawdzony: start, ponowne wywołanie bez drugiego serwera i zatrzymanie.
- Spójna kopia zapasowa i odtworzenie do nowej ścieżki zweryfikowane testem.

## Ograniczenia

- Jakość realnego podpisu AI nie została sprawdzona płatnym API. Wymaga klucza i świadomie wybranych materiałów użytkownika.
- FFmpeg jest opcjonalny; uszkodzony lub nietypowy film może mieć placeholder miniatury.
- Usuwanie kont z historią jest zablokowane. Używane medium wymaga odpięcia od wszystkich postów przed usunięciem.
- Klucz i folder danych ustawia się w pliku, bez formularza Keychain. Nie ma siatki profilu, automatycznej publikacji, synchronizacji ani obróbki mediów.

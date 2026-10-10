# InstaPlanner - PRD

Wersja: 0.2, 2026-10-10. Dokument roboczy do wspólnego dopracowania.

Źródło: [[InstaPlanner]]. Kolejność realizacji: [[InstaPlanner - Plan implementacji]].

## 1. Cel produktu

Prywatne narzędzie do przygotowywania postów na 2-3 konta Instagram i połączone strony Facebook. Użytkownik podczas jednej sesji wybiera media, przygotowuje podpisy i rozkłada publikacje w kalendarzu. W dniu publikacji korzysta z gotowej paczki na dysku i ręcznie publikuje z telefonu.

Główna wartość: ograniczenie liczby powtarzanych decyzji i obciążenia poznawczego. Miarą sukcesu jest możliwość przygotowania np. 10 kolejnych postów bez wracania do wyboru zdjęć i pisania tekstu przy każdej publikacji.

## 2. Wymagania potwierdzone

Z notatki źródłowej:
- Jeden użytkownik, użytek prywatny, lokalne uruchamianie i przechowywanie danych.
- Polski interfejs.
- Przełączanie kont i delikatny, odmienny akcent kolorystyczny każdego konta.
- Biblioteka zdjęć i filmów.
- Kalendarz i przeciąganie postów między dniami.
- Maksymalnie jedna publikacja dziennie na konto.
- Edytor posta w dialogu: zdjęcia w siatce i edycja podpisu.
- Automatyczna paczka mediów i podpisu TXT w folderze `kolejka`.
- Kopiowanie podpisu z aplikacji.
- Kontekst konta i proponowanie podpisu ze zdjęcia przez OpenAI z własnym kluczem.
- Pomysły i nieprzypisane do dat posty w kolejce obok kalendarza.
- Planowanie rolek: film z miniaturą, bez potrzeby odtwarzania.
- Publikowanie ręczne, bez integracji z Instagramem i Facebookiem.

Potwierdzone w rozmowie 2026-10-10:
- Lokalna strona w przeglądarce, uruchamiana skrótem.
- Osobna biblioteka dla każdego konta, z możliwością kopiowania mediów do innego konta.
- Paczka powstaje automatycznie po zapisaniu posta z datą i aktualizuje się po jego edycji.
- Oznaczenie „Opublikowany” odbywa się wyłącznie ręcznie. Upływ zaplanowanej daty nigdy nie zmienia statusu publikacji ani historii użycia mediów.
- Importowane zdjęcia i filmy są gotowe do publikacji. Aplikacja kopiuje je bez zmian jakości, kadrowania lub konwersji.
- W pierwszej wersji jeden wspólny podpis na Instagram i Facebook. Osobne wersje można rozważyć po sprawdzeniu narzędzia w praktyce.

Rekomendacja zarządzania dyskiem po prośbie użytkownika o doradzenie:
- Historia opublikowanych postów pozostaje w bazie, wraz z podpisami, kolejnością i powiązaniami do biblioteki.
- Po ręcznym oznaczeniu publikacji aplikacja usuwa zarządzaną paczkę eksportową z `kolejka`. Nie tworzy dodatkowego katalogu z kopiami opublikowanych mediów.
- Biblioteka mediów pozostaje dostępna, umożliwiając ponowny eksport na żądanie. Usuwanie źródłowych mediów jest oddzielną, świadomą operacją.

## 3. Proponowane uzupełnienia

Poniższe reguły są rekomendacjami, a nie potwierdzonymi decyzjami użytkownika. Agent powinien stosować je po domknięciu dokumentu.

| Propozycja | Po co |
|---|---|
| Zmiana kolejności zdjęć w poście | Kolejność karuzeli musi zgadzać się z eksportem |
| Oznaczenie mediów użytych i zaplanowanych | Ograniczenie przypadkowych powtórek |
| Przycisk otwierania paczki w Finderze | Szybkie przekazanie na telefon |
| Zapis pomysłów bez mediów i daty | Szybkie przechwycenie myśli |
| Przykładowe własne podpisy w kontekście konta | Lepsze dopasowanie języka AI |
| Prosta kopia zapasowa całych danych | Możliwość odtworzenia planu, tekstów i zdjęć |

## 4. Główny przebieg pracy

1. Uruchamiam skrót i wybieram konto.
2. Przeciągam zdjęcia lub filmy z Findera do biblioteki.
3. Z wybranych mediów tworzę post albo zapisuję sam pomysł.
4. Otwieram dialog, ustalam kolejność zdjęć i piszę podpis. Opcjonalnie proszę AI o propozycję.
5. Przeciągam post z panelu na dzień lub wybieram datę w edytorze.
6. Po zapisie aplikacja tworzy paczkę na dysku. W interfejsie widać, czy eksport się udał.
7. Zmiana opisu, daty, tytułu lub mediów aktualizuje paczkę.
8. Otwieram folder, przekazuję pliki na telefon i publikuję ręcznie.
9. Ręcznie oznaczam post jako opublikowany. Aplikacja zachowuje historię i media w bibliotece, a usuwa dodatkową paczkę z kolejki.
10. Jeśli termin minie bez publikacji, widzę oznaczenie „Zaległy”. Mogę przełożyć post lub opublikować go i ręcznie oznaczyć wykonanie.

## 5. Zakres MVP

### Konta

- Dodawanie i edycja nazwy, identyfikatora konta, koloru i kontekstu dla AI.
- Konta są lokalnymi profilami planera. Nie wymagają logowania do platform.
- Aktywne konto jest wyraźnie widoczne przez nazwę i akcent koloru.
- Kalendarz, biblioteka oraz pomysły pokazują dane wybranego konta.
- Kontekst: tematyka, odbiorcy, ton, cel, zasady emoji/hashtagów, zwroty do unikania i opcjonalne przykładowe podpisy.

### Biblioteka mediów

- Import wielu plików przez drag and drop i zwykły wybór plików.
- Import tworzy zarządzaną kopię. Oryginalny plik użytkownika pozostaje nietknięty.
- Materiały są już gotowe do publikacji. Przetwarzanie jest potrzebne tylko do miniatur i osobnych podglądów dla AI; eksport zachowuje oryginalne bajty.
- Miniatury, nazwa pliku, typ zdjęcie/film i możliwość zaznaczania wielu pozycji.
- Proponowane formaty początkowe: JPEG, PNG, WebP oraz MP4 i MOV. Brak edycji RAW i transkodowania w MVP.
- Film ma miniaturę i oznaczenie typu. Nie ma obowiązkowego odtwarzacza.
- Nieudane wygenerowanie miniatury nie blokuje importu: placeholder i czytelny komunikat.
- Kopiowanie do biblioteki innego konta zachowuje niezależne przypisanie i nie przenosi historii postów.
- Propozycja: informacja, że plik jest już zaplanowany lub został użyty w ręcznie oznaczonym opublikowanym poście; ponowne użycie pozostaje dozwolone. Upływ daty nie oznacza zdjęcia jako opublikowanego.
- Usunięcie zdjęcia z posta nie usuwa go z biblioteki. Usunięcie używanego medium z biblioteki wymaga rozwiązania jego powiązań i nie może uszkodzić istniejących postów.

### Post i pomysł

- Pomysł może zawierać tylko tytuł i notatkę, bez mediów, daty i podpisu.
- Ten sam zapis można stopniowo uzupełnić do pełnego posta bez przepisywania informacji.
- Post: konto, tytuł roboczy, typ, media w ustalonej kolejności, podpis, opcjonalna notatka wewnętrzna i data.
- Proponowane typy: zdjęcie, karuzela zdjęć, rolka z jednym filmem. Mieszane karuzele foto/wideo poza MVP.
- Dialog pokazuje siatkę mediów z numeracją i zmianą kolejności, pola tekstowe i datę.
- Notatka wewnętrzna nie trafia do `podpis.txt` ani do kopiowanego podpisu.
- Wyraźny zapis zmian; zamknięcie dialogu z niezapisanymi zmianami daje możliwość ich zachowania.
- Przycisk kopiowania podpisu wraz z zachowaniem nowych linii i polskich znaków.
- Jeden podpis używany na Instagram i Facebook, bez oddzielnych pól w MVP.
- Ręczny przycisk „Oznacz jako opublikowany” zapisuje status publikacji. Propozycja dodatkowa: „Do uzupełnienia” i „Gotowy”; data, gotowość oraz faktyczna publikacja są niezależne.
- Status „Opublikowany” można ręcznie cofnąć w razie pomyłki. Post zachowuje datę i treść, a paczka odtwarza się automatycznie, jeżeli nadal ma datę.
- Edycja opublikowanego posta nie cofa oznaczenia i nie tworzy automatycznie kolejnej paczki. Ponowny eksport jest osobną akcją na żądanie.
- Gotowość nie jest warunkiem eksportu. Dla posta z datą i bez mediów może powstać folder z samym podpisem; interfejs musi pokazać brak mediów lub tekstu.

### Kalendarz i kolejka pomysłów

- Domyślnie miesiąc, tydzień rozpoczyna się w poniedziałek. Nawigacja między miesiącami i powrót do dzisiaj.
- Kafelek pokazuje miniaturę, tytuł, typ oraz informację o brakach lub błędzie eksportu.
- Przeciąganie z kolejki na kalendarz przypisuje datę. Przeciąganie między dniami ją zmienia.
- Zawsze dostępne jest również ustawienie daty w dialogu.
- Proponowana reguła kolizji: zajęty dzień odrzuca przeciągnięcie i pozostawia oba posty bez zmian. Bez cichego nadpisywania i bez automatycznej zamiany.
- Limit jednej publikacji dotyczy łącznie zdjęć, karuzel i rolek na jednym koncie. Różne konta mogą mieć publikację tego samego dnia.
- Data jest dniem kalendarzowym `YYYY-MM-DD` w strefie Europe/Warsaw. MVP nie potrzebuje godzin publikacji.
- Po ręcznym oznaczeniu publikacji post pozostaje w historii na zaplanowanej dacie, a jego zarządzana paczka zostaje usunięta z `kolejka`. Biblioteka mediów i podpis pozostają.
- „Zaległy” to oznaczenie wyliczane dla posta z datą wcześniejszą niż dziś w Europe/Warsaw, którego użytkownik nie oznaczył jako opublikowany. Nie jest automatycznym potwierdzeniem publikacji.
- Zaległy post zachowuje paczkę i media. Można go przeciągnąć na nowy wolny dzień lub ustawić datę w dialogu; działa standardowa aktualizacja eksportu.
- Usunięcie daty wraca z postem do kolejki pomysłów i usuwa jego aktywną paczkę z `kolejka`, zachowując treść i źródłowe media.

### Paczki na dysku

Proponowany układ wybranego folderu danych:

```text
InstaPlanner-data/
  instaplanner.sqlite
  media/<account-id>/<media-id>.<ext>
  miniatury/<media-id>.jpg
  kolejka/<konto>/2026-10-31-piesekhaloween/
    01.jpg
    02.jpg
    podpis.txt
    .instaplanner.json
  eksporty/<konto>/...  # tylko ponowny eksport historii na żądanie
```

- Osobne podfoldery kont zapobiegają mieszaniu paczek z różnych profili.
- Nazwa folderu zawiera datę i slug tytułu roboczego. Tytuł jest niezależny od podpisu.
- Przy kolizji nazw aplikacja dodaje krótki identyfikator posta, zamiast nadpisywać cudzy folder.
- Numerowane pliki zachowują ustaloną kolejność i oryginalne rozszerzenia. Eksport nie zmniejsza jakości, nie przycina i nie recompressuje mediów.
- `podpis.txt`: UTF-8, dokładny zapisany podpis, bez tytułu, etykiet i notatki wewnętrznej.
- Ukryty manifest identyfikuje właściciela paczki i wyeksportowaną wersję posta.
- Baza i biblioteka są źródłem danych; eksport jest odtwarzalną kopią do publikowania. Ręczna edycja paczki nie importuje zmian do aplikacji.
- Po każdej zatwierdzonej edycji nieopublikowanego posta z datą paczka aktualizuje się automatycznie, także dla postów zaległych. Zmiana daty lub tytułu nie pozostawia starej aktywnej paczki.
- Po ręcznym oznaczeniu publikacji najpierw utrwala się historia w bazie, potem usuwa zarządzaną paczkę. Usunięcie paczki nie kasuje plików w bibliotece ani oryginałów poza aplikacją.
- Nieudane usunięcie paczki nie cofa ręcznego oznaczenia publikacji: pokazuje błąd czyszczenia i umożliwia ponowienie. Restart nie odtwarza paczki opublikowanego posta automatycznie.
- „Odtwórz paczkę” dla opublikowanego posta wykonuje eksport na żądanie do `eksporty`, bez zmiany statusu publikacji. Jedna zarządzana paczka na post, z akcją usunięcia dodatkowej kopii.
- Zwykłe oznaczenie publikacji nie tworzy żadnych kopii w `eksporty`; folder jest używany wyłącznie po świadomym zleceniu ponownego eksportu.
- Eksport najpierw przygotowuje kompletny folder tymczasowy, następnie podmienia zarządzaną paczkę. Nie usuwa starej dobrej wersji przed przygotowaniem nowej.
- Zapis do bazy i dysku może udać się częściowo. Aplikacja odróżnia „post zapisany” od „paczka aktualna”, pokazuje błąd i umożliwia ponowienie eksportu.
- Kolejne edycje tego samego posta nie mogą kończyć eksportów w odwrotnej kolejności. Po restarcie aplikacja naprawia przerwane operacje.
- Operacje czyszczenia dotyczą wyłącznie paczek rozpoznanych po identyfikatorze. Nie usuwać przypadkowych plików z wybranego katalogu.
- Ponowny eksport tej samej wersji daje tę samą paczkę bez duplikatów.

### Podpisy AI

- Wywołanie wyłącznie na żądanie z przycisku w edytorze.
- Wejście: kontekst aktywnego konta, tytuł/notatka o poście, opcjonalne wskazówki użytkownika i wybrane zdjęcia.
- Propozycja MVP: jedna propozycja podpisu, potem możliwość wygenerowania kolejnej. Bieżący tekst zastępuje się dopiero po świadomym wyborze użytkownika.
- Dla karuzeli proponowany limit do trzech zdjęć na zapytanie, jawnie wskazanych w UI. Nie analizować całej biblioteki.
- Dla rolki: miniatura i opis użytkownika. Miniatura nie opisuje całej treści filmu; brak automatycznej analizy filmu w MVP.
- Model otrzymuje zasadę niewymyślania imion, miejsca, wydarzeń ani innych szczegółów, których użytkownik nie podał.
- Aplikacja działa bez klucza i bez internetu. Połączenie jest potrzebne wyłącznie do AI.
- Zdjęcia wybrane do generowania podpisu i kontekst są wysyłane do OpenAI. Pozostała biblioteka pozostaje lokalna.
- Klucz dostępny tylko lokalnej części serwerowej; nigdy w kodzie klienta, logach, paczce eksportowej lub kopii zapasowej danych.
- Propozycja pierwszej wersji: klucz w lokalnym `.env.local`, poza folderem danych. Formularz z zapisem do macOS Keychain może być późniejszym ulepszeniem.
- Model konfigurowalny po stronie serwera. Dobór konkretnego modelu i aktualnych kosztów przy implementacji, bez wpisywania domyślnego „najdroższego” modelu do PRD.
- Błąd API, brak klucza lub brak sieci nie usuwa aktualnego podpisu.

## 6. Interfejs

- Górny pasek: przełącznik konta, nazwa aktywnego profilu i ustawienia.
- Główny obszar: kalendarz.
- Panel boczny: pomysły/posty bez daty oraz przełączany widok biblioteki mediów.
- Edytor otwiera się nad bieżącym widokiem, a po zamknięciu zachowuje miesiąc i konto.
- Spokojne tło, mało stale widocznych kontrolek, czytelne miniatury. Kolor konta jest delikatnym sygnałem orientacji.
- Priorytet: desktop na Macu. Telefon służy do ręcznego publikowania, bez dostępu do aplikacji w MVP.
- Pokazywać proste komunikaty: „Zapisano”, „Paczka aktualna”, „Nie udało się przygotować paczki”, „Brak zdjęć”, „Zaległy”, „Opublikowany”.

## 7. Poza MVP

- Automatyczne publikowanie, OAuth, integracje Meta, analityka i pobieranie istniejącego feedu.
- Wielu użytkowników, abonamenty, logowanie, serwer w chmurze i synchronizacja między urządzeniami.
- Osobna aplikacja mobilna, edycja zdjęć, montaż filmów, odtwarzacz i konwersja formatów.
- Automatyczny transfer na telefon. MVP kończy się na paczce i otwarciu jej folderu.
- Zaawansowane kampanie, przypomnienia, generowanie kalendarza przez AI i osobny podpis na Facebooka.
- Podgląd siatki profilu jako dodatkowy widok. Bez importu historii nie będzie wiernym podglądem prawdziwego feedu.

## 8. Proponowana technologia

Next.js + TypeScript, lokalna część serwerowa w Node.js, SQLite dla metadanych, zwykłe katalogi dla mediów. Jedna aplikacja i jedno środowisko językowe, bez osobnego serwera Python lub Rust.

To rekomendacja architektoniczna zgodna z preferencją użytkownika, a nie potwierdzony wybór wszystkich bibliotek. Next.js udostępnia Route Handlers; obsługę plików realizuje lokalny serwer przez Node.js `fs`. Przeglądarka odpowiada za UI i import, nie za bezpośrednie zarządzanie dowolnym katalogiem dysku.

Proponowane pozostałe elementy: Tailwind CSS, sprawdzona biblioteka kalendarza z drag and drop, biblioteka miniatur zdjęć i FFmpeg do miniatur filmów. Konkretne wersje, licencję kalendarza i sposób dostarczenia FFmpeg agent sprawdzi przed instalacją.

## 9. Kryteria odbioru

1. Tworzę trzy konta, przełączam je i widzę niezależne dane oraz inne akcenty koloru.
2. Importuję zdjęcia i film, zamykam aplikację i po ponownym uruchomieniu dane nadal są dostępne.
3. Tworzę pomysł bez zdjęć i daty, potem uzupełniam go do karuzeli i zmieniam kolejność.
4. Przeciągam post na dzień, otwieram folder i widzę właściwe media oraz dokładny podpis.
5. Zmieniam podpis i kolejność; paczka pokazuje najnowszy stan bez starych zdjęć.
6. Zmieniam datę i tytuł; zostaje jedna aktualna paczka w odpowiednim miejscu.
7. Próba dodania drugiej publikacji tego samego dnia na jednym koncie nie zmienia żadnego posta.
8. Ten sam dzień na innym koncie pozostaje dostępny.
9. Przy błędzie zapisu paczki post jest zachowany, błąd widoczny, a ponowienie naprawia eksport.
10. AI używa kontekstu właściwego konta, a propozycja nie nadpisuje tekstu automatycznie. Bez API nadal działa całe planowanie.
11. Rolka eksportuje oryginalny film, podpis i pokazuje miniaturę lub poprawny placeholder.
12. Skrót uruchamia lokalną aplikację i otwiera przeglądarkę bez codziennego używania terminala.
13. Upływ daty, ponowne uruchomienie i zmiana miesiąca nie oznaczają posta ani zdjęć jako opublikowanych. Zaległy post zachowuje paczkę i daje się przełożyć.
14. Ręcznie oznaczam publikację: historia, podpis i media pozostają w aplikacji, a dodatkowa paczka znika z kolejki bez tworzenia archiwalnych kopii.
15. Cofam pomyłkowe oznaczenie: post wraca do planowania i odzyskuje paczkę. Ponowny eksport z historii nie zmienia statusu.
16. Po błędzie czyszczenia status publikacji pozostaje ręcznie zapisany, a po ponowieniu zbędna paczka zostaje usunięta bez naruszenia biblioteki.

## 10. Tematy do domknięcia z użytkownikiem

- Czy potrzebny jest dodatkowy podgląd siatki profilu już w MVP?
- Czy wystarczy folder danych ustawiony podczas konfiguracji i klucz w `.env.local`, czy potrzebne są oba formularze w ustawieniach?

Nie traktować tych pytań jako obowiązku rozbudowy produktu. Preferować prosty przebieg pracy i zamknąć tylko decyzje wpływające na pierwszą wersję.

## Źródła techniczne

Sprawdzone 2026-10-10. Wymagania produktu pochodzą od użytkownika; źródła potwierdzają możliwości technologii.

- [Next.js - Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Node.js - File system](https://nodejs.org/api/fs.html)
- [SQLite - Single File Database](https://www.sqlite.org/onefile.html)
- [OpenAI - Images and vision](https://developers.openai.com/api/docs/guides/images-vision) - wejście obrazowe, również kilka zdjęć i dane Base64; przesłane obrazy są rozliczane jako wejście modelu.

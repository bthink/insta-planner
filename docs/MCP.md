# Obsługa InstaPlanner przez czat

Serwer MCP udostępnia 21 narzędzi oraz prompt `plan_photo_series`. Model w podłączonym czacie ogląda podglądy, wybiera zdjęcia, układa kolejność karuzeli, pisze podpisy i zapisuje harmonogram. MCP nie wywołuje dodatkowego modelu i nie wymaga `OPENAI_API_KEY`. Analizę wykonuje model aktualnej rozmowy, według warunków i limitów używanego klienta.

## Uruchomienie

1. Wykonaj `npm ci` po aktualizacji projektu.
2. Uruchom InstaPlanner zwykłym skrótem `.command`. Może działać bez otwartej przeglądarki. MCP wymaga aplikacji pod `http://127.0.0.1:3210`.
3. Skonfiguruj klienta MCP poniżej. Klient uruchomi proces `stdio` samodzielnie. `npm run mcp --silent` jest równoważnym poleceniem do diagnostyki w katalogu projektu; oczekiwanie na wejście jest normalne.

Launcher działa z dowolnego katalogu, wczytuje `.env.local` i nie zapisuje logów na stdout protokołu. W konfiguracji klienta użyj bezwzględnej ścieżki Node 22.13+ (wynik `command -v node`) jeśli aplikacja desktopowa nie rozpoznaje `node`.

### Codex

Dodaj do `~/.codex/config.toml` (lub konfiguracji projektu w zaufanym projekcie), dostosowując ścieżki:

```toml
[mcp_servers.instaplanner]
command = "node"
args = ["/Users/bartoszfink/dzikieProjekty/instaPlanner/scripts/mcp-launcher.mjs"]
tool_timeout_sec = 600
```

Alternatywnie CLI:

```sh
codex mcp add instaplanner -- node /Users/bartoszfink/dzikieProjekty/instaPlanner/scripts/mcp-launcher.mjs
```

Po zmianie uruchom klienta ponownie. Konfiguracja transportu lokalnego: [oficjalna dokumentacja OpenAI](https://developers.openai.com/codex/mcp). Ta implementacja dostarcza lokalny proces stdio, bez publicznego adresu HTTP do podłączenia zdalnego czatu.

### Klient Claude obsługujący lokalne MCP

W konfiguracji serwerów MCP klienta dodaj wpis JSON, dostosowując ścieżki i łącząc go z istniejącą konfiguracją:

```json
{
  "mcpServers": {
    "instaplanner": {
      "command": "node",
      "args": ["/Users/bartoszfink/dzikieProjekty/instaPlanner/scripts/mcp-launcher.mjs"]
    }
  }
}
```

To konfiguracja standardowego klienta stdio. Dostępność lokalnego MCP, podglądów obrazów i przekazywania załączników zależy od konkretnego klienta. Nie rejestrujemy serwera automatycznie w konfiguracjach użytkownika.

## Zdjęcia i serie

Samo wrzucenie załączników do czatu nie udostępnia MCP ich oryginalnych bajtów. Są trzy drogi:

- **Folder na tym Macu:** zapisz serię w wybranym folderze. W `.env.local` ustaw `INSTAPLANNER_IMPORT_DIRS=/Users/bartoszfink/Pictures/DoPlanera`. Po restarcie MCP model odczyta listę przez `list_import_files` i zaimportuje wybrane pliki przez `import_media`. Folder musi istnieć. Kilka folderów rozdziel `:` na macOS. Nie ustawiaj całego katalogu domowego jako korzenia.
- **Załączniki udostępnione przez klienta:** klient musi dostarczyć MCP oryginalne dane jako base64 lub zapisać je w dozwolonym folderze na komputerze serwera. Base64 bez prefiksu `data:` ma limit 20 MiB na plik, ścieżka lokalna 2 GB. Nie proś modelu o odtwarzanie bajtów obrazu na podstawie jego wyglądu. Limity wiadomości klienta mogą być niższe.
- **Biblioteka:** możesz wcześniej zaimportować pliki przez interfejs planera. Czat obejrzy je i wykona dalszą pracę.

Bez `INSTAPLANNER_IMPORT_DIRS` odczyt dowolnych lokalnych plików jest wyłączony. Import base64 i biblioteka nadal działają. Nie pobieramy dowolnych adresów URL ani nie zmieniamy oryginałów. Przy imporcie partii każdy plik ma osobny wynik; błędne pliki nie cofają udanych. Ponowny import tworzy nowy wpis, nie jest deduplikowany.

Przykładowa rozmowa po podłączeniu:

> Dla konta Krajobrazy zaimportuj serię z /Users/bartoszfink/Pictures/DoPlanera. Obejrzyj wszystkie zdjęcia, wybierz najlepsze i ułóż 4 spójne karuzele po 3-5 zdjęć. Pierwsze zdjęcie ma być okładką. Rozplanuj na wtorki i piątki od 3 listopada 2026. Napisz spokojne podpisy bez hashtagów, zgodnie z kontekstem konta. Zapisz jako szkice i wyjaśnij wybory.

> Zamień kolejność drugiego i trzeciego zdjęcia w pierwszym poście i przesuń go o tydzień.

> Opublikowałem ręcznie post Spacer. Oznacz go jako opublikowany.

Model powinien najpierw pobrać konta, kontekst i dotychczasowe posty, następnie bibliotekę i podglądy partiami po maksymalnie 8 obrazów. Podgląd to JPEG do 640 px; film ma jedną klatkę lub błąd braku miniatury. Oryginały pozostają w bibliotece. Instrukcje serwera i prompt prowadzą przez ten proces, ale jakość doboru wymaga oceny na rzeczywistych zdjęciach w docelowym kliencie.

## Narzędzia

| Zakres | Narzędzia |
| --- | --- |
| Konfiguracja i konta | `get_settings`, `list_accounts`, `save_account`, `delete_account` |
| Media | `list_import_files`, `import_media`, `list_media`, `view_media`, `copy_media`, `delete_media` |
| Posty i kalendarz | `list_posts`, `get_post`, `save_post`, `schedule_post`, `delete_post` |
| Ręczna publikacja | `record_publication` |
| Paczki | `retry_export`, `export_post`, `remove_export`, `open_post_folder` |
| Kopia zapasowa | `create_backup` |

Wyniki list są stronicowane. `list_media.unusedOnly` uwzględnia także media przypisane do niedatowanych pomysłów. Kolejność `mediaIds` jest kolejnością zdjęć w paczce. Edycja i zmiana daty wymagają aktualnej `revision` z `get_post`; konflikt nie nadpisuje zmian z przeglądarki. Jeden post dziennie na konto, także w historii, według Europe/Warsaw.

Datowany post automatycznie przygotowuje paczkę z oryginalnymi bajtami i dokładnym podpisem. Status błędu eksportu jest w `post.exports`; zapisany post nie znika przy błędzie paczki. `record_publication` zapisuje wyłącznie potwierdzenie ręcznej publikacji, wymaga `userConfirmed: true` i polecenia człowieka. Flaga jest deklaracją klienta, nie technicznym dowodem zgody. Klient powinien pytać o zatwierdzenie tej operacji. Nie ma narzędzia publikującego w Meta.

MCP używa tego samego lokalnego HTTP API co interfejs. Nie otwiera drugiej bazy, nie omija kolejki zapisów i nie rozszerza nasłuchu sieciowego. Nie udostępnia kluczy. Podglądy i dane zwrócone do czatu są dostępne jego dostawcy zgodnie z konfiguracją klienta. Nie ma automatycznych ponowień zapisów; po utracie odpowiedzi najpierw odczytaj stan. Plan serii jest zapisywany post po poście, bez transakcji obejmującej całą serię.

## Weryfikacja

`npm test` obejmuje negocjację i wywołania przez oficjalny klient MCP, rzeczywiste handlery API na osobnych danych testowych, częściowy import partii, podglądy, izolację kont, kolizje dat i rewizji, wymaganie flagi potwierdzenia, kopię zapasową i identyczne bajty eksportu. Osobny test uruchamia proces stdio z katalogu poza projektem. Nie wykonuje płatnych wywołań AI ani nie zmienia danych użytkownika. Testy protokołu nie zastępują odbioru jakości selekcji zdjęć w rozmowie z modelem.

Źródło implementacji protokołu: [oficjalny TypeScript SDK MCP](https://ts.sdk.modelcontextprotocol.io/server).

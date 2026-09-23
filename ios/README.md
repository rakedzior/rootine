# Rootine iOS

## Nawyki w Dzisiaj

Nawyki mają osobną sekcję bezpośrednio pod Planem dnia i nie występują na osi
zadań. Lista obejmuje harmonogram na dzisiaj, pomija przerwy i zachowuje
kolejność po odhaczeniu. Licznik wykonania jest niezależny od zadań.
Górny plus w Dzisiaj otwiera od razu formularz zadania na dziś, bez wyboru typu.

Plus dodaje nawyk, nazwa otwiera historię ostatnich 28 dni, serię i harmonogram.
Menu sekcji prowadzi do wszystkich nawyków, także wstrzymanych i zaplanowanych
na inne dni. Szczegóły umożliwiają edycję, wstrzymanie, wznowienie oraz usunięcie
z potwierdzeniem. Wstrzymanie zachowuje historię; usunięcie usuwa ją z nawykiem.

## Gesty w planie dnia

- Dotknięcie treści zadania otwiera szczegóły, a checkbox zmienia ukończenie.
- Przesunięcie w prawo zmienia ukończenie; w lewo odsłania akcje przełożenia i usunięcia.
- Przytrzymanie otwiera menu edycji, terminu, priorytetu i usunięcia do kosza.
- Przytrzymanie i przeciągnięcie przestawia zadania bez godziny w obrębie tego samego dnia.
  Ręczna kolejność jest preferencją lokalną urządzenia, osobną dla każdego konta.
- Przeniesienie zadania z godziną albo między grupami otwiera wybór nowego terminu;
  anulowanie nie zmienia zadania. Zapis zachowuje długość zadania i przypomnienia.

Testy `RootineUITests/TodayGesturesUITests` uruchamiają lokalne konto testowe
(`--rootine-preview`) i sprawdzają interakcje na symulatorze. Testy logiki
przenoszenia i kolejności znajdują się w `TodayAggregationTests`.

## Praca z Windowsa przez Maca (SSH)

Kod edytujemy na Windowsie. Mac w tej samej sieci wykonuje kompilację i zrzuty
symulatora. Włącz na nim Zdalne logowanie dla swojego użytkownika i zainstaluj
Xcode z symulatorem iOS. Pierwsze uruchomienie Xcode i instalację jego składników
wykonaj na Macu. Użytkownik Maca powinien pozostać zalogowany, a komputer aktywny.

Po skonfigurowaniu logowania SSH kluczem uruchom w PowerShellu:

```powershell
.\scripts\ios-remote.ps1 -Mac user@192.168.1.25 -Action Check
.\scripts\ios-remote.ps1 -Mac user@192.168.1.25 -Action Screenshot
```

Opcjonalnie dodaj `-IdentityFile <sciezka-klucza>`. Skrypt wymaga logowania
bez interaktywnego pytania o hasło. Nowy klucz hosta jest zapisywany przy pierwszym
połączeniu; zmieniony klucz hosta zostanie odrzucony przez SSH.

Adres można zapisać lokalnie w ignorowanym przez Git pliku
`.local/ios-remote.json`, np. `{"mac":"user@192.168.1.25"}`.
Po zapisaniu konfiguracji wystarczy `./scripts/ios-remote.ps1` w PowerShellu.

Przesyłany jest aktualny kod iOS z Windowsa, także niezacommitowane zmiany,
kontrakty i skrypt screenshotów. Nie wymaga to GitHuba. Każde uruchomienie ma
osobny katalog `~/RootineRemote/runs/` na Macu, bez nadpisywania istniejącego
projektu. Pliki ignorowane przez Git, w tym `Secrets.xcconfig`, nie są wysyłane.
Tryb `Screenshot` pokazuje ekran wejściowy bez skonfigurowanego backendu.

Do pracy na istniejącym lokalnym koncie testowym używaj:

```powershell
.\scripts\ios-remote.ps1 -Action TestAccount
.\scripts\ios-remote.ps1 -Action Current
```

`TestAccount` buduje Debug i uruchamia istniejący tryb `--rootine-preview`.
To lokalne dane przykładowe, bez logowania do Supabase. Stały symulator
`Rootine Windows Preview` pozostaje uruchomiony, a jego identyfikator jest
zapisany w `~/RootineRemote/preview-device.json`. Dane testowe zachowują się
między uruchomieniami. `Current` pobiera widoczny ekran bez przebudowy aplikacji.
Buildy podglądu współdzielą cache Xcode w `~/RootineRemote/DerivedData/Preview`;
uruchamiaj je kolejno, nie równolegle.

Po przeniesieniu nowszej wersji z Maca zweryfikowano build Debug i ekran Dzisiaj
z lokalnymi danymi testowymi. Uzupełniono `UIApplicationSceneManifest` w ręcznym
`Info.plist`: bez tej deklaracji aplikacja uruchamiała proces, ale pokazywała
pusty ekran. Zrzut po poprawce potwierdził działający interfejs SwiftUI.

Do rzeczywistego logowania służy `-Action Preview`; wymaga konfiguracji klienta
w `~/RootineRemote/config/Secrets.xcconfig` na Macu. Plik ten jest kopiowany
wyłącznie na Macu do katalogu danego buildu. Utrzymuj ten sam bundle identifier,
aby kolejne instalacje zachowały dane i sesję aplikacji.

PNG, log kompilacji i metadane źródeł wracają do `output/ios-remote/` na Windowsie.
`source.json` opisuje kod przesłany z Windowsa; zdalny katalog nie jest repozytorium
Git, więc jego `capture.json` nie zawiera commita. Katalogi buildów na Macu pozostają
do diagnostyki i z czasem wymagają sprzątania.

Zweryfikowano 2026-09-23: logowanie SSH kluczem z Windowsa, przesłanie źródeł,
build na macOS 15.7.9 / Xcode 26.3 (Intel), uruchomienie na iPhone 14 / iOS 26.3
oraz pobranie i wizualne sprawdzenie PNG. Pierwszy start świeżego symulatora
zatrzymał się w SpringBoard; ponowny test zakończył się powodzeniem.
Skrypt ogranicza oczekiwanie na start aplikacji do 90 sekund i w razie błędu
ponawia go raz po restarcie własnego symulatora. Pierwsze uruchomienie może
potrwać kilka minut. Test nie obejmuje logowania do backendu ani TestFlight.

## Screenshoty aktualnej aplikacji SwiftUI

Na Macu z Xcode 26.3 i zainstalowanym symulatorem iOS 26+ uruchom z katalogu repozytorium:

```bash
python3 scripts/ios-screenshot.py --name welcome
```

Skrypt buduje bieżący kod, tworzy osobny symulator iPhone 14, uruchamia aplikację
i zapisuje prawdziwy PNG w `output/ios/<data>/welcome.png`. Obok zapisuje commit,
informację o lokalnych zmianach i wersję Xcode. Po wykonaniu usuwa wyłącznie własny
tymczasowy symulator. Nie wymaga podpisywania aplikacji ani konta Apple Developer.
Obraz należy obejrzeć: sam zapis PNG nie potwierdza poprawnego wyrenderowania ekranu.

Aby pokazać kolejne ekrany, uruchom aplikację w Xcode, przejdź w symulatorze do
wybranego widoku i zapisz jego aktualny stan bez przebudowywania aplikacji:

```bash
python3 scripts/ios-screenshot.py --current --name sign-in
```

Przy kilku włączonych symulatorach dodaj `--device UDID`.
Tryb `--current` fotografuje widoczny ekran; metadane repozytorium nie gwarantują,
że zainstalowana aplikacja została zbudowana z tego samego commita.
Zrzuty z `output/ios/` można przekazać do rozmowy i wyświetlać po każdej zmianie UI.

Bez lokalnego Maca: po wysłaniu workflow do GitHuba (musi być dostępny na domyślnej
gałęzi) wybierz **Actions → iOS screenshots → Run workflow** i odpowiednią gałąź.
Pobierz artefakt `rootine-ios-<commit>` z zakończonego uruchomienia.
Workflow nie został jeszcze wykonany ani zweryfikowany na macOS.

Automatyczny zrzut przedstawia świeżą instalację i ekran wejściowy. Bez
`Secrets.xcconfig` widoczny będzie rzeczywisty stan braku konfiguracji, a nie
zalogowane konto. Do podglądu ekranów domenowych z danymi przykładowymi użyj
`python3 scripts/ios-screenshot.py --preview --test-account`.

Native SwiftUI foundation for the Rootine MVP. The project targets iOS 26.0+ and Swift 6.2 for Xcode 26.3.

## Open on the Mac

1. Copy `Rootine/Config/Secrets.xcconfig.example` to `Rootine/Config/Secrets.xcconfig`.
2. Fill in values for the selected environment; never add a service-role key.
3. Select the matching `Development`, `Staging`, or `Production` build configuration in Xcode (each is explicitly bound to its xcconfig; all rollout flags default to `NO`).
4. Open `Rootine/Rootine.xcodeproj` in Xcode 26.3.
5. Select the `Rootine` scheme and the installed iOS 26.x simulator runtime. The current verified simulator destination is iPhone 17 Pro on iOS 26.3; the physical iPhone target remains unchanged.

`Secrets.xcconfig` is ignored by Git. Never put a service-role key in an iOS build.

The shared `Rootine` scheme runs/tests with `Development` and archives with
`Production`. CI builds all three named configurations explicitly; use
`-configuration Staging` for a staging build. The legacy `Debug` and `Release`
names remain as compatibility aliases for development and production.

## What this stage contains

- Xcode target and four native tabs: Today, Calendar, Nutrition, and More.
  Task records and shared task editors remain available after removing the Tasks tab.
- Dark semantic design tokens and native navigation patterns.
- `Codable` models for tasks, nutrition, notes, normalized products, and sync payloads.
- Atomic file persistence, Data Protection, Keychain session storage, and a persistent mutation queue.
- A complete native account entry flow: email sign-in and self-registration,
  confirmation resend, password recovery, Google OAuth through
  `ASWebAuthenticationSession`, and native Sign in with Apple.
- Session refresh, OAuth/recovery deep links, Keychain persistence, and explicit
  online/offline bootstrap states.
- Strict callback and Apple identity-token protocol validation, deterministic
  auth-client mocks, and account provider linking/unlinking with ownership and
  last-identity guards.
- An initial native `Dzisiaj` screen with day progress, timed queue, overdue
  attention, task/habit completion, nutrition totals, and notes activity.
- An initial native `Zadania` screen with smart-view filters, overdue and
  completed groups, task completion, and adding tasks with date/time/priority.
- Native task details with editing, soft-delete/restore, and a dedicated habit
  mode with daily/weekly/interval schedules, add/edit/delete/completion flows.
- A month-first calendar with a compact navigation title, day agendas, List,
  Day, 3 Days, Week, Month and Year views. Hourly views separate overlapping
  events into lanes. Filters cover text, completion, priority, list and tag.
  Calendar task creation preserves the selected date and supports time,
  duration, reminders and recurrence using the shared task workspace.
  Selecting a month date expands its agenda below the selected week. The
  keyboard-first composer keeps task text and metadata shortcuts together;
  the date shortcut opens a separate Date / Duration editor with explicit
  confirmation, cancellation and schedule clearing.
- A native `Odżywianie` day view with calorie/macro progress, water tracking,
  meal sections, animated add-entry sheet, and swipe-to-delete entries.
- A native `Więcej` hub with animated module tiles, account/sync sheet, data
  export and recovery center, settings/help/legal surfaces, and functional
  Notes, Sport, Goals, Work, Travel, Health, and Pozostałe/Sprawy modules.
  Their Codable snapshots are persisted locally and queued through the same
  offline/CAS sync engine as the core tabs.
- Notes support local-first CRUD, archive, folders, checklists, pinning, and
  search/filter/sort. Native Notes intentionally does not implement binary
  attachment storage or a provider/upload contract; opaque web attachment
  descriptors remain preserved in the canonical shadow for later support.
  If normalized per-row revisions are unavailable, Notes falls back to the
  existing aggregate queue; the v1 aggregate contract has no local tombstone
  field, so normalized delete commands are preferred whenever CAS metadata is
  available.
- A nutrition quick-capture flow with a local product catalog, manual fallback,
  camera barcode scanning (when permission is granted), saved meals, weight
  measurements, editable goals, and undo-safe deletion.
- Foreground session refresh plus a dependency-free 30-second polling safety net
  that accepts newer remote revisions when there is no local pending edit;
  concurrent edits remain visible as conflicts instead of being overwritten.
- Contract tests that decode the exact fixtures used by the web client.

Today's upper add button opens the shared task composer; habits have their own
section and creation action. Nutrition records are created from the nutrition
tab so meal, date, barcode, and macro context are never lost. Server-side domain
migrations can extend the same versioned models without invalidating existing
local snapshots.

The remaining-spaces redesign and its current verification status are recorded
in [NATIVE-SPACES.md](NATIVE-SPACES.md). The corrected build and all 14
remaining-spaces UI tests pass with Xcode 26.3 on iPhone 14 / iOS 26.3. Fresh
screenshots passed independent visual review, including two light-mode and two
XXXL Dynamic Type samples without material clipping. The [review gallery](../output/ios-spaces/gallery/index.html)
contains 36 actual captures. The final unit run passed with 177 passes, two
explicit skips and no failures across 179 tests. The final build and 13
recaptures are complete; the latest app is installed and running on the user's
original preview with its More screen visually verified. See the verification
notes for the Simulator file-protection limitation and skipped smoke test.

To repeat the complete spaces verification from Windows, use the saved
`.local/ios-remote.json` SSH configuration and the separate verification device:

```powershell
.\scripts\ios-verify-spaces.ps1 -Device 35728ECB-E355-4583-9361-8D10A04C0E2A
```

The script also accepts `-Mac user@address`, `-IdentityFile <path>` and
`-Device <UDID>`. It uploads the current Windows source into an isolated Mac run,
runs UI tests first and unit tests separately, builds and captures the preview,
then returns evidence to `output/ios-spaces/<run>/`. Logs and reports are separate
for each suite; raw `.xcresult` bundles stay on the Mac and download as `.tar.gz`
archives. See [NATIVE-SPACES.md](NATIVE-SPACES.md) for the verified flows,
unit launch argument and final verification results.

## Account configuration

The native callback is `rootine://auth-callback`. Add that exact redirect URL to
the Supabase Auth allowlist. Registration stays visibly unavailable until real
`ROOTINE_TERMS_URL` and `ROOTINE_PRIVACY_URL` values are supplied; the app never
ships dead legal links.

The server is authoritative for `normalized_sync_enabled`,
`normalized_read_enabled`, and `notifications_enabled`. Bundle values are safe
defaults for bootstrapping and diagnostics only; account-scoped rollout is
documented in [`docs/staging-runbook.md`](../docs/staging-runbook.md).

Release validation is documented in [`docs/ios-release-gate.md`](../docs/ios-release-gate.md).
The local-storage boundary, account isolation, lifecycle cleanup, and explicit
security omissions are documented in [`docs/ios-secure-storage.md`](../docs/ios-secure-storage.md).
The protected workflow runs executable `xcodebuild test`, SQL/RLS and Edge
contract gates, then the isolated staging sync smoke before a TestFlight build.

Production Apple/Google credentials, provider-console settings, and redirect
allowlists are intentionally not committed or configured by this repository.

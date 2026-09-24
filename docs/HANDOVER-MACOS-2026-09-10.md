# Rootine — handover na macOS

Stan przekazania: commit `25d1a57` na `main` (`origin/main`). Zawiera ostatni redesign widoków Dzisiaj, Kalendarz i Dieta, wspólną nawigację, dane demo oraz testy.

## Ważne: web i iOS są osobnymi aplikacjami

Redesign wykonany w tej iteracji znajduje się w webowej aplikacji React/Vite (`src/`). Projekt SwiftUI w `ios/Rootine` jest osobną implementacją natywną. Zbudowanie projektu Xcode nie przenosi automatycznie webowego wyglądu do natywnych widoków.

Jeśli na iPhonie ma być dokładnie aktualny wygląd webowy, trzeba wdrożyć `dist/` na HTTPS i otworzyć go w Safari. Jeśli ma to być aplikacja natywna, użyj poniższej ścieżki Xcode.

## 1. Przygotowanie repozytorium

W Terminalu na Macu:

```bash
git clone https://github.com/rakedzior/rootine.git
cd rootine
git checkout main
npm ci
```

Projekt natywny wymaga Xcode 26.3 oraz iOS 26.0+.

## 2. Konfiguracja sekretów i podpisywania

```bash
cp ios/Rootine/Config/Secrets.xcconfig.example \
   ios/Rootine/Config/Secrets.xcconfig
open ios/Rootine/Rootine.xcodeproj
```

Uzupełnij lokalny plik `ios/Rootine/Config/Secrets.xcconfig`:

```text
ROOTINE_SUPABASE_URL = https://...
ROOTINE_SUPABASE_PUBLISHABLE_KEY = ...
ROOTINE_BACKEND_URL = https://...
DEVELOPMENT_TEAM = TWOJ_TEAM_ID
PRODUCT_BUNDLE_IDENTIFIER = pl.twojadomena.rootine
```

Nie wpisuj klucza `service_role` i nie commituj `Secrets.xcconfig`.

W Xcode wybierz target `Rootine`, zakładkę **Signing & Capabilities**, swój Team i pozostaw **Automatically manage signing**. Podłącz iPhone’a, odblokuj go i zaakceptuj zaufanie do Maca. Przy pierwszym uruchomieniu włącz także Developer Mode na iPhonie, jeśli system o to poprosi.

## 3. Webowy build produkcyjny

To jest komenda dla najnowszego webowego Dzisiaj, Kalendarza, Diety i pozostałych modułów:

```bash
npm run build
```

Wynik znajduje się w `dist/`. Opcjonalny build e2e uruchamiaj osobno:

```bash
npm run build:e2e
```

Po `build:e2e` uruchom ponownie `npm run build`, jeśli chcesz, aby `dist/` zawierał build produkcyjny.

## 4. Build i instalacja na podłączonym iPhonie

Najpierw pobierz identyfikator urządzenia:

```bash
xcrun devicectl list devices
```

Następnie wklej UDID w pierwszej linii poniższego bloku i uruchom cały blok z katalogu repozytorium:

```bash
set -euo pipefail

DEVICE_ID="WKLEJ_UDID_IPHONE"
DERIVED_DATA="$PWD/.build/RootineDevice"
PROJECT="ios/Rootine/Rootine.xcodeproj"

xcodebuild \
  -project "$PROJECT" \
  -scheme Rootine \
  -configuration Development \
  -destination "platform=iOS,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  build

APP_PATH="$DERIVED_DATA/Build/Products/Development-iphoneos/Rootine.app"
BUNDLE_ID=$(/usr/libexec/PlistBuddy \
  -c 'Print:CFBundleIdentifier' "$APP_PATH/Info.plist")

xcrun devicectl device install app \
  --device "$DEVICE_ID" \
  "$APP_PATH"

xcrun devicectl device process launch \
  --device "$DEVICE_ID" \
  "$BUNDLE_ID"
```

Ten blok buduje konfigurację `Development`, instaluje aplikację na fizycznym iPhonie i ją uruchamia. Jeśli podpisywanie zgłosi błąd, najpierw uruchom projekt przyciskiem Run w Xcode z wybranym iPhonem — Xcode zarejestruje urządzenie i uzupełni provisioning.

## 5. Kontrola przed przekazaniem

```bash
npm run build
npm run ios:audit
```

`npm run build` i `npm run ios:audit` przechodziły na commit `25d1a57`. Pełny `npm run check` zatrzymuje się obecnie na istniejących limitach audytu design systemu/architektury, nie na błędzie kompilacji.

## 6. TestFlight później

Gdy aplikacja działa już na urządzeniu, w Xcode wybierz konfigurację `Production`, zwiększ numer Build, wykonaj `Product → Archive`, a następnie w Organizerze `Distribute App → TestFlight & App Store → Upload`.

# Rootine — handover na MacBooka

Data: `2026-08-19`
Gałąź robocza: `agent/ios-authentication-handover`

Ten plik jest źródłem prawdy przy przeniesieniu pracy z Windows na MacBooka. Historia czatu może być dostępna po zalogowaniu na to samo konto, ale kontynuacja nie powinna od niej zależeć.

## 1. Cel i uzgodniony produkt

Pierwsza wersja iOS jest przeznaczona dla właściciela Rootine i kilku znajomych. Konto jest wymagane od pierwszego uruchomienia, a użytkownik rejestruje je samodzielnie.

Najważniejsze decyzje:

- natywna aplikacja SwiftUI, iOS 16.0+, Swift 5.7, zgodna z Xcode 14.2;
- jeden wspólny projekt Supabase i te same dane dla webu oraz iPhone'a;
- pierwsze logowanie wymaga internetu, później aplikacja ma korzystać z trwałej kopii offline;
- tylko ciemny motyw Atrament w MVP;
- dolny pasek: Dzisiaj, Zadania, Odżywianie, Notatki i kontekstowy `+`;
- Dzisiaj jest mobilnym odpowiednikiem podsumowania obszarów z webu, bez osobnego kalendarza;
- brak martwych przejść, atrap, kont gościnnych i danych demonstracyjnych;
- logowanie: e-mail/hasło, Google i natywne Sign in with Apple;
- Odżywianie jest częścią rdzenia: posiłki, woda, kcal, makro, wyszukiwanie produktów oraz skanowanie kodów;
- pełne ekrany domenowe są projektowane i akceptowane etapami. Nie implementować Dzisiaj bez osobnej akceptacji projektu tego ekranu.

Zatwierdzony tekst wejściowy:

> Codzienność nie mieści się w jednej liście

Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.

Pełny zakres i architektura: `docs/ios-foundations.md`. Uzgodnienia logowania: `docs/ios-authentication.md`.

## 2. Co jest zaimplementowane

### Web, backend i kontrakty

- wersjonowane kontrakty JSON oraz wspólne fixture'y dla TypeScript i Swift w `contracts/`;
- testy zgodności kontraktów po stronie webu i iOS;
- uwierzytelnione endpointy Open Food Facts: wyszukiwanie i produkt po EAN/UPC;
- warianty endpointów dla hostingu webowego i Cloudflare Workera;
- serwerowa funkcja Supabase `delete-account`;
- kontrakt synchronizacji snapshotów/CAS v2 i jego testy;
- końcowe poprawki responsywne widoku Dzisiaj oraz odpowiadające im snapshoty wizualne;
- README i przykładowe zmienne środowiskowe opisujące mobile/backend.

### Fundament iOS

- projekt `ios/Rootine/Rootine.xcodeproj` bez zewnętrznego SDK Supabase;
- cienki klient Supabase oparty na `URLSession`;
- modele `Codable`, wspólne fixture'y i testy kontraktów;
- atomowa pamięć plikowa, Data Protection, Keychain i trwała kolejka mutacji;
- szkielet czterech zakładek i kontekstowego `+`, bez przedwczesnych ekranów domenowych;
- ciemne tokeny wizualne Atrament;
- launch/bootstrap sesji online i offline;
- logowanie i samodzielna rejestracja e-mail/hasło;
- potwierdzenie adresu i ponowne wysłanie wiadomości;
- odzyskiwanie oraz ustawienie nowego hasła przez deep link;
- Google OAuth przez `ASWebAuthenticationSession`;
- natywne Sign in with Apple z nonce;
- odświeżanie i zapis sesji w Keychain;
- callback `rootine://auth-callback` wpisany do `Info.plist`;
- ręcznie uruchamiany workflow GitHub Actions dla nowszego Xcode/TestFlight.

Szczegóły uruchomienia projektu znajdują się też w `ios/README.md`.

## 3. Czego świadomie jeszcze nie wykonano

- Projekt i testy Swift nie były kompilowane na Windows. Pierwszym zadaniem na MacBooku jest build oraz testy w Xcode 14.2.
- Nie zweryfikowano zdalnego wdrożenia migracji Supabase, endpointów backendu ani funkcji `delete-account`. Pliki wdrożeniowe są gotowe, ale stan produkcji trzeba potwierdzić.
- Nie skonfigurowano produkcyjnych danych Google/Apple, callbacków iOS ani prawdziwych adresów Regulaminu i Polityki prywatności.
- Nie wykonano pełnego smoke testu Auth → snapshot → CAS → Realtime → konflikt.
- Nie wykonano smoke testu Sign in with Apple na fizycznym urządzeniu. To obowiązkowa kontrola przed TestFlight.
- Nie ma jeszcze kompletnego Realtime, interfejsu aparatu/skanera ani pełnych ekranów Dzisiaj, Zadań, Odżywiania i Notatek.
- Ekran po zalogowaniu jest neutralną powierzchnią diagnostyczną fundamentu. Zastąpi go Dzisiaj dopiero po zatwierdzeniu projektu.

## 4. Pierwsze uruchomienie na MacBooku

Jeśli repozytorium nie jest jeszcze sklonowane:

```bash
git clone https://github.com/rakedzior/rootine.git
cd rootine
git fetch origin
git switch --track origin/agent/ios-authentication-handover
```

Jeśli repozytorium już istnieje:

```bash
git fetch origin
git switch agent/ios-authentication-handover || git switch --track origin/agent/ios-authentication-handover
git pull
```

Następnie:

```bash
cp ios/Rootine/Config/Secrets.xcconfig.example ios/Rootine/Config/Secrets.xcconfig
open ios/Rootine/Rootine.xcodeproj
```

W `Secrets.xcconfig` trzeba ustawić:

- URL projektu Supabase i publishable/anon key;
- produkcyjny URL backendu Rootine;
- Apple Team ID i docelowy bundle identifier;
- publiczne, działające adresy Regulaminu i Polityki prywatności.

Nie wolno umieszczać `SUPABASE_SERVICE_ROLE_KEY` w aplikacji ani commitować `Secrets.xcconfig`.

W Xcode:

1. Otworzyć scheme `Rootine` i wybrać symulator iOS 16.2.
2. Ustawić własny zespół w Signing & Capabilities oraz zweryfikować bundle identifier.
3. Włączyć capability Sign in with Apple dla właściwego App ID.
4. Wykonać build (`Cmd+B`) i testy (`Cmd+U`).
5. Naprawić wyłącznie rzeczy wymagane przez Xcode 14.2/iOS 16, bez podnoszenia deployment targetu i bez wprowadzania SwiftData/Observation.

Xcode 14.2 nie obsłuży lokalnego uruchomienia na iPhonie z iOS 27. Lokalnie używać symulatora iOS 16.2, a build na fizyczny iPhone wykonywać oszczędnie przez ręczny workflow i TestFlight.

## 5. Konfiguracja Supabase i backendu

Wykonać checklistę z `docs/ios-backend-setup.md`, w szczególności:

1. Potwierdzić na zdalnym projekcie migracje:
   - `20260806120000_rootine_workspace_snapshots.sql`;
   - `20260819090000_rootine_workspace_sync_v2.sql`.
2. Wdrożyć `supabase/functions/delete-account` i ustawić service-role key tylko jako sekret funkcji.
3. Wdrożyć backend z `OPEN_FOOD_FACTS_CONTACT`, `SUPABASE_URL` i publishable/anon key.
4. Włączyć Email, Google i Apple w Supabase Auth.
5. Dodać `rootine://auth-callback` do redirect allowlist.
6. Skonfigurować Google OAuth oraz Apple App ID/Services ID/key dla docelowego bundle identifiera.
7. Wykonać testy wdrożenia opisane w sekcji „Smoke checks after deployment”.

Do aplikacji trafia wyłącznie publiczny klucz i JWT użytkownika. Endpointy produktów wymagają `Authorization: Bearer <access_token>`.

## 6. Kolejność dalszej pracy

1. Skompilować projekt i uruchomić testy w Xcode 14.2.
2. Skonfigurować środowisko testowe Supabase i sprawdzić e-mail/hasło oraz deep link.
3. Sprawdzić Google i Apple na rzeczywistych konfiguracjach.
4. Zweryfikować offline bootstrap, odświeżanie sesji i wylogowanie.
5. Potwierdzić wdrożenie backendu/migracji i wykonać smoke test synchronizacji.
6. Pokazać oraz zatwierdzić wygląd i zachowanie całego uwierzytelniania.
7. Dopiero potem przygotować osobną specyfikację i projekt ekranu Dzisiaj.

## 7. Kontrole wykonane na Windows

Przed publikacją tej gałęzi uruchomiono:

- pełny `npm run check` dla webu, kontraktów i audytu design systemu;
- `npm run ios:audit` dla struktury projektu i zgodności plików;
- walidację XML `Info.plist`;
- lint skryptu audytującego iOS;
- `git diff --check`.

Wynik kompilacji i testów Swift musi zostać dopisany po uruchomieniu na MacBooku.

## 8. Prompt do nowej sesji Codex na MacBooku

```text
Przeczytaj w całości HANDOVER-MACBOOK-2026-08-19.md, docs/ios-foundations.md,
docs/ios-authentication.md, docs/ios-backend-setup.md i ios/README.md. Kontynuuj
od kompilacji oraz testów uwierzytelniania w Xcode 14.2. Zachowaj iOS 16.0,
Swift 5.7, wspólny backend Supabase i brak martwych przejść. Nie implementuj
ekranu Dzisiaj bez osobnej specyfikacji i mojej akceptacji.
```

Jeśli GitHub CLI na nowym komputerze nie jest zalogowany, wykonać `gh auth login -h github.com` dopiero wtedy, gdy będzie potrzebne utworzenie lub obsługa pull requestu.

# Rootine iOS — uwierzytelnianie

Status: `zaakceptowane i zaimplementowane`
Data akceptacji: `2026-08-19`

## Zatwierdzony przekaz

> Codzienność nie mieści się w jednej liście

Rootine łączy zadania, cele, rutyny i ważne sprawy w jeden osobisty system.

## Zakres

- każdy użytkownik samodzielnie tworzy prywatne konto;
- e-mail i hasło, Google oraz natywne Sign in with Apple;
- potwierdzenie adresu e-mail i ponowne wysłanie wiadomości;
- odzyskiwanie i ustawienie nowego hasła przez deep link;
- pierwsze logowanie wymaga internetu;
- późniejsza ważna sesja i lokalne dane są dostępne offline;
- tokeny są przechowywane wyłącznie w Keychain;
- po uwierzytelnieniu rozpoczyna się uzgodnienie snapshotów Supabase.

Nie ma kont gościnnych, kodów zaproszeń, danych demonstracyjnych, zgód
marketingowych ani pytań o uprawnienia systemowe podczas logowania.

## Stany i odzyskiwanie

| Stan | Zachowanie |
| --- | --- |
| Brak konfiguracji | Przyciski sieciowe są niedostępne, a ekran wyjaśnia przyczynę. |
| Brak sieci przy pierwszym logowaniu | Dane formularza pozostają; użytkownik dostaje możliwość ponowienia. |
| Błędne dane | Komunikat nie ujawnia, które pole identyfikuje istniejące konto. |
| E-mail niepotwierdzony | Użytkownik może ponownie wysłać wiadomość lub przejść do logowania. |
| OAuth anulowany | Spokojny komunikat i możliwość ponowienia bez utraty stanu. |
| Reset hasła | Link otwiera `rootine://auth-callback`, a aplikacja pokazuje formularz nowego hasła. |
| Długa synchronizacja | Po 10 sekundach komunikat informuje, że operacja nadal trwa. |
| Istniejąca sesja bez sieci | Aplikacja ładuje lokalne kopie i wznowi synchronizację później. |

## Konfiguracja operacyjna

- callback: `rootine://auth-callback`;
- callback musi być na liście dozwolonych redirect URL w Supabase;
- Apple App ID musi mieć włączone Sign in with Apple;
- Google i Apple muszą być aktywne w tym samym projekcie Supabase co web;
- rejestracja wymaga działających publicznych adresów Regulaminu i Polityki prywatności.

Pełna konfiguracja środowiska jest opisana w `docs/ios-backend-setup.md`.

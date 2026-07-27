---
version: 1
slug: "src-app-pages-odzywanie-tsx"
primary_target: "src/app/pages/Odzywanie.tsx"
related_targets: ["src/app/data/nutritionWorkspace.ts","src/app/data/nutritionCatalog.ts","src/app/data/nutritionCalculator.ts"]
---

Mode: Operate

Audience: użytkownik lokalnego MVP, który chce szybko zapisać rzeczywiście zjedzone produkty, porównać sumę z własnym celem dnia i ustawić orientacyjny budżet bez ręcznego liczenia.

Job: wybierz dzień, dodaj lub popraw produkt we właściwym posiłku, sprawdź kalorie, makroskładniki i nawodnienie, a w ustawieniach wylicz albo wpisz własne cele bez opuszczania dziennika.

Primary action: „Dodaj produkt”. Wpisanie co najmniej dwóch znaków pokazuje najpierw polskie produkty podstawowe, potem produkty bez marki i na końcu produkty markowe. Wybrany produkt wypełnia wartości odżywcze i porcję; wpis ręczny pozostaje dostępny.

Content and states: cztery zawsze widoczne pory posiłków — Śniadanie, Obiad, Kolacja i Przekąski — także w pustym dniu; suma kcal oraz B/W/T dla każdej grupy; dzienny bilans; ustawienia celu przy budżecie; nawodnienie w ml z krokami 150, 250, 330 i 500 ml; mini-moduł masy ciała z ostatnim pomiarem, zmianą i akcjami dodawania oraz analizy; analiza w zakresach 7, 30 i 90 dni, zestawiająca pomiary masy, dzienne kalorie i średnią realizację makro bez traktowania brakujących dni jako zera; kalkulator dla dorosłych z płcią, wiekiem, wagą, wzrostem i charakterem pracy; tygodniowa lista aktywności, w której można dodać wiele treningów tego samego rodzaju i opisać każdy przez intensywność, liczbę sesji oraz czas; korekta celu diety procentowo lub stałą liczbą kcal; konfiguracja makroskładników przez profil automatyczny, procenty lub twarde wartości w gramach; aktywowana synchronizacja, która na bieżąco przenosi wyliczone kalorie, makro lub wodę do pól zapisu i wyłącza się dla danej grupy po ręcznej korekcie; wyniki, walidacja, ręczna korekta i zapis profilu; stan ładowania, brak wyników i błąd katalogu; edycja, usuwanie i cofnięcie usunięcia.

Direction: dzienny arkusz budżetu żywieniowego. Rejestr jest semantyczną, pogrupowaną tabelą na szerokim ekranie i zbiorem czytelnych rekordów na telefonie; bilans oraz woda tworzą spokojny panel pomocniczy. Ustawienia są kontekstowymi ikonami koła zębatego, nie osobnym widokiem. Kalkulator jest liniowym wyjaśnieniem wyniku, nie galerią KPI.

Memorable moment: po wybraniu podpowiedzi produktu porcja i makroskładniki pojawiają się automatycznie, a wyliczony cel pokazuje osobno przemianę spoczynkową, zwykły dzień, średnią aktywność z całego tygodnia i jawną korektę celu diety przed świadomym zastosowaniem.

Constraints: wpisy, cele, profil kalkulatora, strategia makroskładników i pomiary masy są zapisywane lokalnie; katalog zewnętrzny jest wyłącznie odczytywany przez lokalny proxy. Dla jednej daty istnieje jeden pomiar masy, a ponowny zapis świadomie go aktualizuje. Produkty podstawowe pochodzą z USDA Foundation Foods (CC0), a produkty rynkowe z Open Food Facts (ODbL). Kalkulatory są orientacyjnymi estymacjami dla dorosłych, nie diagnozą ani poradą medyczną; wynik zawsze pozostaje edytowalny, a ograniczenia są widoczne. Aplikacja musi działać ręcznie przy braku sieci. Bez kont i synchronizacji. Uszkodzony zapis nigdy nie jest nadpisywany bez świadomej decyzji użytkownika.

Resolved: źródła katalogu to USDA Foundation Foods i Open Food Facts; podstawową jednostką jest gram lub mililitr; produkt markowy używa gramatury opakowania, gdy źródło ją udostępnia, a pozostałe produkty startują od 100 g. Kalorie korzystają z równania Mifflina–St Jeora, mnożnika charakteru pracy i uśrednionego na siedem dni kosztu netto MET każdej zapisanej aktywności. Cel diety przyjmuje jawną wartość ze znakiem w procentach albo kcal. Makroskładniki można ustawić automatycznie według profilu, procentowo albo jako twarde wartości. Przyciski zastosowania wyliczeń włączają dalszą synchronizację odpowiednich pól; ręczna zmiana wyłącza ją tylko dla kalorii, makro albo wody. Woda używa ostrożnej estymacji 1 ml na kcal utrzymania i wyraźnego zastrzeżenia o indywidualnej zmienności.

Unresolved: kalibracja celu na podstawie trendu masy, temperatura i rzeczywista potliwość, docelowy proxy dla wdrożenia produkcyjnego, skanowanie kodów kreskowych i synchronizacja między urządzeniami.

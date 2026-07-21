Zaprojektuj interfejs aplikacji w stylistyce premium dark mode opartej na palecie Graphite + Ice Blue.

KIERUNEK WIZUALNY
Interfejs ma być spokojny, nowoczesny, precyzyjny i elegancki. Powinien przypominać osobisty system operacyjny do zarządzania całym życiem, a nie typowy dashboard SaaS, panel administracyjny, aplikację gamingową ani neonowy interfejs.

Dark theme nie może być całkowicie czarny. Użyj kilku poziomów grafitowych powierzchni, aby uzyskać subtelną głębię i wyraźną hierarchię.

PALETA

Tła:
- App background: #0B1016
- Sidebar: #090D12
- Main surface: #101720
- Elevated panel: #141D27
- Card: #18232E
- Card hover: #1D2A36
- Input background: #151E28

Obramowania:
- Subtle border: #25313D
- Strong border: #344453
- Focus border: rgba(125, 166, 206, 0.55)

Tekst:
- Primary: #F2F5F7
- Secondary: #A8B4C0
- Muted: #6F7D8B
- Disabled: #4D5965

Główny akcent:
- Ice Blue: #7DA6CE
- Ice Blue hover: #91B7DA
- Ice Blue soft background: rgba(125, 166, 206, 0.12)
- Ice Blue border: rgba(125, 166, 206, 0.26)

Akcent uzupełniający:
- Sea Glass: #70B89F
- Sea Glass soft: rgba(112, 184, 159, 0.12)

Kolory semantyczne:
- Success: #70B89F
- Warning: #D4AA68
- Danger: #CF777C
- Information: #7DA6CE

ZASADY UŻYCIA KOLORÓW
Ice Blue jest głównym kolorem interfejsu i służy do:
- aktywnego elementu nawigacji,
- aktywnych zakładek,
- focus state,
- zaznaczonych filtrów,
- ikon informacyjnych,
- aktualnej daty,
- linków i drugorzędnych akcji,
- wartości i wskaźników danych.

Sea Glass służy wyłącznie do:
- ukończonych zadań,
- sukcesów,
- poprawnie wykonanych nawyków,
- pozytywnego postępu.

Nie używaj jednego koloru akcentowego wszędzie. Przycisk główny może być Ice Blue, ale checkbox ukończonego zadania powinien być Sea Glass.

POWIERZCHNIE I GŁĘBIA
Buduj hierarchię za pomocą tonalnych różnic między powierzchniami, a nie grubych obramowań.

Zastosuj:
- bardzo subtelne gradienty w kartach,
- delikatne obramowania 1 px,
- miękkie cienie o niskiej intensywności,
- lekki wewnętrzny highlight przy górnej krawędzi podniesionych paneli,
- niewielkie rozjaśnienie kart podczas hover.

Nie używaj:
- neonowych poświat,
- mocnego glassmorphism,
- grubych ramek,
- intensywnie niebieskich gradientów,
- nadmiernie świecących przycisków,
- czystej bieli na dużych powierzchniach.

SIDEBAR
Sidebar powinien być najciemniejszą powierzchnią aplikacji.

Aktywna pozycja:
- delikatne tło Ice Blue z opacity 10–14%,
- tekst i ikona w Ice Blue,
- opcjonalnie cienki akcent 2 px po lewej stronie,
- bez mocnego, jednolitego niebieskiego prostokąta.

Nieaktywne elementy:
- ikony i tekst w muted gray,
- po najechaniu delikatne rozjaśnienie powierzchni.

KARTY
Karty mają być lekko podniesione względem tła, ale nie mogą wyglądać jak osobne pudełka.

Zastosuj:
- radius 12–16 px,
- border 1 px w kolorze subtle border,
- subtelny cień,
- padding 18–24 px,
- wyraźną hierarchię nagłówków, wartości i metadanych.

Unikaj jednoczesnego używania mocnego cienia, grubej ramki i kontrastowego tła.

PRZYCISKI
Primary:
- tło Ice Blue,
- tekst w bardzo ciemnym graficie,
- niewielki gradient lub highlight,
- bez neonowej poświaty.

Secondary:
- transparentne lub grafitowe tło,
- subtelna ramka,
- jasnoszary tekst,
- Ice Blue dopiero podczas hover lub focus.

Ghost:
- brak stałego tła,
- muted text,
- miękkie Ice Blue hover state.

FORMULARZE
Inputy powinny być ciemniejsze od kart lub delikatnie osadzone w ich powierzchni.

Stany:
- default: subtelna grafitowa ramka,
- hover: jaśniejsza ramka,
- focus: Ice Blue border i bardzo delikatny outer ring,
- error: zgaszona czerwień,
- success: Sea Glass.

TYPOGRAFIA
Użyj nowoczesnego sans-serif, np.:
- Plus Jakarta Sans,
- Inter,
- Geist,
- Manrope.

Hierarchia:
- nagłówki: semi-bold,
- podstawowy tekst: regular lub medium,
- metadane: muted,
- wartości KPI: wyraźne, ale nie przesadnie duże,
- etykiety sekcji: uppercase lub small caps z większym letter-spacing.

Nie używaj serifów.

IKONY
Ikony powinny być lekkie, geometryczne i spójne:
- stroke 1.5–1.75 px,
- muted gray w stanie domyślnym,
- Ice Blue w stanie aktywnym,
- Sea Glass dla sukcesu.

Nie używaj kolorowych ikon dekoracyjnych bez znaczenia funkcjonalnego.

PROGRESS I STATUSY
Progress bar:
- track: #25313D,
- fill: Ice Blue dla neutralnego postępu,
- fill: Sea Glass dla sukcesu,
- wysokość 4–6 px,
- rounded ends.

Checkbox:
- pusty: grafitowa ramka,
- aktywny: Ice Blue,
- ukończony: Sea Glass,
- brak neonowej poświaty.

EFEKT KOŃCOWY
Interfejs ma wyglądać jak premium personal operating system:
- spokojny,
- analityczny,
- nowoczesny,
- dopracowany,
- czytelny przy wielogodzinnym używaniu,
- wystarczająco neutralny dla zadań, diety, treningu, finansów, pracy i notatek.

Zachowaj istniejący layout, strukturę modułów i hierarchię informacji. Zmieniaj visual language, kolory, powierzchnie, spacing i stany komponentów, ale nie przebudowuj funkcjonalności bez wyraźnej potrzeby.
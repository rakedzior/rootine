export type LegalDocument = "terms" | "privacy";

type LegalDocumentContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

const DOCUMENTS: Record<LegalDocument, LegalDocumentContent> = {
  terms: {
    eyebrow: "Dokument roboczy",
    title: "Regulamin Rootine",
    intro: "To jest tymczasowa wersja regulaminu dla testowej wersji Rootine. Zostanie uzupełniona przed publicznym udostępnieniem usługi.",
    sections: [
      {
        heading: "1. Usługa",
        paragraphs: [
          "Rootine pomaga organizować zadania, cele, notatki i codzienne sprawy w jednym workspace’ie.",
          "Wersja testowa może być rozwijana, zmieniana lub czasowo niedostępna.",
        ],
      },
      {
        heading: "2. Konto i dane",
        paragraphs: [
          "Użytkownik odpowiada za dane logowania i za treści dodawane do swojego konta.",
          "Nie udostępniaj innym osobom danych logowania ani treści, do których nie masz praw.",
        ],
      },
      {
        heading: "3. Zasady korzystania",
        paragraphs: [
          "Z Rootine należy korzystać zgodnie z prawem i z poszanowaniem praw innych osób.",
          "Rootine nie zastępuje profesjonalnej porady medycznej, prawnej ani finansowej.",
        ],
      },
      {
        heading: "4. Kontakt i zmiany",
        paragraphs: [
          "Przed uruchomieniem wersji produkcyjnej ten dokument zostanie uzupełniony o dane operatora, zasady odpowiedzialności i właściwy kontakt.",
          "Aktualna wersja dokumentu jest publikowana pod tym adresem.",
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "Dokument roboczy",
    title: "Polityka prywatności Rootine",
    intro: "To jest tymczasowa wersja polityki prywatności dla testowej wersji Rootine. Zostanie uzupełniona przed publicznym udostępnieniem usługi.",
    sections: [
      {
        heading: "1. Jakie dane mogą być przetwarzane",
        paragraphs: [
          "W zależności od używanych funkcji Rootine może przetwarzać adres e-mail, dane konta oraz treści zapisane przez użytkownika w workspace’ie.",
          "Usługa może również otrzymywać podstawowe dane techniczne potrzebne do logowania, synchronizacji i bezpieczeństwa.",
        ],
      },
      {
        heading: "2. Po co używamy danych",
        paragraphs: [
          "Dane są używane do utworzenia i obsługi konta, synchronizacji workspace’ów oraz zapewnienia działania aplikacji.",
          "Nie używamy danych workspace’u do sprzedaży reklam.",
        ],
      },
      {
        heading: "3. Przechowywanie i bezpieczeństwo",
        paragraphs: [
          "Dane lokalne mogą pozostać w pamięci urządzenia lub przeglądarki. Dane konta i synchronizowane workspace’y mogą być przechowywane przez dostawców infrastruktury używanych przez Rootine.",
          "Stosujemy środki techniczne odpowiednie do testowego charakteru usługi, ale żadna usługa internetowa nie daje absolutnej gwarancji bezpieczeństwa.",
        ],
      },
      {
        heading: "4. Prawa użytkownika i kontakt",
        paragraphs: [
          "Przed publicznym uruchomieniem dokument zostanie uzupełniony o dane administratora, podstawy prawne, okresy przechowywania, odbiorców danych oraz sposób realizacji praw użytkownika.",
          "W sprawach prywatności skorzystaj z kontaktu podanego w finalnej wersji tego dokumentu.",
        ],
      },
    ],
  },
};

export function LegalPage({ document }: { document: LegalDocument }) {
  const content = DOCUMENTS[document];

  return (
    <main className="legal-page">
      <div className="legal-page__glow" aria-hidden="true" />
      <div className="legal-page__frame">
        <header className="legal-page__header">
          <a className="legal-page__brand" href="/" aria-label="Rootine — strona główna">
            <span className="legal-page__brand-mark" aria-hidden="true">R</span>
            <span>Rootine</span>
          </a>
          <a className="legal-page__back-link" href="/">Wróć do Rootine</a>
        </header>

        <article className="legal-page__article">
          <p className="legal-page__eyebrow">{content.eyebrow}</p>
          <h1>{content.title}</h1>
          <p className="legal-page__intro">{content.intro}</p>

          <div className="legal-page__notice" role="note">
            <strong>Ważne</strong>
            <span>Ten tekst służy obecnie jako wersja robocza do konfiguracji i testów. Nie jest finalnym dokumentem prawnym.</span>
          </div>

          <div className="legal-page__sections">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </div>

          <footer className="legal-page__footer">
            <span>Rootine · wersja robocza</span>
            <span>Kontakt zostanie uzupełniony w wersji finalnej</span>
          </footer>
        </article>
      </div>
    </main>
  );
}

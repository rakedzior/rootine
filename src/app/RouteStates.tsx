import {
  AlertTriangle,
  ArrowLeft,
  Home,
  RotateCcw,
} from "lucide-react";
import { Link, isRouteErrorResponse, useLocation, useRouteError } from "react-router";
import { PageShell } from "./ui";

type RouteStateFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
};

function RouteStateFrame({
  eyebrow,
  title,
  description,
  icon,
  children,
  compact = false,
}: RouteStateFrameProps) {
  return (
    <main className={`app-route-state${compact ? " is-compact" : ""}`}>
      <PageShell
        width="standard"
        className="app-route-state__page-shell"
        contentClassName="app-route-state__page-content"
      >
        <section className="app-route-state__panel">
        <div className="app-route-state__brand" aria-hidden="true">
          <span>R</span>
          <strong>Rootine</strong>
        </div>
        <div className="app-route-state__icon" aria-hidden="true">{icon}</div>
        <p className="app-route-state__eyebrow">{eyebrow}</p>
        {/*
         * A route state replaces the whole workspace, so it owns the page's only
         * <h1>. PageShell renders no title of its own — passing one here would
         * silently drop the message, which is how it went missing before.
         */}
        <h1>{title}</h1>
        <p className="app-route-state__description">{description}</p>
        {children && <div className="app-route-state__actions">{children}</div>}
        </section>
      </PageShell>
    </main>
  );
}

export function RouteLoadingState() {
  return (
    <main className="app-route-loading" aria-busy="true" aria-label="Przygotowywanie obszaru roboczego">
      <span className="ui-sr-only" role="status" aria-live="polite">
        Przygotowujemy obszar roboczy. Zachowujemy stan pozostałych obszarów.
      </span>
      <header className="app-route-loading__header" aria-hidden="true">
        <span className="app-route-loading__identity app-route-skeleton" />
        <span className="app-route-loading__action app-route-skeleton" />
      </header>
      <div className="app-route-loading__workspace" aria-hidden="true">
        <section className="app-route-loading__summary">
          <div className="app-route-loading__summary-copy">
            <span className="app-route-loading__label app-route-skeleton" />
            <span className="app-route-loading__metric app-route-skeleton" />
            <span className="app-route-loading__track app-route-skeleton" />
          </div>
          <span className="app-route-loading__dial app-route-skeleton" />
          <div className="app-route-loading__summary-copy is-secondary">
            <span className="app-route-loading__label app-route-skeleton" />
            <span className="app-route-loading__metric is-short app-route-skeleton" />
            <span className="app-route-loading__caption app-route-skeleton" />
          </div>
        </section>
        <section className="app-route-loading__list">
          <div className="app-route-loading__section-heading">
            <span className="app-route-loading__section-title app-route-skeleton" />
            <span className="app-route-loading__count app-route-skeleton" />
          </div>
          {Array.from({ length: 7 }, (_, index) => (
            <div
              key={index}
              className="app-route-loading__row"
            >
              <span className="app-route-loading__row-icon app-route-skeleton" />
              <span className="app-route-loading__row-title app-route-skeleton" />
              <span className="app-route-loading__row-meta app-route-skeleton" />
              <span className="app-route-loading__row-status app-route-skeleton" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

export function RouteErrorState() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : null;
  const description = status === 404
    ? "Ten adres nie prowadzi już do istniejącego obszaru."
    : "Nie udało się otworzyć tego modułu. Twoje dane lokalne nie zostały zmienione.";

  return (
    <RouteStateFrame
      eyebrow={status ? `Błąd ${status}` : "Błąd modułu"}
      title="Nie możemy wyświetlić tego widoku"
      description={description}
      icon={<AlertTriangle size={22} />}
    >
      <button type="button" className="app-route-state__button is-primary" onClick={() => window.location.reload()}>
        <RotateCcw size={14} aria-hidden="true" />
        Spróbuj ponownie
      </button>
      <Link className="app-route-state__button" to="/dzisiaj">
        <Home size={14} aria-hidden="true" />
        Wróć do Dzisiaj
      </Link>
    </RouteStateFrame>
  );
}

export function RouteNotFoundState() {
  const location = useLocation();

  return (
    <RouteStateFrame
      eyebrow="Nieznany adres"
      title="Tego widoku nie ma w Rootine"
      description={`Adres „${location.pathname}” nie odpowiada żadnemu aktywnemu modułowi.`}
      icon={<AlertTriangle size={22} />}
    >
      <Link className="app-route-state__button is-primary" to="/dzisiaj">
        <Home size={14} aria-hidden="true" />
        Przejdź do Dzisiaj
      </Link>
      <button type="button" className="app-route-state__button" onClick={() => window.history.back()}>
        <ArrowLeft size={14} aria-hidden="true" />
        Wróć
      </button>
    </RouteStateFrame>
  );
}

import {
  AlertTriangle,
  ArrowLeft,
  Home,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { Link, isRouteErrorResponse, useLocation, useRouteError } from "react-router";

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
      <section className="app-route-state__panel" aria-labelledby="app-route-state-title">
        <div className="app-route-state__brand" aria-hidden="true">
          <span>R</span>
          <strong>Routine</strong>
        </div>
        <div className="app-route-state__icon" aria-hidden="true">{icon}</div>
        <p className="app-route-state__eyebrow">{eyebrow}</p>
        <h1 id="app-route-state-title">{title}</h1>
        <p className="app-route-state__description">{description}</p>
        {children && <div className="app-route-state__actions">{children}</div>}
      </section>
    </main>
  );
}

export function RouteLoadingState() {
  return (
    <RouteStateFrame
      eyebrow="Routine"
      title="Przygotowujemy obszar roboczy"
      description="Ładujemy tylko potrzebny moduł i zachowujemy stan pozostałych obszarów."
      icon={<LoaderCircle className="app-route-state__spinner" size={22} />}
      compact
    />
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
      title="Tego widoku nie ma w Routine"
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

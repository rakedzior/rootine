import { NavLink, Outlet } from "react-router";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  Dumbbell,
  Map,
  Salad,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

const NAV: Array<{ label: string; icon: LucideIcon; to: string }> = [
  { label: "Zadania", icon: CheckSquare, to: "/zadania" },
  { label: "Kalendarz", icon: CalendarDays, to: "/kalendarz" },
  { label: "Cele", icon: Target, to: "/cele" },
  { label: "Sport", icon: Dumbbell, to: "/sport" },
  { label: "Odżywianie", icon: Salad, to: "/odzywianie" },
  { label: "Praca", icon: BriefcaseBusiness, to: "/praca" },
  { label: "Sprawy", icon: ShieldCheck, to: "/sprawy" },
  { label: "Podróże", icon: Map, to: "/podroze" },
];

function PrimaryNavItem({ label, icon: Icon, to, mobile = false }: { label: string; icon: LucideIcon; to: string; mobile?: boolean }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) => [
        mobile ? "app-mobile-nav__item" : "app-nav-item",
        isActive ? "is-active" : "",
      ].filter(Boolean).join(" ")}
    >
      <Icon size={mobile ? 18 : 15} strokeWidth={1.7} aria-hidden="true" />
      <span className={mobile ? "app-mobile-nav__label" : "app-nav-label"}>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Główna nawigacja">
        <div className="app-brand">
          <div className="app-brand__mark" aria-hidden="true">R</div>
          <span className="app-brand-label">Routine</span>
        </div>

        <nav className="app-primary-nav" aria-label="Obszary aplikacji">
          {NAV.map((item) => <PrimaryNavItem key={item.to} {...item} />)}
        </nav>

        <div className="app-sidebar__footer">
          <span className="app-sidebar__status" aria-hidden="true" />
          <span className="app-sidebar__footer-label">MVP lokalny</span>
        </div>
      </aside>

      <div className="app-shell__body">
        <div className="app-shell__content">
          <Outlet />
        </div>
        <nav className="app-mobile-nav" aria-label="Główna nawigacja mobilna">
          {NAV.map((item) => <PrimaryNavItem key={item.to} {...item} mobile />)}
        </nav>
      </div>
    </div>
  );
}

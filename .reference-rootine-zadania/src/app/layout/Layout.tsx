import { Outlet, NavLink } from "react-router";
import {
  LayoutGrid, CheckSquare, Target, Dumbbell, Salad,
  Briefcase, BarChart2, FileText, Inbox, Settings,
} from "lucide-react";

const T = {
  sidebar:       "#1C1C1C",
  sidebarBorder: "#282828",
  activeBg:      "rgba(71,114,250,0.11)",
  activeText:    "#4772FA",
  inactiveText:  "#646464",
  hoverBg:       "rgba(255,255,255,0.04)",
  hoverText:     "#A0A0A0",
  primaryText:   "#F0F0F0",
  iceBlue:       "#4772FA",
} as const;

const NAV = [
  { label: "Dzisiaj",    icon: LayoutGrid,  to: "/"          },
  { label: "Zadania",    icon: CheckSquare, to: "/zadania"   },
  { label: "Cele",       icon: Target,      to: "/cele"      },
  { label: "Sport",      icon: Dumbbell,    to: "/sport"     },
  { label: "Odżywianie", icon: Salad,       to: "/odzywanie" },
  { label: "Praca",      icon: Briefcase,   to: "/praca"     },
  { label: "Finanse",    icon: BarChart2,   to: "/finanse"   },
  { label: "Notatki",    icon: FileText,    to: "/notatki"   },
  { label: "Sprawy",     icon: Inbox,       to: "/sprawy"    },
];

function getMiniWeek() {
  const today = new Date();
  const dow = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { n: d.getDate(), today: d.toDateString() === today.toDateString() };
  });
}

const DLABELS = ["P", "W", "Ś", "C", "P", "S", "N"];

export default function Layout() {
  const week = getMiniWeek();

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: "#242424", color: "#F0F0F0" }}
    >
      <aside
        className="w-[204px] flex-shrink-0 flex flex-col border-r"
        style={{ background: T.sidebar, borderColor: T.sidebarBorder }}
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: T.iceBlue, boxShadow: "0 2px 8px rgba(71,114,250,0.35)" }}
            >
              <span className="text-[11px] font-bold text-white">R</span>
            </div>
            <span className="text-[13px] font-semibold tracking-wide" style={{ color: T.primaryText }}>
              Rootine
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 space-y-px overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {({ isActive }) => (
                <div
                  className="w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[12.5px] transition-all duration-150"
                  style={{
                    background: isActive ? T.activeBg : "transparent",
                    color: isActive ? T.activeText : T.inactiveText,
                    fontWeight: isActive ? 500 : 400,
                    borderLeft: isActive ? `2px solid ${T.iceBlue}` : "2px solid transparent",
                    paddingLeft: "10px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = T.hoverBg;
                      (e.currentTarget as HTMLElement).style.color = T.hoverText;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = T.inactiveText;
                    }
                  }}
                >
                  <Icon size={14} strokeWidth={1.6} className="flex-shrink-0" />
                  <span className="leading-none">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Mini week */}
        <div className="px-3 py-3 border-t" style={{ borderColor: T.sidebarBorder }}>
          <div className="flex gap-0.5">
            {week.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px]" style={{ color: "#404040" }}>{DLABELS[i]}</span>
                <div
                  className="w-full flex items-center justify-center rounded-md text-[10px] font-medium"
                  style={{
                    aspectRatio: "1",
                    background: d.today ? "rgba(71,114,250,0.14)" : "transparent",
                    color: d.today ? T.iceBlue : "#404040",
                    border: d.today ? "1px solid rgba(71,114,250,0.28)" : "1px solid transparent",
                  }}
                >
                  {d.n}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="px-4 py-3.5 border-t flex items-center gap-2.5" style={{ borderColor: T.sidebarBorder }}>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
            style={{ background: "rgba(71,114,250,0.14)", color: T.iceBlue }}
          >
            M
          </div>
          <span className="text-[12px] font-medium flex-1" style={{ color: "#A0A0A0" }}>Mateusz</span>
          <Settings size={13} strokeWidth={1.5} style={{ color: "#404040" }} />
        </div>
      </aside>

      <div className="flex-1 flex overflow-hidden" style={{ background: "#242424" }}>
        <Outlet />
      </div>
    </div>
  );
}

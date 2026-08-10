import type { WorkWorkspace } from "../data/workWorkspace";
import { Select } from "../ui";
import type { WorkView } from "./workPresentation";

type WorkMobileNavigationProps = {
  workspace: WorkWorkspace;
  view: WorkView;
  companyId: string;
  projectId: string;
  onNavigate: (view: WorkView, companyId?: string, projectId?: string) => void;
};

export function WorkMobileNavigation({ workspace, view, companyId, projectId, onNavigate }: WorkMobileNavigationProps) {
  const value = view === "company" ? `company:${companyId}` : view === "project" ? `project:${companyId}:${projectId}` : view;
  const options = [
    { value: "today", label: "Dzisiaj" },
    { value: "tomorrow", label: "Jutro" },
    { value: "week", label: "Ten tydzień" },
    { value: "untimed", label: "Bez terminu" },
    { value: "active", label: "Wszystkie" },
    ...workspace.companies.filter((company) => !company.archived).flatMap((company) => [
      { value: `company:${company.id}`, label: `Firma · ${company.name}` },
      ...workspace.projects
        .filter((project) => project.companyId === company.id && project.status !== "completed")
        .map((project) => ({ value: `project:${company.id}:${project.id}`, label: `${company.name} · ${project.name}` })),
    ]),
    { value: "unassigned", label: "Nieprzypisane" },
    { value: "archive", label: "Archiwum" },
  ];

  const selectView = (next: string) => {
    if (next.startsWith("company:")) return onNavigate("company", next.slice("company:".length));
    if (next.startsWith("project:")) {
      const [, nextCompanyId, nextProjectId] = next.split(":");
      return onNavigate("project", nextCompanyId, nextProjectId);
    }
    onNavigate(next as WorkView);
  };

  return <Select compact className="context-mobile-select" aria-label="Wybierz widok pracy" value={value} options={options} onChange={(event) => selectView(event.target.value)} />;
}

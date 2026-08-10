import { Building2, Flag, FolderKanban, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { WorkCompany, WorkProject, WorkTaskPriority, WorkTaskStatus } from "../data/workWorkspace";
import { formatShortDate } from "../formatters";
import { TaskInlineMenu } from "../pages/PracaMenus";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  taskStatusIcon,
  taskStatusTone,
} from "./workPresentation";
import { Button, DatePicker } from "../ui";

export type WorkQuickEntryValues = {
  companyId: string;
  projectId: string;
  status: WorkTaskStatus;
  priority: WorkTaskPriority;
  dueDate: string;
};

type WorkQuickEntryProps = {
  companies: WorkCompany[];
  projects: WorkProject[];
  dueDate: string;
  dateLabel: string;
  destinationLabel: string;
  onCreate: (title: string, values: WorkQuickEntryValues) => void;
};

export function WorkQuickEntry({
  companies,
  projects,
  dueDate,
  dateLabel,
  destinationLabel,
  onCreate,
}: WorkQuickEntryProps) {
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<WorkTaskStatus>("todo");
  const [priority, setPriority] = useState<WorkTaskPriority>("none");
  const [selectedDueDate, setSelectedDueDate] = useState(dueDate);
  const normalizedTitle = title.trim();
  const availableCompanies = companies.filter((company) => !company.archived);
  const availableProjects = projects
    .filter((project) => project.status !== "completed")
    .filter((project) => !companyId || project.companyId === companyId);
  const selectedCompany = availableCompanies.find((company) => company.id === companyId);
  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    setSelectedDueDate(dueDate);
  }, [dueDate]);

  const dueDateLabel = selectedDueDate === dueDate
    ? dateLabel
    : selectedDueDate
      ? formatShortDate(selectedDueDate)
      : "Bez terminu";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedTitle) return;
    onCreate(normalizedTitle, { companyId, projectId, status, priority, dueDate: selectedDueDate });
    setTitle("");
  };

  const selectCompany = (value: string) => {
    setCompanyId(value);
    if (!value || selectedProject?.companyId !== value) setProjectId("");
  };

  const selectProject = (value: string) => {
    setProjectId(value);
    const project = projects.find((candidate) => candidate.id === value);
    if (project) setCompanyId(project.companyId);
  };

  const companyOptions = [
    {
      value: "",
      label: "Bez firmy",
      leadingIcon: <Building2 size={13} aria-hidden="true" />,
      selected: !companyId,
    },
    ...availableCompanies.map((company) => ({
      value: company.id,
      label: company.name,
      leadingIcon: <span className="work-quick-entry__company-dot" style={{ background: company.color }} />,
      selected: company.id === companyId,
    })),
  ];
  const projectOptions = [
    {
      value: "",
      label: "Bez projektu",
      leadingIcon: <FolderKanban size={13} aria-hidden="true" />,
      selected: !projectId,
    },
    ...availableProjects.map((project) => ({
      value: project.id,
      label: `${availableCompanies.find((company) => company.id === project.companyId)?.name ?? "Firma"} · ${project.name}`,
      leadingIcon: <FolderKanban size={13} aria-hidden="true" />,
      selected: project.id === projectId,
    })),
  ];
  const statusOptions = TASK_STATUS_ORDER
    .filter((candidate) => candidate !== "completed")
    .map((candidate) => ({
      value: candidate,
      label: TASK_STATUS_LABELS[candidate],
      leadingIcon: taskStatusIcon(candidate),
      selected: candidate === status,
      className: `work-inline-menu__item--${candidate}`,
    }));
  const priorityOptions = PRIORITY_ORDER.map((candidate) => ({
    value: candidate,
    label: PRIORITY_LABELS[candidate],
    leadingIcon: <Flag size={13} aria-hidden="true" />,
    selected: candidate === priority,
    className: `work-inline-menu__item--${candidate}`,
  }));

  return (
    <form className="work-quick-entry" aria-label="Szybkie dodawanie zadania do pracy" onSubmit={submit}>
      <button type="submit" className="work-quick-entry__lead" aria-label="Dodaj zadanie" disabled={!normalizedTitle}>
        <Plus size={13} aria-hidden="true" />
      </button>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Nazwa nowego zadania w pracy"
        placeholder={`Dodaj zadanie do „${destinationLabel}”`}
      />
      <div className="work-quick-entry__filters" aria-label="Właściwości nowego zadania">
        <TaskInlineMenu
          value={companyId}
          ariaLabel={`Firma: ${selectedCompany?.name ?? "Bez firmy"}`}
          triggerClassName={`work-quick-entry__control${companyId ? " is-active" : ""}`}
          options={companyOptions}
          onChange={selectCompany}
        >
          <Building2 size={13} aria-hidden="true" />
        </TaskInlineMenu>
        <TaskInlineMenu
          value={projectId}
          ariaLabel={`Projekt: ${selectedProject?.name ?? "Bez projektu"}`}
          triggerClassName={`work-quick-entry__control${projectId ? " is-active" : ""}`}
          options={projectOptions}
          onChange={selectProject}
        >
          <FolderKanban size={13} aria-hidden="true" />
        </TaskInlineMenu>
        <TaskInlineMenu
          value={status}
          ariaLabel={`Status: ${TASK_STATUS_LABELS[status]}`}
          triggerClassName={`work-quick-entry__control ${taskStatusTone(status)}`}
          options={statusOptions}
          onChange={(value) => setStatus(value as WorkTaskStatus)}
        >
          {taskStatusIcon(status)}
        </TaskInlineMenu>
        <TaskInlineMenu
          value={priority}
          ariaLabel={`Priorytet: ${PRIORITY_LABELS[priority]}`}
          triggerClassName={`work-quick-entry__control work-task-priority--${priority}`}
          options={priorityOptions}
          onChange={(value) => setPriority(value as WorkTaskPriority)}
        >
          <Flag size={13} aria-hidden="true" />
        </TaskInlineMenu>
      </div>
      <DatePicker
        value={selectedDueDate}
        displayValue={dueDateLabel}
        aria-label="Termin zadania"
        fieldClassName="work-quick-entry__date"
        portalLayer="featurePopup"
        onChange={setSelectedDueDate}
      />
      <Button variant="quiet" size="sm" type="submit" disabled={!normalizedTitle}>Dodaj</Button>
    </form>
  );
}

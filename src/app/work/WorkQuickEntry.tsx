import { Building2, Clock3, FolderKanban, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { WorkCompany, WorkProject, WorkTaskPriority, WorkTaskStatus } from "../data/workWorkspace";
import { formatShortDate } from "../formatters";
import { TaskInlineMenu } from "../pages/PracaMenus";
import {
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  taskStatusIcon,
  taskStatusTone,
  workPriorityMenuOptions,
} from "./workPresentation";
import { DatePicker, PriorityIcon, QuickComposer, TimePicker } from "../ui";

export type WorkQuickEntryValues = {
  companyId: string;
  projectId: string;
  status: WorkTaskStatus;
  priority: WorkTaskPriority;
  dueDate: string;
  dueTime: string;
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
  const [selectedDueTime, setSelectedDueTime] = useState("");
  const normalizedTitle = title.trim();
  const availableCompanies = companies.filter((company) => !company.archived);
  const availableProjects = projects
    .filter((project) => project.status !== "completed")
    .filter((project) => !companyId || project.companyId === companyId);
  const selectedCompany = availableCompanies.find((company) => company.id === companyId);
  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    setSelectedDueDate(dueDate);
    setSelectedDueTime("");
  }, [dueDate]);

  const dueDateLabel = selectedDueDate === dueDate
    ? dateLabel
    : selectedDueDate
      ? formatShortDate(selectedDueDate)
      : "Bez terminu";
  const dateDisplayValue = selectedDueTime ? `${dueDateLabel} / ${selectedDueTime}` : dueDateLabel;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedTitle) return;
    onCreate(normalizedTitle, {
      companyId,
      projectId,
      status,
      priority,
      dueDate: selectedDueDate,
      dueTime: selectedDueDate ? selectedDueTime : "",
    });
    setTitle("");
    setSelectedDueTime("");
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
  const priorityOptions = workPriorityMenuOptions();

  return (
    <QuickComposer
      className="work-quick-entry"
      density="compact"
      aria-label="Szybkie dodawanie zadania do pracy"
      onSubmit={submit}
      leadingAction={(
        <button type="submit" className="work-quick-entry__lead" aria-label="Dodaj zadanie" disabled={!normalizedTitle}>
          <Plus size={13} aria-hidden="true" />
        </button>
      )}
      editor={<input
        className="work-quick-entry__input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Nazwa nowego zadania w pracy"
        placeholder={`Dodaj zadanie do „${destinationLabel}”`}
      />}
      propertyControls={<>
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
          <PriorityIcon level={priority} />
        </TaskInlineMenu>
      </>}
      scheduleControl={(
        <DatePicker
          value={selectedDueDate}
          displayValue={dateDisplayValue}
          aria-label="Termin zadania"
          fieldClassName="work-quick-entry__date"
          triggerClassName="work-quick-date-trigger"
          density="compact"
          portalLayer="featurePopup"
          closeOnSelect={false}
          footerContent={(
            <div className="work-quick-entry__date-time">
              <div className="work-quick-entry__date-time-label">
                <Clock3 size={13} aria-hidden="true" />
                <span>Godzina</span>
              </div>
              <TimePicker
                value={selectedDueTime}
                aria-label="Godzina zadania"
                fieldClassName="work-quick-entry__time"
                density="compact"
                disabled={!selectedDueDate}
                options={[]}
                onChange={setSelectedDueTime}
              />
            </div>
          )}
          onChange={(value) => {
            setSelectedDueDate(value);
            if (!value) setSelectedDueTime("");
          }}
        />
      )}
    />
  );
}

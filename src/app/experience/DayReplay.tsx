import { ACTIVITY_LOG_RETENTION_DAYS, useActivityLog, type ActivityEvent } from "./activityLog";
import { SensitiveValue } from "./preferences";
import { toLocalDateKey } from "../data/localDate";
import { APP_MODULE_BY_ID } from "../moduleRegistry";
import { Modal } from "../ui";

export type DayReplayProps = {
  open: boolean;
  onClose: () => void;
};

const KIND_LABELS: Record<ActivityEvent["kind"], string> = {
  create: "Dodano",
  complete: "Wykonano",
  reopen: "Przywrócono",
  reschedule: "Przełożono",
  move: "Przeniesiono",
  delete: "Usunięto",
  status: "Zmieniono status",
  save: "Zapisano",
};

function eventDate(event: ActivityEvent) {
  const date = new Date(event.occurredAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function eventTime(event: ActivityEvent) {
  const date = eventDate(event);
  return date ? formatTime(date) : "—";
}

function fullDate(date: Date) {
  const formatted = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function DayReplay({ open, onClose }: DayReplayProps) {
  const events = useActivityLog();
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const todayEvents = events
    .filter((event) => {
      const date = eventDate(event);
      return date !== null && toLocalDateKey(date) === todayKey;
    })
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  if (!open) return null;

  return (
    <Modal
      title="Oś dnia"
      description={`${fullDate(now)} · historia zapisywana wyłącznie lokalnie`}
      onClose={onClose}
      size="md"
      bodyClassName="day-replay"
    >
      <div className="day-replay__scale" aria-label={`Skala dnia: 08:00, 12:00, 16:00, teraz ${formatTime(now)}`}>
        <span>08:00</span>
        <span>12:00</span>
        <span>16:00</span>
        <span>teraz</span>
      </div>

      {todayEvents.length > 0 ? (
        <ol className="day-replay__timeline" aria-label="Zarejestrowane zdarzenia z dzisiaj">
          {todayEvents.map((event) => (
            <li className={`day-replay__event kind-${event.kind}`} key={event.id}>
              <time dateTime={event.occurredAt}>{eventTime(event)}</time>
              <span className="day-replay__marker" aria-hidden="true" />
              <div className="day-replay__event-content">
                <p className="day-replay__meta">
                  <span>{APP_MODULE_BY_ID[event.moduleId].label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{KIND_LABELS[event.kind]}</span>
                </p>
                <strong>
                  <SensitiveValue placeholder="Ukryte zdarzenie" label="Treść zdarzenia">
                    {event.title}
                  </SensitiveValue>
                </strong>
                {event.detail && (
                  <p>
                    <SensitiveValue placeholder="Szczegóły ukryte" label="Szczegóły zdarzenia">
                      {event.detail}
                    </SensitiveValue>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="day-replay__empty" role="status">
          <strong>Brak zarejestrowanych zdarzeń z dzisiaj</strong>
          <p>
            Oś wypełni się po kolejnych istotnych zmianach. Nie odtwarzamy działań sprzed
            uruchomienia lokalnego rejestru.
          </p>
        </div>
      )}

      <p className="day-replay__retention">
        Historia pozostaje na tym urządzeniu i obejmuje maksymalnie {ACTIVITY_LOG_RETENTION_DAYS} dni.
      </p>
    </Modal>
  );
}

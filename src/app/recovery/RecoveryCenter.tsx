import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Database,
  Download,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteLocalRecoveryRecord,
  dismissLocalPersistenceIssue,
  estimateOriginStorage,
  exportAllLocalWorkspaces,
  exportLocalPersistenceIssueDraft,
  exportLocalRecoveryRecord,
  getPersistentStorageStatus,
  getWorkspaceStorageTierStatus,
  importAllLocalWorkspaces,
  inspectFullLocalBackup,
  listLocalPersistenceIssues,
  listLocalRecoveryRecords,
  requestPersistentStorage,
  restoreLocalRecoveryRecord,
  retryLocalPersistenceIssue,
  subscribeToLocalPersistenceIssues,
  type FullLocalBackup,
  type LocalPersistenceIssue,
  type OriginStorageEstimate,
  type PersistentStorageStatus,
} from "../data/localRepository";
import { Badge, Button, Modal } from "../ui";
import "../../styles/recovery.css";

type PendingImport = {
  fileName: string;
  backup: FullLocalBackup;
};

type StorageEstimateState = OriginStorageEstimate | { status: "idle" | "loading" };
type PersistentStorageState = PersistentStorageStatus | { status: "idle" | "loading" };

function downloadText(fileName: string, contents: string, type = "application/json") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: size >= 10 ? 1 : 2,
  }).format(size)} ${units[unitIndex]}`;
}

function formatUsageRatio(ratio: number) {
  if (ratio > 0 && ratio < 0.001) return "<0,1%";
  return new Intl.NumberFormat("pl-PL", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

function issueLabel(kind: LocalPersistenceIssue["kind"]) {
  if (kind === "quota") return "Brak miejsca";
  if (kind === "conflict") return "Konflikt kart";
  if (kind === "permission") return "Brak uprawnień";
  if (kind === "unavailable") return "Tryb zgodności";
  if (kind === "corrupt") return "Błąd danych";
  return "Błąd zapisu";
}

export function RecoveryCenterButton({
  label = "Kopia i odzyskiwanie",
  className = "",
  trailingIcon,
}: {
  label?: string;
  className?: string;
  trailingIcon?: ReactNode;
} = {}) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState(() => listLocalRecoveryRecords());
  const [issues, setIssues] = useState<LocalPersistenceIssue[]>(() => listLocalPersistenceIssues());
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState>({ status: "idle" });
  const [persistentStorage, setPersistentStorage] = useState<PersistentStorageState>({ status: "idle" });
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storageRequestRef = useRef(0);
  const storageTier = getWorkspaceStorageTierStatus();

  const refreshRecords = useCallback(() => setRecords(listLocalRecoveryRecords()), []);
  const refreshIssues = useCallback(() => setIssues(listLocalPersistenceIssues()), []);
  const refreshStorageEstimate = useCallback(() => {
    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;
    setStorageEstimate({ status: "loading" });
    void estimateOriginStorage().then((result) => {
      if (storageRequestRef.current === requestId) setStorageEstimate(result);
    });
  }, []);

  const refreshPersistentStorage = useCallback(() => {
    setPersistentStorage({ status: "loading" });
    void getPersistentStorageStatus().then(setPersistentStorage);
  }, []);

  useEffect(() => subscribeToLocalPersistenceIssues(refreshIssues), [refreshIssues]);

  useEffect(() => {
    if (!open) return;
    refreshStorageEstimate();
    refreshPersistentStorage();
    return () => {
      storageRequestRef.current += 1;
    };
  }, [open, refreshPersistentStorage, refreshStorageEstimate]);

  const exportAll = async () => {
    setBusyAction("export");
    setMessage("");
    try {
      const backup = await exportAllLocalWorkspaces();
      downloadText(
        `rootine-backup-${backup.exportedAt.slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
      );
      setMessage(`Wyeksportowano ${Object.keys(backup.workspaces).length} obszarów danych.`);
    } catch {
      setMessage("Nie udało się utworzyć pełnej kopii. Spróbuj ponownie po odświeżeniu magazynu.");
    } finally {
      setBusyAction("");
    }
  };

  const selectImport = async (file: File | undefined) => {
    if (!file) return;
    setMessage("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const inspection = inspectFullLocalBackup(parsed);
      if (!inspection.ok) {
        setMessage(inspection.error);
        return;
      }
      setPendingImport({ fileName: file.name, backup: inspection.backup });
    } catch {
      setMessage("Nie można odczytać pliku. Sprawdź, czy jest poprawnym plikiem JSON.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const restoreImport = async () => {
    if (!pendingImport) return;
    setBusyAction("import");
    try {
      const result = await importAllLocalWorkspaces(pendingImport.backup);
      if (result.ok) {
        setMessage(`Przywrócono ${result.restored} obszarów. Odśwież aplikację, aby wczytać dane.`);
        setPendingImport(null);
        refreshRecords();
        refreshStorageEstimate();
      } else {
        setMessage(result.error ?? "Nie udało się przywrócić kopii.");
      }
    } finally {
      setBusyAction("");
    }
  };

  const retryIssue = async (issue: LocalPersistenceIssue) => {
    setBusyAction(`issue:${issue.id}`);
    const retried = await retryLocalPersistenceIssue(issue.id);
    setMessage(retried
      ? `Ponowiono zapis „${issue.key}”.`
      : `Zapis „${issue.key}” nadal się nie powiódł. Pobierz szkic i sprawdź dostępne miejsce.`);
    refreshIssues();
    refreshStorageEstimate();
    setBusyAction("");
  };

  const requestProtection = async () => {
    setBusyAction("persist");
    setPersistentStorage({ status: "loading" });
    const result = await requestPersistentStorage();
    setPersistentStorage(result);
    setMessage(result.message);
    setBusyAction("");
  };

  const restoreRecord = async (id: string) => {
    setBusyAction(`restore:${id}`);
    const restored = await restoreLocalRecoveryRecord(id);
    setMessage(restored
      ? "Przywrócono zapis. Odśwież aplikację, aby go wczytać."
      : "Nie udało się przywrócić zapisu.");
    refreshRecords();
    refreshIssues();
    refreshStorageEstimate();
    setBusyAction("");
  };

  const exportRecord = async (id: string) => {
    const raw = await exportLocalRecoveryRecord(id);
    if (raw !== null) {
      downloadText(`rootine-recovery-${id}.json`, raw);
      return;
    }
    setMessage("Nie udało się odczytać zabezpieczonego zapisu.");
  };

  const deleteRecord = async (id: string) => {
    setBusyAction(`delete:${id}`);
    const removed = await deleteLocalRecoveryRecord(id);
    setMessage(removed
      ? "Usunięto zabezpieczony zapis."
      : "Nie udało się usunąć zabezpieczonego zapisu.");
    refreshRecords();
    refreshStorageEstimate();
    setBusyAction("");
  };

  return (
    <>
      <Button
        className={className}
        variant="quiet"
        size="sm"
        leadingIcon={<ShieldCheck size={13} aria-hidden="true" />}
        trailingIcon={trailingIcon}
        onClick={() => {
          refreshRecords();
          refreshIssues();
          setOpen(true);
        }}
      >
        <span>{label}{issues.length ? ` · ${issues.length}` : ""}</span>
      </Button>

      {open && (
        <Modal
          title="Kopia i odzyskiwanie"
          description="Eksportuj wszystkie lokalne dane albo przywróć zachowaną kopię. Przed importem Rootine automatycznie zabezpiecza aktualne wpisy."
          size="md"
          onClose={() => {
            setPendingImport(null);
            setOpen(false);
          }}
          footer={(
            <div className="recovery-dialog-footer">
              <Button variant="quiet" onClick={() => window.location.reload()} leadingIcon={<RefreshCw size={13} />}>
                Odśwież aplikację
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>Gotowe</Button>
            </div>
          )}
        >
          <div className="recovery-center">
            {issues.length > 0 && (
              <section
                aria-labelledby="persistence-issues-title"
                className="recovery-section recovery-section--danger"
              >
                <div className="recovery-section__header">
                  <div>
                    <h3 id="persistence-issues-title" className="recovery-heading recovery-heading--inline">
                      <AlertTriangle size={13} aria-hidden="true" />
                      Zmiany wymagające uwagi
                    </h3>
                    <p className="recovery-description recovery-description--secondary">
                      Rootine zatrzymał ryzykowny zapis. Trwała wersja nie została po cichu nadpisana; szkic możesz pobrać przed ponowieniem.
                    </p>
                  </div>
                  <Badge tone="danger">{issues.length} {issues.length === 1 ? "problem" : "problemy"}</Badge>
                </div>
                <ul className="recovery-list recovery-list--issues" aria-label="Problemy trwałego zapisu">
                  {issues.map((issue) => (
                    <li key={issue.id} className="recovery-record recovery-record--issue">
                      <div className="recovery-record__header recovery-record__header--compact">
                        <div className="recovery-record__content">
                          <strong className="recovery-record__title">
                            {issue.key}
                          </strong>
                          <p className="recovery-record__description recovery-record__description--issue">
                            {issue.message}
                          </p>
                        </div>
                        <Badge tone={issue.kind === "unavailable" ? "warning" : "danger"}>
                          {issueLabel(issue.kind)}
                        </Badge>
                      </div>
                      <div className="recovery-actions recovery-actions--record">
                        {issue.hasDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leadingIcon={<Download size={13} aria-hidden="true" />}
                            onClick={() => {
                              const draft = exportLocalPersistenceIssueDraft(issue.id);
                              if (draft !== null) downloadText(`rootine-unsaved-${issue.id}.json`, draft);
                            }}
                          >
                            Pobierz szkic
                          </Button>
                        )}
                        {issue.retryable && (
                          <Button
                            variant="quiet"
                            size="sm"
                            disabled={Boolean(busyAction)}
                            leadingIcon={<RotateCcw size={13} aria-hidden="true" />}
                            onClick={() => void retryIssue(issue)}
                          >
                            {busyAction === `issue:${issue.id}` ? "Ponawianie…" : "Ponów zapis"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            dismissLocalPersistenceIssue(issue.id);
                            refreshIssues();
                            setMessage("Ukryto komunikat. Trwała wersja danych pozostała bez zmian.");
                          }}
                        >
                          Ukryj
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="backup-actions-title" className="recovery-section">
              <h3 id="backup-actions-title" className="recovery-heading">
                Pełna kopia urządzenia
              </h3>
              <p className="recovery-description">
                Plik zawiera dane wszystkich modułów zapisane w tej przeglądarce. Przechowuj go jak prywatny dokument.
              </p>
              <div className="recovery-actions">
                <Button
                  variant="quiet"
                  leadingIcon={<Download size={13} />}
                  disabled={Boolean(busyAction)}
                  onClick={() => void exportAll()}
                >
                  {busyAction === "export" ? "Tworzenie kopii…" : "Eksportuj kopię"}
                </Button>
                <Button variant="quiet" leadingIcon={<Upload size={13} />} onClick={() => inputRef.current?.click()}>
                  Wybierz kopię
                </Button>
                <input
                  ref={inputRef}
                  className="ui-sr-only"
                  type="file"
                  accept="application/json,.json"
                  aria-label="Wybierz plik kopii danych Rootine"
                  onChange={(event) => void selectImport(event.target.files?.[0])}
                />
              </div>
            </section>

            <section
              aria-labelledby="storage-estimate-title"
              aria-busy={storageEstimate.status === "loading" || persistentStorage.status === "loading"}
              className="recovery-section"
            >
              <div className="recovery-section__header">
                <div className="recovery-record__content">
                  <h3 id="storage-estimate-title" className="recovery-heading">
                    Pamięć tej witryny
                  </h3>
                  <p className="recovery-description">
                    Szacunek przeglądarki obejmuje lokalne dane Rootine oraz inne zasoby tej witryny, na przykład pamięć podręczną.
                  </p>
                </div>
                {storageEstimate.status === "ready" && (
                  <Badge tone={storageEstimate.ratio >= 0.9 ? "danger" : storageEstimate.ratio >= 0.75 ? "warning" : "success"}>
                    {formatUsageRatio(storageEstimate.ratio)} wykorzystane
                  </Badge>
                )}
                {storageEstimate.status === "loading" && <Badge tone="neutral">Obliczanie…</Badge>}
                {storageEstimate.status === "unsupported" && <Badge tone="neutral">Brak szacunku</Badge>}
                {storageEstimate.status === "error" && <Badge tone="danger">Błąd odczytu</Badge>}
              </div>

              {storageEstimate.status === "ready" ? (
                <div className="recovery-storage-meter">
                  <div
                    role="meter"
                    aria-label="Wykorzystanie pamięci tej witryny"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(storageEstimate.ratio * 100))}
                    aria-valuetext={`${formatBytes(storageEstimate.usage)} z ${formatBytes(storageEstimate.quota)}`}
                    className="recovery-meter"
                  >
                    <div
                      className={`recovery-meter__fill ${
                        storageEstimate.ratio >= 0.9
                          ? "is-danger"
                          : storageEstimate.ratio >= 0.75
                            ? "is-warning"
                            : "is-primary"
                      }`}
                      style={{ width: `${Math.min(100, storageEstimate.ratio * 100)}%` }}
                    />
                  </div>
                  <div className="recovery-meter__legend">
                    <span>{formatBytes(storageEstimate.usage)} zajęte</span>
                    <span>Limit: {formatBytes(storageEstimate.quota)}</span>
                  </div>
                  {storageEstimate.ratio >= 0.75 && (
                    <p className="recovery-message recovery-message--warning">
                      Zbliżasz się do limitu przeglądarki. Wyeksportuj kopię przed dodaniem większej ilości danych.
                    </p>
                  )}
                </div>
              ) : storageEstimate.status === "unsupported" || storageEstimate.status === "error" ? (
                <p className="recovery-message recovery-message--secondary">
                  {storageEstimate.message}
                </p>
              ) : (
                <p className="recovery-message" role="status">
                  Sprawdzanie wykorzystania i limitu…
                </p>
              )}

              <div className="recovery-actions">
                <Button variant="ghost" size="sm" onClick={refreshStorageEstimate} disabled={storageEstimate.status === "loading"}>
                  Odśwież pomiar
                </Button>
              </div>

              <div className="recovery-protection">
                <div className="recovery-section__header">
                  <div className="recovery-record__content">
                    <h4 className="recovery-subheading">
                      <Database size={13} aria-hidden="true" />
                      Trwałość danych
                    </h4>
                    <p className="recovery-description recovery-description--secondary">
                      {storageTier.message}
                    </p>
                  </div>
                  <Badge tone={storageTier.status === "indexeddb" ? "success" : "warning"}>
                    {storageTier.status === "indexeddb" ? "IndexedDB" : "Tryb zgodności"}
                  </Badge>
                </div>

                {persistentStorage.status === "ready" ? (
                  <div className="recovery-protection__status">
                    <p className="recovery-protection__description">
                      {persistentStorage.message} Ochrona nie zwiększa limitu i nie zastępuje własnej kopii.
                    </p>
                    {persistentStorage.persisted ? (
                      <Badge tone="success">Ochrona włączona</Badge>
                    ) : (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={Boolean(busyAction)}
                        leadingIcon={<ShieldCheck size={13} aria-hidden="true" />}
                        onClick={() => void requestProtection()}
                      >
                        {busyAction === "persist" ? "Wysyłanie prośby…" : "Poproś o ochronę"}
                      </Button>
                    )}
                  </div>
                ) : persistentStorage.status === "unsupported" || persistentStorage.status === "error" ? (
                  <p className="recovery-message recovery-message--secondary">
                    {persistentStorage.message}
                  </p>
                ) : (
                  <p className="recovery-message" role="status">
                    Sprawdzanie ochrony danych…
                  </p>
                )}
              </div>
            </section>

            {pendingImport && (
              <section aria-labelledby="pending-import-title" className="recovery-section recovery-section--warning">
                <div className="recovery-section__header">
                  <div>
                    <h3 id="pending-import-title" className="recovery-heading">
                      Potwierdź przywrócenie
                    </h3>
                    <p className="recovery-description recovery-description--compact">
                      {pendingImport.fileName} · {Object.keys(pendingImport.backup.workspaces).length} obszarów · {formatDate(pendingImport.backup.exportedAt)}
                    </p>
                  </div>
                  <Badge tone="warning">Zastąpi bieżące dane</Badge>
                </div>
                <div className="recovery-actions recovery-actions--end">
                  <Button variant="ghost" onClick={() => setPendingImport(null)}>Anuluj</Button>
                  <Button
                    variant="primary"
                    disabled={Boolean(busyAction)}
                    onClick={() => void restoreImport()}
                  >
                    {busyAction === "import" ? "Przywracanie…" : "Przywróć kopię"}
                  </Button>
                </div>
              </section>
            )}

            <section aria-labelledby="recovery-records-title">
              <div className="recovery-section__header recovery-section__header--center">
                <div>
                  <h3 id="recovery-records-title" className="recovery-heading">
                    Zabezpieczone zapisy
                  </h3>
                  <p className="recovery-description recovery-description--compact">
                    Powstają automatycznie, gdy format danych jest uszkodzony albo przed przywróceniem kopii.
                  </p>
                </div>
                <Badge tone={records.length ? "warning" : "success"}>
                  {records.length ? `${records.length} kopii` : "Brak problemów"}
                </Badge>
              </div>

              {records.length === 0 ? (
                <div className="recovery-empty">
                  Nie ma zapisów wymagających odzyskiwania.
                </div>
              ) : (
                <ul className="recovery-list recovery-list--records" aria-label="Zabezpieczone zapisy danych">
                  {records.map((record) => (
                    <li key={record.id} className="recovery-record recovery-record--saved">
                      <div className="recovery-record__content">
                        <strong className="recovery-record__title">
                          {record.storageKey}
                        </strong>
                        <span className="recovery-record__meta">
                          {formatDate(record.createdAt)} · {Math.max(1, Math.round(record.byteLength / 1024))} KB
                        </span>
                        <span className="recovery-record__description recovery-record__description--saved">
                          {record.reason}
                        </span>
                      </div>
                      <div className="recovery-record__actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<HardDriveDownload size={13} />}
                          onClick={() => void exportRecord(record.id)}
                        >
                          Pobierz
                        </Button>
                        <Button
                          variant="quiet"
                          size="sm"
                          disabled={Boolean(busyAction)}
                          onClick={() => void restoreRecord(record.id)}
                        >
                          {busyAction === `restore:${record.id}` ? "Przywracanie…" : "Przywróć"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(busyAction)}
                          leadingIcon={<Trash2 size={13} aria-hidden="true" />}
                          onClick={() => void deleteRecord(record.id)}
                        >
                          {busyAction === `delete:${record.id}` ? "Usuwanie…" : "Usuń"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="recovery-status" role="status" aria-live="polite">
              {message}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

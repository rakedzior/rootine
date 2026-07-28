import { useCallback, useEffect, useRef, useState } from "react";
import { Download, HardDriveDownload, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import {
  estimateOriginStorage,
  exportAllLocalWorkspaces,
  exportLocalRecoveryRecord,
  importAllLocalWorkspaces,
  inspectFullLocalBackup,
  listLocalRecoveryRecords,
  restoreLocalRecoveryRecord,
  type FullLocalBackup,
  type OriginStorageEstimate,
} from "../data/localRepository";
import { Badge, Button, Modal } from "../ui";

type PendingImport = {
  fileName: string;
  backup: FullLocalBackup;
};

type StorageEstimateState = OriginStorageEstimate | { status: "idle" | "loading" };

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

export function RecoveryCenterButton() {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState(() => listLocalRecoveryRecords());
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateState>({ status: "idle" });
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storageRequestRef = useRef(0);

  const refreshRecords = () => setRecords(listLocalRecoveryRecords());
  const refreshStorageEstimate = useCallback(() => {
    const requestId = storageRequestRef.current + 1;
    storageRequestRef.current = requestId;
    setStorageEstimate({ status: "loading" });
    void estimateOriginStorage().then((result) => {
      if (storageRequestRef.current === requestId) setStorageEstimate(result);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshStorageEstimate();
    return () => {
      storageRequestRef.current += 1;
    };
  }, [open, refreshStorageEstimate]);

  const exportAll = () => {
    const backup = exportAllLocalWorkspaces();
    downloadText(
      `routine-backup-${backup.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
    );
    setMessage(`Wyeksportowano ${Object.keys(backup.workspaces).length} obszarów danych.`);
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

  const restoreImport = () => {
    if (!pendingImport) return;
    const result = importAllLocalWorkspaces(pendingImport.backup);
    if (result.ok) {
      setMessage(`Przywrócono ${result.restored} obszarów. Odśwież aplikację, aby wczytać dane.`);
      setPendingImport(null);
      refreshRecords();
      refreshStorageEstimate();
    } else {
      setMessage(result.error ?? "Nie udało się przywrócić kopii.");
    }
  };

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        leadingIcon={<ShieldCheck size={13} aria-hidden="true" />}
        onClick={() => {
          refreshRecords();
          setOpen(true);
        }}
      >
        Kopia i odzyskiwanie
      </Button>

      {open && (
        <Modal
          title="Kopia i odzyskiwanie"
          description="Eksportuj wszystkie lokalne dane albo przywróć zachowaną kopię. Przed importem Routine automatycznie zabezpiecza aktualne wpisy."
          width={680}
          onClose={() => {
            setPendingImport(null);
            setOpen(false);
          }}
          footer={(
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="quiet" onClick={() => window.location.reload()} leadingIcon={<RefreshCw size={13} />}>
                Odśwież aplikację
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>Gotowe</Button>
            </div>
          )}
        >
          <div className="flex flex-col gap-5">
            <section aria-labelledby="backup-actions-title" className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-graphite-panel)] p-4">
              <h3 id="backup-actions-title" className="text-[13px] font-semibold text-[var(--color-chalk-white)]">
                Pełna kopia urządzenia
              </h3>
              <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                Plik zawiera dane wszystkich modułów zapisane w tej przeglądarce. Przechowuj go jak prywatny dokument.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="quiet" leadingIcon={<Download size={13} />} onClick={exportAll}>
                  Eksportuj kopię
                </Button>
                <Button variant="quiet" leadingIcon={<Upload size={13} />} onClick={() => inputRef.current?.click()}>
                  Wybierz kopię
                </Button>
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept="application/json,.json"
                  aria-label="Wybierz plik kopii danych Routine"
                  onChange={(event) => void selectImport(event.target.files?.[0])}
                />
              </div>
            </section>

            <section
              aria-labelledby="storage-estimate-title"
              aria-busy={storageEstimate.status === "loading"}
              className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-graphite-panel)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="storage-estimate-title" className="text-[13px] font-semibold text-[var(--color-chalk-white)]">
                    Pamięć tej witryny
                  </h3>
                  <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                    Szacunek przeglądarki obejmuje lokalne dane Routine oraz inne zasoby tej witryny, na przykład pamięć podręczną.
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
                <div className="mt-3">
                  <div
                    role="meter"
                    aria-label="Wykorzystanie pamięci tej witryny"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(storageEstimate.ratio * 100))}
                    aria-valuetext={`${formatBytes(storageEstimate.usage)} z ${formatBytes(storageEstimate.quota)}`}
                    className="h-2 overflow-hidden rounded-full bg-[var(--color-graphite-input)]"
                  >
                    <div
                      className={`h-full rounded-full ${
                        storageEstimate.ratio >= 0.9
                          ? "bg-[var(--color-danger-coral)]"
                          : storageEstimate.ratio >= 0.75
                            ? "bg-[var(--color-warning-ochre)]"
                            : "bg-[var(--color-precision-blue)]"
                      }`}
                      style={{ width: `${Math.min(100, storageEstimate.ratio * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--color-text-muted)]">
                    <span>{formatBytes(storageEstimate.usage)} zajęte</span>
                    <span>Limit: {formatBytes(storageEstimate.quota)}</span>
                  </div>
                  {storageEstimate.ratio >= 0.75 && (
                    <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-warning-ochre)]">
                      Zbliżasz się do limitu przeglądarki. Wyeksportuj kopię przed dodaniem większej ilości danych.
                    </p>
                  )}
                </div>
              ) : storageEstimate.status === "unsupported" || storageEstimate.status === "error" ? (
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                  {storageEstimate.message}
                </p>
              ) : (
                <p className="mt-3 text-[11px] text-[var(--color-text-muted)]" role="status">
                  Sprawdzanie wykorzystania i limitu…
                </p>
              )}

              <div className="mt-3">
                <Button variant="ghost" size="sm" onClick={refreshStorageEstimate} disabled={storageEstimate.status === "loading"}>
                  Odśwież pomiar
                </Button>
              </div>
            </section>

            {pendingImport && (
              <section aria-labelledby="pending-import-title" className="rounded-xl border border-[var(--color-warning-ochre)] bg-[var(--color-warning-soft)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="pending-import-title" className="text-[13px] font-semibold text-[var(--color-chalk-white)]">
                      Potwierdź przywrócenie
                    </h3>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {pendingImport.fileName} · {Object.keys(pendingImport.backup.workspaces).length} obszarów · {formatDate(pendingImport.backup.exportedAt)}
                    </p>
                  </div>
                  <Badge tone="warning">Zastąpi bieżące dane</Badge>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPendingImport(null)}>Anuluj</Button>
                  <Button variant="primary" onClick={restoreImport}>Przywróć kopię</Button>
                </div>
              </section>
            )}

            <section aria-labelledby="recovery-records-title">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 id="recovery-records-title" className="text-[13px] font-semibold text-[var(--color-chalk-white)]">
                    Zabezpieczone zapisy
                  </h3>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    Powstają automatycznie, gdy format danych jest uszkodzony albo przed przywróceniem kopii.
                  </p>
                </div>
                <Badge tone={records.length ? "warning" : "success"}>
                  {records.length ? `${records.length} kopii` : "Brak problemów"}
                </Badge>
              </div>

              {records.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-[var(--color-border-subtle)] p-5 text-center text-[11px] text-[var(--color-text-muted)]">
                  Nie ma zapisów wymagających odzyskiwania.
                </div>
              ) : (
                <ul className="mt-3 flex max-h-60 flex-col gap-2 overflow-y-auto" aria-label="Zabezpieczone zapisy danych">
                  {records.map((record) => (
                    <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-graphite-input)] p-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-[12px] font-medium text-[var(--color-chalk-white)]">
                          {record.storageKey}
                        </strong>
                        <span className="mt-0.5 block text-[10px] text-[var(--color-text-muted)]">
                          {formatDate(record.createdAt)} · {Math.max(1, Math.round(record.byteLength / 1024))} KB
                        </span>
                        <span className="mt-1 block max-w-[46ch] text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
                          {record.reason}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          leadingIcon={<HardDriveDownload size={12} />}
                          onClick={() => {
                            const raw = exportLocalRecoveryRecord(record.id);
                            if (raw !== null) downloadText(`routine-recovery-${record.id}.json`, raw);
                          }}
                        >
                          Pobierz
                        </Button>
                        <Button
                          variant="quiet"
                          size="sm"
                          onClick={() => {
                            const restored = restoreLocalRecoveryRecord(record.id);
                            setMessage(restored
                              ? "Przywrócono zapis. Odśwież aplikację, aby go wczytać."
                              : "Nie udało się przywrócić zapisu.");
                            refreshRecords();
                          }}
                        >
                          Przywróć
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="min-h-5 text-[11px] text-[var(--color-text-secondary)]" role="status" aria-live="polite">
              {message}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

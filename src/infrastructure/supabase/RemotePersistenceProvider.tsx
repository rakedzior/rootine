/* eslint-disable react-refresh/only-export-components -- Sync provider and hook form one public boundary. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Toast, ToastViewport } from "../../app/ui";
import { useSupabaseAuth } from "./auth";
import { isSupabaseConfigured } from "./client";
import { redactSyncError } from "./dualWriteBridge";
import {
  resolveRemoteWorkspaceConflicts,
  startRemoteWorkspaceSync,
  type RemoteConflictResolution,
  type RemoteWorkspaceSyncResult,
  type RemoteWorkspaceSyncStatus,
} from "./workspaceSync";

export type RemoteSyncContextValue = {
  configured: boolean;
  status: RemoteWorkspaceSyncStatus;
  message?: string;
  uploaded: number;
  downloaded: number;
  conflictKeys?: string[];
  initialSyncAttempt: number;
  initialSyncElapsedMs?: number;
  initialSyncTimedOut: boolean;
  retry: () => void;
  resolveConflict: (resolution: RemoteConflictResolution) => Promise<void>;
};

type RemoteSyncState = Omit<RemoteSyncContextValue, "retry" | "resolveConflict">;

const RemoteSyncContext = createContext<RemoteSyncContextValue | null>(null);

const INITIAL_STATE: RemoteSyncState = {
  configured: isSupabaseConfigured,
  status: isSupabaseConfigured ? "signed-out" : "disabled",
  uploaded: 0,
  downloaded: 0,
  initialSyncAttempt: 0,
  initialSyncTimedOut: false,
};

export const REMOTE_INITIAL_SYNC_TIMEOUT_MS = 10_000;
const REMOTE_INITIAL_SYNC_TIMEOUT_MESSAGE = "Synchronizacja profilu trwa zbyt długo. Rootine działa dalej lokalnie, a synchronizacja będzie kontynuowana w tle.";

export function RemotePersistenceProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useSupabaseAuth();
  const [state, setState] = useState<RemoteSyncState>(INITIAL_STATE);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [dismissedNoticeAttempt, setDismissedNoticeAttempt] = useState<number | null>(null);
  const userId = session?.user.id ?? null;
  const retry = useCallback(() => {
    setDismissedNoticeAttempt(null);
    setRetryGeneration((current) => current + 1);
  }, []);
  const resolveConflict = useCallback(async (resolution: RemoteConflictResolution) => {
    const conflictKeys = state.conflictKeys ?? [];
    if (!userId || conflictKeys.length === 0) return;
    setState((current) => ({ ...current, status: "syncing", message: undefined }));
    try {
      const result = await resolveRemoteWorkspaceConflicts(userId, conflictKeys, resolution);
      setState((current) => ({ ...current, ...result, message: result.message }));
      if (result.status === "synced") {
        setRetryGeneration((current) => current + 1);
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        message: redactSyncError(error,
          "Nie udało się rozwiązać konfliktu. Obie wersje danych pozostały bez zmian."
        ).message,
      }));
    }
  }, [state.conflictKeys, userId]);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    let timedOut = false;
    let latestResult: RemoteWorkspaceSyncResult | null = null;
    let timeoutId: number | null = null;
    const attempt = retryGeneration + 1;
    const startedAt = performance.now();
    const elapsedMs = () => Math.max(0, Math.round(performance.now() - startedAt));

    const clearInitialSyncTimeout = () => {
      if (timeoutId === null) return;
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    if (authLoading) {
      return () => {
        active = false;
      };
    }

    if (!isSupabaseConfigured || !userId) {
      setReadyUserId(null);
      setState({
        configured: isSupabaseConfigured,
        status: isSupabaseConfigured ? "signed-out" : "disabled",
        uploaded: 0,
        downloaded: 0,
        initialSyncAttempt: 0,
        initialSyncTimedOut: false,
      });
      return () => {
        active = false;
      };
    }

    setReadyUserId((current) => current === userId ? current : null);
    setState((current) => ({
      ...current,
      configured: true,
      status: "syncing",
      message: undefined,
      initialSyncAttempt: attempt,
      initialSyncElapsedMs: undefined,
      initialSyncTimedOut: false,
    }));
    timeoutId = window.setTimeout(() => {
      if (!active) return;
      timedOut = true;
      setState({
        configured: true,
        status: "error",
        uploaded: latestResult?.uploaded ?? 0,
        downloaded: latestResult?.downloaded ?? 0,
        message: REMOTE_INITIAL_SYNC_TIMEOUT_MESSAGE,
        initialSyncAttempt: attempt,
        initialSyncElapsedMs: elapsedMs(),
        initialSyncTimedOut: true,
      });
      // Do not cancel the sync. Local work can continue while the original
      // request finishes and installs its background listeners.
      setReadyUserId(userId);
    }, REMOTE_INITIAL_SYNC_TIMEOUT_MS);
    void startRemoteWorkspaceSync(userId, (result: RemoteWorkspaceSyncResult) => {
      latestResult = result;
      if (!active) return;
      setState((current) => ({
        ...current,
        configured: true,
        ...result,
        message: result.message,
        initialSyncAttempt: attempt,
        initialSyncTimedOut: timedOut,
      }));
    }).then((cleanup) => {
      clearInitialSyncTimeout();
      if (!active) {
        cleanup();
        return;
      }
      stop = cleanup;
      setState((current) => ({
        ...current,
        ...(latestResult ?? {}),
        configured: true,
        message: latestResult?.message,
        initialSyncAttempt: attempt,
        initialSyncElapsedMs: elapsedMs(),
        initialSyncTimedOut: timedOut,
      }));
      setReadyUserId(userId);
    }).catch((error: unknown) => {
      clearInitialSyncTimeout();
      if (!active) return;
      setState({
        configured: true,
        status: "error",
        uploaded: 0,
        downloaded: 0,
        message: redactSyncError(error).message,
        initialSyncAttempt: attempt,
        initialSyncElapsedMs: elapsedMs(),
        initialSyncTimedOut: timedOut,
      });
      // A remote failure must not make the local app unusable. The error stays
      // visible in the account panel and the next session retries the sync.
      setReadyUserId(userId);
    });

    return () => {
      active = false;
      clearInitialSyncTimeout();
      stop?.();
    };
  }, [authLoading, retryGeneration, userId]);

  const value = useMemo(
    () => ({ ...state, retry, resolveConflict }),
    [resolveConflict, retry, state],
  );
  const waitingForAuth = isSupabaseConfigured && authLoading;
  const waitingForInitialSync = Boolean(userId && readyUserId !== userId);

  if (waitingForAuth || waitingForInitialSync) {
    return (
      <div className="app-supabase-bootstrap" role="status" aria-live="polite">
        <span className="app-supabase-bootstrap__spinner" aria-hidden="true" />
        <p>Ładowanie danych profilu…</p>
      </div>
    );
  }

  return (
    <RemoteSyncContext.Provider value={value}>
      {state.status === "error"
        && state.initialSyncTimedOut
        && state.initialSyncAttempt !== dismissedNoticeAttempt
        && state.message && (
        <ToastViewport>
          <Toast
            tone="warning"
            durationMs={null}
            actionLabel="Spróbuj ponownie"
            onAction={retry}
            onDismiss={() => setDismissedNoticeAttempt(state.initialSyncAttempt)}
            dismissLabel="Zamknij informację o synchronizacji"
          >
            {state.message}
          </Toast>
        </ToastViewport>
      )}
      {children}
    </RemoteSyncContext.Provider>
  );
}

export function useRemoteSync() {
  const value = useContext(RemoteSyncContext);
  if (!value) throw new Error("useRemoteSync must be used inside RemotePersistenceProvider");
  return value;
}

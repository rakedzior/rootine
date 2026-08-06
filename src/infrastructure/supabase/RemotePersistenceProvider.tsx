/* eslint-disable react-refresh/only-export-components -- Sync provider and hook form one public boundary. */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSupabaseAuth } from "./auth";
import { isSupabaseConfigured } from "./client";
import {
  startRemoteWorkspaceSync,
  type RemoteWorkspaceSyncResult,
  type RemoteWorkspaceSyncStatus,
} from "./workspaceSync";

export type RemoteSyncContextValue = {
  configured: boolean;
  status: RemoteWorkspaceSyncStatus;
  message?: string;
  uploaded: number;
  downloaded: number;
};

const RemoteSyncContext = createContext<RemoteSyncContextValue | null>(null);

const INITIAL_STATE: RemoteSyncContextValue = {
  configured: isSupabaseConfigured,
  status: isSupabaseConfigured ? "signed-out" : "disabled",
  uploaded: 0,
  downloaded: 0,
};

export function RemotePersistenceProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useSupabaseAuth();
  const [state, setState] = useState<RemoteSyncContextValue>(INITIAL_STATE);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

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
      });
      return () => {
        active = false;
      };
    }

    setReadyUserId((current) => current === userId ? current : null);
    setState((current) => ({ ...current, configured: true, status: "syncing", message: undefined }));
    void startRemoteWorkspaceSync(userId, (result: RemoteWorkspaceSyncResult) => {
      if (!active) return;
      setState({ configured: true, ...result });
    }).then((cleanup) => {
      if (!active) {
        cleanup();
        return;
      }
      stop = cleanup;
      setReadyUserId(userId);
    }).catch((error: unknown) => {
      if (!active) return;
      setState({
        configured: true,
        status: "error",
        uploaded: 0,
        downloaded: 0,
        message: error instanceof Error ? error.message : "Synchronizacja nie powiodła się.",
      });
      // A remote failure must not make the local app unusable. The error stays
      // visible in the account panel and the next session retries the sync.
      setReadyUserId(userId);
    });

    return () => {
      active = false;
      stop?.();
    };
  }, [authLoading, userId]);

  const value = useMemo(() => state, [state]);
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

  return <RemoteSyncContext.Provider value={value}>{children}</RemoteSyncContext.Provider>;
}

export function useRemoteSync() {
  const value = useContext(RemoteSyncContext);
  if (!value) throw new Error("useRemoteSync must be used inside RemotePersistenceProvider");
  return value;
}

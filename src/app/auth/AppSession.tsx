/* eslint-disable react-refresh/only-export-components -- Provider and hook form one session boundary. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  activateEphemeralTestWorkspace,
  isEphemeralTestWorkspaceActive,
} from "./ephemeralWorkspace";

type AppSessionContextValue = {
  isTestAccount: boolean;
  authenticationBypassed: boolean;
  enterTestAccount: () => void;
  exitTestAccount: () => void;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const qaAuthBypassEnabled = import.meta.env.DEV
  && import.meta.env.VITE_ROOTINE_QA_AUTH === "1";
const TEST_ACCOUNT_QUERY_KEY = "konto";
const TEST_ACCOUNT_QUERY_VALUE = "testowe";

function testAccountRequested() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(TEST_ACCOUNT_QUERY_KEY) === TEST_ACCOUNT_QUERY_VALUE;
}

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [isTestAccount, setIsTestAccount] = useState(() => {
    if (testAccountRequested()) activateEphemeralTestWorkspace();
    return isEphemeralTestWorkspaceActive();
  });

  const enterTestAccount = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(TEST_ACCOUNT_QUERY_KEY, TEST_ACCOUNT_QUERY_VALUE);
    window.history.replaceState(window.history.state, "", url);
    activateEphemeralTestWorkspace();
    setIsTestAccount(true);
  }, []);

  const exitTestAccount = useCallback(() => {
    // A full navigation restores the browser's real storage before any regular
    // workspace mounts. Unmount effects therefore cannot leak demo edits.
    const url = new URL(window.location.href);
    url.searchParams.delete(TEST_ACCOUNT_QUERY_KEY);
    window.location.replace(url);
  }, []);

  const value = useMemo<AppSessionContextValue>(() => ({
    isTestAccount,
    authenticationBypassed: qaAuthBypassEnabled,
    enterTestAccount,
    exitTestAccount,
  }), [enterTestAccount, exitTestAccount, isTestAccount]);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error("useAppSession must be used inside AppSessionProvider");
  return value;
}

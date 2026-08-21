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
import { createQaFixtureEntries } from "./demoWorkspace";
import { getRootineStorageItem, setRootineStorageItem } from "../data/accountStorage";

type AppSessionContextValue = {
  isTestAccount: boolean;
  isLocalAccount: boolean;
  authenticationBypassed: boolean;
  enterTestAccount: () => void;
  enterLocalAccount: () => void;
  goToToday: () => void;
  exitTestAccount: () => void;
  exitToAuthScreen: () => void;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const qaAuthBypassEnabled = (import.meta.env.DEV || import.meta.env.MODE === "e2e")
  && import.meta.env.VITE_ROOTINE_QA_AUTH === "1";
const TEST_ACCOUNT_QUERY_KEY = "konto";
const TEST_ACCOUNT_QUERY_VALUE = "testowe";
const LOCAL_ACCOUNT_QUERY_VALUE = "lokalne";
const AUTH_SCREEN_QUERY_VALUE = "logowanie";

function testAccountRequested() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(TEST_ACCOUNT_QUERY_KEY) === TEST_ACCOUNT_QUERY_VALUE;
}

function localAccountRequested() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(TEST_ACCOUNT_QUERY_KEY) === LOCAL_ACCOUNT_QUERY_VALUE;
}

function authScreenRequested() {
  if (typeof window === "undefined") return false;
  return new URL(window.location.href).searchParams.get(TEST_ACCOUNT_QUERY_KEY) === AUTH_SCREEN_QUERY_VALUE;
}

function seedQaWorkspace() {
  if (!qaAuthBypassEnabled || typeof window === "undefined") return;
  createQaFixtureEntries().forEach(([key, value]) => {
    try {
      if (getRootineStorageItem(key) === null) {
        setRootineStorageItem(key, JSON.stringify(value));
      }
    } catch {
      // Persistence failure scenarios deliberately block individual keys.
      // The QA bootstrap must not hide or prevent those tests.
    }
  });
}

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [isTestAccount, setIsTestAccount] = useState(() => {
    if (testAccountRequested()) activateEphemeralTestWorkspace();
    return isEphemeralTestWorkspaceActive();
  });
  const [isLocalAccount, setIsLocalAccount] = useState(localAccountRequested);
  const [authenticationBypassed, setAuthenticationBypassed] = useState(
    () => {
      const bypassed = qaAuthBypassEnabled && !authScreenRequested();
      if (bypassed) seedQaWorkspace();
      return bypassed;
    },
  );

  const enterTestAccount = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/dzisiaj";
    url.search = "";
    url.searchParams.set(TEST_ACCOUNT_QUERY_KEY, TEST_ACCOUNT_QUERY_VALUE);
    window.history.replaceState(window.history.state, "", url);
    activateEphemeralTestWorkspace();
    setIsTestAccount(true);
    setIsLocalAccount(false);
    setAuthenticationBypassed(false);
  }, []);

  const enterLocalAccount = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/dzisiaj";
    url.search = "";
    url.searchParams.set(TEST_ACCOUNT_QUERY_KEY, LOCAL_ACCOUNT_QUERY_VALUE);
    window.history.replaceState(window.history.state, "", url);
    setIsLocalAccount(true);
    setAuthenticationBypassed(false);
  }, []);

  const exitTestAccount = useCallback(() => {
    // A full navigation restores the browser's real storage before any regular
    // workspace mounts. Unmount effects therefore cannot leak demo edits.
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    url.searchParams.set(TEST_ACCOUNT_QUERY_KEY, AUTH_SCREEN_QUERY_VALUE);
    window.location.replace(url);
  }, []);

  const exitToAuthScreen = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    window.history.replaceState(window.history.state, "", url);
    setIsLocalAccount(false);
    setAuthenticationBypassed(false);
  }, []);

  const goToToday = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = "/dzisiaj";
    url.search = "";
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const value = useMemo<AppSessionContextValue>(() => ({
    isTestAccount,
    isLocalAccount,
    authenticationBypassed,
    enterTestAccount,
    enterLocalAccount,
    goToToday,
    exitTestAccount,
    exitToAuthScreen,
  }), [authenticationBypassed, enterLocalAccount, enterTestAccount, exitTestAccount, exitToAuthScreen, goToToday, isLocalAccount, isTestAccount]);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const value = useContext(AppSessionContext);
  if (!value) throw new Error("useAppSession must be used inside AppSessionProvider");
  return value;
}

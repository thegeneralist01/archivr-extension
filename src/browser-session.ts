import { isSocialHost, sessionAppliesTo, hasLoneSurrogate } from "./core";
import { send } from "./bridge";

/**
 * Reads the page's localStorage, skipping entries with lone surrogates
 * (which would cause JSON serialisation to fail server-side).
 */
function readLocalStorage(): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      if (hasLoneSurrogate(key) || hasLoneSurrogate(value)) continue;
      result.push({ key, value });
    }
  } catch {
    // SecurityError or similar — return what we have
  }
  return result;
}

/**
 * Creates the `browserSession` prop object for the in-page CaptureDialog.
 * Called once per dialog mount in DialogShell.
 */
export function createBrowserSession() {
  const pageUrl = location.href;
  const host = location.hostname.toLowerCase();
  const social = isSocialHost(host);
  return {
    pageUrl,
    host,
    defaults: { cookies: !social, localStorage: !social },
    appliesTo: (locator: string) => sessionAppliesTo(pageUrl, locator),
    load: async () => {
      const cookies = await send("BROWSER_SESSION");
      return { ...cookies, localStorage: readLocalStorage() };
    },
    requestAccess: () => {
      send("OPEN_SETTINGS").catch(() => {});
    },
  };
}

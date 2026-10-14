import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CaptureDialog from "@archivr/components/CaptureDialog.jsx";
import { captureApi, send } from "./bridge";
import { normalizeOrigin } from "./core";
import {
  Notifications,
  useCaptureNotifications,
  useNotifications,
} from "./notifications";
import "@archivr/styles.css";
import "./fonts.css";
import "./ui.css";
import "./pages.css";
const popup = location.pathname.endsWith("/popup.html");
interface CookieAccessProps {
  config: { origin: string };
  busy: boolean;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}

function CookieAccessSection({ config, busy, act }: CookieAccessProps) {
  const [cookieAccess, setCookieAccess] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.permissions
      .contains({ permissions: ["cookies"], origins: ["http://*/*", "https://*/*"] })
      .then(setCookieAccess)
      .catch(() => setCookieAccess(false));
  }, []);

  const grant = () =>
    act(async () => {
      const granted = await chrome.permissions.request({
        permissions: ["cookies"],
        origins: ["http://*/*", "https://*/*"],
      });
      if (!granted) throw new Error("Cookie access was not allowed.");
      setCookieAccess(true);
    });

  const revoke = () =>
    act(async () => {
      const removed = await chrome.permissions.remove({
        permissions: ["cookies"],
        origins: ["http://*/*", "https://*/*"],
      });
      if (!removed) throw new Error("Cookie access could not be removed.");
      setCookieAccess(false);
    });

  return (
    <section>
      <h2>Use my cookies</h2>
      <p className="hint">
        The in-page Capture dialog can send this page&apos;s cookies and
        localStorage with a capture so Archivr sees the page as you do. They
        go only to {config.origin}, only for that capture, and are never
        stored by the extension. Both are off by default on social sites.
      </p>
      {cookieAccess === null ? null : cookieAccess ? (
        <>
          <p role="status">Cookie access is allowed.</p>
          <button disabled={busy} onClick={revoke}>
            Remove cookie access
          </button>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={grant}>
          Allow cookie access
        </button>
      )}
    </section>
  );
}

function App() {
  const [status, setStatus] = useState<any>(null),
    [origin, setOrigin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<any>(null),
    [open, setOpen] = useState(false);
  const { notices, notify, dismiss } = useNotifications();
  const feedback = useCaptureNotifications(notify, dismiss);
  const [containerOpened, setContainerOpened] = useState(false);
  const key = new URLSearchParams(location.search).get("capture");
  const refresh = async () => {
    const data = await send("STATUS");
    setStatus(data);
    return data;
  };
  useEffect(() => {
    document.body.classList.toggle("extension-popup", popup);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    if (key)
      send("GET_DRAFT", { key })
        .then((value) => {
          setDraft(value);
          setOpen(true);
        })
        .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (status?.pairing?.state !== "waiting" || popup) return;
    const interval = setInterval(
      () =>
        send("PAIR_CHECK")
          .then(setStatus)
          .catch((e) => setError(e.message)),
      1500,
    );
    return () => clearInterval(interval);
  }, [status?.pairing?.state]);
  async function act(fn: () => Promise<any>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const connect = () =>
    act(async () => {
      const normalized = normalizeOrigin(origin);
      const url = new URL(normalized);
      const allowed = await chrome.permissions.request({
        origins: [`${url.protocol}//${url.hostname}/*`],
      });
      if (!allowed)
        throw new Error("Allow access to your Archivr server to connect.");
      await send("PAIR_START", { origin: normalized });
    });
  useEffect(() => {
    if (
      !status?.jobs?.some((job: any) =>
        ["pending", "running"].includes(job.status),
      )
    )
      return;
    const interval = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(interval);
  }, [
    status?.jobs?.some((job: any) =>
      ["pending", "running"].includes(job.status),
    ),
  ]);
  const config = status?.config;
  useEffect(() => {
    if (draft?.container && config?.archiveId && !containerOpened) {
      setContainerOpened(true);
      send("OPEN_ARCHIVR", { locator: draft.container }).catch((e) => {
        setError(e.message);
        setContainerOpened(false);
      });
    }
  }, [draft?.container, config?.archiveId]);
  return (
    <>
      <main
        className={popup ? "extension-page popup" : "extension-page"}
        aria-busy={busy || (!status && !error)}
      >
        <header>
          <img src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div className="wordmark">
            Archivr
            <span>{popup ? "Capture & preserve" : "Browser extension"}</span>
          </div>
        </header>
        {!status ? (
          <p className="muted" role="status">
            {error
              ? "Unable to load your connection."
              : "Loading your connection…"}
          </p>
        ) : popup ? (
          <>
            {config ? (
              <>
                <p className="muted">
                  {config.archives.find((a: any) => a.id === config.archiveId)
                    ?.label || "Choose an archive"}{" "}
                  · {config.origin}
                </p>
                <button
                  className="primary wide"
                  disabled={!config.archiveId || busy}
                  onClick={() =>
                    act(async () => {
                      await send("CAPTURE_PAGE");
                      window.close();
                    })
                  }
                >
                  Archive this page
                </button>
                <button
                  className="wide"
                  disabled={busy}
                  onClick={() => act(() => send("OPEN_ARCHIVR"))}
                >
                  Open in Archivr
                </button>
              </>
            ) : status.pairing ? (
              <p role="status">
                {status.pairing.state === "waiting"
                  ? "Finish logging in to connect Archivr."
                  : "Review your connection in settings."}
              </p>
            ) : (
              <p>Connect your Archivr server to start capturing.</p>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => act(() => send("OPEN_SETTINGS"))}
            >
              {config || status.pairing ? "Settings" : "Connect Archivr"}
            </button>
          </>
        ) : (
          <>
            {!config && !status?.pairing && (
              <>
                <h1>Connect your Archivr.</h1>
                <p>
                  Save pages, posts, videos, and selected text to your own
                  archive.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    connect();
                  }}
                >
                  <label htmlFor="origin">Server address</label>
                  <div className="connect-row">
                    <input
                      id="origin"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="http://localhost:8080"
                      autoComplete="url"
                      required
                      disabled={busy}
                      aria-describedby="origin-hint"
                    />
                    <button className="primary" disabled={busy}>
                      Connect
                    </button>
                  </div>
                  <p className="hint" id="origin-hint">
                    Enter a hostname or an HTTP / HTTPS address. Use port 443
                    for HTTPS.
                  </p>
                </form>
              </>
            )}
            {status?.pairing && (
              <section>
                <h1>
                  {status.pairing.state === "waiting"
                    ? "Log in to Archivr."
                    : "Review your connection."}
                </h1>
                <p>
                  Server: <strong>{status.pairing.origin}</strong>
                </p>
                <p>
                  {status.pairing.state === "waiting"
                    ? "Finish logging in in the server tab. This page will connect when your account is ready."
                    : "Token creation could not be confirmed. Open API tokens in Archivr and revoke any extra “Archivr Chrome extension” token before resetting."}
                </p>
                {status.pairing.error && (
                  <p className="notice" role="status">
                    {status.pairing.error}
                  </p>
                )}
                <button
                  disabled={busy || status.pairing.state === "minting"}
                  onClick={() => act(() => send("DISCONNECT"))}
                >
                  {status.pairing.state === "waiting"
                    ? "Cancel connection"
                    : "Reset pairing"}
                </button>
              </section>
            )}
            {config && (
              <section>
                <h1>Connected to Archivr.</h1>
                <p>
                  <strong>{config.username}</strong> · {config.origin}
                </p>
                <label htmlFor="archive">Save captures to</label>
                <select
                  id="archive"
                  value={config.archiveId || ""}
                  disabled={busy}
                  onChange={(event) =>
                    act(() =>
                      send("SELECT_ARCHIVE", { archiveId: event.target.value }),
                    )
                  }
                >
                  <option value="" disabled>
                    Choose an archive
                  </option>
                  {config.archives.map((archive: any) => (
                    <option key={archive.id} value={archive.id}>
                      {archive.label}
                    </option>
                  ))}
                </select>
                <p className="hint">
                  Use the toolbar or right-click a page, post, video, or
                  selected text to capture it.
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={!config.archiveId || busy}
                    onClick={() => act(() => send("OPEN_ARCHIVR"))}
                  >
                    Open in Archivr
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act(() => send("DISCONNECT"))}
                  >
                    Disconnect / change server
                  </button>
                </div>
                {error.includes("could not revoke") && (
                  <button
                    disabled={busy}
                    onClick={() => act(() => send("FORGET_CONNECTION"))}
                  >
                    Forget connection locally
                  </button>
                )}
                <p className="hint">
                  Disconnect revokes this extension’s API token on the server.
                </p>
              </section>
            )}
            {config && !popup && (
              <CookieAccessSection config={config} busy={busy} act={act} />
            )}
            {draft && (
              <section>
                {draft.notice && (
                  <p className="notice" role="status">
                    {draft.notice}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={!config?.archiveId || busy}
                  onClick={() =>
                    draft.container
                      ? act(() =>
                          send("OPEN_ARCHIVR", { locator: draft.container }),
                        )
                      : setOpen(true)
                  }
                >
                  Review capture
                </button>
              </section>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status?.jobs?.length > 0 && (
          <section className="recent">
            <h2>Recent captures</h2>
            {status.jobs
              .slice(-5)
              .reverse()
              .map((job: any) => (
                <div className="job" key={job.job_uid}>
                  <span>
                    {job.status === "pending" || job.status === "running"
                      ? "Capturing…"
                      : job.status === "completed"
                        ? "Archived"
                        : job.status === "failed"
                          ? "Failed"
                          : job.status}
                  </span>
                  <small>
                    {job.error || new Date(job.createdAt).toLocaleTimeString()}
                    {job.status === "completed" &&
                      config?.origin === job.origin && (
                        <button
                          className="text-button"
                          onClick={() =>
                            act(() =>
                              send("OPEN_ARCHIVR", { jobUid: job.job_uid }),
                            )
                          }
                        >
                          Open in Archivr
                        </button>
                      )}
                  </small>
                </div>
              ))}
          </section>
        )}
        <footer>Captured content stays on your Archivr server.</footer>
      </main>
      {!draft?.container && draft && config?.archiveId && (
        <CaptureDialog
          open={open}
          archiveId={config.archiveId}
          initialItems={draft.items}
          requestKey={key}
          persistenceKey="archivr-extension:capture"
          api={captureApi}
          allowFileUpload={false}
          onClose={() => setOpen(false)}
          onCaptured={() => refresh()}
          onToast={feedback.onToast}
          onJobStarted={(job: any) => {
            feedback.onJobStarted(job);
            refresh().catch(() => {});
          }}
          onJobSettled={(id: string) => {
            feedback.onJobSettled(id);
            refresh().catch(() => {});
          }}
        />
      )}
      <Notifications notices={notices} onDismiss={dismiss} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

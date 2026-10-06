import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CaptureDialog from "@archivr/components/CaptureDialog.jsx";
import { captureApi, send } from "./bridge";
import { normalizeOrigin } from "./core";
import "@archivr/styles.css";
import "./pages.css";
const popup = location.pathname.endsWith("/popup.html");
function App() {
  const [status, setStatus] = useState<any>(null),
    [origin, setOrigin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<any>(null),
    [open, setOpen] = useState(false),
    [toast, setToast] = useState("");
  const [containerOpened, setContainerOpened] = useState(false);
  const key = new URLSearchParams(location.search).get("capture");
  const refresh = async () => {
    const data = await send("STATUS");
    setStatus(data);
    return data;
  };
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
    <main className={popup ? "extension-page popup" : "extension-page"}>
      <header>
        <img src="/logo-mark.svg" alt="Archivr" />
        <div className="wordmark">
          Archivr
          <span>
            {popup ? "Capture & preserve" : "Your archive, one click away."}
          </span>
        </div>
      </header>
      {popup ? (
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
                onClick={() => act(() => send("OPEN_ARCHIVR"))}
              >
                Open in Archivr
              </button>
            </>
          ) : (
            <p>Connect your Archivr server to start capturing.</p>
          )}
          <button
            className="text-button"
            onClick={() => act(() => send("OPEN_SETTINGS"))}
          >
            {config ? "Settings" : "Connect Archivr"}
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
                  />
                  <button className="primary" disabled={busy}>
                    Connect
                  </button>
                </div>
                <p className="hint">
                  Enter a hostname or an HTTP / HTTPS address. Use port 443 for
                  HTTPS.
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
                <p className="notice">{status.pairing.error}</p>
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
                Use the toolbar, a page’s context menu, or the Archive buttons
                on X and YouTube.
              </p>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={!config.archiveId}
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
                <button onClick={() => act(() => send("FORGET_CONNECTION"))}>
                  Forget connection locally
                </button>
              )}
              <p className="hint">
                Disconnect revokes this extension’s API token on the server.
              </p>
            </section>
          )}
          {draft && (
            <section>
              <p className="notice">{draft.notice}</p>
              <button
                className="primary"
                disabled={!config?.archiveId}
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
          onToast={(message: string) => setToast(message)}
          onJobStarted={() => refresh()}
          onJobSettled={() => refresh()}
        />
      )}
      {toast && <p className="notice">{toast}</p>}
      <footer>Captured content stays on your Archivr server.</footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

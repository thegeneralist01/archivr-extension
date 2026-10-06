import React, { useState, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import CaptureDialog from "@archivr/components/CaptureDialog.jsx";
import sharedStyles from "@archivr/styles.css?inline";
import { captureApi, send } from "./bridge";
import { toShadowCss } from "./css";
const css = toShadowCss(sharedStyles);
let root: Root | undefined;
let host: HTMLElement | undefined;
export async function showDialog(items: any[], requestKey: string) {
  const { archiveId } = await send("CAPTURE_CONTEXT");
  if (!host) {
    host = document.createElement("archivr-capture");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      css +
      `:host{all:initial;color:#20251f;font:14px "Helvetica Neue",Arial,sans-serif}dialog{color:var(--ink);font-family:var(--sans)}.extension-toast{position:fixed;bottom:24px;right:24px;max-width:420px;background:#20251f;color:#f5f0e7;padding:16px 20px;border-radius:6px;z-index:2147483647;box-shadow:0 5px 30px #0005;font:14px Arial,sans-serif}`;
    shadow.append(style);
    const mount = document.createElement("div");
    shadow.append(mount);
    document.documentElement.append(host);
    root = createRoot(mount);
  }
  root!.render(
    <DialogShell
      key={requestKey}
      archiveId={archiveId}
      items={items}
      requestKey={requestKey}
    />,
  );
}
function DialogShell({ archiveId, items, requestKey }: any) {
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState("");
  const jobs = useRef(new Map<string, string>());
  const [settledJob, setSettledJob] = useState<string>();
  return (
    <>
      <CaptureDialog
        open={open}
        archiveId={archiveId}
        initialItems={items}
        persistenceKey="archivr-extension:capture"
        requestKey={requestKey}
        api={captureApi}
        allowFileUpload={false}
        onClose={() => setOpen(false)}
        onCaptured={() => {}}
        onToast={(message: any, _locator: any, type: any) => {
          setToast(
            message ||
              (type === "success"
                ? "Archived in Archivr."
                : "Capture updated."),
          );
          setTimeout(() => setToast(""), 7000);
        }}
        onJobStarted={(job: any) => {
          jobs.current.set(job.id, job.jobUid);
          setToast("Capturing… You can close this tab.");
        }}
        onJobSettled={(id: string) => setSettledJob(jobs.current.get(id))}
      />
      {toast && (
        <div className="extension-toast">
          {toast}
          <button
            style={{
              display: "block",
              marginTop: 12,
              color: "#f5f0e7",
              background: "none",
              border: "1px solid #d2c6b5",
              padding: "5px 10px",
              cursor: "pointer",
            }}
            onClick={() =>
              send(
                "OPEN_ARCHIVR",
                settledJob ? { jobUid: settledJob } : {},
              ).catch((error) => setToast(error.message))
            }
          >
            Open in Archivr
          </button>
        </div>
      )}
    </>
  );
}
export function showToast(message: string, jobUid?: string) {
  const toast = document.createElement("div");
  toast.style.cssText =
    "all:initial;position:fixed;bottom:24px;right:24px;max-width:400px;background:#20251f;color:#f5f0e7;padding:16px 20px;border-radius:6px;z-index:2147483647;box-shadow:0 5px 30px #0005;font:14px Arial,sans-serif;";
  toast.textContent = message;
  const button = document.createElement("button");
  button.textContent = "Open in Archivr";
  button.style.cssText =
    "display:block;margin-top:12px;color:#f5f0e7;background:none;border:1px solid #d2c6b5;padding:5px 10px;cursor:pointer";
  button.onclick = () =>
    send("OPEN_ARCHIVR", jobUid ? { jobUid } : {}).catch(() => {});
  toast.append(button);
  document.documentElement.append(toast);
  setTimeout(() => toast.remove(), 10000);
}

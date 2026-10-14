import React, { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import CaptureDialog from "@archivr/components/CaptureDialog.jsx";
import sharedStyles from "@archivr/styles.css?inline";
import uiStyles from "./ui.css?inline";
import { captureApi, send } from "./bridge";
import { toShadowCss } from "./css";
import { installFonts } from "./fonts";
import {
  Notifications,
  replaceNotice,
  useCaptureNotifications,
  type Notice,
  type NoticeInput,
} from "./notifications";
import { createBrowserSession } from "./browser-session";
const css =
  `:host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none}` +
  toShadowCss(sharedStyles) +
  uiStyles +
  `:host{color:var(--ink);font:14px var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}dialog{pointer-events:auto;color:var(--ink);font-family:var(--sans)}`;
let root: Root | undefined;
let toastRoot: Root | undefined;
let notices: Notice[] = [];
function makeSurface(tag: string) {
  installFonts();
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.documentElement.append(host);
  return createRoot(mount);
}
function dismiss(id: string) {
  notices = notices.filter((notice) => notice.id !== id);
  renderNotifications();
}
function renderNotifications() {
  toastRoot ||= makeSurface("archivr-notifications");
  toastRoot.render(<Notifications notices={notices} onDismiss={dismiss} />);
}
function notify(input: NoticeInput) {
  if (
    input.type === "success" &&
    notices.some(
      (notice) => notice.id === input.id && notice.type === "warning",
    )
  )
    return;
  notices = replaceNotice(notices, input);
  renderNotifications();
}
export async function showDialog(items: any[], requestKey: string) {
  const { archiveId } = await send("CAPTURE_CONTEXT");
  root ||= makeSurface("archivr-capture");
  root.render(
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
  const feedback = useCaptureNotifications(notify, dismiss);
  // Create the browser session once per mount — stable across re-renders.
  const [browserSession] = useState(() => createBrowserSession());
  return (
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
      browserSession={browserSession as unknown as null /* CaptureDialog .jsx infers null from default */}
      {...feedback}
    />
  );
}
export function showToast(
  message: string,
  jobUid?: string,
  type: Notice["type"] = "error",
) {
  notify({
    id: jobUid,
    jobUid,
    message: type === "error" ? "Capture failed" : message,
    detail: type === "error" ? message : undefined,
    type,
  });
}

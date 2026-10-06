import { showDialog, showToast } from "./dialog";
import {
  type ContextSnapshot,
  nativeContextTarget,
} from "./site-targets";

// A classic bundled script can be reinjected by activeTab; keep exactly one listener set.
if (!(globalThis as any).__archivrInstalled) {
  (globalThis as any).__archivrInstalled = true;
  let contextSnapshot: ContextSnapshot | undefined;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "GET_CONTEXT_TARGET") {
      // Navigation replaces location.href without necessarily delivering a new
      // contextmenu event. Never return a snapshot for the previous document.
      respond(contextSnapshot?.page === location.href ? contextSnapshot : undefined);
      return false;
    }
    if (message.type === "SHOW_CAPTURE")
      showDialog(message.items, message.requestKey).catch((error) =>
        showToast(error.message),
      );
    if (message.type === "JOB_STATUS")
      showToast(
        message.job.status === "completed"
          ? "Archived in Archivr."
          : message.job.error || "Capture failed. Open Archivr for details.",
        message.job.job_uid,
      );
    return false;
  });

  const isX = /(^|\.)(x|twitter)\.com$/.test(location.hostname);
  const isYoutube =
    /(^|\.)youtube\.com$/.test(location.hostname) ||
    location.hostname === "youtu.be";

  // Keep the target in the document so a restarted service worker can ask the
  // clicked tab for it. A background click deliberately stores the page target.
  if (isX || isYoutube)
    document.addEventListener(
      "contextmenu",
      (event) => {
        const element = event.target instanceof Element ? event.target : null;
        contextSnapshot = {
          url: nativeContextTarget(
            isYoutube ? "youtube" : "x",
            location.href,
            element,
          ),
          page: location.href,
          at: Date.now(),
        };
      },
      true,
    );
}

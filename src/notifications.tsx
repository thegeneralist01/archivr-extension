import React, { useCallback, useEffect, useRef, useState } from "react";
import { send } from "./bridge";

export type Notice = {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
  locator?: string;
  jobUid?: string;
  persistent?: boolean;
  detail?: string;
};
export type NoticeInput = Omit<Notice, "id"> & { id?: string };
export function replaceNotice(current: Notice[], input: NoticeInput): Notice[] {
  const notice = { ...input, id: input.id || crypto.randomUUID() };
  return [...current.filter((item) => item.id !== notice.id), notice].slice(-5);
}
export function useNotifications() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const notify = useCallback(
    (input: NoticeInput) => setNotices((items) => replaceNotice(items, input)),
    [],
  );
  const dismiss = useCallback(
    (id: string) =>
      setNotices((items) => items.filter((item) => item.id !== id)),
    [],
  );
  return { notices, notify, dismiss };
}
export function useCaptureNotifications(
  notify: (input: NoticeInput) => void,
  dismiss: (id: string) => void,
) {
  const jobs = useRef(new Map<string, { jobUid: string; locator: string }>());
  const settled = useRef<{ jobUid: string; locator: string }>();
  return {
    onJobStarted(job: { id: string; jobUid: string; locator: string }) {
      jobs.current.set(job.id, job);
      notify({
        id: job.jobUid,
        jobUid: job.jobUid,
        locator: job.locator,
        message: "Capturing… You can close this tab.",
        type: "info",
        persistent: true,
      });
    },
    onJobSettled(id: string) {
      const job = jobs.current.get(id);
      if (!job) return;
      settled.current = job;
      jobs.current.delete(id);
      dismiss(job.jobUid);
    },
    onToast(
      message: string | null,
      locator: string | null,
      type?: string,
      headline?: string,
    ) {
      const job =
        locator && settled.current?.locator === locator
          ? settled.current
          : undefined;
      const kind = type === "success" || type === "warning" ? type : "error";
      notify({
        id: job?.jobUid,
        jobUid: job?.jobUid,
        locator: locator || undefined,
        type: kind,
        message:
          headline ||
          (kind === "success"
            ? "Archived in Archivr."
            : kind === "warning"
              ? "Archived with warnings"
              : "Capture failed"),
        detail: message || undefined,
      });
      settled.current = undefined;
    },
  };
}
export function Notifications({
  notices,
  onDismiss,
}: {
  notices: Notice[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="toast-stack extension-notifications"
      role="log"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notices.map((notice) => (
        <Notification key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
function Notification({
  notice,
  onDismiss,
}: {
  notice: Notice;
  onDismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setError("");
  }, [notice]);
  useEffect(() => {
    if (
      hovered ||
      focused ||
      error ||
      notice.persistent ||
      notice.type === "error"
    )
      return;
    const timer = window.setTimeout(() => onDismiss(notice.id), 7000);
    return () => clearTimeout(timer);
  }, [notice, hovered, focused, error, onDismiss]);
  return (
    <div
      className={`toast toast--${notice.type}`}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="toast-top">
        <span className="toast-icon" aria-hidden="true">
          {notice.type === "success"
            ? "✓"
            : notice.type === "error"
              ? "✕"
              : notice.type === "warning"
                ? "⚠"
                : "↗"}
        </span>
        <div className="toast-body">
          <span className="toast-headline">{notice.message}</span>
          {notice.locator && (
            <span className="toast-locator" title={notice.locator}>
              {notice.locator}
            </span>
          )}
        </div>
        <button
          type="button"
          className="toast-dismiss"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(notice.id)}
        >
          ×
        </button>
      </div>
      <div className="extension-notification-actions">
        <button
          type="button"
          className="toast-view-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await send(
                "OPEN_ARCHIVR",
                notice.jobUid ? { jobUid: notice.jobUid } : {},
              );
            } catch (e: any) {
              setError(e.message || "Unable to open Archivr.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Open in Archivr
        </button>
      </div>
      {notice.detail && (
        <p
          className={
            notice.type === "error"
              ? "toast-error-detail"
              : "toast-warning-detail"
          }
        >
          {notice.detail}
        </p>
      )}
      {error && (
        <p className="toast-error-detail" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

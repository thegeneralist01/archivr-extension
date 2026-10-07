export function normalizeOrigin(input: string): string {
  const raw = input.trim();
  if (
    !/^https?:\/\//i.test(raw) &&
    !/^(?:\[[\da-f:]+\]|[a-z\d.-]+)(?::\d+)?\/?$/i.test(raw)
  )
    throw new Error("Enter an http(s) origin or server hostname.");
  const explicit = /^https?:\/\//i.test(raw);
  const value = explicit
    ? raw
    : `${/:443\/?$/.test(raw) ? "https" : "http"}://${raw}`;
  // Reject dot-path normalization too: the entered value must already be a root origin.
  if (!/^https?:\/\/[^/?#]+\/?$/i.test(value))
    throw new Error(
      "Use only the server origin, without a path, query, or fragment.",
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid server origin.");
  return url.origin;
}
export function routeTarget(
  page: string,
  clicked?: string,
): { kind: "url" | "container"; locator: string } {
  const shorthand = clicked || page;
  if (/^x:(?:tweet|thread|media):\d+$/i.test(shorthand))
    return { kind: "url", locator: shorthand };
  const url = new URL(clicked || page);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Chrome cannot capture this page. Open a normal HTTP or HTTPS page, or paste a URL in Archivr.",
    );
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    ["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(
      host,
    )
  ) {
    const video =
      host === "youtu.be"
        ? url.pathname.split("/")[1]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : /^\/(shorts|live|embed)\//.test(url.pathname)
            ? url.pathname.split("/")[2]
            : null;
    if (video && /^[a-zA-Z0-9_-]{11}$/.test(video))
      return {
        kind: "url",
        locator: `https://www.youtube.com/watch?v=${video}`,
      };
    const list = url.searchParams.get("list");
    if (url.pathname === "/playlist" && list)
      return {
        kind: "container",
        locator: `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`,
      };
    const channel = url.pathname.match(
      /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)/,
    )?.[0];
    if (channel)
      return {
        kind: "container",
        locator: `https://www.youtube.com${channel}`,
      };
  }
  return { kind: "url", locator: url.href };
}
export function selectionItem(body: string) {
  return {
    kind: "text" as const,
    title: (body.split(/\r?\n/).find((line) => line.trim()) || "Selected text")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80),
    body,
    mime: "text/plain",
  };
}
export const API_METHODS = [
  "submitCapture",
  "submitTextCapture",
  "pollCaptureJob",
  "probeCapture",
  "probePlaylist",
  "getCaptureOptions",
  "generateTextTitle",
  "deleteUpload",
] as const;
export function authorizeMessage(
  message: any,
  sender: any,
  extensionId: string,
) {
  if (
    sender.id !== extensionId ||
    !message ||
    typeof message !== "object" ||
    typeof message.type !== "string"
  )
    return false;
  const trusted =
    typeof sender.url === "string" &&
    ["app.html", "popup.html"].some(
      (path) =>
        sender.url.split("?")[0] ===
        `chrome-extension://${extensionId}/${path}`,
    );
  const content =
    sender.tab?.id != null &&
    sender.frameId === 0 &&
    /^https?:\/\//.test(sender.url || "");
  if (message.type === "API")
    return (
      (trusted || content) &&
      API_METHODS.includes(message.method) &&
      Array.isArray(message.args)
    );
  if (message.type === "OPEN_TARGET")
    return (
      content && typeof message.url === "string" && message.url.length <= 10000
    );
  if (message.type === "CONTEXT_TARGET")
    return (
      content &&
      (message.url === undefined ||
        (typeof message.url === "string" && message.url.length <= 10000))
    );
  if (["CAPTURE_CONTEXT", "OPEN_ARCHIVR"].includes(message.type) && content)
    return true;
  return (
    trusted &&
    [
      "STATUS",
      "PAIR_START",
      "PAIR_CHECK",
      "SELECT_ARCHIVE",
      "DISCONNECT",
      "FORGET_CONNECTION",
      "CURRENT_TARGET",
      "CAPTURE_PAGE",
      "OPEN_ARCHIVR",
      "OPEN_SETTINGS",
      "GET_DRAFT",
    ].includes(message.type)
  );
}
export type Job = {
  job_uid: string;
  origin: string;
  archiveId: string;
  status: string;
  createdAt: number;
  tabId?: number;
  entry_uid?: string;
  error?: string;
  [key: string]: unknown;
};
export function updateJob(job: Job, response: any): Job {
  return {
    ...job,
    status: typeof response.status === "string" ? response.status : job.status,
    entry_uid: response.entry_uid || job.entry_uid,
    error: response.error_text || response.error || undefined,
    updatedAt: Date.now(),
  };
}
export function isPending(job: Job) {
  return ["pending", "running"].includes(job.status);
}
export function validateLocator(locator: unknown): string {
  if (typeof locator !== "string" || !locator.trim() || locator.length > 10000)
    throw new Error("Enter a valid capture URL or Archivr source shorthand.");
  const value = locator.trim();
  if (
    /^(?:yt|youtube|ytm|x|tweet|twitter|instagram|ig|facebook|fb|tiktok|reddit|spotify|snapchat):\S+$/i.test(
      value,
    )
  )
    return value;
  routeTarget(value);
  return value;
}
export function validateText(body: unknown) {
  if (
    typeof body !== "string" ||
    new TextEncoder().encode(body).length > 2 * 1024 * 1024
  )
    throw new Error("Text must be at most 2 MiB.");
  return true;
}
export function menuTarget(
  page: string,
  link?: string,
  context?: { url?: string; at: number },
  now = Date.now(),
  useContext = false,
) {
  return routeTarget(
    page,
    link ||
      (useContext && context && now - context.at < 120000
        ? context.url
        : undefined),
  );
}
export function jobArchive(
  jobs: Job[],
  jobUid: string,
  origin: string,
  tabId?: number,
) {
  const job = jobs.find(
    (job) =>
      job.job_uid === jobUid &&
      job.origin === origin &&
      (tabId === undefined || job.tabId === tabId),
  );
  if (!job)
    throw new Error("This capture is not available for the connected server.");
  return job.archiveId;
}
export function recoverPairing<T extends { state: string; error?: string }>(
  pairing: T,
): T {
  return pairing.state === "minting"
    ? {
        ...pairing,
        state: "ambiguous",
        error:
          "Token creation was interrupted. Check API tokens in Archivr before resetting pairing.",
      }
    : pairing;
}

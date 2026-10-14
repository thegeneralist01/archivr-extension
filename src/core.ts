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
  if (["CAPTURE_CONTEXT", "OPEN_ARCHIVR", "BROWSER_SESSION", "OPEN_SETTINGS"].includes(message.type) && content)
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
// ── Browser session helpers ────────────────────────────────────────────────

// Hosts where both "Use my cookies" and "Include localStorage" default to off.
// Matched exactly or as a subdomain (e.g. "www.reddit.com" → matches "reddit.com").
const SOCIAL_HOSTS = [
  "x.com", "twitter.com", "instagram.com", "facebook.com", "fb.watch",
  "threads.net", "threads.com", "tiktok.com", "reddit.com", "redd.it",
  "snapchat.com", "youtube.com", "youtu.be", "linkedin.com", "bsky.app",
  "pinterest.com", "tumblr.com", "discord.com", "vk.com", "weibo.com",
] as const;

/** True when `hostname` is in the social list or is a subdomain of one. */
export function isSocialHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  for (const entry of SOCIAL_HOSTS) {
    if (h === entry || h.endsWith("." + entry)) return true;
  }
  return false;
}

/**
 * Client-side mirror of the server's `BrowserSession::applies_to`.
 * Must never be more permissive than the server rule.
 */
export function sessionAppliesTo(pageUrl: string, locator: string): boolean {
  try {
    const pageHost = new URL(pageUrl).hostname.toLowerCase();
    // x:media:ID — page must be exactly x.com
    if (/^(?:x|twitter|tweet):media:/i.test(locator)) {
      return pageHost === "x.com";
    }
    // Any other x/twitter/tweet shorthand — page must be X-family
    if (/^(?:x|twitter|tweet):/i.test(locator)) {
      return pageHost === "x.com" || pageHost === "twitter.com" ||
        pageHost.endsWith(".x.com") || pageHost.endsWith(".twitter.com");
    }
    // http(s) URL — hostnames must be identical
    const locatorHost = new URL(locator).hostname.toLowerCase();
    return locatorHost.length > 0 && locatorHost === pageHost;
  } catch {
    return false;
  }
}

/** localStorage is isolated by scheme, host, and port, unlike cookies. */
export function storageAppliesTo(pageUrl: string, locator: string): boolean {
  try {
    const page = new URL(pageUrl);
    const target = new URL(locator);
    return ["http:", "https:"].includes(target.protocol) && page.origin === target.origin;
  } catch {
    return false;
  }
}

// ── Wire limits (mirrored from browser_session.rs and frontend/src/browserData.js) ──
const BS_MAX_COOKIES = 300;
const BS_MAX_COOKIE_NAME_BYTES = 256;
const BS_MAX_COOKIE_VALUE_BYTES = 8192;
const BS_MAX_COOKIES_TOTAL_BYTES = 65536;
const BS_MAX_STORAGE_ITEMS = 2000;
const BS_MAX_STORAGE_KEY_BYTES = 1024;
const BS_MAX_STORAGE_TOTAL_BYTES = 1_048_576;
const BS_MAX_URL_BYTES = 10_000;

function bsBytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Validates and sanitizes a browser session value from a content-script extension message.
 * Throws `Error` on any failure.
 * Returns a clean `{ url, cookies, local_storage }` object.
 */
export function validateBrowserSession(
  value: unknown,
  locator: string,
  senderUrl: string,
): { url: string; cookies: Record<string, string>; local_storage: Record<string, string> } {
  // Shape
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid browser data.");
  }
  const v = value as Record<string, unknown>;

  // url: must be string, http(s), same origin as senderUrl, and appliesTo locator
  const url = v["url"];
  if (typeof url !== "string" || bsBytes(url) > BS_MAX_URL_BYTES) {
    throw new Error("Invalid browser data.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    throw new Error("Browser data does not match this page.");
  }
  // Origin must match senderUrl
  try {
    if (new URL(url).origin !== new URL(senderUrl).origin) {
      throw new Error("Browser data does not match this page.");
    }
  } catch (e) {
    if ((e as Error).message === "Browser data does not match this page.") throw e;
    throw new Error("Browser data does not match this page.");
  }
  if (!sessionAppliesTo(url, locator)) {
    throw new Error("Browser data does not match this page.");
  }

  // cookies
  const rawCookies = v["cookies"];
  const cookies: Record<string, string> = Object.create(null);
  if (rawCookies !== undefined && rawCookies !== null) {
    if (typeof rawCookies !== "object" || Array.isArray(rawCookies)) {
      throw new Error("Invalid browser data.");
    }
    const cookieMap = rawCookies as Record<string, unknown>;
    const entries = Object.keys(cookieMap);
    if (entries.length > BS_MAX_COOKIES) {
      throw new Error("Browser data is too large.");
    }
    let totalBytes = 0;
    for (const name of entries) {
      const val = cookieMap[name];
      if (typeof val !== "string") throw new Error("Invalid browser data.");
      const nameBytes = bsBytes(name);
      if (!name || nameBytes > BS_MAX_COOKIE_NAME_BYTES || /[\x00-\x1f\x7f ;=]/.test(name)) {
        throw new Error("Invalid cookie name or value.");
      }
      const valBytes = bsBytes(val);
      if (valBytes > BS_MAX_COOKIE_VALUE_BYTES || /[\x00-\x1f\x7f;]/.test(val)) {
        throw new Error("Invalid cookie name or value.");
      }
      totalBytes += nameBytes + valBytes;
      if (totalBytes > BS_MAX_COOKIES_TOTAL_BYTES) {
        throw new Error("Browser data is too large.");
      }
      cookies[name] = val;
    }
  }

  // local_storage
  const rawStorage = v["local_storage"];
  const local_storage: Record<string, string> = Object.create(null);
  if (rawStorage !== undefined && rawStorage !== null) {
    if (typeof rawStorage !== "object" || Array.isArray(rawStorage)) {
      throw new Error("Invalid browser data.");
    }
    const storageMap = rawStorage as Record<string, unknown>;
    const keys = Object.keys(storageMap);
    if (keys.length > 0 && !storageAppliesTo(url, locator)) {
      throw new Error("Browser localStorage requires the same origin as the capture URL.");
    }
    if (keys.length > BS_MAX_STORAGE_ITEMS) {
      throw new Error("Browser data is too large.");
    }
    let totalBytes = 0;
    for (const key of keys) {
      const val = storageMap[key];
      if (typeof val !== "string") throw new Error("Invalid browser data.");
      const keyBytes = bsBytes(key);
      if (!key || keyBytes > BS_MAX_STORAGE_KEY_BYTES) {
        throw new Error("Browser data is too large.");
      }
      totalBytes += keyBytes + bsBytes(val);
      if (totalBytes > BS_MAX_STORAGE_TOTAL_BYTES) {
        throw new Error("Browser data is too large.");
      }
      local_storage[key] = val;
    }
  }

  return { url, cookies, local_storage };
}

/**
 * De-duplicates a raw cookie list (first occurrence per name wins, matching
 * the order `chrome.cookies.getAll` returns — longest path first).
 */
export function cookieRows(
  list: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean }>,
): Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean }> {
  const seen = new Set<string>();
  const result = [];
  for (const c of list) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      result.push({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure });
    }
  }
  return result;
}

/** True when `s` contains a lone surrogate (unpaired high or low surrogate). */
export function hasLoneSurrogate(s: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

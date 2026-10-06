import {
  normalizeOrigin,
  routeTarget,
  validateLocator,
  validateText,
  menuTarget,
  jobArchive,
  recoverPairing,
  selectionItem,
  authorizeMessage,
  updateJob,
  isPending,
  type Job,
} from "./core";
type Config = {
  origin: string;
  token: string;
  tokenUid: string;
  archiveId: string | null;
  archives: { id: string; label: string }[];
  username: string;
};
type Pairing = {
  origin: string;
  tabId: number;
  state: "waiting" | "minting" | "ambiguous";
  error?: string;
};
const store = chrome.storage.local;
const ready = (async () => {
  await store.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const { pairing } = await store.get("pairing");
  if (pairing?.state === "minting")
    await store.set({ pairing: recoverPairing(pairing) });
})();
let pairingFlight: Promise<any> | null = null;
let jobQueue: Promise<any> = Promise.resolve();
const contexts = new Map<number, { url: string; at: number }>();
async function state() {
  await ready;
  return store.get(["config", "pairing", "jobs", "drafts"]);
}
function fail(message: string, status?: number) {
  const error: any = new Error(message);
  error.status = status;
  throw error;
}
async function api(config: Config, path: string, method = "GET", body?: any) {
  const url = new URL(path, config.origin);
  if (url.origin !== config.origin || !path.startsWith("/api/"))
    fail("Invalid API route.");
  const response = await fetch(url.href, {
    method,
    credentials: "omit",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok)
    fail(
      data?.error || data?.message || `HTTP ${response.status}`,
      response.status,
    );
  return data;
}
async function connected() {
  const { config } = await state();
  if (!config?.token)
    fail("Connect Archivr from the extension settings first.", 401);
  if (!config.archiveId) fail("Choose an archive in extension settings first.");
  return config as Config;
}
async function getStatus() {
  const { config, pairing, jobs = [] } = await state();
  if (config?.token && !config.archives.length) {
    try {
      const archives = await api(config, "/api/archives");
      config.archives = archives.map((item: any) => ({
        id: item.id,
        label: item.label,
      }));
      if (config.archives.length === 1)
        config.archiveId = config.archives[0].id;
      await store.set({ config });
    } catch {}
  }
  return {
    config: config
      ? {
          origin: config.origin,
          archiveId: config.archiveId,
          archives: config.archives,
          username: config.username,
        }
      : null,
    pairing,
    jobs,
  };
}
function hostGrant(origin: string) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
async function pairingFetch(tabId: number, origin: string, mint = false) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: async (expectedOrigin, create) => {
      if (location.origin !== expectedOrigin)
        return {
          error: "The server tab changed origin. Open settings and reconnect.",
        };
      try {
        const me = await fetch("/api/auth/me", {
          credentials: "same-origin",
          redirect: "error",
        });
        if (me.status === 401) return { waiting: true };
        if (!me.ok) return { error: `Server returned HTTP ${me.status}.` };
        const user = await me.json();
        if (!(user.role_bits & 2))
          return {
            error: "This account needs the User role to capture content.",
          };
        if (!create) return { user };
        const response = await fetch("/api/auth/tokens", {
          method: "POST",
          credentials: "same-origin",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Archivr Chrome extension" }),
        });
        if (!response.ok)
          return { error: `Token creation returned HTTP ${response.status}.` };
        return { user, token: await response.json() };
      } catch {
        return {
          error: create
            ? "Token creation could not be confirmed. Check API tokens in Archivr before reconnecting."
            : "Waiting for the server tab to finish loading.",
        };
      }
    },
    args: [origin, mint],
  });
  return results[0]?.result;
}
async function startPair(originInput: string) {
  const origin = normalizeOrigin(originInput);
  const { config, pairing } = await state();
  if (config?.token)
    fail("Disconnect the existing server before connecting another.");
  if (pairing?.state === "minting" || pairing?.state === "ambiguous")
    fail(
      "A token may already have been created. Check Archivr’s API token settings, revoke it if needed, then use Reset pairing.",
    );
  if (!(await chrome.permissions.contains({ origins: [hostGrant(origin)] })))
    fail("Allow access to this server before connecting.");
  const tabs = await chrome.tabs.query({ url: hostGrant(origin) });
  const existing = tabs.find((tab) => {
    try {
      return new URL(tab.url || "").origin === origin;
    } catch {
      return false;
    }
  });
  const tab = existing
    ? await chrome.tabs.update(existing.id!, { active: true })
    : await chrome.tabs.create({ url: origin });
  await store.set({ pairing: { origin, tabId: tab.id!, state: "waiting" } });
  return getStatus();
}
async function checkPair() {
  if (pairingFlight) return pairingFlight;
  pairingFlight = (async () => {
    const { pairing, config } = await state();
    if (config?.token || !pairing) return getStatus();
    if (pairing.state !== "waiting") return getStatus();
    const check = await pairingFetch(pairing.tabId, pairing.origin);
    if (check?.waiting) return getStatus();
    if (!check?.user) {
      await store.set({
        pairing: {
          ...pairing,
          error: check?.error || "Open the server tab and log in.",
        },
      });
      return getStatus();
    }
    // Persist before POST. A worker interruption here requires an explicit reset, never an automatic retry.
    await store.set({
      pairing: { ...pairing, state: "minting", error: undefined },
    });
    let created: any;
    try {
      created = await pairingFetch(pairing.tabId, pairing.origin, true);
    } catch {}
    if (!created?.token?.raw_token) {
      await store.set({
        pairing: {
          ...pairing,
          state: "ambiguous",
          error:
            created?.error ||
            "Token creation was interrupted. Check API tokens in Archivr before reconnecting.",
        },
      });
      return getStatus();
    }
    const saved: Config = {
      origin: pairing.origin,
      token: created.token.raw_token,
      tokenUid: created.token.token_uid,
      archiveId: null,
      archives: [],
      username: created.user.username,
    };
    await store.set({ config: saved });
    await store.remove("pairing");
    const archives = await api(saved, "/api/archives");
    saved.archives = archives.map((item: any) => ({
      id: item.id,
      label: item.label,
    }));
    if (saved.archives.length === 1) saved.archiveId = saved.archives[0].id;
    await store.set({ config: saved });
    return getStatus();
  })().finally(() => {
    pairingFlight = null;
  });
  return pairingFlight;
}
async function disconnect(forget = false) {
  if (pairingFlight) fail("Wait for pairing to finish before resetting.");
  const { config } = await state();
  if (config?.token && !forget) {
    try {
      await api(
        config,
        `/api/auth/tokens/${encodeURIComponent(config.tokenUid)}`,
        "DELETE",
      );
    } catch (error: any) {
      if (![401, 404].includes(error.status))
        fail(
          "The server could not revoke this token. Reconnect to the server, or use Forget connection and revoke the token in Archivr later.",
        );
    }
  }
  await store.remove(["config", "pairing"]);
  await chrome.action.setBadgeText({ text: "" });
  return getStatus();
}
function editJobs(fn: (jobs: Job[]) => Job[]) {
  jobQueue = jobQueue
    .catch(() => {})
    .then(async () => {
      const { jobs = [] } = await state();
      const updated = fn(jobs);
      await store.set({ jobs: updated.slice(-100) });
      return updated;
    });
  return jobQueue;
}
async function recordJob(config: Config, data: any, tabId?: number) {
  if (!data?.job_uid) return;
  await editJobs((jobs) => [
    ...jobs,
    {
      job_uid: data.job_uid,
      origin: config.origin,
      archiveId: config.archiveId!,
      status: data.status || "pending",
      createdAt: Date.now(),
      tabId,
    },
  ]);
  await chrome.alarms.create("capture-jobs", { periodInMinutes: 0.5 });
  await badge();
}
async function badge() {
  const { jobs = [] } = await state();
  const pending = jobs.filter(isPending);
  const latest = jobs.at(-1);
  await chrome.action.setBadgeBackgroundColor({
    color: latest?.status === "failed" ? "#8d3f30" : "#20251f",
  });
  await chrome.action.setBadgeText({
    text: pending.length
      ? String(pending.length)
      : latest?.status === "failed"
        ? "!"
        : "",
  });
}
async function pollJobs() {
  const { jobs = [], config } = await state();
  if (!config) return;
  for (const job of jobs.filter(isPending)) {
    if (job.origin !== config.origin) continue;
    try {
      const data = await api(
        config,
        `/api/archives/${encodeURIComponent(job.archiveId)}/capture_jobs/${encodeURIComponent(job.job_uid)}`,
      );
      const updated = updateJob(job, data);
      await editJobs((all) =>
        all.map((item) =>
          item.job_uid === job.job_uid && item.origin === job.origin
            ? updated
            : item,
        ),
      );
      if (!isPending(updated) && job.tabId != null)
        chrome.tabs
          .sendMessage(job.tabId, {
            type: "JOB_STATUS",
            job: {
              job_uid: updated.job_uid,
              status: updated.status,
              error: updated.error,
            },
          })
          .catch(() => {});
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) {
        await editJobs((all) =>
          all.map((item) =>
            item.job_uid === job.job_uid
              ? {
                  ...item,
                  status: "failed",
                  error:
                    "Sign in again: the extension token is no longer authorized.",
                }
              : item,
          ),
        );
      }
    }
  }
  await badge();
  const { jobs: current = [] } = await state();
  if (!current.some(isPending)) await chrome.alarms.clear("capture-jobs");
}
async function invoke(
  method: string,
  args: any[],
  sender: chrome.runtime.MessageSender,
) {
  const config = await connected();
  const archiveId = config.archiveId!;
  const a = `/api/archives/${encodeURIComponent(archiveId)}`;
  if (method === "getCaptureOptions") {
    if (args.length) fail("Invalid options request.");
    return api(config, "/api/captures/options");
  }
  if (args[0] !== archiveId)
    fail("The selected archive changed. Reopen capture.");
  let data: any;
  switch (method) {
    case "submitCapture": {
      if (typeof args[1] !== "string" || args[1].length > 10000)
        fail("Invalid locator.");
      validateLocator(args[1]);
      const payload: any = { locator: args[1] };
      if (args[2] && args[2] !== "best")
        payload.quality = String(args[2]).slice(0, 100);
      const options = args[3] || {};
      for (const key of [
        "ublock_enabled",
        "reader_mode",
        "cookie_ext_enabled",
        "modal_closer_enabled",
        "via_freedium",
        "download_subtitles",
        "sync",
      ])
        if (typeof options[key] === "boolean") payload[key] = options[key];
      if (
        options.per_item_quality &&
        typeof options.per_item_quality === "object"
      )
        payload.per_item_quality = options.per_item_quality;
      data = await api(config, `${a}/captures`, "POST", payload);
      await recordJob(config, data, sender.tab?.id);
      return data;
    }
    case "submitTextCapture": {
      const input = args[1];
      if (
        !input ||
        typeof input.title !== "string" ||
        typeof input.body !== "string" ||
        !["text/plain", "text/markdown", undefined].includes(input.mime)
      )
        fail("Invalid text capture.");
      validateText(input.body);
      data = await api(config, `${a}/captures/text`, "POST", {
        title: input.title,
        body: input.body,
        mime: input.mime || "text/plain",
      });
      await recordJob(config, data, sender.tab?.id);
      return data;
    }
    case "pollCaptureJob": {
      if (typeof args[1] !== "string" || args[1].length > 100)
        fail("Invalid job.");
      const response = await api(
        config,
        `${a}/capture_jobs/${encodeURIComponent(args[1])}`,
      );
      await editJobs((jobs) =>
        jobs.map((job) =>
          job.job_uid === args[1] &&
          job.origin === config.origin &&
          job.archiveId === archiveId
            ? updateJob(job, response)
            : job,
        ),
      );
      await badge();
      return response;
    }
    case "probeCapture":
      validateLocator(args[1]);
      return api(
        config,
        `${a}/captures/probe?locator=${encodeURIComponent(args[1])}`,
      );
    case "probePlaylist":
      validateLocator(args[1]);
      return api(config, `${a}/captures/probe-playlist`, "POST", {
        locator: args[1],
      });
    case "generateTextTitle":
      if (
        typeof args[1]?.body !== "string" ||
        typeof args[1].provider !== "string"
      )
        fail("Invalid title request.");
      validateText(args[1].body);
      return api(config, `${a}/captures/text/title`, "POST", {
        body: args[1].body,
        provider: args[1].provider,
      });
    case "deleteUpload":
      fail("File upload is not available in the extension.");
    default:
      fail("Unsupported operation.");
  }
}
async function openArchivr(locator?: string, archiveId?: string) {
  const config = await connected();
  const url = new URL("/", config.origin);
  url.searchParams.set(
    "archive",
    archiveId && config.archives.some((archive) => archive.id === archiveId)
      ? archiveId
      : config.archiveId!,
  );
  if (locator) url.searchParams.set("capture", locator);
  return chrome.tabs.create({ url: url.href });
}
async function fallback(items: any[], notice?: string, container?: string) {
  const key = crypto.randomUUID();
  const { drafts = {} } = await state();
  await store.set({
    drafts: {
      ...drafts,
      [key]: { items, notice, container, createdAt: Date.now() },
    },
  });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`app.html?capture=${key}`),
  });
}
async function showCapture(tab: chrome.tabs.Tab, items: any[]) {
  try {
    await connected();
  } catch {
    await fallback(items, "Connect a server and choose an archive to capture.");
    return;
  }
  if (!tab.id || !/^https?:\/\//.test(tab.url || "")) {
    await fallback(
      items,
      "Chrome prevents in-page capture on this page. Paste a normal URL below.",
    );
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
      world: "ISOLATED",
    });
    await chrome.tabs.sendMessage(tab.id, {
      type: "SHOW_CAPTURE",
      items,
      requestKey: crypto.randomUUID(),
    });
  } catch {
    await fallback(
      items,
      "Chrome prevented the in-page dialog. You can capture from this extension tab.",
    );
  }
}
async function captureTarget(
  tab: chrome.tabs.Tab,
  url?: string,
  selection?: string,
) {
  if (selection) {
    await showCapture(tab, [selectionItem(selection)]);
    return;
  }
  try {
    const target = routeTarget(tab.url || "", url);
    if (target.kind === "container") {
      try {
        await openArchivr(target.locator);
      } catch (error: any) {
        await fallback(
          [{ locator: target.locator }],
          error.message,
          target.locator,
        );
      }
      return;
    }
    await showCapture(tab, [{ locator: target.locator }]);
  } catch (error: any) {
    await fallback([{ locator: "" }], error.message);
  }
}
async function handle(message: any, sender: chrome.runtime.MessageSender) {
  switch (message.type) {
    case "STATUS":
      return getStatus();
    case "PAIR_START":
      return startPair(message.origin);
    case "PAIR_CHECK":
      return checkPair();
    case "DISCONNECT":
      return disconnect();
    case "FORGET_CONNECTION":
      return disconnect(true);
    case "SELECT_ARCHIVE": {
      const { config } = await state();
      if (
        !config?.archives.some(
          (archive: any) => archive.id === message.archiveId,
        )
      )
        fail("Choose one of the server archives.");
      await store.set({ config: { ...config, archiveId: message.archiveId } });
      return getStatus();
    }
    case "API":
      return invoke(message.method, message.args, sender);
    case "CAPTURE_CONTEXT": {
      const config = await connected();
      return { archiveId: config.archiveId };
    }
    case "CONTEXT_TARGET":
      contexts.set(sender.tab!.id!, { url: message.url, at: Date.now() });
      try {
        const target = routeTarget(message.url);
        const kind =
          target.kind === "container"
            ? target.locator.includes("/playlist?")
              ? "playlist"
              : "channel"
            : "video";
        await chrome.contextMenus.update("youtube-target", {
          title: `Archive ${kind}`,
        });
      } catch {}
      return null;
    case "OPEN_TARGET": {
      await captureTarget(sender.tab!, message.url);
      return null;
    }
    case "CURRENT_TARGET": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      return { url: tab?.url || "", tabId: tab?.id };
    }
    case "CAPTURE_PAGE": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab) await captureTarget(tab);
      return null;
    }
    case "OPEN_ARCHIVR": {
      const config = await connected();
      const fromContent = /^https?:\/\//.test(sender.url || "");
      let archiveId: string | undefined;
      if (message.jobUid) {
        const { jobs = [] } = await state();
        archiveId = jobArchive(
          jobs,
          message.jobUid,
          config.origin,
          fromContent ? sender.tab?.id : undefined,
        );
      }
      const locator =
        !fromContent && typeof message.locator === "string"
          ? validateLocator(message.locator)
          : undefined;
      await openArchivr(locator, archiveId);
      return null;
    }
    case "OPEN_SETTINGS":
      await chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
      return null;
    case "GET_DRAFT": {
      const { drafts = {} } = await state();
      return drafts[message.key] || null;
    }
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!authorizeMessage(message, sender, chrome.runtime.id)) {
    respond({ ok: false, error: "Message not authorized.", status: 403 });
    return false;
  }
  handle(message, sender)
    .then((data) => respond({ ok: true, data }))
    .catch((error) =>
      respond({
        ok: false,
        error: error.message || "Operation failed.",
        status: error.status,
      }),
    );
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "capture-jobs") pollJobs().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => pollJobs().catch(() => {}));
async function setupMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "page",
    title: "Archive this page",
    contexts: ["page"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  chrome.contextMenus.create({
    id: "selection",
    title: "Archive selected text",
    contexts: ["selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  for (const kind of ["video", "playlist", "channel"]) {
    const targets =
      kind === "video"
        ? [
            "*://*.youtube.com/watch*",
            "*://*.youtube.com/shorts/*",
            "*://*.youtube.com/live/*",
            "*://youtu.be/*",
          ]
        : kind === "playlist"
          ? ["*://*.youtube.com/playlist*"]
          : [
              "*://*.youtube.com/@*",
              "*://*.youtube.com/channel/*",
              "*://*.youtube.com/c/*",
              "*://*.youtube.com/user/*",
            ];
    chrome.contextMenus.create({
      id: `youtube-link-${kind}`,
      title: `Archive ${kind}`,
      contexts: ["link"],
      targetUrlPatterns: targets,
    });
    chrome.contextMenus.create({
      id: `youtube-page-${kind}`,
      title: `Archive ${kind}`,
      contexts: ["page"],
      documentUrlPatterns: targets,
    });
  }
  chrome.contextMenus.create({
    id: "youtube-target",
    title: "Archive video",
    contexts: ["image", "video"],
    documentUrlPatterns: ["*://*.youtube.com/*"],
  });
}
chrome.runtime.onInstalled.addListener((details) => {
  setupMenus().catch(() => {});
  if (details.reason === "install")
    chrome.tabs.create({ url: chrome.runtime.getURL("app.html") });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  const remembered = contexts.get(tab.id!);
  let clicked = info.linkUrl;
  try {
    clicked = menuTarget(
      tab.url || "",
      info.linkUrl,
      remembered,
      Date.now(),
      info.menuItemId === "youtube-target",
    ).locator;
  } catch {}
  captureTarget(
    tab,
    clicked,
    info.menuItemId === "selection" ? info.selectionText : undefined,
  ).catch(() => {});
});
ready.then(async () => {
  await badge();
  const { jobs = [] } = await state();
  if (jobs.some(isPending))
    await chrome.alarms.create("capture-jobs", { periodInMinutes: 0.5 });
});

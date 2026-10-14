// Deterministic visual QA. Mock only the extension bridge; render production bundles.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const pathname = new URL(req.url).pathname;
    const file = Bun.file(path.join(process.cwd(), "dist", pathname));
    if (await file.exists()) return new Response(file);
    return new Response("<!doctype html><body><h1>Host page</h1></body>", {
      headers: { "content-type": "text/html" },
    });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true });
await mkdir("artifacts/ui", { recursive: true });
const failures: string[] = [];
const config = {
  origin: "https://archive.example.org",
  archiveId: "archive",
  username: "Alex",
  archives: [{ id: "archive", label: "Personal archive" }],
};
const jobs = ["running", "completed", "failed"].map((status, i) => ({
  status,
  job_uid: `job-${i}`,
  origin: config.origin,
  createdAt: Date.now(),
  error:
    status === "failed"
      ? "Unable to capture this page. Try again from Archivr."
      : undefined,
}));
const items = [
  {
    kind: "text",
    title: "A note worth keeping",
    body: "Across sessions, ideas build on one another.\n\nSave a small piece of the web, then make it your own.",
    mime: "text/plain",
  },
];
const report: any = {};
async function fixture(
  name: string,
  pathname: string,
  status: any,
  width = 900,
  height = 820,
  extra?: (page: any) => Promise<void>,
  draftItems = items,
) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (error) => failures.push(`${name}: ${error.message}`));
  await page.addInitScript(
    ({ origin, status, items }) => {
      const listeners: any[] = [];
      (window as any).__listeners = listeners;
      (window as any).__requests = [];
      (window as any).__permissionRemovals = [];
      let submitted = 0;
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        return attach.call(this, { ...options, mode: "open" });
      };
      (window as any).chrome = {
        runtime: {
          getURL: (file: string) => `${origin}/${file}`,
          onMessage: {
            addListener: (callback: any) => listeners.push(callback),
          },
          sendMessage: async (message: any) => {
            (window as any).__requests.push(message);
            if (message.type === "STATUS") return { ok: true, data: status };
            if (message.type === "GET_DRAFT")
              return { ok: true, data: { items } };
            if (message.type === "CAPTURE_CONTEXT")
              return { ok: true, data: { archiveId: "archive" } };
            if (message.type === "API") {
              if (message.method === "submitTextCapture")
                return {
                  ok: true,
                  data: {
                    job_uid: `submitted-${++submitted}`,
                    status: "pending",
                  },
                };
              if (message.method === "pollCaptureJob")
                return {
                  ok: true,
                  data: {
                    job_uid: message.args[1],
                    status: "completed",
                    notes_json: (window as any).__resultNotes,
                  },
                };
              return { ok: true, data: {} };
            }
            return { ok: true, data: null };
          },
        },
        permissions: {
          request: async () => true,
          contains: async () => false,
          remove: async (permissions: any) => {
            (window as any).__permissionRemovals.push(permissions);
            return true;
          },
        },
      };
    },
    { origin, status, items: draftItems },
  );
  await page.goto(origin + pathname);
  if (pathname.includes(".html")) {
    try {
      await page.waitForSelector(".extension-page", { state: "attached" });
    } catch (error) {
      await page.screenshot({
        path: `artifacts/ui/${name}-failure.png`,
        fullPage: true,
      });
      throw new Error(`${name}: ${failures.join("; ") || String(error)}`);
    }
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  if (extra) await extra(page);
  // Let shared opening/fade animations finish before recording a preview.
  await page.waitForTimeout(250);
  await page.screenshot({ path: `artifacts/ui/${name}.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) failures.push(`${name}: horizontal overflow`);
  report[name] = { horizontalOverflow: overflow };
  await page.close();
}
try {
  await fixture("welcome", "/app.html", {});
  await fixture("welcome-narrow", "/app.html", {}, 320, 780);
  await fixture("settings", "/app.html", { config, jobs }, 900, 820, async (page) => {
    await page.getByRole("button", { name: "Allow cookie access" }).click();
    await page.getByRole("button", { name: "Remove cookie access" }).click();
    const removed = await page.evaluate(() => (window as any).__permissionRemovals[0]);
    if (JSON.stringify(removed?.origins) !== JSON.stringify(["http://*/*", "https://*/*"]))
      failures.push("settings: removing cookie access kept the all-site host grants");
  });
  await fixture("popup", "/popup.html", { config, jobs }, 360, 650);
  await fixture(
    "popup-pairing",
    "/popup.html",
    { pairing: { state: "waiting", origin: config.origin } },
    360,
    450,
  );
  await fixture("connection-review", "/app.html", {
    pairing: {
      state: "ambiguous",
      origin: config.origin,
      error: "The connection needs review before it can be reset.",
    },
  });
  await fixture(
    "popup-long-content",
    "/popup.html",
    {
      config: {
        ...config,
        origin: `https://${"long".repeat(25)}.example.org`,
        archives: [
          {
            id: "archive",
            label: "A personal archive with a long descriptive name",
          },
        ],
      },
      jobs: [{ ...jobs[2], error: "Network failure: " + "details".repeat(70) }],
    },
    360,
    700,
  );
  let fallbackStyle: any;
  await fixture(
    "fallback-capture",
    "/app.html?capture=draft",
    { config },
    900,
    900,
    async (page) => {
      await page.waitForSelector("dialog[open]");
      await page.getByRole("button", { name: "Advanced options" }).click();
      fallbackStyle = await page
        .locator(".capture-submit")
        .evaluate((element: Element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            padding: style.padding,
            borderRadius: style.borderRadius,
            font: style.font,
          };
        });
      if (await page.locator(".extension-page .capture-dialog").count())
        failures.push("dialog inherits extension page overrides");
    },
  );
  await fixture(
    "in-page-capture",
    "/fixture",
    { config },
    900,
    900,
    async (page) => {
      await page.addScriptTag({ url: origin + "/content.js" });
      await page.evaluate(
        (items) =>
          (window as any).__listeners[0](
            { type: "SHOW_CAPTURE", requestKey: "shadow", items },
            {},
            () => {},
          ),
        items,
      );
      await page.waitForSelector("archivr-capture .capture-dialog[open]");
      await page.getByRole("button", { name: "Advanced options" }).click();
      const shadowStyle = await page
        .locator("archivr-capture .capture-submit")
        .evaluate((element: Element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            padding: style.padding,
            borderRadius: style.borderRadius,
            font: style.font,
          };
        });
      report.dialogStyle = { fallback: fallbackStyle, shadow: shadowStyle };
      if (JSON.stringify(fallbackStyle) !== JSON.stringify(shadowStyle))
        failures.push("fallback and shadow capture buttons differ");
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    },
  );
  await fixture(
    "notifications",
    "/fixture",
    { config },
    900,
    820,
    async (page) => {
      await page.addScriptTag({ url: origin + "/content.js" });
      await page.evaluate(() => {
        const listener = (window as any).__listeners[0];
        listener(
          {
            type: "JOB_STATUS",
            job: { job_uid: "success", status: "completed" },
          },
          {},
          () => {},
        );
        listener(
          {
            type: "JOB_STATUS",
            job: {
              job_uid: "failure",
              status: "failed",
              error:
                "Unable to archive this page. Check your server connection and try again.",
            },
          },
          {},
          () => {},
        );
      });
      await page.waitForSelector("archivr-notifications .toast--success");
      await page.waitForSelector("archivr-notifications .toast--error");
      if (await page.locator(".extension-toast").count())
        failures.push("legacy notification remains");
      await page
        .getByRole("button", { name: "Dismiss notification" })
        .first()
        .click();
      if ((await page.locator("archivr-notifications .toast").count()) !== 1)
        failures.push("notification dismissal failed");
    },
  );
  await fixture(
    "fallback-success",
    "/app.html?capture=draft",
    { config },
    900,
    900,
    async (page) => {
      await page.waitForSelector("dialog[open]");
      await page.locator(".capture-submit").click();
      await page.waitForSelector(".toast--success");
    },
  );
  await fixture(
    "batch-success",
    "/app.html?capture=draft",
    { config },
    900,
    900,
    async (page) => {
      await page.waitForSelector("dialog[open]");
      await page.locator(".capture-submit").click();
      await page.getByText("2 archived", { exact: true }).waitFor();
      if (await page.locator(".toast--info").count())
        failures.push("batch left persistent progress notifications");
    },
    [items[0], { ...items[0], title: "Another note" }],
  );
  await fixture(
    "repeated-capture",
    "/fixture",
    { config },
    900,
    900,
    async (page) => {
      await page.addScriptTag({ url: origin + "/content.js" });
      for (const requestKey of ["first", "second"]) {
        await page.evaluate(
          ({ items, requestKey }) =>
            (window as any).__listeners[0](
              { type: "SHOW_CAPTURE", requestKey, items },
              {},
              () => {},
            ),
          { items, requestKey },
        );
        await page.waitForSelector("dialog[open]");
        await page.locator(".capture-submit").click();
        await page.waitForFunction(() => {
          const shadow = document.querySelector(
            "archivr-notifications",
          )?.shadowRoot;
          return (
            shadow?.querySelectorAll(".toast--success").length ===
            (window as any).__requests.filter(
              (r: any) => r.method === "submitTextCapture",
            ).length
          );
        });
        if (await page.locator(".toast--info").count())
          failures.push(`${requestKey} capture left persistent progress`);
      }
    },
  );
  await fixture(
    "capture-warning",
    "/fixture",
    { config },
    900,
    900,
    async (page) => {
      await page.addScriptTag({ url: origin + "/content.js" });
      await page.evaluate((items) => {
        (window as any).__resultNotes = JSON.stringify({
          ublock_skipped: true,
        });
        (window as any).__listeners[0](
          { type: "SHOW_CAPTURE", requestKey: "warning", items },
          {},
          () => {},
        );
      }, items);
      await page.waitForSelector("dialog[open]");
      await page.locator(".capture-submit").click();
      await page.waitForSelector(".toast--warning");
      await page.evaluate(() =>
        (window as any).__listeners[0](
          {
            type: "JOB_STATUS",
            job: { job_uid: "submitted-1", status: "completed" },
          },
          {},
          () => {},
        ),
      );
      if (
        (await page.locator(".toast--warning").count()) !== 1 ||
        (await page.locator(".toast--success,.toast--info").count()) !== 0
      )
        failures.push("background completion replaced useful capture warning");
    },
  );
  // ── in-page-browser-data fixture ────────────────────────────────────────────
  await fixture(
    "in-page-browser-data",
    "/fixture",
    { config },
    900,
    920,
    async (page) => {
      // The page is already loaded here; install the mock in the live document
      // before injecting content.js, then delay its first response.
      await page.evaluate(() => {
        const origSend = (window as any).chrome.runtime.sendMessage;
        let cookieAccess = "missing";
        let release: (() => void) | undefined;
        let holdFirstRequest = true;
        (window as any).__setCookieAccess = (value: string) => { cookieAccess = value; };
        (window as any).__releaseBrowserSession = () => {
          holdFirstRequest = false;
          release?.();
        };
        (window as any).chrome.runtime.sendMessage = async (msg: any) => {
          if (msg.type === "BROWSER_SESSION") {
            if (holdFirstRequest) await new Promise<void>((resolve) => { release = resolve; });
            return {
              ok: true,
              data: {
                cookieAccess,
                cookies: cookieAccess === "granted" ? [
                  { name: "session", value: "abc", domain: "127.0.0.1", path: "/", httpOnly: true, secure: false },
                  { name: "theme", value: "dark", domain: "127.0.0.1", path: "/", httpOnly: false, secure: false },
                ] : [],
              },
            };
          }
          if (msg.type === "API" && msg.method === "submitCapture") {
            (window as any).__requests.push(msg);
            return { ok: true, data: { job_uid: "j1", status: "pending" } };
          }
          return origSend(msg);
        };
        // Seed a localStorage item before the dialog opens.
        try { localStorage.setItem("pref", "1"); } catch {}
      });
      await page.addScriptTag({ url: origin + "/content.js" });
      // Send SHOW_CAPTURE with a locator that matches the page origin.
      const fixtureLocator = origin + "/fixture";
      await page.evaluate(
        (locator) =>
          (window as any).__listeners[0](
            { type: "SHOW_CAPTURE", requestKey: "browser-data", items: [{ locator }] },
            {},
            () => {},
          ),
        fixtureLocator,
      );
      await page.waitForSelector("archivr-capture .capture-dialog[open]");
      if (!(await page.locator("archivr-capture .capture-submit").isDisabled()))
        failures.push("in-page-browser-data: capture can submit before browser data loads");
      await page.evaluate(() => (window as any).__releaseBrowserSession());
      await page.getByRole("button", { name: "Allow cookie access" }).waitFor();
      await page.evaluate(() => {
        (window as any).__setCookieAccess("granted");
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // "Use my cookies" toggle should appear and be checked (non-social host, defaults on).
      const useMyCookies = page.locator("archivr-capture .capture-browser-session-row");
      if (!(await useMyCookies.count()))
        failures.push("in-page-browser-data: 'Use my cookies' toggle not found");
      const checkbox = useMyCookies.locator('input[type="checkbox"]');
      await checkbox.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const checkbox = document.querySelector("archivr-capture")?.shadowRoot?.querySelector(".capture-browser-session-row input[type=checkbox]") as HTMLInputElement | null;
        return checkbox?.checked === true;
      });
      if (!(await checkbox.isChecked()))
        failures.push("in-page-browser-data: 'Use my cookies' not checked by default on non-social host");
      // Open Advanced options and verify tables appear.
      await page.getByRole("button", { name: "Advanced options" }).click();
      await page.waitForSelector("archivr-capture .capture-browser-data");
      const cookieTable = page.locator("archivr-capture .capture-kv-table").first();
      if (!(await cookieTable.count()))
        failures.push("in-page-browser-data: cookie table not visible");
      // Verify the fallback app.html dialog does NOT contain "Use my cookies".
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    },
  );
  await fixture(
    "in-page-mixed-origins",
    "/fixture",
    { config },
    900,
    700,
    async (page) => {
      await page.evaluate(() => {
        localStorage.setItem("pref", "1");
        const origSend = (window as any).chrome.runtime.sendMessage;
        (window as any).chrome.runtime.sendMessage = async (msg: any) => {
          if (msg.type === "BROWSER_SESSION") {
            return { ok: true, data: { cookieAccess: "granted", cookies: [
              { name: "session", value: "abc", domain: "127.0.0.1", path: "/", httpOnly: true, secure: false },
            ] } };
          }
          return origSend(msg);
        };
      });
      await page.addScriptTag({ url: origin + "/content.js" });
      const sameOrigin = origin + "/fixture";
      const otherOrigin = "http://127.0.0.1:1234/fixture";
      await page.evaluate(([first, second]) =>
        (window as any).__listeners[0](
          { type: "SHOW_CAPTURE", requestKey: "mixed-origins", items: [{ locator: first }, { locator: second }] },
          {},
          () => {},
        ), [sameOrigin, otherOrigin]);
      const submit = page.locator("archivr-capture .capture-submit");
      await submit.waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const button = document.querySelector("archivr-capture")?.shadowRoot?.querySelector(".capture-submit") as HTMLButtonElement | null;
        return button && !button.disabled;
      });
      await submit.click();
      await page.waitForFunction(() => (window as any).__requests.filter((r: any) => r.method === "submitCapture").length === 2);
      const requests = await page.evaluate(() => (window as any).__requests.filter((r: any) => r.method === "submitCapture"));
      const byLocator = new Map(requests.map((request: any) => [request.args[1], request.args[3]?.browser_session]));
      if (byLocator.get(sameOrigin)?.local_storage?.pref !== "1")
        failures.push("in-page-mixed-origins: same-origin localStorage was omitted");
      if (Object.keys(byLocator.get(otherOrigin)?.local_storage ?? {}).length !== 0)
        failures.push("in-page-mixed-origins: localStorage crossed an origin boundary");
      if (byLocator.get(otherOrigin)?.cookies?.session !== "abc")
        failures.push("in-page-mixed-origins: same-host cookies were omitted");
    },
  );
  // ── fallback dialog must not show browser data controls ──────────────────────
  await fixture(
    "fallback-no-browser-data",
    "/app.html?capture=draft",
    { config },
    900,
    700,
    async (page) => {
      await page.waitForSelector(".extension-page");
      // The settings page legitimately has "Use my cookies" as a section heading.
      // Verify only that the capture *dialog* itself has no browser-session controls.
      const dialogCount = await page.locator(".capture-dialog").count();
      if (dialogCount > 0) {
        const dialogText = await page.locator(".capture-dialog").innerText();
        if (dialogText.includes("Use my cookies"))
          failures.push("fallback-no-browser-data: 'Use my cookies' rendered in app.html capture dialog");
      }
    },
  );
  if (failures.length) throw new Error(failures.join("\n"));
  await Bun.write("artifacts/ui/report.json", JSON.stringify(report, null, 2));
  console.log(
    "UI smoke passed: 17 surfaces, no page errors or horizontal overflow; shared capture styles match; batch, repeated and warning notifications settle correctly.",
  );
} finally {
  await browser.close();
  server.stop(true);
}

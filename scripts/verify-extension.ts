// Exercise the packaged extension's real service worker and content script APIs.
import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts/ui", { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "archivr-ui-smoke-"));
const extension = path.resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => {
    const update = chrome.contextMenus.update.bind(chrome.contextMenus);
    chrome.contextMenus.update = async (id: any, options: any) => {
      await update(id, options);
      if (id === "page") (globalThis as any).__pageVisible = options.visible;
    };
  });
  await context.route("https://**/*", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "content-security-policy": "font-src 'none'" },
      body: "<!doctype html><html><body><h1>Browser fixture</h1></body></html>",
    }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function expectMenu(visible: boolean) {
    for (let i = 0; i < 40; i++) {
      if (
        (await worker.evaluate(() => (globalThis as any).__pageVisible)) ===
        visible
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Generic page menu expected visible=${visible}`);
  }
  await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await expectMenu(false);
  await page.goto("https://example.org");
  await expectMenu(true);
  const youtube = await context.newPage();
  await youtube.goto("https://music.youtube.com/@creator");
  await expectMenu(false);
  await page.bringToFront();
  await expectMenu(true);
  await youtube.bringToFront();
  await expectMenu(false);
  await youtube.goto("https://youtu.be/dQw4w9WgXcQ");
  await expectMenu(false);
  await youtube.goto("https://x.com/fixture");
  await expectMenu(true);
  // The production content listener renders the real isolated notification surface.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    await chrome.tabs.sendMessage(tab.id!, {
      type: "JOB_STATUS",
      job: { job_uid: "fixture", status: "completed" },
    });
  });
  await youtube.waitForSelector("archivr-notifications");
  await youtube.waitForFunction(
    () =>
      [...document.fonts].filter(
        (font) =>
          ["Cormorant Garamond", "Spectral"].includes(font.family) &&
          font.status === "loaded",
      ).length === 4,
  );
  await youtube.evaluate(async () => {
    await document.fonts.ready;
    const local = [...document.fonts].filter((font) =>
      ["Cormorant Garamond", "Spectral"].includes(font.family),
    );
    if (local.length !== 4 || local.some((font) => font.status !== "loaded"))
      throw new Error("Bundled fonts failed on a restrictive host page");
    const canvas = document.createElement("canvas").getContext("2d")!;
    for (const family of ["Spectral", "Cormorant Garamond"]) {
      canvas.font = "500 32px serif";
      const fallback = canvas.measureText("Archivr captures your ideas").width;
      canvas.font = `500 32px "${family}", serif`;
      if (canvas.measureText("Archivr captures your ideas").width === fallback)
        throw new Error(`${family} did not render its bundled glyphs`);
    }
  });
  await youtube.waitForTimeout(250);
  await youtube.screenshot({ path: "artifacts/ui/packaged-notification.png" });
  const id = new URL(worker.url()).host;
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${id}/app.html`);
  await settings.waitForSelector("#origin");
  await settings.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('600 30px "Cormorant Garamond"'))
      throw new Error("Extension display font is missing");
  });
  await settings.screenshot({ path: "artifacts/ui/packaged-welcome.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Packaged Chromium smoke passed: real tab activation/navigation menu updates, isolated notifications and local fonts under font-src 'none'.",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

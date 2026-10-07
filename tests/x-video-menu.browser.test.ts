import { expect, test } from "bun:test";
import { chromium } from "playwright";

const pageUrl = "https://x.com/home";
const dropdown = `<div data-testid="Dropdown">
  <div role="menuitem" tabindex="0">Copy video address</div>
  <div role="menuitem" tabindex="0">Copy link at current time</div>
  <div role="menuitem" tabindex="0">Post Video</div>
</div>`;

async function withXPage(run: (page: any) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.route("https://x.com/**", (route: any) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
    );
    await page.addInitScript(() => {
      (window as any).__archivrMessages = [];
      (window as any).chrome = { runtime: { onMessage: { addListener: () => {} }, getURL: (path: string) => `chrome-extension://fixture/${path}`, sendMessage: async (message: unknown) => { (window as any).__archivrMessages.push(message); return { ok: true, data: null }; } } };
    });
    await page.goto(pageUrl);
    await page.addScriptTag({ path: "dist/content.js" });
    await run(page);
  } finally { await browser.close(); }
}

async function menuItems(page: any) {
  return page.locator('[data-testid="Dropdown"] > [role="menuitem"]').allTextContents();
}

async function expectActionCount(page: any, count: number) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('[data-archivr-video-menu]').length === expected,
    count,
  );
  expect(await page.locator('[data-archivr-video-menu]').count()).toBe(count);
}

async function installVideoMenu(page: any, deferred = false) {
  await page.evaluate(({ dropdown, deferred }) => {
    document.body.innerHTML = `<article data-testid="tweet"><a href="https://x.com/outer/status/2107253221244715130"><time></time></a><div data-testid="quoteTweet"><a href="https://x.com/quoted/status/999999999999999999"><time></time></a><div data-testid="videoPlayer"><video id="video" style="width:80px;height:80px"></video></div></div></article>`;
    document.addEventListener("contextmenu", (event) => {
      if (!(event.target as Element).closest("video")) return;
      event.preventDefault();
      const add = () => { const root = document.createElement("div"); root.innerHTML = dropdown; document.body.append(root.firstElementChild!); };
      if (deferred) setTimeout(add, 20); else add();
    });
  }, { dropdown, deferred });
  await page.locator("#video").click({ button: "right" });
  await expectActionCount(page, 1);
}

test("trusted right-click sees a bubble-cancelled X Dropdown, preserves its three rows, and archives the quoted owner", async () => {
  await withXPage(async (page) => {
    await installVideoMenu(page);
    expect(await menuItems(page)).toEqual(["Copy video address", "Archive video", "Copy link at current time", "Post Video"]);
    expect(await page.locator('[data-archivr-video-menu] img').getAttribute("src")).toBe("chrome-extension://fixture/logo-mark.svg");
    expect(await page.locator('[data-archivr-video-menu] img').getAttribute("aria-hidden")).toBe("true");
    expect(await page.locator('[data-archivr-video-menu] img').evaluate((image: HTMLImageElement) => ({ height: image.style.height, aspectRatio: image.style.aspectRatio, margin: image.style.margin }))).toEqual({ height: "1.5em", aspectRatio: "1 / 1", margin: "auto 0.5em auto 0px" });
    await page.getByRole("menuitem", { name: "Archive video" }).click();
    await page.waitForFunction(() => (window as any).__archivrMessages.length === 1);
    expect(await page.evaluate(() => (window as any).__archivrMessages)).toEqual([{ type: "OPEN_TARGET", url: "x:media:999999999999999999" }]);
  });
});

test("a deferred X Dropdown also receives one action after a trusted click", async () => {
  await withXPage(async (page) => { await installVideoMenu(page, true); expect(await menuItems(page)).toEqual(["Copy video address", "Archive video", "Copy link at current time", "Post Video"]); });
});

test("Enter and Space dispatch exactly once and do not run the host menu handler", async () => {
  await withXPage(async (page) => {
    await installVideoMenu(page);
    await page.evaluate(() => { const action = document.querySelector('[data-archivr-video-menu]')!; action.addEventListener("click", () => ((window as any).__hostAction = true)); action.addEventListener("keydown", () => ((window as any).__hostAction = true)); });
    await page.getByRole("menuitem", { name: "Archive video" }).press("Enter");
    await page.waitForTimeout(20);
    expect(await page.evaluate(() => (window as any).__archivrMessages)).toHaveLength(1);
    expect(await page.evaluate(() => (window as any).__hostAction)).toBeUndefined();
    await installVideoMenu(page);
    await page.getByRole("menuitem", { name: "Archive video" }).press(" ");
    await page.waitForTimeout(20);
    expect(await page.evaluate(() => (window as any).__archivrMessages)).toHaveLength(2);
  });
});

test("does not alter an unsuppressed native context menu", async () => {
  await withXPage(async (page) => { await page.setContent(`<article data-testid="tweet"><a href="https://x.com/owner/status/2107253221244715130"><time></time></a><div data-testid="videoPlayer"><video id="video" style="width:80px;height:80px"></video></div></article>`); await page.locator("#video").click({ button: "right" }); await page.waitForTimeout(40); await expectActionCount(page, 0); });
});

test("action refuses a detached or re-owned clicked player", async () => {
  await withXPage(async (page) => { await installVideoMenu(page); await page.evaluate(() => document.querySelector("#video")!.remove()); await page.getByRole("menuitem", { name: "Archive video" }).click(); await page.waitForTimeout(20); expect(await page.evaluate(() => (window as any).__archivrMessages)).toEqual([]); });
  await withXPage(async (page) => { await installVideoMenu(page); await page.evaluate(() => { const video = document.querySelector("#video")!; video.remove(); document.querySelector("[data-testid=quoteTweet]")!.remove(); document.querySelector("article")!.append(video); }); await page.getByRole("menuitem", { name: "Archive video" }).click(); await page.waitForTimeout(20); expect(await page.evaluate(() => (window as any).__archivrMessages)).toEqual([]); });
});

test("poster right-clicks and non-Dropdown text never receive an action", async () => {
  await withXPage(async (page) => { await page.evaluate((dropdown) => { document.body.innerHTML = `<article data-testid="tweet"><a href="https://x.com/owner/status/2107253221244715130"><time></time></a><div data-testid="videoPlayer"><video></video><picture><img id="poster" style="width:80px;height:80px"></picture></div></article>`; document.addEventListener("contextmenu", (event) => { if (!(event.target as Element).closest("img")) return; event.preventDefault(); document.body.insertAdjacentHTML("beforeend", dropdown.replace('data-testid="Dropdown"', "")); }); }, dropdown); await page.locator("#poster").click({ button: "right" }); await page.waitForTimeout(40); await expectActionCount(page, 0); });
});

test("removes its action when the same Dropdown is hidden or replaced, without reappearing", async () => {
  await withXPage(async (page) => { await installVideoMenu(page); await page.evaluate(() => { (document.querySelector('[data-testid="Dropdown"]') as HTMLElement).hidden = true; }); await expectActionCount(page, 0); await page.evaluate(() => { const menu = document.querySelector('[data-testid="Dropdown"]') as HTMLElement; menu.hidden = false; menu.innerHTML = '<div role="menuitem">Copy video address</div><div role="menuitem">Copy link at current time</div><div role="menuitem">Post Video</div>'; }); await page.waitForTimeout(40); await expectActionCount(page, 0); });
});

test("restores the action when X rerenders it out of the open Dropdown", async () => {
  await withXPage(async (page) => {
    await installVideoMenu(page);
    await page.evaluate(() => document.querySelector('[data-archivr-video-menu]')!.remove());
    await expectActionCount(page, 1);
    expect(await menuItems(page)).toEqual(["Copy video address", "Archive video", "Copy link at current time", "Post Video"]);
  });
});

test("dismissed action references cannot dispatch and SPA navigation removes the action", async () => {
  await withXPage(async (page) => {
    await installVideoMenu(page);
    await page.evaluate(() => {
      const action = document.querySelector('[data-archivr-video-menu]') as HTMLElement;
      document.querySelector('[data-testid="Dropdown"]')!.remove();
      action.click();
    });
    expect(await page.evaluate(() => (window as any).__archivrMessages)).toEqual([]);
  });
  await withXPage(async (page) => {
    await installVideoMenu(page);
    await page.evaluate(() => history.pushState({}, "", "/other"));
    await page.waitForFunction(() => !document.querySelector('[data-archivr-video-menu]'), null, { timeout: 1000 });
  });
});

test("a hidden old Dropdown does not consume discovery of a deferred menu inside a new portal", async () => {
  await withXPage(async (page) => {
    await page.evaluate((dropdown: string) => {
      document.body.innerHTML = `<article data-testid="tweet"><a href="/owner/status/2107253221244715130"><time></time></a><video id="video" style="width:80px;height:80px"></video></article><div hidden>${dropdown}</div>`;
      document.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        (window as any).__trustedContext = event.isTrusted;
        setTimeout(() => {
          const portal = document.createElement("div");
          portal.innerHTML = dropdown;
          document.body.append(portal);
        }, 20);
      });
    }, dropdown);
    await page.locator("#video").click({ button: "right" });
    await page.waitForFunction(() => document.querySelectorAll('[data-archivr-video-menu]').length === 1, null, { timeout: 1000 });
    expect(await page.evaluate(() => (window as any).__trustedContext)).toBe(true);
    expect(await page.locator('[hidden] [data-archivr-video-menu]').count()).toBe(0);
    await page.getByRole("menuitem", { name: "Archive video" }).click();
    await page.waitForFunction(() => (window as any).__archivrMessages.length === 1);
    expect(await page.evaluate(() => (window as any).__archivrMessages)).toEqual([{ type: "OPEN_TARGET", url: "x:media:2107253221244715130" }]);
  });
});

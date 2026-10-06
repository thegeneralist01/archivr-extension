import { send } from "./bridge";
import { showDialog, showToast } from "./dialog";
import { routeTarget } from "./core";
// A classic bundled script can be reinjected by activeTab; keep exactly one observer/listener set.
if (!(globalThis as any).__archivrInstalled) {
  (globalThis as any).__archivrInstalled = true;
  chrome.runtime.onMessage.addListener((message) => {
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
  });
  const isX = /(^|\.)(x|twitter)\.com$/.test(location.hostname);
  const isYoutube = /(^|\.)youtube\.com$/.test(location.hostname);
  function ownTweetUrl(article: Element) {
    const time = Array.from(
      article.querySelectorAll('a[href*="/status/"] time'),
    ).find((time) => {
      const link = time.closest("a");
      return (
        time.closest("article") === article &&
        !link?.closest(
          '[data-testid="quoteTweet"], [data-testid="card.wrapper"]',
        )
      );
    });
    return (time?.closest("a") as HTMLAnchorElement | undefined)?.href;
  }
  function youtubeTarget(element: Element | null) {
    const direct = element?.closest("a[href]") as HTMLAnchorElement | null;
    if (direct) {
      try {
        const target = routeTarget(location.href, direct.href);
        if (target.locator.includes("youtube.com/")) return target.locator;
      } catch {}
      return direct.href;
    }
    const container = element?.closest(
      "ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-playlist-renderer,ytd-grid-playlist-renderer,ytd-channel-renderer,ytd-compact-video-renderer,ytd-playlist-video-renderer",
    );
    const link = container?.querySelector(
      'a#thumbnail[href],a#video-title[href],a[href*="/playlist?"],a[href*="/@"],a[href*="/channel/"]',
    ) as HTMLAnchorElement | null;
    return link?.href;
  }
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!isYoutube) return;
      const url = youtubeTarget(
        event.target instanceof Element ? event.target : null,
      );
      send("CONTEXT_TARGET", { url: url || location.href }).catch(() => {});
    },
    true,
  );
  function addButton(
    parent: Element,
    owner: Element,
    url: () => string | undefined,
  ) {
    if (parent.querySelector(":scope > .archivr-capture-button")) return;
    const button = document.createElement("button");
    button.className = "archivr-capture-button";
    button.type = "button";
    button.textContent = "Archive";
    button.title = "Archive with Archivr";
    button.setAttribute("aria-label", "Archive with Archivr");
    button.style.cssText =
      "font:12px Arial,sans-serif;color:#8d3f30;background:#f5f0e7;border:1px solid #d2c6b5;border-radius:16px;padding:5px 10px;cursor:pointer;margin:0 6px;flex-shrink:0;line-height:16px;";
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const locator = url();
      if (!locator) {
        showToast("This post has no own permalink yet. Open it and try again.");
        return;
      }
      send("OPEN_TARGET", { url: locator }).catch((error) =>
        showToast(error.message),
      );
    };
    parent.append(button);
  }
  let scheduled = false;
  function scan() {
    scheduled = false;
    if (isX) {
      for (const article of document.querySelectorAll(
        'article[data-testid="tweet"]',
      )) {
        const row = Array.from(article.querySelectorAll('[role="group"]')).find(
          (row) =>
            row.closest("article") === article &&
            !row.closest('[data-testid="quoteTweet"]'),
        );
        if (row) addButton(row, article, () => ownTweetUrl(article));
      }
    }
    if (isYoutube) {
      const actions = document.querySelector(
        "ytd-watch-metadata #top-level-buttons-computed, ytd-watch-metadata #actions-inner",
      );
      if (actions)
        addButton(actions, actions, () => {
          try {
            return routeTarget(location.href).locator;
          } catch {
            return undefined;
          }
        });
      for (const renderer of document.querySelectorAll(
        "ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,ytd-playlist-video-renderer",
      )) {
        const details = renderer.querySelector("#details,#meta");
        if (details)
          addButton(details, renderer, () => youtubeTarget(renderer));
      }
    }
  }
  if (isX || isYoutube) {
    new MutationObserver(() => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(scan);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    scan();
  }
}

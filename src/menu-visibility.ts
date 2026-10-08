/** Chrome has no negative document patterns: synchronize the generic page row. */
export function isYoutubePage(url?: string) {
  try {
    const { protocol, hostname } = new URL(url || "");
    return (
      ["http:", "https:"].includes(protocol) &&
      (hostname === "youtu.be" || /(^|\.)youtube\.com$/.test(hostname))
    );
  } catch {
    return false;
  }
}

export function installPageMenuVisibility(api = chrome) {
  let queue = Promise.resolve();
  const refresh = () => {
    // Resolve the active tab inside the queue, rather than applying an old
    // event's URL after a newer navigation or window switch.
    queue = queue
      .catch(() => {})
      .then(async () => {
        const [tab] = await api.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        await api.contextMenus.update("page", {
          visible: !isYoutubePage(tab?.pendingUrl || tab?.url),
        });
      });
    return queue;
  };
  const sync = () => {
    refresh().catch(() => {});
  };
  api.tabs.onActivated.addListener(sync);
  api.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.active && (change.url || change.status)) sync();
  });
  api.windows.onFocusChanged.addListener(sync);
  return { refresh };
}

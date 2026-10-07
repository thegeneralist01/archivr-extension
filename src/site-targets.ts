import { routeTarget } from "./core";

export type TweetStatus = { id: string };
export type ContextSnapshot = {
  url?: string;
  page: string;
  at: number;
  /** Present only for X targets that need a second dispatch-time identity check. */
  kind?: "tweet" | "video";
  statusId?: string;
};

export function contextSnapshotForPage(
  value: unknown,
  page: string,
  now = Date.now(),
  maxAge = 120000,
): ContextSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<ContextSnapshot>;
  const xTarget = /^x:(tweet|media):(\d+)$/i.exec(snapshot.url || "");
  if (
    snapshot.page !== page ||
    typeof snapshot.at !== "number" ||
    !Number.isSafeInteger(snapshot.at) ||
    snapshot.at < 0 ||
    now - snapshot.at < 0 ||
    now - snapshot.at >= maxAge ||
    (snapshot.url !== undefined || "url" in snapshot) &&
      (typeof snapshot.url !== "string" || snapshot.url.length > 10000) ||
    (snapshot.kind !== undefined &&
      snapshot.kind !== "tweet" &&
      snapshot.kind !== "video") ||
    (snapshot.statusId !== undefined &&
      (typeof snapshot.statusId !== "string" || !/^\d+$/.test(snapshot.statusId))) ||
    (snapshot.kind !== undefined &&
      (!xTarget ||
        snapshot.statusId !== xTarget[2] ||
        snapshot.kind !== (xTarget[1] === "media" ? "video" : "tweet"))) ||
    (snapshot.statusId !== undefined && snapshot.kind === undefined)
  )
    return undefined;
  return snapshot as ContextSnapshot;
}

export function tweetStatus(value: string): TweetStatus | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    return undefined;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    ![
      "x.com",
      "twitter.com",
    ].some((domain) => host === domain || host.endsWith(`.${domain}`))
  )
    return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const status = parts.findIndex((part, index) => part === "status" && index > 0);
  const id = status >= 0 ? parts[status + 1] : undefined;
  return id && /^\d+$/.test(id) ? { id } : undefined;
}

export function tweetLocator(id: string, intent: "tweet" | "thread") {
  return `x:${intent}:${id}`;
}

export function xMenuLocator(
  intent: "tweet" | "thread",
  link: string | undefined,
  context: { url?: string; at: number } | undefined,
  now = Date.now(),
) {
  const clicked = link ? tweetStatus(link) : undefined;
  if (clicked) return tweetLocator(clicked.id, intent);
  const remembered =
    context && now - context.at >= 0 && now - context.at < 120000
      ? /^x:(?:tweet|media):(\d+)$/i.exec(context.url || "")?.[1]
      : undefined;
  return remembered ? tweetLocator(remembered, intent) : undefined;
}

/** A video menu never falls back to a remembered tweet or an arbitrary URL. */
export function xMediaMenuLocator(
  context: ContextSnapshot | undefined,
  now = Date.now(),
) {
  if (!context || now - context.at < 0 || now - context.at >= 120000)
    return undefined;
  const media = /^x:media:(\d+)$/i.exec(context.url || "");
  return context.kind === "video" && media && media[1] === context.statusId
    ? `x:media:${media[1]}`
    : undefined;
}

function hrefOf(link: Element | null) {
  if (!link) return undefined;
  return (link as HTMLAnchorElement).href || link.getAttribute("href") || undefined;
}

function isQuoted(element: Element) {
  return !!element.closest(
    '[data-testid="quoteTweet"], [data-testid="card.wrapper"], .tweet-body-quote',
  );
}

function postFor(element: Element) {
  return element.closest('article[data-testid="tweet"], div.tweet');
}

function statusFromLink(link: Element | null) {
  return tweetStatus(hrefOf(link) || "");
}

function hasClass(element: Element, name: string) {
  return (` ${element.getAttribute("class") || ""} `).includes(` ${name} `);
}

function ownTweetStatus(article: Element): TweetStatus | undefined {
  const dataId = article.getAttribute("data-tweet-id");
  if (dataId && /^\d+$/.test(dataId)) return { id: dataId };
  const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
  const own = links.filter(
    (link) => !isQuoted(link) && postFor(link) === article,
  );
  const timestamp = own.find(
    (link) => link.querySelector("time") || hasClass(link, "tweet-time"),
  );
  return statusFromLink(timestamp || own[0] || null);
}

function quotedTweetStatus(element: Element): TweetStatus | undefined {
  const quote = element.closest(
    '[data-testid="quoteTweet"], [data-testid="card.wrapper"], .tweet-body-quote',
  );
  if (!quote) return undefined;
  const links = Array.from(quote.querySelectorAll('a[href*="/status/"]'));
  const timestamp = links.find(
    (link) => link.querySelector("time") || hasClass(link, "tweet-time-quote"),
  );
  return statusFromLink(timestamp || links[0] || null);
}

export function tweetTargetFromElement(element: Element | null): TweetStatus | undefined {
  if (!element) return undefined;
  const link = element.closest("a[href]");
  // A deliberate permalink click is the only way a quote may override its
  // containing post. Quote bodies/actions otherwise remain owned by the post.
  const direct = statusFromLink(link);
  if (direct) return direct;
  const article = postFor(element);
  return article ? ownTweetStatus(article) : undefined;
}

/** Only genuine video/player targets can select X media capture. */
export function mediaTargetFromElement(element: Element | null): TweetStatus | undefined {
  if (!element) return undefined;
  // Poster images remain image targets even when X renders them inside a
  // video wrapper, so they cannot mint a video snapshot on a forged dispatch.
  if (element.closest("img, picture")) return undefined;
  const video = element.closest("video");
  const player = video || element.closest(
    '[data-testid="videoPlayer"], [data-testid="videoComponent"], .tweet-media-video-overlay',
  );
  if (!player) return undefined;
  const overlayVideo = hasClass(player, "tweet-media-video-overlay") &&
    player.parentElement?.querySelector("video");
  if (!video && !player.querySelector("video") && !overlayVideo) return undefined;
  return quotedTweetStatus(player) || tweetTargetFromElement(player);
}

const YOUTUBE_RENDERERS =
  "ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-playlist-renderer,ytd-grid-playlist-renderer,ytd-channel-renderer,ytd-compact-video-renderer,ytd-playlist-video-renderer";

export function youtubeTargetFromElement(page: string, element: Element | null) {
  const direct = element?.closest("a[href]") as HTMLAnchorElement | null;
  const candidate = direct ||
    (element?.closest(YOUTUBE_RENDERERS)?.querySelector(
      'a#thumbnail[href],a#video-title[href],a[href*="/playlist?"],a[href*="/@"],a[href*="/channel/"]',
    ) as HTMLAnchorElement | null);
  const href = hrefOf(candidate);
  if (!href) return undefined;
  try {
    return routeTarget(page, href).locator;
  } catch {
    return href;
  }
}

/** Resolves a native right-click without mutating the host page. */
export function nativeContextTarget(
  site: "x" | "youtube",
  page: string,
  element: Element | null,
) {
  if (site === "youtube") return youtubeTargetFromElement(page, element) || page;
  const media = mediaTargetFromElement(element);
  if (media) return `x:media:${media.id}`;
  const tweet = tweetTargetFromElement(element);
  return tweet ? tweetLocator(tweet.id, "tweet") : undefined;
}

export function contextTargetFromElement(
  site: "x" | "youtube",
  page: string,
  element: Element | null,
) {
  const url = nativeContextTarget(site, page, element);
  const match = /^x:(tweet|media):(\d+)$/i.exec(url || "");
  return match
    ? {
        url,
        kind: match[1] === "media" ? ("video" as const) : ("tweet" as const),
        statusId: match[2],
      }
    : { url };
}

import { routeTarget } from "./core";

export type TweetStatus = { id: string };
export type ContextSnapshot = { url?: string; page: string; at: number };

export function contextSnapshotForPage(
  value: unknown,
  page: string,
  now = Date.now(),
  maxAge = 120000,
): ContextSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<ContextSnapshot>;
  if (
    snapshot.page !== page ||
    typeof snapshot.at !== "number" ||
    !Number.isSafeInteger(snapshot.at) ||
    snapshot.at < 0 ||
    now - snapshot.at < 0 ||
    now - snapshot.at >= maxAge ||
    (snapshot.url !== undefined || "url" in snapshot) &&
      (typeof snapshot.url !== "string" || snapshot.url.length > 10000)
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
    context && now - context.at < 120000
      ? /^x:tweet:(\d+)$/i.exec(context.url || "")?.[1]
      : undefined;
  return remembered ? tweetLocator(remembered, intent) : undefined;
}

function hrefOf(link: Element | null) {
  if (!link) return undefined;
  return (link as HTMLAnchorElement).href || link.getAttribute("href") || undefined;
}

function isQuoted(element: Element) {
  return !!element.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"]');
}

function postFor(element: Element) {
  return element.closest('article[data-testid="tweet"]');
}

function ownTweetStatus(article: Element): TweetStatus | undefined {
  const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
  const own = links.filter(
    (link) => !isQuoted(link) && postFor(link) === article,
  );
  const timestamp = own.find((link) => link.querySelector("time"));
  return tweetStatus(hrefOf(timestamp || own[0]) || "");
}

export function tweetTargetFromElement(element: Element | null): TweetStatus | undefined {
  if (!element) return undefined;
  const article = postFor(element);
  if (!article) return undefined;
  const link = element.closest("a[href]");
  const direct = link && !isQuoted(link) && postFor(link) === article
    ? tweetStatus(hrefOf(link) || "")
    : undefined;
  return direct || ownTweetStatus(article);
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
  const tweet = tweetTargetFromElement(element);
  return tweet ? tweetLocator(tweet.id, "tweet") : undefined;
}

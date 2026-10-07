import { expect, test } from "bun:test";
import {
  tweetLocator,
  tweetStatus,
  tweetTargetFromElement,
  nativeContextTarget,
  mediaTargetFromElement,
  xMenuLocator,
  xMediaMenuLocator,
  youtubeTargetFromElement,
  contextSnapshotForPage,
} from "../src/site-targets";
import { menuTarget } from "../src/core";

class FixtureElement {
  children: FixtureElement[] = [];
  parent: FixtureElement | null = null;
  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
    readonly resolvedHref?: string,
  ) {}
  add(...children: FixtureElement[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
    return this;
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  get href() {
    return this.resolvedHref || this.attrs.href || "";
  }
  private matches(selector: string) {
    if (selector === "a[href]") return this.tag === "a" && !!this.attrs.href;
    if (selector === "a[href*='/status/']" || selector === 'a[href*="/status/"]')
      return this.tag === "a" && this.attrs.href?.includes("/status/");
    if (selector === "time") return this.tag === "time";
    if (selector === 'article[data-testid="tweet"]')
      return this.tag === "article" && this.attrs["data-testid"] === "tweet";
    if (selector === "div.tweet")
      return this.tag === "div" && (this.attrs.class || "").split(/\s+/).includes("tweet");
    if (selector === "video") return this.tag === "video";
    if (selector === "img") return this.tag === "img";
    if (selector === "picture") return this.tag === "picture";
    if (selector === '[data-testid="videoPlayer"]')
      return this.attrs["data-testid"] === "videoPlayer";
    if (selector === '[data-testid="videoComponent"]')
      return this.attrs["data-testid"] === "videoComponent";
    if (selector === ".tweet-media-video-overlay")
      return (this.attrs.class || "").split(/\s+/).includes("tweet-media-video-overlay");
    if (selector === ".tweet-media")
      return (this.attrs.class || "").split(/\s+/).includes("tweet-media");
    if (selector === ".tweet-body-quote")
      return (this.attrs.class || "").split(/\s+/).includes("tweet-body-quote");
    if (selector === ".tweet-time-quote")
      return (this.attrs.class || "").split(/\s+/).includes("tweet-time-quote");
    if (
      [
        "ytd-rich-item-renderer",
        "ytd-video-renderer",
        "ytd-grid-video-renderer",
        "ytd-playlist-renderer",
        "ytd-grid-playlist-renderer",
        "ytd-channel-renderer",
        "ytd-compact-video-renderer",
        "ytd-playlist-video-renderer",
      ].includes(selector)
    )
      return this.tag === selector;
    if (selector === '[data-testid="quoteTweet"]')
      return this.attrs["data-testid"] === "quoteTweet";
    if (selector === '[data-testid="card.wrapper"]')
      return this.attrs["data-testid"] === "card.wrapper";
    if (selector === "a#thumbnail[href]")
      return this.tag === "a" && this.attrs.id === "thumbnail" && !!this.attrs.href;
    if (selector === "a#video-title[href]")
      return this.tag === "a" && this.attrs.id === "video-title" && !!this.attrs.href;
    if (selector === 'a[href*="/playlist?"]')
      return this.tag === "a" && this.attrs.href?.includes("/playlist?");
    if (selector === 'a[href*="/@"]')
      return this.tag === "a" && this.attrs.href?.includes("/@");
    if (selector === 'a[href*="/channel/"]')
      return this.tag === "a" && this.attrs.href?.includes("/channel/");
    return false;
  }
  closest(selector: string): FixtureElement | null {
    let current: FixtureElement | null = this;
    while (current) {
      if (selector.split(",").some((part) => current!.matches(part.trim())))
        return current;
      current = current.parent;
    }
    return null;
  }
  querySelectorAll(selector: string) {
    const result: FixtureElement[] = [];
    const visit = (element: FixtureElement) => {
      for (const child of element.children) {
        if (selector.split(",").some((part) => child.matches(part.trim())))
          result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] || null;
  }
}
const asElement = (element: FixtureElement) => element as unknown as Element;

test("X status URLs preserve the exact numeric ID as an explicit shorthand", () => {
  const status = tweetStatus(
    "https://x.com/archivr/status/2107253221244715130?s=20",
  );
  expect(status).toEqual({ id: "2107253221244715130" });
  expect(tweetLocator(status!.id, "tweet")).toBe(
    "x:tweet:2107253221244715130",
  );
  expect(tweetLocator(status!.id, "thread")).toBe(
    "x:thread:2107253221244715130",
  );
});

test("native context resolution uses the browser-resolved relative status URL", () => {
  const article = new FixtureElement("article", { "data-testid": "tweet" });
  const timestamp = new FixtureElement(
    "a",
    { href: "/archivr/status/2107253221244715130" },
    "https://x.com/archivr/status/2107253221244715130",
  ).add(new FixtureElement("time"));
  article.add(timestamp);
  expect(tweetTargetFromElement(asElement(timestamp.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
});

test("YouTube card metadata uses a browser-resolved relative video link", () => {
  const renderer = new FixtureElement("ytd-rich-item-renderer").add(
    new FixtureElement(
      "a",
      { id: "video-title", href: "/watch?v=abcdefghi12" },
      "https://www.youtube.com/watch?v=abcdefghi12",
    ).add(new FixtureElement("span", { id: "title" })),
    new FixtureElement("div", { id: "metadata" }),
  );
  expect(
    youtubeTargetFromElement(
      "https://www.youtube.com/@archivr/videos",
      asElement(renderer.children[1]!),
    ),
  ).toBe("https://www.youtube.com/watch?v=abcdefghi12");
});

test("native X menu actions route Tweet and Thread intents without numeric coercion", () => {
  const url = "https://twitter.com/archivr/status/2107253221244715130";
  expect(xMenuLocator("tweet", url, undefined, 1000)).toBe(
    "x:tweet:2107253221244715130",
  );
  expect(
    xMenuLocator(
      "thread",
      undefined,
      { url: "x:tweet:2107253221244715130", at: 900 },
      1000,
    ),
  ).toBe("x:thread:2107253221244715130");
});

test("Tweet and Thread actions reuse a fresh quoted-video snapshot's exact ID", () => {
  const page = "https://x.com/home";
  const videoSnapshot = {
    url: "x:media:999999999999999999",
    kind: "video" as const,
    statusId: "999999999999999999",
    page,
    at: 900,
  };
  const snapshot = contextSnapshotForPage(videoSnapshot, page, 1000);

  expect(xMenuLocator("tweet", undefined, snapshot, 1000)).toBe(
    "x:tweet:999999999999999999",
  );
  expect(xMenuLocator("thread", undefined, snapshot, 1000)).toBe(
    "x:thread:999999999999999999",
  );
  expect(
    xMenuLocator(
      "tweet",
      undefined,
      contextSnapshotForPage({ ...videoSnapshot, at: 0 }, page, 200000),
      200000,
    ),
  ).toBeUndefined();
  expect(
    xMenuLocator(
      "thread",
      undefined,
      contextSnapshotForPage(
        { ...videoSnapshot, statusId: "2107253221244715130" },
        page,
        1000,
      ),
      1000,
    ),
  ).toBeUndefined();
});

test("a post action uses its own timestamp while an intentional status link wins", () => {
  const article = new FixtureElement("article", { "data-testid": "tweet" });
  const own = new FixtureElement("a", {
    href: "https://x.com/outer/status/2107253221244715130",
  }).add(new FixtureElement("time"));
  const action = new FixtureElement("div", { role: "group" });
  const quote = new FixtureElement("div", { "data-testid": "quoteTweet" }).add(
    new FixtureElement("a", {
      href: "https://x.com/quoted/status/999999999999999999",
    }).add(new FixtureElement("time")),
  );
  article.add(own, action, quote);
  const childrenBefore = article.children.length;
  expect(tweetTargetFromElement(asElement(action))).toEqual({
    id: "2107253221244715130",
  });
  expect(tweetTargetFromElement(asElement(own.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
  expect(tweetTargetFromElement(asElement(quote.children[0]!.children[0]!))).toEqual({
    id: "999999999999999999",
  });
  expect(nativeContextTarget("x", "https://x.com/home", asElement(action))).toBe(
    "x:tweet:2107253221244715130",
  );
  expect(article.children).toHaveLength(childrenBefore);
});

test("OldTwitter notification rows use data-tweet-id without numeric coercion", () => {
  const row = new FixtureElement("div", {
    class: "tweet notification",
    "data-tweet-id": "2107253221244715130",
  }).add(new FixtureElement("div", { class: "tweet-body-text" }));
  expect(tweetTargetFromElement(asElement(row.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
});

test("OldTwitter viewer uses its own relative timestamp, not a quoted timestamp", () => {
  const viewer = new FixtureElement("div", { class: "tweet tweet-view" });
  const own = new FixtureElement(
    "a",
    { class: "tweet-time", href: "/owner/status/2107253221244715130" },
    "https://x.com/owner/status/2107253221244715130",
  ).add(new FixtureElement("time"));
  const body = new FixtureElement("div", { class: "tweet-body-text" });
  const quote = new FixtureElement("div", { class: "tweet-body-quote" }).add(
    new FixtureElement(
      "a",
      { class: "tweet-time-quote", href: "/quoted/status/999999999999999999" },
      "https://x.com/quoted/status/999999999999999999",
    ).add(new FixtureElement("time")),
  );
  viewer.add(own, body, quote);
  expect(tweetTargetFromElement(asElement(body))).toEqual({ id: "2107253221244715130" });
  expect(tweetTargetFromElement(asElement(quote.children[0]!.children[0]!))).toEqual({
    id: "999999999999999999",
  });
});

test("a status link outside a tweet resolves only when it is the clicked link", () => {
  const notification = new FixtureElement("div", { class: "notification" }).add(
    new FixtureElement(
      "a",
      { href: "/owner/status/2107253221244715130" },
      "https://x.com/owner/status/2107253221244715130",
    ).add(new FixtureElement("span")),
  );
  expect(tweetTargetFromElement(asElement(notification.children[0]!.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
  expect(tweetTargetFromElement(asElement(notification))).toBeUndefined();
});

test("video capture requires an actual player and uses the quoted owner", () => {
  const outer = new FixtureElement("article", { "data-testid": "tweet" }).add(
    new FixtureElement("a", { href: "https://x.com/outer/status/2107253221244715130" }).add(new FixtureElement("time")),
    new FixtureElement("img", { class: "tweet-avatar" }),
    new FixtureElement("div", { "data-testid": "tweetPhoto" }).add(new FixtureElement("img")),
    new FixtureElement("div", { role: "group" }),
  );
  const quote = new FixtureElement("div", { "data-testid": "quoteTweet" }).add(
    new FixtureElement("a", { href: "https://x.com/quoted/status/999999999999999999" }).add(new FixtureElement("time")),
    new FixtureElement("div", { "data-testid": "videoPlayer" }).add(new FixtureElement("video")),
  );
  outer.add(quote);
  expect(mediaTargetFromElement(asElement(outer.children[1]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(outer.children[2]!.children[0]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(outer.children[3]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(quote.children[1]!.children[0]!))).toEqual({
    id: "999999999999999999",
  });
  expect(nativeContextTarget("x", "https://x.com/home", asElement(quote.children[1]!.children[0]!))).toBe(
    "x:media:999999999999999999",
  );
});

test("poster pictures and images inside video wrappers are not video targets", () => {
  const article = new FixtureElement("article", { "data-testid": "tweet" }).add(
    new FixtureElement("a", {
      href: "https://x.com/owner/status/2107253221244715130",
    }).add(new FixtureElement("time")),
    new FixtureElement("div", { "data-testid": "videoPlayer" }).add(
      new FixtureElement("video"),
      new FixtureElement("picture").add(new FixtureElement("img")),
      new FixtureElement("img", { class: "poster" }),
      new FixtureElement("div", { role: "slider" }),
    ),
    new FixtureElement("div", { "data-testid": "videoComponent" }).add(
      new FixtureElement("video"),
      new FixtureElement("img", { class: "poster" }),
    ),
    new FixtureElement("div", { class: "tweet-media-video-overlay" }).add(
      new FixtureElement("video"),
      new FixtureElement("div", { role: "slider" }),
    ),
  );
  const player = article.children[1]!;
  const component = article.children[2]!;
  const overlay = article.children[3]!;

  expect(mediaTargetFromElement(asElement(player.children[1]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(player.children[1]!.children[0]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(player.children[2]!))).toBeUndefined();
  expect(mediaTargetFromElement(asElement(component.children[1]!))).toBeUndefined();
  expect(nativeContextTarget("x", "https://x.com/home", asElement(player.children[1]!))).toBe(
    "x:tweet:2107253221244715130",
  );
  expect(mediaTargetFromElement(asElement(player.children[3]!))).toEqual({
    id: "2107253221244715130",
  });
  expect(mediaTargetFromElement(asElement(overlay.children[1]!))).toEqual({
    id: "2107253221244715130",
  });
});

test("X post media and ordinary links use the containing post instead of the link", () => {
  const article = new FixtureElement("article", { "data-testid": "tweet" });
  const timestamp = new FixtureElement("a", {
    href: "https://x.com/outer/status/2107253221244715130",
  }).add(new FixtureElement("time"));
  const media = new FixtureElement("div", { "data-testid": "tweetPhoto" }).add(
    new FixtureElement("img"),
  );
  const ordinaryLink = new FixtureElement("a", {
    href: "https://t.co/outbound",
  }).add(new FixtureElement("span"));
  article.add(timestamp, media, ordinaryLink);

  expect(tweetTargetFromElement(asElement(media.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
  expect(tweetTargetFromElement(asElement(ordinaryLink.children[0]!))).toEqual({
    id: "2107253221244715130",
  });
});

test("a clicked YouTube thumbnail on a channel resolves to its video, not the channel", () => {
  const renderer = new FixtureElement("ytd-rich-item-renderer").add(
    new FixtureElement("a", {
      id: "thumbnail",
      href: "https://www.youtube.com/watch?v=abcdefghi12&list=PL123",
    }).add(new FixtureElement("img")),
  );
  expect(
    youtubeTargetFromElement(
      "https://www.youtube.com/@archivr/videos",
      asElement(renderer.children[0]!.children[0]!),
    ),
  ).toBe("https://www.youtube.com/watch?v=abcdefghi12");
});

test("stale and reset context targets cannot turn a page click into a tweet capture", () => {
  const page = "https://x.com/home";
  expect(
    menuTarget(
      page,
      undefined,
      { url: "x:tweet:2107253221244715130", at: 900 },
      1000,
      true,
    ).locator,
  ).toBe("x:tweet:2107253221244715130");
  expect(
    menuTarget(
      page,
      undefined,
      { url: "x:tweet:2107253221244715130", at: 0 },
      200000,
      true,
    ).locator,
  ).toBe(page);
  expect(
    menuTarget(page, undefined, undefined, 1000, true).locator,
  ).toBe(page);
});

test("only a fresh snapshot for the current document can replace page targeting", () => {
  const page = "https://www.youtube.com/@archivr/videos";
  const snapshot = {
    url: "https://www.youtube.com/watch?v=abcdefghi12",
    page,
    at: 900,
  };

  // This models a service worker restarted with no in-memory context cache:
  // the content-script response is still sufficient capture truth.
  expect(contextSnapshotForPage(snapshot, page, 1000)).toEqual(snapshot);
  expect(
    menuTarget(
      page,
      undefined,
      contextSnapshotForPage(snapshot, page, 1000),
      1000,
      true,
    ).locator,
  ).toBe("https://www.youtube.com/watch?v=abcdefghi12");
  expect(
    contextSnapshotForPage({ ...snapshot, page: `${page}?changed` }, page, 1000),
  ).toBeUndefined();
  expect(contextSnapshotForPage(snapshot, page, 121000)).toBeUndefined();
  expect(
    menuTarget(
      page,
      undefined,
      contextSnapshotForPage(snapshot, page, 121000),
      121000,
      true,
    ).locator,
  ).toBe("https://www.youtube.com/@archivr");
  expect(contextSnapshotForPage({ page, at: "now" }, page, 1000)).toBeUndefined();
});

test("video menu requires a fresh matching video snapshot", () => {
  const snapshot = {
    url: "x:media:2107253221244715130",
    kind: "video" as const,
    statusId: "2107253221244715130",
    page: "https://x.com/home",
    at: 900,
  };
  expect(contextSnapshotForPage(snapshot, snapshot.page, 1000)).toEqual(snapshot);
  expect(xMediaMenuLocator(snapshot, 1000)).toBe("x:media:2107253221244715130");
  expect(xMediaMenuLocator({ ...snapshot, kind: "tweet" as const }, 1000)).toBeUndefined();
  expect(xMediaMenuLocator(snapshot, 121000)).toBeUndefined();
  expect(contextSnapshotForPage({ ...snapshot, statusId: "wrong" }, snapshot.page, 1000)).toBeUndefined();
});

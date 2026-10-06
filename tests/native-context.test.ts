import { expect, test } from "bun:test";
import {
  tweetLocator,
  tweetStatus,
  tweetTargetFromElement,
  nativeContextTarget,
  xMenuLocator,
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
    id: "2107253221244715130",
  });
  expect(nativeContextTarget("x", "https://x.com/home", asElement(action))).toBe(
    "x:tweet:2107253221244715130",
  );
  expect(article.children).toHaveLength(childrenBefore);
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

import { test, expect } from "bun:test";
import {
  normalizeOrigin,
  routeTarget,
  selectionItem,
  authorizeMessage,
  updateJob,
  isPending,
} from "../src/core";
test("normalizes explicit origins and bare host ports without guessing https", () => {
  expect(normalizeOrigin("example.com")).toBe("http://example.com");
  expect(normalizeOrigin("localhost:8080")).toBe("http://localhost:8080");
  expect(normalizeOrigin("example.com:443")).toBe("https://example.com");
  expect(normalizeOrigin("https://EXAMPLE.com/")).toBe("https://example.com");
  for (const input of [
    "https://u:p@host",
    "https://host/path",
    "https://host/?x=1",
    "file:///tmp",
    "https://host/#x",
    "https://host/../api",
  ])
    expect(() => normalizeOrigin(input)).toThrow();
});
test("clicked videos override playlist page and strip video lists", () => {
  expect(
    routeTarget(
      "https://youtube.com/playlist?list=PL123",
      "https://youtu.be/abcdefghi12?t=30",
    ),
  ).toEqual({
    kind: "url",
    locator: "https://www.youtube.com/watch?v=abcdefghi12",
  });
  expect(
    routeTarget("https://youtube.com/watch?v=abcdefghi12&list=PL1"),
  ).toEqual({
    kind: "url",
    locator: "https://www.youtube.com/watch?v=abcdefghi12",
  });
  expect(routeTarget("https://youtube.com/shorts/abcdefghi12")).toEqual({
    kind: "url",
    locator: "https://www.youtube.com/watch?v=abcdefghi12",
  });
  expect(routeTarget("https://youtube.com/@handle/videos")).toEqual({
    kind: "container",
    locator: "https://www.youtube.com/@handle",
  });
  expect(
    routeTarget(
      "https://youtube.com/watch?v=abcdefghi12",
      "https://youtube.com/playlist?list=PL1",
    ),
  ).toEqual({
    kind: "container",
    locator: "https://www.youtube.com/playlist?list=PL1",
  });
  expect(() => routeTarget("chrome://extensions")).toThrow();
});
test("X media shorthand reaches the normal URL capture route", () => {
  expect(routeTarget("https://x.com/home", "x:media:2107253221244715130")).toEqual({
    kind: "url",
    locator: "x:media:2107253221244715130",
  });
  expect(() => routeTarget("https://x.com/home", "x:media:not-an-id")).toThrow();
});
test("selected plain text preserves body and uses first nonempty line title", () => {
  expect(selectionItem("\n  Hello   world\nsecond")).toEqual({
    kind: "text",
    title: "Hello world",
    body: "\n  Hello   world\nsecond",
    mime: "text/plain",
  });
  expect(selectionItem("x".repeat(200)).title.length).toBe(80);
});
test("content scripts cannot obtain settings, pair, or submit arbitrary requests", () => {
  const content = {
    id: "id",
    url: "https://example.com/",
    tab: { id: 1 },
    frameId: 0,
  };
  const trusted = { id: "id", url: "chrome-extension://id/app.html" };
  expect(authorizeMessage({ type: "STATUS" }, content, "id")).toBe(false);
  expect(
    authorizeMessage(
      { type: "PAIR_START", origin: "http://localhost:8080" },
      content,
      "id",
    ),
  ).toBe(false);
  expect(
    authorizeMessage(
      { type: "API", method: "getCaptureOptions", args: [] },
      content,
      "id",
    ),
  ).toBe(true);
  expect(
    authorizeMessage(
      { type: "API", method: "fetch", args: ["https://evil"] },
      trusted,
      "id",
    ),
  ).toBe(false);
  expect(authorizeMessage({ type: "STATUS" }, trusted, "id")).toBe(true);
  expect(
    authorizeMessage(
      {
        type: "API",
        method: "submitCapture",
        args: ["wrong", "https://x.com"],
      },
      { ...content, id: "other" },
      "id",
    ),
  ).toBe(false);
});
test("job updates retain origin archive and terminal jobs stop polling", () => {
  const job = {
    job_uid: "job",
    origin: "http://localhost:8080",
    archiveId: "a",
    status: "pending",
    createdAt: 1,
  };
  const done = updateJob(job, {
    status: "completed",
    entry_uid: "e",
    origin: "https://evil",
    archiveId: "wrong",
  });
  expect(done.origin).toBe(job.origin);
  expect(done.archiveId).toBe("a");
  expect(isPending(done)).toBe(false);
  expect(isPending(job)).toBe(true);
});
import { validateLocator, validateText, menuTarget } from "../src/core";
test("manual capture permits Archivr public shorthands but blocks filesystem locators", () => {
  for (const value of [
    "yt:abcdefghi12",
    "x:user/status/123",
    "tweet:123",
    "https://example.com",
  ])
    expect(validateLocator(value)).toBe(value);
  for (const value of [
    "file:///tmp/private",
    "/tmp/private",
    "javascript:alert(1)",
    "data:text/plain,secret",
    "https://u:p@host",
    "yt:",
  ])
    expect(() => validateLocator(value)).toThrow();
});
test("text limits count UTF8 bytes, not JavaScript string length", () => {
  expect(validateText("a".repeat(2 * 1024 * 1024))).toBe(true);
  expect(() => validateText("é".repeat(1024 * 1024 + 1))).toThrow();
});
test("context target wins over page identity and stale targets are ignored", () => {
  const page = "https://www.youtube.com/@someone";
  expect(
    menuTarget(
      page,
      undefined,
      { url: "https://youtu.be/abcdefghi12", at: 900 },
      1000,
      true,
    ).kind,
  ).toBe("url");
  expect(
    menuTarget(
      page,
      undefined,
      { url: "https://youtu.be/abcdefghi12", at: 0 },
      200000,
      true,
    ).kind,
  ).toBe("container");
  expect(
    menuTarget(
      page,
      "https://www.youtube.com/playlist?list=PL1",
      { url: "https://youtu.be/abcdefghi12", at: 900 },
      1000,
      true,
    ).kind,
  ).toBe("container");
});
import { jobArchive } from "../src/core";
test("completed jobs open their saved archive and cannot cross the server or sender boundary", () => {
  const job = {
    job_uid: "old",
    origin: "http://server:8080",
    archiveId: "old-archive",
    status: "completed",
    createdAt: 1,
    tabId: 12,
  };
  expect(jobArchive([job], "old", "http://server:8080")).toBe("old-archive");
  expect(jobArchive([job], "old", "http://server:8080", 12)).toBe(
    "old-archive",
  );
  expect(() => jobArchive([job], "old", "https://evil")).toThrow();
  expect(() => jobArchive([job], "old", "http://server:8080", 13)).toThrow();
});
import { recoverPairing } from "../src/core";
test("worker initialization recovers an interrupted mint before returning status", () => {
  expect(
    recoverPairing({ state: "minting", origin: "http://server" }).state,
  ).toBe("ambiguous");
  expect(
    recoverPairing({ state: "waiting", origin: "http://server" }).state,
  ).toBe("waiting");
});
import {
  isSocialHost,
  sessionAppliesTo,
  storageAppliesTo,
  validateBrowserSession,
  cookieRows,
} from "../src/core";

test("isSocialHost matches exact entries and subdomains", () => {
  expect(isSocialHost("www.reddit.com")).toBe(true);
  expect(isSocialHost("reddit.com")).toBe(true);
  expect(isSocialHost("x.com")).toBe(true);
  expect(isSocialHost("old.reddit.com")).toBe(true);
  expect(isSocialHost("example.com")).toBe(false);
  expect(isSocialHost("notreddit.com")).toBe(false);
});

test("sessionAppliesTo mirrors server applicability rules", () => {
  // Same hostname
  expect(sessionAppliesTo("https://www.example.com/a", "https://www.example.com/b")).toBe(true);
  // Different subdomain
  expect(sessionAppliesTo("https://www.example.com/a", "https://example.com/b")).toBe(false);
  // X family with tweet shorthand
  expect(sessionAppliesTo("https://twitter.com/home", "tweet:tweet:123456789012345678")).toBe(true);
  expect(sessionAppliesTo("https://x.com/home", "x:123456789012345678")).toBe(true);
  // Non-X session with tweet shorthand
  expect(sessionAppliesTo("https://example.com/", "tweet:123456789012345678")).toBe(false);
  // x:media: requires exactly x.com
  expect(sessionAppliesTo("https://twitter.com/home", "x:media:123456789012345678")).toBe(false);
  expect(sessionAppliesTo("https://x.com/home", "x:media:123456789012345678")).toBe(true);
  // Unknown shorthand
  expect(sessionAppliesTo("https://example.com/", "yt:dQw4w9WgXcQ")).toBe(false);
  // YouTube URL
  expect(sessionAppliesTo("https://www.youtube.com/watch", "https://www.youtube.com/watch")).toBe(true);
});

test("storageAppliesTo requires the exact page origin", () => {
  expect(storageAppliesTo("https://example.com:8443/a", "https://example.com:8443/b")).toBe(true);
  expect(storageAppliesTo("https://example.com:8443/a", "https://example.com/b")).toBe(false);
  expect(storageAppliesTo("https://example.com:8443/a", "http://example.com:8443/b")).toBe(false);
  expect(storageAppliesTo("https://x.com/a", "x:tweet:123456789012345678")).toBe(false);
});

test("validateBrowserSession rejects cross-origin url", () => {
  expect(() =>
    validateBrowserSession(
      { url: "https://other.com/", cookies: {}, local_storage: {} },
      "https://example.com/a",
      "https://example.com/page",
    )
  ).toThrow("Browser data does not match this page.");
});

test("validateBrowserSession rejects localStorage for a different port while allowing cookies", () => {
  const session = { url: "https://example.com/a", cookies: { session: "abc" }, local_storage: { pref: "dark" } };
  expect(() => validateBrowserSession(session, "https://example.com:8443/b", "https://example.com/a"))
    .toThrow("same origin");
  expect(validateBrowserSession({ ...session, local_storage: {} }, "https://example.com:8443/b", "https://example.com/a").cookies.session)
    .toBe("abc");
});

test("validateBrowserSession rejects non-object value", () => {
  expect(() =>
    validateBrowserSession("not-an-object", "https://example.com/a", "https://example.com/page")
  ).toThrow("Invalid browser data.");
});

test("validateBrowserSession rejects 301 cookies", () => {
  const cookies: Record<string, string> = {};
  for (let i = 0; i < 301; i++) cookies[`k${i}`] = "v";
  expect(() =>
    validateBrowserSession(
      { url: "https://example.com/", cookies, local_storage: {} },
      "https://example.com/a",
      "https://example.com/page",
    )
  ).toThrow("Browser data is too large.");
});

test("validateBrowserSession returns only copied string props", () => {
  const result = validateBrowserSession(
    {
      url: "https://example.com/page",
      cookies: { session: "abc" },
      local_storage: { pref: "dark" },
      extra_field: "ignored",
    },
    "https://example.com/a",
    "https://example.com/page",
  );
  expect(result.url).toBe("https://example.com/page");
  expect(result.cookies).toEqual({ session: "abc" });
  expect(result.local_storage).toEqual({ pref: "dark" });
  expect(Object.keys(result)).not.toContain("extra_field");
});

test("validateBrowserSession keeps own __proto__ storage and cookie keys", () => {
  const result = validateBrowserSession(
    JSON.parse('{"url":"https://example.com/page","cookies":{"__proto__":"cookie"},"local_storage":{"__proto__":"stored"}}'),
    "https://example.com/a",
    "https://example.com/page",
  );
  expect(Object.keys(result.cookies)).toEqual(["__proto__"]);
  expect(Object.keys(result.local_storage)).toEqual(["__proto__"]);
  expect(result.cookies["__proto__"]).toBe("cookie");
  expect(result.local_storage["__proto__"]).toBe("stored");
});

test("cookieRows deduplicates by name keeping first occurrence", () => {
  const list = [
    { name: "session", value: "abc", domain: "example.com", path: "/secure", httpOnly: true, secure: true },
    { name: "session", value: "xyz", domain: "example.com", path: "/", httpOnly: false, secure: false },
    { name: "theme", value: "dark", domain: "example.com", path: "/", httpOnly: false, secure: false },
  ];
  const rows = cookieRows(list);
  expect(rows).toHaveLength(2);
  expect(rows[0].name).toBe("session");
  expect(rows[0].value).toBe("abc"); // first occurrence wins
  expect(rows[1].name).toBe("theme");
});

test("authorizeMessage allows BROWSER_SESSION from content top-frame sender", () => {
  const content = { id: "ext", tab: { id: 1 }, frameId: 0, url: "https://example.com/" };
  expect(authorizeMessage({ type: "BROWSER_SESSION" }, content, "ext")).toBe(true);
  // trusted sender (extension page) should NOT be allowed
  const trusted = { id: "ext", url: "chrome-extension://ext/app.html", tab: { id: 1 }, frameId: 0 };
  expect(authorizeMessage({ type: "BROWSER_SESSION" }, trusted, "ext")).toBe(false);
  // sub-frame should NOT be allowed
  const subframe = { id: "ext", tab: { id: 1 }, frameId: 1, url: "https://example.com/" };
  expect(authorizeMessage({ type: "BROWSER_SESSION" }, subframe, "ext")).toBe(false);
});

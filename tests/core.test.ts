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

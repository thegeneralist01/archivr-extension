import { expect, test } from "bun:test";
import {
  installPageMenuVisibility,
  isYoutubePage,
} from "../src/menu-visibility";

test("YouTube menu visibility recognizes supported hosts without hiding ordinary pages", () => {
  for (const url of [
    "https://youtube.com/",
    "https://www.youtube.com/watch?v=id",
    "https://m.youtube.com/shorts/id",
    "https://music.youtube.com/",
    "http://youtu.be/id",
  ])
    expect(isYoutubePage(url)).toBe(true);
  for (const url of [
    undefined,
    "https://youtube.com.example.org/",
    "https://notyoutube.com/",
    "https://youtu.be.example.org/",
    "https://example.org/?url=youtube.com",
    "chrome://extensions",
  ])
    expect(isYoutubePage(url)).toBe(false);
});

function fixture() {
  let tab: { url?: string; pendingUrl?: string } = {
    url: "https://example.org",
  };
  const callbacks: Record<string, (...args: any[]) => void> = {};
  const updates: boolean[] = [];
  const event = (name: string) => ({
    addListener: (fn: (...args: any[]) => void) => {
      callbacks[name] = fn;
    },
  });
  const api: any = {
    tabs: {
      query: async (query: any) => {
        expect(query).toEqual({ active: true, lastFocusedWindow: true });
        return [tab];
      },
      onActivated: event("activated"),
      onUpdated: event("updated"),
    },
    windows: { onFocusChanged: event("focused") },
    contextMenus: {
      update: async (id: string, props: any) => {
        expect(id).toBe("page");
        updates.push(props.visible);
      },
    },
  };
  const controller = installPageMenuVisibility(api);
  return {
    api,
    callbacks,
    updates,
    controller,
    setTab: (next: typeof tab) => {
      tab = next;
    },
  };
}

test("page menu updates on activation, navigation, focus, and unreadable ordinary tabs", async () => {
  const f = fixture();
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(true);
  f.setTab({ url: "https://www.youtube.com/watch?v=id" });
  f.callbacks.activated!({ tabId: 2, windowId: 1 });
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(false);
  f.setTab({ url: "https://example.org" });
  f.callbacks.updated!(2, { url: "https://example.org" }, { active: true });
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(true);
  f.setTab({ url: "https://m.youtube.com/@creator" });
  f.callbacks.focused!(2);
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(false);
  f.setTab({}); // No tabs permission: ordinary URLs can be omitted.
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(true);
  f.setTab({ url: "https://example.org", pendingUrl: "https://youtu.be/id" });
  await f.controller.refresh();
  expect(f.updates.at(-1)).toBe(false);
});

test("an old asynchronous visibility write cannot win a rapid tab switch", async () => {
  const f = fixture();
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.api.contextMenus.update = async (_id: string, props: any) => {
    if (!finish) {
      await new Promise<void>((resolve) => {
        finish = resolve;
        started!();
      });
    }
    f.updates.push(props.visible);
  };
  f.setTab({ url: "https://youtube.com" });
  const first = f.controller.refresh();
  await firstStarted;
  f.setTab({ url: "https://example.org" });
  const second = f.controller.refresh();
  finish!();
  await Promise.all([first, second]);
  expect(f.updates).toEqual([false, true]);
});

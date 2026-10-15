import { expect, test } from "bun:test";
import { readPageCookies, type PageCookieApi } from "../src/browser-cookies";

function cookie(name: string, value: string, path = "/") {
  return {
    name,
    value,
    domain: "marketing.creativedirector.net",
    path,
    httpOnly: true,
    secure: true,
  };
}

test("reads the sender tab's partitioned cookies alongside ordinary cookies", async () => {
  const queries: chrome.cookies.GetAllDetails[] = [];
  const api: PageCookieApi = {
    getAll: async (details) => {
      queries.push(details);
      return details.partitionKey
        ? [cookie("mz_access", "partitioned-access")]
        : [cookie("__Host-appgarden-visitor", "visitor"), cookie("__cf_bm", "challenge")];
    },
    getPartitionKey: async (details) => {
      expect(details).toEqual({ tabId: 42, frameId: 0 });
      return { partitionKey: { topLevelSite: "https://creativedirector.net", hasCrossSiteAncestor: false } };
    },
  };
  const url = "https://marketing.creativedirector.net/course#demand";
  const rows = await readPageCookies(api, url, 42, "store-for-tab");
  expect(rows.map((row) => row.name)).toEqual([
    "mz_access", "__Host-appgarden-visitor", "__cf_bm",
  ]);
  expect(queries).toEqual([
    { url, storeId: "store-for-tab" },
    {
      url,
      storeId: "store-for-tab",
      partitionKey: { topLevelSite: "https://creativedirector.net", hasCrossSiteAncestor: false },
    },
  ]);
});

test("retains longest-path precedence and prefers this partition on ties", async () => {
  const api: PageCookieApi = {
    getAll: async (details) => details.partitionKey
      ? [cookie("access", "partitioned"), cookie("session", "partitioned")]
      : [cookie("access", "specific", "/course"), cookie("session", "ordinary")],
    getPartitionKey: async () => ({ partitionKey: { topLevelSite: "https://creativedirector.net" } }),
  };
  const rows = await readPageCookies(api, "https://marketing.creativedirector.net/course", 42);
  expect(rows.find((row) => row.name === "access")?.value).toBe("specific");
  expect(rows.find((row) => row.name === "session")?.value).toBe("partitioned");
});

test("keeps ordinary cookies when partition-key lookup is unavailable or fails", async () => {
  const ordinary = [cookie("visitor", "ordinary")];
  const api: PageCookieApi = { getAll: async () => ordinary };
  expect(await readPageCookies(api, "https://example.com/", 1)).toEqual(ordinary);
  api.getPartitionKey = async () => { throw new Error("tab closed"); };
  expect(await readPageCookies(api, "https://example.com/", 1)).toEqual(ordinary);
});

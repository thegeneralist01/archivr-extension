import { cookieRows } from "./core";

type CookieRow = Parameters<typeof cookieRows>[0][number];

export type PageCookieApi = {
  getAll(details: chrome.cookies.GetAllDetails): Promise<CookieRow[]>;
  // Chrome 132+; the installed Chrome types do not declare this method yet.
  getPartitionKey?: (details: { tabId: number; frameId: number }) => Promise<{
    partitionKey: chrome.cookies.CookiePartitionKey;
  }>;
};

/** Read only cookies available to the sender tab's top-level page. */
export async function readPageCookies(
  api: PageCookieApi,
  pageUrl: string,
  tabId: number,
  storeId?: string,
): Promise<CookieRow[]> {
  const details = { url: pageUrl, ...(storeId ? { storeId } : {}) };
  const unpartitioned = await api.getAll(details);
  let partitioned: CookieRow[] = [];

  if (api.getPartitionKey) {
    try {
      const { partitionKey } = await api.getPartitionKey({ tabId, frameId: 0 });
      if (partitionKey?.topLevelSite) {
        partitioned = await api.getAll({ ...details, partitionKey });
      }
    } catch {
      // Older browsers and vanished tabs still keep the unpartitioned result.
    }
  }

  // Preserve longest-path precedence across both API results. At equal path
  // length, prefer the cookie from this tab's partition over an unpartitioned
  // cookie with the same name.
  return cookieRows(
    [...partitioned, ...unpartitioned].sort((a, b) => b.path.length - a.path.length),
  );
}

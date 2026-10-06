import type { API_METHODS } from "./core";
export type ApiMethod = (typeof API_METHODS)[number];
export type MessageFields = {
  STATUS: undefined;
  PAIR_START: { origin: string };
  PAIR_CHECK: undefined;
  SELECT_ARCHIVE: { archiveId: string };
  DISCONNECT: undefined;
  FORGET_CONNECTION: undefined;
  CURRENT_TARGET: undefined;
  CAPTURE_PAGE: undefined;
  OPEN_ARCHIVR: { jobUid?: string; locator?: string } | undefined;
  OPEN_SETTINGS: undefined;
  GET_DRAFT: { key: string };
  CAPTURE_CONTEXT: undefined;
  OPEN_TARGET: { url: string };
  CONTEXT_TARGET: { url?: string };
  GET_CONTEXT_TARGET: undefined;
  API: { method: ApiMethod; args: unknown[] };
};
export type ExtensionMessage = {
  [K in keyof MessageFields]: { type: K } & (MessageFields[K] extends undefined
    ? {}
    : MessageFields[K]);
}[keyof MessageFields];
export type ExtensionResponse<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string; status?: number };

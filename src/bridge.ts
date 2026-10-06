import type { MessageFields, ExtensionResponse, ApiMethod } from "./messages";
export async function send(type: string, fields: Record<string, unknown> = {}) {
  const result = (await chrome.runtime.sendMessage({
    type,
    ...(fields || {}),
  })) as ExtensionResponse<any>;
  if (!result?.ok) {
    const error: any = new Error(
      result?.error || "The extension is unavailable. Reload this page.",
    );
    error.status = result?.status;
    throw error;
  }
  return result.data;
}
export const captureApi: any = Object.fromEntries(
  [
    "submitCapture",
    "submitTextCapture",
    "pollCaptureJob",
    "probeCapture",
    "probePlaylist",
    "getCaptureOptions",
    "generateTextTitle",
    "deleteUpload",
  ].map((method) => [
    method,
    (...args: any[]) => send("API", { method: method as ApiMethod, args }),
  ]),
);
captureApi.uploadFile = () => ({
  promise: Promise.reject(
    new Error("File upload is available in the Archivr server UI."),
  ),
  abort: () => {},
});

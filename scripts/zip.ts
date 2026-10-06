import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const zip = Bun.spawn(
  ["zip", "-qr", "../artifacts/archivr-extension.zip", "."],
  { cwd: "dist", stdout: "inherit", stderr: "inherit" },
);
if ((await zip.exited) !== 0) throw new Error("ZIP creation failed");
console.log("artifacts/archivr-extension.zip");

import { mkdir, rm } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
// zip updates existing archives, retaining files removed by a later build.
await rm("artifacts/archivr-extension.zip", { force: true });
const zip = Bun.spawn(
  ["zip", "-qr", "../artifacts/archivr-extension.zip", ".", "-x", ".DS_Store", "*/.DS_Store"],
  { cwd: "dist", stdout: "inherit", stderr: "inherit" },
);
if ((await zip.exited) !== 0) throw new Error("ZIP creation failed");
console.log("artifacts/archivr-extension.zip");

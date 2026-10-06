import { watch } from "node:fs";
import path from "node:path";
let running = false,
  pending = false,
  timer: ReturnType<typeof setTimeout> | undefined;
async function rebuild() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  const process = Bun.spawn(["bun", "scripts/build.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await process.exited;
  running = false;
  if (pending) {
    pending = false;
    rebuild();
  }
}
function changed() {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 200);
}
for (const dir of [
  "src",
  "public",
  path.resolve(process.env.ARCHIVR_SOURCE_DIR || "../archivr/frontend/src"),
])
  watch(dir, { recursive: true }, changed);
for (const file of ["app.html", "popup.html", "manifest.json"])
  watch(file, changed);
await rebuild();
console.log(
  "Watching extension and shared frontend sources. Reload the extension in chrome://extensions after builds.",
);
await new Promise(() => {});

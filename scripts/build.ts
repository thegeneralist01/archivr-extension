import { build } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { hasRemoteCssImport, stripCssImports } from "../src/css";
// Fail before producing an unpacked extension with a malformed manifest.
JSON.parse(await readFile("manifest.json", "utf8"));
// Bun's test runner exports NODE_ENV=test to child processes. Both Vite's
// JSX transform and React must agree that this packaged build is production.
process.env.NODE_ENV = "production";
const source = path.resolve(
  process.env.ARCHIVR_SOURCE_DIR || "../archivr/frontend/src",
);
const aliases = {
  "@archivr": source,
  react: path.resolve("node_modules/react"),
  "react-dom": path.resolve("node_modules/react-dom"),
};
const common = {
  configFile: false as const,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react()],
  resolve: { alias: aliases, dedupe: ["react", "react-dom"] },
  logLevel: "info" as const,
};
await build({
  ...common,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: path.resolve("app.html"),
        popup: path.resolve("popup.html"),
        background: path.resolve("src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background"
            ? "background.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
});
await build({
  ...common,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve("src/content.ts"),
      name: "ArchivrContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
await copyFile("manifest.json", "dist/manifest.json");
// Keep runtime attribution with every unpacked/ZIP distribution.
await copyFile("LICENSE", "dist/LICENSE");
await writeFile(
  "dist/THIRD_PARTY_NOTICES.md",
  (await readFile("THIRD_PARTY_NOTICES.md", "utf8")).replaceAll(
    "(public/fonts/",
    "(fonts/",
  ),
);
// The shared stylesheet includes a web-font import. The extension only ships local assets.
for (const file of new Bun.Glob("dist/assets/*.css").scanSync(".")) {
  const css = await readFile(file, "utf8");
  const localCss = stripCssImports(css);
  if (
    /@import\b/i.test(localCss) ||
    hasRemoteCssImport(localCss) ||
    /fonts\.googleapis\.com|600&family=/i.test(localCss)
  ) {
    throw new Error(`Stylesheet ${file} still contains a remote font import.`);
  }
  await writeFile(file, localCss);
}
for (const file of new Bun.Glob("dist/**/*.{css,svg}").scanSync(".")) {
  const asset = await readFile(file, "utf8");
  if (hasRemoteCssImport(asset)) {
    throw new Error(`Public asset ${file} contains a remote font import.`);
  }
}
console.log("Load dist/ as an unpacked extension.");

const content = await readFile("dist/content.js", "utf8");
if (/process\.env\./.test(content))
  throw new Error("Content bundle contains a Node environment reference.");

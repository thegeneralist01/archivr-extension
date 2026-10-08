import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { stripCssImports, toShadowCss } from "../src/css";

const sharedStylesWithGoogleFonts = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Spectral:wght@500;600&display=swap');
:root { --ink: #20251f; }
.capture-dialog { color: var(--ink); }
.icon { background-image: url("data:image/svg+xml;utf8,<svg;fill:red</svg>"); }`;

test("removes a quoted font import without corrupting the following stylesheet", () => {
  const stripped = stripCssImports(sharedStylesWithGoogleFonts);

  expect(stripped).not.toContain("fonts.googleapis.com");
  expect(stripped.trimStart()).toStartWith(":root");
  expect(stripped).toContain("--ink: #20251f");
  expect(stripped).toContain(".capture-dialog");
  expect(stripped).toContain('url("data:image/svg+xml;utf8,<svg;fill:red</svg>")');
});

test("converts the stripped shared root to a Shadow DOM host", () => {
  const shadowCss = toShadowCss(sharedStylesWithGoogleFonts);

  expect(shadowCss).not.toContain("fonts.googleapis.com");
  expect(shadowCss.trimStart()).toStartWith(":host {");
  expect(shadowCss).toContain("--ink: #20251f");
  expect(shadowCss).toContain(".capture-dialog");
});

test("preserves ordinary CSS strings and URL data containing semicolons", () => {
  const ordinaryCss =
    '.logo { background: url("data:image/svg+xml;utf8,<svg;fill:red</svg>"); content: "@import remains text;"; }';

  expect(stripCssImports(ordinaryCss)).toBe(ordinaryCss);
});

test("does not treat @import text inside an unquoted URL as a directive", () => {
  const ordinaryCss =
    ".logo { background: url(data:text/plain,@import;not-a-directive); }";

  expect(stripCssImports(ordinaryCss)).toBe(ordinaryCss);
});

test("removes imports with semicolons inside unquoted URL data", () => {
  const css =
    "@import url(data:text/css,body{color:red;}) screen;\n:root { --ink: #20251f; }";

  expect(stripCssImports(css).trimStart()).toStartWith(":root");
});

test("ships a self-contained logo mark without remote font imports", async () => {
  const build = Bun.spawn(["bun", "scripts/build.ts"], {
    cwd: process.cwd(),
    stdout: "ignore",
    stderr: "ignore",
  });
  expect(await build.exited).toBe(0);

  for (const file of new Bun.Glob("dist/**/*.js").scanSync(".")) {
    expect(await readFile(file, "utf8")).not.toMatch(/\.jsxDEV\(/);
  }

  for (const file of ["public/logo-mark.svg", "dist/logo-mark.svg"]) {
    const svg = await readFile(file, "utf8");

    expect(svg).not.toMatch(/@import\b/i);
    expect(svg).not.toMatch(/fonts\.googleapis\.com/i);
  }
}, 30_000);

test("keeps every shared root variable and capture selector for build and dialog CSS", async () => {
  const source = path.resolve(
    process.env.ARCHIVR_SOURCE_DIR || "../archivr/frontend/src",
    "styles.css",
  );
  const sharedStyles = await readFile(source, "utf8");
  const rootVariables = [...sharedStyles.matchAll(/--[\w-]+(?=\s*:)/g)].map(
    ([variableName]) => variableName,
  );
  const captureSelectors = [
    ...new Set(sharedStyles.match(/\.capture-[\w-]+/g)),
  ];
  const buildCss = stripCssImports(sharedStyles);
  const dialogCss = toShadowCss(sharedStyles);

  expect(buildCss).not.toContain("fonts.googleapis.com");
  expect(buildCss.trimStart()).toStartWith(":root {");
  expect(dialogCss.trimStart()).toStartWith(":host {");
  for (const variableName of rootVariables) {
    expect(buildCss).toContain(variableName);
    expect(dialogCss).toContain(variableName);
  }
  for (const selector of captureSelectors) {
    expect(buildCss).toContain(selector);
    expect(dialogCss).toContain(selector);
  }
});

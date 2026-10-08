let loaded = false;

// @font-face declarations inside a ShadowRoot aren't registered by Chromium.
// Register the same local faces in the document when showing Archivr UI.
export function installFonts() {
  if (loaded) return;
  loaded = true;
  for (const [family, file] of [
    ["Cormorant Garamond", "cormorant-garamond"],
    ["Spectral", "spectral"],
  ]) {
    for (const weight of [500, 600]) {
      // Read extension-owned bytes in the isolated world. A URL-backed
      // FontFace would be subject to the host site's font-src policy.
      fetch(chrome.runtime.getURL(`fonts/${file}-${weight}.ttf`))
        .then((response) => {
          if (!response.ok) throw new Error("Bundled font unavailable");
          return response.arrayBuffer();
        })
        .then(async (bytes) => {
          const face = new FontFace(family!, bytes, {
            weight: String(weight),
            display: "swap",
          });
          await face.load();
          document.fonts.add(face);
        })
        .catch(() => {}); // Shared CSS tokens retain system fallbacks.
    }
  }
}

// src/public-path.ts (import first in src/index.tsx)
export {};
declare global {
  var __webpack_public_path__: string;
}

function detectBase(): string {
  const cfg = (window as any).config?.path;
  if (typeof cfg === "string" && cfg.startsWith("/")) {
    return cfg.endsWith("/") ? cfg : `${cfg}/`;
  }
  const m = window.location.pathname.match(/^\/[^/]+\//);
  return m?.[0] ?? "/";
}

if (process.env.NODE_ENV === "production") {
  __webpack_public_path__ = detectBase();
}

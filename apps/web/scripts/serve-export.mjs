import { readFile } from "node:fs/promises";
import { extname, join, sep } from "node:path";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
]);

function contentType(filePath) {
  const type = contentTypes.get(extname(filePath));
  return type ?? "application/octet-stream";
}

function candidateFiles(root, pathname) {
  let clean;
  try {
    clean = decodeURIComponent(pathname);
  } catch {
    return [];
  }
  const base = join(root, clean);
  if (base === root || base === root + sep) return [join(root, "index.html")];
  if (!base.startsWith(root + sep)) {
    return [];
  }
  const candidates = [base];
  if (!extname(base)) {
    candidates.push(`${base}.html`, join(base, "index.html"));
  }
  return candidates;
}

export async function serveExport(root, pathname, response) {
  for (const candidate of candidateFiles(root, pathname)) {
    try {
      const body = await readFile(candidate);
      response.writeHead(200, {
        "content-type": contentType(candidate),
        "cache-control": "no-store",
      });
      response.end(body);
      return;
    } catch {
      // Try the next candidate.
    }
  }
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end(
    `Not found: ${pathname}\nRun \`pnpm --filter @dnd/web build\` before \`playwright test\`.`,
  );
}

// Serve the static Next export for end-to-end tests: `node scripts/serve-out.mjs [dir] [port]`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 4173);

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

function candidateFiles(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0] ?? "/");
  const base = join(root, clean);
  if (!base.startsWith(root)) {
    return [];
  }
  const candidates = [base];
  if (!extname(base)) {
    candidates.push(`${base}.html`, join(base, "index.html"));
  }
  return candidates;
}

async function serveRequest(pathname, response) {
  for (const candidate of candidateFiles(pathname)) {
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  void serveRequest(url.pathname, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} at http://127.0.0.1:${port}`);
});

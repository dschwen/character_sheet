// Serve the static Next export for end-to-end tests: `node scripts/serve-out.mjs [dir] [port]`.
import { createServer } from "node:http";
import { serveExport } from "./serve-export.mjs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 4173);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  void serveExport(root, url.pathname, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} at http://127.0.0.1:${port}`);
});

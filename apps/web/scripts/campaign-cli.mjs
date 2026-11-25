import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { campaignServer, createUser, openDatabase } from "./campaign-server.mjs";
const directory = resolve(process.env.CAMPAIGN_DATA_DIR ?? ".campaign-data");
const root = resolve("apps/web/out");
if (directory === root || directory.startsWith(root + "/"))
  throw new Error("Store campaign data outside the web export.");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const db = openDatabase(resolve(directory, "campaign.sqlite"));
if (process.argv[2] === "create-user") {
  console.log(createUser(db, process.argv[3]));
  db.close();
} else {
  const port = Number(process.env.PORT ?? 4174);
  const origin = new URL(process.env.CAMPAIGN_ORIGIN ?? `http://127.0.0.1:${port}`).origin;
  campaignServer(db, { origin, root }).listen(port, "127.0.0.1", () =>
    console.log(`Campaign server listening on 127.0.0.1:${port}`),
  );
}

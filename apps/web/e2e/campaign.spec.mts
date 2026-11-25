import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { campaignServer, createUser, openDatabase } from "../scripts/campaign-server.mjs";
import { expect, openSection, savedCharacter, test } from "./support";

test("two accounts join a persistent campaign and share an independent character copy", async ({
  page,
  browser,
}, testInfo) => {
  await mkdir(testInfo.outputDir, { recursive: true });
  const file = testInfo.outputPath("campaign.sqlite");
  const db = openDatabase(file);
  const server = campaignServer(db, { root: resolve("out"), origin: undefined });
  const gmKey = createUser(db, "Morgan");
  const playerKey = createUser(db, "River");
  const guestKey = createUser(db, "Lee");
  const context = await browser.newContext();
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server port");
    const origin = "http://127.0.0.1:" + String(address.port);
    const player = await context.newPage();
    for (const [client, key] of [
      [page, gmKey],
      [player, playerKey],
    ] as const) {
      await client.goto(origin);
      await openSection(client, "Campaigns");
      await client.getByLabel("Account access key").fill(key);
      await client.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await page.getByLabel("Campaign name").fill("Moonwater");
    await page.getByRole("button", { name: "Create campaign", exact: true }).click();
    await page.getByRole("button", { name: "Create invitation", exact: true }).click();
    const code = await page.getByLabel(/Single-use invitation/).inputValue();
    await player.getByLabel("Invitation code").fill(code);
    await player.getByRole("button", { name: "Join campaign", exact: true }).click();
    await expect(player.getByRole("heading", { name: "Moonwater" })).toBeVisible();
    await expect(player.getByRole("button", { name: "Create invitation" })).toHaveCount(0);
    const original = await savedCharacter(player);
    await player.getByRole("button", { name: "Import a copy of " + original.name }).click();
    await expect(
      player.getByRole("status").filter({ hasText: "Campaign copy saved" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Refresh roster" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: original.name + " · River" }),
    ).toBeVisible();
    const home = (await (await page.request.get(origin + "/api/campaigns")).json()) as {
      campaigns: { id: string }[];
    };
    const campaignUrl = origin + "/api/campaigns/" + String(home.campaigns[0]?.id);
    const roster = (await (await page.request.get(campaignUrl)).json()) as {
      characters: { id: string }[];
    };
    const sheetUrl = campaignUrl + "/characters/" + String(roster.characters[0]?.id);
    const snapshot = (await (await page.request.get(sheetUrl)).json()) as typeof original;
    expect(snapshot).toEqual({ ...original, id: roster.characters[0]?.id });
    expect(snapshot.id).not.toEqual(original.id);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download sheet" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(original.name + ".json");
    expect(
      (
        await player.request.post(campaignUrl + "/characters", { data: { character: original } })
      ).status(),
    ).toBe(409);
    expect((await player.request.post(campaignUrl + "/invite", { data: {} })).status()).toBe(403);
    await player.getByRole("button", { name: "Sign out" }).click();
    expect((await player.request.get(sheetUrl)).status()).toBe(401);
    await player.request.post(origin + "/api/login", { data: { key: guestKey } });
    expect(await (await player.request.get(origin + "/api/campaigns")).json()).toMatchObject({
      campaigns: [],
    });
    expect((await player.request.get(sheetUrl)).status()).toBe(404);
    expect((await player.request.post(origin + "/api/join", { data: { code } })).status()).toBe(
      404,
    );
    const invite = (await (
      await page.request.post(campaignUrl + "/invite", { data: {} })
    ).json()) as {
      code: string;
    };
    db.prepare("UPDATE invitations SET expires = 0").run();
    expect(
      (await player.request.post(origin + "/api/join", { data: { code: invite.code } })).status(),
    ).toBe(404);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((done) =>
      server.close(() => {
        done();
      }),
    );
    db.close();
  }
  const reopened = openDatabase(file);
  try {
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM characters").get()).toEqual({ n: 1 });
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM members").get()).toEqual({ n: 2 });
  } finally {
    reopened.close();
  }
});

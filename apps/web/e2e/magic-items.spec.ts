import type { Page } from "@playwright/test";
import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

async function addMagicItem(page: Page, slug: string, name: string) {
  await page.getByLabel("Equipment catalog").selectOption(`srd521.magic-item.${slug}`);
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  return page.locator(".inventory-row").filter({
    has: page.getByText(name, { exact: true }),
  });
}

test("a cloak grants traced protection only while equipped and attuned", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
  const cloak = await addMagicItem(page, "cloak-of-protection", "Cloak of Protection");
  await cloak.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(armor).toHaveText("17");
  await cloak.getByRole("button", { name: "Attune", exact: true }).click();
  await expect(armor).toHaveText("18");
  await expect(cloak).toContainText("Magic active");
  await expect(page.getByText(/Attunement 1 \/ 3/u)).toBeVisible();

  await page.reload();
  await openSection(page, "Combat");
  await expect(cloak).toContainText("Attuned");
  await expect(armor).toHaveText("18");
  const active = await savedCharacter(page);
  await cloak.getByRole("button", { name: "Unequip", exact: true }).click();
  await expect(armor).toHaveText("17");
  await expect(cloak).toContainText("Attuned");
  await cloak.getByRole("button", { name: "Equip", exact: true }).click();
  const beforeRemoval = await savedCharacter(page);
  await cloak.getByRole("button", { name: "Remove Cloak of Protection", exact: true }).click();
  await expect(armor).toHaveText("17");
  expect((await savedCharacter(page)).loadout.attunedItemIds).toEqual([]);
  await openSection(page, "Play");
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(beforeRemoval);
  expect(beforeRemoval.loadout).toEqual(active.loadout);
  await expect(armor).toHaveText("18");
});

test("attunement caps at three items and equipped magic grants movement and other abilities", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const cloak = await addMagicItem(page, "cloak-of-protection", "Cloak of Protection");
  const protection = await addMagicItem(page, "ring-of-protection", "Ring of Protection");
  const feather = await addMagicItem(page, "ring-of-feather-falling", "Ring of Feather Falling");
  const manta = await addMagicItem(page, "cloak-of-the-manta-ray", "Cloak of the Manta Ray");
  const swimming = await addMagicItem(page, "ring-of-swimming", "Ring of Swimming");
  for (const row of [cloak, protection, feather]) {
    await row.getByRole("button", { name: "Attune", exact: true }).click();
  }
  await expect(page.getByText(/Attunement 3 \/ 3/u)).toBeVisible();
  const atLimit = await savedCharacter(page);
  await manta.getByRole("button", { name: "Attune", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("You can attune to at most 3 items.");
  expect(await savedCharacter(page)).toEqual(atLimit);
  const duplicate = await addMagicItem(page, "ring-of-protection", "Ring of Protection");
  await duplicate.last().getByRole("button", { name: "Attune", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("You can attune to only one copy");

  await expect(swimming.getByRole("button", { name: "Attune", exact: true })).toHaveCount(0);
  await swimming.getByRole("button", { name: "Equip", exact: true }).click();
  const swim = page.getByRole("button", { name: /^Swim speed /u }).locator("strong");
  await expect(swim).toHaveText(/^40\s*ft\./u);

  await cloak.getByRole("button", { name: "Equip", exact: true }).click();
  await cloak.getByRole("button", { name: "End attunement", exact: true }).click();
  await manta.getByRole("button", { name: "Attune", exact: true }).click();
  await manta.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(cloak.getByRole("button", { name: "Equip", exact: true })).toBeVisible();
  await expect(swim).toHaveText(/^60\s*ft\./u);
  await feather.getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  await expect(page.getByText("Magic item effects", { exact: true })).toBeVisible();
  await expect(page.getByText(/take no damage from falling\./u)).toBeVisible();
  await expect(page.getByText(/you can breathe underwater/u)).toBeVisible();
});

test("a worn Ring of Water Walking casts on the wearer without spell slots", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const ring = await addMagicItem(page, "ring-of-water-walking", "Ring of Water Walking");
  await openSection(page, "Play");
  const cast = page.getByRole("button", { name: "Cast Water Walk", exact: true });
  await expect(cast).toBeDisabled();
  await openSection(page, "Combat");
  await ring.getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  await cast.click();
  const status = page.getByRole("button", { name: "Water Walking", exact: true });
  await expect(status).toHaveAttribute("aria-pressed", "true");
  expect((await savedCharacter(page)).state.expendedSpellSlots).toEqual(
    before.state.expendedSpellSlots,
  );
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(before);
  await cast.click();
  await page.reload();
  await openSection(page, "Play");
  await expect(status).toHaveAttribute("aria-pressed", "true");
});

test("wand charges are per copy, persist, and recharge at a recorded dawn", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const name = "Wand of Magic Missiles";
  await addMagicItem(page, "wand-of-magic-missiles", name);
  const wands = await addMagicItem(page, "wand-of-magic-missiles", name);
  await wands.first().getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  const panel = page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: "Magic items", exact: true }) });
  const powers = panel.locator(".effect-action-setup");
  const first = powers.first();
  const second = powers.last();
  await expect(first).toContainText("7 / 7 charges");
  await expect(second).toContainText("7 / 7 charges");
  await first.getByLabel("Charges to spend").selectOption("3");
  const before = await savedCharacter(page);
  await first.getByRole("button", { name: "Cast Magic Missile", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("5 darts");
  await expect(first).toContainText("4 / 7 charges");
  await expect(second).toContainText("7 / 7 charges");
  expect((await savedCharacter(page)).state.expendedSpellSlots).toEqual(
    before.state.expendedSpellSlots,
  );
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(before);
  await expect(first).toContainText("7 / 7 charges");
  await first.getByRole("button", { name: "Cast Magic Missile", exact: true }).click();
  await expect(first).toContainText("4 / 7 charges");
  await page.reload();
  await openSection(page, "Play");
  await expect(first).toContainText("4 / 7 charges");
  const spent = await savedCharacter(page);
  await first.getByRole("button", { name: "Record dawn", exact: true }).click();
  await expect(first).toContainText(/[67] \/ 7 charges/u, { timeout: 20000 });
  await expect(second).toContainText("7 / 7 charges");
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(spent);
});

test("Boots of Speed require attunement and restore spent rounds on a Long Rest", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const boots = await addMagicItem(page, "boots-of-speed", "Boots of Speed");
  await boots.getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  const activate = page.getByRole("button", { name: "Activate · Bonus Action", exact: true });
  const deactivate = page.getByRole("button", { name: "Deactivate · Bonus Action", exact: true });
  const rounds = page.getByLabel("Elapsed rounds", { exact: true });
  const record = page.getByRole("button", { name: "Record rounds", exact: true });
  const speed = page.getByRole("button", { name: /^Speed /u }).locator("strong");
  await expect(activate).toBeDisabled();
  await openSection(page, "Combat");
  await boots.getByRole("button", { name: "Attune", exact: true }).click();
  await openSection(page, "Play");
  await activate.click();
  await expect(speed).toHaveText(/^60\s*ft/u);
  await expect(page.getByText("Opportunity attacks against you have Disadvantage.")).toBeVisible();
  await rounds.fill("10");
  await record.click();
  await expect(page.getByText("90 / 100 rounds remaining")).toBeVisible();
  await page.reload();
  await openSection(page, "Play");
  await expect(deactivate).toBeVisible();
  await expect(speed).toHaveText(/^60\s*ft/u);

  await openSection(page, "Combat");
  await boots.getByRole("button", { name: "Unequip", exact: true }).click();
  await expect(speed).toHaveText(/^30\s*ft/u);
  await boots.getByRole("button", { name: "Equip", exact: true }).click();
  await expect(speed).toHaveText(/^30\s*ft/u);
  await openSection(page, "Play");
  await activate.click();
  await openSection(page, "Combat");
  await boots.getByRole("button", { name: "End attunement", exact: true }).click();
  await expect(speed).toHaveText(/^30\s*ft/u);
  await boots.getByRole("button", { name: "Attune", exact: true }).click();
  await openSection(page, "Play");
  await activate.click();
  await rounds.fill("90");
  await record.click();
  await expect(speed).toHaveText(/^30\s*ft/u);
  await expect(activate).toBeDisabled();
  await expect(page.getByText("0 / 100 rounds remaining", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Take a Short Rest/u }).click();
  await expect(activate).toBeDisabled();
  const depleted = await savedCharacter(page);
  await page.getByRole("button", { name: /Take a Long Rest/u }).click();
  await expect(activate).toBeEnabled();
  await expect(page.getByText("100 / 100 rounds remaining", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(depleted);
});

test("Ring of Evasion turns a declared failed Dexterity save into a success", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  const ring = await addMagicItem(page, "ring-of-evasion", "Ring of Evasion");
  await ring.getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  const reaction = page.getByRole("combobox", { name: "Saving throw reaction", exact: true });
  await page.getByLabel("Resolve damage from a saving throw").check();
  await expect(reaction).toHaveCount(0);
  await openSection(page, "Combat");
  await ring.getByRole("button", { name: "Attune", exact: true }).click();
  await openSection(page, "Play");
  const ability = page.getByRole("combobox", { name: "Saving throw ability", exact: true });
  const outcome = page.getByRole("combobox", { name: "Saving throw outcome", exact: true });
  await ability.selectOption("constitution");
  await expect(reaction).toHaveCount(0);
  await ability.selectOption("dexterity");
  await outcome.selectOption("success");
  await expect(reaction).toHaveCount(0);
  await outcome.selectOption("failure");
  await page.getByLabel("Damage before saving throw (or healing amount)").fill("9");
  await reaction.selectOption({ label: "Ring of Evasion" });
  const before = await savedCharacter(page);
  await page.getByRole("button", { name: "Apply 4 damage", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Ring of Evasion spent 1 charge");
  const after = await savedCharacter(page);
  expect(after.state.currentHitPoints).toBe(before.state.currentHitPoints - 4);
  expect(
    after.loadout.inventory.find((item) => item.entityId.endsWith(".ring-of-evasion"))?.charges,
  ).toBe(2);
  expect(after.metadata.revision).toBe(before.metadata.revision + 1);
  const undo = page.getByRole("button", { name: /Undo last state change/u });
  await undo.click();
  expect(await savedCharacter(page)).toEqual(before);
  await reaction.selectOption({ label: "Ring of Evasion" });
  await page.getByRole("button", { name: "Use reaction for save only", exact: true }).click();
  await expect(outcome).toHaveValue("success");
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(before.state.currentHitPoints);
  await undo.click();
  await expect(outcome).toHaveValue("failure");
  await reaction.selectOption({ label: "Ring of Evasion" });
  await page.getByRole("button", { name: "Use reaction for save only", exact: true }).click();
  await page.reload();
  await openSection(page, "Play");
  await expect(page.getByText("2 / 3 charges", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record dawn", exact: true }).click();
  await expect(page.getByText("3 / 3 charges", { exact: true })).toBeVisible();
});

test("a healing potion is bought and consumed with atomic healing and Undo", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  await page.getByLabel("GP", { exact: true }).fill("100");
  await page
    .getByLabel("Equipment catalog")
    .selectOption("srd521.equipment.gear.potion-of-healing");
  await page.getByLabel("Lots", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  expect((await savedCharacter(page)).loadout.currency.gp).toBe(0);
  await openSection(page, "Play");
  await page.getByLabel("Damage or healing amount").fill("99");
  await page.getByRole("button", { name: "Heal", exact: true }).click();
  const full = await savedCharacter(page);
  await page.getByLabel("Damage or healing amount").fill("3");
  await page.getByRole("button", { name: "Apply damage", exact: true }).click();
  const wounded = await savedCharacter(page);
  const card = page.locator(".effect-action-setup").filter({ hasText: "Potion of Healing" });
  const drink = card.getByRole("button", { name: "Drink · Bonus Action", exact: true });
  const undo = page.getByRole("button", { name: /Undo last state change/u });
  await expect(card).toContainText("2 doses · 2d4 + 2 HP");
  await drink.click();
  await expect(page.locator(".notice")).toContainText("regained 3 HP", { timeout: 20000 });
  await expect(card).toContainText("1 dose ·");
  const healed = await savedCharacter(page);
  expect(healed.state.currentHitPoints).toBe(full.state.currentHitPoints);
  expect(healed.metadata.revision).toBe(wounded.metadata.revision + 1);
  await undo.click();
  expect(await savedCharacter(page)).toEqual(wounded);
  await drink.click();
  await expect(card).toContainText("1 dose ·", { timeout: 20000 });
  await page.reload();
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  await card.getByRole("button", { name: "Administer · Bonus Action", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("healing to the recipient’s sheet.", {
    timeout: 20000,
  });
  await expect(card).toHaveCount(0);
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(before.state.currentHitPoints);
  await undo.click();
  expect(await savedCharacter(page)).toEqual(before);
});

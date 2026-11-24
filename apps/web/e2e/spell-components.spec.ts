import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

const diamondId = "srd521.equipment.gear.revivify-diamond";
const pearlId = "srd521.equipment.gear.identify-pearl";

test("Revivify spends a diamond with the slot and honors the saved tracking setting", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Cleric 5");
  await openSection(page, "Combat");
  await page.getByLabel("Equipment catalog").selectOption(diamondId);
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  await openSection(page, "Play");
  const spell = page.locator(".play-spell-list > div").filter({
    has: page.getByText("Revivify", { exact: true }),
  });
  const component = spell.getByRole("checkbox", {
    name: "Use tracked Revivify Diamond (1 carried)",
  });
  await component.check();
  const before = await savedCharacter(page);
  const cast = spell.getByRole("button", { name: "Cast", exact: true });
  await cast.click();
  await expect(spell.getByRole("checkbox", { name: /0 carried/ })).toBeDisabled();
  const spent = await savedCharacter(page);
  expect(spent.loadout.inventory.some(({ entityId }) => entityId === diamondId)).toBe(false);
  expect(spent.state.expendedSpellSlots["3"]).toBe((before.state.expendedSpellSlots["3"] ?? 0) + 1);
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  expect(await savedCharacter(page)).toEqual(before);

  await component.check();
  await openSection(page, "Settings");
  const tracking = page.getByRole("checkbox", { name: "Track spell components" });
  await expect(tracking).toBeChecked();
  await tracking.uncheck();
  await page.reload();
  await openSection(page, "Settings");
  await expect(tracking).not.toBeChecked();
  await openSection(page, "Play");
  await expect(spell.getByRole("checkbox", { name: /Use tracked/ })).toHaveCount(0);
  await expect(spell).toContainText("a diamond worth 300+ GP");
  await cast.click();
  await expect(page.getByText(/Revivify was cast with a level 3 slot/)).toBeVisible();
  expect((await savedCharacter(page)).loadout.inventory).toEqual(before.loadout.inventory);

  await page.getByRole("button", { name: /Undo last state change/ }).click();
  expect((await savedCharacter(page)).settings?.spellComponentTracking).toBe(false);
  await openSection(page, "Settings");
  await tracking.check();
  await openSection(page, "Play");
  await expect(component).not.toBeChecked();
});

test("Identify reports its reusable pearl and leaves it in inventory after a ritual", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Wizard 5");
  const wizard = await savedCharacter(page);
  wizard.build.learnedSpellIds = wizard.build.learnedSpellIds.map((id) =>
    id === "srd521.spell.sleep" ? "srd521.spell.identify" : id,
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "identify-wizard.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(wizard)),
  });
  await openSection(page, "Combat");
  await page.getByLabel("Equipment catalog").selectOption(pearlId);
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  await openSection(page, "Play");
  const spell = page.locator(".play-spell-list > div").filter({
    has: page.getByText("Identify", { exact: true }),
  });
  const component = spell.getByRole("checkbox", { name: "Use tracked Identify Pearl (1 carried)" });
  await component.check();
  const before = await savedCharacter(page);
  await spell.getByRole("button", { name: "Ritual", exact: true }).click();
  await expect(
    page.getByText(/Used Identify Pearl. The component remains in inventory./).first(),
  ).toBeVisible();
  expect(await savedCharacter(page)).toEqual(before);
});

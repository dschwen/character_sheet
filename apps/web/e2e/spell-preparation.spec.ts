import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

test("Wizard preparation is spellbook-limited, bounded, cancellable, undoable and persistent", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Wizard 5");
  const before = await savedCharacter(page);
  await openSection(page, "Play");
  const lightningCast = page
    .locator(".play-spell-list > div")
    .filter({ has: page.getByText("Lightning Bolt", { exact: true }) })
    .getByRole("button", { name: "Cast", exact: true });
  await expect(lightningCast).toBeDisabled();
  await openSection(page, "Spells");
  const control = page.locator(".preparation-control");
  await expect(control).toContainText("9 / 9 chosen");
  await expect(control).toContainText("Selected from this character’s spellbook");
  const change = control.getByRole("button", { name: "Change preparation", exact: true });
  const editor = control.locator(".preparation-editor");
  const lightning = editor.getByRole("button", { name: /Lightning Bolt/ });
  const detect = editor.getByRole("button", { name: /Detect Magic/ });
  const save = editor.getByRole("button", { name: "Save preparation", exact: true });
  async function replaceSpell() {
    await change.click();
    await expect(editor.locator(".preparation-options button")).toHaveCount(17);
    await expect(editor.getByRole("button", { name: /Wish|Healing Word|Fire Bolt/ })).toHaveCount(
      0,
    );
    await expect(lightning).toBeDisabled();
    await expect(detect).toHaveAttribute("aria-pressed", "true");
    await detect.click();
    await expect(save).toBeDisabled();
    await expect(control).toContainText("8 / 9 chosen");
    await expect(lightning).toBeEnabled();
    await lightning.click();
    await expect(save).toBeEnabled();
    expect(await savedCharacter(page)).toEqual(before);
  }
  await replaceSpell();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await savedCharacter(page)).toEqual(before);
  await replaceSpell();
  await save.click();
  await expect(editor).toHaveCount(0);
  const after = await savedCharacter(page);
  expect(after.loadout).toEqual({
    ...before.loadout,
    preparedSpellIds: [
      ...before.loadout.preparedSpellIds.filter((id) => id !== "srd521.spell.detect-magic"),
      "srd521.spell.lightning-bolt",
    ],
  });
  expect({ ...after, loadout: before.loadout, metadata: before.metadata }).toEqual(before);
  expect(after.metadata.revision).toBe(before.metadata.revision + 1);
  await openSection(page, "Play");
  await expect(lightningCast).toBeEnabled();
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  await expect(lightningCast).toBeDisabled();
  expect(await savedCharacter(page)).toEqual(before);
  await openSection(page, "Spells");
  await replaceSpell();
  await save.click();
  await expect(editor).toHaveCount(0);
  const restored = await savedCharacter(page);
  await page.reload();
  await openSection(page, "Spells");
  expect(await savedCharacter(page)).toEqual(restored);
  await change.click();
  await expect(lightning).toHaveAttribute("aria-pressed", "true");
  await expect(detect).toHaveAttribute("aria-pressed", "false");
});

test("Cleric preparation offers the full legal list and keeps always-prepared spells outside its budget", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Cleric 5");
  await openSection(page, "Spells");
  const before = await savedCharacter(page);
  const control = page.locator(".preparation-control");
  await expect(control).toContainText("9 / 9 chosen");
  await expect(control).toContainText("6 additional always prepared");
  await control.getByRole("button", { name: "Change preparation", exact: true }).click();
  const editor = control.locator(".preparation-editor");
  await expect(editor.locator("button.always-prepared")).toHaveCount(6);
  const bless = editor.getByRole("button", { name: /Bless/ });
  await expect(bless).toBeDisabled();
  await expect(bless).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByRole("button", { name: /Wish|Fireball|Fire Bolt/ })).toHaveCount(0);
  const sanctuary = editor.getByRole("button", { name: /Sanctuary/ });
  await expect(sanctuary).toBeDisabled();
  await editor.getByRole("button", { name: /Bane/ }).click();
  await expect(editor.getByRole("button", { name: "Save preparation" })).toBeDisabled();
  await expect(sanctuary).toBeEnabled();
  await sanctuary.click();
  await editor.getByRole("button", { name: "Save preparation" }).click();
  await expect(editor).toHaveCount(0);
  const after = await savedCharacter(page);
  expect(after.loadout.preparedSpellIds).toEqual([
    ...before.loadout.preparedSpellIds.filter((id) => id !== "srd521.spell.bane"),
    "srd521.spell.sanctuary",
  ]);
  expect(after.loadout.preparedSpellIds).not.toContain("srd521.spell.bless");
  expect({ ...after, loadout: before.loadout, metadata: before.metadata }).toEqual(before);
  await page.reload();
  await openSection(page, "Spells");
  expect(await savedCharacter(page)).toEqual(after);
  await control.getByRole("button", { name: "Change preparation", exact: true }).click();
  await expect(bless).toBeDisabled();
  await expect(sanctuary).toHaveAttribute("aria-pressed", "true");
});

for (const className of ["Bard", "Sorcerer"]) {
  test(`${className} cannot bypass level-up-only preparation rules on the sheet`, async ({
    page,
  }) => {
    await openApp(page);
    await selectFixture(page, `${className} 5`);
    await openSection(page, "Spells");
    const before = await savedCharacter(page);
    const control = page.locator(".preparation-control");
    await expect(control).toContainText("when gaining");
    await expect(control.getByRole("button", { name: "Change preparation" })).toHaveCount(0);
    await expect(page.locator(".preparation-editor")).toHaveCount(0);
    expect(await savedCharacter(page)).toEqual(before);
  });
}

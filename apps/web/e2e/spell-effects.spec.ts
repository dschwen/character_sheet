import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

for (const [spellName, spellId, statusName, statusId] of [
  ["Bless", "srd521.spell.bless", "Blessed", "srd521.status.spell.bless"],
  [
    "Shield of Faith",
    "srd521.spell.shield-of-faith",
    "Shield of Faith",
    "srd521.status.spell.shield-of-faith",
  ],
] as const) {
  test(`${spellName} names the target status, tracks concentration and allows recipient Undo/reload`, async ({
    page,
  }) => {
    await openApp(page);
    await selectFixture(page, "Cleric 5");
    const before = await savedCharacter(page);
    await openSection(page, "Play");
    const spell = page
      .locator(".play-spell-list > div")
      .filter({ has: page.getByText(spellName, { exact: true }) });
    await spell.getByRole("combobox", { name: `Slot level for ${spellName}` }).selectOption("1");
    await spell.getByRole("button", { name: "Cast", exact: true }).click();
    const confirmation = page.locator(".cast-feedback");
    await expect(confirmation).toContainText(`Set "${statusName}" on the target's sheet.`);
    await expect(confirmation).toContainText("Concentration started");
    const cast = await savedCharacter(page);
    expect(cast.state).toEqual({
      ...before.state,
      concentrationSpellId: spellId,
      expendedSpellSlots: { ...before.state.expendedSpellSlots, "1": 3 },
    });
    expect(cast.state.activeEffectIds).not.toContain(statusId);
    await openSection(page, "Play");
    await page.getByRole("button", { name: /Undo last state change/ }).click();
    expect(await savedCharacter(page)).toEqual(before);
    await openSection(page, "Play");
    await expect(confirmation).toHaveCount(0);
    await spell.getByRole("button", { name: "Cast", exact: true }).click();
    await expect(confirmation).toContainText(`Set "${statusName}" on the target's sheet.`);
    await page.reload();
    expect((await savedCharacter(page)).state.concentrationSpellId).toBe(spellId);
    await openSection(page, "Play");
    await expect(page.getByRole("button", { name: statusName, exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Move to an independent target sheet; casting did not silently apply its status.
    await selectFixture(page, "Fighter 1");
    const targetBefore = await savedCharacter(page);
    const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
    const baseArmor = Number(await armor.textContent());
    const toggle = page.getByRole("button", { name: statusName, exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const targetAfter = await savedCharacter(page);
    expect(targetAfter.state).toEqual({
      ...targetBefore.state,
      activeEffectIds: [...targetBefore.state.activeEffectIds, statusId],
    });
    expect({ ...targetAfter, state: targetBefore.state, metadata: targetBefore.metadata }).toEqual(
      targetBefore,
    );
    if (spellName === "Shield of Faith") {
      await expect(armor).toHaveText(String(baseArmor + 2));
    } else {
      await openSection(page, "Overview");
      const saves = page
        .locator(".panel")
        .filter({ has: page.getByRole("heading", { name: "Saving throws", exact: true }) });
      await saves.getByRole("button", { name: /^Strength\b/u }).click();
      await expect(page.locator(".dice-result")).toContainText("Blessed 1d4:", { timeout: 20000 });
      expect(await savedCharacter(page)).toEqual(targetAfter);
      await openSection(page, "Play");
    }
    await page.getByRole("button", { name: /Undo last state change/ }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(await savedCharacter(page)).toEqual(targetBefore);
    await toggle.click();
    await page.reload();
    await openSection(page, "Play");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect((await savedCharacter(page)).state).toEqual(targetBefore.state);
    await expect(armor).toHaveText(String(baseArmor));
  });
}

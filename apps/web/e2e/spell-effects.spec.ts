import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

test("Mage Armor raises unarmored AC and ends when armor is donned", async ({ page }) => {
  const statusId = "srd521.status.spell.mage-armor";
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
  const chainMail = page.locator(".inventory-row").filter({ hasText: "Chain Mail" });
  const toggle = page.getByRole("button", { name: "Mage Armor", exact: true });

  await openSection(page, "Play");
  await expect(toggle).toBeDisabled();
  await openSection(page, "Combat");
  await chainMail.getByRole("button", { name: "Unequip" }).click();
  await openSection(page, "Play");
  await expect(armor).toHaveText("12");
  await toggle.click();
  await expect(armor).toHaveText("15");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await openSection(page, "Play");
  await expect(armor).toHaveText("15");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const active = await savedCharacter(page);
  await openSection(page, "Combat");
  await chainMail.getByRole("button", { name: "Equip", exact: true }).click();
  await openSection(page, "Play");
  await expect(armor).toHaveText("17");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeDisabled();
  const armored = await savedCharacter(page);
  expect(armored.state.activeEffectIds).not.toContain(statusId);
  expect(armored.metadata.revision).toBe(active.metadata.revision + 1);

  await page.getByRole("button", { name: /Undo last state change/ }).click();
  await expect(armor).toHaveText("15");
  expect(await savedCharacter(page)).toEqual(active);

  await openSection(page, "Combat");
  await chainMail.getByRole("button", { name: "Equip", exact: true }).click();
  await chainMail.getByRole("button", { name: "Unequip" }).click();
  await openSection(page, "Play");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(armor).toHaveText("12");
});

test("ending Haste replaces its benefits with lethargy until the recipient ends it", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Play");
  const speed = page.getByRole("button", { name: /^Speed /u }).locator("strong");
  const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
  const fly = page.getByRole("button", { name: /^Fly speed /u }).locator("strong");
  const haste = page.getByRole("button", { name: "Hasted", exact: true });
  await expect(speed).toHaveText(/^30\s*ft\./u);
  await page.getByRole("button", { name: "Flying", exact: true }).click();
  await expect(fly).toHaveText(/^60\s*ft\./u);
  await haste.click();
  await expect(armor).toHaveText("19");
  await expect(speed).toHaveText(/^60\s*ft\./u);
  await expect(fly).toHaveText(/^120\s*ft\./u);
  await expect(page.getByText(/one extra action to Attack/u)).toBeVisible();
  const active = await savedCharacter(page);
  await haste.click();
  await expect(armor).toHaveText("17");
  await expect(speed).toHaveText(/^0\s*ft\./u);
  await expect(fly).toHaveText(/^0\s*ft\./u);
  await expect(page.getByText("End Haste lethargy at the end of your next turn.")).toBeVisible();
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(active);
  await expect(speed).toHaveText(/^60\s*ft\./u);
  await haste.click();
  await page.reload();
  await openSection(page, "Play");
  await expect(speed).toHaveText(/^0\s*ft\./u);
  await page.getByRole("button", { name: "Haste lethargy ×", exact: true }).click();
  await expect(speed).toHaveText(/^30\s*ft\./u);
  await expect(fly).toHaveText(/^60\s*ft\./u);
  await page.getByRole("button", { name: "Flying", exact: true }).click();
  await expect(fly).toHaveCount(0);
});

test("Aid changes both HP values and preserves its slot through reload and Undo", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Play");
  const hp = page.locator(".hp-card strong");
  const toggle = page.getByRole("button", { name: "Aided", exact: true });
  const slot = page.getByRole("combobox", { name: "Aided slot level" });
  const baseline = (await hp.innerText()).match(/\d+/gu)?.map(Number) ?? [];
  await toggle.click();
  await expect(hp).toHaveText(baseline.map((value) => value + 5).join(" / "));
  await slot.selectOption("3");
  await expect(hp).toHaveText(baseline.map((value) => value + 10).join(" / "));
  await page.reload();
  await openSection(page, "Play");
  await expect(slot).toHaveValue("3");
  const active = await savedCharacter(page);
  await toggle.click();
  await expect(hp).toHaveText(baseline.join(" / "));
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(active);
  await expect(hp).toHaveText(baseline.map((value) => value + 10).join(" / "));
});

test("Guidance adds a d4 to the selected skill and clears its selection on removal", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Cleric 5");
  await openSection(page, "Play");
  await page
    .locator(".play-spell-list > div")
    .filter({ has: page.getByText("Guidance", { exact: true }) })
    .getByRole("button", { name: "Cast", exact: true })
    .click();
  const toggle = page.getByRole("button", { name: "Guided", exact: true });
  const skill = page.getByRole("combobox", { name: "Guided skill" });
  await toggle.click();
  await skill.selectOption("skill.stealth");
  await page.reload();
  await openSection(page, "Play");
  await expect(skill).toHaveValue("skill.stealth");
  await openSection(page, "Overview");
  await page.getByRole("button", { name: /^Stealth\b/u }).click();
  await expect(page.locator(".dice-result")).toContainText("Guided 1d4:", { timeout: 20000 });
  await openSection(page, "Play");
  await page.getByRole("button", { name: "End", exact: true }).click();
  expect(
    (await savedCharacter(page)).state.activeEffectSelections["srd521.status.spell.guidance"],
  ).toBeUndefined();
  await toggle.click();
  await expect(skill).toHaveValue("");
});

test("other modeled recipient statuses show their bonuses and manual instructions", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Overview");
  const stealth = page.getByRole("button", { name: /^Stealth\b/u }).locator("strong");
  const baseline = Number(await stealth.innerText());
  await openSection(page, "Play");
  const speed = page.getByRole("button", { name: /^Speed /u }).locator("strong");
  const toggle = (name: string) => page.getByRole("button", { name, exact: true });
  await toggle("Longstrider").click();
  await expect(speed).toHaveText(/^40\s*ft\./u);
  await toggle("Longstrider").click();
  await expect(speed).toHaveText(/^30\s*ft\./u);

  await toggle("Pass without Trace").click();
  await openSection(page, "Overview");
  await expect(stealth).toHaveText(`+${String(baseline + 10)}`);
  await openSection(page, "Play");
  await toggle("Pass without Trace").click();

  await toggle("Frightened").click();
  await toggle("Heroism").click();
  await expect(toggle("Frightened · suppressed")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Heroism Caster spellcasting modifier" })
    .selectOption("3");
  await toggle("Apply turn start").click();
  expect((await savedCharacter(page)).state.temporaryHitPoints).toBe(3);
  await toggle("Heroism").click();
  await expect(toggle("Frightened")).toHaveAttribute("aria-pressed", "true");

  for (const [name, instruction] of [
    ["Feather Falling", "Take no falling damage when landing."],
    ["Water Breathing", "The creature can breathe underwater and retains its normal respiration."],
    ["Protection from Evil and Good", "Incoming attacks have Disadvantage."],
  ] as const) {
    await toggle(name).click();
    await expect(page.getByText(instruction, { exact: true })).toBeVisible();
    await toggle(name).click();
    await expect(page.getByText(instruction, { exact: true })).toHaveCount(0);
  }
});

test("Barkskin, Enhance Ability, and Protection from Energy apply to the recipient", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  await page
    .locator(".inventory-row")
    .filter({ hasText: "Chain Mail" })
    .getByRole("button", { name: "Unequip" })
    .click();
  await openSection(page, "Play");
  const toggle = (name: string) => page.getByRole("button", { name, exact: true });
  const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
  await expect(armor).toHaveText("12");
  await toggle("Barkskin").click();
  await expect(armor).toHaveText("17");
  await toggle("Shield of Faith").click();
  await expect(armor).toHaveText("17");

  await toggle("Enhance Ability").click();
  const ability = page.getByRole("combobox", { name: "Enhance Ability ability" });
  await expect(ability.locator("option[value='constitution']")).toHaveCount(0);
  await ability.selectOption("dexterity");
  await toggle("Protection from Energy").click();
  const protection = page.getByRole("combobox", { name: "Protection from Energy damage type" });
  await protection.selectOption("fire");
  await page.reload();
  await openSection(page, "Play");
  await expect(ability).toHaveValue("dexterity");
  await expect(protection).toHaveValue("fire");

  await openSection(page, "Overview");
  const passivePerception = page
    .getByText("Passive perception", { exact: true })
    .locator("..")
    .locator("dd");
  const passiveBaseline = Number(await passivePerception.innerText());
  await openSection(page, "Play");
  await ability.selectOption("wisdom");
  await openSection(page, "Overview");
  await expect(passivePerception).toHaveText(String(passiveBaseline + 5));
  await openSection(page, "Play");

  const beforeDamage = await savedCharacter(page);
  const damageAmount = page.getByLabel("Damage or healing amount");
  const resistance = page.getByRole("combobox", { name: "Apply resistance to incoming damage" });
  await resistance.selectOption("fire");
  await damageAmount.fill("9007199254740992");
  await toggle("Apply damage").click();
  await expect(page.locator(".notice")).toContainText("Enter a safe whole-number damage amount");
  expect(await savedCharacter(page)).toEqual(beforeDamage);
  await damageAmount.fill("7");
  await toggle("Apply 3 damage").click();
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(
    beforeDamage.state.currentHitPoints - 3,
  );
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(beforeDamage);
  await expect(resistance).toHaveValue("");
  await page.getByLabel("Resolve damage from a saving throw").check();
  await page.getByLabel("Saving throw outcome").selectOption("success");
  await resistance.selectOption("fire");
  await toggle("Apply 1 damage").click();
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(
    beforeDamage.state.currentHitPoints - 1,
  );
  await toggle("Protection from Energy").click();
  await expect(resistance).toHaveCount(0);
});

test("Warding Bond reduces the hit and Death Ward keeps the recipient at 1 HP once", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Play");
  const toggle = (name: string) => page.getByRole("button", { name, exact: true });
  const armor = page.getByRole("button", { name: /^Armor class /u }).locator("strong");
  await expect(armor).toHaveText("17");
  await toggle("Warding Bond").click();
  await expect(armor).toHaveText("18");
  await toggle("Death Ward").click();
  await page.reload();
  await openSection(page, "Play");
  const warded = await savedCharacter(page);
  await expect(toggle("Death Ward")).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Damage or healing amount").fill("200");
  const resistance = page.getByRole("combobox", { name: "Apply resistance to incoming damage" });
  await resistance.selectOption("slashing");
  await toggle("Apply 100 damage").click();
  await expect(page.locator(".notice")).toContainText("Death Ward kept");
  await expect(page.locator(".notice")).toContainText("Apply 100 damage to the caster’s sheet.");
  await expect(toggle("Death Ward")).toHaveAttribute("aria-pressed", "false");
  const after = await savedCharacter(page);
  expect(after.state.currentHitPoints).toBe(1);
  expect(after.state.deathSaveFailures).toBe(0);
  expect(after.state.dead).not.toBe(true);

  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(warded);
  await toggle("Use against instant death").click();
  await expect(page.locator(".notice")).toContainText("Death Ward negated instant death");
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(warded.state.currentHitPoints);
  await expect(toggle("Death Ward")).toHaveAttribute("aria-pressed", "false");
  await toggle("Warding Bond").click();
  await expect(armor).toHaveText("17");
  await expect(resistance).toHaveCount(0);
});

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

import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

test("Second Wind rolls its authored die, heals once and preserves feedback until Undo", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 5");
  const before = await savedCharacter(page);
  await openSection(page, "Play");
  const action = page
    .locator(".play-action-list > div")
    .filter({ has: page.getByText("Second Wind", { exact: true }) });
  await expect(action).toContainText("Heals 1d10 + 5");
  await action.getByRole("button", { name: "Use & roll", exact: true }).click();
  const result = page.locator(".dice-result");
  await expect(result).toContainText("Second Wind · Healing", { timeout: 20000 });
  await expect(result).toContainText("1d10 rolled:");
  await expect(page.locator("canvas").first()).toHaveCSS("position", "fixed");
  const total = Number(await result.locator(".dice-face").textContent());
  expect(total).toBeGreaterThanOrEqual(6);
  expect(total).toBeLessThanOrEqual(15);
  const after = await savedCharacter(page);
  expect(after.state).toEqual({
    ...before.state,
    currentHitPoints: Math.min(44, before.state.currentHitPoints + total),
    expendedResources: {
      ...before.state.expendedResources,
      "srd521.resource.fighter.second-wind": 2,
    },
  });
  expect({ ...after, state: before.state, metadata: before.metadata }).toEqual(before);
  expect(after.metadata.revision).toBe(before.metadata.revision + 1);
  await expect(page.locator(".notice")).toContainText("Second Wind applied");
  await expect(page.locator(".notice")).toContainText(
    `Restored ${String(after.state.currentHitPoints - before.state.currentHitPoints)} HP.`,
  );
  await page.reload();
  await expect(result).toHaveCount(0);
  expect(await savedCharacter(page)).toEqual(after);
  // A fresh use is undoable as one state change, including its resource expenditure.
  await openSection(page, "Play");
  // The first roll may fill HP, which correctly disables Second Wind. Explicitly
  // take damage before testing a second use rather than relying on a low roll.
  await page
    .getByLabel("Damage or healing amount", { exact: true })
    .fill(String(after.state.temporaryHitPoints + 1));
  await page.getByRole("button", { name: "Apply damage", exact: true }).click();
  const beforeSecondUse = await savedCharacter(page);
  expect(beforeSecondUse.state.currentHitPoints).toBe(after.state.currentHitPoints - 1);
  await action.getByRole("button", { name: "Use & roll", exact: true }).click();
  await expect(result).toContainText("1d10 rolled:", { timeout: 20000 });
  await expect(action.getByRole("button", { name: "Use & roll", exact: true })).toBeDisabled();
  await openSection(page, "Play");
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  await expect(result).toHaveCount(0);
  expect(await savedCharacter(page)).toEqual(beforeSecondUse);
  await page.getByRole("button", { name: "Incapacitated", exact: true }).click();
  await openSection(page, "Play");
  await expect(action.getByRole("button", { name: "Use & roll", exact: true })).toBeDisabled();
});

test("Lay on Hands validates spending and applies bounded healing without dice", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Paladin 5");
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  const action = page
    .locator(".play-action-list > div")
    .filter({ has: page.getByText(/^Lay on Hands$/iu) });
  const amount = action.getByRole("spinbutton", { name: "Amount", exact: true });
  await amount.fill("0");
  await action.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("positive whole number");
  expect(await savedCharacter(page)).toEqual(before);
  await amount.fill("999");
  await action.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.locator(".notice")).not.toContainText("positive whole number");
  expect(await savedCharacter(page)).toEqual(before);
  await amount.fill("5");
  await action.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.locator(".notice")).toContainText(/Lay on Hands applied/iu);
  await expect(page.locator(".notice")).toContainText("Restored 5 HP.");
  const after = await savedCharacter(page);
  const resourceId = "srd521.resource.paladin.lay-on-hands";
  expect(after.state).toEqual({
    ...before.state,
    currentHitPoints: Math.min(44, before.state.currentHitPoints + 5),
    expendedResources: {
      ...before.state.expendedResources,
      [resourceId]: (before.state.expendedResources[resourceId] ?? 0) + 5,
    },
  });
  await expect(page.locator(".dice-result")).toHaveCount(0);
  expect({ ...after, state: before.state, metadata: before.metadata }).toEqual(before);
  await openSection(page, "Play");
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  expect(await savedCharacter(page)).toEqual(before);
});

test("Cure Wounds confirms the slot cost and rolls healing without automatically healing a target", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Cleric 5");
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  const spell = page
    .locator(".play-spell-list > div")
    .filter({ has: page.getByText("Cure Wounds", { exact: true }) });
  await spell.getByRole("combobox", { name: "Slot level for Cure Wounds" }).selectOption("1");
  await spell.getByRole("button", { name: "Cast", exact: true }).click();
  const confirmation = page.locator(".cast-feedback");
  await expect(confirmation).toContainText("Cure Wounds");
  await expect(confirmation).toContainText("Level 1 slot spent · 1 remaining");
  const cast = await savedCharacter(page);
  expect(cast.state).toEqual({
    ...before.state,
    expendedSpellSlots: { ...before.state.expendedSpellSlots, "1": 3 },
  });
  await confirmation.getByRole("button", { name: "Heal 2d8+6", exact: true }).click();
  const result = page.locator(".dice-result");
  await expect(result).toContainText("2d8 rolled:", { timeout: 20000 });
  const total = Number(await result.locator(".dice-face").textContent());
  expect(total).toBeGreaterThanOrEqual(8);
  expect(total).toBeLessThanOrEqual(22);
  expect(await savedCharacter(page)).toEqual(cast);
  await openSection(page, "Play");
  await page
    .getByRole("spinbutton", { name: "Damage or healing amount", exact: true })
    .fill(String(total));
  await page.getByRole("button", { name: "Heal", exact: true }).click();
  expect((await savedCharacter(page)).state.currentHitPoints).toBe(
    Math.min(38, cast.state.currentHitPoints + total),
  );
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  expect(await savedCharacter(page)).toEqual(cast);
  await page.reload();
  expect(await savedCharacter(page)).toEqual(cast);
  await expect(confirmation).toHaveCount(0);
});

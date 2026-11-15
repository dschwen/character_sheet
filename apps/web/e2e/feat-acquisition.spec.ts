import type { Locator, Page } from "@playwright/test";
import type { CharacterDocument } from "@dnd/character-model";
import { expect, levelUpOnce, openApp, test, walkBuilderSteps } from "./support";

async function start(page: Page, level: number): Promise<Locator> {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a character" });
  await dialog.getByLabel("Character name").fill("Feat Acquisition");
  const fighter = dialog
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Fighter/ });
  if ((await fighter.getAttribute("aria-pressed")) !== "true") await fighter.click();
  await dialog.getByLabel("Starting level").selectOption(String(level));
  return dialog;
}
async function featStep(dialog: Locator): Promise<Locator> {
  await dialog.getByRole("button", { name: "Continue" }).click();
  const select = dialog.getByLabel("Level 4 Feat");
  await expect(select).toBeVisible();
  return select;
}
async function choose(select: Locator, name: RegExp): Promise<void> {
  const value = await select.getByRole("option", { name }).first().getAttribute("value");
  if (value === null) throw new Error("Missing feat value");
  await select.selectOption(value);
}
async function saved(page: Page): Promise<CharacterDocument> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("dnd-character-manager.document.v1") ?? "null",
      ) as CharacterDocument,
  );
}

test("an Origin feat can occupy the level-4 grant without replacing background or species feats", async ({
  page,
}) => {
  const dialog = await start(page, 4);
  await choose(await featStep(dialog), /^Alert:/);
  await walkBuilderSteps(dialog);
  const document = await saved(page);
  expect(document.build.levels[3]?.featSelections).toEqual([
    { featId: "srd521.feat.origin.alert", abilityScoreIncreases: {} },
  ]);
  expect(document.build.featIds).toEqual(
    expect.arrayContaining([
      "srd521.feat.origin.alert",
      "srd521.feat.origin.skilled",
      "srd521.feat.origin.savage-attacker",
    ]),
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Feat Acquisition" })).toBeVisible();
  expect((await saved(page)).build).toEqual(document.build);
});

test("an additional Fighting Style is acquired separately from the class style", async ({
  page,
}) => {
  const dialog = await start(page, 4);
  await choose(
    await featStep(dialog),
    /^(Archery|Defense|Great Weapon Fighting|Two-Weapon Fighting):/,
  );
  await walkBuilderSteps(dialog);
  const document = await saved(page);
  expect(
    document.build.featIds.filter((id) => id.startsWith("srd521.feat.fighting-style.")),
  ).toHaveLength(2);
  expect(document.build.levels[3]?.featSelections?.[0]?.abilityScoreIncreases).toEqual({});
});

test("repeatable Skilled saves separate skill choices and preserves them through the next level", async ({
  page,
}) => {
  const dialog = await start(page, 4);
  await choose(await featStep(dialog), /^Skilled:/);
  const choices = dialog.getByRole("group", { name: "Skilled proficiency choices" });
  await expect(choices.locator("button.selected")).toHaveCount(3);
  await choices.locator("button.selected").last().click();
  await expect(choices.locator("button.selected")).toHaveCount(2);
  await choices
    .locator("button:not(.selected):not([disabled])")
    .filter({ hasNotText: /^Tool:/ })
    .last()
    .click();
  await expect(choices.locator("button.selected")).toHaveCount(3);
  await walkBuilderSteps(dialog);
  const before = await saved(page);
  expect(
    before.build.proficiencyChoices.skills.filter(
      (choice) => choice.sourceId === "srd521.feat.origin.skilled",
    ),
  ).toHaveLength(6);
  expect(before.build.levels[3]?.featSelections?.[0]?.skillIds).toHaveLength(3);
  await levelUpOnce(page);
  const after = await saved(page);
  expect(after.build.levels.slice(0, 4)).toEqual(before.build.levels);
  expect(after.build.proficiencyChoices).toEqual(before.build.proficiencyChoices);
});

test("new Magic Initiate during level up exposes ability and spell choices", async ({ page }) => {
  await walkBuilderSteps(await start(page, 3));
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Level up character" });
  await choose(dialog.getByLabel("Level 4 Feat"), /^Magic Initiate \(Wizard\):/);
  const ability = dialog.getByLabel("Spellcasting ability");
  await expect(ability).toBeEnabled();
  await ability.selectOption("wisdom");
  await dialog.getByLabel("Level 1 spell").selectOption("srd521.spell.magic-missile");
  await dialog.getByRole("button", { name: "Review level up" }).click();
  await dialog.getByRole("button", { name: "Apply level 4" }).click();
  await expect(dialog).toBeHidden();
  const document = await saved(page);
  expect(document.build.choices).toContainEqual({
    choiceId: "srd521.feat.origin.magic-initiate.wizard.choice.spellcasting-ability",
    optionIds: ["srd521.ability.wisdom"],
  });
  expect(document.build.choices).toContainEqual({
    choiceId: "srd521.feat.origin.magic-initiate.wizard.choice.level-one-spell",
    optionIds: ["srd521.spell.magic-missile"],
  });
});

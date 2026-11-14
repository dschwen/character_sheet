import type { CharacterDocument } from "@dnd/character-model";
import { expect, openApp, test, walkBuilderSteps } from "./support";

for (const [className, alternative] of [
  ["Paladin", "Blessed Warrior"],
  ["Ranger", "Druidic Warrior"],
] as const) {
  test(`${className} can choose its cantrip alternative and replace one cantrip on advancement`, async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole("button", { name: "New character" }).click();
    const builder = page.getByRole("dialog", { name: "Create a character" });
    await builder.getByLabel("Character name").fill(`${className} Cantrips`);
    await builder
      .getByLabel("Choose a starting class")
      .getByRole("button", { name: new RegExp(`Starting class ${className}`) })
      .click();
    await builder.getByLabel("Starting level").selectOption("2");
    const style = builder
      .locator(".skill-choice-section")
      .filter({ has: page.getByRole("heading", { name: "Choose Fighting Style", exact: true }) });
    for (const name of ["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"]) {
      await expect(
        style.getByRole("button", { name: new RegExp(`^Fighting Style ${name}`) }),
      ).toBeEnabled();
    }
    await style.getByRole("button", { name: new RegExp(`^Fighting Style ${alternative}`) }).click();
    const cantrips = builder.locator(".skill-choice-section").filter({
      has: page.getByRole("heading", { name: `Choose ${alternative} Cantrips`, exact: true }),
    });
    await expect(cantrips.locator("button.selected")).toHaveCount(2);
    await walkBuilderSteps(builder);
    const before = await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("dnd-character-manager.document.v1") ?? "null",
        ) as CharacterDocument,
    );
    expect(before.build.learnedSpellIds).toEqual([]);
    await page.reload();
    await page.getByRole("button", { name: "Level up", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Level up character" });
    const replacement = dialog
      .locator(".skill-choice-section")
      .filter({ has: page.getByRole("heading", { name: `${alternative} Cantrips`, exact: true }) });
    await expect(replacement.locator("button.selected")).toHaveCount(2);
    await replacement.locator("button.selected").last().click();
    await expect(replacement.locator("button.selected")).toBeDisabled();
    await replacement.locator("button:not(.selected):not([disabled])").last().click();
    await expect(replacement.locator("button.selected")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Review level up" }).click();
    await dialog.getByRole("button", { name: "Apply level 3" }).click();
    await expect(dialog).toBeHidden();
    const after = await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("dnd-character-manager.document.v1") ?? "null",
        ) as CharacterDocument,
    );
    expect(after.build.levels).toHaveLength(3);
    expect(after.state).toEqual(before.state);
    const choices = (document: CharacterDocument) =>
      document.build.levels.flatMap((level) => level.selectedFeatureChoices);
    const parentId = `srd521.choice.${className.toLowerCase()}.fighting-style`;
    expect(choices(before).find((choice) => choice.choiceId === parentId)).toBeDefined();
    expect(choices(after).find((choice) => choice.choiceId === parentId)).toEqual(
      choices(before).find((choice) => choice.choiceId === parentId),
    );
    expect(choices(after)).not.toEqual(choices(before));
  });
}

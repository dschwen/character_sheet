import type { CharacterDocument } from "@dnd/character-model";
import type { Page } from "@playwright/test";
import { expect, openApp, openSection, selectFixture, test, walkBuilderSteps } from "./support";

const storageKey = "dnd-character-manager.document.v1";
async function saved(page: Page): Promise<CharacterDocument> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null") as CharacterDocument,
    storageKey,
  );
}

test("legacy Fighter tools require confirmation, preserve the save and support Undo", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  const before = await saved(page);
  expect(before.build.toolProficiencyChoices).toBeUndefined();
  const open = page.getByRole("button", { name: "Record missing tool choices", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Record missing tool choices" });
  await expect(dialog.getByRole("button", { name: "Apply tool choices" })).toBeDisabled();
  await expect(dialog.locator("button.selected")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Tool: Dragonchess", exact: true }).click();
  expect(await dialog.evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await saved(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await saved(page)).toEqual(before);
  await open.click();
  await expect(dialog.locator("button.selected")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await open.click();
  await dialog.getByRole("button", { name: "Tool: Dragonchess", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply tool choices" }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeHidden();
  const after = await saved(page);
  expect(after.build.toolProficiencyChoices).toContainEqual({
    sourceId: "srd521.background.soldier",
    toolIds: ["srd521.tool.dragonchess"],
  });
  expect({
    ...after,
    build: { ...after.build, toolProficiencyChoices: undefined },
    metadata: before.metadata,
  }).toEqual(before);
  await openSection(page, "Play");
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  await openSection(page, "Overview");
  await expect(open).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await open.click();
  await dialog.getByRole("button", { name: "Tool: Dragonchess", exact: true }).click();
  await dialog.getByRole("button", { name: "Apply tool choices" }).click();
  await page.reload();
  await expect(open).toBeHidden();
  await expect(page.getByRole("button", { name: /Dragonchess · intelligence/ })).toBeVisible();
});

for (const className of ["Bard", "Monk"]) {
  test(`legacy ${className} class tools can be recorded at the supported level cap`, async ({
    page,
  }) => {
    await openApp(page);
    await page.getByRole("button", { name: "New character" }).click();
    const builder = page.getByRole("dialog", { name: "Create a character" });
    await builder.getByLabel("Character name").fill(`Legacy ${className}`);
    await builder
      .getByLabel("Choose a starting class")
      .getByRole("button", { name: new RegExp(`Starting class ${className}`) })
      .click();
    const levelPicker = builder.getByLabel("Starting level");
    const maximum = await levelPicker.locator("option").last().getAttribute("value");
    if (!maximum) throw new Error("No supported starting levels");
    await levelPicker.selectOption(maximum);
    await walkBuilderSteps(builder);
    // Simulate a pre-tool-catalog save without assigning any new proficiencies.
    await page.evaluate((key) => {
      const character = JSON.parse(localStorage.getItem(key) ?? "null") as CharacterDocument;
      delete character.build.toolProficiencyChoices;
      localStorage.setItem(key, JSON.stringify(character));
    }, storageKey);
    await page.reload();
    const before = await saved(page);
    await page.getByRole("button", { name: "Record missing tool choices", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Record missing tool choices" });
    const group = dialog.getByRole("group", { name: `${className} missing tools`, exact: true });
    for (const tool of ["Lute", "Horn", "Flute"].slice(0, className === "Bard" ? 3 : 1))
      await group.getByRole("button", { name: `Tool: ${tool}`, exact: true }).click();
    await dialog
      .getByRole("group", { name: "Soldier missing tools", exact: true })
      .getByRole("button", { name: "Tool: Dragonchess", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Apply tool choices" }).click();
    await expect(dialog).toBeHidden();
    const after = await saved(page);
    expect(after.build.levels).toEqual(before.build.levels);
    expect(after.build.proficiencyChoices).toEqual(before.build.proficiencyChoices);
    expect(after.state).toEqual(before.state);
    expect(after.loadout).toEqual(before.loadout);
    await page.reload();
    await expect(page.getByRole("button", { name: /Lute · charisma/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record missing tool choices", exact: true }),
    ).toHaveCount(0);
    // A higher-level old save without feat history must not invent original grants.
    await page.evaluate(
      ({ key, character }) => {
        const acquisitionLevel = character.build.levels.find(
          (level) => level.featSelections?.length,
        );
        if (!acquisitionLevel) throw new Error("Missing acquisition history in test character");
        delete acquisitionLevel.featSelections;
        localStorage.setItem(key, JSON.stringify(character));
      },
      { key: storageKey, character: before },
    );
    await page.reload();
    await page.getByRole("button", { name: "Record missing tool choices", exact: true }).click();
    await expect(dialog.getByLabel("Tool choice issues")).toContainText("ambiguous");
    await expect(dialog.getByRole("button", { name: "Apply tool choices" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: /^Tool:/ })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
}

import type { CharacterDocument } from "@dnd/character-model";
import type { Page } from "@playwright/test";
import { expect, levelUpOnce, openApp, test, walkBuilderSteps } from "./support";

async function start(page: Page, className: string, level: number) {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await builder.getByLabel("Character name").fill(`${className} Tools`);
  const button = builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: new RegExp(`Starting class ${className}`) });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await builder.getByLabel("Starting level").selectOption(String(level));
  return builder;
}
async function saved(page: Page): Promise<CharacterDocument> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("dnd-character-manager.document.v1") ?? "null",
      ) as CharacterDocument,
  );
}

for (const className of ["Bard", "Monk"]) {
  test(`${className} tool pools and mixed Skilled choices survive reload and advancement`, async ({
    page,
  }) => {
    const builder = await start(page, className, 1);
    await builder.getByRole("button", { name: "Continue" }).click();
    await builder.getByRole("button", { name: "Continue" }).click();
    const classTools = builder.getByRole("group", {
      name: `${className} tool choices`,
      exact: true,
    });
    await expect(classTools.getByRole("button")).toHaveCount(className === "Bard" ? 10 : 27);
    if (className === "Bard") await classTools.locator("button.selected").last().click();
    await classTools.getByRole("button", { name: "Tool: Lute", exact: true }).click();
    const background = builder.getByRole("group", { name: "Soldier tool choices", exact: true });
    await background.getByRole("button", { name: "Tool: Dragonchess", exact: true }).click();
    const origin = builder.getByRole("group", {
      name: "Skilled origin proficiency choices",
      exact: true,
    });
    const count = className === "Monk" ? 3 : 1;
    for (let index = 0; index < count; index++)
      await origin.locator("button.selected").last().click();
    for (const name of ["Horn", "Flute", "Viol"].slice(0, count))
      await origin.getByRole("button", { name: `Tool: ${name}`, exact: true }).click();
    await expect(origin.locator("button.selected")).toHaveCount(3);
    await expect(origin.getByRole("button", { name: "Tool: Lute", exact: true })).toHaveCount(0);
    await walkBuilderSteps(builder);
    const before = await saved(page);
    expect(
      before.build.toolProficiencyChoices?.find(
        ({ sourceId }) => sourceId === "srd521.background.soldier",
      )?.toolIds,
    ).toEqual(["srd521.tool.dragonchess"]);
    expect(
      before.build.toolProficiencyChoices?.find(
        ({ sourceId }) => sourceId === "srd521.feat.origin.skilled",
      )?.toolIds,
    ).toHaveLength(count);
    await page.reload();
    await expect(page.getByRole("button", { name: /Horn · charisma/ })).toBeVisible();
    await page.getByRole("button", { name: /Horn · charisma/ }).click({ modifiers: ["Shift"] });
    const trace = page.getByRole("dialog", { name: "Calculation trace" });
    await expect(trace).toContainText("93");
    await expect(trace).toContainText("94");
    await trace.getByRole("button", { name: "Close calculation trace" }).click();
    await levelUpOnce(page);
    expect((await saved(page)).build.toolProficiencyChoices).toEqual(
      before.build.toolProficiencyChoices,
    );
  });
}

test("Skilled acquired at level 4 can mix skills/tools and locks earlier acquisitions", async ({
  page,
}) => {
  await walkBuilderSteps(await start(page, "Fighter", 3));
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Level up character" });
  const select = dialog.getByLabel("Level 4 Feat");
  const value = await select.getByRole("option", { name: /^Skilled:/ }).getAttribute("value");
  if (!value) throw new Error("Missing Skilled option");
  await select.selectOption(value);
  const choices = dialog.getByRole("group", { name: "Skilled proficiency choices", exact: true });
  await choices.locator("button.selected").last().click();
  await choices.getByRole("button", { name: "Tool: Lute", exact: true }).click();
  await expect(choices.getByRole("button", { name: "Tool: Horn", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Review level up" }).click();
  await dialog.getByRole("button", { name: "Apply level 4" }).click();
  await expect(dialog).toBeHidden();
  const before = await saved(page);
  expect(before.build.levels[3]?.featSelections?.[0]?.skillIds).toHaveLength(2);
  expect(before.build.levels[3]?.featSelections?.[0]?.toolIds).toEqual(["srd521.tool.lute"]);
  await levelUpOnce(page);
  expect((await saved(page)).build.levels.slice(0, 4)).toEqual(before.build.levels);
});

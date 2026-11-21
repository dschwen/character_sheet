import {
  expect,
  levelUpOnce,
  openApp,
  openSection,
  savedCharacter,
  selectFixture,
  test,
  walkBuilderSteps,
} from "./support";

const landChoice = "srd521.choice.druid.circle-of-land";
const landId = (name: string) => `srd521.option.druid.land.${name}`;

test("Scholar offers Expertise from Skilled and preserves it through reload and advancement", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await builder.getByLabel("Character name").fill("History Scholar");
  await builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Wizard/ })
    .click();
  await builder.getByLabel("Starting level").selectOption("2");
  await builder.getByRole("button", { name: "Continue", exact: true }).click();
  await builder.getByRole("button", { name: "Continue", exact: true }).click();
  const skilled = builder.getByRole("group", {
    name: "Skilled origin proficiency choices",
    exact: true,
  });
  const history = skilled.getByRole("button", { name: "History", exact: true });
  if ((await history.getAttribute("aria-pressed")) !== "true") {
    await skilled.locator("button.selected").last().click();
    await history.click();
  }
  const expertise = builder
    .locator(".skill-choice-section")
    .filter({ has: page.getByRole("heading", { name: "Choose 1 Expertise skill", exact: true }) });
  await expect(expertise.getByRole("button", { name: "History", exact: true })).toBeEnabled();
  await expertise.locator("button.selected").click();
  await expertise.getByRole("button", { name: "History", exact: true }).click();
  await expect(expertise.getByRole("button", { name: "History", exact: true })).toHaveClass(
    "selected",
  );
  await walkBuilderSteps(builder);
  const before = await savedCharacter(page);
  expect(before.build.proficiencyChoices.skills).toContainEqual({
    skillId: "srd521.skill.history",
    sourceId: "srd521.feat.origin.skilled",
  });
  expect(before.build.proficiencyChoices.expertise).toEqual([
    { skillId: "srd521.skill.history", sourceId: "srd521.class-feature.wizard.scholar" },
  ]);
  await page.reload();
  const skills = page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: "Skills & tools", exact: true }) });
  await skills.getByRole("button", { name: /^History / }).click({ modifiers: ["Shift"] });
  const trace = page.getByRole("dialog", { name: "Calculation trace" });
  await expect(trace).toContainText("Scholar");
  await expect(trace).toContainText("78");
  await trace.getByRole("button", { name: "Close calculation trace" }).click();
  await levelUpOnce(page);
  const after = await savedCharacter(page);
  expect(after.build.proficiencyChoices.expertise).toEqual(
    before.build.proficiencyChoices.expertise,
  );
  expect(after.build.levels.slice(0, 2)).toEqual(before.build.levels);
  expect(after.state).toEqual(before.state);
  // Imported malformed selections are reported, never silently corrected to a default skill.
  const invalid = structuredClone(after);
  invalid.build.proficiencyChoices.expertise = [
    { skillId: "srd521.skill.athletics", sourceId: "srd521.class-feature.wizard.scholar" },
  ];
  await page.getByLabel("Import a character JSON file", { exact: true }).setInputFiles({
    name: "invalid-scholar.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator(".notice")).toContainText("Imported");
  await page
    .getByRole("navigation", { name: "Character sheet sections" })
    .getByRole("button", { name: /^Diagnostics(?: \d+)?$/u })
    .click();
  await expect(page.getByText("EXPERTISE_CHOICE_NOT_ALLOWED", { exact: true })).toBeVisible();
  expect((await savedCharacter(page)).build.proficiencyChoices.expertise).toEqual(
    invalid.build.proficiencyChoices.expertise,
  );
  invalid.build.proficiencyChoices.expertise = [];
  await page.getByLabel("Import a character JSON file", { exact: true }).setInputFiles({
    name: "missing-scholar.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator(".notice")).toContainText("Imported");
  await expect
    .poll(async () => (await savedCharacter(page)).build.proficiencyChoices.expertise)
    .toEqual([]);
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const levelUp = page.getByRole("dialog", { name: "Level up character" });
  await levelUp.getByRole("button", { name: "Review level up", exact: true }).click();
  await expect(levelUp.locator(".builder-issues")).toContainText(
    "Existing Expertise records must match their granted counts",
  );
  await expect(levelUp.getByRole("button", { name: "Apply level 4", exact: true })).toBeDisabled();
  expect((await savedCharacter(page)).build.proficiencyChoices.expertise).toEqual([]);
});

test("Circle land changes only on a Long Rest and supports Undo, spell-pool reload and advancement", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Druid 5");
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  const picker = page.getByRole("combobox", { name: /Circle Of Land · choose for your next rest/ });
  await expect(picker).toHaveValue(landId("polar"));
  await picker.selectOption(landId("tropical"));
  expect(await savedCharacter(page)).toEqual(before);
  await page.getByRole("button", { name: /Take a Short Rest/ }).click();
  await expect(page.locator(".notice")).toContainText("Short Rest applied");
  await expect(picker).toHaveValue(landId("polar"));
  const afterShort = await savedCharacter(page);
  expect(afterShort.build).toEqual(before.build);
  await picker.selectOption(landId("tropical"));
  await page.getByRole("button", { name: /Take a Long Rest/ }).click();
  await expect(picker).toHaveValue(landId("tropical"));
  const after = await savedCharacter(page);
  expect(after.loadout).toEqual(before.loadout);
  expect({ ...after.build, levels: before.build.levels }).toEqual(before.build);
  expect(
    after.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .find(({ choiceId }) => choiceId === landChoice)?.optionIds,
  ).toEqual([landId("tropical")]);
  await page.getByRole("button", { name: /Undo last state change/ }).click();
  await expect(picker).toHaveValue(landId("polar"));
  expect(await savedCharacter(page)).toEqual(afterShort);
  await picker.selectOption(landId("tropical"));
  await page.getByRole("button", { name: /Take a Long Rest/ }).click();
  await expect(picker).toHaveValue(landId("tropical"));
  const saved = await savedCharacter(page);
  await page.reload();
  await openSection(page, "Spells");
  await page.getByRole("button", { name: "Change preparation", exact: true }).click();
  const preparation = page.locator(".preparation-editor");
  await expect(
    preparation.locator("button.always-prepared").filter({ hasText: "Stinking Cloud" }),
  ).toHaveCount(1);
  await expect(
    preparation.locator("button.always-prepared").filter({ hasText: "Sleet Storm" }),
  ).toHaveCount(0);
  await preparation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await savedCharacter(page)).toEqual(saved);
  await levelUpOnce(page);
  expect((await savedCharacter(page)).build.levels.slice(0, 5)).toEqual(saved.build.levels);
});

test("a land/preparation collision requires an explicit spell replacement before the rest commits", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await builder.getByLabel("Character name").fill("Land Conflict");
  await builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Druid/ })
    .click();
  await builder.getByLabel("Starting level").selectOption("5");
  await walkBuilderSteps(builder);
  await openSection(page, "Play");
  const before = await savedCharacter(page);
  expect(before.loadout.preparedSpellIds).toContain("srd521.spell.fog-cloud");
  const picker = page.getByRole("combobox", { name: /Circle Of Land · choose for your next rest/ });
  await picker.selectOption(landId("polar"));
  await page.getByRole("button", { name: /Take a Long Rest/ }).click();
  await expect(page.locator(".notice")).toContainText("Replace conflicting ordinary preparations");
  expect(await savedCharacter(page)).toEqual(before);
  await openSection(page, "Spells");
  await page.getByRole("button", { name: "Change preparation", exact: true }).click();
  const editor = page.locator(".preparation-editor");
  await editor.getByRole("button", { name: /Fog Cloud/ }).click();
  await editor
    .locator(".preparation-options button:not(.selected):not(.always-prepared):not([disabled])")
    .filter({ hasNotText: /Fog Cloud|Hold Person|Sleet Storm/ })
    .first()
    .click();
  await editor.getByRole("button", { name: "Save preparation", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const explicit = await savedCharacter(page);
  await openSection(page, "Play");
  await picker.selectOption(landId("polar"));
  await page.getByRole("button", { name: /Take a Long Rest/ }).click();
  await expect(page.locator(".notice")).toContainText("Long Rest applied");
  await expect(picker).toHaveValue(landId("polar"));
  expect((await savedCharacter(page)).loadout).toEqual(explicit.loadout);
});

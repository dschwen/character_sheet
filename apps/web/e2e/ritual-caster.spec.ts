import type { Locator, Page } from "@playwright/test";

import { CHARACTER_NAME, expect, openApp, openSection, test, walkBuilderSteps } from "./support";

const variant2014 = "Ritual Caster (2014 PHB variant)";
const variant2024 = "Ritual Caster (2024 PHB variant)";

async function startWizardBuilder(page: Page): Promise<Locator> {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await expect(builder).toBeVisible();
  await builder.getByLabel("Character name").fill(CHARACTER_NAME);
  const wizardChoice = builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Wizard/ });
  if ((await wizardChoice.getAttribute("aria-pressed")) !== "true") {
    await wizardChoice.click();
  }
  await builder.getByLabel("Starting level").selectOption("4");
  return builder;
}

// The builder presents General feats in the Level 4 Feat select on the ability step.
async function advanceToFeatStep(builder: Locator): Promise<void> {
  for (let guard = 0; guard < 8; guard += 1) {
    const featSelect = builder.getByLabel("Level 4 Feat");
    if ((await featSelect.count()) > 0) {
      await expect(featSelect).toBeVisible();
      return;
    }
    const next = builder.getByRole("button", { name: "Continue" });
    await expect(next).toBeEnabled();
    await next.click();
  }
  throw new Error("The builder never rendered the Level 4 feat select.");
}

// Enumerate the select's own options so the variant is picked by name, not by position.
async function pickFeatOption(builder: Locator, needle: string): Promise<void> {
  const featSelect = builder.getByLabel("Level 4 Feat");
  const labels = await featSelect.locator("option").allTextContents();
  const index = labels.findIndex((label) => label.includes(needle));
  if (index < 0) {
    throw new Error(`No feat option matching '${needle}'. Options: ${labels.join(", ")}`);
  }
  await featSelect.selectOption({ index });
}

// The book editor is the only builder subsection whose text names the variant record; a
// filter({ has }) locator chain does not re-root as expected against this app's DOM.
function bookSection(dialog: Locator, variantName: string): Locator {
  return dialog.locator(".builder-subsection").filter({ hasText: variantName });
}

async function selectedSpellNames(grid: Locator): Promise<string[]> {
  const names = await grid.locator("button.selected").allTextContents();
  return names.map((name) => name.trim());
}

// The app keeps the book within its bounds: while the count is at the cap, over-cap tokens are
// disabled, so a swap first removes one selection and then picks another.
async function swapOneSpell(grid: Locator): Promise<string> {
  await grid.locator("button.selected").last().click();
  await expect(grid.locator("button.selected")).toHaveCount(1);
  const replacement = grid.locator("button:not(.selected):not([disabled])").first();
  const name = ((await replacement.textContent()) ?? "").trim();
  await replacement.click();
  await expect(grid.locator("button.selected")).toHaveCount(2);
  return name;
}

async function applyLevelUp(levelUp: Locator, level: number): Promise<void> {
  const review = levelUp.getByRole("button", { name: "Review level up" });
  if (await review.isVisible()) {
    await review.click();
  } else {
    const rail = levelUp.getByRole("complementary", { name: "Level-up progress" });
    await rail.getByRole("button", { name: "Review", exact: true }).first().click();
  }
  const apply = levelUp.getByRole("button", {
    name: new RegExp(`Apply level ${String(level)}\\b`),
  });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(levelUp).toBeHidden();
}

// The rendered sheet attributes each grant to its variant record: the entry carries the variant
// name badge (ADR 0013) and the casting affordance the engine attached to that source.
async function expectGrantedSpell(
  page: Page,
  spellName: string,
  variantName: string,
  badge: string,
): Promise<void> {
  const entry = page
    .locator(".spell-list > div")
    .filter({ hasText: spellName })
    .filter({ hasText: variantName });
  await expect(entry.first()).toBeVisible();
  await expect(entry.first().getByText(variantName, { exact: true })).toBeVisible();
  await expect(entry.first().getByText(badge, { exact: true })).toBeVisible();
}

test("the 2024 PHB variant fills the book at the Proficiency Bonus and grows only when it rises", async ({
  page,
}) => {
  const builder = await startWizardBuilder(page);
  await advanceToFeatStep(builder);
  await pickFeatOption(builder, variant2024);

  const book = bookSection(builder, variant2024);
  await expect(book).toBeVisible();
  // The 2024 variant draws from every Ritual-tagged spell, so it has no class-list picker.
  await expect(builder.getByLabel("Spell list class")).toHaveCount(0);
  await expect(book.getByText("Level 1 Ritual-tagged spells")).toBeVisible();
  await expect(book.getByText(/Out-of-SRD edition reference: 2024/)).toBeVisible();

  const grid = book.locator(".builder-token-grid").first();
  // Choosing the feat auto-fills exactly to the Proficiency Bonus at acquisition (2 at level 4).
  expect(await selectedSpellNames(grid)).toHaveLength(2);
  const swappedIn = await swapOneSpell(grid);
  const chosenNames = await selectedSpellNames(grid);
  expect(chosenNames).toContain(swappedIn);

  await walkBuilderSteps(builder);
  await expect(page.getByRole("heading", { level: 1, name: CHARACTER_NAME })).toBeVisible();

  await openSection(page, "Spells");
  for (const name of chosenNames) await expectGrantedSpell(page, name, variant2024, "Prepared");

  // Level 4 to 5 raises the Proficiency Bonus: the level-up locks earlier selections and opens
  // exactly one new one, which is enough to apply cleanly.
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const levelUp = page.getByRole("dialog", { name: "Level up character" });
  await expect(levelUp).toBeVisible();
  const levelBook = bookSection(levelUp, variant2024);
  await expect(
    levelBook.getByText("Earlier selections are locked; this level opens 1 new selection."),
  ).toBeVisible();
  const levelGrid = levelBook.locator(".builder-token-grid").first();
  await expect(levelGrid.locator("button.selected")).toHaveCount(2);
  await expect(levelGrid.locator("button.selected").first()).toBeDisabled();
  const grown = levelGrid.locator("button:not(.selected):not([disabled])").first();
  const grownName = ((await grown.textContent()) ?? "").trim();
  await grown.click();
  await expect(levelGrid.locator("button.selected")).toHaveCount(3);
  await applyLevelUp(levelUp, 5);

  await openSection(page, "Spells");
  for (const name of [...chosenNames, grownName]) {
    await expectGrantedSpell(page, name, variant2024, "Prepared");
  }
});

test("the 2014 PHB variant fixes its class list and book, and they survive a level up untouched", async ({
  page,
}) => {
  const builder = await startWizardBuilder(page);
  await advanceToFeatStep(builder);
  await pickFeatOption(builder, variant2014);

  const book = bookSection(builder, variant2014);
  await expect(book).toBeVisible();
  await expect(book.getByText("exactly two")).toBeVisible();
  await expect(book.getByText(/Out-of-SRD edition reference: 2014/)).toBeVisible();

  // The class list defaults to the character's own class and bounds the pool to that list.
  const classSelect = book.getByLabel("Spell list class");
  await expect(classSelect).toBeVisible();
  const classValue = await classSelect.evaluate((element) => (element as HTMLSelectElement).value);
  expect(classValue).toBe("srd521.class.wizard");
  const grid = book.locator(".builder-token-grid").first();
  // A Wizard list ritual that no other class list shares proves the pool is class-bounded.
  await expect(grid.getByText("Find Familiar")).toBeVisible();
  expect(await selectedSpellNames(grid)).toHaveLength(2);
  const swappedIn = await swapOneSpell(grid);
  const chosenNames = await selectedSpellNames(grid);
  expect(chosenNames).toContain(swappedIn);

  await walkBuilderSteps(builder);
  await expect(page.getByRole("heading", { level: 1, name: CHARACTER_NAME })).toBeVisible();

  await openSection(page, "Spells");
  for (const name of chosenNames) await expectGrantedSpell(page, name, variant2014, "Ritual");

  // The 2014 book never changes during level up: the dialog shows it read-only, and applying
  // the level still succeeds because nothing about the book was altered.
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const levelUp = page.getByRole("dialog", { name: "Level up character" });
  await expect(levelUp).toBeVisible();
  const levelBook = bookSection(levelUp, variant2014);
  await expect(levelBook.getByLabel("Spell list class")).toBeDisabled();
  await expect(
    levelBook.getByText("The chosen class list and its casting ability are fixed with this feat."),
  ).toBeVisible();
  const levelGrid = levelBook.locator(".builder-token-grid").first();
  await expect(levelGrid.locator("button.selected")).toHaveCount(2);
  await expect(levelGrid.locator("button.selected").first()).toBeDisabled();
  await applyLevelUp(levelUp, 5);

  await openSection(page, "Spells");
  for (const name of chosenNames) await expectGrantedSpell(page, name, variant2014, "Ritual");
});

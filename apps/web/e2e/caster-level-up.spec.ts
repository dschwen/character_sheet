import { CHARACTER_NAME, expect, openApp, test, walkBuilderSteps } from "./support";

/**
 * Renders the spellcaster level-up path end to end: create a Bard at the builder's
 * reviewed maximum, open the level-up dialog, confirm the prepared-spell growth and
 * sixth-level options are offered, apply the level, and confirm advancement closes.
 */
test("level a Bard 10 to 11 through the rendered level-up flow", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await expect(builder).toBeVisible();
  await builder.getByLabel("Character name").fill(CHARACTER_NAME);
  const bardChoice = builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Bard/ });
  await bardChoice.click();
  await expect(bardChoice).toHaveAttribute("aria-pressed", "true");
  // Bard advancement is reviewed through level 11, so the builder must offer it.
  await builder.getByLabel("Starting level").selectOption("10");
  await walkBuilderSteps(builder);

  await expect(page.getByRole("heading", { level: 1, name: CHARACTER_NAME })).toBeVisible();

  const levelUpButton = page.getByRole("button", { name: "Level up", exact: true });
  await expect(levelUpButton).toBeEnabled();
  await levelUpButton.click();
  const dialog = page.getByRole("dialog", { name: "Level up character" });
  await expect(dialog).toBeVisible();

  const preparedSection = dialog.locator(".prepared-choice-section");
  await expect(preparedSection.getByText(/1 \/ 1 new/)).toBeVisible();
  await expect(preparedSection.getByText("Level 6").first()).toBeVisible();

  await dialog.getByRole("button", { name: "Review level up" }).click();
  const apply = dialog.getByRole("button", { name: /Apply level 11/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toBeHidden();

  await expect(levelUpButton).toBeDisabled();
  await expect(levelUpButton).toHaveAttribute("title", /reviewed through level 11/);
});

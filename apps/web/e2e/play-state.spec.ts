import { expect, openApp, openSection, selectFixture, test } from "./support";
import type { Locator, Page } from "@playwright/test";

// The "Conditions" group heading is a <strong> inside the Status panel, so toggles are
// addressed by their own accessible names rather than by a section heading.
function conditionToggle(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

test("condition changes are atomic, undoable, and survive a reload in Play", async ({ page }) => {
  await openApp(page);
  await selectFixture(page, "Fighter 5");
  await openSection(page, "Play");

  const blinded = conditionToggle(page, "Blinded");
  await expect(blinded).toHaveAttribute("aria-pressed", "false");

  // Apply a state change, then undo it.
  await blinded.click();
  await expect(blinded).toHaveAttribute("aria-pressed", "true");
  const undo = page.getByRole("button", { name: /Undo last state change/ });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(blinded).toHaveAttribute("aria-pressed", "false");

  // Apply a second change and confirm it is restored from browser storage after reload.
  const charmed = conditionToggle(page, "Charmed");
  await expect(charmed).toHaveAttribute("aria-pressed", "false");
  await charmed.click();
  await expect(charmed).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("status")).toContainText(/Restored/);
  await openSection(page, "Play");
  await expect(conditionToggle(page, "Charmed")).toHaveAttribute("aria-pressed", "true");
});

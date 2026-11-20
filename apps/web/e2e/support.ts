import { expect, test as base } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { CharacterDocument } from "@dnd/character-model";

export const CHARACTER_NAME = "E2E Verify";

interface RenderGuardFixture {
  renderGuard: string[];
}

export const test = base.extend<RenderGuardFixture>({
  renderGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => {
        problems.push(`uncaught exception: ${error.message}`);
      });
      page.on("console", (message) => {
        if (message.type() === "error") {
          problems.push(`console error: ${message.text()}`);
        }
      });
      await use(problems);
      if (problems.length > 0) {
        throw new Error(`Rendered JavaScript problems observed:\n${problems.join("\n")}`);
      }
    },
    { auto: true },
  ],
});

export { expect };

export async function savedCharacter(page: Page): Promise<CharacterDocument> {
  return page.evaluate(() => {
    const saved = localStorage.getItem("dnd-character-manager.document.v1");
    if (saved === null) throw new Error("No browser-local character was saved");
    return JSON.parse(saved) as CharacterDocument;
  });
}

export function sectionNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Character sheet sections" });
}

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  // Width-independent load check: the section navigation is present at every viewport.
  await expect(sectionNav(page)).toBeVisible();
}

export async function openSection(page: Page, name: string): Promise<void> {
  await sectionNav(page).getByRole("button", { name, exact: true }).click();
}

export async function selectFixture(page: Page, needle: string): Promise<void> {
  const picker = page.getByLabel("Select sample character");
  const labels = await picker.locator("option").allTextContents();
  const index = labels.findIndex((label) => label.includes(needle));
  if (index < 0) {
    throw new Error(`No fixture matching '${needle}'. Options: ${labels.join(", ")}`);
  }
  await picker.selectOption({ index });
}

/**
 * Drives the builder to a valid draft. Progress is made only through the app's own
 * affordances: fill an option group when it has no selection at all (groups whose
 * defaults are already chosen are left alone so they are never toggled), then advance
 * with Continue. If Review is reached while creation stays blocked, the app's own
 * `.builder-issues` diagnostics are raised.
 */
export async function walkBuilderSteps(dialog: Locator): Promise<void> {
  for (let guard = 0; guard < 80; guard += 1) {
    const create = dialog.getByRole("button", { name: "Create character" });
    if ((await create.count()) > 0 && (await create.isEnabled())) {
      await create.click();
      await expect(dialog).toBeHidden();
      return;
    }

    const grids = dialog.locator(".builder-choice-grid, .builder-class-grid");
    const gridCount = await grids.count();
    let filled = false;
    for (let gridIndex = 0; gridIndex < gridCount; gridIndex += 1) {
      const grid = grids.nth(gridIndex);
      // Relative lookups only: a selection marker found inside this grid means the
      // group is satisfied and must not be toggled.
      if ((await grid.locator(".selected, [aria-pressed='true']").count()) > 0) {
        continue;
      }
      const fill = grid.locator("button:not([disabled])").first();
      if ((await fill.count()) > 0) {
        await fill.click();
        filled = true;
        break;
      }
    }
    if (filled) {
      continue;
    }

    const next = dialog.getByRole("button", { name: "Continue" });
    if ((await next.count()) > 0 && (await next.isEnabled())) {
      await next.click();
      continue;
    }

    const issues = await dialog.locator(".builder-issues").allTextContents();
    throw new Error(
      `Builder walk reached no valid draft: ${issues.join(" | ") || "no issue list rendered"}`,
    );
  }
  throw new Error("Builder walk exhausted its iteration budget.");
}

export async function levelUpOnce(page: Page): Promise<void> {
  const levelUpButton = page.getByRole("button", { name: "Level up", exact: true });
  await expect(levelUpButton).toBeEnabled();
  await levelUpButton.click();
  const dialog = page.getByRole("dialog", { name: "Level up character" });
  await expect(dialog).toBeVisible();
  const review = dialog.getByRole("button", { name: "Review level up" });
  if ((await review.isVisible()) && (await review.isEnabled())) {
    await review.click();
  } else {
    const rail = dialog.getByRole("complementary", { name: "Level-up progress" });
    await rail.getByRole("button", { name: "Review", exact: true }).first().click();
  }
  const apply = dialog.getByRole("button", { name: /Apply level \d+/ });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toBeHidden();
}

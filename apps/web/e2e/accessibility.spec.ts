import AxeBuilder from "@axe-core/playwright";

import type { Page } from "@playwright/test";

import { expect, openApp, test } from "./support";

async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map(
      (violation) =>
        `${violation.id} (${String(violation.impact)}): ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(" | ")}`,
    );
}

test("the sheet and the builder report no critical or serious axe violations", async ({ page }) => {
  await openApp(page);
  expect(await blockingViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await expect(builder).toBeVisible();
  expect(await blockingViolations(page)).toEqual([]);
  await builder.getByLabel("Close character builder").click();
  await expect(builder).toBeHidden();
});

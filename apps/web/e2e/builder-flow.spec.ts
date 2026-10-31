import {
  CHARACTER_NAME,
  expect,
  levelUpOnce,
  openApp,
  openSection,
  test,
  walkBuilderSteps,
} from "./support";

test("create, persist, level up, trace, and round-trip a Fighter through the production export", async ({
  page,
}, testInfo) => {
  await openApp(page);

  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await expect(builder).toBeVisible();
  await builder.getByLabel("Character name").fill(CHARACTER_NAME);
  // The builder preselects a default class; make sure Fighter is the chosen one without
  // assuming which class that default is.
  const fighterChoice = builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: /Starting class Fighter/ });
  if ((await fighterChoice.getAttribute("aria-pressed")) !== "true") {
    await fighterChoice.click();
  }
  await expect(fighterChoice).toHaveAttribute("aria-pressed", "true");
  await walkBuilderSteps(builder);

  const sheetHeading = page.getByRole("heading", { level: 1, name: CHARACTER_NAME });
  await expect(sheetHeading).toBeVisible();

  // Create, save, reload: the browser-local document survives a refresh.
  await page.reload();
  await expect(page.getByRole("status")).toContainText(/Restored/);
  await expect(sheetHeading).toBeVisible();

  // Level up: the level table grants Action Surge at Fighter level 2, and it must appear.
  await levelUpOnce(page);
  await openSection(page, "Features");
  await expect(page.getByText("Action Surge").first()).toBeVisible();

  // Explanation panel: Shift-clicking a derived value opens the calculation trace drawer.
  await openSection(page, "Overview");
  await page
    .getByLabel("Character vitals")
    .locator("button")
    .first()
    .click({ modifiers: ["Shift"] });
  const trace = page.getByRole("dialog", { name: "Calculation trace" });
  await expect(trace).toBeVisible();
  await trace.getByRole("button", { name: "Close calculation trace" }).click();
  await expect(trace).toBeHidden();

  // Export, then import the exported document back.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const exportPath = testInfo.outputPath("exported-character.json");
  await download.saveAs(exportPath);

  await page.locator('input[type="file"]').setInputFiles(exportPath);
  await expect(page.getByRole("status")).toContainText(`Imported ${CHARACTER_NAME}`);
  await expect(sheetHeading).toBeVisible();
});

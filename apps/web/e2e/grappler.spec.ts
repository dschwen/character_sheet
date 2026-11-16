import type { Locator, Page } from "@playwright/test";
import { expect, openApp, openSection, selectFixture, test, walkBuilderSteps } from "./support";

async function create(page: Page, className: string) {
  await openApp(page);
  await page.getByRole("button", { name: "New character" }).click();
  const builder = page.getByRole("dialog", { name: "Create a character" });
  await builder.getByLabel("Character name").fill(`${className} Grappler`);
  const button = builder
    .getByLabel("Choose a starting class")
    .getByRole("button", { name: new RegExp(`Starting class ${className}`) });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await builder.getByLabel("Starting level").selectOption("4");
  await builder.getByRole("button", { name: "Continue" }).click();
  const select = builder.getByLabel("Level 4 Feat");
  const value = await select
    .getByRole("option", { name: /^Grappler:/ })
    .first()
    .getAttribute("value");
  if (!value) throw new Error("Missing Grappler");
  await select.selectOption(value);
  await walkBuilderSteps(builder);
  await openSection(page, "Combat");
  return page.getByRole("group", { name: "Grappler declared combat benefits", exact: true });
}
async function confirmPunch(panel: Locator) {
  for (const label of [
    "I confirm both current sizes, including transformations",
    "This Unarmed Strike hit a creature",
    "The hit was part of the Attack action, not a Bonus Action or Reaction",
    "This is my turn",
    "This benefit is unused this turn",
    "I have a free hand to grab this creature",
    "The target is within my Unarmed Strike reach",
    "The DM confirms this target can be grappled",
  ])
    await panel.getByLabel(label, { exact: true }).check();
}
async function saved(page: Page) {
  return page.evaluate(() => localStorage.getItem("dnd-character-manager.document.v1"));
}

test("Fighter Punch and Grab shows fixed damage/save feedback, and Fast Wrestler uses declared sizes", async ({
  page,
}) => {
  const panel = await create(page, "Fighter");
  const before = await saved(page);
  await expect(panel.getByRole("button", { name: "Resolve Damage and Grapple" })).toBeDisabled();
  await panel.getByLabel("Target creature", { exact: true }).fill("Ogre");
  await panel.getByRole("button", { name: "Explain Grappler benefits" }).click();
  const trace = page.getByRole("dialog", { name: "Calculation trace" });
  await expect(trace).toContainText("87");
  await trace.getByRole("button", { name: "Close calculation trace" }).click();
  await panel.getByLabel("Target current size").selectOption("large");
  await confirmPunch(panel);
  await panel.getByLabel("Critical hit (double damage dice only)").check();
  await panel.getByRole("button", { name: "Resolve Damage and Grapple" }).click();
  await expect(panel.getByRole("status")).toContainText("set Grappled");
  await expect(panel.getByRole("status")).toContainText(
    "Ogre chooses a Strength or Dexterity saving throw",
  );
  await expect(panel.getByRole("status")).toContainText(
    "Fixed damage has no damage dice to double",
  );
  await expect(
    panel.getByLabel("This benefit is unused this turn", { exact: true }),
  ).not.toBeChecked();
  await expect(panel.getByRole("button", { name: "Resolve Damage and Grapple" })).toBeDisabled();
  await panel
    .getByLabel("This specific creature is currently Grappled by me, not by someone else")
    .check();
  await panel.getByLabel("I confirm both current sizes, including transformations").check();
  await panel.getByLabel("Distance to move (feet)").fill("10");
  await panel.getByRole("button", { name: "Show grapple movement cost" }).click();
  await expect(panel.getByRole("status")).toContainText("10 ft. of movement costs 20 ft.");
  await panel.getByLabel("Target current size").selectOption("small");
  await expect(panel.getByRole("button", { name: "Show grapple movement cost" })).toBeDisabled();
  await panel.getByLabel("I confirm both current sizes, including transformations").check();
  await panel.getByRole("button", { name: "Show grapple movement cost" }).click();
  await expect(panel.getByRole("status")).toContainText("10 ft. of movement costs 10 ft.");
  expect(await saved(page)).toBe(before);
});

test("Monk Punch and Grab rejects oversized targets, rolls critical dice and explains Dexterity DC", async ({
  page,
}) => {
  const panel = await create(page, "Monk");
  const before = await saved(page);
  await panel.getByLabel("Target creature", { exact: true }).fill("Giant");
  await panel.getByLabel("My current size").selectOption("small");
  await panel.getByLabel("Target current size").selectOption("large");
  await confirmPunch(panel);
  await panel.getByRole("button", { name: "Resolve Damage and Grapple" }).click();
  await expect(panel.getByRole("alert")).toContainText("too large");
  await expect(page.locator(".dice-result")).toHaveCount(0);
  await panel.getByLabel("My current size").selectOption("large");
  await panel.getByLabel("Target current size").selectOption("huge");
  await confirmPunch(panel);
  await panel.getByRole("button", { name: /Grapple save DC/ }).click();
  const trace = page.getByRole("dialog", { name: "Calculation trace" });
  await expect(trace).toContainText("dexterity");
  await expect(trace).toContainText("50");
  await expect(trace).toContainText("190");
  await trace.getByRole("button", { name: "Close calculation trace" }).click();
  await panel.getByLabel("Critical hit (double damage dice only)").check();
  await panel.getByRole("button", { name: "Resolve Damage and Grapple" }).click();
  await expect(page.locator(".dice-result")).toContainText("2d6 rolled", { timeout: 20000 });
  await expect(panel.getByRole("status")).toContainText(
    "Giant chooses a Strength or Dexterity saving throw",
  );
  await expect(panel.getByRole("status")).toContainText(
    "Do not apply a second ordinary damage roll",
  );
  expect(await saved(page)).toBe(before);
});

test("Grappler spell attacks are target-specific and Poisoned cancels their Advantage", async ({
  page,
}) => {
  await create(page, "Wizard");
  await openSection(page, "Play");
  await page.getByRole("button", { name: "Poisoned", exact: true }).click();
  await openSection(page, "Combat");
  const panel = page.getByRole("group", { name: "Grappler declared combat benefits", exact: true });
  const before = await saved(page);
  const button = panel.getByRole("button", {
    name: "Roll attack against declared grappled target",
  });
  await expect(button).toBeDisabled();
  await panel.getByLabel("Target creature", { exact: true }).fill("Goblin");
  await expect(button).toBeDisabled();
  const attack = panel.getByRole("combobox", { name: "Declared attack", exact: true });
  await attack.selectOption({ label: "Spell attack · Wizard" });
  await panel
    .getByLabel("This specific creature is currently Grappled by me, not by someone else")
    .check();
  await button.click();
  await expect(page.locator(".dice-result")).toContainText("target Goblin", { timeout: 20000 });
  await expect(page.locator(".dice-result")).toContainText("Normal");
  await expect(
    panel.getByLabel("This specific creature is currently Grappled by me, not by someone else"),
  ).not.toBeChecked();
  await expect(button).toBeDisabled();
  expect(await saved(page)).toBe(before);
});

test("switching characters while Punch and Grab dice settle cannot publish an old target result", async ({
  page,
}) => {
  const panel = await create(page, "Monk");
  await panel.getByLabel("Target creature", { exact: true }).fill("Old target");
  await confirmPunch(panel);
  await panel.getByRole("button", { name: "Resolve Damage and Grapple" }).click();
  await expect(page.locator(".dice-rolling-guard")).toBeVisible();
  await selectFixture(page, "Fighter 1");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".dice-rolling-guard")).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator(".dice-result")).toHaveCount(0);
  await expect(page.locator(".notice")).not.toContainText("Old target");
});

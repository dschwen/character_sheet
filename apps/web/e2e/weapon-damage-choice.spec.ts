import { expect, openApp, openSection, selectFixture, test } from "./support";

for (const critical of [false, true]) {
  test(`Savage Attacker rolls complete ${critical ? "critical" : "normal"} pools and lets the player choose either`, async ({
    page,
  }) => {
    await openApp(page);
    await selectFixture(page, "Fighter 5");
    await openSection(page, "Combat");
    const saved = await page.evaluate(() =>
      localStorage.getItem("dnd-character-manager.document.v1"),
    );
    const controls = page.getByRole("group", {
      name: "Savage Attacker for Greatsword",
      exact: true,
    });
    const roll = controls.getByRole("button", { name: "Savage Attacker: roll 2 damage pools" });
    const otherWeapon = page.getByRole("group", { name: "Savage Attacker for Flail", exact: true });
    await otherWeapon.getByLabel("This weapon hit a target").check();
    await otherWeapon.getByLabel("This benefit is unused this turn").check();
    await expect(roll).toBeDisabled();
    await controls.getByLabel("This weapon hit a target").check();
    await expect(roll).toBeDisabled();
    await controls.getByLabel("This benefit is unused this turn").check();
    if (critical) await controls.getByLabel("Critical hit (double weapon dice only)").check();
    await controls.getByRole("button", { name: "Explain Savage Attacker" }).click();
    const trace = page.getByRole("dialog", { name: "Calculation trace" });
    await expect(trace).toContainText("87");
    await trace.getByRole("button", { name: "Close calculation trace" }).click();
    await roll.click();
    const choice = page.getByRole("group", { name: "Savage Attacker damage choice", exact: true });
    await expect(choice).toBeVisible({ timeout: 20000 });
    // This case exercises the real fullscreen renderer, not just fallback output.
    await expect(page.locator("canvas").first()).toHaveCSS("position", "fixed");
    await expect(choice.getByRole("button", { name: /^Use pool/ })).toHaveCount(2);
    await expect(choice.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(choice).toContainText(critical ? "4d6 rolled" : "2d6 rolled");
    await expect(page.locator(".dice-result")).toHaveCount(0);
    await expect(controls.getByLabel("This benefit is unused this turn")).not.toBeChecked();
    await expect(controls.getByLabel("This weapon hit a target")).not.toBeChecked();
    await expect(otherWeapon.getByLabel("This benefit is unused this turn")).not.toBeChecked();
    await expect(otherWeapon.getByLabel("This weapon hit a target")).not.toBeChecked();
    await choice.getByRole("button", { name: /^Use pool 2:/ }).click();
    await expect(page.locator(".dice-result")).toContainText("chose pool 2 of 2");
    await choice.getByRole("button", { name: /^Use pool 1:/ }).click();
    await expect(page.locator(".dice-result")).toContainText("chose pool 1 of 2");
    expect(
      await page.evaluate(() => localStorage.getItem("dnd-character-manager.document.v1")),
    ).toBe(saved);
    // An ordinary roll invalidates the old comparison rather than leaving selectable stale pools.
    const row = page.getByRole("row").filter({ has: controls });
    await row.getByRole("button", { name: "Crit", exact: true }).click();
    await expect(choice).toHaveCount(0);
  });
}

test("WebGL failure falls back to two complete pools without changing saved state", async ({
  page,
  renderGuard,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext")
      ?.value as
      ((this: HTMLCanvasElement, type: string, ...args: unknown[]) => unknown) | undefined;
    if (!original) throw new Error("Missing canvas context implementation");
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]): unknown {
        if (type.startsWith("webgl")) return null;
        return original.call(this, type, ...args);
      },
    });
  });
  await openApp(page);
  await selectFixture(page, "Fighter 5");
  await openSection(page, "Combat");
  const before = await page.evaluate(() =>
    localStorage.getItem("dnd-character-manager.document.v1"),
  );
  const controls = page.getByRole("group", { name: "Savage Attacker for Greatsword", exact: true });
  await controls.getByLabel("This weapon hit a target").check();
  await controls.getByLabel("This benefit is unused this turn").check();
  await controls.getByRole("button", { name: "Savage Attacker: roll 2 damage pools" }).click();
  const choice = page.getByRole("group", { name: "Savage Attacker damage choice", exact: true });
  await expect(choice).toBeVisible();
  await expect(page.locator(".notice")).toContainText(
    "used the fallback roller for all complete pools",
  );
  await expect(choice.getByRole("button", { name: /^Use pool/ })).toHaveCount(2);
  await choice.getByRole("button", { name: /^Use pool 2:/ }).click();
  await expect(page.locator(".dice-result")).toContainText("chose pool 2 of 2");
  expect(await page.evaluate(() => localStorage.getItem("dnd-character-manager.document.v1"))).toBe(
    before,
  );
  // Exercise deferred canvas cleanup: failed renderer initialization must not
  // cause a later unhandled rejection after successful fallback output.
  await page.clock.fastForward(2500);
  // Only the exact vendor error deliberately induced above is expected. Every other
  // console error or page exception remains in the shared render guard and fails.
  const expected = "console error: THREE.WebGLRenderer: Error creating WebGL context.";
  expect(renderGuard.filter((entry) => entry === expected)).toHaveLength(1);
  renderGuard.splice(renderGuard.indexOf(expected), 1);
  await selectFixture(page, "Fighter 1");
  await expect(choice).toHaveCount(0);
  await expect(page.getByLabel("This benefit is unused this turn").first()).not.toBeChecked();
  const unarmed = page.getByRole("row").filter({ hasText: "Unarmed Strike" });
  await expect(unarmed.getByRole("group", { name: /^Savage Attacker for/ })).toHaveCount(0);
});

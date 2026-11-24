import { expect, openApp, openSection, savedCharacter, selectFixture, test } from "./support";

test("equipped focuses cover ordinary materials and Pact of the Chain summons a tracked familiar", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Warlock 5");
  await openSection(page, "Combat");
  const catalog = page.getByLabel("Equipment catalog");
  await catalog.selectOption("srd521.equipment.gear.arcane-focus");
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  const focus = page.locator(".inventory-row").filter({ hasText: "Arcane Focus" }).last();
  await focus.getByRole("button", { name: "Equip", exact: true }).click();
  await catalog.selectOption("srd521.equipment.gear.find-familiar-incense");
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  await openSection(page, "Play");
  const spell = (name: string) =>
    page.locator(".play-spell-list > div").filter({
      has: page.getByText(name, { exact: true }),
    });
  await expect(spell("Hex")).toContainText("Equipped substitute: Arcane Focus.");
  const find = spell("Find Familiar");
  await expect(find).toContainText(/burning incense worth 10\+ GP/u);
  await expect(find).toContainText("Provide the specified component.");
  const forms = find.getByRole("combobox", { name: "Familiar form", exact: true });
  const maximumHP = find.getByLabel("Familiar maximum HP");
  await forms.selectOption("Owl");
  await expect(maximumHP).toHaveValue("1");
  await forms.selectOption("other");
  await maximumHP.fill("3");
  await forms.selectOption("Imp");
  await expect(maximumHP).toHaveValue("21");
  const useIncense = find.getByRole("checkbox", {
    name: "Use tracked Find Familiar Incense (1 carried)",
  });
  await useIncense.check();
  const before = await savedCharacter(page);
  const cast = find.getByRole("button", { name: "Cast at will · Pact of the Chain", exact: true });
  await cast.click();
  expect(await savedCharacter(page)).toEqual(before);
  await find
    .getByRole("combobox", { name: "Familiar creature type", exact: true })
    .selectOption("fiend");
  await cast.click();
  const familiar = page
    .locator(".panel")
    .filter({ has: page.getByRole("heading", { name: "Familiar", exact: true }) });
  await expect(familiar).toContainText("21 / 21 HP");
  await expect(familiar).toContainText("13 AC · Speed 20 ft., fly 40 ft.");
  await expect(familiar).toContainText("Darkvision 120 ft.");
  await expect(familiar).toContainText("Sting.");
  await expect(
    find.getByRole("checkbox", { name: "Use tracked Find Familiar Incense (0 carried)" }),
  ).toBeDisabled();
  expect((await savedCharacter(page)).state.expendedSpellSlots).toEqual(
    before.state.expendedSpellSlots,
  );
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(before);
  await cast.click();
  await expect(useIncense).toBeEnabled();
  await familiar.getByRole("button", { name: "Temporarily dismiss", exact: true }).click();
  await page.reload();
  await openSection(page, "Play");
  await familiar.getByRole("button", { name: "Recall within 30 feet", exact: true }).click();
  await familiar.getByLabel("Familiar current HP").fill("0");
  await familiar.getByRole("button", { name: "Set familiar HP", exact: true }).click();
  await expect(familiar).toContainText("Vanished at 0 HP");
  await expect(
    familiar.getByRole("button", { name: "Recall within 30 feet", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  await expect(familiar).toContainText("21 / 21 HP");
});

test("drinking a Potion of Invulnerability consumes the dose and enables all-damage resistance", async ({
  page,
}) => {
  await openApp(page);
  await selectFixture(page, "Fighter 1");
  await openSection(page, "Combat");
  await page
    .getByLabel("Equipment catalog")
    .selectOption("srd521.magic-item.potion-of-invulnerability");
  await page.getByRole("button", { name: "Add loot", exact: true }).click();
  await openSection(page, "Play");
  const card = page
    .locator(".effect-action-setup")
    .filter({ hasText: "Potion of Invulnerability" });
  const before = await savedCharacter(page);
  await card.getByRole("button", { name: "Drink · Bonus Action", exact: true }).click();
  await expect(card).toHaveCount(0);
  const resistance = page.getByRole("combobox", { name: "Apply resistance to incoming damage" });
  await expect(resistance.locator("option[value='all']")).toHaveCount(1);
  await page.getByRole("button", { name: /Undo last state change/u }).click();
  expect(await savedCharacter(page)).toEqual(before);
});

import { describe, expect, it } from "vitest";

import { evaluateCharacter } from "@dnd/rules-core";

import { loadWebData } from "./server-data";
import { proposePreparedSpellLoadout, spellPreparationEditor } from "./spell-preparation";

const updatedAt = new Date("2026-08-07T12:00:00.000Z");

function fixture(filename: string) {
  const { fixtures } = loadWebData();
  const match = fixtures.find((option) => option.filename === filename);
  if (match === undefined) throw new Error(`${filename} is missing.`);
  return match.character;
}

describe("prepared spell loadouts", () => {
  it("offers only learned leveled spells to a spellbook caster", () => {
    const { rulesPackage } = loadWebData();
    const wizard = fixture("wizard-5.json");
    const editor = spellPreparationEditor(wizard, rulesPackage);

    expect(editor).toMatchObject({
      classId: "srd521.class.wizard",
      className: "Wizard",
      mode: "spellbook",
      requiredSelections: 9,
    });
    expect(editor?.options).toHaveLength(14);
    expect(editor?.options.every((spell) => wizard.build.learnedSpellIds.includes(spell.id))).toBe(
      true,
    );
    expect(editor?.options.every((spell) => spell.level > 0)).toBe(true);
  });

  it("updates a Wizard loadout without mutating the source document", () => {
    const { rulesPackage } = loadWebData();
    const wizard = fixture("wizard-5.json");
    const editor = spellPreparationEditor(wizard, rulesPackage);
    if (editor === undefined) throw new Error("Wizard preparation metadata is missing.");
    const replacement = editor.options.find((spell) => !spell.selected && !spell.alwaysPrepared);
    if (replacement === undefined) throw new Error("Wizard replacement spell is missing.");
    const selectedSpellIds = [...editor.selectedSpellIds.slice(1), replacement.id];

    const proposal = proposePreparedSpellLoadout(wizard, rulesPackage, selectedSpellIds, updatedAt);

    expect(proposal.applicable).toBe(true);
    expect(proposal.nextCharacter?.loadout.preparedSpellIds).toEqual(selectedSpellIds);
    expect(proposal.nextCharacter?.metadata.revision).toBe(wizard.metadata.revision + 1);
    expect(proposal.nextCharacter?.metadata.updatedAt).toBe(updatedAt.toISOString());
    expect(wizard.loadout.preparedSpellIds).not.toEqual(selectedSpellIds);
    expect(
      evaluateCharacter({
        character: proposal.nextCharacter ?? wizard,
        packages: [rulesPackage],
      }).validations,
    ).toEqual([]);
  });

  it("shows full-list and always-prepared Cleric spells without consuming selections", () => {
    const { rulesPackage } = loadWebData();
    const cleric = fixture("cleric-5.json");
    const editor = spellPreparationEditor(cleric, rulesPackage);

    expect(editor).toMatchObject({
      classId: "srd521.class.cleric",
      mode: "full-list",
      requiredSelections: 9,
    });
    expect(editor?.alwaysPreparedSpellIds).toHaveLength(6);
    expect(editor?.options.filter((spell) => spell.alwaysPrepared)).toHaveLength(6);
    expect(editor?.options.find((spell) => spell.id === "srd521.spell.bless")).toMatchObject({
      selected: false,
      alwaysPrepared: true,
    });
    expect(editor?.options.some((spell) => !spell.selected && !spell.alwaysPrepared)).toBe(true);
  });

  it("rejects incomplete and automatic prepared-spell selections", () => {
    const { rulesPackage } = loadWebData();
    const cleric = fixture("cleric-5.json");
    const editor = spellPreparationEditor(cleric, rulesPackage);
    if (editor === undefined) throw new Error("Cleric preparation metadata is missing.");

    const incomplete = proposePreparedSpellLoadout(
      cleric,
      rulesPackage,
      editor.selectedSpellIds.slice(0, 8),
      updatedAt,
    );
    const automatic = proposePreparedSpellLoadout(
      cleric,
      rulesPackage,
      [...editor.selectedSpellIds.slice(1), editor.alwaysPreparedSpellIds[0] ?? "missing"],
      updatedAt,
    );

    expect(incomplete).toMatchObject({
      applicable: false,
      issues: ["Choose exactly 9 prepared spells."],
    });
    expect(automatic.applicable).toBe(false);
    expect(automatic.issues).toContain(
      "Every prepared spell must be an eligible, non-automatic selection.",
    );
  });

  it("does not offer preparation for a non-spellcaster", () => {
    const { rulesPackage } = loadWebData();
    const fighter = fixture("fighter-5.json");

    expect(spellPreparationEditor(fighter, rulesPackage)).toBeUndefined();
    expect(proposePreparedSpellLoadout(fighter, rulesPackage, [], updatedAt)).toMatchObject({
      applicable: false,
      issues: ["This character does not prepare spells."],
    });
  });
});

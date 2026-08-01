import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { characterDocumentSchema } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadRulesPackage(root: string): LoadedRulesPackage {
  const authoringRoot = resolve(root, "authoring-ir");
  return {
    manifest: packageManifestSchema.parse(readJson(resolve(root, "manifest.json"))),
    entities: contentEntitySchema.array().parse(readJson(resolve(root, "entities.json"))),
    authoringIr: readdirSync(authoringRoot)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => authoringIrSchema.parse(readJson(resolve(authoringRoot, file)))),
  };
}

function signed(value: number): string {
  return value >= 0 ? `+${String(value)}` : String(value);
}

function value(evaluation: CharacterEvaluation, id: string): string {
  const result = evaluation.values[id]?.value;
  return result === undefined ? "—" : String(result);
}

function display(value_: unknown): string {
  if (typeof value_ === "string" || typeof value_ === "number" || typeof value_ === "boolean") {
    return String(value_);
  }
  return value_ === null || value_ === undefined ? "—" : JSON.stringify(value_);
}

function printSummary(name: string, level: number, evaluation: CharacterEvaluation): void {
  console.log(`${name} — level ${String(level)}`);
  console.log(
    `HP ${display(evaluation.facts["hitPoints.current"])} / ${value(evaluation, "hitPoints.maximum")}  ` +
      `AC ${value(evaluation, "armorClass")}  PB ${signed(Number(evaluation.facts.proficiencyBonus))}`,
  );
  console.log(
    ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
      .map((ability) => {
        const score = evaluation.facts[`ability.${ability}.score`];
        const modifier = Number(evaluation.facts[`ability.${ability}.modifier`]);
        return `${ability.slice(0, 3).toUpperCase()} ${display(score)} (${signed(modifier)})`;
      })
      .join("  "),
  );
  if (evaluation.spellcasting !== undefined) {
    const casting = evaluation.spellcasting;
    const preparedCount = evaluation.spells.filter((spell) => spell.prepared).length;
    const preparedText =
      casting.alwaysPreparedSpells === 0
        ? `${String(preparedCount)}/${String(casting.preparedSpellLimit)}`
        : `${String(preparedCount)} (${String(casting.preparedSpellLimit)} selected + ` +
          `${String(casting.alwaysPreparedSpells)} always)`;
    console.log(
      `Spells ${signed(casting.attackBonus)} attack, DC ${String(casting.saveDifficultyClass)}  ` +
        `prepared ${preparedText}`,
    );
    console.log(
      `Slots ${casting.slots
        .map((slot) => `L${String(slot.level)} ${String(slot.current)}/${String(slot.maximum)}`)
        .join("  ")}`,
    );
  }
  if (evaluation.attacks.length > 0) {
    console.log(
      `Attacks ${evaluation.attacks
        .map(
          (attack) =>
            `${attack.name} ${signed(attack.attackBonus)} ` +
            `${String(attack.damage.diceCount ?? "")}d${String(attack.damage.diceSize ?? "")}` +
            `${signed(attack.damage.bonus)} ${attack.damage.type}`,
        )
        .join("; ")}`,
    );
  }
  if (evaluation.validations.length === 0) {
    console.log("Validation: valid");
  } else {
    console.log(`Validation: ${String(evaluation.validations.length)} issue(s)`);
    evaluation.validations.forEach((message) => {
      console.log(`- ${message.code}: ${message.message.en ?? ""}`);
    });
  }
}

function usage(): never {
  console.error(
    "Usage: pnpm character <character.json> [--json] [--content <generated-package-directory>]",
  );
  process.exit(2);
}

const arguments_ = process.argv.slice(2);
const characterPath = arguments_.find((argument) => !argument.startsWith("--"));
if (characterPath === undefined) {
  usage();
}
const contentOption = arguments_.indexOf("--content");
const contentRoot =
  contentOption < 0
    ? resolve(process.cwd(), "packages/content-srd-5.2.1/generated")
    : arguments_[contentOption + 1];
if (contentRoot === undefined) {
  usage();
}

const character = characterDocumentSchema.parse(readJson(resolve(characterPath)));
const evaluation = evaluateCharacter({
  character,
  packages: [loadRulesPackage(resolve(contentRoot))],
});
if (arguments_.includes("--json")) {
  console.log(JSON.stringify(evaluation, null, 2));
} else {
  printSummary(character.name, character.build.levels.length, evaluation);
}
process.exitCode = evaluation.validations.some((message) => message.severity === "error") ? 1 : 0;

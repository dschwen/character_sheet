import type { CharacterDocument } from "@dnd/character-model";
import { classFeatureChoiceSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage, ValidationMessage } from "@dnd/rules-api";
import { z } from "zod";

const progressionSchema = z
  .object({
    progression: z.array(
      z
        .object({
          level: z.number().int(),
          features: z.array(
            z.union([
              z.string(),
              z.object({ entityId: z.string().nullable().optional() }).passthrough(),
            ]),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** Ordinary feature options only; feat and spell choices have separate grant semantics. */
export function featureOptionChoices(packages: LoadedRulesPackage[]) {
  return packages
    .flatMap((pack) => pack.entities)
    .flatMap((owner) => {
      if (owner.kind !== "class" && owner.kind !== "subclass") return [];
      const parsedBody = z.record(z.unknown()).safeParse(owner.body);
      if (!parsedBody.success) return [];
      const body = parsedBody.data;
      return Object.values(body).flatMap((value) => {
        const parsed = classFeatureChoiceSchema.safeParse(value);
        if (
          !parsed.success ||
          !parsed.data.optionSelection ||
          parsed.data.featSelection ||
          parsed.data.spellSelection
        )
          return [];
        return [
          {
            owner,
            classId: owner.kind === "class" ? owner.id : String(body.parentClassId),
            choice: parsed.data,
          },
        ];
      });
    });
}

export function validFeatureOptionIds(
  character: CharacterDocument,
  packages: LoadedRulesPackage[],
): ReadonlySet<string> {
  const invalid = new Set(validateFeatureOptionChoices(character, packages).map(({ id }) => id));
  return new Set(
    featureOptionChoices(packages)
      .filter(({ choice }) => !invalid.has(`feature-option-${choice.id}`))
      .flatMap(({ choice }) =>
        character.build.levels.flatMap(({ selectedFeatureChoices }) =>
          selectedFeatureChoices
            .filter(({ choiceId }) => choiceId === choice.id)
            .flatMap(({ optionIds }) => optionIds),
        ),
      ),
  );
}

export function validateFeatureOptionChoices(
  character: CharacterDocument,
  packages: LoadedRulesPackage[],
): ValidationMessage[] {
  return featureOptionChoices(packages).flatMap(({ owner, classId, choice }) => {
    const classLevel = character.build.levels.filter((level) => level.classId === classId).length;
    const progression = progressionSchema.safeParse(owner.body);
    const sourceGranted =
      progression.success &&
      progression.data.progression.some(
        (row) =>
          row.level <= classLevel &&
          row.features.some(
            (feature) =>
              (typeof feature === "string" ? feature : feature.entityId) ===
              choice.optionSelection?.sourceFeatureId,
          ),
      );
    const eligible =
      sourceGranted &&
      classLevel >= choice.level &&
      (owner.kind === "class" || character.build.subclassId === owner.id);
    let level = 0;
    const records = character.build.levels.flatMap((entry) => {
      if (entry.classId === classId) level++;
      return entry.selectedFeatureChoices
        .filter((selection) => selection.choiceId === choice.id)
        .map((selection) => ({ entry, level, selection }));
    });
    const ids = records.flatMap(({ selection }) => selection.optionIds);
    const expected = choice.countByLevel?.[String(classLevel)];
    const valid = eligible
      ? records.length === 1 &&
        ids.length >= (expected ?? choice.minimum) &&
        ids.length <= (expected ?? choice.maximum) &&
        new Set(ids).size === ids.length &&
        records.every(
          (record) => record.entry.classId === classId && record.level >= choice.level,
        ) &&
        ids.every((id) => choice.options.includes(id))
      : records.length === 0;
    return valid
      ? []
      : [
          {
            id: `feature-option-${choice.id}`,
            severity: "error" as const,
            code: "FEATURE_OPTION_CHOICE_INVALID",
            message: {
              en: `${choice.id} requires eligible, distinct options recorded at or after its granting level.`,
            },
            paths: ["build.levels"],
          },
        ];
  });
}

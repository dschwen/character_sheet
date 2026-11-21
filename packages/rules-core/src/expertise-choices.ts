import { z } from "zod";
import type { CharacterDocument } from "@dnd/character-model";
import { classBuilderMetadataSchema, type ContentEntity } from "@dnd/content-schema";
import type { ValidationMessage } from "@dnd/rules-api";

const bodySchema = z
  .object({
    builder: classBuilderMetadataSchema.optional(),
  })
  .passthrough();

// Preserve public validation codes while deriving grant rules exclusively from shared metadata.
const countCodes: Readonly<Record<string, string>> = {
  "srd521.class-feature.bard.expertise": "BARD_EXPERTISE_CHOICE_COUNT",
  "srd521.class-feature.rogue.expertise": "ROGUE_EXPERTISE_CHOICE_COUNT",
  "srd521.class-feature.ranger.deft-explorer": "RANGER_DEFT_EXPLORER_EXPERTISE_COUNT",
  "srd521.class-feature.ranger.expertise": "RANGER_EXPERTISE_COUNT",
};

export function validateExpertiseChoices(
  character: CharacterDocument,
  entities: readonly ContentEntity[],
  granted: ReadonlySet<string>,
): ValidationMessage[] {
  return entities.flatMap((entity) => {
    if (entity.kind !== "class") return [];
    const body = bodySchema.safeParse(entity.body);
    const choice = body.success ? body.data.builder?.expertiseChoice : undefined;
    if (!choice) return [];
    const level = character.build.levels.filter(({ classId }) => classId === entity.id).length;
    const sources = new Map<string, number>();
    if (choice.grants) {
      for (const grant of choice.grants)
        sources.set(
          grant.sourceId,
          (sources.get(grant.sourceId) ?? 0) +
            (level >= grant.level && granted.has(grant.sourceId) ? grant.count : 0),
        );
    } else {
      // Progression maps are thresholds, so the final count also holds beyond the builder cap.
      const threshold = Object.entries(choice.countByLevel ?? {})
        .filter(([at]) => Number(at) <= level)
        .sort(([left], [right]) => Number(right) - Number(left))[0];
      sources.set(
        choice.sourceId,
        level >= choice.minimumLevel && granted.has(choice.sourceId)
          ? (threshold?.[1] ?? (choice.countByLevel ? 0 : 1))
          : 0,
      );
    }
    return [...sources].flatMap(([sourceId, count]) => {
      const selected = character.build.proficiencyChoices.expertise.filter(
        (item) => item.sourceId === sourceId,
      );
      const issues: ValidationMessage[] = [];
      if (selected.length !== count)
        issues.push({
          id: `expertise-count-${sourceId}`,
          severity: "error",
          code: countCodes[sourceId] ?? "EXPERTISE_CHOICE_COUNT",
          message: {
            en: `${sourceId} requires ${String(count)} Expertise selection(s) at this class level.`,
          },
          paths: ["build.proficiencyChoices.expertise"],
        });
      if (
        selected.some(
          ({ skillId }) =>
            !choice.eligibleSkillIds.includes(skillId) ||
            (choice.requireClassProficiency &&
              !character.build.proficiencyChoices.skills.some(
                (skill) => skill.sourceId === entity.id && skill.skillId === skillId,
              )),
        )
      )
        issues.push({
          id: `expertise-pool-${sourceId}`,
          severity: "error",
          code: "EXPERTISE_CHOICE_NOT_ALLOWED",
          message: {
            en: `${sourceId} requires an eligible proficient skill from its declared pool.`,
          },
          paths: ["build.proficiencyChoices.expertise"],
        });
      return issues;
    });
  });
}

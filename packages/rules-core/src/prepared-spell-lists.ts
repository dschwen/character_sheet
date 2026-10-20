import { z } from "zod";
import { preparedSpellListExpansionSchema, type ContentEntity } from "@dnd/content-schema";

const bodySchema = z
  .object({
    spellList: z.array(z.string()),
    preparedSpellListExpansion: preparedSpellListExpansionSchema.optional(),
    spellPreparationChange: z
      .object({ event: z.literal("level-up"), replacementMaximum: z.number().int().nonnegative() })
      .optional(),
    progression: z
      .array(z.object({ level: z.number().int(), preparedSpells: z.number().int().nonnegative() }))
      .default([]),
  })
  .passthrough();

/** Expands leveled preparations only, bounded by new selections and legal level-up replacements. */
export function preparedSpellLists(
  classEntity: ContentEntity,
  level: number,
  entities: readonly ContentEntity[],
) {
  const body = bodySchema.parse(classEntity.body);
  const baseSpellIds = body.spellList;
  const expansion = body.preparedSpellListExpansion;
  if (!expansion || level < expansion.minimumLevel)
    return {
      baseSpellIds,
      preparedSpellIds: baseSpellIds,
      maximumExpandedSelections: 0,
      sourceFeatureId: undefined,
      calculation: undefined,
    };
  const extraIds = expansion.sourceClassIds.flatMap((id) => {
    const source = entities.find((entity) => entity.id === id && entity.kind === "class");
    const parsed = source ? bodySchema.safeParse(source.body) : undefined;
    if (!parsed?.success) throw new TypeError(`Missing spell-list source ${id}.`);
    return parsed.data.spellList;
  });
  const before =
    body.progression.find((row) => row.level === expansion.minimumLevel - 1)?.preparedSpells ?? 0;
  const current = body.progression.find((row) => row.level === level)?.preparedSpells ?? 0;
  const maximumExpandedSelections =
    Math.max(0, current - before) +
    (level - expansion.minimumLevel + 1) * (body.spellPreparationChange?.replacementMaximum ?? 0);
  const eligibleExtraIds = extraIds.filter((id) => {
    const spell = entities.find((entity) => entity.id === id && entity.kind === "spell");
    const parsed = z.object({ level: z.number().int() }).safeParse(spell?.body);
    return parsed.success && parsed.data.level >= expansion.minimumSpellLevel;
  });
  return {
    baseSpellIds,
    preparedSpellIds: [...new Set([...baseSpellIds, ...eligibleExtraIds])],
    maximumExpandedSelections,
    sourceFeatureId: expansion.sourceFeatureId,
    calculation: {
      preparedBeforeExpansion: before,
      preparedNow: current,
      levelsWithExpansion: level - expansion.minimumLevel + 1,
      replacementsPerLevel: body.spellPreparationChange?.replacementMaximum ?? 0,
    },
  };
}

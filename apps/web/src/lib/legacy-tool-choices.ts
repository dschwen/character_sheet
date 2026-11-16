import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";
import type { BuilderCatalog } from "./character-builder";

export type ToolSelections = Readonly<Record<string, string[]>>;

/** Only resolves missing original choices. Never reconstructs a level-up draft or changes skills. */
export function legacyToolChoiceEditor(character: CharacterDocument, catalog: BuilderCatalog) {
  const sources: { sourceId: string; minimum: number; maximum: number; options: string[] }[] = [];
  const issues: string[] = [];
  if (character.build.toolProficiencyChoices !== undefined)
    return { sources, issues: ["Original tool choices are already recorded."], used: [] };
  const rootIds = [character.build.levels[0]?.classId, character.build.backgroundId].filter(
    (id): id is string => id !== undefined,
  );
  if (
    !Object.values(catalog.classes).some(({ id }) => id === character.build.levels[0]?.classId) ||
    !character.build.backgroundId ||
    !catalog.backgrounds[character.build.backgroundId]
  )
    issues.push("The original class and background must be supported before recording tools.");
  for (const sourceId of rootIds) {
    const definition = catalog.toolChoices[sourceId];
    if (definition) sources.push({ sourceId, ...definition });
  }
  const acquisitions = character.build.levels.flatMap((level) => level.featSelections ?? []);
  const counts = new Map<string, number>();
  for (const id of character.build.featIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const selection of acquisitions) {
    const remaining = (counts.get(selection.featId) ?? 0) - 1;
    counts.set(selection.featId, remaining);
    if (remaining < 0) issues.push("Feat acquisition history does not match the saved feats.");
    const feat = catalog.feats[selection.featId];
    if (feat?.allowsTools) {
      const amount = (selection.skillIds?.length ?? 0) + (selection.toolIds?.length ?? 0);
      if (
        amount < feat.skillMinimum ||
        amount > feat.skillMaximum ||
        selection.skillIds?.some(
          (id) =>
            !character.build.proficiencyChoices.skills.some(
              (skill) => skill.skillId === id && skill.sourceId === selection.featId,
            ),
        )
      )
        issues.push(
          "Repair incomplete feat proficiency acquisition records before recording original tools.",
        );
    }
  }
  for (const [id, count] of counts) {
    const feat = catalog.feats[id];
    if (count <= 0 || !feat?.allowsTools) continue;
    // Without acquisition records, a later Skilled grant cannot safely be treated as original.
    const ambiguous = character.build.levels.some((level, index) => {
      const definition = Object.values(catalog.classes).find(({ id }) => id === level.classId);
      const classLevel = character.build.levels
        .slice(0, index + 1)
        .filter(({ classId }) => classId === level.classId).length;
      return (
        definition?.abilityScoreImprovementLevels.includes(classLevel) &&
        !level.featSelections?.length
      );
    });
    const species = character.build.speciesId
      ? catalog.species[character.build.speciesId]
      : undefined;
    const background = character.build.backgroundId
      ? catalog.backgrounds[character.build.backgroundId]
      : undefined;
    const maximumOriginal = (background?.featId === id ? 1 : 0) + (species?.originFeatMaximum ?? 0);
    const originalSkills =
      character.build.proficiencyChoices.skills.filter(({ sourceId }) => sourceId === id).length -
      acquisitions.filter(({ featId }) => featId === id).flatMap(({ skillIds }) => skillIds ?? [])
        .length;
    if (
      ambiguous ||
      count > maximumOriginal ||
      originalSkills < 0 ||
      originalSkills > feat.skillMaximum * count
    ) {
      issues.push(
        "Original feat tool choices are ambiguous. Repair the feat acquisition history before recording tools.",
      );
      continue;
    }
    sources.push({
      sourceId: id,
      minimum: Math.max(0, feat.skillMinimum * count - originalSkills),
      maximum: Math.max(0, feat.skillMaximum * count - originalSkills),
      options: Object.keys(catalog.tools),
    });
  }
  const used = [
    ...rootIds.flatMap((id) => catalog.fixedToolIds[id] ?? []),
    ...acquisitions.flatMap(({ toolIds }) => toolIds ?? []),
  ];
  return { sources, issues, used };
}

export function legacyToolCandidates(
  editor: ReturnType<typeof legacyToolChoiceEditor>,
  selections: ToolSelections,
  sourceId: string,
) {
  const used = new Set([
    ...editor.used,
    ...Object.entries(selections).flatMap(([id, tools]) => (id === sourceId ? [] : tools)),
  ]);
  return (editor.sources.find((source) => source.sourceId === sourceId)?.options ?? []).filter(
    (id) => !used.has(id),
  );
}

export function validateLegacyToolChoices(
  character: CharacterDocument,
  catalog: BuilderCatalog,
  selections: ToolSelections,
): string[] {
  const editor = legacyToolChoiceEditor(character, catalog);
  const issues = [...editor.issues];
  if (Object.keys(selections).some((id) => !editor.sources.some(({ sourceId }) => sourceId === id)))
    issues.push("Tool choices must come from a granted original source.");
  for (const source of editor.sources) {
    const tools = selections[source.sourceId] ?? [];
    if (
      tools.length < source.minimum ||
      tools.length > source.maximum ||
      new Set(tools).size !== tools.length ||
      tools.some((id) => !legacyToolCandidates(editor, selections, source.sourceId).includes(id))
    )
      issues.push("Choose the required distinct eligible tools for each source.");
  }
  return issues;
}

export function proposeLegacyToolChoices(
  character: CharacterDocument,
  catalog: BuilderCatalog,
  rulesPackage: LoadedRulesPackage,
  selections: ToolSelections,
  updatedAt = new Date(),
): { issues: string[]; nextCharacter?: CharacterDocument } {
  const issues = validateLegacyToolChoices(character, catalog, selections);
  if (issues.length) return { issues };
  const editor = legacyToolChoiceEditor(character, catalog);
  const nextCharacter = characterDocumentSchema.parse({
    ...character,
    build: {
      ...character.build,
      toolProficiencyChoices: editor.sources.map(({ sourceId }) => ({
        sourceId,
        toolIds: selections[sourceId] ?? [],
      })),
    },
    metadata: {
      ...character.metadata,
      updatedAt: updatedAt.toISOString(),
      revision: character.metadata.revision + 1,
    },
  });
  // Permit unrelated legacy warnings/errors, but never introduce a new validation error.
  const errorKey = (validation: ReturnType<typeof evaluateCharacter>["validations"][number]) =>
    JSON.stringify([validation.code, validation.paths, validation.message]);
  const before = new Set(
    evaluateCharacter({ character, packages: [rulesPackage] })
      .validations.filter(({ severity }) => severity === "error")
      .map(errorKey),
  );
  const errors = evaluateCharacter({
    character: nextCharacter,
    packages: [rulesPackage],
  }).validations.filter(
    (validation) =>
      validation.severity === "error" &&
      (validation.code.startsWith("TOOL_") ||
        validation.code === "DUPLICATE_TOOL_PROFICIENCY" ||
        !before.has(errorKey(validation))),
  );
  if (errors.length) return { issues: errors.map((error) => error.message.en ?? error.code) };
  return { issues: [], nextCharacter };
}

import type { BuilderCatalog, CharacterBuilderDraft } from "./character-builder";

export function toolSources(draft: CharacterBuilderDraft, catalog: BuilderCatalog) {
  const result = [draft.classId, draft.backgroundId].flatMap((sourceId) => {
    const definition = catalog.toolChoices[sourceId];
    return definition ? [{ sourceId, ...definition }] : [];
  });
  const feat = catalog.feats[draft.originFeatId];
  if (feat?.allowsTools)
    result.push({
      sourceId: feat.id,
      minimum: Math.max(0, feat.skillMinimum - draft.originFeatSkillIds.length),
      maximum: Math.max(0, feat.skillMaximum - draft.originFeatSkillIds.length),
      options: Object.keys(catalog.tools),
    });
  return result;
}

function fixedTools(draft: CharacterBuilderDraft, catalog: BuilderCatalog): string[] {
  return [draft.classId, draft.backgroundId].flatMap((id) => catalog.fixedToolIds[id] ?? []);
}

export function sourceToolCandidates(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  sourceId: string,
): string[] {
  const used = new Set([
    ...fixedTools(draft, catalog),
    ...Object.entries(draft.toolProficiencySelections ?? {}).flatMap(([id, tools]) =>
      id === sourceId ? [] : tools,
    ),
    ...draft.advancementFeats.flatMap((selection) => selection.toolIds ?? []),
  ]);
  return (
    toolSources(draft, catalog).find((source) => source.sourceId === sourceId)?.options ?? []
  ).filter((id) => !used.has(id));
}

export function advancementToolCandidates(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
  index: number,
): string[] {
  if (!catalog.feats[draft.advancementFeats[index]?.featId ?? ""]?.allowsTools) return [];
  const used = new Set([
    ...fixedTools(draft, catalog),
    ...Object.values(draft.toolProficiencySelections ?? {}).flat(),
    ...draft.advancementFeats.flatMap((selection, position) =>
      position === index ? [] : (selection.toolIds ?? []),
    ),
  ]);
  return Object.keys(catalog.tools).filter((id) => !used.has(id));
}

/** Used only when origins change; never fill an in-progress picker or rewrite saved history. */
export function reconcileToolProficiencies(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): CharacterBuilderDraft {
  if (draft.toolProficiencySelections === undefined) return draft;
  const selections: Record<string, string[]> = {};
  const used = new Set([
    ...fixedTools(draft, catalog),
    ...draft.advancementFeats.flatMap((selection) => selection.toolIds ?? []),
  ]);
  for (const source of toolSources(draft, catalog)) {
    const candidates = source.options.filter((id) => !used.has(id));
    const current = (draft.toolProficiencySelections[source.sourceId] ?? []).filter(
      (id, index, ids) => candidates.includes(id) && ids.indexOf(id) === index,
    );
    const chosen =
      source.sourceId === draft.originFeatId
        ? current.slice(0, catalog.feats[draft.originFeatId]?.skillMaximum ?? 0)
        : [...current, ...candidates.filter((id) => !current.includes(id))].slice(
            0,
            source.maximum,
          );
    selections[source.sourceId] = chosen;
    chosen.forEach((id) => used.add(id));
  }
  const feat = catalog.feats[draft.originFeatId];
  return {
    ...draft,
    toolProficiencySelections: selections,
    originFeatSkillIds: draft.originFeatSkillIds.slice(
      0,
      Math.max(0, (feat?.skillMaximum ?? 0) - (selections[draft.originFeatId]?.length ?? 0)),
    ),
  };
}

export function validateToolProficiencies(
  draft: CharacterBuilderDraft,
  catalog: BuilderCatalog,
): string[] {
  const issues: string[] = [];
  if (draft.toolProficiencySelections !== undefined) {
    const sources = toolSources(draft, catalog);
    if (
      Object.keys(draft.toolProficiencySelections).some(
        (id) => !sources.some((source) => source.sourceId === id),
      )
    )
      issues.push("Remove tool choices from sources that no longer grant them.");
    for (const source of sources) {
      const selected = draft.toolProficiencySelections[source.sourceId] ?? [];
      if (
        selected.length < source.minimum ||
        selected.length > source.maximum ||
        new Set(selected).size !== selected.length ||
        selected.some((id) => !sourceToolCandidates(draft, catalog, source.sourceId).includes(id))
      )
        issues.push("Choose the required distinct tool proficiencies for each source.");
    }
  }
  for (const [index, selection] of draft.advancementFeats.entries()) {
    const selected = selection.toolIds ?? [];
    if (
      new Set(selected).size !== selected.length ||
      selected.some((id) => !advancementToolCandidates(draft, catalog, index).includes(id))
    )
      issues.push("Choose distinct eligible tools for each feat acquisition.");
  }
  return issues;
}

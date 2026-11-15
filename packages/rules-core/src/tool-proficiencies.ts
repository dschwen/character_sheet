import { z } from "zod";
import type { CharacterDocument } from "@dnd/character-model";
import {
  eligibleToolIds,
  toolBodySchema,
  toolProficiencyChoiceSchema,
  type ContentEntity,
} from "@dnd/content-schema";

const sourceBody = z
  .object({
    toolProficiencies: z.array(z.string()).default([]),
    proficiencyChoice: z
      .object({ minimum: z.number(), maximum: z.number(), categories: z.array(z.string()) })
      .optional(),
  })
  .passthrough();

export function resolveToolGrants(
  character: CharacterDocument,
  entities: ReadonlyMap<string, ContentEntity>,
  report: (code: string, message: string) => void,
) {
  const all = [...entities.values()];
  const tools = all.filter(
    (entity) => entity.kind === "tool" && toolBodySchema.safeParse(entity.body).success,
  );
  const classId = character.build.levels[0]?.classId;
  const rootIds = [classId, character.build.backgroundId].filter(
    (id): id is string => id !== undefined,
  );
  const acquisitions = character.build.levels.flatMap((level) => level.featSelections ?? []);
  const grants: { name: string; sourceId: string; toolId?: string; checkId?: string }[] =
    rootIds.flatMap((sourceId) => {
      const body = sourceBody.safeParse(entities.get(sourceId)?.body);
      return body.success
        ? body.data.toolProficiencies.map((name) => {
            const tool = tools.find((candidate) => candidate.name.en === name);
            return {
              name,
              sourceId,
              ...(tool
                ? { toolId: tool.id, checkId: toolBodySchema.parse(tool.body).checkId }
                : {}),
            };
          })
        : [];
    });
  const used = new Set(grants.flatMap((grant) => (grant.toolId ? [grant.toolId] : [])));
  function add(ids: string[], sourceId: string, allowed: readonly string[]) {
    for (const id of ids) {
      const tool = entities.get(id);
      if (
        tool?.kind !== "tool" ||
        !allowed.includes(id) ||
        !toolBodySchema.safeParse(tool.body).success
      ) {
        report(
          "TOOL_PROFICIENCY_NOT_ALLOWED",
          "Choose a loaded tool from this source's eligible pool.",
        );
        continue;
      }
      if (used.has(id)) {
        report(
          "DUPLICATE_TOOL_PROFICIENCY",
          "A chosen tool proficiency must not duplicate another grant.",
        );
        continue;
      }
      used.add(id);
      grants.push({
        name: tool.name.en ?? id,
        sourceId,
        toolId: id,
        checkId: toolBodySchema.parse(tool.body).checkId,
      });
    }
  }
  const expected = new Map<string, { minimum: number; maximum: number; options: string[] }>();
  for (const sourceId of rootIds) {
    const raw = z.record(z.unknown()).safeParse(entities.get(sourceId)?.body);
    const parsed = toolProficiencyChoiceSchema.safeParse(
      raw.success ? raw.data.toolProficiencyChoice : undefined,
    );
    if (parsed.success)
      expected.set(sourceId, { ...parsed.data, options: eligibleToolIds(parsed.data, all) });
  }
  for (const id of new Set(character.build.featIds)) {
    const count =
      character.build.featIds.filter((featId) => featId === id).length -
      acquisitions.filter((selection) => selection.featId === id).length;
    const parsed = sourceBody.safeParse(entities.get(id)?.body);
    const definition = parsed.success ? parsed.data.proficiencyChoice : undefined;
    if (count <= 0 || !definition?.categories.includes("tool")) continue;
    const skills =
      character.build.proficiencyChoices.skills.filter(({ sourceId }) => sourceId === id).length -
      acquisitions
        .filter((selection) => selection.featId === id)
        .flatMap((selection) => selection.skillIds ?? []).length;
    expected.set(id, {
      minimum: Math.max(0, definition.minimum * count - skills),
      maximum: Math.max(0, definition.maximum * count - skills),
      options: tools.map((tool) => tool.id),
    });
  }
  const recorded = character.build.toolProficiencyChoices;
  if (recorded !== undefined) {
    const seen = new Set<string>();
    for (const choice of recorded) {
      const definition = expected.get(choice.sourceId);
      if (!definition || seen.has(choice.sourceId)) {
        report(
          "TOOL_PROFICIENCY_SOURCE_NOT_GRANTED",
          "Tool choices require a distinct granted source.",
        );
        continue;
      }
      seen.add(choice.sourceId);
      if (choice.toolIds.length < definition.minimum || choice.toolIds.length > definition.maximum)
        report(
          "TOOL_PROFICIENCY_COUNT",
          "Record the required number of tool choices for each source.",
        );
      add(choice.toolIds, choice.sourceId, definition.options);
    }
    for (const [id, definition] of expected)
      if (!seen.has(id) && definition.minimum > 0)
        report(
          "TOOL_PROFICIENCY_COUNT",
          "Record the required number of tool choices for each source.",
        );
  }
  for (const selection of acquisitions) {
    const parsed = sourceBody.safeParse(entities.get(selection.featId)?.body);
    const allowed =
      parsed.success && parsed.data.proficiencyChoice?.categories.includes("tool")
        ? tools.map((tool) => tool.id)
        : [];
    add(selection.toolIds ?? [], selection.featId, allowed);
  }
  return grants;
}

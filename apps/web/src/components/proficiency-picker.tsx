import type { BuilderCatalog, CharacterBuilderDraft } from "../lib/character-builder";
import { skillIds } from "../lib/character-builder";
import { shortEntityName } from "../lib/presentation";
import { sourceToolCandidates, toolSources } from "../lib/tool-proficiencies";

export function ProficiencyPicker({
  label,
  maximum,
  skillOptions,
  toolOptions,
  skills,
  tools,
  onChange,
}: {
  label: string;
  maximum: number;
  skillOptions: { id: string; name: string }[];
  toolOptions: { id: string; name: string }[];
  skills: string[];
  tools: string[];
  onChange: (selection: { skills: string[]; tools: string[] }) => void;
}) {
  const count = skills.length + tools.length;
  return (
    <fieldset className="builder-subsection" aria-label={label}>
      <legend>
        {label} · {String(count)} / {String(maximum)}
      </legend>
      <p>
        Choose distinct proficiencies. Skills and tools share this allowance; owning a tool is
        separate.
      </p>
      <div className="builder-token-grid">
        {[
          ...skillOptions.map((option) => ({ ...option, kind: "skill" })),
          ...toolOptions.map((option) => ({ ...option, kind: "tool" })),
        ].map((option) => {
          const chosen = (option.kind === "skill" ? skills : tools).includes(option.id);
          return (
            <button
              type="button"
              key={option.id}
              aria-pressed={chosen}
              className={chosen ? "selected" : undefined}
              disabled={!chosen && maximum > 1 && count >= maximum}
              onClick={() => {
                const current = option.kind === "skill" ? skills : tools;
                const next = chosen
                  ? current.filter((id) => id !== option.id)
                  : maximum === 1
                    ? [option.id]
                    : [...current, option.id];
                onChange({
                  skills: option.kind === "skill" ? next : skills,
                  tools: option.kind === "tool" ? next : tools,
                });
              }}
            >
              {option.kind === "tool" ? "Tool: " : ""}
              {option.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ToolProficiencyChoices({
  draft,
  catalog,
  onChange,
}: {
  draft: CharacterBuilderDraft;
  catalog: BuilderCatalog;
  onChange: (draft: CharacterBuilderDraft) => void;
}) {
  if (draft.toolProficiencySelections === undefined) return null;
  return (
    <>
      {toolSources(draft, catalog)
        .filter(({ sourceId }) => sourceId !== draft.originFeatId)
        .map((source) => (
          <ProficiencyPicker
            key={source.sourceId}
            label={`${shortEntityName(source.sourceId)} tool choices`}
            maximum={source.maximum}
            skillOptions={[]}
            toolOptions={sourceToolCandidates(draft, catalog, source.sourceId).map((id) => ({
              id,
              name: catalog.tools[id]?.name ?? id,
            }))}
            skills={[]}
            tools={draft.toolProficiencySelections?.[source.sourceId] ?? []}
            onChange={({ tools }) => {
              onChange({
                ...draft,
                toolProficiencySelections: {
                  ...draft.toolProficiencySelections,
                  [source.sourceId]: tools,
                },
              });
            }}
          />
        ))}
    </>
  );
}

export function OriginProficiencyChoices({
  draft,
  catalog,
  onChange,
}: {
  draft: CharacterBuilderDraft;
  catalog: BuilderCatalog;
  onChange: (draft: CharacterBuilderDraft) => void;
}) {
  const feat = catalog.feats[draft.originFeatId];
  if (!feat || feat.skillMaximum === 0) return null;
  const used = new Set([
    ...(catalog.backgrounds[draft.backgroundId]?.skillIds ?? []),
    ...draft.classSkillIds,
    ...draft.speciesSkillIds,
    ...draft.advancementFeats.flatMap((selection) => selection.skillIds ?? []),
  ]);
  return (
    <ProficiencyPicker
      label={`${feat.name} origin proficiency choices`}
      maximum={feat.skillMaximum}
      skillOptions={skillIds
        .map((id) => `srd521.skill.${id}`)
        .filter((id) => !used.has(id))
        .map((id) => ({ id, name: shortEntityName(id) }))}
      toolOptions={
        feat.allowsTools
          ? sourceToolCandidates(draft, catalog, feat.id).map((id) => ({
              id,
              name: catalog.tools[id]?.name ?? id,
            }))
          : []
      }
      skills={draft.originFeatSkillIds}
      tools={draft.toolProficiencySelections?.[feat.id] ?? []}
      onChange={({ skills, tools }) => {
        onChange({
          ...draft,
          originFeatSkillIds: skills,
          toolProficiencySelections: { ...draft.toolProficiencySelections, [feat.id]: tools },
        });
      }}
    />
  );
}

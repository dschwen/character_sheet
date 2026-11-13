import {
  advancementOptions,
  advancementSkillCandidates,
  type BuilderCatalog,
  type CharacterBuilderDraft,
  type MagicInitiateSelection,
} from "../lib/character-builder";
import { shortEntityName, titleCase } from "../lib/presentation";
import { featSelectionKey, type AdvancementFeatSelection } from "../lib/advancement-feats";

export function AdvancementFeatSelect({
  draft,
  catalog,
  index,
  onChange,
  onMagicChange,
  showSpellChoices = true,
}: {
  draft: CharacterBuilderDraft;
  catalog: BuilderCatalog;
  index: number;
  onChange: (selection: AdvancementFeatSelection) => void;
  onMagicChange?: (featId: string, selection: Partial<MagicInitiateSelection>) => void;
  showSpellChoices?: boolean;
}) {
  const selected = draft.advancementFeats[index];
  const options = advancementOptions(draft, catalog, index);
  const value = selected === undefined ? "" : featSelectionKey(selected);
  const feat = selected === undefined ? undefined : catalog.feats[selected.featId];
  return (
    <>
      <label className="builder-field compact-field">
        Level {String(catalog.classes[draft.classId].abilityScoreImprovementLevels[index])} Feat
        <select
          value={value}
          onChange={(event) => {
            const option = options.find((candidate) => candidate.value === event.target.value);
            if (option !== undefined) onChange(structuredClone(option.selection));
          }}
        >
          {!options.some((option) => option.value === value) ? (
            <option value={value}>Choose a legal feat and ability increase</option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <small>
          Origin, General, and qualifying Fighting Style feats use the same acquisition rules.
          Prerequisites are checked before this feat’s increase.
        </small>
        {feat?.editionReference === undefined ? null : (
          <small>
            Out-of-SRD edition reference: {feat.editionReference.edition}{" "}
            {feat.editionReference.book} — not SRD 5.2.1 content. Reference:{" "}
            {feat.editionReference.referenceUrl}
          </small>
        )}
        {feat?.advancement?.combatGuidance.map((guidance) => (
          <small key={guidance}>{guidance}</small>
        ))}
      </label>
      {selected !== undefined && (feat?.skillMaximum ?? 0) > 0 ? (
        <fieldset
          className="builder-subsection"
          aria-label={`${feat?.name ?? "Feat"} skill choices`}
        >
          <legend>
            Feat skills · {String(selected.skillIds?.length ?? 0)} / {String(feat?.skillMaximum)}
          </legend>
          <p>
            Choose distinct skill proficiencies. Tool choices are not implemented in this skill-only
            slice.
          </p>
          <div className="builder-token-grid">
            {advancementSkillCandidates(draft, catalog, index).map((id) => {
              const chosen = selected.skillIds?.includes(id) === true;
              return (
                <button
                  type="button"
                  key={id}
                  className={chosen ? "selected" : undefined}
                  disabled={
                    !chosen && (selected.skillIds?.length ?? 0) >= (feat?.skillMaximum ?? 0)
                  }
                  onClick={() => {
                    onChange({
                      ...selected,
                      skillIds: chosen
                        ? selected.skillIds?.filter((skillId) => skillId !== id)
                        : [...(selected.skillIds ?? []), id],
                    });
                  }}
                >
                  {shortEntityName(id)}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {showSpellChoices &&
      feat?.magicInitiate !== undefined &&
      draft.magicInitiateChoices[feat.id] !== undefined
        ? (() => {
            const definition = feat.magicInitiate;
            const selection = draft.magicInitiateChoices[feat.id];
            if (selection === undefined) return null;
            return (
              <fieldset className="builder-subsection" aria-label={`${feat.name} spell choices`}>
                <legend>{feat.name}</legend>
                <label className="builder-field compact-field">
                  Spellcasting ability
                  <select
                    value={selection.ability}
                    onChange={(event) => {
                      const ability = definition.abilityIds.find((id) => id === event.target.value);
                      if (ability) onMagicChange?.(feat.id, { ability });
                    }}
                  >
                    {definition.abilityIds.map((ability) => (
                      <option key={ability} value={ability}>
                        {titleCase(ability)}
                      </option>
                    ))}
                  </select>
                </label>
                <p>Choose {String(definition.cantripMaximum)} cantrips.</p>
                <div className="builder-token-grid">
                  {definition.cantrips.map((spell) => {
                    const chosen = selection.cantripIds.includes(spell.id);
                    return (
                      <button
                        type="button"
                        key={spell.id}
                        className={chosen ? "selected" : undefined}
                        disabled={
                          !chosen && selection.cantripIds.length >= definition.cantripMaximum
                        }
                        onClick={() => {
                          onMagicChange?.(feat.id, {
                            cantripIds: chosen
                              ? selection.cantripIds.filter((id) => id !== spell.id)
                              : [...selection.cantripIds, spell.id],
                          });
                        }}
                      >
                        {spell.name}
                      </button>
                    );
                  })}
                </div>
                <label className="builder-field compact-field">
                  Level 1 spell
                  <select
                    value={selection.levelOneSpellId}
                    onChange={(event) => {
                      onMagicChange?.(feat.id, { levelOneSpellId: event.target.value });
                    }}
                  >
                    {definition.levelOneSpells.map((spell) => (
                      <option key={spell.id} value={spell.id}>
                        {spell.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            );
          })()
        : null}
    </>
  );
}

import {
  advancementOptions,
  type BuilderCatalog,
  type CharacterBuilderDraft,
} from "../lib/character-builder";
import { featSelectionKey, type AdvancementFeatSelection } from "../lib/advancement-feats";

export function AdvancementFeatSelect({
  draft,
  catalog,
  index,
  onChange,
}: {
  draft: CharacterBuilderDraft;
  catalog: BuilderCatalog;
  index: number;
  onChange: (selection: AdvancementFeatSelection) => void;
}) {
  const selected = draft.advancementFeats[index];
  const options = advancementOptions(draft, catalog, index);
  const value = selected === undefined ? "" : featSelectionKey(selected);
  const feat = selected === undefined ? undefined : catalog.feats[selected.featId];
  return (
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
        Prerequisites are checked before this feat’s increase. Additional feat categories are not
        yet supported here.
      </small>
      {feat?.editionReference === undefined ? null : (
        <small>
          Out-of-SRD edition reference: {feat.editionReference.edition} {feat.editionReference.book}{" "}
          — not SRD 5.2.1 content. Reference: {feat.editionReference.referenceUrl}
        </small>
      )}
      {feat?.advancement?.combatGuidance.map((guidance) => (
        <small key={guidance}>{guidance}</small>
      ))}
    </label>
  );
}

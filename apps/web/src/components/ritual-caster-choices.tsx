import {
  ritualCasterBounds,
  ritualCasterFeatIds,
  ritualCasterInitialCandidates,
  ritualCasterResearchCandidates,
  updateRitualCasterSelection,
  type BuilderCatalog,
  type CharacterBuilderDraft,
} from "../lib/character-builder";

/**
 * The ritual spell book for any Ritual Caster variant this draft carries. Both records are
 * out-of-SRD edition references (ADR 0013), so the variant label and the provenance note are
 * rendered here as well as in the feat picker.
 */
export function RitualCasterChoices({
  draft,
  catalog,
  setDraft,
  levelUp = false,
}: {
  draft: CharacterBuilderDraft;
  catalog: BuilderCatalog;
  setDraft: (update: (value: CharacterBuilderDraft) => CharacterBuilderDraft) => void;
  levelUp?: boolean;
}) {
  const featIds = ritualCasterFeatIds(draft, catalog);
  if (featIds.length === 0) return null;
  return (
    <>
      {featIds.map((featId) => {
        const feat = catalog.feats[featId];
        const definition = feat?.ritualCaster;
        const selection = draft.ritualCasterChoices[featId];
        if (feat === undefined || definition === undefined || selection === undefined) return null;
        const bounds = ritualCasterBounds(definition, draft, catalog, featId);
        const candidates = ritualCasterInitialCandidates(draft, catalog, featId);
        const is2014 = definition.edition === "2014";
        const researchNames = new Map(
          ritualCasterResearchCandidates(draft, catalog, featId).map((spell) => [
            spell.id,
            spell.name,
          ]),
        );
        return (
          <div className="builder-subsection" key={featId}>
            <div className="builder-section-heading">
              <div>
                <span>Ritual spell book</span>
                <h3>{feat.name}</h3>
              </div>
              <small>
                {is2014
                  ? "Level 1 spells from the chosen class list · exactly two"
                  : `Level 1 Ritual-tagged spells · select ${String(bounds.minimum)}–${String(bounds.maximum)} (Proficiency Bonus ${String(bounds.maximum)})`}
              </small>
            </div>
            {feat.editionReference === undefined ? null : (
              <small>
                Out-of-SRD edition reference: {feat.editionReference.edition}{" "}
                {feat.editionReference.book} — not SRD 5.2.1 content. Reference:{" "}
                {feat.editionReference.referenceUrl}
              </small>
            )}
            {is2014 ? (
              <label className="builder-field compact-field">
                Spell list class
                <select
                  value={selection.listClassId}
                  disabled={levelUp}
                  onChange={(event) => {
                    setDraft((value) =>
                      updateRitualCasterSelection(value, catalog, featId, {
                        listClassId: event.target.value,
                      }),
                    );
                  }}
                >
                  {definition.classListOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <small>
                  {levelUp
                    ? "The chosen class list and its casting ability are fixed with this feat."
                    : "Granted spells come from this class's list and use its spellcasting ability."}
                </small>
              </label>
            ) : null}
            <div className="builder-spell-group">
              <strong>
                Level 1 ritual spells · {String(selection.spellIds.length)}
                {is2014
                  ? ` of ${String(bounds.maximum)}`
                  : ` selected (select ${String(bounds.minimum)}–${String(bounds.maximum)})`}
              </strong>
              <div className="builder-token-grid">
                {candidates.map((spell) => {
                  const selected = selection.spellIds.includes(spell.id);
                  return (
                    <button
                      key={spell.id}
                      type="button"
                      className={selected ? "selected" : undefined}
                      disabled={
                        (is2014 && levelUp) ||
                        (!selected && selection.spellIds.length >= bounds.maximum) ||
                        (!is2014 && levelUp && selected)
                      }
                      onClick={() => {
                        setDraft((value) => {
                          const current = value.ritualCasterChoices[featId];
                          if (current === undefined) return value;
                          return updateRitualCasterSelection(value, catalog, featId, {
                            spellIds: selected
                              ? current.spellIds.filter((id) => id !== spell.id)
                              : [...current.spellIds, spell.id],
                          });
                        });
                      }}
                    >
                      {spell.name}
                    </button>
                  );
                })}
              </div>
              {levelUp && !is2014 ? (
                <small>
                  {bounds.maximum > selection.spellIds.length
                    ? `Earlier selections are locked; this level opens ${String(
                        bounds.maximum - selection.spellIds.length,
                      )} new selection${
                        bounds.maximum - selection.spellIds.length === 1 ? "" : "s"
                      }.`
                    : "Earlier selections are locked; this level adds no Proficiency Bonus growth, so no new spell can be added."}
                </small>
              ) : null}
            </div>
            {is2014 ? (
              <div className="builder-spell-group">
                <strong>Researched spells · {String(selection.researchSpellIds.length)}</strong>
                {selection.researchSpellIds.length === 0 ? null : (
                  <div className="builder-token-grid">
                    {selection.researchSpellIds.map((spellId) => (
                      <button key={spellId} type="button" className="selected" disabled>
                        {researchNames.get(spellId) ?? spellId}
                      </button>
                    ))}
                  </div>
                )}
                <small>
                  Researching new spells happens during play; the builder and level-up never add or
                  remove these records.
                </small>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

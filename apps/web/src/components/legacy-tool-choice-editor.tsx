"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterDocument } from "@dnd/character-model";
import type { LoadedRulesPackage } from "@dnd/rules-api";
import type { BuilderCatalog } from "../lib/character-builder";
import {
  legacyToolCandidates,
  legacyToolChoiceEditor,
  proposeLegacyToolChoices,
  validateLegacyToolChoices,
  type ToolSelections,
} from "../lib/legacy-tool-choices";
import { shortEntityName } from "../lib/presentation";
import { ProficiencyPicker } from "./proficiency-picker";

export function LegacyToolChoiceEditor({
  character,
  catalog,
  rulesPackage,
  onCancel,
  onComplete,
}: {
  character: CharacterDocument;
  catalog: BuilderCatalog;
  rulesPackage: LoadedRulesPackage;
  onCancel: () => void;
  onComplete: (character: CharacterDocument) => void;
}) {
  const [selections, setSelections] = useState<ToolSelections>({});
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);
  const [applyIssues, setApplyIssues] = useState<string[]>([]);
  const editor = legacyToolChoiceEditor(character, catalog);
  const issues = validateLegacyToolChoices(character, catalog, selections);
  return (
    <dialog
      ref={dialog}
      className="builder-shell tool-choice-editor"
      aria-label="Record missing tool choices"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <header className="builder-header">
        <strong>Record tools for {character.name}</strong>
        <button type="button" onClick={onCancel} aria-label="Cancel tool choices">
          ×
        </button>
      </header>
      <section className="builder-content">
        <h2>Missing original tool choices</h2>
        <p>
          Choose only the proficiencies originally granted to this character. Existing skills, fixed
          tool grants and later feat acquisitions stay locked. No tools or equipment are granted
          until you apply.
        </p>
        {editor.issues.length === 0
          ? editor.sources.map((source) =>
              source.maximum === 0 ? (
                <p key={source.sourceId}>
                  {shortEntityName(source.sourceId)}: existing skills already fill this allowance.
                </p>
              ) : (
                <ProficiencyPicker
                  key={source.sourceId}
                  label={`${shortEntityName(source.sourceId)} missing tools`}
                  maximum={source.maximum}
                  skillOptions={[]}
                  skills={[]}
                  toolOptions={legacyToolCandidates(editor, selections, source.sourceId).map(
                    (id) => ({ id, name: catalog.tools[id]?.name ?? id }),
                  )}
                  tools={selections[source.sourceId] ?? []}
                  onChange={({ tools }) => {
                    setSelections({ ...selections, [source.sourceId]: tools });
                    setApplyIssues([]);
                  }}
                />
              ),
            )
          : null}
        {editor.sources.length === 0 && editor.issues.length === 0 ? (
          <p>
            No missing original tool grants apply. You can confirm this record without adding
            proficiencies.
          </p>
        ) : null}
        {[...issues, ...applyIssues].length ? (
          <ul className="builder-issues" aria-label="Tool choice issues">
            {[...new Set([...issues, ...applyIssues])].map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
        <div className="builder-footer">
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={issues.length > 0}
            onClick={() => {
              const proposal = proposeLegacyToolChoices(
                character,
                catalog,
                rulesPackage,
                selections,
              );
              if (proposal.nextCharacter) onComplete(proposal.nextCharacter);
              else setApplyIssues(proposal.issues);
            }}
          >
            Apply tool choices
          </button>
        </div>
      </section>
    </dialog>
  );
}

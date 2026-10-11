"use client";
import type { AttackSummary } from "@dnd/rules-api";
import { titleCase } from "../lib/presentation";

export function WeaponMasteryControls({
  attack,
  property,
  busy,
  onChange,
  onExplain,
}: {
  attack: AttackSummary;
  property: string;
  busy: boolean;
  onChange: (property: string) => void;
  onExplain: (traceId: string) => void;
}) {
  const mastery = attack.mastery;
  if (!mastery?.enabled || mastery.replacements === undefined) return null;
  return (
    <label>
      Mastery for this attack
      <select
        value={property}
        disabled={busy}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        aria-label={`Mastery for ${attack.name}`}
      >
        <option value="">{titleCase(mastery.property)} (original)</option>
        {mastery.replacements
          .filter((replacement) => replacement !== mastery.property)
          .map((replacement) => (
            <option key={replacement} value={replacement}>
              {titleCase(replacement)} (replacement)
            </option>
          ))}
      </select>
      <small>
        {titleCase(property || mastery.property)} replaces, never stacks with, the original mastery
        for the declared attack. Resolve the property's target effects manually; this does not
        change your mastered weapons. The selection resets after rolling the attack.
      </small>
      {mastery.replacementTraceId === undefined ? null : (
        <button
          type="button"
          className="button secondary compact"
          onClick={() => {
            onExplain(mastery.replacementTraceId ?? "");
          }}
        >
          Explain mastery options
        </button>
      )}
    </label>
  );
}

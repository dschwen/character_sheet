"use client";

import { useState } from "react";
import type { CharacterState } from "@dnd/character-model";
import { ordinaryFamiliarForms, pactFamiliarForms } from "@dnd/rules-core";
import { familiarStatBlock } from "../lib/familiar-stat-blocks";

export interface FamiliarDraft {
  form: string;
  otherForm: string;
  creatureType: string;
  maximumHitPoints: string;
}

export function FamiliarCastFields({
  pact,
  draft,
  update,
}: {
  pact: boolean;
  draft: FamiliarDraft;
  update: (value: Partial<FamiliarDraft>) => void;
}) {
  const forms = pact ? [...ordinaryFamiliarForms, ...pactFamiliarForms] : ordinaryFamiliarForms;
  const stats = familiarStatBlock(draft.form);
  return (
    <div className="effect-action-setup">
      <label>
        Familiar form
        <select
          value={draft.form}
          onChange={(event) => {
            update({ form: event.target.value, maximumHitPoints: "" });
          }}
        >
          <option value="">Choose a form</option>
          {forms.map((form) => (
            <option key={form}>{form}</option>
          ))}
          <option value="other">Other CR 0 Beast</option>
        </select>
      </label>
      {draft.form === "other" ? (
        <label>
          Other CR 0 Beast{" "}
          <input
            maxLength={80}
            value={draft.otherForm}
            onChange={(event) => {
              update({ otherForm: event.target.value });
            }}
          />
        </label>
      ) : null}
      <label>
        Familiar creature type
        <select
          value={draft.creatureType}
          onChange={(event) => {
            update({ creatureType: event.target.value });
          }}
        >
          <option value="">Choose a creature type</option>
          <option value="celestial">Celestial</option>
          <option value="fey">Fey</option>
          <option value="fiend">Fiend</option>
        </select>
      </label>
      <label>
        Familiar maximum HP{" "}
        <input
          type="number"
          min="1"
          step="1"
          value={stats === undefined ? draft.maximumHitPoints : String(stats.hitPoints)}
          readOnly={stats !== undefined}
          onChange={(event) => {
            update({ maximumHitPoints: event.target.value });
          }}
        />
      </label>
      {stats === undefined && draft.form === "other" ? (
        <small>Use the maximum HP from the chosen form’s stat block.</small>
      ) : null}
    </div>
  );
}

export function FamiliarControls({
  familiar,
  commandsDisabled,
  pact,
  save,
}: {
  familiar: NonNullable<CharacterState["familiar"]>;
  commandsDisabled: boolean;
  pact: boolean;
  save: (next: CharacterState["familiar"]) => void;
}) {
  const [hitPoints, setHitPoints] = useState(String(familiar.currentHitPoints));
  const present = familiar.presence === "present";
  const hp = Number(hitPoints);
  const stats = familiarStatBlock(familiar.form);
  return (
    <div className="effect-action-setup">
      <strong>{familiar.form}</strong>
      <small>
        {familiar.creatureType} ·{" "}
        {familiar.presence === "vanished" ? "Vanished at 0 HP" : familiar.presence}
      </small>
      <p>
        {String(familiar.currentHitPoints)} / {String(familiar.maximumHitPoints)} HP
      </p>
      {stats === undefined ? null : (
        <details open>
          <summary>
            {String(stats.armorClass)} AC · Speed {stats.speed}
          </summary>
          <p>{stats.senses}</p>
          {stats.traits?.map((trait) => (
            <p key={trait}>{trait}</p>
          ))}
          <strong>Stat block actions</strong>
          <p>
            {pact
              ? "When you take the Attack action, you can forgo one attack to let the familiar make one attack with its Reaction."
              : "Find Familiar prevents the familiar from attacking."}
          </p>
          <ul>
            {stats.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          <a
            href={`https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf#page=${String(stats.page)}`}
            target="_blank"
            rel="noreferrer"
          >
            Full stat block in SRD 5.2.1
          </a>
        </details>
      )}
      {present ? (
        <>
          <div className="effect-selection-action">
            <label>
              Familiar current HP{" "}
              <input
                type="number"
                step="1"
                min="0"
                max={familiar.maximumHitPoints}
                value={hitPoints}
                onChange={(event) => {
                  setHitPoints(event.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="button secondary compact"
              disabled={
                hitPoints.trim() === "" ||
                !Number.isSafeInteger(hp) ||
                hp < 0 ||
                hp > familiar.maximumHitPoints
              }
              onClick={() => {
                save({
                  ...familiar,
                  currentHitPoints: hp,
                  presence: hp === 0 ? "vanished" : "present",
                });
              }}
            >
              Set familiar HP
            </button>
          </div>
          <ul>
            <li>Telepathy within 100 feet. Share senses as a Bonus Action.</li>
            <li>Within 100 feet, the familiar can deliver your touch spell using its Reaction.</li>
            <li>The familiar rolls its own Initiative and takes its own turn.</li>
          </ul>
        </>
      ) : null}
      {familiar.presence === "vanished" ? (
        <small>Cast Find Familiar again to bring it back.</small>
      ) : null}
      <div className="effect-selection-action">
        {familiar.presence === "vanished" ? null : (
          <button
            type="button"
            className="button secondary compact"
            disabled={commandsDisabled}
            onClick={() => {
              save({ ...familiar, presence: present ? "dismissed" : "present" });
            }}
          >
            {present ? "Temporarily dismiss" : "Recall within 30 feet"}
          </button>
        )}
        <button
          type="button"
          className="button secondary compact"
          disabled={commandsDisabled}
          onClick={() => {
            save(undefined);
          }}
        >
          Dismiss forever
        </button>
      </div>
    </div>
  );
}

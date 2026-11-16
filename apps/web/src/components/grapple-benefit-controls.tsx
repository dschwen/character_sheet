"use client";

import { useState } from "react";
import type { CharacterEvaluation, GrappleBenefitSummary } from "@dnd/rules-api";
import {
  creatureSizes,
  resolveGrappleMovement,
  type GrappledTargetAttackRequest,
} from "@dnd/rules-core";
import { grappledTargetRollRequest, punchAndGrabDamageRequest } from "../lib/grappling";
import type { D20RollRequest, DicePoolRollRequest, DicePoolRollResult } from "../lib/dice-roll";

export function GrappleBenefitControls({
  evaluation,
  benefit,
  busy,
  sourceName,
  onRoll,
  onDamage,
  onNotice,
  onExplain,
}: {
  evaluation: CharacterEvaluation;
  benefit: GrappleBenefitSummary;
  busy: boolean;
  sourceName: (id: string) => string;
  onRoll: (request: D20RollRequest) => void;
  onDamage: (request: DicePoolRollRequest) => Promise<DicePoolRollResult | undefined>;
  onNotice: (notice: string) => void;
  onExplain: (traceId: string) => void;
}) {
  const [targetName, setTarget] = useState("");
  const [currentSize, setCurrentSize] = useState<(typeof creatureSizes)[number]>(
    creatureSizes.find((size) => size === evaluation.facts["species.size"]) ?? "medium",
  );
  const [targetSize, setTargetSize] = useState<(typeof creatureSizes)[number]>("medium");
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [critical, setCritical] = useState(false);
  const [damageType, setDamageType] = useState("");
  const [distance, setDistance] = useState("5");
  const [additionalAdvantage, setAdvantage] = useState(false);
  const [additionalDisadvantage, setDisadvantage] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const choices: { id: string; name: string; attack: GrappledTargetAttackRequest["attack"] }[] =
    evaluation.attacks.map((attack) => ({
      id: attack.id,
      name: attack.name,
      attack: { kind: "weapon", attackId: attack.id },
    }));
  const castingIds = [
    ...new Set([
      ...(evaluation.spellcasting ? [evaluation.spellcasting.classId] : []),
      ...evaluation.spells.flatMap((spell) =>
        (spell.castingOptions ?? []).map(({ sourceId }) => sourceId),
      ),
    ]),
  ];
  choices.push(
    ...castingIds.map((id) => ({
      id: `spell:${id}`,
      name: `Spell attack · ${sourceName(id)}`,
      attack: { kind: "spell" as const, castingSourceId: id },
    })),
  );
  const [choiceId, setChoiceId] = useState(choices[0]?.id ?? "");
  const unavailable =
    busy ||
    evaluation.facts["actions.disabled"] === true ||
    evaluation.facts["deathSave.dead"] === true ||
    evaluation.validations.some(({ severity }) => severity === "error");
  const unarmed = evaluation.attacks.find(
    ({ properties }) =>
      benefit.damageAndGrapple && properties.includes(benefit.damageAndGrapple.attackProperty),
  );
  const punchFlags = [
    "sizes",
    "hit",
    "attack-action",
    "own-turn",
    "unused-turn",
    "hand",
    "reach",
    "eligible",
  ];
  const named = targetName.trim().length > 0;
  function checkbox(key: string, label: string) {
    return (
      <label>
        <input
          type="checkbox"
          checked={confirmed[key] ?? false}
          onChange={(event) => {
            setConfirmed((current) => ({ ...current, [key]: event.target.checked }));
          }}
        />
        {label}
      </label>
    );
  }
  function sized() {
    if (!confirmed.sizes)
      throw new Error("Confirm actual current sizes, including transformations.");
    return {
      sourceId: benefit.sourceId,
      targetName,
      currentSize,
      targetSize,
      sizesConfirmed: true as const,
    };
  }
  async function punch() {
    setError("");
    try {
      if (!unarmed || !punchFlags.every((key) => confirmed[key]))
        throw new Error("Confirm every Punch and Grab requirement.");
      const request = punchAndGrabDamageRequest(evaluation, {
        ...sized(),
        attackId: unarmed.id,
        hitCreatureConfirmed: true,
        attackActionConfirmed: true,
        ownTurnConfirmed: true,
        unusedThisTurnConfirmed: true,
        freeHandConfirmed: true,
        withinReachConfirmed: true,
        targetEligibleConfirmed: true,
        critical,
        ...(damageType === "" ? {} : { damageType }),
      });
      const rolled = request.pool === undefined ? undefined : await onDamage(request.pool);
      if (request.pool !== undefined && rolled === undefined) return;
      const message = `${benefit.sourceName}: ${String(rolled?.total ?? request.fixedDamage)} Unarmed Strike ${request.result.damage.type} damage. ${request.result.instructions}${request.pool === undefined && critical ? " Fixed damage has no damage dice to double." : ""} Do not apply a second ordinary damage roll for this same hit.`;
      setReceipt(message);
      onNotice(message);
      setConfirmed({});
      setCritical(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resolve Punch and Grab.");
    }
  }
  return (
    <fieldset
      className="builder-subsection"
      aria-label={`${benefit.sourceName} declared combat benefits`}
    >
      <legend>{benefit.sourceName} · declared target benefits</legend>
      <p>
        These controls do not track creatures, turn use, positions or remaining movement. No benefit
        is applied globally. Ordinary attack buttons remain unchanged.
      </p>
      <button
        type="button"
        onClick={() => {
          onExplain(benefit.traceId);
        }}
      >
        Explain {benefit.sourceName} benefits
      </button>
      <label>
        Target creature
        <input
          value={targetName}
          maxLength={120}
          onChange={(event) => {
            setTarget(event.target.value);
            setConfirmed({});
            setReceipt("");
          }}
        />
      </label>
      {checkbox("held", "This specific creature is currently Grappled by me, not by someone else")}
      {benefit.targetAdvantage ? (
        <fieldset aria-label={benefit.targetAdvantage.name}>
          <legend>{benefit.targetAdvantage.name}</legend>
          <p>{benefit.targetAdvantage.instructions}</p>
          <p>
            Range, cover and nearby-hostile-creature Disadvantage remain manual, including for
            ranged spell attacks. Declare situational Disadvantage below.
          </p>
          <label>
            Declared attack
            <select
              value={choiceId}
              onChange={(event) => {
                setChoiceId(event.target.value);
              }}
            >
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={additionalAdvantage}
              onChange={(event) => {
                setAdvantage(event.target.checked);
              }}
            />
            Additional situational Advantage
          </label>
          <label>
            <input
              type="checkbox"
              checked={additionalDisadvantage}
              onChange={(event) => {
                setDisadvantage(event.target.checked);
              }}
            />
            Any additional situational Disadvantage applies
          </label>
          <button
            type="button"
            disabled={unavailable || !named || !confirmed.held}
            onClick={() => {
              setError("");
              try {
                const choice = choices.find(({ id }) => id === choiceId);
                if (!choice || !confirmed.held)
                  throw new Error("Confirm the specific grappled target and choose an attack.");
                onRoll(
                  grappledTargetRollRequest(
                    evaluation,
                    {
                      sourceId: benefit.sourceId,
                      targetName,
                      targetGrappledByYouConfirmed: true,
                      attack: choice.attack,
                      additionalAdvantage,
                      additionalDisadvantage,
                    },
                    choice.attack.kind === "spell" ? choice.name : `${choice.name} attack`,
                  ),
                );
                setConfirmed((current) => ({ ...current, held: false }));
                setAdvantage(false);
                setDisadvantage(false);
              } catch (error) {
                setError(error instanceof Error ? error.message : "Could not resolve attack.");
              }
            }}
          >
            Roll attack against declared grappled target
          </button>
        </fieldset>
      ) : null}
      {benefit.damageAndGrapple || benefit.movement ? (
        <>
          <label>
            My current size
            <select
              value={currentSize}
              onChange={(event) => {
                const size = creatureSizes.find((value) => value === event.target.value);
                if (size) setCurrentSize(size);
                setConfirmed((current) => ({ ...current, sizes: false }));
              }}
            >
              {creatureSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target current size
            <select
              value={targetSize}
              onChange={(event) => {
                const size = creatureSizes.find((value) => value === event.target.value);
                if (size) setTargetSize(size);
                setConfirmed((current) => ({ ...current, sizes: false }));
              }}
            >
              {creatureSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          {checkbox("sizes", "I confirm both current sizes, including transformations")}
        </>
      ) : null}
      {benefit.damageAndGrapple ? (
        <fieldset aria-label={benefit.damageAndGrapple.name}>
          <legend>{benefit.damageAndGrapple.name}</legend>
          <p>{benefit.damageAndGrapple.instructions}</p>
          {unarmed?.grapple ? (
            <button
              type="button"
              onClick={() => {
                if (unarmed.grapple) onExplain(unarmed.grapple.traceId);
              }}
            >
              Grapple save DC {String(unarmed.grapple.difficultyClass)} · Explain
            </button>
          ) : null}
          {checkbox("hit", "This Unarmed Strike hit a creature")}
          {checkbox(
            "attack-action",
            "The hit was part of the Attack action, not a Bonus Action or Reaction",
          )}
          {checkbox("own-turn", "This is my turn")}
          {checkbox("unused-turn", "This benefit is unused this turn")}
          {checkbox("hand", "I have a free hand to grab this creature")}
          {checkbox("reach", "The target is within my Unarmed Strike reach")}
          {checkbox("eligible", "The DM confirms this target can be grappled")}
          {unarmed?.damage.alternativeTypes?.length ? (
            <label>
              Unarmed damage type
              <select
                value={damageType || unarmed.damage.type}
                onChange={(event) => {
                  setDamageType(event.target.value);
                }}
              >
                {[unarmed.damage.type, ...unarmed.damage.alternativeTypes].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <input
              type="checkbox"
              checked={critical}
              onChange={(event) => {
                setCritical(event.target.checked);
              }}
            />
            Critical hit (double damage dice only)
          </label>
          <button
            type="button"
            disabled={
              unavailable || !named || !unarmed || !punchFlags.every((key) => confirmed[key])
            }
            onClick={() => {
              void punch();
            }}
          >
            Resolve Damage and Grapple
          </button>
        </fieldset>
      ) : null}
      {benefit.movement ? (
        <fieldset aria-label={benefit.movement.name}>
          <legend>{benefit.movement.name}</legend>
          <p>{benefit.movement.instructions}</p>
          <label>
            Distance to move (feet)
            <input
              type="number"
              min="0"
              step="1"
              value={distance}
              onChange={(event) => {
                setDistance(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            disabled={unavailable || !named || !confirmed.held || !confirmed.sizes}
            onClick={() => {
              setError("");
              try {
                if (!confirmed.held || distance.trim() === "")
                  throw new Error("Confirm the grappled target and movement distance.");
                const result = resolveGrappleMovement(evaluation, {
                  ...sized(),
                  targetGrappledByYouConfirmed: true,
                  distanceFeet: Number(distance),
                });
                setReceipt(result.instructions);
              } catch (error) {
                setError(error instanceof Error ? error.message : "Could not resolve movement.");
              }
            }}
          >
            Show grapple movement cost
          </button>
        </fieldset>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {receipt ? <p role="status">{receipt}</p> : null}
    </fieldset>
  );
}

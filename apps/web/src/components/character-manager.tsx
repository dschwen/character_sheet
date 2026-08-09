"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  characterDocumentSchema,
  type CharacterDocument,
  type CharacterState,
  type CurrencyDenomination,
} from "@dnd/character-model";
import type {
  ActionSummary,
  ActionUseRequest,
  AttackSummary,
  CharacterEvaluation,
  LoadedRulesPackage,
  SpellCastRequest,
  SpellSummary,
  StateChange,
  ValidationMessage,
} from "@dnd/rules-api";
import { evaluateCharacter, proposeAction, proposeRest, proposeSpellCast } from "@dnd/rules-core";

import { levelUpEligibility } from "../lib/character-level-up";
import { characterBuilderCatalog } from "../lib/character-builder";
import type { FixtureOption } from "../lib/server-data";
import { CharacterBuilder } from "./character-builder";
import { CharacterLevelUp } from "./character-level-up";
import {
  addInventoryItem,
  adjustInventoryQuantity,
  formatEquipmentCost,
  inventoryCatalog,
  purchaseInventoryItem,
  removeInventoryItem,
  toggleEquippedItem,
  type InventoryChangeProposal,
} from "../lib/inventory-management";
import {
  abilities,
  classSummary,
  damageText,
  entityNames,
  numericFact,
  numericFactText,
  shortEntityName,
  signed,
  titleCase,
} from "../lib/presentation";
import {
  applyDamage,
  applyHealing,
  clearConcentration,
  commitCharacterState,
  setExhaustion,
  setHeroicInspiration,
  setCurrency,
  setTemporaryHitPoints,
} from "../lib/play-state";
import { proposePreparedSpellLoadout, spellPreparationEditor } from "../lib/spell-preparation";
import { rollD20, rollDice, type D20RollRequest, type DiceRollResult } from "../lib/dice-roll";

const storageKey = "dnd-character-manager.document.v1";
const tabs = ["overview", "play", "combat", "spells", "features", "diagnostics"] as const;
const currencyDenominations = ["pp", "gp", "ep", "sp", "cp"] as const;
type Tab = (typeof tabs)[number];
type Trace = CharacterEvaluation["traces"][string];

interface CharacterManagerProps {
  rulesPackage: LoadedRulesPackage;
  fixtures: FixtureOption[];
}

interface TransitionResult {
  applicable: boolean;
  changes: StateChange[];
  nextState: CharacterState;
  validations: ValidationMessage[];
}

interface ActionDraft {
  rolls: string;
  amount: string;
}

interface ActionRequirements {
  diceCount?: number;
  diceSize?: number;
  minimumSpend?: number;
}

interface CastFeedback {
  spell: SpellSummary;
  asRitual: boolean;
  slotLevel?: number;
  slotsRemaining?: number;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function actionRequirements(action: ActionSummary): ActionRequirements {
  const healing = objectValue(action.parameters?.healing);
  const variableSpend = objectValue(action.parameters?.variableSpend);
  const diceCount = healing?.diceCount;
  const diceSize = healing?.diceSize;
  const minimumSpend = variableSpend?.minimum;
  return {
    ...(typeof diceCount === "number" ? { diceCount } : {}),
    ...(typeof diceSize === "number" ? { diceSize } : {}),
    ...(typeof minimumSpend === "number" ? { minimumSpend } : {}),
  };
}

function supportsStateTransition(action: ActionSummary): boolean {
  const parameters = objectValue(action.parameters);
  return (
    typeof parameters?.resourceId === "string" &&
    (typeof parameters.spends === "number" || objectValue(parameters.variableSpend) !== undefined)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The character could not be loaded.";
}

function traceLabel(traceId: string): string {
  return titleCase(traceId.replaceAll(".", "-"));
}

function rollExpression(result: DiceRollResult): string {
  if (result.kind === "d20") {
    return `${String(result.kept)} ${result.modifier >= 0 ? "+" : "−"} ${String(Math.abs(result.modifier))} = ${String(result.total)}`;
  }
  if (result.modifier === 0) return `Total ${String(result.total)}`;
  const diceTotal = result.dice.reduce((total, die) => total + die, 0);
  return `${String(diceTotal)} ${result.modifier >= 0 ? "+" : "−"} ${String(Math.abs(result.modifier))} = ${String(result.total)}`;
}

function rollDetail(result: DiceRollResult): string {
  if (result.kind === "d20") {
    return result.dice.length === 1 ? "1d20" : `2d20 rolled: ${result.dice.map(String).join(", ")}`;
  }
  return `${String(result.diceCount)}d${String(result.diceSize)} rolled: ${result.dice.map(String).join(", ")}`;
}

function spellDamageRolls(spell: SpellSummary): SpellSummary["damage"] {
  return (spell as Partial<Pick<SpellSummary, "damage">>).damage ?? [];
}

function Section({
  title,
  eyebrow,
  children,
}: Readonly<{ title: string; eyebrow?: string; children: React.ReactNode }>) {
  return (
    <section className="panel">
      <div className="panel-heading">
        {eyebrow === undefined ? null : <span>{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TraceButton({
  traceId,
  onSelect,
  roll,
  onRoll,
  inspectOnClick = false,
  className,
  children,
}: Readonly<{
  traceId: string;
  onSelect: (traceId: string) => void;
  roll?: D20RollRequest;
  onRoll?: (request: D20RollRequest) => void;
  inspectOnClick?: boolean;
  className?: string;
  children: React.ReactNode;
}>) {
  const canRoll = roll !== undefined && onRoll !== undefined;
  return (
    <button
      className={className ?? "trace-button"}
      type="button"
      onClick={(event) => {
        if (event.shiftKey || inspectOnClick) {
          onSelect(traceId);
        } else if (canRoll) {
          onRoll(roll);
        }
      }}
      title={
        canRoll
          ? "Click to roll · Shift-click to inspect calculation"
          : inspectOnClick
            ? "Inspect calculation"
            : "Shift-click to inspect calculation"
      }
    >
      {children}
    </button>
  );
}

export function CharacterManager({ rulesPackage, fixtures }: Readonly<CharacterManagerProps>) {
  const firstFixture = fixtures[0];
  if (firstFixture === undefined) throw new Error("The web app requires at least one fixture.");

  const [character, setCharacter] = useState<CharacterDocument>(firstFixture.character);
  const [previousCharacter, setPreviousCharacter] = useState<CharacterDocument>();
  const [source, setSource] = useState(firstFixture.filename);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [storageReady, setStorageReady] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [playAmount, setPlayAmount] = useState("1");
  const [temporaryHitPoints, setTemporaryHitPointsInput] = useState("0");
  const [actionDrafts, setActionDrafts] = useState<Readonly<Record<string, ActionDraft>>>({});
  const [spellLevels, setSpellLevels] = useState<Readonly<Record<string, string>>>({});
  const [preparedSpellDraft, setPreparedSpellDraft] = useState<string[]>();
  const [latestRoll, setLatestRoll] = useState<DiceRollResult>();
  const [castFeedback, setCastFeedback] = useState<CastFeedback>();
  const equipmentCatalog = useMemo(() => inventoryCatalog(rulesPackage), [rulesPackage]);
  const equipmentCatalogById = useMemo(
    () => new Map(equipmentCatalog.map((item) => [item.id, item])),
    [equipmentCatalog],
  );
  const [selectedInventoryEntityId, setSelectedInventoryEntityId] = useState(
    equipmentCatalog[0]?.id ?? "",
  );
  const [inventoryLots, setInventoryLots] = useState("1");
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === null) {
      setStorageReady(true);
      return;
    }
    try {
      setCharacter(characterDocumentSchema.parse(JSON.parse(saved) as unknown));
      setSource("browser-save");
      setNotice("Restored your last browser-local character.");
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify(character));
  }, [character, storageReady]);

  const result = useMemo(() => {
    try {
      return {
        evaluation: evaluateCharacter({ character, packages: [rulesPackage] }),
        error: undefined,
      };
    } catch (error) {
      return { evaluation: undefined, error: errorMessage(error) };
    }
  }, [character, rulesPackage]);
  const names = useMemo(() => entityNames(rulesPackage), [rulesPackage]);
  const preparationEditor = useMemo(
    () => spellPreparationEditor(character, rulesPackage),
    [character, rulesPackage],
  );
  const builderCatalog = useMemo(() => characterBuilderCatalog(rulesPackage), [rulesPackage]);
  const advancement = useMemo(
    () => levelUpEligibility(character, builderCatalog),
    [builderCatalog, character],
  );
  const evaluation = result.evaluation;
  const statefulActions = evaluation?.actions.filter(supportsStateTransition) ?? [];
  const trace = selectedTraceId === undefined ? undefined : evaluation?.traces[selectedTraceId];

  function performRoll(request: D20RollRequest): void {
    setLatestRoll(rollD20(request));
  }

  function rollAttackDamage(attack: AttackSummary, critical = false): void {
    const { diceCount, diceSize, bonus, flat = 0 } = attack.damage;
    if (diceCount === undefined || diceSize === undefined) {
      setNotice(`${attack.name} has no structured damage dice to roll.`);
      return;
    }
    setLatestRoll(
      rollDice({
        label: `${attack.name}${critical ? " critical" : ""} damage · ${titleCase(attack.damage.type)}`,
        diceCount: critical ? diceCount * 2 : diceCount,
        diceSize,
        modifier: bonus + flat,
      }),
    );
  }

  function rollSpellDamage(spell: SpellSummary, damage: SpellSummary["damage"][number]): void {
    setLatestRoll(
      rollDice({
        label: `${spell.name} · ${titleCase(damage.type)} damage`,
        diceCount: damage.diceCount,
        diceSize: damage.diceSize,
      }),
    );
  }

  function spellRollControls(spell: SpellSummary): React.ReactNode {
    const spellcasting = evaluation?.spellcasting;
    const damageRolls = spellDamageRolls(spell);
    if (spellcasting === undefined) return null;
    if (
      spell.attackType === undefined &&
      damageRolls.length === 0 &&
      spell.savingThrows.length === 0
    )
      return null;
    return (
      <div className="spell-roll-actions">
        {spell.attackType === undefined ? null : (
          <button
            type="button"
            onClick={(event) => {
              if (event.shiftKey) {
                setSelectedTraceId(spellcasting.attackTraceId);
              } else {
                performRoll({
                  label: `${spell.name} spell attack`,
                  modifier: spellcasting.attackBonus,
                  mode: "normal",
                });
              }
            }}
            title="Roll spell attack · Shift-click to inspect calculation"
          >
            Attack {signed(spellcasting.attackBonus)}
          </button>
        )}
        {damageRolls.map((damage, index) => (
          <button
            key={`${damage.type}-${String(index)}`}
            type="button"
            onClick={() => {
              rollSpellDamage(spell, damage);
            }}
            title={
              spell.hasHigherLevelEffect
                ? "Roll listed base damage; higher-level scaling is not included"
                : "Roll listed spell damage"
            }
          >
            {String(damage.diceCount)}d{String(damage.diceSize)} {titleCase(damage.type)}
          </button>
        ))}
        {spell.savingThrows.map((ability) => (
          <span key={ability}>
            {ability.slice(0, 3).toUpperCase()} save · DC {String(spellcasting.saveDifficultyClass)}
          </span>
        ))}
      </div>
    );
  }

  function selectFixture(filename: string): void {
    const fixture = fixtures.find((option) => option.filename === filename);
    if (fixture === undefined) return;
    setCharacter(fixture.character);
    setPreviousCharacter(undefined);
    setSource(filename);
    setSelectedTraceId(undefined);
    setActionDrafts({});
    setSpellLevels({});
    setPreparedSpellDraft(undefined);
    setNotice(`Loaded ${fixture.character.name}.`);
  }

  async function importCharacter(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const parsed = characterDocumentSchema.parse(JSON.parse(await file.text()) as unknown);
      setCharacter(parsed);
      setPreviousCharacter(undefined);
      setSource("imported");
      setSelectedTraceId(undefined);
      setActionDrafts({});
      setSpellLevels({});
      setPreparedSpellDraft(undefined);
      setNotice(`Imported ${parsed.name}; it is saved only in this browser.`);
    } catch (error) {
      setNotice(`Import failed: ${errorMessage(error)}`);
    } finally {
      if (importInput.current !== null) importInput.current.value = "";
    }
  }

  function exportCharacter(): void {
    const blob = new Blob([`${JSON.stringify(character, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Exported the current character document.");
  }

  function savePlayState(nextCharacter: CharacterDocument, message: string): void {
    setPreviousCharacter(character);
    setCharacter(nextCharacter);
    setSource("browser-save");
    setNotice(message);
  }

  function undoPlayState(): void {
    if (previousCharacter === undefined) return;
    setCharacter(previousCharacter);
    setPreviousCharacter(undefined);
    setSource("browser-save");
    setNotice("Undid the last character change.");
  }

  function updateCurrency(denomination: CurrencyDenomination, value: string): void {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 0) {
      setNotice("Currency must be a non-negative whole number.");
      return;
    }
    savePlayState(
      setCurrency(character, denomination, amount),
      `Updated ${denomination.toUpperCase()} to ${String(amount)}.`,
    );
  }

  function commitInventoryProposal(
    proposal: InventoryChangeProposal,
    successMessage: string,
  ): void {
    if (!proposal.applicable || proposal.nextCharacter === undefined) {
      setNotice(proposal.issues[0] ?? "The inventory could not be updated.");
      return;
    }
    savePlayState(proposal.nextCharacter, successMessage);
  }

  function selectedInventoryLots(): number | undefined {
    const lots = Number(inventoryLots);
    if (!Number.isInteger(lots) || lots < 1) {
      setNotice("Enter a positive whole-number quantity.");
      return undefined;
    }
    return lots;
  }

  function addSelectedInventoryItem(purchase: boolean): void {
    const item = equipmentCatalogById.get(selectedInventoryEntityId);
    const lots = selectedInventoryLots();
    if (item === undefined || lots === undefined) return;
    const totalQuantity = lots * item.purchaseQuantity;
    const proposal = purchase
      ? purchaseInventoryItem(character, item, lots)
      : addInventoryItem(character, item, lots);
    commitInventoryProposal(
      proposal,
      `${purchase ? "Purchased" : "Added"} ${totalQuantity === 1 ? item.name : `${String(totalQuantity)} × ${item.name}`}.`,
    );
  }

  function positivePlayAmount(): number | undefined {
    const amount = Number(playAmount);
    if (!Number.isInteger(amount) || amount < 1) {
      setNotice("Enter a whole-number amount of at least 1.");
      return undefined;
    }
    return amount;
  }

  function damageCharacter(): void {
    const amount = positivePlayAmount();
    if (amount === undefined) return;
    savePlayState(
      applyDamage(character, amount),
      `${character.name} took ${String(amount)} damage.`,
    );
  }

  function healCharacter(): void {
    const amount = positivePlayAmount();
    if (amount === undefined || evaluation === undefined) return;
    const maximum = numericFact(evaluation, "hitPoints.maximum");
    savePlayState(
      applyHealing(character, amount, maximum),
      `${character.name} recovered up to ${String(amount)} Hit Points.`,
    );
  }

  function replaceTemporaryHitPoints(): void {
    const amount = Number(temporaryHitPoints);
    if (!Number.isInteger(amount) || amount < 0) {
      setNotice("Temporary Hit Points must be a non-negative whole number.");
      return;
    }
    savePlayState(
      setTemporaryHitPoints(character, amount),
      `Temporary Hit Points set to ${String(amount)}.`,
    );
  }

  function applyTransition(proposal: TransitionResult, message: string): void {
    if (!proposal.applicable) {
      const validation = proposal.validations[0];
      setNotice(
        validation === undefined
          ? "That transition is not currently available."
          : (validation.message.en ?? Object.values(validation.message)[0] ?? validation.code),
      );
      return;
    }
    if (proposal.changes.length === 0) {
      setNotice(`${message} No persistent state changed.`);
      return;
    }
    savePlayState(commitCharacterState(character, proposal.nextState), message);
  }

  function rest(event: "short-rest" | "long-rest"): void {
    try {
      const proposal = proposeRest({ character, packages: [rulesPackage] }, { event });
      applyTransition(
        proposal,
        `${event === "short-rest" ? "Short" : "Long"} Rest applied (${String(proposal.changes.length)} changes).`,
      );
    } catch (error) {
      setNotice(`Rest failed: ${errorMessage(error)}`);
    }
  }

  function updateActionDraft(actionId: string, update: Partial<ActionDraft>): void {
    setActionDrafts((current) => ({
      ...current,
      [actionId]: { rolls: "", amount: "", ...current[actionId], ...update },
    }));
  }

  function useAction(action: ActionSummary): void {
    const draft = actionDrafts[action.id] ?? { rolls: "", amount: "" };
    const request: ActionUseRequest = { actionId: action.id };
    if (draft.rolls.trim().length > 0) {
      const rolls = draft.rolls
        .trim()
        .split(/[\s,]+/u)
        .map(Number);
      if (rolls.some((roll) => !Number.isInteger(roll) || roll < 1)) {
        setNotice("Action rolls must be positive whole numbers separated by spaces or commas.");
        return;
      }
      request.rolls = rolls;
    }
    if (draft.amount.trim().length > 0) {
      const amount = Number(draft.amount);
      if (!Number.isInteger(amount) || amount < 1) {
        setNotice("The resource amount must be a positive whole number.");
        return;
      }
      request.amount = amount;
    }
    try {
      const proposal = proposeAction({ character, packages: [rulesPackage] }, request);
      applyTransition(
        proposal,
        `${names.get(action.id) ?? shortEntityName(action.id)} applied (${String(proposal.changes.length)} changes).`,
      );
    } catch (error) {
      setNotice(`Action failed: ${errorMessage(error)}`);
    }
  }

  function selectedSlotLevel(spell: SpellSummary): number {
    const selected = Number(spellLevels[spell.id]);
    if (Number.isInteger(selected) && selected >= spell.level) return selected;
    return (
      evaluation?.spellcasting?.slots.find((slot) => slot.level >= spell.level && slot.current > 0)
        ?.level ?? spell.level
    );
  }

  function castSpell(spell: SpellSummary, asRitual: boolean): void {
    const request: SpellCastRequest = { spellId: spell.id, asRitual };
    const slotLevel = spell.level > 0 && !asRitual ? selectedSlotLevel(spell) : undefined;
    if (slotLevel !== undefined) request.slotLevel = slotLevel;
    try {
      const proposal = proposeSpellCast({ character, packages: [rulesPackage] }, request);
      if (proposal.applicable) {
        const slot = evaluation?.spellcasting?.slots.find(
          (candidate) => candidate.level === slotLevel,
        );
        setCastFeedback({
          spell,
          asRitual,
          ...(slotLevel === undefined ? {} : { slotLevel }),
          ...(slot === undefined ? {} : { slotsRemaining: Math.max(0, slot.current - 1) }),
        });
      }
      applyTransition(
        proposal,
        `${spell.name}${asRitual ? " was cast as a ritual" : " was cast"}${slotLevel === undefined ? "" : ` with a level ${String(slotLevel)} slot`}.`,
      );
    } catch (error) {
      setNotice(`Spell cast failed: ${errorMessage(error)}`);
    }
  }

  function togglePreparedSpell(spellId: string): void {
    if (preparationEditor === undefined) return;
    setPreparedSpellDraft((current) => {
      const selected = current ?? preparationEditor.selectedSpellIds;
      if (selected.includes(spellId)) return selected.filter((id) => id !== spellId);
      return selected.length >= preparationEditor.requiredSelections
        ? selected
        : [...selected, spellId];
    });
  }

  function savePreparedSpells(): void {
    if (preparedSpellDraft === undefined) return;
    const proposal = proposePreparedSpellLoadout(character, rulesPackage, preparedSpellDraft);
    if (!proposal.applicable || proposal.nextCharacter === undefined) {
      setNotice(proposal.issues[0] ?? "The prepared-spell loadout is not valid.");
      return;
    }
    savePlayState(
      proposal.nextCharacter,
      `${String(preparedSpellDraft.length)} ${preparationEditor?.className ?? "class"} spells prepared.`,
    );
    setPreparedSpellDraft(undefined);
  }

  return (
    <main>
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Adventurer's Ledger home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Adventurer&apos;s Ledger</strong>
            <small>SRD 5.2.1 · local-first</small>
          </span>
        </a>
        <div className="header-actions">
          <label className="select-wrap">
            <span className="sr-only">Select sample character</span>
            <select
              value={source}
              onChange={(event) => {
                selectFixture(event.target.value);
              }}
            >
              {source === "imported" ? <option value="imported">Imported character</option> : null}
              {source === "browser-save" ? (
                <option value="browser-save">Browser save</option>
              ) : null}
              {source === "builder" ? <option value="builder">Created character</option> : null}
              {fixtures.map((fixture) => (
                <option key={fixture.filename} value={fixture.filename}>
                  {fixture.character.name} · {classSummary(fixture.character)}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={importInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importCharacter(event.target.files?.[0])}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setBuilderOpen(true);
            }}
          >
            New character
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={!advancement.eligible}
            title={advancement.reason ?? `Advance to level ${String(advancement.targetLevel)}`}
            onClick={() => {
              setLevelUpOpen(true);
            }}
          >
            Level up
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => importInput.current?.click()}
          >
            Import JSON
          </button>
          <button className="button primary" type="button" onClick={exportCharacter}>
            Export
          </button>
        </div>
      </header>

      <div id="top" className="workspace">
        {notice === undefined ? null : (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => {
                setNotice(undefined);
              }}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {latestRoll === undefined ? null : (
          <div className="dice-result" role="status" aria-live="polite">
            <div
              className={`dice-face${latestRoll.kind === "dice-pool" ? " pool" : ""}${latestRoll.kind === "d20" && latestRoll.kept >= (latestRoll.criticalThreshold ?? 20) ? " critical" : ""}${latestRoll.kind === "d20" && latestRoll.kept === 1 ? " fumble" : ""}`}
              aria-label={
                latestRoll.kind === "d20"
                  ? `Kept die ${String(latestRoll.kept)}`
                  : `Dice total ${String(latestRoll.total)}`
              }
            >
              {String(latestRoll.kind === "d20" ? latestRoll.kept : latestRoll.total)}
            </div>
            <div>
              <span>
                {latestRoll.label}
                {latestRoll.kind === "d20" ? ` · ${titleCase(latestRoll.mode)}` : ""}
              </span>
              <strong>{rollExpression(latestRoll)}</strong>
              <small>{rollDetail(latestRoll)}</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setLatestRoll(undefined);
              }}
              aria-label="Dismiss dice result"
            >
              ×
            </button>
          </div>
        )}

        {evaluation === undefined ? (
          <section className="fatal-error">
            <p>Character evaluation failed</p>
            <h1>{character.name}</h1>
            <pre>{result.error}</pre>
          </section>
        ) : (
          <>
            <section className="character-hero">
              <div className="hero-copy">
                <span className="eyebrow">Current adventurer</span>
                <h1>{character.name}</h1>
                <p>
                  {classSummary(character)} · {shortEntityName(character.build.speciesId)} ·{" "}
                  {shortEntityName(character.build.backgroundId)} background
                </p>
                <div className="hero-tags">
                  <span>Level {String(character.build.levels.length)}</span>
                  {character.build.subclassId === undefined ? null : (
                    <span>
                      {names.get(character.build.subclassId) ??
                        shortEntityName(character.build.subclassId)}
                    </span>
                  )}
                  <span>Revision {String(character.metadata.revision)}</span>
                </div>
              </div>
              <div className="vitals" aria-label="Character vitals">
                <TraceButton
                  className="vital-card"
                  traceId="armorClass"
                  onSelect={setSelectedTraceId}
                >
                  <span>Armor class</span>
                  <strong>{numericFactText(evaluation, "armorClass")}</strong>
                  <small>shift-click to inspect</small>
                </TraceButton>
                <div className="vital-card hp-card">
                  <span>Hit points</span>
                  <strong>
                    {String(character.state.currentHitPoints)}
                    <small> / {String(numericFact(evaluation, "hitPoints.maximum"))}</small>
                  </strong>
                  <div className="hp-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${String(Math.max(0, Math.min(100, (character.state.currentHitPoints / Math.max(1, numericFact(evaluation, "hitPoints.maximum"))) * 100)))}%`,
                      }}
                    />
                  </div>
                </div>
                <TraceButton
                  className="vital-card"
                  traceId="initiative"
                  onSelect={setSelectedTraceId}
                  roll={{
                    label: "Initiative",
                    modifier: numericFact(evaluation, "initiative"),
                    mode: evaluation.d20Tests.initiative?.rollMode ?? "normal",
                  }}
                  onRoll={performRoll}
                >
                  <span>Initiative</span>
                  <strong>{signed(numericFact(evaluation, "initiative"))}</strong>
                  <small>click to roll</small>
                </TraceButton>
                <TraceButton
                  className="vital-card"
                  traceId="speed.walking"
                  onSelect={setSelectedTraceId}
                >
                  <span>Speed</span>
                  <strong>
                    {numericFactText(evaluation, "speed.walking")}
                    <small> ft.</small>
                  </strong>
                  <small>shift-click to inspect</small>
                </TraceButton>
              </div>
            </section>

            <nav className="tabs" aria-label="Character sheet sections">
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={tab === item ? "active" : undefined}
                  onClick={() => {
                    setTab(item);
                  }}
                >
                  {titleCase(item)}
                  {item === "diagnostics" && evaluation.validations.length > 0 ? (
                    <span className="count">{String(evaluation.validations.length)}</span>
                  ) : null}
                </button>
              ))}
            </nav>

            <p className="interaction-hint">
              Click rollable values to roll · Shift-click derived values to inspect their
              calculation
            </p>

            {tab === "play" ? (
              <div className="sheet-grid play-grid">
                <Section title="Hit Points" eyebrow="Live encounter state">
                  <div className="health-summary">
                    <div>
                      <span>Current</span>
                      <strong>{String(character.state.currentHitPoints)}</strong>
                      <small>of {String(numericFact(evaluation, "hitPoints.maximum"))}</small>
                    </div>
                    <div>
                      <span>Temporary</span>
                      <strong>{String(character.state.temporaryHitPoints)}</strong>
                      <small>absorbs damage first</small>
                    </div>
                  </div>
                  <div className="play-control">
                    <label htmlFor="hp-amount">Damage or healing amount</label>
                    <div>
                      <input
                        id="hp-amount"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={playAmount}
                        onChange={(event) => {
                          setPlayAmount(event.target.value);
                        }}
                      />
                      <button className="button danger" type="button" onClick={damageCharacter}>
                        Apply damage
                      </button>
                      <button className="button heal" type="button" onClick={healCharacter}>
                        Heal
                      </button>
                    </div>
                  </div>
                  <div className="play-control">
                    <label htmlFor="temporary-hp">Replace Temporary Hit Points</label>
                    <div>
                      <input
                        id="temporary-hp"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={temporaryHitPoints}
                        onChange={(event) => {
                          setTemporaryHitPointsInput(event.target.value);
                        }}
                      />
                      <button
                        className="button secondary"
                        type="button"
                        onClick={replaceTemporaryHitPoints}
                      >
                        Set temporary HP
                      </button>
                    </div>
                  </div>
                  <button
                    className="undo-button"
                    type="button"
                    disabled={previousCharacter === undefined}
                    onClick={undoPlayState}
                  >
                    ↶ Undo last state change
                  </button>
                </Section>

                <Section title="Status" eyebrow="Inspiration & conditions">
                  <div className="status-controls">
                    <div>
                      <span>
                        <strong>Heroic Inspiration</strong>
                        <small>One use at a time</small>
                      </span>
                      <button
                        type="button"
                        className={character.state.heroicInspiration ? "toggle active" : "toggle"}
                        aria-pressed={character.state.heroicInspiration}
                        onClick={() => {
                          const inspired = !character.state.heroicInspiration;
                          savePlayState(
                            setHeroicInspiration(character, inspired),
                            `Heroic Inspiration ${inspired ? "granted" : "spent"}.`,
                          );
                        }}
                      >
                        {character.state.heroicInspiration ? "Ready" : "None"}
                      </button>
                    </div>
                    <div>
                      <span>
                        <strong>Exhaustion</strong>
                        <small>Bounded from 0 to 6</small>
                      </span>
                      <div className="stepper">
                        <button
                          type="button"
                          aria-label="Reduce exhaustion"
                          disabled={character.state.exhaustion === 0}
                          onClick={() => {
                            savePlayState(
                              setExhaustion(character, character.state.exhaustion - 1),
                              "Exhaustion reduced by 1.",
                            );
                          }}
                        >
                          −
                        </button>
                        <strong>{String(character.state.exhaustion)}</strong>
                        <button
                          type="button"
                          aria-label="Increase exhaustion"
                          disabled={character.state.exhaustion === 6}
                          onClick={() => {
                            savePlayState(
                              setExhaustion(character, character.state.exhaustion + 1),
                              "Exhaustion increased by 1.",
                            );
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <span>
                        <strong>Concentration</strong>
                        <small>
                          {character.state.concentrationSpellId === undefined
                            ? "No active spell"
                            : (names.get(character.state.concentrationSpellId) ??
                              shortEntityName(character.state.concentrationSpellId))}
                        </small>
                      </span>
                      <button
                        className="button secondary compact"
                        type="button"
                        disabled={character.state.concentrationSpellId === undefined}
                        onClick={() => {
                          savePlayState(clearConcentration(character), "Concentration ended.");
                        }}
                      >
                        End
                      </button>
                    </div>
                  </div>
                </Section>

                <Section title="Rest" eyebrow="Atomic rules transitions">
                  <p className="section-copy">
                    Rests apply all modeled recovery rules together. A Short Rest without Hit Dice
                    still recharges eligible resources.
                  </p>
                  <div className="rest-buttons">
                    <button
                      className="rest-card"
                      type="button"
                      onClick={() => {
                        rest("short-rest");
                      }}
                    >
                      <span>About 1 hour</span>
                      <strong>Take a Short Rest</strong>
                      <small>Recharge eligible features</small>
                    </button>
                    <button
                      className="rest-card long"
                      type="button"
                      onClick={() => {
                        rest("long-rest");
                      }}
                    >
                      <span>At least 8 hours</span>
                      <strong>Take a Long Rest</strong>
                      <small>Restore HP, slots, and resources</small>
                    </button>
                  </div>
                </Section>

                <Section
                  title="Use a feature"
                  eyebrow={`${String(statefulActions.length)} state transitions`}
                >
                  {statefulActions.length === 0 ? (
                    <p className="empty">
                      No feature actions with complete state-transition automation are available.
                    </p>
                  ) : (
                    <div className="play-action-list">
                      {statefulActions.map((action) => {
                        const requirements = actionRequirements(action);
                        const draft = actionDrafts[action.id] ?? { rolls: "", amount: "" };
                        return (
                          <div key={action.id}>
                            <span>
                              <strong>{names.get(action.id) ?? shortEntityName(action.id)}</strong>
                              <small>
                                {action.actionEconomy === undefined
                                  ? "Special action"
                                  : titleCase(action.actionEconomy)}{" "}
                                · {action.available ? "Ready" : "Unavailable"}
                              </small>
                            </span>
                            <div className="action-inputs">
                              {requirements.diceCount === undefined ? null : (
                                <label>
                                  Rolls
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={`${String(requirements.diceCount)}d${String(requirements.diceSize ?? "?")}`}
                                    value={draft.rolls}
                                    onChange={(event) => {
                                      updateActionDraft(action.id, { rolls: event.target.value });
                                    }}
                                  />
                                </label>
                              )}
                              {requirements.minimumSpend === undefined ? null : (
                                <label>
                                  Amount
                                  <input
                                    type="number"
                                    min={requirements.minimumSpend}
                                    step="1"
                                    value={draft.amount}
                                    placeholder={String(requirements.minimumSpend)}
                                    onChange={(event) => {
                                      updateActionDraft(action.id, { amount: event.target.value });
                                    }}
                                  />
                                </label>
                              )}
                              <button
                                className="button primary compact"
                                type="button"
                                disabled={!action.available}
                                onClick={() => {
                                  useAction(action);
                                }}
                              >
                                Use
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>

                {evaluation.spellcasting === undefined ? null : (
                  <Section title="Cast a spell" eyebrow="Spell-slot transitions">
                    {castFeedback === undefined ? null : (
                      <div className="cast-feedback" role="status" aria-live="polite">
                        <span aria-hidden="true">✓</span>
                        <div>
                          <small>Cast confirmed</small>
                          <strong>{castFeedback.spell.name}</strong>
                          <p>
                            {castFeedback.asRitual
                              ? "Ritual · no spell slot spent"
                              : castFeedback.slotLevel === undefined
                                ? "Cantrip · no spell slot spent"
                                : `Level ${String(castFeedback.slotLevel)} slot spent · ${String(castFeedback.slotsRemaining ?? 0)} remaining`}
                            {castFeedback.spell.concentration ? " · Concentration started" : ""}
                          </p>
                          {castFeedback.slotLevel !== undefined &&
                          castFeedback.slotLevel > castFeedback.spell.level &&
                          spellDamageRolls(castFeedback.spell).length > 0 ? (
                            <em>
                              Damage buttons show listed base dice; upcast scaling is not yet
                              structured.
                            </em>
                          ) : null}
                          {spellRollControls(castFeedback.spell)}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCastFeedback(undefined);
                          }}
                          aria-label="Dismiss cast confirmation"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <div className="play-spell-list">
                      {evaluation.spells.map((spell) => {
                        const eligibleSlots =
                          evaluation.spellcasting?.slots.filter(
                            (slot) => slot.level >= spell.level,
                          ) ?? [];
                        const slotLevel = selectedSlotLevel(spell);
                        const selectedSlot = eligibleSlots.find((slot) => slot.level === slotLevel);
                        const canCast =
                          spell.level === 0 || (spell.prepared && (selectedSlot?.current ?? 0) > 0);
                        return (
                          <div key={spell.id}>
                            <div className="spell-summary">
                              <strong>{spell.name}</strong>
                              <small>
                                {spell.level === 0
                                  ? "Cantrip · Always available"
                                  : `Level ${String(spell.level)} · ${spell.prepared ? "Prepared" : "Not prepared"}`}
                                {spell.concentration ? " · Concentration" : ""}
                              </small>
                              {spellRollControls(spell)}
                            </div>
                            <div className="spell-cast-controls">
                              {spell.level === 0 ? null : (
                                <select
                                  aria-label={`Slot level for ${spell.name}`}
                                  value={String(slotLevel)}
                                  onChange={(event) => {
                                    setSpellLevels((current) => ({
                                      ...current,
                                      [spell.id]: event.target.value,
                                    }));
                                  }}
                                >
                                  {eligibleSlots.map((slot) => (
                                    <option
                                      key={slot.level}
                                      value={slot.level}
                                      disabled={slot.current === 0}
                                    >
                                      Level {String(slot.level)} · {String(slot.current)} left
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                className="button primary compact"
                                type="button"
                                disabled={!canCast}
                                onClick={() => {
                                  castSpell(spell, false);
                                }}
                              >
                                Cast
                              </button>
                              {spell.ritual ? (
                                <button
                                  className="button secondary compact"
                                  type="button"
                                  onClick={() => {
                                    castSpell(spell, true);
                                  }}
                                >
                                  Ritual
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}
              </div>
            ) : null}

            {tab === "overview" ? (
              <div className="sheet-grid overview-grid">
                <Section title="Ability scores" eyebrow="Core attributes">
                  <div className="abilities">
                    {abilities.map((ability) => {
                      const modifier = numericFact(evaluation, `ability.${ability}.modifier`);
                      const save = evaluation.d20Tests[`savingThrow.${ability}`];
                      return (
                        <TraceButton
                          key={ability}
                          className="ability-card"
                          traceId={`ability.${ability}.modifier`}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: `${titleCase(ability)} check`,
                            modifier,
                            mode: "normal",
                          }}
                          onRoll={performRoll}
                        >
                          <span>{ability.slice(0, 3).toUpperCase()}</span>
                          <strong>{signed(modifier)}</strong>
                          <small>
                            {String(numericFact(evaluation, `ability.${ability}.score`))} score ·{" "}
                            {save?.proficiency.level === "none" ? "" : "● "}
                            {signed(save?.modifier ?? modifier)} save
                          </small>
                        </TraceButton>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Skills" eyebrow="Checks & proficiencies">
                  <div className="skill-list">
                    {Object.values(evaluation.d20Tests)
                      .filter((test) => test.id.startsWith("skill."))
                      .sort((left, right) => left.id.localeCompare(right.id))
                      .map((skill) => (
                        <TraceButton
                          key={skill.id}
                          traceId={skill.traceId}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: titleCase(skill.id.replace("skill.", "")),
                            modifier: skill.modifier,
                            mode: skill.rollMode,
                          }}
                          onRoll={performRoll}
                        >
                          <i className={`prof-dot ${skill.proficiency.level}`} aria-hidden="true" />
                          <span>{titleCase(skill.id.replace("skill.", ""))}</span>
                          <small>{skill.ability.slice(0, 3).toUpperCase()}</small>
                          <strong>{signed(skill.modifier)}</strong>
                        </TraceButton>
                      ))}
                  </div>
                </Section>

                <Section title="At a glance" eyebrow="Defenses & senses">
                  <dl className="fact-list">
                    <div>
                      <dt>Proficiency bonus</dt>
                      <dd>{signed(numericFact(evaluation, "proficiencyBonus"))}</dd>
                    </div>
                    <div>
                      <dt>Passive perception</dt>
                      <dd>{String(numericFact(evaluation, "passive.perception"))}</dd>
                    </div>
                    <div>
                      <dt>Temporary HP</dt>
                      <dd>{String(character.state.temporaryHitPoints)}</dd>
                    </div>
                    <div>
                      <dt>Heroic inspiration</dt>
                      <dd>{character.state.heroicInspiration ? "Ready" : "None"}</dd>
                    </div>
                    <div>
                      <dt>Exhaustion</dt>
                      <dd>{String(character.state.exhaustion)}</dd>
                    </div>
                    <div>
                      <dt>Resistances</dt>
                      <dd>
                        {evaluation.resistances.length === 0
                          ? "None"
                          : evaluation.resistances.map(titleCase).join(", ")}
                      </dd>
                    </div>
                  </dl>
                </Section>
              </div>
            ) : null}

            {tab === "combat" ? (
              <div className="sheet-grid two-column">
                <Section title="Attacks" eyebrow="Attack action">
                  {evaluation.attacks.length === 0 ? (
                    <p className="empty">No attacks in this loadout.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Attack</th>
                            <th>To hit</th>
                            <th>Damage</th>
                            <th>Range</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluation.attacks.map((attack) => (
                            <tr key={attack.id}>
                              <td>
                                <strong>{attack.name}</strong>
                                <small>
                                  {titleCase(attack.attackType)} ·{" "}
                                  {attack.properties.map(titleCase).join(", ")}
                                </small>
                              </td>
                              <td>
                                <TraceButton
                                  className="roll-cell"
                                  traceId={attack.traceId}
                                  onSelect={setSelectedTraceId}
                                  roll={{
                                    label: `${attack.name} attack`,
                                    modifier: attack.attackBonus,
                                    mode: "normal",
                                    criticalThreshold: attack.criticalHitThreshold,
                                  }}
                                  onRoll={performRoll}
                                >
                                  <strong>{signed(attack.attackBonus)}</strong>
                                  <small>Roll attack</small>
                                </TraceButton>
                              </td>
                              <td>
                                <div className="damage-rolls">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      if (event.shiftKey) {
                                        setSelectedTraceId(attack.damage.traceId);
                                      } else {
                                        rollAttackDamage(attack);
                                      }
                                    }}
                                    title="Roll damage · Shift-click to inspect calculation"
                                  >
                                    <strong>{damageText(attack.damage)}</strong>
                                    <small>Roll damage</small>
                                  </button>
                                  <button
                                    type="button"
                                    className="critical-roll"
                                    onClick={() => {
                                      rollAttackDamage(attack, true);
                                    }}
                                    title="Roll critical-hit damage"
                                  >
                                    Crit
                                  </button>
                                </div>
                              </td>
                              <td>
                                {attack.range === undefined
                                  ? "Reach"
                                  : `${String(attack.range.normal)}/${String(attack.range.long)} ft.`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
                <Section title="Equipment" eyebrow="Current loadout">
                  <div className="currency-grid" aria-label="Currency">
                    {currencyDenominations.map((denomination) => (
                      <label key={denomination}>
                        <span>{denomination.toUpperCase()}</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={character.loadout.currency[denomination]}
                          onChange={(event) => {
                            updateCurrency(denomination, event.target.value);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="inventory-editor">
                    <label>
                      <span>Equipment catalog</span>
                      <select
                        value={selectedInventoryEntityId}
                        onChange={(event) => {
                          setSelectedInventoryEntityId(event.target.value);
                        }}
                      >
                        {equipmentCatalog.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {formatEquipmentCost(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inventory-lots">
                      <span>Lots</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={inventoryLots}
                        onChange={(event) => {
                          setInventoryLots(event.target.value);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => {
                        addSelectedInventoryItem(false);
                      }}
                    >
                      Add loot
                    </button>
                    <button
                      type="button"
                      className="button primary compact"
                      disabled={
                        equipmentCatalogById.get(selectedInventoryEntityId)?.cost === undefined
                      }
                      onClick={() => {
                        addSelectedInventoryItem(true);
                      }}
                    >
                      Buy
                    </button>
                  </div>
                  <div className="item-list">
                    {evaluation.inventory.length === 0 ? (
                      <p className="empty">No carried equipment.</p>
                    ) : (
                      evaluation.inventory.map((item) => {
                        const catalogItem = equipmentCatalogById.get(item.entityId);
                        return (
                          <div key={item.id} className="inventory-row">
                            <span>
                              <strong>{item.name}</strong>
                              <small>
                                {titleCase(item.kind)} · {item.equipped ? "Equipped" : "Carried"}
                              </small>
                            </span>
                            <div className="inventory-actions">
                              {catalogItem?.equippable === true ? (
                                <button
                                  type="button"
                                  className={item.equipped ? "equipped" : undefined}
                                  onClick={() => {
                                    commitInventoryProposal(
                                      toggleEquippedItem(character, item.id, equipmentCatalog),
                                      `${item.equipped ? "Unequipped" : "Equipped"} ${item.name}.`,
                                    );
                                  }}
                                >
                                  {item.equipped ? "Unequip" : "Equip"}
                                </button>
                              ) : null}
                              {!catalogItem?.equippable || item.quantity > 1 ? (
                                <div className="inventory-quantity">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      commitInventoryProposal(
                                        adjustInventoryQuantity(character, item.id, -1),
                                        `Reduced ${item.name} quantity.`,
                                      );
                                    }}
                                  >
                                    −
                                  </button>
                                  <strong>{String(item.quantity)}</strong>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      commitInventoryProposal(
                                        adjustInventoryQuantity(character, item.id, 1),
                                        `Increased ${item.name} quantity.`,
                                      );
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="remove-item"
                                aria-label={`Remove ${item.name}`}
                                onClick={() => {
                                  commitInventoryProposal(
                                    removeInventoryItem(character, item.id),
                                    `Removed ${item.name}.`,
                                  );
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Section>
                <Section title="Conditions" eyebrow="Active state">
                  <div className="tag-list">
                    {character.state.conditionIds.length === 0 ? (
                      <span className="empty">No active conditions</span>
                    ) : (
                      character.state.conditionIds.map((id) => (
                        <span key={id}>{names.get(id) ?? shortEntityName(id)}</span>
                      ))
                    )}
                    {character.state.concentrationSpellId === undefined ? null : (
                      <span>
                        Concentrating:{" "}
                        {names.get(character.state.concentrationSpellId) ??
                          shortEntityName(character.state.concentrationSpellId)}
                      </span>
                    )}
                  </div>
                </Section>
              </div>
            ) : null}

            {tab === "spells" ? (
              <div className="sheet-grid two-column">
                <Section title="Spellcasting" eyebrow="Magic">
                  {evaluation.spellcasting === undefined ? (
                    <p className="empty">This character does not have spellcasting.</p>
                  ) : (
                    <>
                      <div className="spell-metrics">
                        <TraceButton
                          traceId={evaluation.spellcasting.attackTraceId}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: "Spell attack",
                            modifier: evaluation.spellcasting.attackBonus,
                            mode: "normal",
                          }}
                          onRoll={performRoll}
                        >
                          <span>Spell attack</span>
                          <strong>{signed(evaluation.spellcasting.attackBonus)}</strong>
                        </TraceButton>
                        <TraceButton
                          traceId={evaluation.spellcasting.saveTraceId}
                          onSelect={setSelectedTraceId}
                        >
                          <span>Save DC</span>
                          <strong>{String(evaluation.spellcasting.saveDifficultyClass)}</strong>
                        </TraceButton>
                        <div>
                          <span>Ability</span>
                          <strong>
                            {evaluation.spellcasting.ability.slice(0, 3).toUpperCase()}
                          </strong>
                        </div>
                      </div>
                      <div className="slot-list">
                        {evaluation.spellcasting.slots.map((slot) => (
                          <TraceButton
                            key={slot.level}
                            traceId={slot.traceId}
                            onSelect={setSelectedTraceId}
                          >
                            <span>Level {String(slot.level)}</span>
                            <i>
                              {Array.from({ length: slot.maximum }, (_, index) => (
                                <b
                                  key={index}
                                  className={index < slot.current ? "available" : undefined}
                                />
                              ))}
                            </i>
                            <small>
                              {String(slot.current)} / {String(slot.maximum)}
                            </small>
                          </TraceButton>
                        ))}
                      </div>
                    </>
                  )}
                </Section>
                <Section
                  title="Known & prepared spells"
                  eyebrow={`${String(evaluation.spells.length)} spells`}
                >
                  {preparationEditor === undefined ? null : (
                    <div className="preparation-control">
                      <div className="preparation-summary">
                        <span>
                          <strong>
                            {String(
                              preparedSpellDraft?.length ??
                                preparationEditor.selectedSpellIds.length,
                            )}{" "}
                            / {String(preparationEditor.requiredSelections)} chosen
                          </strong>
                          <small>
                            {preparationEditor.mode === "spellbook"
                              ? "Selected from this character’s spellbook"
                              : `Selected from the ${preparationEditor.className} spell list`}
                            {preparationEditor.alwaysPreparedSpellIds.length === 0
                              ? ""
                              : ` · ${String(preparationEditor.alwaysPreparedSpellIds.length)} additional always prepared`}
                          </small>
                        </span>
                        {preparedSpellDraft === undefined ? (
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() => {
                              setPreparedSpellDraft([...preparationEditor.selectedSpellIds]);
                            }}
                          >
                            Change preparation
                          </button>
                        ) : null}
                      </div>
                      {preparedSpellDraft === undefined ? null : (
                        <div className="preparation-editor">
                          <div className="preparation-editor-heading">
                            <span>
                              <strong>Daily spell loadout</strong>
                              <small>
                                Record preparation here after completing any rest or preparation
                                required by your class.
                              </small>
                            </span>
                            <i>
                              {String(preparedSpellDraft.length)} /{" "}
                              {String(preparationEditor.requiredSelections)}
                            </i>
                          </div>
                          <div className="preparation-options">
                            {preparationEditor.options.map((spell) => {
                              const selected = preparedSpellDraft.includes(spell.id);
                              return (
                                <button
                                  key={spell.id}
                                  type="button"
                                  className={
                                    spell.alwaysPrepared
                                      ? "always-prepared"
                                      : selected
                                        ? "selected"
                                        : undefined
                                  }
                                  disabled={
                                    spell.alwaysPrepared ||
                                    (!selected &&
                                      preparedSpellDraft.length >=
                                        preparationEditor.requiredSelections)
                                  }
                                  aria-pressed={spell.alwaysPrepared || selected}
                                  onClick={() => {
                                    togglePreparedSpell(spell.id);
                                  }}
                                >
                                  <i>{spell.alwaysPrepared || selected ? "✓" : ""}</i>
                                  <span>
                                    <strong>{spell.name}</strong>
                                    <small>
                                      Level {String(spell.level)} · {titleCase(spell.school)}
                                      {spell.alwaysPrepared ? " · Always prepared" : ""}
                                    </small>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="preparation-actions">
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => {
                                setPreparedSpellDraft(undefined);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              className="button primary"
                              type="button"
                              disabled={
                                preparedSpellDraft.length !== preparationEditor.requiredSelections
                              }
                              onClick={savePreparedSpells}
                            >
                              Save preparation
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {evaluation.spells.length === 0 ? (
                    <p className="empty">No spells known.</p>
                  ) : (
                    <div className="spell-list">
                      {evaluation.spells.map((spell) => (
                        <div key={spell.id}>
                          <span>
                            <strong>{spell.name}</strong>
                            <small>
                              {spell.level === 0 ? "Cantrip" : `Level ${String(spell.level)}`} ·{" "}
                              {titleCase(spell.school)}
                            </small>
                          </span>
                          <span className="spell-badges">
                            {spell.prepared ? <i>Prepared</i> : null}
                            {spell.concentration ? <i>Concentration</i> : null}
                            {spell.ritual ? <i>Ritual</i> : null}
                          </span>
                          <small>
                            {spell.castingTime} · {spell.range} · {spell.duration}
                          </small>
                          {spellRollControls(spell)}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            ) : null}

            {tab === "features" ? (
              <div className="sheet-grid two-column">
                <Section title="Resources" eyebrow="Uses & recovery">
                  {evaluation.resources.length === 0 ? (
                    <p className="empty">No tracked resources.</p>
                  ) : (
                    <div className="resource-list">
                      {evaluation.resources.map((resource) => (
                        <TraceButton
                          key={resource.id}
                          traceId={resource.traceId}
                          onSelect={setSelectedTraceId}
                        >
                          <span>
                            <strong>
                              {names.get(resource.id) ?? shortEntityName(resource.id)}
                            </strong>
                            <small>
                              Recovers:{" "}
                              {resource.recharge.map((rule) => titleCase(rule.event)).join(", ")}
                            </small>
                          </span>
                          <b>
                            {String(resource.current)} <small>/ {String(resource.maximum)}</small>
                          </b>
                        </TraceButton>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Available actions" eyebrow="Rules engine">
                  <div className="action-list">
                    {evaluation.actions.map((action) => (
                      <TraceButton
                        key={action.id}
                        traceId={action.traceId}
                        onSelect={setSelectedTraceId}
                      >
                        <span>
                          <strong>{names.get(action.id) ?? shortEntityName(action.id)}</strong>
                          <small>
                            {action.actionEconomy === undefined
                              ? "Special action"
                              : titleCase(action.actionEconomy)}
                          </small>
                        </span>
                        <i className={action.available ? "ready" : "blocked"}>
                          {action.available ? "Ready" : "Unavailable"}
                        </i>
                      </TraceButton>
                    ))}
                  </div>
                </Section>
                <Section title="Build selections" eyebrow="Character record">
                  <div className="tag-list">
                    {character.build.featIds.map((id) => (
                      <span key={id}>{names.get(id) ?? shortEntityName(id)}</span>
                    ))}
                    {character.build.featIds.length === 0 ? (
                      <span className="empty">No feats selected</span>
                    ) : null}
                  </div>
                </Section>
              </div>
            ) : null}

            {tab === "diagnostics" ? (
              <div className="sheet-grid two-column">
                <Section
                  title="Validation messages"
                  eyebrow={`${String(evaluation.validations.length)} findings`}
                >
                  {evaluation.validations.length === 0 ? (
                    <p className="success">✓ No validation problems found.</p>
                  ) : (
                    <div className="diagnostic-list">
                      {evaluation.validations.map((validation) => (
                        <article key={validation.id} className={validation.severity}>
                          <span>{validation.severity}</span>
                          <div>
                            <strong>{validation.code}</strong>
                            <p>{validation.message.en ?? Object.values(validation.message)[0]}</p>
                            <small>{validation.paths.join(" · ")}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Section>
                <Section
                  title="Automation coverage"
                  eyebrow={`${String(evaluation.coverageWarnings.length)} warnings`}
                >
                  {evaluation.coverageWarnings.length === 0 ? (
                    <p className="success">✓ All granted mechanics have approved automation.</p>
                  ) : (
                    <div className="diagnostic-list">
                      {evaluation.coverageWarnings.map((warning) => (
                        <article key={warning.entityId} className="warning">
                          <span>{warning.status}</span>
                          <div>
                            <strong>
                              {names.get(warning.entityId) ?? shortEntityName(warning.entityId)}
                            </strong>
                            <p>{warning.message}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Section>
                <Section
                  title="Calculation index"
                  eyebrow={`${String(Object.keys(evaluation.traces).length)} traces`}
                >
                  <div className="trace-index">
                    {Object.keys(evaluation.traces)
                      .sort()
                      .map((traceId) => (
                        <TraceButton
                          key={traceId}
                          traceId={traceId}
                          onSelect={setSelectedTraceId}
                          inspectOnClick
                        >
                          {traceLabel(traceId)}
                        </TraceButton>
                      ))}
                  </div>
                </Section>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectedTraceId === undefined ? null : (
        <div
          className="drawer-backdrop"
          onMouseDown={() => {
            setSelectedTraceId(undefined);
          }}
        >
          <aside
            className="trace-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Calculation trace"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="drawer-heading">
              <div>
                <span>Calculation trace</span>
                <h2>{traceLabel(selectedTraceId)}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTraceId(undefined);
                }}
                aria-label="Close calculation trace"
              >
                ×
              </button>
            </div>
            {trace === undefined ? (
              <p className="empty">No trace was emitted for this value.</p>
            ) : (
              <TraceDetails trace={trace} names={names} />
            )}
          </aside>
        </div>
      )}
      {builderOpen ? (
        <CharacterBuilder
          rulesPackage={rulesPackage}
          onCancel={() => {
            setBuilderOpen(false);
          }}
          onComplete={(builtCharacter) => {
            setCharacter(builtCharacter);
            setPreviousCharacter(undefined);
            setSource("builder");
            setTab("overview");
            setSelectedTraceId(undefined);
            setActionDrafts({});
            setSpellLevels({});
            setPreparedSpellDraft(undefined);
            setBuilderOpen(false);
            setNotice(`${builtCharacter.name} was created and saved in this browser.`);
          }}
        />
      ) : null}
      {levelUpOpen ? (
        <CharacterLevelUp
          character={character}
          rulesPackage={rulesPackage}
          onCancel={() => {
            setLevelUpOpen(false);
          }}
          onComplete={(advancedCharacter) => {
            savePlayState(
              advancedCharacter,
              `${advancedCharacter.name} advanced to level ${String(advancedCharacter.build.levels.length)}.`,
            );
            setTab("overview");
            setSelectedTraceId(undefined);
            setActionDrafts({});
            setSpellLevels({});
            setPreparedSpellDraft(undefined);
            setLevelUpOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function TraceDetails({
  trace,
  names,
}: Readonly<{ trace: Trace; names: ReadonlyMap<string, string> }>) {
  return (
    <div className="trace-details">
      <div className="trace-result">
        <span>Final result</span>
        <strong>{JSON.stringify(trace.result)}</strong>
      </div>
      <ol>
        {trace.nodes.map((node) => (
          <li key={node.id} className={node.suppressed === true ? "suppressed" : undefined}>
            <div>
              <span>{titleCase(node.operation)}</span>
              {node.suppressed === true ? <i>Suppressed</i> : null}
            </div>
            <strong>{node.label ?? node.id}</strong>
            <code>
              {node.inputs.map((input) => JSON.stringify(input)).join(" · ")} →{" "}
              {JSON.stringify(node.output)}
            </code>
            {node.reason === undefined ? null : <p>{node.reason}</p>}
            {node.source === undefined ? null : (
              <small>
                {node.source.entityId === undefined
                  ? node.source.sourceId
                  : (names.get(node.source.entityId) ?? node.source.entityId)}
                {node.source.page === undefined ? "" : ` · p. ${String(node.source.page)}`}
              </small>
            )}
          </li>
        ))}
      </ol>
      {trace.sourceReferences.length === 0 ? null : (
        <div className="sources">
          <h3>Sources</h3>
          {trace.sourceReferences.map((source, index) => (
            <p key={`${source.sourceId}-${String(index)}`}>
              {source.entityId === undefined
                ? source.sourceId
                : (names.get(source.entityId) ?? source.entityId)}
              {source.page === undefined ? "" : ` · page ${String(source.page)}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

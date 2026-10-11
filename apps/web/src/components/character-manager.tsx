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
  SpellProtectionApplication,
  SpellSummary,
  StateChange,
  ValidationMessage,
} from "@dnd/rules-api";
import {
  evaluateCharacter,
  proposeAction,
  proposeRest,
  proposeSpellCast,
  resolveSavingThrowDamage,
  deathSaveStatus,
  proposeDeathSavingThrow,
} from "@dnd/rules-core";

import { levelUpEligibility } from "../lib/character-level-up";
import { DamageRiderControls } from "./damage-rider-controls";
import { spellDamageRollRequest } from "../lib/feature-damage-roll";
import { spellProtectionInstructions } from "../lib/spell-protection";
import {
  characterBuilderCatalog,
  migrateMagicInitiateChoices,
  migrateFeatureSpellbookChoices,
  migrateFeatureFeatChoices,
} from "../lib/character-builder";
import {
  actionDiceRequest,
  actionMovementMessage,
  applyPostRollBonus,
  canApplyPostRollBonus,
  requiresCompletedD20Test,
} from "../lib/action-roll";
import { spellHealingRequests } from "../lib/spell-healing";
import type { FixtureOption } from "../lib/server-data";
import { CharacterBuilder } from "./character-builder";
import { CharacterLevelUp } from "./character-level-up";
import { SavingThrowRerollControls } from "./saving-throw-reroll-controls";
import { savingThrowRerollDefinition, savingThrowRerollRequest } from "../lib/saving-throw-reroll";
import { failedSaveRerollDefinition, failedSaveRerollRequest } from "../lib/failed-save-reroll";
import { FailedSaveRerollControls } from "./failed-save-reroll-controls";
import { WeaponMasteryControls } from "./weapon-mastery-controls";
import { selectedAttackMastery } from "../lib/weapon-mastery";
import { DeathSaveControls } from "./death-save-controls";
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
  type Ability,
} from "../lib/presentation";
import {
  applyDamage,
  applyHealing,
  clearConcentrationAndEffects,
  commitCharacterState,
  endActiveEffects,
  setActiveEffectActive,
  setActiveEffectParameter,
  setActiveEffectSelection,
  setActiveEffectSelectionWithHitPointAdjustment,
  setActiveEffectWithHitPointBonus,
  setConditionActive,
  setExhaustion,
  setHeroicInspiration,
  setCurrency,
  setTemporaryHitPoints,
} from "../lib/play-state";
import { proposePreparedSpellLoadout, spellPreparationEditor } from "../lib/spell-preparation";
import { spellStatusInstructions, spellStatusMessage } from "../lib/spell-status";
import { selectedWeaponDamageMode, weaponDamageRollRequest } from "../lib/weapon-damage-roll";
import {
  rollD20,
  rollDice,
  dicePoolRollExpression,
  dicePoolRollDetail,
  d20RerollRequest,
  applyD20MinimumPreference,
  type D20RollRequest,
  type DicePoolRollRequest,
  type DicePoolRollResult,
  type DiceRollResult,
} from "../lib/dice-roll";
import { rollD20Fullscreen, rollDiceFullscreen } from "../lib/fullscreen-dice";

const storageKey = "dnd-character-manager.document.v1";
const tabs = ["overview", "play", "combat", "spells", "features", "diagnostics"] as const;
const currencyDenominations = ["pp", "gp", "ep", "sp", "cp"] as const;
type Tab = (typeof tabs)[number];
type Trace = CharacterEvaluation["traces"][string];

interface StatusHitPointBonus {
  base: number;
  minimumSelection: number;
  maximumSelection: number;
  perSelectedLevel: number;
}

function selectedStatusHitPointBonus(
  definition: StatusHitPointBonus,
  selection: string | undefined,
): number {
  const parsed = Number(selection);
  const selected = Number.isInteger(parsed)
    ? Math.max(definition.minimumSelection, Math.min(definition.maximumSelection, parsed))
    : definition.minimumSelection;
  return definition.base + (selected - definition.minimumSelection) * definition.perSelectedLevel;
}

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
  amount: string;
}

interface ActionRequirements {
  minimumSpend?: number;
  damageDiceCount?: number;
  damageDiceSize?: number;
  damageType?: string;
  saveAbility?: string;
  saveDifficultyClass?: number;
  rollDiceCount?: number;
  rollDiceSize?: number;
  rollLabel?: string;
  rollModifier?: number;
  temporaryHitPoints?: number;
  minimumCurrentHitPoints?: number;
}

interface CastFeedback {
  traces: Readonly<Record<string, Trace>>;
  protection?: SpellProtectionApplication;
  spell: SpellSummary;
  asRitual: boolean;
  freeCast?: boolean;
  slotLevel?: number;
  slotsRemaining?: number;
  castingSourceId?: string;
  selfHealing?: number;
  selfHealingSource?: string;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function actionRequirements(action: ActionSummary): ActionRequirements {
  const variableSpend = objectValue(action.parameters?.variableSpend);
  const minimumSpend = variableSpend?.minimum;
  const damage = objectValue(action.parameters?.damage);
  const roll = objectValue(action.parameters?.roll);
  const savingThrow = objectValue(action.parameters?.savingThrow);
  const temporaryHitPoints = action.parameters?.temporaryHitPoints;
  const minimumCurrentHitPoints = action.parameters?.minimumCurrentHitPoints;
  return {
    ...(typeof minimumSpend === "number" ? { minimumSpend } : {}),
    ...(typeof damage?.diceCount === "number" ? { damageDiceCount: damage.diceCount } : {}),
    ...(typeof damage?.diceSize === "number" ? { damageDiceSize: damage.diceSize } : {}),
    ...(typeof damage?.type === "string" ? { damageType: damage.type } : {}),
    ...(typeof savingThrow?.ability === "string" ? { saveAbility: savingThrow.ability } : {}),
    ...(typeof savingThrow?.difficultyClass === "number"
      ? { saveDifficultyClass: savingThrow.difficultyClass }
      : {}),
    ...(typeof roll?.diceCount === "number" ? { rollDiceCount: roll.diceCount } : {}),
    ...(typeof roll?.diceSize === "number" ? { rollDiceSize: roll.diceSize } : {}),
    ...(typeof roll?.label === "string" ? { rollLabel: roll.label } : {}),
    ...(typeof roll?.modifier === "number" ? { rollModifier: roll.modifier } : {}),
    ...(typeof temporaryHitPoints === "number" ? { temporaryHitPoints } : {}),
    ...(typeof minimumCurrentHitPoints === "number" ? { minimumCurrentHitPoints } : {}),
  };
}

function actionDamageLabel(action: ActionSummary): string {
  const requirements = actionRequirements(action);
  if (requirements.damageDiceCount === undefined || requirements.damageDiceSize === undefined) {
    return "";
  }
  return ` · ${String(requirements.damageDiceCount)}d${String(requirements.damageDiceSize)} ${requirements.damageType ?? "damage"}`;
}

function actionDisplayName(action: ActionSummary, names: ReadonlyMap<string, string>): string {
  return typeof action.parameters?.label === "string"
    ? action.parameters.label
    : (names.get(action.id) ?? shortEntityName(action.id));
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
    const bonusTotal = (result.bonusDiceRolls ?? [])
      .flatMap((bonus) => bonus.dice)
      .reduce((total, die) => total + die, 0);
    return `${String(result.effectiveKept ?? result.kept)}${bonusTotal === 0 ? "" : ` + ${String(bonusTotal)}`} ${result.modifier >= 0 ? "+" : "−"} ${String(Math.abs(result.modifier))} = ${String(result.total)}`;
  }
  return dicePoolRollExpression(result);
}

function rollDetail(result: DiceRollResult): string {
  if (result.kind === "d20") {
    const dice =
      result.dice.length === 1 ? "1d20" : `2d20 rolled: ${result.dice.map(String).join(", ")}`;
    const rerolls = result.rerolls
      ?.map((reroll) => `${String(reroll.original)} → ${String(reroll.replacement)}`)
      .join(", ");
    const bonusDice = result.bonusDiceRolls
      ?.map(
        (bonus) =>
          `${bonus.source} ${String(bonus.diceCount)}d${String(bonus.diceSize)}: ${bonus.dice.map(String).join(", ")}`,
      )
      .join(" · ");
    return [
      dice,
      ...(rerolls === undefined ? [] : [`${result.rerollSource ?? "Feature"} rerolled ${rerolls}`]),
      ...(bonusDice === undefined ? [] : [bonusDice]),
      ...(result.dieMinimum === undefined || result.effectiveKept === result.kept
        ? []
        : [
            `${result.dieMinimum.sourceName}: ${String(result.kept)} → ${String(result.effectiveKept)} (treated, not rerolled)`,
          ]),
    ].join(" · ");
  }
  return dicePoolRollDetail(result);
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
  const [resolveSaveDamage, setResolveSaveDamage] = useState(false);
  const [incomingSaveAbility, setIncomingSaveAbility] = useState<Ability>("dexterity");
  const [incomingSaveOutcome, setIncomingSaveOutcome] = useState<"success" | "failure">("failure");
  const [incomingSuccessDamage, setIncomingSuccessDamage] = useState<"half" | "none" | "full">(
    "half",
  );
  const [temporaryHitPoints, setTemporaryHitPointsInput] = useState("0");
  const [damageIsCritical, setDamageIsCritical] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<Readonly<Record<string, ActionDraft>>>({});
  const [spellLevels, setSpellLevels] = useState<Readonly<Record<string, string>>>({});
  const [weaponDamageModes, setWeaponDamageModes] = useState<Readonly<Record<string, string>>>({});
  const [weaponMasterySelections, setWeaponMasterySelections] = useState<
    Readonly<Record<string, string>>
  >({});
  const [spellHealsOther, setSpellHealsOther] = useState<Readonly<Record<string, boolean>>>({});
  const [protectedCreatureCounts, setProtectedCreatureCounts] = useState<
    Readonly<Record<string, string>>
  >({});
  const [spellRecoverySelections, setSpellRecoverySelections] = useState<
    Readonly<Record<string, Readonly<Record<string, string>>>>
  >({});
  const [preparedSpellDraft, setPreparedSpellDraft] = useState<string[]>();
  const [restChoiceDraft, setRestChoiceDraft] = useState<{
    character: CharacterDocument;
    selections: Record<string, string>;
  }>();
  const [latestRoll, setLatestRoll] = useState<DiceRollResult>();
  const [useD20Minimums, setUseD20Minimums] = useState(true);
  const [diceRolling, setDiceRolling] = useState(false);
  const [castFeedback, setCastFeedback] = useState<CastFeedback>();
  const diceRollingRef = useRef(false);
  const equipmentCatalog = useMemo(() => inventoryCatalog(rulesPackage), [rulesPackage]);
  const conditionOptions = useMemo(() => {
    const conditionBodies = new Map(
      rulesPackage.entities
        .filter((entity) => entity.kind === "condition")
        .map((entity) => [entity.id, objectValue(entity.body)]),
    );
    const breaksConcentration = (conditionId: string, visited = new Set<string>()): boolean => {
      if (visited.has(conditionId)) return false;
      visited.add(conditionId);
      const body = conditionBodies.get(conditionId);
      if (body?.breaksConcentration === true) return true;
      const granted = Array.isArray(body?.grantsConditions) ? body.grantsConditions : [];
      return granted.some(
        (id) => typeof id === "string" && breaksConcentration(id, new Set(visited)),
      );
    };
    return rulesPackage.entities
      .filter(
        (entity) => entity.kind === "condition" && entity.id !== "srd521.condition.exhaustion",
      )
      .map((entity) => ({
        id: entity.id,
        name: entity.name.en ?? Object.values(entity.name)[0] ?? shortEntityName(entity.id),
        description:
          typeof objectValue(entity.body)?.description === "string"
            ? String(objectValue(entity.body)?.description)
            : "",
        breaksConcentration: breaksConcentration(entity.id),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [rulesPackage]);
  const statusOptions = useMemo(
    () =>
      rulesPackage.entities
        .filter((entity) => entity.kind === "status")
        .map((entity) => {
          const body = objectValue(entity.body);
          const bonusDice = Array.isArray(body?.d20BonusDice) ? body.d20BonusDice : [];
          const hitPointBonusBody = objectValue(body?.hitPointBonus);
          const temporaryHitPointsBody = objectValue(body?.turnStartTemporaryHitPoints);
          const auraBody = objectValue(body?.savingThrowAuraRecipient);
          const savingThrowAuraRecipient =
            typeof auraBody?.selectionLabel === "string" &&
            typeof auraBody.minimum === "number" &&
            typeof auraBody.maximum === "number"
              ? {
                  selectionLabel: auraBody.selectionLabel,
                  minimum: auraBody.minimum,
                  maximum: auraBody.maximum,
                }
              : undefined;
          const protectionBody = objectValue(body?.situationalProtection);
          const grantedActionBody = objectValue(body?.grantedAction);
          const grantedActionDamageBody = objectValue(grantedActionBody?.damage);
          const hitPointBonus =
            typeof hitPointBonusBody?.base === "number" &&
            typeof hitPointBonusBody.minimumSelection === "number" &&
            typeof hitPointBonusBody.maximumSelection === "number" &&
            typeof hitPointBonusBody.perSelectedLevel === "number"
              ? {
                  base: hitPointBonusBody.base,
                  minimumSelection: hitPointBonusBody.minimumSelection,
                  maximumSelection: hitPointBonusBody.maximumSelection,
                  perSelectedLevel: hitPointBonusBody.perSelectedLevel,
                }
              : undefined;
          const turnStartTemporaryHitPoints =
            typeof temporaryHitPointsBody?.selectionLabel === "string" &&
            typeof temporaryHitPointsBody.minimum === "number" &&
            typeof temporaryHitPointsBody.maximum === "number"
              ? {
                  selectionLabel: temporaryHitPointsBody.selectionLabel,
                  minimum: temporaryHitPointsBody.minimum,
                  maximum: temporaryHitPointsBody.maximum,
                }
              : undefined;
          const creatureTypes = Array.isArray(protectionBody?.creatureTypes)
            ? protectionBody.creatureTypes.filter(
                (creatureType): creatureType is string => typeof creatureType === "string",
              )
            : [];
          const blockedConditions = Array.isArray(protectionBody?.blockedConditions)
            ? protectionBody.blockedConditions.filter(
                (condition): condition is string => typeof condition === "string",
              )
            : [];
          const situationalProtection =
            creatureTypes.length > 0 &&
            protectionBody?.incomingAttackRollEffect === "disadvantage" &&
            protectionBody.existingEffectSavingThrowRollEffect === "advantage"
              ? {
                  creatureTypes,
                  blockedConditions,
                  incomingAttackRollEffect: protectionBody.incomingAttackRollEffect,
                  existingEffectSavingThrowRollEffect:
                    protectionBody.existingEffectSavingThrowRollEffect,
                }
              : undefined;
          const actionDamageTypes = Array.isArray(grantedActionDamageBody?.types)
            ? grantedActionDamageBody.types.filter(
                (damageType): damageType is string => typeof damageType === "string",
              )
            : [];
          const grantedAction =
            typeof grantedActionBody?.name === "string" &&
            typeof grantedActionBody.difficultyClassParameter === "string" &&
            typeof grantedActionDamageBody?.minimumSlotLevel === "number" &&
            typeof grantedActionDamageBody.maximumSlotLevel === "number" &&
            actionDamageTypes.length > 0
              ? {
                  name: grantedActionBody.name,
                  difficultyClassParameter: grantedActionBody.difficultyClassParameter,
                  minimumSlotLevel: grantedActionDamageBody.minimumSlotLevel,
                  maximumSlotLevel: grantedActionDamageBody.maximumSlotLevel,
                  damageTypes: actionDamageTypes,
                }
              : undefined;
          const assistedInstructions = Array.isArray(body?.assistedInstructions)
            ? body.assistedInstructions.filter(
                (instruction): instruction is string => typeof instruction === "string",
              )
            : [];
          return {
            id: entity.id,
            name: entity.name.en ?? Object.values(entity.name)[0] ?? shortEntityName(entity.id),
            description: typeof body?.description === "string" ? body.description : "",
            requiresSkillSelection: bonusDice.some(
              (bonus) => objectValue(bonus)?.selection === "skill",
            ),
            hitPointBonus,
            turnStartTemporaryHitPoints,
            savingThrowAuraRecipient,
            situationalProtection,
            grantedAction,
            sourceSpellId: typeof body?.sourceSpellId === "string" ? body.sourceSpellId : undefined,
            assistedInstructions,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    [rulesPackage],
  );
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
      const parsed = characterDocumentSchema.parse(JSON.parse(saved) as unknown);
      const catalog = characterBuilderCatalog(rulesPackage);
      const restored = migrateFeatureFeatChoices(
        migrateFeatureSpellbookChoices(migrateMagicInitiateChoices(parsed, catalog), catalog),
        catalog,
      );
      setCharacter(restored);
      setSource("browser-save");
      setNotice(
        restored === parsed
          ? "Restored your last browser-local character."
          : "Restored your character and recorded missing feature choices or default spell choices; review them before play.",
      );
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setStorageReady(true);
    }
  }, [rulesPackage]);

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
  const restChoices = Object.values(builderCatalog.classes)
    .flatMap((entry) =>
      entry.featureChoices.filter(
        (choice) =>
          choice.optionSelection !== undefined &&
          choice.changeOn?.some((event) => event === "short-rest" || event === "long-rest"),
      ),
    )
    .flatMap((choice) => {
      const selection = character.build.levels
        .flatMap((level) => level.selectedFeatureChoices)
        .find((selection) => selection.choiceId === choice.id);
      return selection === undefined ? [] : [{ choice, selection }];
    });
  const restChoiceSelections =
    restChoiceDraft?.character === character ? restChoiceDraft.selections : {};
  const advancement = useMemo(
    () => levelUpEligibility(character, builderCatalog),
    [builderCatalog, character],
  );
  const evaluation = result.evaluation;
  const incomingDamage =
    resolveSaveDamage &&
    evaluation !== undefined &&
    Number.isSafeInteger(Number(playAmount)) &&
    Number(playAmount) > 0
      ? resolveSavingThrowDamage(evaluation, {
          damage: Number(playAmount),
          ability: incomingSaveAbility,
          outcome: incomingSaveOutcome,
          damageOnSuccess: incomingSuccessDamage,
        })
      : undefined;
  const attackRollMode =
    evaluation?.facts["attackRoll.mode"] === "advantage" ||
    evaluation?.facts["attackRoll.mode"] === "disadvantage"
      ? evaluation.facts["attackRoll.mode"]
      : "normal";
  const universalD20Test = evaluation?.d20Tests.initiative;
  const additionalSpellcastingOption = evaluation?.spells
    .flatMap((spell) => spell.castingOptions ?? [])
    .find((option) => evaluation.spellcasting?.classId !== option.sourceId);
  const playActions =
    evaluation?.actions.filter(
      (action) =>
        supportsStateTransition(action) ||
        savingThrowRerollDefinition(action) !== undefined ||
        actionRequirements(action).damageDiceCount !== undefined,
    ) ?? [];
  const trace =
    selectedTraceId === undefined
      ? undefined
      : (evaluation?.traces[selectedTraceId] ??
        castFeedback?.traces[selectedTraceId] ??
        (incomingDamage?.trace.id === selectedTraceId ? incomingDamage.trace : undefined));

  function linkedStatusIds(spellId: string | undefined): string[] {
    if (spellId === undefined) return [];
    return statusOptions
      .filter((status) => status.sourceSpellId === spellId)
      .map((status) => status.id);
  }

  function beginDiceRoll(): boolean {
    if (diceRollingRef.current) {
      setNotice("Wait for the current dice to settle.");
      return false;
    }
    diceRollingRef.current = true;
    setDiceRolling(true);
    setLatestRoll(undefined);
    return true;
  }

  function finishDiceRoll(): void {
    diceRollingRef.current = false;
    setDiceRolling(false);
  }

  function performRoll(request: D20RollRequest): void {
    if (!beginDiceRoll()) return;
    const rollRequest = applyD20MinimumPreference(request, useD20Minimums);
    void rollD20Fullscreen(rollRequest)
      .catch((error: unknown) => {
        setNotice(`3D dice were unavailable (${errorMessage(error)}); used the fallback roller.`);
        return rollD20(rollRequest);
      })
      .then(setLatestRoll)
      .finally(finishDiceRoll);
  }

  async function performDicePoolRoll(
    request: DicePoolRollRequest,
  ): Promise<DicePoolRollResult | undefined> {
    if (!beginDiceRoll()) return undefined;
    try {
      const result = await rollDiceFullscreen(request).catch((error: unknown) => {
        setNotice(`3D dice were unavailable (${errorMessage(error)}); used the fallback roller.`);
        return rollDice(request);
      });
      setLatestRoll(result);
      return result;
    } finally {
      finishDiceRoll();
    }
  }

  function rollAttackDamage(
    attack: AttackSummary,
    critical = false,
    damageType = attack.damage.type,
  ): void {
    try {
      void performDicePoolRoll(
        weaponDamageRollRequest(attack, weaponDamageModes[attack.id], critical, damageType),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function rollSpellDamage(
    spell: SpellSummary,
    damage: SpellSummary["damage"][number],
    sourceId?: string,
  ): void {
    void performDicePoolRoll(spellDamageRollRequest(spell, damage, sourceId));
  }

  function spellRollControls(
    spell: SpellSummary,
    slotLevel?: number,
    castingSourceId?: string,
  ): React.ReactNode {
    const spellcasting = evaluation?.spellcasting;
    const castingOption =
      castingSourceId === undefined
        ? spell.castingOptions?.[0]
        : spell.castingOptions?.find(({ sourceId }) => sourceId === castingSourceId);
    const spellAttackMode =
      castingOption === undefined
        ? (spellcasting?.attackRollMode ?? attackRollMode)
        : (castingOption.attackRollMode ?? attackRollMode);
    const attackBonus = castingOption?.attackBonus ?? spellcasting?.attackBonus;
    const saveDifficultyClass =
      castingOption?.saveDifficultyClass ?? spellcasting?.saveDifficultyClass;
    const attackTraceId = castingOption?.attackTraceId ?? spellcasting?.attackTraceId;
    const damageRolls = spellDamageRolls(spell);
    const healingRolls =
      evaluation === undefined
        ? []
        : spellHealingRequests(spell, evaluation, slotLevel, castingSourceId);
    if (
      spell.attackType === undefined &&
      damageRolls.length === 0 &&
      healingRolls.length === 0 &&
      spell.savingThrows.length === 0
    )
      return null;
    return (
      <div className="spell-roll-actions">
        {healingRolls.map((healing, index) => (
          <button
            key={`healing-${String(index)}`}
            type="button"
            onClick={() => {
              void performDicePoolRoll(healing);
            }}
            title="Roll healing; apply the result to the target's sheet. Slotted spell healing bonuses apply only on the casting turn."
          >
            Heal {String(healing.diceCount)}d{String(healing.diceSize)}
            {signed(healing.modifier ?? 0)}
          </button>
        ))}
        {spell.attackType === undefined || attackBonus === undefined ? null : (
          <button
            type="button"
            onClick={(event) => {
              if (event.shiftKey) {
                setSelectedTraceId(attackTraceId);
              } else {
                performRoll({
                  label: `${spell.name} spell attack`,
                  modifier: attackBonus,
                  mode: spellAttackMode,
                  ...d20RerollRequest(universalD20Test, evaluation?.attackRollBonusDice ?? []),
                });
              }
            }}
            title="Roll spell attack · Shift-click to inspect calculation"
          >
            Attack {signed(attackBonus)}
          </button>
        )}
        {damageRolls.map((damage, index) => (
          <button
            key={`${damage.type}-${String(index)}`}
            type="button"
            onClick={(event) => {
              const traceId = castingOption?.cantripDamageBonuses?.[0]?.traceId;
              if (event.shiftKey && traceId !== undefined) setSelectedTraceId(traceId);
              else rollSpellDamage(spell, damage, castingOption?.sourceId);
            }}
            title={
              castingOption?.cantripDamageBonuses?.length
                ? `Includes ${castingOption.cantripDamageBonuses.map(({ sourceName, amount }) => `${sourceName} ${signed(amount)}`).join(", ")} · Shift-click to explain`
                : damage.bonusAppliesToOneRoll
                  ? `Roll damage with ${signed(damage.bonus ?? 0)} Elemental Affinity bonus; apply it to only one damage roll of this spell`
                  : spell.hasHigherLevelEffect
                    ? "Roll listed base damage; higher-level scaling is not included"
                    : "Roll listed spell damage"
            }
          >
            {String(damage.diceCount)}d{String(damage.diceSize)}
            {damage.bonus === undefined && !castingOption?.cantripDamageBonuses?.length
              ? ""
              : signed(
                  (damage.bonus ?? 0) +
                    (castingOption?.cantripDamageBonuses ?? []).reduce(
                      (sum, { amount }) => sum + amount,
                      0,
                    ),
                )}{" "}
            {titleCase(damage.type)}
          </button>
        ))}
        {saveDifficultyClass === undefined
          ? null
          : spell.savingThrows.map((ability) => (
              <span key={ability}>
                {ability.slice(0, 3).toUpperCase()} save · DC {String(saveDifficultyClass)}
              </span>
            ))}
      </div>
    );
  }

  function selectFixture(filename: string): void {
    const fixture = fixtures.find((option) => option.filename === filename);
    if (fixture === undefined) return;
    setCharacter(fixture.character);
    setLatestRoll(undefined);
    setPreviousCharacter(undefined);
    setSource(filename);
    setSelectedTraceId(undefined);
    setActionDrafts({});
    setSpellLevels({});
    setSpellHealsOther({});
    setProtectedCreatureCounts({});
    setWeaponDamageModes({});
    setWeaponMasterySelections({});
    setResolveSaveDamage(false);
    setUseD20Minimums(true);
    setSpellRecoverySelections({});
    setCastFeedback(undefined);
    setPreparedSpellDraft(undefined);
    setNotice(`Loaded ${fixture.character.name}.`);
  }

  async function importCharacter(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const parsed = characterDocumentSchema.parse(JSON.parse(await file.text()) as unknown);
      const imported = migrateFeatureFeatChoices(
        migrateFeatureSpellbookChoices(
          migrateMagicInitiateChoices(parsed, builderCatalog),
          builderCatalog,
        ),
        builderCatalog,
      );
      setCharacter(imported);
      setLatestRoll(undefined);
      setPreviousCharacter(undefined);
      setSource("imported");
      setSelectedTraceId(undefined);
      setActionDrafts({});
      setSpellLevels({});
      setSpellHealsOther({});
      setProtectedCreatureCounts({});
      setWeaponDamageModes({});
      setWeaponMasterySelections({});
      setResolveSaveDamage(false);
      setUseD20Minimums(true);
      setSpellRecoverySelections({});
      setCastFeedback(undefined);
      setPreparedSpellDraft(undefined);
      setNotice(
        imported === parsed
          ? `Imported ${parsed.name}; it is saved only in this browser.`
          : `Imported ${parsed.name} and recorded missing feature choices or default spell choices; review them before play.`,
      );
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
    setLatestRoll(undefined);
    setPreviousCharacter(character);
    setCharacter(nextCharacter);
    setSource("browser-save");
    setNotice(message);
  }

  function undoPlayState(): void {
    if (previousCharacter === undefined) return;
    setCharacter(previousCharacter);
    setLatestRoll(undefined);
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
    if (amount === undefined || evaluation === undefined) return;
    if (resolveSaveDamage && incomingDamage === undefined) {
      setNotice("Enter a valid safe whole-number damage amount before resolving the save.");
      return;
    }
    savePlayState(
      applyDamage(character, incomingDamage?.damage ?? amount, undefined, {
        maximumHitPoints: numericFact(evaluation, "hitPoints.maximum"),
        critical: damageIsCritical,
        concentrationEffectIds: linkedStatusIds(character.state.concentrationSpellId),
      }),
      `${character.name} took ${String(incomingDamage?.damage ?? amount)} damage. ${incomingDamage?.explanation ?? ""}`.trim(),
    );
    setDamageIsCritical(false);
  }

  function healCharacter(): void {
    const amount = positivePlayAmount();
    if (amount === undefined || evaluation === undefined) return;
    if (deathSaveStatus(character.state) === "dead") {
      setNotice("Ordinary healing cannot revive a dead character. Resolve revival explicitly.");
      return;
    }
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

  function rest(
    event: "short-rest" | "long-rest",
    recovery?: { sourceId: string; slots: { level: number; count: number }[] },
  ): void {
    try {
      const proposal = proposeRest(
        { character, packages: [rulesPackage] },
        {
          event,
          ...(recovery === undefined ? {} : { spellSlotRecoveries: [recovery] }),
          featureChoiceReplacements: restChoices
            .filter(
              ({ choice }) =>
                choice.changeOn?.includes(event) && restChoiceSelections[choice.id] !== undefined,
            )
            .map(({ choice }) => ({
              choiceId: choice.id,
              optionIds: [restChoiceSelections[choice.id] ?? ""],
            })),
        },
      );
      if (proposal.applicable) setSpellRecoverySelections({});
      if (proposal.applicable && proposal.nextBuild !== undefined) {
        savePlayState(
          commitCharacterState({ ...character, build: proposal.nextBuild }, proposal.nextState),
          `${event === "short-rest" ? "Short" : "Long"} Rest applied, including selected feature options. Enemy attacks and turn boundaries remain manual.`,
        );
        setRestChoiceDraft(undefined);
        return;
      }
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
      [actionId]: { amount: "", ...current[actionId], ...update },
    }));
  }

  async function useSavingThrowReroll(
    action: ActionSummary,
    request: ActionUseRequest,
    disadvantage: boolean,
  ): Promise<void> {
    if (evaluation === undefined) return;
    const previous = latestRoll;
    try {
      const proposal = proposeAction({ character, packages: [rulesPackage] }, request);
      if (!proposal.applicable || proposal.savingThrowReroll === undefined) {
        applyTransition(proposal, "Reaction unavailable.");
        return;
      }
      if (proposal.savingThrowReroll.target === "other") {
        setNotice(
          `${actionDisplayName(action, names)}: tell the target to reroll its ${titleCase(proposal.savingThrowReroll.ability)} save with Advantage on its own sheet. Disadvantage cancels Advantage. Use the new result. Your Reaction is used; track its availability manually.`,
        );
        return;
      }
      const rollRequest = applyD20MinimumPreference(
        savingThrowRerollRequest(action, evaluation, previous, disadvantage),
        useD20Minimums,
      );
      if (!beginDiceRoll()) return;
      try {
        const result = await rollD20Fullscreen(rollRequest).catch((error: unknown) => {
          setNotice(`3D dice were unavailable (${errorMessage(error)}); used the fallback roller.`);
          return rollD20(rollRequest);
        });
        setLatestRoll({
          ...result,
          appliedActionIds: [
            ...(previous?.kind === "d20" ? (previous.appliedActionIds ?? []) : []),
            action.id,
          ],
        });
        setNotice(
          `${actionDisplayName(action, names)} reroll: ${String(result.total)} replaces the failed save. Compare with the DC and resolve conditions manually. Your Reaction is used; post-roll consumable bonuses were not retained.`,
        );
      } finally {
        finishDiceRoll();
      }
    } catch (error) {
      setLatestRoll(previous);
      setNotice(`Reroll failed: ${errorMessage(error)}`);
    }
  }

  async function useFailedSaveReroll(
    action: ActionSummary,
    request: ActionUseRequest,
  ): Promise<void> {
    if (evaluation === undefined) return;
    const previous = latestRoll;
    try {
      const proposal = proposeAction({ character, packages: [rulesPackage] }, request);
      if (!proposal.applicable || proposal.failedSaveReroll === undefined) {
        applyTransition(proposal, "Failed-save reroll unavailable.");
        return;
      }
      const rollRequest = applyD20MinimumPreference(
        failedSaveRerollRequest(action, evaluation, previous),
        useD20Minimums,
      );
      if (!beginDiceRoll()) return;
      try {
        applyTransition(proposal, "Reroll use spent.");
        const result = await rollD20Fullscreen(rollRequest).catch(() => rollD20(rollRequest));
        setLatestRoll({
          ...result,
          appliedActionIds: [
            ...(previous?.kind === "d20" ? (previous.appliedActionIds ?? []) : []),
            action.id,
          ],
        });
        setNotice(
          `${actionDisplayName(action, names)}: ${String(result.total)} replaces the failed save, including +${String(proposal.failedSaveReroll.bonus)}. One use spent even if this save fails. No Reaction used. Compare with the DC and resolve effects manually.`,
        );
      } finally {
        finishDiceRoll();
      }
    } catch (error) {
      setNotice(`Failed-save reroll failed: ${errorMessage(error)}`);
    }
  }

  async function useAction(action: ActionSummary): Promise<void> {
    if (evaluation === undefined) return;
    const previousRoll = latestRoll;
    if (requiresCompletedD20Test(action) && !canApplyPostRollBonus(action, previousRoll)) {
      setNotice(
        "Roll an ability check or saving throw first. This feature can be used only once per roll, before its effects occur.",
      );
      return;
    }
    const draft = actionDrafts[action.id] ?? { amount: "" };
    const request: ActionUseRequest = { actionId: action.id };
    if (
      requiresCompletedD20Test(action) &&
      previousRoll?.kind === "d20" &&
      previousRoll.testId !== undefined
    ) {
      request.completedD20Test = {
        testId: previousRoll.testId,
        appliedActionIds: [...(previousRoll.appliedActionIds ?? [])],
      };
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
      const actionName = actionDisplayName(action, names);
      const actionRollRequest = actionDiceRequest(action, evaluation, actionName);
      const actionRoll =
        actionRollRequest === undefined ? undefined : await performDicePoolRoll(actionRollRequest);
      if (actionRollRequest !== undefined && actionRoll === undefined) return;
      if (actionRoll !== undefined) request.rolls = [...actionRoll.dice];
      const proposal = proposeAction({ character, packages: [rulesPackage] }, request);
      const activatedEffect = rulesPackage.entities.find(
        ({ id }) => id === action.parameters?.activatesEffectId,
      );
      const effectDescription = objectValue(activatedEffect?.body)?.description;
      applyTransition(
        proposal,
        `${actionName} applied (${String(proposal.changes.length)} changes). ${actionMovementMessage(action) ?? ""} ${typeof effectDescription === "string" ? effectDescription : ""}`.trim(),
      );
      if (
        requiresCompletedD20Test(action) &&
        previousRoll !== undefined &&
        actionRoll !== undefined
      ) {
        setLatestRoll(
          proposal.applicable
            ? applyPostRollBonus(action, previousRoll, actionRoll.dice, actionName)
            : previousRoll,
        );
      }
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

  function castSpell(
    spell: SpellSummary,
    asRitual: boolean,
    castingSourceId?: string,
    useFreeCast = false,
  ): void {
    const request: SpellCastRequest = {
      spellId: spell.id,
      asRitual,
      useFreeCast,
      ...(castingSourceId === undefined ? {} : { castingSourceId }),
      restoresHitPointsToOther: spellHealsOther[spell.id] ?? false,
      protectedCreatureCount: Number(protectedCreatureCounts[spell.id] ?? 0),
    };
    const slotLevel =
      spell.level > 0 && !asRitual && !useFreeCast ? selectedSlotLevel(spell) : undefined;
    if (slotLevel !== undefined) request.slotLevel = slotLevel;
    try {
      const supersededStatusIds = spell.concentration
        ? linkedStatusIds(character.state.concentrationSpellId)
        : [];
      const castingCharacter =
        supersededStatusIds.length === 0
          ? character
          : endActiveEffects(character, supersededStatusIds);
      const proposal = proposeSpellCast(
        { character: castingCharacter, packages: [rulesPackage] },
        request,
      );
      if (proposal.applicable) {
        setProtectedCreatureCounts((current) => ({ ...current, [spell.id]: "0" }));
        setSpellHealsOther((current) => ({ ...current, [spell.id]: false }));
        const slot = evaluation?.spellcasting?.slots.find(
          (candidate) => candidate.level === slotLevel,
        );
        setCastFeedback({
          traces: proposal.traces,
          ...(proposal.protection === undefined ? {} : { protection: proposal.protection }),
          spell,
          asRitual,
          ...(useFreeCast ? { freeCast: true } : {}),
          ...(slotLevel === undefined ? {} : { slotLevel }),
          ...(slot === undefined ? {} : { slotsRemaining: Math.max(0, slot.current - 1) }),
          ...(castingSourceId === undefined ? {} : { castingSourceId }),
          ...(!request.restoresHitPointsToOther || slotLevel === undefined
            ? {}
            : {
                selfHealing: proposal.nextState.currentHitPoints - character.state.currentHitPoints,
                selfHealingSource:
                  evaluation?.spellHealingEffects
                    ?.filter(({ target }) => target === "caster-after-healing-other")
                    .map(({ sourceName }) => sourceName)
                    .join(", ") ?? "Spell effect",
              }),
        });
      }
      applyTransition(
        proposal,
        `${spell.name}${asRitual ? " was cast as a ritual" : useFreeCast ? " used its free casting" : " was cast"}${slotLevel === undefined ? "" : ` with a level ${String(slotLevel)} slot`}.${spellStatusMessage(spell) === "" ? "" : ` ${spellStatusMessage(spell)}`}${proposal.protection === undefined ? "" : ` ${spellProtectionInstructions(proposal.protection)}`}`,
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
        {diceRolling ? (
          <div className="dice-rolling-guard" role="status" aria-live="polite" aria-busy="true">
            <span>Rolling dice…</span>
          </div>
        ) : null}
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
              {playActions
                .filter((action) => action.available && canApplyPostRollBonus(action, latestRoll))
                .map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    title="Use before this roll's effects occur; once per roll."
                    className="button secondary compact"
                    disabled={diceRolling}
                    onClick={() => {
                      void useAction(action);
                    }}
                  >
                    {actionDisplayName(action, names)} · Use &amp; add bonus
                  </button>
                ))}
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
                    testId: "initiative",
                    modifier: numericFact(evaluation, "initiative"),
                    mode: evaluation.d20Tests.initiative?.rollMode ?? "normal",
                    ...d20RerollRequest(evaluation.d20Tests.initiative),
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
                  <DeathSaveControls
                    key={character.id}
                    state={character.state}
                    evaluation={evaluation}
                    previous={latestRoll}
                    busy={diceRolling}
                    onRoll={performRoll}
                    onExplain={() => {
                      setSelectedTraceId("savingThrow.death");
                    }}
                    onResolve={(request) => {
                      const proposal = proposeDeathSavingThrow(
                        { character, packages: [rulesPackage] },
                        request,
                      );
                      applyTransition(
                        proposal,
                        `Death Saving Throw: ${proposal.outcome ?? "unavailable"}.`,
                      );
                    }}
                  />
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
                    <label htmlFor="hp-amount">
                      {resolveSaveDamage
                        ? "Damage before saving throw (or healing amount)"
                        : "Damage or healing amount"}
                    </label>
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
                        Apply{" "}
                        {incomingDamage === undefined
                          ? "damage"
                          : `${String(incomingDamage.damage)} damage`}
                      </button>
                      <button className="button heal" type="button" onClick={healCharacter}>
                        Heal
                      </button>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={damageIsCritical}
                        onChange={(event) => {
                          setDamageIsCritical(event.target.checked);
                        }}
                      />{" "}
                      Damage is from a Critical Hit (two failures if already at 0 HP)
                    </label>
                  </div>
                  <div className="play-control save-damage-controls">
                    <label>
                      <input
                        type="checkbox"
                        checked={resolveSaveDamage}
                        onChange={(event) => {
                          setResolveSaveDamage(event.target.checked);
                        }}
                      />
                      Resolve damage from a saving throw
                    </label>
                    <small>
                      Leave off for damage already resolved by the DM. Resistances, vulnerability,
                      and other reductions remain manual. If they apply, resolve them separately and
                      turn this off before entering the final total. Healing ignores these save
                      controls.
                    </small>
                    {resolveSaveDamage ? (
                      <>
                        <label>
                          Saving throw ability
                          <select
                            value={incomingSaveAbility}
                            onChange={(event) => {
                              setIncomingSaveAbility(event.target.value as Ability);
                            }}
                          >
                            {abilities.map((ability) => (
                              <option key={ability} value={ability}>
                                {titleCase(ability)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Saving throw outcome
                          <select
                            value={incomingSaveOutcome}
                            onChange={(event) => {
                              setIncomingSaveOutcome(event.target.value as "success" | "failure");
                            }}
                          >
                            <option value="failure">Failed save</option>
                            <option value="success">Successful save</option>
                          </select>
                        </label>
                        <label>
                          The effect normally deals on a successful save
                          <select
                            value={incomingSuccessDamage}
                            onChange={(event) => {
                              setIncomingSuccessDamage(
                                event.target.value as "half" | "none" | "full",
                              );
                            }}
                          >
                            <option value="half">Half damage</option>
                            <option value="none">No damage</option>
                            <option value="full">Full damage</option>
                          </select>
                        </label>
                        {incomingDamage === undefined ? null : (
                          <TraceButton
                            traceId={incomingDamage.trace.id}
                            onSelect={setSelectedTraceId}
                            inspectOnClick
                          >
                            {incomingDamage.explanation} · Explain
                          </TraceButton>
                        )}
                      </>
                    ) : null}
                    {(evaluation.savingThrowDamageEffects ?? []).map((effect) => (
                      <div key={effect.traceId}>
                        <TraceButton
                          traceId={effect.traceId}
                          onSelect={setSelectedTraceId}
                          inspectOnClick
                        >
                          {effect.sourceName} · {effect.active ? "Active" : "Inactive"}
                        </TraceButton>
                        <small>
                          {effect.reasons.length > 0
                            ? effect.reasons.join(" ")
                            : `For ${effect.ability} saves that normally halve damage: success × ${String(effect.successFraction)}, failure × ${String(effect.failureFraction)}. Declare the save context above to apply.`}
                        </small>
                      </div>
                    ))}
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
                          savePlayState(
                            clearConcentrationAndEffects(
                              character,
                              linkedStatusIds(character.state.concentrationSpellId),
                            ),
                            "Concentration and its linked status ended.",
                          );
                        }}
                      >
                        End
                      </button>
                    </div>
                  </div>
                  <div className="condition-controls">
                    {(evaluation.savingThrowAuras ?? []).map((aura) => (
                      <div key={aura.sourceId}>
                        <strong>
                          {aura.name} · {aura.active ? "Active" : "Inactive while Incapacitated"}
                        </strong>
                        <TraceButton
                          traceId={aura.traceId}
                          onSelect={setSelectedTraceId}
                          inspectOnClick
                        >
                          Save bonus {signed(aura.bonus)} · {String(aura.radiusFeet)} ft.
                        </TraceButton>
                        <small>
                          Allies in range: set “
                          {names.get(aura.recipientStatusId) ??
                            shortEntityName(aura.recipientStatusId)}
                          ” on their sheets with bonus {signed(aura.bonus)}. Only one aura applies.
                        </small>
                        {(aura.conditionImmunities ?? []).map((immunity) => (
                          <div key={immunity.sourceId}>
                            <TraceButton
                              traceId={immunity.traceId}
                              onSelect={setSelectedTraceId}
                              inspectOnClick
                            >
                              {immunity.name} · {aura.active ? "Immune to" : "Inactive:"}{" "}
                              {immunity.conditionIds
                                .map((id) => names.get(id) ?? shortEntityName(id))
                                .join(", ")}
                            </TraceButton>
                            <small>
                              {aura.active ? "Allies in range: set" : "Aura inactive: remove"} “
                              {names.get(immunity.recipientStatusId) ??
                                shortEntityName(immunity.recipientStatusId)}
                              ” on their sheets. Existing conditions are suppressed, not removed;
                              range and the source Paladin’s condition are tracked manually.
                            </small>
                          </div>
                        ))}
                      </div>
                    ))}
                    <span>
                      <strong>Conditions</strong>
                      <small>Click to apply or remove</small>
                    </span>
                    <div className="condition-grid">
                      {conditionOptions.map((condition) => {
                        const active = character.state.conditionIds.includes(condition.id);
                        const suppressionTraceId = `condition.${condition.id.slice(condition.id.lastIndexOf(".") + 1)}.suppressed`;
                        const suppressed =
                          active && evaluation.traces[suppressionTraceId] !== undefined;
                        return (
                          <button
                            key={condition.id}
                            type="button"
                            className={active ? "condition-toggle active" : "condition-toggle"}
                            aria-pressed={active}
                            title={`${condition.description}${suppressed ? " Suppressed by immunity; the condition stays recorded. Shift-click to inspect." : ""}`}
                            onClick={(event) => {
                              if (suppressed && event.shiftKey) {
                                setSelectedTraceId(suppressionTraceId);
                                return;
                              }
                              const updated = setConditionActive(
                                character,
                                condition.id,
                                !active,
                                undefined,
                                condition.breaksConcentration,
                              );
                              savePlayState(
                                !active && condition.breaksConcentration
                                  ? endActiveEffects(
                                      updated,
                                      linkedStatusIds(character.state.concentrationSpellId),
                                    )
                                  : updated,
                                `${condition.name} ${active ? "removed" : "applied"}.`,
                              );
                            }}
                          >
                            {condition.name}
                            {suppressed ? " · suppressed" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {statusOptions.length === 0 ? null : (
                    <div className="condition-controls">
                      <span>
                        <strong>Beneficial statuses</strong>
                        <small>Set spell and feature effects on this sheet</small>
                      </span>
                      <div className="condition-grid">
                        {statusOptions.map((status) => {
                          const active = character.state.activeEffectIds.includes(status.id);
                          return (
                            <button
                              key={status.id}
                              type="button"
                              className={active ? "condition-toggle active" : "condition-toggle"}
                              aria-pressed={active}
                              title={status.description}
                              onClick={() => {
                                const selection =
                                  character.state.activeEffectSelections[status.id] ??
                                  String(status.hitPointBonus?.minimumSelection ?? "");
                                const hitPointBonus =
                                  status.hitPointBonus === undefined
                                    ? undefined
                                    : selectedStatusHitPointBonus(status.hitPointBonus, selection);
                                savePlayState(
                                  hitPointBonus === undefined
                                    ? setActiveEffectActive(character, status.id, !active)
                                    : setActiveEffectWithHitPointBonus(
                                        character,
                                        status.id,
                                        !active,
                                        hitPointBonus,
                                        selection,
                                      ),
                                  `${status.name} ${active ? "removed" : "set"}.`,
                                );
                              }}
                            >
                              {status.name}
                            </button>
                          );
                        })}
                      </div>
                      {statusOptions
                        .filter(
                          (status) =>
                            status.savingThrowAuraRecipient !== undefined &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => {
                          const definition = status.savingThrowAuraRecipient;
                          if (definition === undefined) return null;
                          return (
                            <label key={status.id}>
                              {definition.selectionLabel}
                              <select
                                aria-label={`${status.name} bonus`}
                                value={character.state.activeEffectSelections[status.id] ?? ""}
                                onChange={(event) => {
                                  savePlayState(
                                    setActiveEffectSelection(
                                      character,
                                      status.id,
                                      event.target.value,
                                    ),
                                    `${status.name} bonus selected.`,
                                  );
                                }}
                              >
                                <option value="" disabled>
                                  Choose caster's bonus
                                </option>
                                {Array.from(
                                  { length: definition.maximum - definition.minimum + 1 },
                                  (_, index) => definition.minimum + index,
                                ).map((bonus) => (
                                  <option key={bonus} value={String(bonus)}>
                                    {signed(bonus)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.requiresSkillSelection &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => (
                          <label className="effect-selection" key={`${status.id}-selection`}>
                            <span>{status.name} skill</span>
                            <select
                              value={character.state.activeEffectSelections[status.id] ?? ""}
                              onChange={(event) => {
                                if (event.target.value === "") return;
                                savePlayState(
                                  setActiveEffectSelection(
                                    character,
                                    status.id,
                                    event.target.value,
                                  ),
                                  `${status.name} now applies to ${titleCase(event.target.value.replace("skill.", ""))}.`,
                                );
                              }}
                            >
                              <option value="" disabled>
                                Choose a skill
                              </option>
                              {Object.values(evaluation.d20Tests)
                                .filter((test) => test.id.startsWith("skill."))
                                .sort((left, right) => left.id.localeCompare(right.id))
                                .map((skill) => (
                                  <option key={skill.id} value={skill.id}>
                                    {titleCase(skill.id.replace("skill.", ""))}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ))}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.hitPointBonus !== undefined &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => {
                          const definition = status.hitPointBonus;
                          if (definition === undefined) return null;
                          const currentSelection =
                            character.state.activeEffectSelections[status.id] ??
                            String(definition.minimumSelection);
                          const currentBonus = selectedStatusHitPointBonus(
                            definition,
                            currentSelection,
                          );
                          return (
                            <label className="effect-selection" key={`${status.id}-hp-selection`}>
                              <span>{status.name} slot level</span>
                              <select
                                value={currentSelection}
                                onChange={(event) => {
                                  const nextBonus = selectedStatusHitPointBonus(
                                    definition,
                                    event.target.value,
                                  );
                                  savePlayState(
                                    setActiveEffectSelectionWithHitPointAdjustment(
                                      character,
                                      status.id,
                                      event.target.value,
                                      nextBonus - currentBonus,
                                    ),
                                    `${status.name} now grants ${String(nextBonus)} current and maximum HP.`,
                                  );
                                }}
                              >
                                {Array.from(
                                  {
                                    length:
                                      definition.maximumSelection - definition.minimumSelection + 1,
                                  },
                                  (_, index) => definition.minimumSelection + index,
                                ).map((level) => (
                                  <option key={level} value={String(level)}>
                                    Level {String(level)} (+
                                    {String(
                                      selectedStatusHitPointBonus(definition, String(level)),
                                    )}{" "}
                                    HP)
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.grantedAction !== undefined &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => {
                          const action = status.grantedAction;
                          if (action === undefined) return null;
                          const parameters =
                            character.state.activeEffectParameters[status.id] ?? {};
                          const damageType = parameters.damageType ?? action.damageTypes[0] ?? "";
                          const slotLevel =
                            parameters.spellSlotLevel ?? String(action.minimumSlotLevel);
                          const saveDifficultyClass =
                            parameters[action.difficultyClassParameter] ?? "";
                          return (
                            <div className="effect-action-setup" key={`${status.id}-action`}>
                              <strong>{action.name} setup</strong>
                              <div>
                                <label>
                                  Damage type
                                  <select
                                    value={damageType}
                                    onChange={(event) => {
                                      savePlayState(
                                        setActiveEffectParameter(
                                          character,
                                          status.id,
                                          "damageType",
                                          event.target.value,
                                        ),
                                        `${action.name} damage changed to ${event.target.value}.`,
                                      );
                                    }}
                                  >
                                    {action.damageTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {titleCase(type)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Slot level
                                  <select
                                    value={slotLevel}
                                    onChange={(event) => {
                                      savePlayState(
                                        setActiveEffectParameter(
                                          character,
                                          status.id,
                                          "spellSlotLevel",
                                          event.target.value,
                                        ),
                                        `${action.name} slot level set to ${event.target.value}.`,
                                      );
                                    }}
                                  >
                                    {Array.from(
                                      {
                                        length:
                                          action.maximumSlotLevel - action.minimumSlotLevel + 1,
                                      },
                                      (_, index) => action.minimumSlotLevel + index,
                                    ).map((level) => (
                                      <option key={level} value={String(level)}>
                                        {String(level)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Caster save DC
                                  <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    step="1"
                                    value={saveDifficultyClass}
                                    placeholder="Required"
                                    onChange={(event) => {
                                      const value = Number(event.target.value);
                                      if (!Number.isInteger(value) || value < 1 || value > 30)
                                        return;
                                      savePlayState(
                                        setActiveEffectParameter(
                                          character,
                                          status.id,
                                          action.difficultyClassParameter,
                                          event.target.value,
                                        ),
                                        `${action.name} save DC set to ${event.target.value}.`,
                                      );
                                    }}
                                  />
                                </label>
                              </div>
                              <small>The roll control appears under Play → Use a feature.</small>
                            </div>
                          );
                        })}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.turnStartTemporaryHitPoints !== undefined &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => {
                          const definition = status.turnStartTemporaryHitPoints;
                          if (definition === undefined) return null;
                          const selection =
                            character.state.activeEffectSelections[status.id] ??
                            String(definition.minimum);
                          const amount = Number(selection);
                          return (
                            <div className="effect-selection" key={`${status.id}-temporary-hp`}>
                              <span>{definition.selectionLabel}</span>
                              <div className="effect-selection-action">
                                <select
                                  aria-label={`${status.name} ${definition.selectionLabel}`}
                                  value={selection}
                                  onChange={(event) => {
                                    savePlayState(
                                      setActiveEffectSelection(
                                        character,
                                        status.id,
                                        event.target.value,
                                      ),
                                      `${status.name} caster modifier set to ${event.target.value}.`,
                                    );
                                  }}
                                >
                                  {Array.from(
                                    { length: definition.maximum - definition.minimum + 1 },
                                    (_, index) => definition.minimum + index,
                                  ).map((modifier) => (
                                    <option key={modifier} value={String(modifier)}>
                                      {signed(modifier)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="button secondary compact"
                                  type="button"
                                  onClick={() => {
                                    savePlayState(
                                      setTemporaryHitPoints(
                                        character,
                                        Math.max(character.state.temporaryHitPoints, amount),
                                      ),
                                      `${status.name} turn-start Temporary HP applied.`,
                                    );
                                  }}
                                >
                                  Apply turn start
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.situationalProtection !== undefined &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => {
                          const protection = status.situationalProtection;
                          if (protection === undefined) return null;
                          const creatureTypes = protection.creatureTypes.map(titleCase).join(", ");
                          return (
                            <div className="effect-instructions" key={`${status.id}-instructions`}>
                              <strong>Against {creatureTypes}</strong>
                              <ul>
                                <li>Incoming attacks have Disadvantage.</li>
                                <li>
                                  Block {protection.blockedConditions.map(titleCase).join(", ")}.
                                </li>
                                <li>
                                  Existing relevant effects grant Advantage on new saving throws.
                                </li>
                              </ul>
                            </div>
                          );
                        })}
                      {statusOptions
                        .filter(
                          (status) =>
                            status.assistedInstructions.length > 0 &&
                            character.state.activeEffectIds.includes(status.id),
                        )
                        .map((status) => (
                          <div className="effect-instructions" key={`${status.id}-assistance`}>
                            <strong>{status.name}</strong>
                            <ul>
                              {status.assistedInstructions.map((instruction) => (
                                <li key={instruction}>{instruction}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}
                  {character.state.activeEffectIds.length === 0 ? null : (
                    <div className="active-effect-controls">
                      <span>
                        <strong>Active effects</strong>
                        <small>Click an effect to end it</small>
                      </span>
                      <div className="tag-list">
                        {character.state.activeEffectIds.map((effectId) => (
                          <button
                            key={effectId}
                            type="button"
                            onClick={() => {
                              const status = statusOptions.find(({ id }) => id === effectId);
                              const hitPointBonus =
                                status?.hitPointBonus === undefined
                                  ? undefined
                                  : selectedStatusHitPointBonus(
                                      status.hitPointBonus,
                                      character.state.activeEffectSelections[effectId],
                                    );
                              savePlayState(
                                hitPointBonus === undefined
                                  ? setActiveEffectActive(character, effectId, false)
                                  : setActiveEffectWithHitPointBonus(
                                      character,
                                      effectId,
                                      false,
                                      hitPointBonus,
                                      character.state.activeEffectSelections[effectId] ??
                                        String(status?.hitPointBonus?.minimumSelection ?? ""),
                                    ),
                                `${names.get(effectId) ?? shortEntityName(effectId)} ended.`,
                              );
                            }}
                          >
                            {names.get(effectId) ?? shortEntityName(effectId)} ×
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>

                <Section title="Rest" eyebrow="Atomic rules transitions">
                  <p className="section-copy">
                    Rests apply all modeled recovery rules together. A Short Rest without Hit Dice
                    still recharges eligible resources.
                  </p>
                  {restChoices.map(({ choice, selection }) => {
                    const selectedId = restChoiceSelections[choice.id] ?? selection.optionIds[0];
                    const selected = choice.options.find((option) => option.id === selectedId);
                    return (
                      <div key={choice.id} className="effect-selection">
                        <label>
                          {shortEntityName(choice.id)} · choose for your next rest
                          <select
                            value={selectedId}
                            onChange={(event) => {
                              setRestChoiceDraft({
                                character,
                                selections: {
                                  ...restChoiceSelections,
                                  [choice.id]: event.target.value,
                                },
                              });
                            }}
                          >
                            {choice.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p>
                          Current:{" "}
                          {
                            choice.options.find((option) => option.id === selection.optionIds[0])
                              ?.name
                          }
                          . Changes apply only when you complete an eligible rest.
                        </p>
                        <p>{selected?.description}</p>
                      </div>
                    );
                  })}
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
                  {(evaluation.spellSlotRecoveries ?? []).map((recovery) => {
                    const selected = spellRecoverySelections[recovery.sourceId] ?? {};
                    const slots = Object.entries(selected)
                      .filter(([, count]) => Number(count) > 0)
                      .map(([level, count]) => ({ level: Number(level), count: Number(count) }));
                    const total = slots.reduce((sum, slot) => sum + slot.level * slot.count, 0);
                    return (
                      <div key={recovery.sourceId} className="effect-selection">
                        <strong>
                          {recovery.name} · {recovery.available ? "Ready" : "Spent until Long Rest"}
                        </strong>
                        <TraceButton
                          traceId={recovery.traceId}
                          onSelect={setSelectedTraceId}
                          inspectOnClick
                        >
                          Recovery budget: {String(recovery.maximumCombinedLevel)} combined slot
                          levels
                        </TraceButton>
                        <small>
                          Choose expended slots as part of your Short Rest, up to{" "}
                          {String(recovery.maximumCombinedLevel)} combined levels; no slot above
                          level {String(recovery.maximumSlotLevel)}. A partial recovery spends the
                          use.
                        </small>
                        {(evaluation.spellcasting?.slots ?? [])
                          .filter(
                            (slot) => slot.level <= recovery.maximumSlotLevel && slot.expended > 0,
                          )
                          .map((slot) => (
                            <label key={slot.level}>
                              Level {String(slot.level)} slots
                              <select
                                aria-label={`${recovery.name} level ${String(slot.level)} slots`}
                                value={selected[String(slot.level)] ?? "0"}
                                disabled={!recovery.available}
                                onChange={(event) => {
                                  setSpellRecoverySelections((current) => ({
                                    ...current,
                                    [recovery.sourceId]: {
                                      ...current[recovery.sourceId],
                                      [String(slot.level)]: event.target.value,
                                    },
                                  }));
                                }}
                              >
                                {Array.from({ length: slot.expended + 1 }, (_, count) => (
                                  <option key={count} value={String(count)}>
                                    {String(count)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        <small>
                          Selected {String(total)} of {String(recovery.maximumCombinedLevel)} levels
                        </small>
                        <button
                          type="button"
                          className="button secondary compact"
                          disabled={
                            !recovery.available ||
                            total === 0 ||
                            total > recovery.maximumCombinedLevel
                          }
                          onClick={() => {
                            rest("short-rest", { sourceId: recovery.sourceId, slots });
                          }}
                        >
                          Short Rest &amp; {recovery.name}
                        </button>
                      </div>
                    );
                  })}
                </Section>

                {(evaluation.attackDamageRiders?.length ?? 0) === 0 ? null : (
                  <Section title="Damage riders" eyebrow="After an eligible hit">
                    {evaluation.attackDamageRiders?.map((rider) => (
                      <DamageRiderControls
                        key={`${character.id}:${character.metadata.updatedAt}:${rider.traceId}`}
                        rider={rider}
                        busy={diceRolling}
                        onRoll={performDicePoolRoll}
                        onExplain={() => {
                          setSelectedTraceId(rider.traceId);
                        }}
                      />
                    ))}
                  </Section>
                )}
                <Section
                  title="Use a feature"
                  eyebrow={`${String(playActions.length)} active actions`}
                >
                  {playActions.length === 0 ? (
                    <p className="empty">
                      No feature actions or active-status rolls are available.
                    </p>
                  ) : (
                    <div className="play-action-list">
                      {playActions.map((action) => {
                        const requirements = actionRequirements(action);
                        const draft = actionDrafts[action.id] ?? { amount: "" };
                        const actionName = actionDisplayName(action, names);
                        const transitionDice = actionDiceRequest(action, evaluation, actionName);
                        return (
                          <div
                            key={action.id}
                            className={
                              savingThrowRerollDefinition(action)
                                ? "saving-throw-reroll-card"
                                : undefined
                            }
                          >
                            <span>
                              <strong>{actionName}</strong>
                              <small>
                                {action.actionEconomy === undefined
                                  ? "Special action"
                                  : titleCase(action.actionEconomy)}{" "}
                                · {action.available ? "Ready" : "Unavailable"}
                                {typeof action.parameters?.effect === "string"
                                  ? ` · ${titleCase(action.parameters.effect)}`
                                  : ""}
                                {typeof action.parameters?.requirement === "string"
                                  ? ` · Requires ${action.parameters.requirement}`
                                  : ""}
                                {actionMovementMessage(action) === undefined
                                  ? ""
                                  : ` · ${actionMovementMessage(action) ?? ""}`}
                              </small>
                            </span>
                            <SavingThrowRerollControls
                              key={`${character.id}:${character.metadata.updatedAt}:${action.id}`}
                              action={action}
                              evaluation={evaluation}
                              previous={latestRoll}
                              busy={diceRolling}
                              onExplain={() => {
                                setSelectedTraceId(action.traceId);
                              }}
                              onUse={(request, disadvantage) => {
                                void useSavingThrowReroll(action, request, disadvantage);
                              }}
                            />
                            <FailedSaveRerollControls
                              key={`failed-save:${character.id}:${character.metadata.updatedAt}:${action.id}:${latestRoll?.label ?? ""}:${String(latestRoll?.total ?? "")}`}
                              action={action}
                              evaluation={evaluation}
                              previous={latestRoll}
                              busy={diceRolling}
                              onExplain={() => {
                                setSelectedTraceId(action.traceId);
                              }}
                              onUse={(request) => {
                                void useFailedSaveReroll(action, request);
                              }}
                            />
                            <div className="action-inputs">
                              {requirements.rollDiceCount === undefined ||
                              requirements.rollDiceSize === undefined ? null : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void performDicePoolRoll({
                                      label: `${actionName} · ${requirements.rollLabel ?? "Roll"}`,
                                      diceCount: requirements.rollDiceCount ?? 1,
                                      diceSize: requirements.rollDiceSize ?? 12,
                                      modifier: requirements.rollModifier ?? 0,
                                    });
                                  }}
                                >
                                  Roll {String(requirements.rollDiceCount)}d
                                  {String(requirements.rollDiceSize)}
                                  {(requirements.rollModifier ?? 0) === 0
                                    ? ""
                                    : ` ${(requirements.rollModifier ?? 0) > 0 ? "+" : "−"} ${String(Math.abs(requirements.rollModifier ?? 0))}`}{" "}
                                  {requirements.rollLabel}
                                </button>
                              )}
                              {requirements.damageDiceCount === undefined ||
                              requirements.damageDiceSize === undefined ? null : (
                                <button
                                  type="button"
                                  disabled={!action.available || diceRolling}
                                  onClick={() => {
                                    void performDicePoolRoll({
                                      label: `${actionName} · ${titleCase(requirements.damageType ?? "damage")}`,
                                      diceCount: requirements.damageDiceCount ?? 1,
                                      diceSize: requirements.damageDiceSize ?? 10,
                                    });
                                  }}
                                >
                                  Roll {String(requirements.damageDiceCount)}d
                                  {String(requirements.damageDiceSize)} {requirements.damageType}
                                </button>
                              )}
                              {requirements.saveAbility === undefined ||
                              requirements.saveDifficultyClass === undefined ? null : (
                                <span>
                                  {requirements.saveAbility.slice(0, 3).toUpperCase()} save · DC{" "}
                                  {String(requirements.saveDifficultyClass)}
                                </span>
                              )}
                              {requirements.temporaryHitPoints === undefined ? null : (
                                <span>
                                  Gain {String(requirements.temporaryHitPoints)} Temporary HP
                                </span>
                              )}
                              {requirements.minimumCurrentHitPoints === undefined ? null : (
                                <span>
                                  Raise HP to {String(requirements.minimumCurrentHitPoints)}
                                </span>
                              )}
                              {transitionDice === undefined ? null : (
                                <span className="action-roll-preview">
                                  {action.parameters?.checkBonus === undefined ? "Heals" : "Rolls"}{" "}
                                  {String(transitionDice.diceCount)}d
                                  {String(transitionDice.diceSize)}
                                  {(transitionDice.modifier ?? 0) === 0
                                    ? ""
                                    : ` ${(transitionDice.modifier ?? 0) > 0 ? "+" : "−"} ${String(Math.abs(transitionDice.modifier ?? 0))}`}
                                </span>
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
                              {supportsStateTransition(action) &&
                              failedSaveRerollDefinition(action) === undefined ? (
                                <button
                                  className="button primary compact"
                                  type="button"
                                  disabled={
                                    !action.available ||
                                    diceRolling ||
                                    (requiresCompletedD20Test(action) &&
                                      !canApplyPostRollBonus(action, latestRoll))
                                  }
                                  onClick={() => {
                                    void useAction(action);
                                  }}
                                >
                                  {transitionDice === undefined ? "Use" : "Use & roll"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>

                {evaluation.spells.length === 0 ? null : (
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
                              : castFeedback.freeCast === true
                                ? "Feature · free casting spent"
                                : castFeedback.slotLevel === undefined
                                  ? "Cantrip · no spell slot spent"
                                  : `Level ${String(castFeedback.slotLevel)} slot spent · ${String(castFeedback.slotsRemaining ?? 0)} remaining`}
                            {castFeedback.spell.concentration ? " · Concentration started" : ""}
                            {castFeedback.selfHealing === undefined
                              ? ""
                              : ` · ${castFeedback.selfHealingSource ?? "Spell effect"} restored ${String(castFeedback.selfHealing)} HP to you`}
                          </p>
                          {castFeedback.slotLevel !== undefined &&
                          castFeedback.slotLevel > castFeedback.spell.level &&
                          spellDamageRolls(castFeedback.spell).length > 0 ? (
                            <em>
                              Damage buttons show listed base dice; upcast scaling is not yet
                              structured.
                            </em>
                          ) : null}
                          {spellStatusInstructions(castFeedback.spell).map((instruction) => (
                            <em key={instruction}>{instruction}</em>
                          ))}
                          {castFeedback.protection === undefined ? null : (
                            <>
                              <em>{spellProtectionInstructions(castFeedback.protection)}</em>
                              <button
                                type="button"
                                className="button secondary compact"
                                onClick={() => {
                                  setSelectedTraceId(castFeedback.protection?.traceId);
                                }}
                              >
                                Explain protection limit
                              </button>
                            </>
                          )}
                          {spellRollControls(
                            castFeedback.spell,
                            castFeedback.slotLevel,
                            castFeedback.castingSourceId,
                          )}
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
                        const protection = evaluation.spellProtections?.find(
                          (effect) => effect.school === spell.school,
                        );
                        const selectedSlot = eligibleSlots.find((slot) => slot.level === slotLevel);
                        const canCastWithSlot =
                          spell.level === 0 || (spell.prepared && (selectedSlot?.current ?? 0) > 0);
                        const freeCastingOptions = spell.castingOptions?.filter(
                          (option) => option.freeCastResourceId !== undefined,
                        );
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
                              {spell.effectsRequireReview ? (
                                <small>
                                  Effects assisted · Use the source text; damage and conditional
                                  effects are not automated.
                                </small>
                              ) : null}
                              {spellRollControls(spell, spell.level === 0 ? undefined : slotLevel)}
                            </div>
                            <div className="spell-cast-controls">
                              {protection === undefined ? null : (
                                <label>
                                  {protection.sourceName}: visible, affected creatures other than
                                  you
                                  <input
                                    type="number"
                                    min={0}
                                    max={
                                      (spell.level === 0 ? 0 : slotLevel) +
                                      protection.additionalTargets
                                    }
                                    step={1}
                                    aria-label={`Protected creature count for ${spell.name}`}
                                    value={protectedCreatureCounts[spell.id] ?? "0"}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setProtectedCreatureCounts((current) => ({
                                        ...current,
                                        [spell.id]: value,
                                      }));
                                    }}
                                  />
                                  <small>
                                    0 = unused. Saving throws only; no target sheet is changed.
                                    Free/ritual casts use the spell’s base level.
                                  </small>
                                </label>
                              )}
                              {(spell.healing?.length ?? 0) > 0 &&
                              evaluation.spellHealingEffects?.some(
                                ({ target }) => target === "caster-after-healing-other",
                              ) ? (
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={spellHealsOther[spell.id] ?? false}
                                    onChange={(event) => {
                                      setSpellHealsOther((current) => ({
                                        ...current,
                                        [spell.id]: event.target.checked,
                                      }));
                                    }}
                                  />
                                  This spell restores HP to another creature (triggers{" "}
                                  {evaluation.spellHealingEffects
                                    .filter(({ target }) => target === "caster-after-healing-other")
                                    .map(({ sourceName }) => sourceName)
                                    .join(", ")}{" "}
                                  with a spell slot)
                                </label>
                              ) : null}
                              {spell.level === 0 || eligibleSlots.length === 0 ? null : (
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
                              {spell.level === 0 || eligibleSlots.length > 0 ? (
                                <button
                                  className="button primary compact"
                                  type="button"
                                  disabled={!canCastWithSlot}
                                  onClick={() => {
                                    castSpell(spell, false);
                                  }}
                                >
                                  Cast
                                </button>
                              ) : null}
                              {freeCastingOptions?.map((freeCastingOption) => (
                                <button
                                  key={freeCastingOption.sourceId}
                                  className="button secondary compact"
                                  type="button"
                                  disabled={freeCastingOption.freeCastAvailable !== true}
                                  onClick={() => {
                                    castSpell(spell, false, freeCastingOption.sourceId, true);
                                  }}
                                >
                                  {freeCastingOption.freeCastAvailable === true
                                    ? "Free cast"
                                    : "Free cast spent"}
                                  {" · "}
                                  {names.get(freeCastingOption.sourceId) ??
                                    shortEntityName(freeCastingOption.sourceId)}
                                </button>
                              ))}
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
                      const check = evaluation.d20Tests[`abilityCheck.${ability}`];
                      const save = evaluation.d20Tests[`savingThrow.${ability}`];
                      return (
                        <TraceButton
                          key={ability}
                          className="ability-card"
                          traceId={`ability.${ability}.modifier`}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: `${titleCase(ability)} check`,
                            testId: `abilityCheck.${ability}`,
                            modifier,
                            mode: check?.rollMode ?? "normal",
                            ...d20RerollRequest(check),
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

                <Section title="Saving throws" eyebrow="Defenses">
                  <div className="skill-list">
                    {abilities.map((ability) => {
                      const save = evaluation.d20Tests[`savingThrow.${ability}`];
                      if (save === undefined) return null;
                      return (
                        <TraceButton
                          key={save.id}
                          traceId={save.traceId}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: `${titleCase(ability)} saving throw`,
                            testId: save.id,
                            modifier: save.modifier,
                            mode: save.rollMode,
                            ...d20RerollRequest(save),
                          }}
                          onRoll={performRoll}
                        >
                          <i className={`prof-dot ${save.proficiency.level}`} aria-hidden="true" />
                          <span>{titleCase(ability)}</span>
                          <strong>{signed(save.modifier)}</strong>
                        </TraceButton>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Skills & fixed tool grants" eyebrow="Checks & proficiencies">
                  {Object.values(evaluation.d20Tests).some(
                    (test) => test.dieMinimum !== undefined,
                  ) ? (
                    <button
                      type="button"
                      className="button secondary compact"
                      aria-pressed={useD20Minimums}
                      onClick={() => {
                        setUseD20Minimums((current) => !current);
                      }}
                    >
                      Optional d20 minimums: {useD20Minimums ? "On" : "Off"}
                    </button>
                  ) : null}
                  <p className="empty">
                    Tool checks list each ability; use the ability called for by the DM. Unresolved
                    tool choices, tool ownership, and skill/tool overlap Advantage remain manual.
                  </p>
                  <div className="skill-list">
                    {Object.values(evaluation.d20Tests)
                      .filter((test) => test.id.startsWith("skill.") || test.id.startsWith("tool."))
                      .sort((left, right) => left.id.localeCompare(right.id))
                      .map((skill) => (
                        <TraceButton
                          key={skill.id}
                          traceId={skill.traceId}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: skill.name ?? titleCase(skill.id.replace("skill.", "")),
                            testId: skill.id,
                            modifier: skill.modifier,
                            mode: skill.rollMode,
                            ...d20RerollRequest(skill),
                          }}
                          onRoll={performRoll}
                        >
                          <i className={`prof-dot ${skill.proficiency.level}`} aria-hidden="true" />
                          <span>
                            {skill.name ?? titleCase(skill.id.replace("skill.", ""))}
                            {skill.dieMinimum === undefined
                              ? ""
                              : ` · ${skill.dieMinimum.sourceName}: d20 minimum ${String(skill.dieMinimum.value)}`}
                          </span>
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
                    <div>
                      <dt>Darkvision</dt>
                      <dd>
                        {typeof evaluation.facts["sense.darkvision.range"] === "number"
                          ? `${String(evaluation.facts["sense.darkvision.range"])} feet`
                          : "None"}
                      </dd>
                    </div>
                  </dl>
                </Section>
              </div>
            ) : null}

            {tab === "combat" ? (
              <div className="sheet-grid two-column">
                <Section title="Attacks" eyebrow="Attack action">
                  {character.build.featIds.flatMap((featId) =>
                    (builderCatalog.feats[featId]?.advancement?.combatGuidance ?? []).map(
                      (guidance) => (
                        <p className="builder-callout" key={`${featId}:${guidance}`}>
                          {guidance}
                        </p>
                      ),
                    ),
                  )}
                  {character.build.featIds.some(
                    (featId) =>
                      (builderCatalog.feats[featId]?.advancement?.combatGuidance.length ?? 0) > 0,
                  ) ? (
                    <p className="empty">
                      Target-specific feat benefits are assisted: attack buttons do not
                      automatically apply their Advantage or track targets.
                    </p>
                  ) : null}
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
                          {evaluation.attacks.map((attack) => {
                            const mode = selectedWeaponDamageMode(
                              attack,
                              weaponDamageModes[attack.id],
                            );
                            const damage = mode?.damage ?? attack.damage;
                            return (
                              <tr key={attack.id}>
                                <td>
                                  <strong>{attack.name}</strong>
                                  <WeaponMasteryControls
                                    key={`${character.id}:${character.metadata.updatedAt}:${attack.id}`}
                                    attack={attack}
                                    property={weaponMasterySelections[attack.id] ?? ""}
                                    busy={diceRolling}
                                    onChange={(property) => {
                                      setWeaponMasterySelections((current) => ({
                                        ...current,
                                        [attack.id]: property,
                                      }));
                                    }}
                                    onExplain={setSelectedTraceId}
                                  />
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
                                      label: `${attack.name} attack${selectedAttackMastery(attack, weaponMasterySelections[attack.id]) === undefined ? "" : ` · ${titleCase(selectedAttackMastery(attack, weaponMasterySelections[attack.id]) ?? "")} mastery (target effects manual)`}`,
                                      modifier: attack.attackBonus,
                                      mode: attackRollMode,
                                      criticalThreshold: attack.criticalHitThreshold,
                                      ...d20RerollRequest(
                                        universalD20Test,
                                        evaluation.attackRollBonusDice,
                                      ),
                                    }}
                                    onRoll={(request) => {
                                      if (diceRolling) return;
                                      performRoll(request);
                                      setWeaponMasterySelections((current) => ({
                                        ...current,
                                        [attack.id]: "",
                                      }));
                                    }}
                                  >
                                    <strong>{signed(attack.attackBonus)}</strong>
                                    <small>Roll attack</small>
                                  </TraceButton>
                                </td>
                                <td>
                                  <div className="damage-rolls">
                                    {(attack.damageModes?.length ?? 0) > 1 ? (
                                      <label>
                                        Damage mode
                                        <select
                                          aria-label={`Damage mode for ${attack.name}`}
                                          value={mode?.id ?? "normal"}
                                          onChange={(event) => {
                                            const id = event.target.value;
                                            setWeaponDamageModes((current) => ({
                                              ...current,
                                              [attack.id]: id,
                                            }));
                                          }}
                                        >
                                          {attack.damageModes?.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.name}
                                              {option.available ? "" : " · Unavailable"}
                                            </option>
                                          ))}
                                        </select>
                                        <small>
                                          {mode?.instructions} {mode?.reasons.join(" ")}
                                        </small>
                                      </label>
                                    ) : null}
                                    {damage.dieMinimum === undefined ? null : (
                                      <button
                                        type="button"
                                        className="button secondary compact"
                                        onClick={() => {
                                          setSelectedTraceId(damage.dieMinimum?.traceId);
                                        }}
                                      >
                                        {damage.dieMinimum.sourceName}: die minimum{" "}
                                        {String(damage.dieMinimum.value)} · Explain
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={mode?.available === false || diceRolling}
                                      onClick={(event) => {
                                        if (event.shiftKey) {
                                          setSelectedTraceId(damage.traceId);
                                        } else {
                                          rollAttackDamage(attack);
                                        }
                                      }}
                                      title="Roll damage · Shift-click to inspect calculation"
                                    >
                                      <strong>{damageText(damage)}</strong>
                                      <small>Roll damage</small>
                                    </button>
                                    <button
                                      type="button"
                                      className="critical-roll"
                                      disabled={mode?.available === false || diceRolling}
                                      onClick={() => {
                                        rollAttackDamage(attack, true);
                                      }}
                                      title="Roll critical-hit damage"
                                    >
                                      Crit
                                    </button>
                                    {damage.alternativeTypes?.map((type) => (
                                      <span key={type}>
                                        <button
                                          type="button"
                                          disabled={mode?.available === false || diceRolling}
                                          onClick={() => {
                                            rollAttackDamage(attack, false, type);
                                          }}
                                        >
                                          {titleCase(type)} damage
                                        </button>
                                        <button
                                          type="button"
                                          className="critical-roll"
                                          disabled={mode?.available === false || diceRolling}
                                          onClick={() => {
                                            rollAttackDamage(attack, true, type);
                                          }}
                                        >
                                          {titleCase(type)} crit
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  {attack.range === undefined
                                    ? "Reach"
                                    : `${String(attack.range.normal)}/${String(attack.range.long)} ft.`}
                                </td>
                              </tr>
                            );
                          })}
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
                    {character.state.activeEffectIds.map((id) => (
                      <span key={id}>Active: {names.get(id) ?? shortEntityName(id)}</span>
                    ))}
                  </div>
                </Section>
              </div>
            ) : null}

            {tab === "spells" ? (
              <div className="sheet-grid two-column">
                <Section title="Spellcasting" eyebrow="Magic">
                  {evaluation.spellcasting === undefined &&
                  additionalSpellcastingOption === undefined ? (
                    <p className="empty">This character does not have spellcasting.</p>
                  ) : evaluation.spellcasting === undefined ? (
                    <>
                      <div className="spell-metrics">
                        <TraceButton
                          traceId={additionalSpellcastingOption?.attackTraceId ?? ""}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: "Innate spell attack",
                            modifier: additionalSpellcastingOption?.attackBonus ?? 0,
                            mode: attackRollMode,
                            ...d20RerollRequest(universalD20Test, evaluation.attackRollBonusDice),
                          }}
                          onRoll={performRoll}
                        >
                          <span>Spell attack</span>
                          <strong>{signed(additionalSpellcastingOption?.attackBonus ?? 0)}</strong>
                        </TraceButton>
                        <TraceButton
                          traceId={additionalSpellcastingOption?.saveTraceId ?? ""}
                          onSelect={setSelectedTraceId}
                        >
                          <span>Save DC</span>
                          <strong>
                            {String(additionalSpellcastingOption?.saveDifficultyClass ?? 0)}
                          </strong>
                        </TraceButton>
                        <div>
                          <span>Ability</span>
                          <strong>
                            {(additionalSpellcastingOption?.ability ?? "")
                              .slice(0, 3)
                              .toUpperCase()}
                          </strong>
                        </div>
                      </div>
                      <p className="empty">
                        Innate leveled spells can be cast free as shown, then recharge on a Long
                        Rest.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="spell-metrics">
                        <TraceButton
                          traceId={evaluation.spellcasting.attackTraceId}
                          onSelect={setSelectedTraceId}
                          roll={{
                            label: "Spell attack",
                            modifier: evaluation.spellcasting.attackBonus,
                            mode: evaluation.spellcasting.attackRollMode ?? attackRollMode,
                            ...d20RerollRequest(universalD20Test, evaluation.attackRollBonusDice),
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
                            {` · ${preparationEditor.changeDescription}`}
                          </small>
                        </span>
                        {preparedSpellDraft === undefined && preparationEditor.editable ? (
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
                              <small>{preparationEditor.changeDescription}.</small>
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
                            {spell.effectsRequireReview ? (
                              <i title="Damage and conditional effects require source-text adjudication.">
                                Effects assisted
                              </i>
                            ) : null}
                            {spell.prepared ? <i>Prepared</i> : null}
                            {spell.concentration ? <i>Concentration</i> : null}
                            {spell.ritual ? <i>Ritual</i> : null}
                            {spell.castingOptions?.some((option) =>
                              option.sourceId.includes(".feat.origin.magic-initiate."),
                            ) ? (
                              <i>Magic Initiate</i>
                            ) : null}
                            {spell.castingOptions?.some((option) =>
                              option.sourceId.startsWith("srd521.species."),
                            ) ? (
                              <i>Species Magic</i>
                            ) : null}
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
                          <strong>{actionDisplayName(action, names)}</strong>
                          <small>
                            {action.actionEconomy === undefined
                              ? "Special action"
                              : titleCase(action.actionEconomy)}
                            {typeof action.parameters?.effect === "string"
                              ? ` · ${titleCase(action.parameters.effect)}`
                              : ""}
                            {actionDamageLabel(action)}
                            {actionMovementMessage(action) === undefined
                              ? ""
                              : ` · ${actionMovementMessage(action) ?? ""}`}
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
                    <span>
                      {character.build.speciesId === undefined
                        ? "No species"
                        : (names.get(character.build.speciesId) ??
                          shortEntityName(character.build.speciesId))}
                    </span>
                    {(character.build.speciesId === undefined
                      ? []
                      : (builderCatalog.species[character.build.speciesId]?.traitNames ?? [])
                    ).map((trait) => (
                      <span key={trait}>{trait}</span>
                    ))}
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
            setLatestRoll(undefined);
            setPreviousCharacter(undefined);
            setSource("builder");
            setTab("overview");
            setSelectedTraceId(undefined);
            setActionDrafts({});
            setSpellLevels({});
            setSpellHealsOther({});
            setProtectedCreatureCounts({});
            setWeaponDamageModes({});
            setWeaponMasterySelections({});
            setResolveSaveDamage(false);
            setUseD20Minimums(true);
            setSpellRecoverySelections({});
            setCastFeedback(undefined);
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
            setSpellHealsOther({});
            setProtectedCreatureCounts({});
            setWeaponDamageModes({});
            setWeaponMasterySelections({});
            setResolveSaveDamage(false);
            setUseD20Minimums(true);
            setSpellRecoverySelections({});
            setCastFeedback(undefined);
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

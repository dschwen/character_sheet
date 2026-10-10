import type { CalculationTrace, JsonValue, SourceReference } from "@dnd/calculation-trace";
import type { CharacterDocument, CharacterState } from "@dnd/character-model";
import type { AuthoringIr, ContentEntity, PackageManifest } from "@dnd/content-schema";

export type StatId = string;

export interface LoadedRulesPackage {
  manifest: PackageManifest;
  entities: ContentEntity[];
  authoringIr?: AuthoringIr[];
}

export interface EvaluateCharacterInput {
  character: CharacterDocument;
  packages: LoadedRulesPackage[];
  context?: EvaluationContext;
}

export interface EvaluationContext {
  encounterRound?: number;
  situationalTags?: string[];
  d20RollEffects?: D20RollEffect[];
}

export type ProficiencyLevel = "none" | "half" | "proficient" | "expertise";
export type RollMode = "normal" | "advantage" | "disadvantage";

export interface D20RollEffect {
  testId: string;
  kind: "advantage" | "disadvantage";
  source: string;
}

export interface D20BonusDice {
  diceCount: number;
  diceSize: number;
  source: string;
}

export interface ProficiencyEntry {
  level: ProficiencyLevel;
  bonus: number;
  sources: string[];
}

export interface ProficiencySummary {
  savingThrows: Readonly<Record<string, ProficiencyEntry>>;
  skills: Readonly<Record<string, ProficiencyEntry>>;
}

export interface D20TestSummary {
  dieMinimum?: { value: number; sourceName: string; traceId: string };
  name?: string;
  id: string;
  ability: string;
  modifier: number;
  proficiency: ProficiencyEntry;
  rollMode: RollMode;
  advantageSources: string[];
  disadvantageSources: string[];
  rerollValues: number[];
  rerollSources: string[];
  bonusDice: D20BonusDice[];
  traceId: string;
}

export interface CandidateResult<T> {
  id: string;
  applicable: boolean;
  value?: T;
  rejectionReasons: string[];
}

export interface DerivedValue<T = number> {
  value: T;
  selectedCandidate?: string;
  candidates?: CandidateResult<T>[];
  traceId: string;
}

export interface ValidationMessage {
  id: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: Record<string, string>;
  paths: string[];
}

export interface CoverageWarning {
  entityId: string;
  status: string;
  message: string;
}

export interface ResourceInstance {
  id: string;
  maximum: number;
  expended: number;
  current: number;
  recharge: RechargeRule[];
  traceId: string;
}

export interface RechargeRule {
  event: "short-rest" | "long-rest" | "initiative" | "dawn" | "manual";
  amount: number | "all";
}

export interface ActionSummary {
  id: string;
  available: boolean;
  reasons: string[];
  actionEconomy?: string;
  parameters?: Readonly<Record<string, JsonValue>>;
  traceId: string;
}

export interface InventoryItemSummary {
  id: string;
  entityId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  kind: string;
}

export interface DamageSummary {
  dieMinimum?: { value: number; sourceName: string; traceId: string };
  alternativeTypes?: string[];
  diceCount?: number;
  diceSize?: number;
  flat?: number;
  bonus: number;
  type: string;
  traceId: string;
}

export interface AttackSummary {
  damageModes?: WeaponDamageModeSummary[];
  id: string;
  itemId: string;
  weaponId: string;
  name: string;
  ability: string;
  attackBonus: number;
  proficient: boolean;
  damage: DamageSummary;
  attackType: "melee" | "ranged";
  properties: string[];
  range?: {
    normal: number;
    long: number;
  };
  mastery?: {
    property: string;
    enabled: boolean;
  };
  criticalHitThreshold: number;
  criticalHitTraceId: string;
  traceId: string;
}

export interface WeaponDamageModeSummary {
  id: string;
  name: string;
  damage: DamageSummary;
  available: boolean;
  reasons: string[];
  instructions: string;
  requiresTwoHands: boolean;
}

export interface SpellSlotSummary {
  level: number;
  maximum: number;
  expended: number;
  current: number;
  traceId: string;
}

export interface SpellcastingSummary {
  attackRollMode?: "normal" | "advantage" | "disadvantage";
  classId: string;
  model: "standard" | "pact-magic";
  slotRecharge: "long-rest" | "short-rest";
  ability: string;
  abilityModifier: number;
  attackBonus: number;
  saveDifficultyClass: number;
  cantripsKnown: number;
  preparedSpellLimit: number;
  alwaysPreparedSpells: number;
  spellbookMinimum?: number;
  slots: SpellSlotSummary[];
  attackTraceId: string;
  saveTraceId: string;
}

export interface SpellDamageSummary {
  diceCount: number;
  diceSize: number;
  type: string;
  bonus?: number;
  bonusAppliesToOneRoll?: boolean;
  bonusTraceId?: string;
}

export interface SpellHealingSummary {
  diceCount: number;
  diceSize: number;
  addSpellcastingModifier: boolean;
  dicePerSlotLevel: number;
}

export interface SpellHealingEffectSummary {
  sourceId: string;
  sourceName: string;
  target: "healed-creature" | "caster-after-healing-other";
  base: number;
  perSlotLevel: number;
  sources: SourceReference[];
}

export interface SpellCastingOptionSummary {
  attackRollMode?: "normal" | "advantage" | "disadvantage";
  sourceId: string;
  ability: string;
  attackBonus: number;
  saveDifficultyClass: number;
  attackTraceId: string;
  saveTraceId: string;
  freeCastResourceId?: string;
  freeCastAvailable?: boolean;
}

export interface SpellSummary {
  effectsRequireReview?: boolean;
  id: string;
  name: string;
  level: number;
  school: string;
  prepared: boolean;
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  range: string;
  duration: string;
  attackType?: "melee" | "ranged";
  savingThrows: string[];
  damage: SpellDamageSummary[];
  healing?: SpellHealingSummary[];
  hasHigherLevelEffect: boolean;
  appliedStatuses: SpellAppliedStatusSummary[];
  sources: SourceReference[];
  castingOptions?: SpellCastingOptionSummary[];
}

export interface SpellAppliedStatusSummary {
  statusId: string;
  statusName: string;
  target: "target";
}

export type RestEvent = "short-rest" | "long-rest";

export interface HitDieSpend {
  classId: string;
  rolls: number[];
}

export interface RestRequest {
  event: RestEvent;
  featureChoiceReplacements?: { choiceId: string; optionIds: string[] }[];
  hitDice?: HitDieSpend[];
  spellSlotRecoveries?: { sourceId: string; slots: { level: number; count: number }[] }[];
}

export interface StateChange {
  path: string;
  before: JsonValue;
  after: JsonValue;
  reason: string;
  traceId: string;
}

export interface StateTransitionProposal {
  kind: "rest";
  event: RestEvent;
  applicable: boolean;
  changes: StateChange[];
  nextState: CharacterState;
  nextBuild?: CharacterDocument["build"];
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
}

export interface ActionUseRequest {
  actionId: string;
  rolls?: number[];
  amount?: number;
  completedD20Test?: { testId: string; appliedActionIds: string[] };
  failedSavingThrow?: {
    target: "self" | "other";
    ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
    conditionId: string;
    failed: boolean;
    reactionAvailable: boolean;
    distanceFeet?: number;
  };
}

export interface ActionTransitionProposal {
  kind: "action";
  actionId: string;
  applicable: boolean;
  changes: StateChange[];
  nextState: CharacterState;
  savingThrowReroll?: {
    target: "self" | "other";
    ability: string;
    mode: "advantage";
    traceId: string;
  };
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
}

export interface SpellCastRequest {
  protectedCreatureCount?: number;
  spellId: string;
  slotLevel?: number;
  asRitual?: boolean;
  castingSourceId?: string;
  useFreeCast?: boolean;
  restoresHitPointsToOther?: boolean;
}

export interface SpellCastTransitionProposal {
  protection?: SpellProtectionApplication;
  kind: "spell-cast";
  spellId: string;
  applicable: boolean;
  changes: StateChange[];
  nextState: CharacterState;
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
}

export interface SavingThrowAuraSummary {
  sourceId: string;
  name: string;
  bonus: number;
  radiusFeet: number;
  active: boolean;
  recipientStatusId: string;
  traceId: string;
  conditionImmunities?: {
    sourceId: string;
    name: string;
    conditionIds: string[];
    recipientStatusId: string;
    traceId: string;
  }[];
}

export interface SpellSlotRecoverySummary {
  sourceId: string;
  name: string;
  resourceId: string;
  maximumCombinedLevel: number;
  maximumSlotLevel: number;
  available: boolean;
  traceId: string;
  sources: SourceReference[];
}

export interface CharacterEvaluation {
  savingThrowDamageEffects?: SavingThrowDamageEffectSummary[];
  spellProtections?: SpellProtectionSummary[];
  spellSlotRecoveries?: SpellSlotRecoverySummary[];
  savingThrowAuras?: SavingThrowAuraSummary[];
  facts: Readonly<Record<string, JsonValue>>;
  values: Readonly<Record<StatId, DerivedValue>>;
  proficiencies: ProficiencySummary;
  d20Tests: Readonly<Record<string, D20TestSummary>>;
  attackRollBonusDice: D20BonusDice[];
  inventory: InventoryItemSummary[];
  attacks: AttackSummary[];
  spellcasting?: SpellcastingSummary;
  spells: SpellSummary[];
  spellHealingEffects?: SpellHealingEffectSummary[];
  actions: ActionSummary[];
  resources: ResourceInstance[];
  resistances: string[];
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
  coverageWarnings: CoverageWarning[];
}

export interface SavingThrowDamageEffectSummary {
  sourceId: string;
  sourceName: string;
  ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
  requiresHalfDamageOnSuccess: true;
  successFraction: number;
  failureFraction: number;
  active: boolean;
  reasons: string[];
  traceId: string;
}

export interface SavingThrowDamageRequest {
  damage: number;
  ability: SavingThrowDamageEffectSummary["ability"];
  outcome: "success" | "failure";
  damageOnSuccess: "half" | "none" | "full";
}

export interface SavingThrowDamageResolution {
  damage: number;
  fraction: number;
  appliedEffectIds: string[];
  explanation: string;
  trace: CalculationTrace;
}

export interface SpellProtectionSummary {
  sourceId: string;
  sourceName: string;
  school: string;
  additionalTargets: number;
  requiresSight: true;
  othersOnly: true;
  automaticSaveSuccess: true;
  noDamageOnSuccessfulHalfSave: true;
  sources: SourceReference[];
}

export interface SpellProtectionApplication extends SpellProtectionSummary {
  creatureCount: number;
  maximumCreatures: number;
  traceId: string;
}

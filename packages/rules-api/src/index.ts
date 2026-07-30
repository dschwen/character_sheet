import type { CalculationTrace, JsonValue } from "@dnd/calculation-trace";
import type { CharacterDocument } from "@dnd/character-model";
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
  id: string;
  ability: string;
  modifier: number;
  proficiency: ProficiencyEntry;
  rollMode: RollMode;
  advantageSources: string[];
  disadvantageSources: string[];
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
  recharge: unknown[];
  traceId: string;
}

export interface ActionSummary {
  id: string;
  available: boolean;
  reasons: string[];
  actionEconomy?: string;
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
  diceCount?: number;
  diceSize?: number;
  flat?: number;
  bonus: number;
  type: string;
  traceId: string;
}

export interface AttackSummary {
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
  traceId: string;
}

export interface CharacterEvaluation {
  facts: Readonly<Record<string, JsonValue>>;
  values: Readonly<Record<StatId, DerivedValue>>;
  proficiencies: ProficiencySummary;
  d20Tests: Readonly<Record<string, D20TestSummary>>;
  inventory: InventoryItemSummary[];
  attacks: AttackSummary[];
  actions: ActionSummary[];
  resources: ResourceInstance[];
  resistances: string[];
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
  coverageWarnings: CoverageWarning[];
}

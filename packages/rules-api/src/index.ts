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

export interface CharacterEvaluation {
  facts: Readonly<Record<string, JsonValue>>;
  values: Readonly<Record<StatId, DerivedValue>>;
  actions: ActionSummary[];
  resources: ResourceInstance[];
  resistances: string[];
  validations: ValidationMessage[];
  traces: Readonly<Record<string, CalculationTrace>>;
  coverageWarnings: CoverageWarning[];
}

export type EvaluationErrorCode =
  | "CYCLE_DETECTED"
  | "DEPTH_LIMIT_EXCEEDED"
  | "OPERATION_LIMIT_EXCEEDED"
  | "UNKNOWN_FACT"
  | "UNKNOWN_TABLE"
  | "UNKNOWN_TABLE_KEY"
  | "TYPE_MISMATCH";

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;
  readonly path: readonly string[];

  constructor(code: EvaluationErrorCode, message: string, path: readonly string[] = []) {
    super(message);
    this.name = "EvaluationError";
    this.code = code;
    this.path = path;
  }
}

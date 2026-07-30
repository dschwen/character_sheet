export type JsonScalar = boolean | number | string | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface SourceReference {
  entityId?: string;
  sourceId: string;
  page?: number;
  blocks?: string[];
  quoteHash?: string;
}

export interface TraceNode {
  id: string;
  operation: string;
  inputs: JsonValue[];
  output: JsonValue;
  label?: string;
  source?: SourceReference;
  suppressed?: boolean;
  reason?: string;
}

export interface CalculationTrace {
  id: string;
  result: JsonValue;
  nodes: TraceNode[];
  sourceReferences: SourceReference[];
}

export interface TracedValue<T extends JsonValue = JsonValue> {
  value: T;
  trace: CalculationTrace;
}

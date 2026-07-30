import { z } from "zod";

export const entityIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Must be a stable, namespaced entity ID");

export const factPathSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)*$/, "Must be a dotted fact path");

export const jsonScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export type JsonScalar = z.infer<typeof jsonScalarSchema>;
export type EntityId = z.infer<typeof entityIdSchema>;
export type FactPath = z.infer<typeof factPathSchema>;

export type Expr =
  | { kind: "literal"; value: JsonScalar }
  | { kind: "ref"; path: FactPath }
  | { kind: "add"; args: Expr[] }
  | { kind: "multiply"; args: Expr[] }
  | { kind: "floor"; value: Expr }
  | { kind: "min"; args: Expr[] }
  | { kind: "max"; args: Expr[] }
  | { kind: "if"; condition: Predicate; then: Expr; else: Expr }
  | { kind: "tableLookup"; table: EntityId; key: Expr };

export type Predicate =
  | { kind: "all"; args: Predicate[] }
  | { kind: "any"; args: Predicate[] }
  | { kind: "not"; arg: Predicate }
  | { kind: "equals"; left: Expr; right: Expr }
  | { kind: "compare"; op: "lt" | "lte" | "gt" | "gte"; left: Expr; right: Expr }
  | { kind: "hasEntity"; entityId: EntityId }
  | { kind: "hasTag"; subject: Expr; tag: string }
  | { kind: "isEquipped"; itemId: EntityId }
  | { kind: "resourceAvailable"; resourceId: EntityId };

export const exprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("literal"), value: jsonScalarSchema }).strict(),
    z.object({ kind: z.literal("ref"), path: factPathSchema }).strict(),
    z.object({ kind: z.literal("add"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("multiply"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("floor"), value: exprSchema }).strict(),
    z.object({ kind: z.literal("min"), args: z.array(exprSchema).min(1) }).strict(),
    z.object({ kind: z.literal("max"), args: z.array(exprSchema).min(1) }).strict(),
    z
      .object({
        kind: z.literal("if"),
        condition: z.lazy(() => predicateSchema),
        then: exprSchema,
        else: exprSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("tableLookup"),
        table: entityIdSchema,
        key: exprSchema,
      })
      .strict(),
  ]),
);

export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all"), args: z.array(predicateSchema) }).strict(),
    z.object({ kind: z.literal("any"), args: z.array(predicateSchema) }).strict(),
    z.object({ kind: z.literal("not"), arg: predicateSchema }).strict(),
    z.object({ kind: z.literal("equals"), left: exprSchema, right: exprSchema }).strict(),
    z
      .object({
        kind: z.literal("compare"),
        op: z.enum(["lt", "lte", "gt", "gte"]),
        left: exprSchema,
        right: exprSchema,
      })
      .strict(),
    z.object({ kind: z.literal("hasEntity"), entityId: entityIdSchema }).strict(),
    z.object({ kind: z.literal("hasTag"), subject: exprSchema, tag: z.string().min(1) }).strict(),
    z.object({ kind: z.literal("isEquipped"), itemId: entityIdSchema }).strict(),
    z.object({ kind: z.literal("resourceAvailable"), resourceId: entityIdSchema }).strict(),
  ]),
);

export const sourceSpanSchema = z
  .object({
    sourceId: z.string().min(1),
    page: z.number().int().positive(),
    blocks: z.array(z.string().min(1)).optional(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const sourceManifestSchema = z
  .object({
    source_id: z.string().min(1),
    source_url: z.string().url().startsWith("https://"),
    retrieved_at: z.string().datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    page_count: z.number().int().positive(),
    license: z.literal("CC-BY-4.0"),
    http_headers: z.record(z.string()).optional(),
    pdf_metadata: z.record(z.string()).optional(),
  })
  .strict();

export const packageManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    ruleset: z.literal("dnd5e-2024"),
    source: z
      .object({
        id: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    license: z.literal("CC-BY-4.0"),
    dependencies: z.array(z.string().min(1)),
    engineCompatibility: z.string().min(1),
  })
  .strict();

export const reviewStatusSchema = z.enum([
  "UNCLASSIFIED",
  "TEXT_ONLY",
  "STRUCTURED",
  "EXECUTABLE",
  "TESTED",
  "VERIFIED",
]);

export const contentEntitySchema = z
  .object({
    id: entityIdSchema,
    kind: z.string().min(1),
    name: z.record(z.string().min(2), z.string().min(1)),
    tags: z.array(z.string().min(1)),
    source: z.array(sourceSpanSchema),
    body: z.unknown(),
    rules: z.array(z.unknown()),
    review: z
      .object({
        status: reviewStatusSchema,
        extractionApproved: z.boolean(),
        semanticsApproved: z.boolean(),
        testsApproved: z.boolean(),
        notes: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type PackageManifest = z.infer<typeof packageManifestSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type SourceSpan = z.infer<typeof sourceSpanSchema>;
export type ContentEntity = z.infer<typeof contentEntitySchema>;

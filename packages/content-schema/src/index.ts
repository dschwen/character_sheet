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

/** Eligibility and allocations for an unrestricted feat grant, independent of the granting class. */
export const featAcquisitionMetadataSchema = z.object({
  category: z.enum(["origin", "general", "fighting-style"]),
  repeatable: z.boolean().default(false),
  prerequisite: z
    .object({
      minimumCharacterLevel: z.number().int().positive().optional(),
      anyAbilityScoreMinimums: z
        .array(
          z.object({
            ability: z.enum([
              "strength",
              "dexterity",
              "constitution",
              "intelligence",
              "wisdom",
              "charisma",
            ]),
            minimum: z.number().int().positive(),
          }),
        )
        .optional(),
    })
    .optional(),
  requiresAnyFeatureIds: z.array(entityIdSchema).default([]),
  abilityScoreIncreasePatterns: z.array(z.array(z.number().int().positive())).default([]),
  abilityScoreIncreaseAbilities: z
    .array(z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]))
    .default(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
  maximumAbilityScore: z.number().int().positive().default(20),
  combatGuidance: z.array(z.string()).default([]),
});

export const preparedSpellListExpansionSchema = z
  .object({
    sourceFeatureId: entityIdSchema,
    minimumLevel: z.number().int().min(1).max(20),
    minimumSpellLevel: z.literal(1),
    sourceClassIds: z.array(entityIdSchema).min(1),
  })
  .strict();

export const reactionAttackSchema = z
  .object({
    trigger: z.literal("damaged-by-creature"),
    rangeFeet: z.number().positive(),
    attackCount: z.literal(1),
    attackTypes: z.array(z.enum(["melee", "ranged"])).min(1),
    attackKinds: z.array(z.enum(["weapon", "unarmed"])).min(1),
  })
  .strict();

export const heroicInspirationGrantSchema = z
  .object({ trigger: z.literal("start-of-turn-in-combat"), requiresMissing: z.literal(true) })
  .strict();

export const onHitExtraDamageSchema = z
  .object({
    diceSize: z.number().int().positive(),
    type: z.string().min(1),
    frequency: z.string().min(1),
    optionActionEconomy: z.string().min(1).optional(),
    maximumOptions: z.number().int().nonnegative().default(0),
    weaponEligibility: z
      .object({
        anyProperties: z.array(z.string().min(1)).default([]),
        anyAttackTypes: z.array(z.enum(["melee", "ranged"])).default([]),
      })
      .strict()
      .optional(),
  })
  .strict();

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
  | { kind: "resourceAvailable"; resourceId: EntityId; minimum?: number | undefined };

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
    z
      .object({
        kind: z.literal("resourceAvailable"),
        resourceId: entityIdSchema,
        minimum: z.number().int().positive().optional(),
      })
      .strict(),
  ]),
);

export const pinnedSourceSpanSchema = z
  .object({
    sourceId: z.string().min(1),
    page: z.number().int().positive(),
    blocks: z.array(z.string().min(1)).optional(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

// Out-of-SRD records cite an edition's book directly instead of a span in the pinned source:
// no page/blocks, an explicit edition and book, an optional reference URL, and a quoteHash of
// the record's own stored text so review pins remain stable. See docs/adr/0013.
export const editionReferenceSpanSchema = z
  .object({
    sourceId: z.string().min(1),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.literal("edition-reference"),
    edition: z.enum(["2014", "2024"]),
    book: z.string().min(1),
    referenceUrl: z.string().url().startsWith("https://").optional(),
    note: z.string().min(1).optional(),
  })
  .strict();

export const sourceSpanSchema = z.union([pinnedSourceSpanSchema, editionReferenceSpanSchema]);

export type PinnedSourceSpan = z.infer<typeof pinnedSourceSpanSchema>;
export type EditionReferenceSpan = z.infer<typeof editionReferenceSpanSchema>;
export type SourceSpan = PinnedSourceSpan | EditionReferenceSpan;

export function isEditionReferenceSpan(span: SourceSpan): span is EditionReferenceSpan {
  return "kind" in span;
}

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
    // Declares any edition-reference records living in this package (ADR 0013). The package still
    // pins exactly one acquired source document above; these entries describe what is not from it.
    referenceSources: z
      .array(
        z
          .object({
            sourceId: z.string().min(1),
            edition: z.enum(["2014", "2024"]).optional(),
            book: z.string().min(1),
            referenceUrl: z.string().url().startsWith("https://").optional(),
            note: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
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
  // Authored out-of-SRD edition references: supplied rules text, never extracted. See ADR 0013.
  "AUTHORED",
]);

export const automationLevelSchema = z.enum([
  "display-only",
  "structured",
  "sheet-automated",
  "roll-assisted",
  "state-automated",
  "fully-automated",
]);

export const draftRuleTypeSchema = z.enum([
  "grant-resource",
  "grant-action",
  "grant-resistance",
  "add-modifier",
  "grant-advantage",
  "add-validation",
  "add-candidate-calculation",
  "set-attack-count",
  "set-critical-threshold",
]);

export const draftRuleSchema = z
  .object({
    id: z.string().min(1),
    type: draftRuleTypeSchema,
    target: z.string().min(1).optional(),
    when: predicateSchema.optional(),
    expression: exprSchema.optional(),
    parameters: z.record(z.unknown()).default({}),
    automationLevel: automationLevelSchema,
  })
  .strict();

export const authoringIrSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    id: entityIdSchema,
    kind: z.enum(["class-feature", "subclass-feature", "feat"]),
    parentId: entityIdSchema,
    level: z.number().int().min(1).max(20),
    // Authoring IR describes extracted content with an approved extraction step, so its spans are
    // pinned-source spans. Edition-reference records have no authoring IR (see docs/adr/0013).
    source: z.array(pinnedSourceSpanSchema).min(1),
    text: z
      .object({
        title: z.string().min(1),
        nodes: z.array(
          z
            .object({
              kind: z.enum(["ParagraphNode", "ListNode"]),
              text: z.string().min(1),
              items: z.array(z.string().min(1)).optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    proposedRules: z.array(draftRuleSchema),
    review: z
      .object({
        extraction: z.literal("approved"),
        semantics: z.enum(["missing", "needs-review", "approved"]),
        tests: z.enum(["missing", "draft", "approved"]),
        notes: z.array(z.string()).default([]),
      })
      .strict(),
  })
  .strict();

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

export const startingEquipmentItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("entity"),
      entityId: entityIdSchema,
      quantity: z.number().int().positive(),
      equipped: z.boolean().default(false),
      label: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      name: z.string().min(1),
      quantity: z.number().int().positive(),
    })
    .strict(),
]);

export const startingEquipmentOptionSchema = z
  .object({
    id: entityIdSchema,
    label: z.string().min(1),
    items: z.array(startingEquipmentItemSchema),
    currencyGp: z.number().int().nonnegative(),
  })
  .strict();

export const startingEquipmentChoiceSchema = z
  .object({
    id: entityIdSchema,
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().positive(),
    options: z.array(startingEquipmentOptionSchema).min(1),
  })
  .strict()
  .superRefine((choice, context) => {
    if (choice.minimum > choice.maximum || choice.maximum > choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Starting-equipment bounds must fit the available options",
        path: ["maximum"],
      });
    }
    if (new Set(choice.options.map((option) => option.id)).size !== choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Starting-equipment option IDs must be unique",
        path: ["options"],
      });
    }
  });

export const characterBuilderAbilitySchema = z.enum([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

export const classBuilderMetadataSchema = z
  .object({
    supportedLevelMinimum: z.number().int().min(1).max(20),
    supportedLevelMaximum: z.number().int().min(1).max(20),
    defaultAbilityScores: z
      .object({
        strength: z.number().int().min(3).max(18),
        dexterity: z.number().int().min(3).max(18),
        constitution: z.number().int().min(3).max(18),
        intelligence: z.number().int().min(3).max(18),
        wisdom: z.number().int().min(3).max(18),
        charisma: z.number().int().min(3).max(18),
      })
      .strict(),
    defaultAbilityScoreImprovementAbility: characterBuilderAbilitySchema,
    defaultClassSkillIds: z.array(entityIdSchema),
    defaultGrantedFeatIds: z.array(entityIdSchema).default([]),
    expertiseChoice: z
      .object({
        sourceId: entityIdSchema,
        minimumLevel: z.number().int().min(1).max(20),
        eligibleSkillIds: z.array(entityIdSchema).min(1),
        requireClassProficiency: z.boolean().default(true),
        countByLevel: z.record(z.string(), z.number().int().nonnegative()).optional(),
        grants: z
          .array(
            z
              .object({
                level: z.number().int().min(1).max(20),
                count: z.number().int().positive(),
                sourceId: entityIdSchema,
              })
              .strict(),
          )
          .min(1)
          .optional(),
      })
      .strict()
      .superRefine((choice, context) => {
        const grants = choice.grants;
        if (grants === undefined) return;
        if (choice.countByLevel !== undefined)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["grants"],
            message: "Expertise grants and countByLevel cannot both define counts",
          });
        const initialGrant = grants[0];
        if (
          initialGrant?.level !== choice.minimumLevel ||
          initialGrant.sourceId !== choice.sourceId
        )
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["grants"],
            message: "Expertise grants must start with the initial source and minimum level",
          });
        if (
          grants.some((grant, index) => index > 0 && grant.level <= (grants[index - 1]?.level ?? 0))
        )
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["grants"],
            message: "Expertise grants must have distinct increasing levels",
          });
      })
      .optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    if (metadata.supportedLevelMaximum < metadata.supportedLevelMinimum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supportedLevelMaximum"],
        message: "Must be greater than or equal to supportedLevelMinimum",
      });
    }
  });

export const classFeatureChoiceSchema = z
  .object({
    id: entityIdSchema,
    level: z.number().int().min(1).max(20),
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().positive(),
    countByLevel: z.record(z.string(), z.number().int().nonnegative()).optional(),
    options: z.array(entityIdSchema).min(1),
    defaultOptionIds: z.array(entityIdSchema).optional(),
    changeOn: z.array(z.enum(["level-up", "short-rest", "long-rest"])).optional(),
    replacementMaximum: z.number().int().positive().optional(),
    requiredOption: z
      .object({ choiceId: entityIdSchema, optionId: entityIdSchema })
      .strict()
      .optional(),
    optionSelection: z.object({ sourceFeatureId: entityIdSchema }).strict().optional(),
    featSelection: z
      .object({
        sourceFeatureId: entityIdSchema,
        exclusiveGroup: z.string().min(1),
        allowAlternativeOptions: z.literal(true).optional(),
      })
      .strict()
      .optional(),
    spellSelection: z
      .object({
        sourceFeatureId: entityIdSchema,
        castingClassId: entityIdSchema,
        sourceClassIds: z.array(entityIdSchema).min(1),
        alwaysPrepared: z.boolean(),
        spellbookAddition: z.literal(true).optional(),
        allowCantrips: z.boolean(),
        school: z.string().min(1).optional(),
        maximumSpellLevel: z.number().int().min(0).max(9).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((choice, context) => {
    if (
      choice.requiredOption !== undefined &&
      (choice.spellSelection === undefined || choice.requiredOption.choiceId === choice.id)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredOption"],
        message:
          "Conditional choices require spell-selection semantics and a different parent choice",
      });
    }
    if (
      choice.optionSelection !== undefined &&
      (choice.featSelection !== undefined || choice.spellSelection !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ordinary option choices cannot also grant feats or spells",
        path: ["optionSelection"],
      });
    }
    if (
      choice.spellSelection?.alwaysPrepared !== undefined &&
      choice.spellSelection.alwaysPrepared === (choice.spellSelection.spellbookAddition === true)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Spell choices must grant either preparation or spellbook additions, not both",
        path: ["spellSelection"],
      });
    }
    if (choice.minimum > choice.maximum || choice.maximum > choice.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Class-feature choice bounds must fit the available options",
        path: ["maximum"],
      });
    }
    if (
      choice.countByLevel !== undefined &&
      Object.entries(choice.countByLevel).some(
        ([level, count]) =>
          !/^([1-9]|1\d|20)$/u.test(level) || count < choice.minimum || count > choice.maximum,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Level-indexed choice counts must use levels 1–20 and fit the choice bounds",
        path: ["countByLevel"],
      });
    }
    if (
      choice.defaultOptionIds !== undefined &&
      (choice.defaultOptionIds.length < choice.minimum ||
        choice.defaultOptionIds.length > choice.maximum ||
        new Set(choice.defaultOptionIds).size !== choice.defaultOptionIds.length ||
        choice.defaultOptionIds.some((optionId) => !choice.options.includes(optionId)))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defaults must be unique listed options within the choice bounds",
        path: ["defaultOptionIds"],
      });
    }
    if (choice.replacementMaximum !== undefined && !choice.changeOn?.includes("level-up")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replacement limits require a level-up change event",
        path: ["replacementMaximum"],
      });
    }
  });

export const failedSaveRerollSchema = z.object({ bonusFact: z.string().min(1) }).strict();

export const movementCapabilitySchema = z
  .object({
    id: entityIdSchema,
    surfaces: z.array(z.enum(["vertical-surfaces", "liquids"])).min(1),
    requiresNoArmor: z.boolean().default(false),
    requiresNoShield: z.boolean().default(false),
    ownTurnOnly: z.boolean().default(false),
    preventsFallingDuringMovement: z.boolean().default(false),
    instructions: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const actionTargetingSchema = z
  .object({
    maximumFact: factPathSchema,
    minimumMaximum: z.number().int().positive().default(1),
    rangeFeet: z.number().finite().nonnegative(),
    requiresSight: z.boolean().default(false),
  })
  .strict();

export const resolvedActionTargetingSchema = actionTargetingSchema
  .omit({ maximumFact: true, minimumMaximum: true })
  .extend({ maximum: z.number().int().positive(), traceId: z.string().min(1) });

export const savingThrowRerollSchema = z
  .object({
    mode: z.literal("advantage"),
    conditionIds: z.array(entityIdSchema).min(1),
    rangeFeet: z.number().positive(),
  })
  .strict();

export const savingThrowAuraSchema = z
  .object({
    auraId: entityIdSchema,
    ability: z.enum([
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ]),
    minimumBonus: z.number().int().nonnegative(),
    radiusFeet: z.number().positive(),
    recipientStatusId: entityIdSchema,
    inactiveConditionIds: z.array(entityIdSchema),
  })
  .strict();

export const savingThrowAuraRecipientSchema = z
  .object({
    auraId: entityIdSchema,
    selectionLabel: z.string().min(1),
    minimum: z.number().int(),
    maximum: z.number().int(),
  })
  .strict()
  .refine((value) => value.maximum >= value.minimum);

export const weaponPropertyBodySchema = z
  .object({
    property: z.string().min(1),
    damageMode: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        omitPositiveAbilityModifier: z.boolean(),
        requiresDifferentWeapon: z.boolean(),
        requiresTwoHands: z.boolean(),
        useVersatileDamage: z.boolean(),
        instructions: z.string().min(1),
      })
      .strict(),
  })
  .passthrough();

export const featureAutomationBodySchema = z
  .object({
    attackRollOptions: z
      .array(
        z
          .object({
            kind: z.enum(["advantage", "forgo-advantage"]),
            ability: characterBuilderAbilitySchema,
            requiredOptionSourceId: entityIdSchema.optional(),
            requiresFirstAttackDeclaration: z.boolean(),
            onceOnYourTurn: z.boolean(),
            instructions: z.string().min(1),
            damage: z
              .object({ diceCount: z.number().int().positive(), diceSize: z.number().int().min(2) })
              .strict()
              .optional(),
            effects: z.array(
              z
                .object({
                  id: z.string().min(1),
                  name: z.string().min(1),
                  instructions: z.string().min(1),
                  movement: z
                    .object({
                      speedFraction: z.number().positive().max(1),
                      provokesOpportunityAttacks: z.boolean(),
                    })
                    .strict()
                    .optional(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .default([]),
    weaponMasteryReplacements: z.array(z.string().min(1)).default([]),
    cantripDamageBonuses: z
      .array(
        z
          .object({
            castingClassId: entityIdSchema,
            ability: characterBuilderAbilitySchema,
          })
          .strict(),
      )
      .default([]),
    attackDamageRiders: z
      .array(
        z
          .object({
            diceCount: z.number().int().positive(),
            diceSize: z.number().int().min(2),
            damageTypes: z.array(z.string().min(1)).min(1),
            attackKinds: z.array(z.enum(["weapon", "wild-shape-beast"])).min(1),
            frequency: z.literal("once-on-each-of-your-turns"),
          })
          .strict(),
      )
      .default([]),
    d20Minimums: z
      .array(
        z
          .object({
            testKinds: z.array(z.enum(["skill", "tool"])).min(1),
            requiresProficiency: z.literal(true),
            minimum: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .default([]),
    savingThrowDamageEffects: z
      .array(
        z
          .object({
            ability: characterBuilderAbilitySchema,
            requiresHalfDamageOnSuccess: z.literal(true),
            successFraction: z.number().min(0).max(1),
            failureFraction: z.number().min(0).max(1),
            inactiveConditionIds: z.array(entityIdSchema),
          })
          .strict(),
      )
      .default([]),
    weaponDamageDieMinimums: z
      .array(
        z
          .object({
            attackType: z.enum(["melee", "ranged"]),
            anyProperties: z.array(z.string().min(1)).min(1),
            requiresTwoHands: z.boolean(),
            minimum: z.number().int().positive(),
          })
          .strict(),
      )
      .default([]),
    extraAttackAbilityModifiers: z
      .array(z.object({ weaponProperty: z.string().min(1) }).strict())
      .default([]),
    requiresAnyFeatureIds: z.array(entityIdSchema).default([]),
    weaponAttackModifiers: z
      .array(
        z.object({ attackType: z.enum(["melee", "ranged"]), bonus: z.number().int() }).strict(),
      )
      .default([]),
    spellProtection: z
      .object({
        school: z.string().min(1),
        additionalTargets: z.number().int().nonnegative(),
        requiresSight: z.literal(true),
        othersOnly: z.literal(true),
        automaticSaveSuccess: z.literal(true),
        noDamageOnSuccessfulHalfSave: z.literal(true),
      })
      .strict()
      .optional(),
    spellSlotRecovery: z
      .object({
        classId: entityIdSchema,
        resourceId: entityIdSchema,
        levelDivisor: z.number().int().positive(),
        maximumSlotLevel: z.number().int().min(1).max(9),
        event: z.literal("short-rest"),
      })
      .strict()
      .optional(),
    freeSpellCasting: z
      .object({
        classId: entityIdSchema,
        resourceId: entityIdSchema.optional(),
        atWill: z.boolean().default(false),
        optionChoiceId: entityIdSchema.optional(),
        spellIds: z.array(entityIdSchema).min(1).optional(),
        guidance: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .refine(
        (value) => (value.resourceId !== undefined) !== value.atWill,
        "Free casting requires either a resource or at-will casting",
      )
      .refine(
        (value) => (value.optionChoiceId !== undefined) !== (value.spellIds !== undefined),
        "Free casting requires exactly one spell eligibility selector",
      )
      .optional(),
    savingThrowAura: savingThrowAuraSchema.optional(),
    auraConditionImmunities: z
      .array(
        z
          .object({
            auraId: entityIdSchema,
            conditionIds: z.array(entityIdSchema).min(1),
            recipientStatusId: entityIdSchema,
          })
          .strict(),
      )
      .default([]),
    unarmedStrikeDamageTypes: z.array(z.string().min(1)).default([]),
    movementCapabilities: z.array(movementCapabilitySchema).default([]),
    spellHealingEffects: z
      .array(
        z
          .object({
            target: z.enum(["healed-creature", "caster-after-healing-other"]),
            base: z.number().int().nonnegative(),
            perSlotLevel: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .default([]),
    activeEffectConditionImmunities: z
      .array(
        z
          .object({
            activeEffectId: entityIdSchema,
            conditionIds: z.array(entityIdSchema).min(1),
          })
          .strict(),
      )
      .default([]),
    actionEnhancements: z
      .array(
        z
          .object({
            actionId: z.string().min(1),
            endsConditionIds: z.array(entityIdSchema).default([]),
            movement: z
              .object({
                speedFraction: z.number().positive(),
                provokesOpportunityAttacks: z.boolean(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .passthrough();

export type PackageManifest = z.infer<typeof packageManifestSchema>;
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type ContentEntity = z.infer<typeof contentEntitySchema>;
export type StartingEquipmentItem = z.infer<typeof startingEquipmentItemSchema>;
export type StartingEquipmentOption = z.infer<typeof startingEquipmentOptionSchema>;
export type StartingEquipmentChoice = z.infer<typeof startingEquipmentChoiceSchema>;
export type ClassBuilderMetadata = z.infer<typeof classBuilderMetadataSchema>;
export type ClassFeatureChoice = z.infer<typeof classFeatureChoiceSchema>;

/** A conditional child is enabled only by its single selected parent option. */
export function featureChoiceEnabled(
  choice: Pick<ClassFeatureChoice, "requiredOption">,
  selections: Readonly<Record<string, readonly string[] | undefined>>,
): boolean {
  if (choice.requiredOption === undefined) return true;
  const parent = selections[choice.requiredOption.choiceId] ?? [];
  return parent.length === 1 && parent[0] === choice.requiredOption.optionId;
}
export type FeatureAutomationBody = z.infer<typeof featureAutomationBodySchema>;
export type DraftRule = z.infer<typeof draftRuleSchema>;
export type AuthoringIr = z.infer<typeof authoringIrSchema>;

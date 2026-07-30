import { z } from "zod";

const entityIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "Must be a stable, namespaced entity ID");

const choiceSelectionSchema = z
  .object({
    choiceId: z.string().min(1),
    optionIds: z.array(entityIdSchema),
  })
  .strict();

const proficiencyChoiceSchema = z
  .object({
    skillId: entityIdSchema,
    sourceId: entityIdSchema,
  })
  .strict();

const uniqueProficiencyChoices = (choices: z.infer<typeof proficiencyChoiceSchema>[]): boolean =>
  new Set(choices.map((choice) => `${choice.sourceId}:${choice.skillId}`)).size === choices.length;

const proficiencyChoicesSchema = z
  .object({
    skills: z
      .array(proficiencyChoiceSchema)
      .default([])
      .refine(uniqueProficiencyChoices, "Skill proficiency choices must be unique per source"),
    expertise: z
      .array(proficiencyChoiceSchema)
      .default([])
      .refine(uniqueProficiencyChoices, "Skill expertise choices must be unique per source"),
  })
  .strict()
  .default({});

const characterLevelSchema = z
  .object({
    characterLevel: z.number().int().min(1).max(20),
    classId: entityIdSchema,
    hitPointChoice: z.enum(["rolled", "fixed", "manual"]),
    hitPointRoll: z.number().int().positive().optional(),
    selectedFeatureChoices: z.array(choiceSelectionSchema).default([]),
  })
  .strict()
  .superRefine((level, context) => {
    if (level.hitPointChoice === "rolled" && level.hitPointRoll === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A rolled hit-point choice requires hitPointRoll",
        path: ["hitPointRoll"],
      });
    }
  });

const rulesetReferenceSchema = z
  .object({
    system: z.literal("dnd5e"),
    edition: z.literal("2024"),
    packages: z
      .array(
        z
          .object({
            id: z.string().min(1),
            version: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const characterBuildSchema = z
  .object({
    levels: z.array(characterLevelSchema).max(20),
    abilityScores: z
      .object({
        strength: z.number().int().min(1).max(30),
        dexterity: z.number().int().min(1).max(30),
        constitution: z.number().int().min(1).max(30),
        intelligence: z.number().int().min(1).max(30),
        wisdom: z.number().int().min(1).max(30),
        charisma: z.number().int().min(1).max(30),
      })
      .strict(),
    speciesId: entityIdSchema.optional(),
    backgroundId: entityIdSchema.optional(),
    featIds: z.array(entityIdSchema).default([]),
    learnedSpellIds: z.array(entityIdSchema).default([]),
    choices: z.array(choiceSelectionSchema).default([]),
    proficiencyChoices: proficiencyChoicesSchema,
  })
  .strict()
  .superRefine((build, context) => {
    build.levels.forEach((level, index) => {
      if (level.characterLevel !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Character levels must be contiguous and ordered from 1",
          path: ["levels", index, "characterLevel"],
        });
      }
    });
  });

const characterLoadoutSchema = z
  .object({
    preparedSpellIds: z.array(entityIdSchema).default([]),
    equippedItemIds: z.array(z.string().min(1)).default([]),
    attunedItemIds: z.array(z.string().min(1)).default([]),
    selectedWeaponMasteryIds: z.array(entityIdSchema).default([]),
    choices: z.array(choiceSelectionSchema).default([]),
  })
  .strict();

const characterStateSchema = z
  .object({
    currentHitPoints: z.number().int(),
    temporaryHitPoints: z.number().int().min(0).default(0),
    expendedResources: z.record(entityIdSchema, z.number().int().min(0)).default({}),
    expendedSpellSlots: z.record(z.string(), z.number().int().min(0)).default({}),
    conditionIds: z.array(entityIdSchema).default([]),
    activeEffectIds: z.array(entityIdSchema).default([]),
    concentrationSpellId: entityIdSchema.optional(),
    deathSaveSuccesses: z.number().int().min(0).max(3).default(0),
    deathSaveFailures: z.number().int().min(0).max(3).default(0),
    exhaustion: z.number().int().min(0).max(6).default(0),
  })
  .strict();

const characterOverrideSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    value: z.unknown(),
    reason: z.string().min(1),
  })
  .strict();

const characterMetadataSchema = z
  .object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    revision: z.number().int().min(0),
  })
  .strict();

export const characterDocumentSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    id: z.string().min(1),
    name: z.string().min(1),
    ruleset: rulesetReferenceSchema,
    build: characterBuildSchema,
    loadout: characterLoadoutSchema,
    state: characterStateSchema,
    overrides: z.array(characterOverrideSchema).default([]),
    metadata: characterMetadataSchema,
  })
  .strict();

export type EntityId = z.infer<typeof entityIdSchema>;
export type CharacterLevel = z.infer<typeof characterLevelSchema>;
export type RulesetReference = z.infer<typeof rulesetReferenceSchema>;
export type CharacterBuild = z.infer<typeof characterBuildSchema>;
export type ProficiencyChoice = z.infer<typeof proficiencyChoiceSchema>;
export type ProficiencyChoices = z.infer<typeof proficiencyChoicesSchema>;
export type CharacterLoadout = z.infer<typeof characterLoadoutSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type CharacterDocument = z.infer<typeof characterDocumentSchema>;

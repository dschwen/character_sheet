import { z } from "zod";

export const healingPotionSchema = z
  .object({
    diceCount: z.number().int().positive(),
    diceSize: z.literal(4),
    bonus: z.number().int().nonnegative(),
  })
  .strict();

export const timedMagicItemPowerSchema = z
  .object({
    maximumRounds: z.number().int().positive(),
    actionEconomy: z.literal("bonus-action"),
    activeDescription: z.string().min(1),
  })
  .strict();

const chargeSchema = z
  .object({
    maximum: z.number().int().positive(),
    maximumSpend: z.number().int().positive(),
    dawnDieSize: z.number().int().min(2),
    dawnBonus: z.number().int().nonnegative(),
    lastChargeDieSize: z.number().int().min(2).optional(),
    destroyedOn: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    ({ lastChargeDieSize, destroyedOn }) =>
      lastChargeDieSize === undefined
        ? destroyedOn === undefined
        : destroyedOn !== undefined && destroyedOn <= lastChargeDieSize,
    "Last-charge destruction requires both a die and a valid result",
  );

const spellPower = z
  .object({
    spellId: z.string().min(1),
    selfStatusId: z.string().min(1).optional(),
    baseDarts: z.number().int().positive().optional(),
    charges: chargeSchema.optional(),
  })
  .strict();

const saveReactionPower = z
  .object({
    savingThrowAbility: z.literal("dexterity"),
    charges: chargeSchema,
  })
  .strict();

export const magicItemPowerSchema = z.union([spellPower, saveReactionPower]);

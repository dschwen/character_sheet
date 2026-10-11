import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { classFeatureChoiceSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

export type SpellPreparationMode = "spellbook" | "full-list";

export interface PreparedSpellOption {
  id: string;
  name: string;
  level: number;
  school: string;
  selected: boolean;
  alwaysPrepared: boolean;
}

export interface SpellPreparationEditor {
  classId: string;
  className: string;
  mode: SpellPreparationMode;
  editable: boolean;
  changeDescription: string;
  requiredSelections: number;
  selectedSpellIds: string[];
  alwaysPreparedSpellIds: string[];
  options: PreparedSpellOption[];
}

export interface PreparedSpellLoadoutProposal {
  applicable: boolean;
  issues: string[];
  nextCharacter?: CharacterDocument;
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function localizedName(entity: LoadedRulesPackage["entities"][number]): string {
  return entity.name.en ?? Object.values(entity.name)[0] ?? entity.id;
}

function grantsThroughLevel(value: unknown, classLevel: number): string[] {
  const record = objectValue(value);
  if (record === undefined) return [];
  return Object.entries(record).flatMap(([level, spellIds]) =>
    Number(level) <= classLevel ? stringArray(spellIds) : [],
  );
}

function selectedFeatureOptionIds(character: CharacterDocument): ReadonlySet<string> {
  return new Set(
    character.build.levels
      .flatMap((level) => level.selectedFeatureChoices)
      .flatMap((choice) => choice.optionIds),
  );
}

function choiceGrantedSpells(
  value: unknown,
  selectedOptionIds: ReadonlySet<string>,
  classLevel: number,
): string[] {
  const choices = objectValue(value);
  if (choices === undefined) return [];
  return Object.entries(choices).flatMap(([optionId, spellsByLevel]) =>
    selectedOptionIds.has(optionId) ? grantsThroughLevel(spellsByLevel, classLevel) : [],
  );
}

export function spellPreparationEditor(
  character: CharacterDocument,
  rulesPackage: LoadedRulesPackage,
): SpellPreparationEditor | undefined {
  const evaluation = evaluateCharacter({ character, packages: [rulesPackage] });
  const spellcasting = evaluation.spellcasting;
  if (spellcasting === undefined) return undefined;

  const classEntity = rulesPackage.entities.find(
    (entity) => entity.id === spellcasting.classId && entity.kind === "class",
  );
  if (classEntity === undefined) return undefined;
  const classBody = objectValue(classEntity.body);
  const mode = classBody?.spellPreparation;
  const preparationChange = objectValue(classBody?.spellPreparationChange);
  const progression = classBody?.progression;
  if ((mode !== "spellbook" && mode !== "full-list") || !Array.isArray(progression)) {
    return undefined;
  }

  const classLevel = character.build.levels.filter(
    (level) => level.classId === spellcasting.classId,
  ).length;
  const progressionRow = progression
    .map((row) => objectValue(row))
    .find((row) => row?.level === classLevel);
  const slots = objectValue(progressionRow?.spellSlots);
  const maximumSpellLevel = Math.max(0, ...Object.keys(slots ?? {}).map(Number));
  const subclassEntity = rulesPackage.entities.find(
    (entity) => entity.id === character.build.subclassId && entity.kind === "subclass",
  );
  const subclassBody = objectValue(subclassEntity?.body);
  const selectedOptions = selectedFeatureOptionIds(character);
  const alwaysPreparedSpellIds = [
    ...rulesPackage.entities
      .filter((entity) => selectedOptions.has(entity.id))
      .flatMap((entity) => {
        const body = objectValue(entity.body);
        return objectValue(body?.freeSpellCasting)?.classId === classEntity.id
          ? grantsThroughLevel(body?.alwaysPreparedSpells, classLevel)
          : [];
      }),
    ...[classBody, subclassBody]
      .flatMap((body) => Object.values(body ?? {}))
      .flatMap((value) => {
        const choice = classFeatureChoiceSchema.safeParse(value);
        if (
          !choice.success ||
          choice.data.spellSelection?.castingClassId !== classEntity.id ||
          !choice.data.spellSelection.alwaysPrepared ||
          choice.data.level > classLevel
        )
          return [];
        return character.build.levels
          .flatMap((level) => level.selectedFeatureChoices)
          .filter((selection) => selection.choiceId === choice.data.id)
          .flatMap((selection) => selection.optionIds);
      }),
    ...grantsThroughLevel(classBody?.alwaysPreparedSpells, classLevel),
    ...grantsThroughLevel(subclassBody?.alwaysPreparedSpells, classLevel),
    ...choiceGrantedSpells(subclassBody?.alwaysPreparedSpellChoices, selectedOptions, classLevel),
  ].filter((id, index, values) => values.indexOf(id) === index);
  const alwaysPrepared = new Set(alwaysPreparedSpellIds);
  const selected = new Set(character.loadout.preparedSpellIds);
  const eligibleSpellIds = new Set([
    ...(mode === "spellbook" ? character.build.learnedSpellIds : stringArray(classBody?.spellList)),
    ...alwaysPreparedSpellIds,
  ]);
  const options = rulesPackage.entities
    .filter((entity) => entity.kind === "spell" && eligibleSpellIds.has(entity.id))
    .map((entity) => {
      const body = objectValue(entity.body);
      return {
        id: entity.id,
        name: localizedName(entity),
        level: typeof body?.level === "number" ? body.level : 99,
        school: typeof body?.school === "string" ? body.school : "unknown",
        selected: selected.has(entity.id),
        alwaysPrepared: alwaysPrepared.has(entity.id),
      };
    })
    .filter((spell) => spell.level > 0 && spell.level <= maximumSpellLevel)
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));

  return {
    classId: classEntity.id,
    className: localizedName(classEntity),
    mode,
    editable: preparationChange?.event !== "level-up",
    changeDescription:
      preparationChange?.event === "level-up"
        ? `Replace up to ${String(typeof preparationChange.replacementMaximum === "number" ? preparationChange.replacementMaximum : 1)} prepared spell when gaining a ${localizedName(classEntity)} level`
        : "Change after completing the rest or preparation required by your class",
    requiredSelections: spellcasting.preparedSpellLimit,
    selectedSpellIds: [...character.loadout.preparedSpellIds],
    alwaysPreparedSpellIds,
    options,
  };
}

export function proposePreparedSpellLoadout(
  character: CharacterDocument,
  rulesPackage: LoadedRulesPackage,
  selectedSpellIds: string[],
  updatedAt = new Date(),
): PreparedSpellLoadoutProposal {
  const editor = spellPreparationEditor(character, rulesPackage);
  if (editor === undefined) {
    return { applicable: false, issues: ["This character does not prepare spells."] };
  }
  if (!editor.editable) {
    return {
      applicable: false,
      issues: [`${editor.className} prepared spells can change only during level up.`],
    };
  }

  const uniqueSelections = new Set(selectedSpellIds);
  const selectableIds = new Set(
    editor.options.filter((spell) => !spell.alwaysPrepared).map((spell) => spell.id),
  );
  const issues: string[] = [];
  if (uniqueSelections.size !== selectedSpellIds.length) {
    issues.push("Prepared spell selections must be unique.");
  }
  if (uniqueSelections.size !== editor.requiredSelections) {
    issues.push(`Choose exactly ${String(editor.requiredSelections)} prepared spells.`);
  }
  if ([...uniqueSelections].some((id) => !selectableIds.has(id))) {
    issues.push("Every prepared spell must be an eligible, non-automatic selection.");
  }
  if (issues.length > 0) return { applicable: false, issues };

  const nextCharacter = characterDocumentSchema.parse({
    ...character,
    loadout: { ...character.loadout, preparedSpellIds: [...selectedSpellIds] },
    metadata: {
      ...character.metadata,
      updatedAt: updatedAt.toISOString(),
      revision: character.metadata.revision + 1,
    },
  });
  const evaluation = evaluateCharacter({ character: nextCharacter, packages: [rulesPackage] });
  const preparedSpellErrors = evaluation.validations.filter(
    (validation) =>
      validation.severity === "error" &&
      validation.paths.some((path) => path.startsWith("loadout.preparedSpellIds")),
  );
  if (preparedSpellErrors.length > 0) {
    return {
      applicable: false,
      issues: preparedSpellErrors.map(
        (validation) =>
          validation.message.en ?? Object.values(validation.message)[0] ?? validation.code,
      ),
    };
  }
  return { applicable: true, issues: [], nextCharacter };
}

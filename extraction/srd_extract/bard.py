"""Parse the Bard class, College of Lore, and representative Bard spells."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.progression import progression_feature_ids
from srd_extract.ranger import _level_features
from srd_extract.wizard import (
    ABILITIES,
    SCHOOLS,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)

CLASS_ID = "srd521.class.bard"
SUBCLASS_ID = "srd521.subclass.bard.college-of-lore"
BARDIC_INSPIRATION_ID = "srd521.resource.bard.bardic-inspiration"
BARDIC_DIE_TABLE_ID = "srd521.table.bard.bardic-inspiration-die"
REPRESENTATIVE_SPELLS = (
    "Dancing Lights",
    "Vicious Mockery",
    "Dissonant Whispers",
    "Healing Word",
    "Shatter",
    "Hypnotic Pattern",
    "Mass Healing Word",
)


@dataclass(frozen=True, slots=True)
class BardProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    bardic_die_size: int
    cantrips: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Bard level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        expected_die = (
            6 if self.level < 5 else 8 if self.level < 10 else 10 if self.level < 15 else 12
        )
        if self.bardic_die_size != expected_die:
            raise ValueError(
                f"Level {self.level} has a d{self.bardic_die_size} Bardic Inspiration die; "
                f"expected d{expected_die}"
            )
        if len(self.spell_slots) != 9:
            raise ValueError("Bard progression rows require all nine spell-slot columns")


def _review(note: str) -> dict[str, Any]:
    return {
        "status": "STRUCTURED",
        "extractionApproved": True,
        "semanticsApproved": False,
        "testsApproved": False,
        "notes": note,
    }


def parse_core_traits(table_text: str, starting_equipment: str) -> dict[str, Any]:
    pattern = re.compile(
        r"Core Bard Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Bard level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose any (?P<skill_count>\d+) skills .+? "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Tool Proficiencies Choose (?P<tool_count>\d+) Musical Instruments .+? "
        r"Armor Training (?P<armor>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Bard Traits table does not match the expected labels")
    skill_count = int(match.group("skill_count"))
    return {
        "primaryAbilities": [match.group("primary").casefold()],
        "hitPointDie": int(match.group("hit_die")),
        "savingThrowProficiencies": [
            value.strip().casefold() for value in match.group("saves").split(" and ")
        ],
        "skillProficiencyChoice": {
            "minimum": skill_count,
            "maximum": skill_count,
            "options": [
                "acrobatics",
                "animal handling",
                "arcana",
                "athletics",
                "deception",
                "history",
                "insight",
                "intimidation",
                "investigation",
                "medicine",
                "nature",
                "perception",
                "performance",
                "persuasion",
                "religion",
                "sleight of hand",
                "stealth",
                "survival",
            ],
        },
        "weaponProficiencies": ["simple"],
        "toolProficiencyChoice": {
            "minimum": int(match.group("tool_count")),
            "maximum": int(match.group("tool_count")),
            "category": "musical-instrument",
        },
        "armorTraining": ["light"],
        "startingEquipmentText": starting_equipment,
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[BardProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 390 <= float(word["bbox"][1]) < 730
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Bard progression table does not contain exactly levels 1–20")
    slot_boundaries = (380, 399, 417, 435, 453, 471, 489, 507, 525, 545)
    rows: list[BardProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else start_y + 15
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 545
        ]
        feature_text = _column_text(row, 145, 260)
        die_match = re.fullmatch(r"D(?P<size>\d+)", _column_text(row, 260, 295))
        if die_match is None:
            raise ValueError(f"Bard level {level} inspiration die is malformed")
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            BardProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                bardic_die_size=int(die_match.group("size")),
                cantrips=int(_column_text(row, 295, 335)),
                prepared_spells=int(_column_text(row, 335, 380)),
                spell_slots=slots,
            )
        )
    return tuple(rows)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Level 1: Bardic Inspiration"
    )
    end = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "Bard Spell List"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.bard")
    expected = {
        "Bardic Inspiration",
        "Spellcasting",
        "Expertise",
        "Jack of All Trades",
        "Bard Subclass",
        "Ability Score Improvement",
        "Font of Inspiration",
        "Countercharm",
        "Magical Secrets",
        "Superior Inspiration",
        "Epic Boon",
        "Words of Creation",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Bard class feature extraction is incomplete")
    return features


def extract_lore_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Level 3: Bonus Proficiencies"
    )
    features = _level_features(nodes, start, len(nodes), "srd521.subclass-feature.bard.lore")
    expected = {"Bonus Proficiencies", "Cutting Words", "Magical Discoveries", "Peerless Skill"}
    if {feature["name"] for feature in features} != expected:
        raise ValueError("College of Lore feature extraction is incomplete")
    return features


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    start = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "Bard Spell List"
    )
    end = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "Bard Subclass:"
    )
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Bard Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        rf"(?P<special>(?:[CRM](?:, [CRM])*|[—–-]))"
        rf"(?= .+? (?:{'|'.join(SCHOOLS)}) |$)"
    )
    current_level: int | None = None
    spells: dict[str, dict[str, Any]] = {}
    for node in nodes[start + 1 : end]:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match:
                current_level = int(match.group("level") or 0)
            continue
        if node["kind"] != "TableNode" or current_level is None:
            continue
        text = str(node["normalizedText"]).removeprefix("Spell School Special ")
        for match in entry_pattern.finditer(text):
            name = match.group("name").strip()
            special = match.group("special")
            spells[name] = {
                "id": f"srd521.spell.{_slug(name)}",
                "level": current_level,
                "school": match.group("school").casefold(),
                "concentration": "C" in special,
                "ritual": "R" in special,
                "specificMaterial": "M" in special,
            }
    if len(spells) != 129:
        raise ValueError(f"Bard spell list must contain 129 entries, found {len(spells)}")
    missing = set(REPRESENTATIVE_SPELLS) - spells.keys()
    if missing:
        raise ValueError(f"Representative Bard spells missing: {sorted(missing)}")
    return spells


def extract_spell_entities(
    document: dict[str, Any], spell_list: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    starts: list[tuple[int, str, tuple[int, str, list[str]]]] = []
    for index, node in enumerate(nodes[:-1]):
        if node["kind"] == "HeadingNode" and nodes[index + 1]["kind"] == "ParagraphNode":
            signature = _spell_signature(str(nodes[index + 1]["normalizedText"]))
            if signature is not None:
                starts.append((index, str(node["normalizedText"]), signature))
    entities: list[dict[str, Any]] = []
    for position, (start, name, signature) in enumerate(starts):
        if name not in REPRESENTATIVE_SPELLS:
            continue
        end = starts[position + 1][0] if position + 1 < len(starts) else len(nodes)
        section = [node for node in nodes[start:end] if node["kind"] != "MetadataNode"]
        metadata: list[dict[str, Any]] = []
        description_nodes: list[dict[str, Any]] = []
        for node in section[2:]:
            if node["kind"] == "HeadingNode" and not description_nodes:
                metadata.append(node)
            else:
                description_nodes.append(node)
        casting = _parse_casting_metadata(" ".join(node["normalizedText"] for node in metadata))
        description = " ".join(node["normalizedText"] for node in description_nodes)
        level, school, classes = signature
        listed = spell_list[name]
        if level != listed["level"] or school != listed["school"]:
            raise ValueError(f"{name} description disagrees with the Bard spell list")
        entities.append(
            {
                "id": listed["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "bard"],
                "source": _source_spans(section),
                "body": {
                    "level": level,
                    "school": school,
                    "classes": classes,
                    "bardSpell": True,
                    "ritual": listed["ritual"],
                    **casting,
                    "attackType": "ranged" if "ranged spell attack" in description else None,
                    "savingThrows": sorted(
                        {
                            match.group("ability").casefold()
                            for match in re.finditer(
                                rf"(?P<ability>{'|'.join(ABILITIES)}) saving throw", description
                            )
                        }
                    ),
                    "damage": [],
                    "healing": [],
                    "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
                    "description": description,
                },
                "rules": [],
                "review": _review("Representative Bard spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Bard spell extraction is incomplete")
    return tuple(entities)


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.bard.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.bard.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.armor.light.leather-armor",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.dagger",
                        "quantity": 2,
                        "equipped": True,
                    },
                    {"kind": "text", "name": "Musical Instrument of your choice", "quantity": 1},
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.entertainers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 19,
            },
            {
                "id": "srd521.option.class.bard.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 90,
            },
        ],
    }


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "bard"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Bard description."),
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[BardProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    ids = progression_feature_ids(features, ((row.level, row.feature_names) for row in progression))
    all_skills = [
        f"srd521.skill.{value}"
        for value in (
            "acrobatics",
            "animal-handling",
            "arcana",
            "athletics",
            "deception",
            "history",
            "insight",
            "intimidation",
            "investigation",
            "medicine",
            "nature",
            "perception",
            "performance",
            "persuasion",
            "religion",
            "sleight-of-hand",
            "stealth",
            "survival",
        )
    ]
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Bard"},
        "tags": ["class", "bard", "spellcaster"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 3 if level < 3 else 6 for level in range(1, 12)},
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 11,
                "defaultAbilityScores": {
                    "strength": 10,
                    "dexterity": 13,
                    "constitution": 14,
                    "intelligence": 10,
                    "wisdom": 10,
                    "charisma": 15,
                },
                "defaultAbilityScoreImprovementAbility": "charisma",
                "defaultClassSkillIds": [
                    "srd521.skill.performance",
                    "srd521.skill.persuasion",
                    "srd521.skill.deception",
                    "srd521.skill.arcana",
                    "srd521.skill.history",
                    "srd521.skill.nature",
                ],
                "defaultGrantedFeatIds": [],
                "expertiseChoice": {
                    "sourceId": "srd521.class-feature.bard.expertise",
                    "minimumLevel": 2,
                    "requireClassProficiency": False,
                    "eligibleSkillIds": all_skills,
                    "countByLevel": {str(level): 2 if level < 9 else 4 for level in range(2, 12)},
                },
            },
            "spellcastingAbility": "charisma",
            "spellPreparation": "full-list",
            "spellPreparationChange": {"event": "level-up", "replacementMaximum": 1},
            "cantripChange": {"event": "level-up", "replacementMaximum": 1},
            "preparedSpellListExpansion": {
                "sourceFeatureId": "srd521.class-feature.bard.magical-secrets",
                "minimumLevel": 10,
                "minimumSpellLevel": 1,
                "sourceClassIds": [
                    "srd521.class.cleric",
                    "srd521.class.druid",
                    "srd521.class.wizard",
                ],
            },
            "alwaysPreparedSpells": {},
            "spellList": [
                entry["id"]
                for name, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "bardicInspirationDie": {"diceCount": 1, "diceSize": row.bardic_die_size},
                    "cantrips": row.cantrips,
                    "preparedSpells": row.prepared_spells,
                    "spellSlots": {
                        str(level): count
                        for level, count in enumerate(row.spell_slots, 1)
                        if count > 0
                    },
                }
                for row in progression
            ],
        },
        "rules": [],
        "review": _review("Bard progression and spellcasting table from page 31."),
    }


def _lore_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading_index = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "College of Lore"
    )
    heading, intro, tagline = nodes[heading_index : heading_index + 3]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "College of Lore"},
        "tags": ["subclass", "bard", "college-of-lore"],
        "source": _source_spans([heading, tagline, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(by_level.items())
            ],
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("College of Lore subclass extracted from page 35."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _table(progression: tuple[BardProgressionRow, ...], source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": BARDIC_DIE_TABLE_ID,
        "kind": "rule-table",
        "name": {"en": "Bardic Inspiration Die"},
        "tags": ["rule-table", "bard", "bardic-inspiration"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.bardic_die_size for row in progression},
        },
        "rules": [],
        "review": _review("Bardic Inspiration die progression from the Bard table."),
    }


def _ir(
    feature: dict[str, Any],
    rules: list[dict[str, Any]],
    *,
    source: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature["id"],
        "kind": "class-feature",
        "parentId": CLASS_ID,
        "level": feature["level"],
        "source": source or feature["source"],
        "text": {
            "title": feature["name"],
            "nodes": [
                {"kind": node["kind"], "text": node["normalizedText"]}
                for node in feature["bodyNodes"]
                if node["kind"] in {"ParagraphNode", "ListNode"}
            ],
        },
        "proposedRules": rules,
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": [],
        },
    }


def _bardic_inspiration_ir(feature: dict[str, Any], font: dict[str, Any]) -> dict[str, Any]:
    die_expression = {
        "kind": "tableLookup",
        "table": BARDIC_DIE_TABLE_ID,
        "key": {"kind": "ref", "path": "classLevel.bard"},
    }
    return _ir(
        feature,
        [
            {
                "id": "bardic-inspiration-resource",
                "type": "grant-resource",
                "target": BARDIC_INSPIRATION_ID,
                "expression": {
                    "kind": "max",
                    "args": [
                        {"kind": "literal", "value": 1},
                        {"kind": "ref", "path": "ability.charisma.modifier"},
                    ],
                },
                "parameters": {
                    "recharge": [
                        {"event": "long-rest", "amount": "all"},
                        {
                            "event": "short-rest",
                            "amount": "all",
                            "classId": CLASS_ID,
                            "minimumClassLevel": 5,
                        },
                    ]
                },
                "automationLevel": "state-automated",
            },
            {
                "id": "use-bardic-inspiration",
                "type": "grant-action",
                "target": "action.bardic-inspiration",
                "when": {"kind": "resourceAvailable", "resourceId": BARDIC_INSPIRATION_ID},
                "expression": die_expression,
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": BARDIC_INSPIRATION_ID,
                    "checkBonus": {
                        "diceCount": 1,
                        "diceSizeFromExpression": True,
                        "mode": "add",
                        "appliesTo": ["d20-test"],
                    },
                },
                "automationLevel": "roll-assisted",
            },
        ],
        source=[*feature["source"], *font["source"]],
    )


def _countercharm_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _ir(
        feature,
        [
            {
                "id": "use-countercharm",
                "type": "grant-action",
                "target": "action.countercharm",
                "when": {"kind": "hasEntity", "entityId": feature["id"]},
                "parameters": {
                    "actionEconomy": "reaction",
                    "savingThrowReroll": {
                        "mode": "advantage",
                        "conditionIds": ["srd521.condition.charmed", "srd521.condition.frightened"],
                        "rangeFeet": 30,
                    },
                },
                "automationLevel": "roll-assisted",
            }
        ],
    )


def _jack_of_all_trades_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _ir(
        feature,
        [
            {
                "id": "jack-of-all-trades-unproficient-skills",
                "type": "add-modifier",
                "target": "unproficient-skill-checks",
                "expression": {
                    "kind": "floor",
                    "value": {
                        "kind": "multiply",
                        "args": [
                            {"kind": "ref", "path": "proficiencyBonus"},
                            {"kind": "literal", "value": 0.5},
                        ],
                    },
                },
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
    )


def _cutting_words_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return {
        **_ir(
            feature,
            [
                {
                    "id": "use-cutting-words",
                    "type": "grant-action",
                    "target": "action.cutting-words",
                    "when": {
                        "kind": "resourceAvailable",
                        "resourceId": BARDIC_INSPIRATION_ID,
                    },
                    "expression": {
                        "kind": "tableLookup",
                        "table": BARDIC_DIE_TABLE_ID,
                        "key": {"kind": "ref", "path": "classLevel.bard"},
                    },
                    "parameters": {
                        "actionEconomy": "reaction",
                        "spends": 1,
                        "resourceId": BARDIC_INSPIRATION_ID,
                        "checkBonus": {
                            "diceCount": 1,
                            "diceSizeFromExpression": True,
                            "mode": "subtract",
                            "appliesTo": ["ability-check", "attack-roll", "damage-roll"],
                        },
                    },
                    "automationLevel": "roll-assisted",
                }
            ],
        ),
        "kind": "subclass-feature",
        "parentId": SUBCLASS_ID,
    }


def generate_bard_content(class_root: Path, spell_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(class_root / "normalized" / "document.json")
    spell_document = read_json(spell_root / "normalized" / "document.json")
    raw = read_json(class_root / "raw" / "pages" / "0031.json")
    core = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Bard Traits")
    )
    equipment = next(
        node
        for node in document["nodes"]
        if node["kind"] == "ParagraphNode" and node["normalizedText"].startswith("Choose A or B")
    )
    progression_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Bard Features")
    )
    traits = parse_core_traits(core["normalizedText"], equipment["normalizedText"])
    progression = parse_progression(raw)
    features = extract_features(document)
    secrets = next(feature for feature in features if feature["name"] == "Magical Secrets")
    secrets_text = " ".join(node["normalizedText"] for node in secrets["bodyNodes"])
    for phrase in ["new prepared spells", "Bard, Cleric,", "Druid, and Wizard", "replace"]:
        if phrase not in secrets_text:
            raise ValueError(f"Magical Secrets source is missing {phrase}")
    lore = extract_lore_features(document)
    spell_list = parse_spell_list(document)
    spells = extract_spell_entities(spell_document, spell_list)
    source = _source_spans([progression_node])[0]
    entities = [
        _class_entity(
            traits,
            progression,
            features,
            spell_list,
            _source_spans([core, equipment, progression_node]),
        ),
        *[_feature_entity(feature, "class-feature") for feature in features],
        _table(progression, source),
        *_lore_entities(document, lore),
        *spells,
    ]
    existing = read_json(output / "entities.json")
    source_class_ids = ["srd521.class.cleric", "srd521.class.druid", "srd521.class.wizard"]
    source_classes = [entity for entity in existing if entity["id"] in source_class_ids]
    if len(source_classes) != len(source_class_ids):
        raise ValueError("Generate Cleric, Druid, and Wizard lists before Bard spell choices.")
    spell_options = sorted(
        {spell for entity in source_classes for spell in entity["body"]["spellList"]}
    )
    discoveries = next(feature for feature in lore if feature["name"] == "Magical Discoveries")
    for entity in entities:
        if entity["id"] == SUBCLASS_ID:
            entity["body"]["magicalDiscoveriesChoice"] = {
                "id": "srd521.choice.bard.magical-discoveries",
                "level": discoveries["level"],
                "minimum": 2,
                "maximum": 2,
                "options": spell_options,
                "defaultOptionIds": ["srd521.spell.counterspell", "srd521.spell.spiritual-weapon"],
                "changeOn": ["level-up"],
                "replacementMaximum": 1,
                "spellSelection": {
                    "sourceFeatureId": discoveries["id"],
                    "castingClassId": CLASS_ID,
                    "sourceClassIds": source_class_ids,
                    "alwaysPrepared": True,
                    "allowCantrips": True,
                },
            }
    replacements = {entity["id"]: entity for entity in entities if entity["kind"] != "spell"}
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "bard.json", entities)
    write_json(output / "entities.json", all_entities)
    by_name = {feature["name"]: feature for feature in features}
    lore_by_name = {feature["name"]: feature for feature in lore}
    authoring = {
        "bard.bardic-inspiration.json": _bardic_inspiration_ir(
            by_name["Bardic Inspiration"], by_name["Font of Inspiration"]
        ),
        "bard.jack-of-all-trades.json": _jack_of_all_trades_ir(by_name["Jack of All Trades"]),
        "bard.countercharm.json": _countercharm_ir(by_name["Countercharm"]),
        "college-of-lore.cutting-words.json": _cutting_words_ir(lore_by_name["Cutting Words"]),
    }
    for filename, ir in authoring.items():
        write_json(output / "authoring-ir" / filename, ir)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedLoreFeatures": len(lore),
        "bardSpellListEntries": len(spell_list),
        "representativeSpells": [spell["id"] for spell in spells],
        "generatedEntities": [entity["id"] for entity in entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "bard-poc-report.json", report)
    return report


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args(arguments)
    report = generate_bard_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Bard entities; "
        f"{report['bardSpellListEntries']} Bard-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

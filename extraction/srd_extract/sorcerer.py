"""Parse the Sorcerer class, Draconic Sorcery, and representative arcane spells."""

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

CLASS_ID = "srd521.class.sorcerer"
SUBCLASS_ID = "srd521.subclass.sorcerer.draconic-sorcery"
SORCERY_POINTS_ID = "srd521.resource.sorcerer.sorcery-points"
INNATE_SORCERY_ID = "srd521.resource.sorcerer.innate-sorcery"
INNATE_STATUS_ID = "srd521.status.feature.innate-sorcery"
RESTORATION_ID = "srd521.resource.sorcerer.sorcerous-restoration"
METAMAGIC_CHOICE_ID = "srd521.choice.sorcerer.metamagic"
ELEMENTAL_AFFINITY_CHOICE_ID = "srd521.choice.sorcerer.draconic.elemental-affinity"
ELEMENTAL_AFFINITY_DAMAGE_TYPES = ("acid", "cold", "fire", "lightning", "poison")
METAMAGIC_NAMES = (
    "Careful Spell",
    "Distant Spell",
    "Empowered Spell",
    "Extended Spell",
    "Heightened Spell",
    "Quickened Spell",
    "Seeking Spell",
    "Subtle Spell",
    "Transmuted Spell",
    "Twinned Spell",
)
REPRESENTATIVE_SPELLS = (
    "Alter Self",
    "Command",
    "Dragon’s Breath",
    "Fear",
    "Fire Bolt",
    "Haste",
    "Sorcerous Burst",
)


@dataclass(frozen=True, slots=True)
class SorcererProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    sorcery_points: int
    cantrips: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Sorcerer level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 9:
            raise ValueError("Sorcerer progression rows require all nine spell-slot columns")


def _review(note: str) -> dict[str, Any]:
    return {
        "status": "STRUCTURED",
        "extractionApproved": True,
        "semanticsApproved": False,
        "testsApproved": False,
        "notes": note,
    }


def parse_core_traits(table_text: str) -> dict[str, Any]:
    pattern = re.compile(
        r"Core Sorcerer Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Sorcerer level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) Armor Training (?P<armor>.+?) "
        r"Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Sorcerer Traits table does not match the expected labels")
    return {
        "primaryAbilities": [match.group("primary").casefold()],
        "hitPointDie": int(match.group("hit_die")),
        "savingThrowProficiencies": [
            value.strip().casefold() for value in match.group("saves").split(" and ")
        ],
        "skillProficiencyChoice": {
            "minimum": int(match.group("skill_count")),
            "maximum": int(match.group("skill_count")),
            "options": [
                value.strip().casefold()
                for value in re.split(r",| or ", match.group("skills"))
                if value.strip()
            ],
        },
        "weaponProficiencies": ["simple"],
        "armorTraining": [],
        "startingEquipmentText": match.group("equipment"),
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[SorcererProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 75 <= float(word["bbox"][1]) < 500
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Sorcerer progression table does not contain exactly levels 1–20")
    slot_boundaries = (375, 393, 411, 429, 447, 465, 483, 501, 519, 540)
    rows: list[SorcererProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 475
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 545
        ]
        feature_text = _column_text(row, 145, 245)
        points_text = _column_text(row, 245, 280)
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            SorcererProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                sorcery_points=0 if points_text == "—" else int(points_text),
                cantrips=int(_column_text(row, 280, 330)),
                prepared_spells=int(_column_text(row, 330, 375)),
                spell_slots=slots,
            )
        )
    return tuple(rows)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        i for i, node in enumerate(nodes) if node["normalizedText"] == "Level 1: Spellcasting"
    )
    end = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Metamagic Options")
    features = _level_features(nodes, start, end, "srd521.class-feature.sorcerer")
    expected = {
        "Spellcasting",
        "Innate Sorcery",
        "Font of Magic",
        "Metamagic",
        "Sorcerer Subclass",
        "Ability Score Improvement",
        "Sorcerous Restoration",
        "Sorcery Incarnate",
        "Epic Boon",
        "Arcane Apotheosis",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Sorcerer class feature extraction is incomplete")
    return features


def extract_draconic_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        i
        for i, node in enumerate(nodes)
        if node["normalizedText"] == "Level 3: Draconic Resilience"
    )
    end = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Warlock")
    features = _level_features(nodes, start, end, "srd521.subclass-feature.sorcerer.draconic")
    expected = {
        "Draconic Resilience",
        "Draconic Spells",
        "Elemental Affinity",
        "Dragon Wings",
        "Dragon Companion",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Draconic Sorcery feature extraction is incomplete")
    return features


def extract_metamagic_options(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Metamagic Options")
    end = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Sorcerer Spell List")
    headings = [
        i
        for i in range(start + 1, end)
        if nodes[i]["kind"] == "HeadingNode" and nodes[i]["normalizedText"] in METAMAGIC_NAMES
    ]
    options = []
    for position, index in enumerate(headings):
        section_end = headings[position + 1] if position + 1 < len(headings) else end
        section = [node for node in nodes[index:section_end] if node["kind"] != "MetadataNode"]
        name = nodes[index]["normalizedText"]
        text = " ".join(node["normalizedText"] for node in section[1:])
        cost_match = re.search(r"Cost: (?P<cost>\d+) Sorcery Point", text)
        options.append(
            {
                "id": f"srd521.option.sorcerer.metamagic.{_slug(name.removesuffix(' Spell'))}",
                "name": name,
                "cost": int(cost_match.group("cost")) if cost_match else 1,
                "text": text,
                "source": _source_spans(section),
            }
        )
    if tuple(option["name"] for option in options) != METAMAGIC_NAMES:
        raise ValueError("Metamagic option extraction is incomplete")
    return tuple(options)


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    start = next(
        i for i, node in enumerate(nodes) if node["normalizedText"] == "Sorcerer Spell List"
    )
    end = next(
        i for i, node in enumerate(nodes) if node["normalizedText"] == "Sorcerer Subclass: Draconic"
    )
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Sorcerer Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        rf"(?P<special>(?:C(?:, [RM])?|R|M|[—–-]))"
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
    if len(spells) != 138:
        raise ValueError(f"Sorcerer spell list must contain 138 entries, found {len(spells)}")
    missing = (set(REPRESENTATIVE_SPELLS) - {"Command"}) - spells.keys()
    if missing:
        raise ValueError(f"Representative Sorcerer spells missing: {sorted(missing)}")
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
        listed = spell_list.get(
            name,
            {
                "id": f"srd521.spell.{_slug(name)}",
                "level": level,
                "school": school,
                "ritual": False,
            },
        )
        if level != listed["level"] or school != listed["school"]:
            raise ValueError(f"{name} description disagrees with the Sorcerer spell list")
        entities.append(
            {
                "id": listed["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "sorcerer"],
                "source": _source_spans(section),
                "body": {
                    "level": level,
                    "school": school,
                    "classes": classes,
                    "sorcererSpell": True,
                    "ritual": listed["ritual"],
                    **casting,
                    "attackType": "ranged" if "ranged spell attack" in description else None,
                    "savingThrows": sorted(
                        {
                            m.group("ability").casefold()
                            for m in re.finditer(
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
                "review": _review("Representative Sorcerer spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Sorcerer spell extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "sorcerer"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Sorcerer description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.sorcerer.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.sorcerer.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.spear",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.dagger",
                        "quantity": 2,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.arcane-focus",
                        "quantity": 1,
                        "equipped": False,
                        "label": "Arcane Focus (crystal)",
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.dungeoneers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 28,
            },
            {
                "id": "srd521.option.class.sorcerer.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 50,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[SorcererProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    ids = progression_feature_ids(features, ((row.level, row.feature_names) for row in progression))
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Sorcerer"},
        "tags": ["class", "sorcerer", "spellcaster"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 2 for level in range(1, 10)},
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 9,
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
                    "srd521.skill.arcana",
                    "srd521.skill.persuasion",
                ],
                "defaultGrantedFeatIds": [],
            },
            "spellcastingAbility": "charisma",
            "spellPreparation": "full-list",
            "spellPreparationChange": {
                "event": "level-up",
                "replacementMaximum": 1,
            },
            "alwaysPreparedSpells": {},
            "spellList": [
                entry["id"]
                for name, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "metamagicChoice": {
                "id": METAMAGIC_CHOICE_ID,
                "level": 2,
                "minimum": 2,
                "maximum": 2,
                "options": [
                    f"srd521.option.sorcerer.metamagic.{_slug(name.removesuffix(' Spell'))}"
                    for name in METAMAGIC_NAMES
                ],
                "defaultOptionIds": [
                    "srd521.option.sorcerer.metamagic.quickened",
                    "srd521.option.sorcerer.metamagic.subtle",
                ],
                "changeOn": ["level-up"],
                "replacementMaximum": 1,
            },
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "sorceryPoints": row.sorcery_points,
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
        "review": _review("Sorcerer progression and spellcasting table from pages 64–65."),
    }


def _metamagic_entities(options: tuple[dict[str, Any], ...]) -> list[dict[str, Any]]:
    return [
        {
            "id": option["id"],
            "kind": "class-option",
            "name": {"en": option["name"]},
            "tags": ["class-option", "sorcerer", "metamagic"],
            "source": option["source"],
            "body": {
                "choiceId": METAMAGIC_CHOICE_ID,
                "sorceryPointCost": option["cost"],
                "text": option["text"],
            },
            "rules": [],
            "review": _review(f"{option['name']} Metamagic option."),
        }
        for option in options
    ]


def _draconic_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node for node in nodes if node["normalizedText"] == "Sorcerer Subclass: Draconic"
    )
    intro = nodes[nodes.index(heading) + 2]
    spells_feature = next(feature for feature in features if feature["name"] == "Draconic Spells")
    affinity_feature = next(
        feature for feature in features if feature["name"] == "Elemental Affinity"
    )
    table = next(node for node in spells_feature["bodyNodes"] if node["kind"] == "TableNode")
    always: dict[str, list[str]] = {}
    for match in re.finditer(r"(?P<level>\d+) (?P<spells>.+?)(?= \d+ |$)", table["normalizedText"]):
        always[match.group("level")] = [
            f"srd521.spell.{_slug(name.strip())}"
            for name in match.group("spells").removeprefix("Level Spells ").split(",")
        ]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Draconic Sorcery"},
        "tags": ["subclass", "sorcerer", "draconic-sorcery"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": ids} for level, ids in sorted(by_level.items())
            ],
            "alwaysPreparedSpells": always,
            "elementalAffinityChoice": {
                "id": ELEMENTAL_AFFINITY_CHOICE_ID,
                "level": 6,
                "minimum": 1,
                "maximum": 1,
                "options": [
                    f"srd521.option.sorcerer.draconic.elemental-affinity.{damage_type}"
                    for damage_type in ELEMENTAL_AFFINITY_DAMAGE_TYPES
                ],
                "defaultOptionIds": ["srd521.option.sorcerer.draconic.elemental-affinity.fire"],
            },
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Draconic Sorcery subclass extracted from pages 69–70."),
    }
    affinity_options = [
        {
            "id": f"srd521.option.sorcerer.draconic.elemental-affinity.{damage_type}",
            "kind": "class-option",
            "name": {"en": f"{damage_type.title()} Affinity"},
            "tags": ["class-option", "sorcerer", "draconic-sorcery"],
            "source": affinity_feature["source"],
            "body": {
                "choiceId": ELEMENTAL_AFFINITY_CHOICE_ID,
                "damageType": damage_type,
                "text": (
                    f"Resistance to {damage_type} damage; add Charisma to one damage roll of "
                    f"a spell that deals {damage_type} damage."
                ),
            },
            "rules": [],
            "review": _review(f"Elemental Affinity {damage_type} damage choice."),
        }
        for damage_type in ELEMENTAL_AFFINITY_DAMAGE_TYPES
    ]
    return [
        subclass,
        *[_feature_entity(feature, "subclass-feature") for feature in features],
        *affinity_options,
    ]


def _table(
    progression: tuple[SorcererProgressionRow, ...], source: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": "srd521.table.sorcerer.sorcery-points",
        "kind": "rule-table",
        "name": {"en": "Sorcerer Sorcery Points"},
        "tags": ["rule-table", "sorcerer"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.sorcery_points for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Sorcerer progression table."),
    }


def _ir(
    feature: dict[str, Any],
    rules: list[dict[str, Any]],
    *,
    kind: str = "class-feature",
    parent: str = CLASS_ID,
    ir_id: str | None = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": ir_id or feature["id"],
        "kind": kind,
        "parentId": parent,
        "level": feature["level"],
        "source": feature["source"],
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
            "notes": ["Spell targets and encounter effects remain assisted."],
        },
    }


def _resource_ir(
    feature: dict[str, Any],
    resource_id: str,
    maximum: dict[str, Any],
    action: str,
    *,
    restores: dict[str, Any] | None = None,
    action_economy: str = "bonus-action",
) -> dict[str, Any]:
    return _ir(
        feature,
        [
            {
                "id": f"{action}-resource",
                "type": "grant-resource",
                "target": resource_id,
                "expression": maximum,
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": f"use-{action}",
                "type": "grant-action",
                "target": f"action.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": resource_id},
                "parameters": {
                    "actionEconomy": action_economy,
                    "spends": 1,
                    "resourceId": resource_id,
                    **({} if restores is None else {"restoresResource": restores}),
                },
                "automationLevel": "state-automated" if restores else "roll-assisted",
            },
        ],
    )


def _metamagic_ir(option: dict[str, Any], feature: dict[str, Any]) -> dict[str, Any]:
    action = _slug(option["name"].removesuffix(" Spell"))
    return _ir(
        feature,
        [
            {
                "id": f"use-{action}-spell",
                "type": "grant-action",
                "target": f"action.metamagic.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": SORCERY_POINTS_ID},
                "parameters": {
                    "actionEconomy": "on-cast",
                    "spends": option["cost"],
                    "resourceId": SORCERY_POINTS_ID,
                },
                "automationLevel": "roll-assisted",
            }
        ],
        ir_id=option["id"],
    )


def _innate_sorcery_content(
    innate: dict[str, Any], incarnate: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    inactive = {
        "kind": "not",
        "arg": {
            "kind": "equals",
            "left": {"kind": "ref", "path": "status.innateSorcery.active"},
            "right": {"kind": "literal", "value": True},
        },
    }
    ordinary = _resource_ir(
        innate, INNATE_SORCERY_ID, {"kind": "literal", "value": 2}, "innate-sorcery"
    )
    action = ordinary["proposedRules"][1]
    action["when"] = {"kind": "all", "args": [action["when"], inactive]}
    action["parameters"]["activatesEffectId"] = INNATE_STATUS_ID
    action["automationLevel"] = "state-automated"
    alternate = _ir(
        incarnate,
        [
            {
                "id": "activate-with-sorcery-points",
                "type": "grant-action",
                "target": "action.sorcery-incarnate",
                "when": {
                    "kind": "all",
                    "args": [
                        inactive,
                        {
                            "kind": "not",
                            "arg": {"kind": "resourceAvailable", "resourceId": INNATE_SORCERY_ID},
                        },
                        {
                            "kind": "resourceAvailable",
                            "resourceId": SORCERY_POINTS_ID,
                            "minimum": 2,
                        },
                    ],
                },
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 2,
                    "resourceId": SORCERY_POINTS_ID,
                    "activatesEffectId": INNATE_STATUS_ID,
                },
                "automationLevel": "state-automated",
            }
        ],
    )
    status = {
        "id": INNATE_STATUS_ID,
        "kind": "status",
        "name": {"en": "Innate Sorcery"},
        "tags": ["status", "feature", "sorcerer"],
        "source": innate["source"],
        "body": {
            "sourceFeatureId": innate["id"],
            "description": (
                "For 1 minute, your Sorcerer spell save DC increases by 1 and your Sorcerer "
                "spell attacks have Advantage. End this status when the minute expires. "
                "At Sorcerer level 7, you may use up to two Metamagic options on each spell "
                "while active; adjudicate their timing and costs manually."
            ),
            "duration": "1 minute",
            "concentration": False,
            "endsOnRest": True,
            "spellcastingEnhancement": {
                "castingClassId": CLASS_ID,
                "saveDifficultyClassBonus": 1,
                "attackRollAdvantage": True,
            },
        },
        "rules": [],
        "review": _review(
            "Innate Sorcery spellcasting benefits; duration and Metamagic timing remain manual."
        ),
    }
    return ordinary, alternate, status


def _resilience_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _ir(
        feature,
        [
            {
                "id": "draconic-hit-points",
                "type": "add-modifier",
                "target": "hitPoints.maximum",
                "expression": {"kind": "ref", "path": "classLevel.sorcerer"},
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "draconic-armor-class",
                "type": "add-candidate-calculation",
                "target": "armor-class",
                "when": {
                    "kind": "equals",
                    "left": {"kind": "ref", "path": "equipment.wearingArmor"},
                    "right": {"kind": "literal", "value": False},
                },
                "expression": {
                    "kind": "add",
                    "args": [
                        {"kind": "literal", "value": 10},
                        {"kind": "ref", "path": "ability.dexterity.modifier"},
                        {"kind": "ref", "path": "ability.charisma.modifier"},
                    ],
                },
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
        ],
        kind="subclass-feature",
        parent=SUBCLASS_ID,
    )


def generate_sorcerer_content(class_root: Path, spell_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(class_root / "normalized" / "document.json")
    spell_document = read_json(spell_root / "normalized" / "document.json")
    raw = read_json(class_root / "raw" / "pages" / "0065.json")
    core = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Sorcerer Traits")
    )
    progression_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and "Sorcery Prepared" in node["normalizedText"]
    )
    traits, progression = parse_core_traits(core["normalizedText"]), parse_progression(raw)
    features, draconic = extract_features(document), extract_draconic_features(document)
    options, spell_list = extract_metamagic_options(document), parse_spell_list(document)
    spells = extract_spell_entities(spell_document, spell_list)
    source = _source_spans([progression_node])[0]
    entities = [
        _class_entity(
            traits, progression, features, spell_list, _source_spans([core, progression_node])
        ),
        *[_feature_entity(feature, "class-feature") for feature in features],
        _table(progression, source),
        *_metamagic_entities(options),
        *_draconic_entities(document, draconic),
        *spells,
    ]
    by_name = {feature["name"]: feature for feature in features}
    innate, incarnate, status = _innate_sorcery_content(
        by_name["Innate Sorcery"], by_name["Sorcery Incarnate"]
    )
    entities.append(status)
    current_entities = read_json(output / "entities.json")
    # Preserve independent spell annotations and stable aggregate entity ordering.
    replacements = {entity["id"]: entity for entity in entities if entity["kind"] != "spell"}
    existing_ids = {entity["id"] for entity in current_entities}
    all_entities = [replacements.get(entity["id"], entity) for entity in current_entities]
    all_entities.extend(entity for entity in entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "sorcerer.json", entities)
    write_json(output / "entities.json", all_entities)
    draconic_by_name = {feature["name"]: feature for feature in draconic}
    option_by_name = {option["name"]: option for option in options}
    authoring = {
        "sorcerer.innate-sorcery.json": innate,
        "sorcerer.sorcery-incarnate.json": incarnate,
        "sorcerer.font-of-magic.json": _ir(
            by_name["Font of Magic"],
            [
                {
                    "id": "sorcery-points",
                    "type": "grant-resource",
                    "target": SORCERY_POINTS_ID,
                    "expression": {
                        "kind": "tableLookup",
                        "table": "srd521.table.sorcerer.sorcery-points",
                        "key": {"kind": "ref", "path": "classLevel.sorcerer"},
                    },
                    "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                    "automationLevel": "state-automated",
                }
            ],
        ),
        "sorcerer.sorcerous-restoration.json": _resource_ir(
            by_name["Sorcerous Restoration"],
            RESTORATION_ID,
            {"kind": "literal", "value": 1},
            "sorcerous-restoration",
            restores={
                "resourceId": SORCERY_POINTS_ID,
                "amountFact": "classLevel.sorcerer",
                "fraction": 0.5,
                "round": "down",
            },
            action_economy="after-short-rest",
        ),
        "metamagic.quickened.json": _metamagic_ir(
            option_by_name["Quickened Spell"], by_name["Metamagic"]
        ),
        "metamagic.subtle.json": _metamagic_ir(
            option_by_name["Subtle Spell"], by_name["Metamagic"]
        ),
        "draconic-sorcery.resilience.json": _resilience_ir(draconic_by_name["Draconic Resilience"]),
    }
    for filename, ir in authoring.items():
        write_json(output / "authoring-ir" / filename, ir)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Sorcerer through level 9; other reviewed classes through their documented limits; "
        "Human, Soldier, equipment, and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedDraconicFeatures": len(draconic),
        "metamagicOptions": len(options),
        "sorcererSpellListEntries": len(spell_list),
        "representativeSpells": [spell["id"] for spell in spells],
        "generatedEntities": [entity["id"] for entity in entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "sorcerer-poc-report.json", report)
    return report


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args(arguments)
    report = generate_sorcerer_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Sorcerer entities; "
        f"{report['sorcererSpellListEntries']} Sorcerer-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

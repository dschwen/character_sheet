"""Parse the Druid class, Circle of the Land, and representative primal spells."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

from srd_extract.battle_blessings import battle_blessing_choice
from srd_extract.io import read_json, write_json
from srd_extract.progression import progression_feature_ids
from srd_extract.spell_recovery import recovery_resource_ir
from srd_extract.wizard import (
    ABILITIES,
    SCHOOLS,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)

CLASS_ID = "srd521.class.druid"
SUBCLASS_ID = "srd521.subclass.druid.circle-of-the-land"
WILD_SHAPE_ID = "srd521.resource.druid.wild-shape"
PRIMAL_ORDER_CHOICE_ID = "srd521.choice.druid.primal-order"
MAGICIAN_ID = "srd521.option.druid.primal-order.magician"
WARDEN_ID = "srd521.option.druid.primal-order.warden"
LAND_CHOICE_ID = "srd521.choice.druid.circle-of-land"
LAND_OPTION_IDS = {
    "Arid Land": "srd521.option.druid.land.arid",
    "Polar Land": "srd521.option.druid.land.polar",
    "Temperate Land": "srd521.option.druid.land.temperate",
    "Tropical Land": "srd521.option.druid.land.tropical",
}
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
REPRESENTATIVE_SPELLS = (
    "Call Lightning",
    "Druidcraft",
    "Entangle",
    "Faerie Fire",
    "Fog Cloud",
    "Moonbeam",
    "Pass without Trace",
    "Produce Flame",
    "Shillelagh",
    "Sleet Storm",
    "Speak with Animals",
    "Water Breathing",
)
CIRCLE_ONLY_SPELLS = (
    "Blur",
    "Lightning Bolt",
    "Ray of Sickness",
    "Shocking Grasp",
)
EXTRACTED_SPELLS = (*REPRESENTATIVE_SPELLS, *CIRCLE_ONLY_SPELLS)


@dataclass(frozen=True, slots=True)
class DruidProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    wild_shape: int
    cantrips: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Druid level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 9:
            raise ValueError("Druid progression rows require all nine spell-slot columns")


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
        r"Core Druid Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Druid level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Tool Proficiencies (?P<tools>.+?) "
        r"Armor Training (?P<armor>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Druid Traits table does not match the expected labels")
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
        "toolProficiencies": [match.group("tools")],
        "armorTraining": ["light", "shield"],
        "startingEquipmentText": starting_equipment,
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[DruidProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 55 <= float(word["bbox"][0]) < 85
        and 380 <= float(word["bbox"][1]) < 710
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Druid progression table does not contain exactly levels 1–20")
    slot_boundaries = (382, 400, 418, 436, 454, 472, 490, 508, 526, 548)
    rows: list[DruidProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 705
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 50 <= float(word["bbox"][0]) <= 550
        ]
        feature_text = _column_text(row, 135, 255)
        features = (
            ()
            if feature_text == "—"
            else tuple(value.strip() for value in feature_text.split(",") if value.strip())
        )
        wild_shape_text = _column_text(row, 255, 295)
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            DruidProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 90, 135).removeprefix("+")),
                feature_names=features,
                wild_shape=0 if wild_shape_text == "—" else int(wild_shape_text),
                cantrips=int(_column_text(row, 295, 335)),
                prepared_spells=int(_column_text(row, 335, 382)),
                spell_slots=slots,
            )
        )
    return tuple(rows)


def _level_features(
    nodes: list[dict[str, Any]], start: int, end: int, prefix: str
) -> tuple[dict[str, Any], ...]:
    starts = [
        index
        for index in range(start, end)
        if nodes[index]["kind"] == "HeadingNode"
        and HEADING_PATTERN.fullmatch(nodes[index]["normalizedText"])
    ]
    features: list[dict[str, Any]] = []
    for position, index in enumerate(starts):
        heading = nodes[index]
        match = HEADING_PATTERN.fullmatch(heading["normalizedText"])
        if match is None:
            continue
        section_end = starts[position + 1] if position + 1 < len(starts) else end
        body_nodes = [
            node
            for node in nodes[index + 1 : section_end]
            if node["kind"] != "MetadataNode"
            and not (
                node["kind"] == "TableNode"
                and "Spell Slots per Spell Level" in node["normalizedText"]
            )
        ]
        name = match.group("name")
        features.append(
            {
                "id": f"{prefix}.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": _source_spans([heading, *body_nodes]),
            }
        )
    return tuple(features)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Level 1: Spellcasting"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Druid Spell List"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.druid")
    expected = {
        "Spellcasting",
        "Druidic",
        "Primal Order",
        "Wild Shape",
        "Wild Companion",
        "Druid Subclass",
        "Ability Score Improvement",
        "Wild Resurgence",
        "Elemental Fury",
        "Improved Elemental Fury",
        "Beast Spells",
        "Epic Boon",
        "Archdruid",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Druid class feature extraction is incomplete")
    return features


def extract_circle_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Circle of the Land"
    )
    features = _level_features(
        nodes, start + 1, len(nodes), "srd521.subclass-feature.druid.circle-of-the-land"
    )
    expected = {
        "Circle of the Land Spells",
        "Land’s Aid",
        "Natural Recovery",
        "Nature’s Ward",
        "Nature’s Sanctuary",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Circle of the Land feature extraction is incomplete")
    return features


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    spells: dict[str, dict[str, Any]] = {}
    current_level: int | None = None
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Druid Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        r"(?P<special>[CRM](?:, [CRM])*|[—–])(?= [A-Z]|$)"
    )
    for node in document["nodes"]:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match is not None:
                current_level = int(match.group("level") or 0)
            elif node["normalizedText"] == "Druid Subclass:":
                break
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
    if len(spells) < 100:
        raise ValueError(f"Druid spell list is unexpectedly short: {len(spells)} entries")
    missing = set(REPRESENTATIVE_SPELLS) - spells.keys()
    if missing:
        raise ValueError(f"Representative spells missing from Druid list: {sorted(missing)}")
    return spells


def extract_spell_entities(
    document: dict[str, Any], spell_list: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    starts: list[tuple[int, str, tuple[int, str, list[str]]]] = []
    for index, node in enumerate(nodes[:-1]):
        if node["kind"] != "HeadingNode" or nodes[index + 1]["kind"] != "ParagraphNode":
            continue
        signature = _spell_signature(str(nodes[index + 1]["normalizedText"]))
        if signature is not None:
            starts.append((index, str(node["normalizedText"]), signature))
    entities: list[dict[str, Any]] = []
    for position, (start, name, signature) in enumerate(starts):
        if name not in EXTRACTED_SPELLS:
            continue
        end = starts[position + 1][0] if position + 1 < len(starts) else len(nodes)
        section = [node for node in nodes[start:end] if node["kind"] != "MetadataNode"]
        metadata_nodes: list[dict[str, Any]] = []
        description_nodes: list[dict[str, Any]] = []
        for node in section[2:]:
            if node["kind"] == "HeadingNode" and (
                not description_nodes
                or str(node["normalizedText"]).startswith(("hit ", "which ", "plus "))
            ):
                metadata_nodes.append(node)
            else:
                description_nodes.append(node)
        casting = _parse_casting_metadata(
            " ".join(str(node["normalizedText"]) for node in metadata_nodes)
        )
        description = " ".join(str(node["normalizedText"]) for node in description_nodes)
        level, school, classes = signature
        list_entry = spell_list.get(name)
        if list_entry is not None and (
            level != list_entry["level"] or school != list_entry["school"]
        ):
            raise ValueError(f"{name} description disagrees with the Druid spell list")
        body = {
            "level": level,
            "school": school,
            "classes": classes,
            "druidSpell": list_entry is not None,
            "ritual": False if list_entry is None else list_entry["ritual"],
            **casting,
            "attackType": (
                "ranged"
                if "ranged spell attack" in description
                else "melee"
                if "melee spell attack" in description
                else None
            ),
            "savingThrows": sorted(
                {
                    match.group("ability").casefold()
                    for match in re.finditer(
                        rf"(?P<ability>{'|'.join(ABILITIES)}) saving throw", description
                    )
                }
            ),
            "damage": [
                {
                    "diceCount": int(match.group("count")),
                    "diceSize": int(match.group("size")),
                    "type": match.group("type").casefold(),
                }
                for match in re.finditer(
                    r"(?P<count>\d+)d(?P<size>\d+) (?P<type>[A-Z][a-z]+) damage",
                    description,
                )
            ],
            "healing": [],
            "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
            "description": description,
        }
        entities.append(
            {
                "id": f"srd521.spell.{_slug(name)}" if list_entry is None else list_entry["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "druid"],
                "source": _source_spans(section),
                "body": body,
                "rules": [],
                "review": _review("Druid or Circle spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(EXTRACTED_SPELLS):
        raise ValueError("Druid and Circle spell description extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "druid"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Druid description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.druid.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.druid.starting-equipment.a",
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
                        "entityId": "srd521.equipment.shield",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.sickle",
                        "quantity": 1,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.quarterstaff",
                        "quantity": 1,
                        "equipped": True,
                        "label": "Druidic Focus (Quarterstaff)",
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.explorers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                    {"kind": "text", "name": "Herbalism Kit", "quantity": 1},
                ],
                "currencyGp": 9,
            },
            {
                "id": "srd521.option.class.druid.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 50,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[DruidProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = progression_feature_ids(
        features, ((row.level, row.feature_names) for row in progression)
    )
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Druid"},
        "tags": ["class", "druid", "spellcaster"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits.get("skillProficiencyChoice", {}),
                "countByLevel": {str(level): 2 for level in range(1, 9)},
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 8,
                "defaultAbilityScores": {
                    "strength": 13,
                    "dexterity": 10,
                    "constitution": 14,
                    "intelligence": 8,
                    "wisdom": 15,
                    "charisma": 12,
                },
                "defaultAbilityScoreImprovementAbility": "wisdom",
                "defaultClassSkillIds": [
                    "srd521.skill.animal-handling",
                    "srd521.skill.nature",
                ],
                "defaultGrantedFeatIds": [],
            },
            "spellcastingAbility": "wisdom",
            "spellPreparation": "full-list",
            "alwaysPreparedSpells": {"1": ["srd521.spell.speak-with-animals"]},
            "spellList": [
                entry["id"]
                for name, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "primalOrderChoice": {
                "id": PRIMAL_ORDER_CHOICE_ID,
                "level": 1,
                "minimum": 1,
                "maximum": 1,
                "options": [MAGICIAN_ID, WARDEN_ID],
            },
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": feature_ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "wildShape": row.wild_shape,
                    "cantrips": row.cantrips,
                    "preparedSpells": row.prepared_spells,
                    "spellSlots": {
                        str(level): count
                        for level, count in enumerate(row.spell_slots, start=1)
                        if count > 0
                    },
                }
                for row in progression
            ],
        },
        "rules": [],
        "review": _review("Druid progression and spellcasting table from pages 41–44."),
    }


def _primal_order_entities(feature: dict[str, Any]) -> list[dict[str, Any]]:
    common = {"source": feature["source"], "rules": []}
    return [
        {
            **common,
            "id": MAGICIAN_ID,
            "kind": "class-option",
            "name": {"en": "Magician"},
            "tags": ["class-option", "druid", "primal-order"],
            "body": {
                "choiceId": PRIMAL_ORDER_CHOICE_ID,
                "additionalCantrips": 1,
                "knowledgeCheckBonusAbility": "wisdom",
                "knowledgeChecks": ["arcana", "nature"],
            },
            "review": _review("Magician Primal Order option."),
        },
        {
            **common,
            "id": WARDEN_ID,
            "kind": "class-option",
            "name": {"en": "Warden"},
            "tags": ["class-option", "druid", "primal-order"],
            "body": {
                "choiceId": PRIMAL_ORDER_CHOICE_ID,
                "armorTraining": ["medium"],
                "weaponProficiencies": ["martial"],
            },
            "review": _review("Warden Primal Order option."),
        },
    ]


def _circle_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Circle of the Land"
    )
    intro = nodes[nodes.index(heading) + 1]
    spells_feature = next(
        feature for feature in features if feature["name"] == "Circle of the Land Spells"
    )
    always_prepared_choices: dict[str, dict[str, list[str]]] = {}
    option_entities: list[dict[str, Any]] = []
    for land_heading, option_id in LAND_OPTION_IDS.items():
        heading_node = next(
            node
            for node in spells_feature["bodyNodes"]
            if node["kind"] == "HeadingNode" and node["normalizedText"] == land_heading
        )
        heading_index = spells_feature["bodyNodes"].index(heading_node)
        table = next(
            node
            for node in spells_feature["bodyNodes"][heading_index + 1 :]
            if node["kind"] == "TableNode"
        )
        by_level: dict[str, list[str]] = {}
        for match in re.finditer(
            r"(?P<level>\d+) (?P<spells>.+?)(?= \d+ |$)", table["normalizedText"]
        ):
            if match.group("level") == "3" and match.group("spells").startswith("Druid Level"):
                continue
            by_level[match.group("level")] = [
                f"srd521.spell.{_slug(name.strip())}"
                for name in match.group("spells").removeprefix("Circle Spells ").split(",")
            ]
        always_prepared_choices[option_id] = by_level
        option_entities.append(
            {
                "id": option_id,
                "kind": "subclass-option",
                "name": {"en": land_heading.removesuffix(" Land")},
                "tags": ["subclass-option", "druid", "circle-of-the-land"],
                "source": _source_spans([heading_node, table]),
                "body": {"choiceId": LAND_CHOICE_ID, "alwaysPreparedSpells": by_level},
                "rules": [],
                "review": _review(f"{land_heading} Circle spell option."),
            }
        )
    feature_ids_by_level: dict[int, list[str]] = {}
    for feature in features:
        feature_ids_by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Circle of the Land"},
        "tags": ["subclass", "druid", "circle-of-the-land"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(feature_ids_by_level.items())
            ],
            "landChoice": {
                "id": LAND_CHOICE_ID,
                "level": 3,
                "minimum": 1,
                "maximum": 1,
                "options": list(LAND_OPTION_IDS.values()),
            },
            "alwaysPreparedSpells": {},
            "alwaysPreparedSpellChoices": always_prepared_choices,
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Circle of the Land subclass extracted from page 46."),
    }
    return [
        subclass,
        *option_entities,
        *[_feature_entity(feature, "subclass-feature") for feature in features],
    ]


def _rule_table(
    progression: tuple[DruidProgressionRow, ...], source: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": "srd521.table.druid.wild-shape",
        "kind": "rule-table",
        "name": {"en": "Druid Wild Shape Uses"},
        "tags": ["rule-table", "druid"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.wild_shape for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Druid Features table."),
    }


def _feature_ir(
    feature: dict[str, Any],
    proposed_rules: list[dict[str, Any]],
    *,
    kind: str = "class-feature",
    parent_id: str = CLASS_ID,
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature["id"],
        "kind": kind,
        "parentId": parent_id,
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
        "proposedRules": proposed_rules,
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Beast forms and targets remain player- or roll-assisted."],
        },
    }


def _wild_shape_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "wild-shape-resource",
                "type": "grant-resource",
                "target": WILD_SHAPE_ID,
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.druid.wild-shape",
                    "key": {"kind": "ref", "path": "classLevel.druid"},
                },
                "parameters": {
                    "recharge": [
                        {"event": "short-rest", "amount": 1},
                        {"event": "long-rest", "amount": "all"},
                    ]
                },
                "automationLevel": "state-automated",
            },
            {
                "id": "use-wild-shape",
                "type": "grant-action",
                "target": "action.wild-shape",
                "when": {"kind": "resourceAvailable", "resourceId": WILD_SHAPE_ID},
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": WILD_SHAPE_ID,
                },
                "automationLevel": "roll-assisted",
            },
        ],
    )


def _resource_action_ir(
    feature: dict[str, Any], action: str, *, kind: str = "class-feature", parent_id: str = CLASS_ID
) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": f"use-{action}",
                "type": "grant-action",
                "target": f"action.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": WILD_SHAPE_ID},
                "parameters": {
                    "actionEconomy": "magic-action",
                    "spends": 1,
                    "resourceId": WILD_SHAPE_ID,
                },
                "automationLevel": "roll-assisted",
            }
        ],
        kind=kind,
        parent_id=parent_id,
    )


def generate_druid_content(
    class_extraction_root: Path, spell_extraction_root: Path, output: Path
) -> dict[str, Any]:
    class_document = read_json(class_extraction_root / "normalized" / "document.json")
    spell_document = read_json(spell_extraction_root / "normalized" / "document.json")
    raw_page = read_json(class_extraction_root / "raw" / "pages" / "0041.json")
    core_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "left-column-table"
    )
    equipment_heading = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Starting Equipment"
    )
    equipment_node = class_document["nodes"][class_document["nodes"].index(equipment_heading) + 1]
    progression_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "full-width-table"
    )
    traits = parse_core_traits(core_node["normalizedText"], equipment_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(class_document)
    circle_features = extract_circle_features(class_document)
    spell_list = parse_spell_list(class_document)
    spell_entities = extract_spell_entities(spell_document, spell_list)
    progression_source = _source_spans([progression_node])[0]
    class_entity = _class_entity(
        traits,
        progression,
        features,
        spell_list,
        _source_spans([core_node, equipment_heading, equipment_node, progression_node]),
    )
    primal_order = next(feature for feature in features if feature["name"] == "Primal Order")
    wild_shape = next(feature for feature in features if feature["name"] == "Wild Shape")
    wild_companion = next(feature for feature in features if feature["name"] == "Wild Companion")
    lands_aid = next(feature for feature in circle_features if feature["name"] == "Land’s Aid")
    druid_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        *_primal_order_entities(primal_order),
        _rule_table(progression, progression_source),
        *_circle_entities(class_document, circle_features),
        *spell_entities,
    ]
    natural_recovery = next(
        feature for feature in circle_features if feature["name"] == "Natural Recovery"
    )
    recovery_id = "srd521.resource.druid.natural-recovery"
    free_id = "srd521.resource.druid.natural-recovery-free-cast"
    for entity in druid_entities:
        if entity["id"] == natural_recovery["id"]:
            entity["body"]["spellSlotRecovery"] = {
                "classId": CLASS_ID,
                "resourceId": recovery_id,
                "levelDivisor": 2,
                "maximumSlotLevel": 5,
                "event": "short-rest",
            }
            entity["body"]["freeSpellCasting"] = {
                "classId": CLASS_ID,
                "resourceId": free_id,
                "optionChoiceId": "srd521.choice.druid.circle-of-land",
            }
            entity["body"]["automationLevel"] = "state-automated"
    fury = next(feature for feature in features if feature["name"] == "Elemental Fury")
    choice, options = battle_blessing_choice(
        fury,
        CLASS_ID,
        "elemental-fury",
        "Primal Strike",
        ["cold", "fire", "lightning", "thunder"],
        beast_attacks=True,
    )
    druid_entities[0]["body"]["elementalFuryChoice"] = choice
    druid_entities.extend(options)
    existing = read_json(output / "entities.json")
    replacements = {entity["id"]: entity for entity in druid_entities if entity["kind"] != "spell"}
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in druid_entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "druid.json", druid_entities)
    write_json(output / "entities.json", all_entities)
    write_json(output / "authoring-ir" / "druid.wild-shape.json", _wild_shape_ir(wild_shape))
    write_json(
        output / "authoring-ir" / "circle-of-the-land.natural-recovery.json",
        recovery_resource_ir(
            natural_recovery, SUBCLASS_ID, [recovery_id, free_id], kind="subclass-feature"
        ),
    )
    write_json(
        output / "authoring-ir" / "druid.wild-companion.json",
        _resource_action_ir(wild_companion, "wild-companion"),
    )
    write_json(
        output / "authoring-ir" / "circle-of-the-land.lands-aid.json",
        _resource_action_ir(lands_aid, "lands-aid", kind="subclass-feature", parent_id=SUBCLASS_ID),
    )
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedCircleFeatures": len(circle_features),
        "druidSpellListEntries": len(spell_list),
        "representativeSpells": [entity["id"] for entity in spell_entities],
        "generatedEntities": [entity["id"] for entity in druid_entities],
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "druid-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_druid_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Druid entities; "
        f"{report['druidSpellListEntries']} Druid-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

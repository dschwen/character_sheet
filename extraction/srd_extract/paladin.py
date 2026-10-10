"""Parse the Paladin class, Oath of Devotion, and representative sacred spells."""

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
from srd_extract.wizard import (
    ABILITIES,
    SCHOOLS,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)

CLASS_ID = "srd521.class.paladin"
SUBCLASS_ID = "srd521.subclass.paladin.oath-of-devotion"
LAY_ON_HANDS_ID = "srd521.resource.paladin.lay-on-hands"
CHANNEL_DIVINITY_ID = "srd521.resource.paladin.channel-divinity"
SMITE_USE_ID = "srd521.resource.paladin.free-divine-smite"
STEED_USE_ID = "srd521.resource.paladin.free-find-steed"
DEFENSE_ID = "srd521.feat.fighting-style.defense"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
REPRESENTATIVE_SPELLS = (
    "Divine Smite",
    "Find Steed",
    "Heroism",
    "Protection from Evil and Good",
    "Zone of Truth",
)


@dataclass(frozen=True, slots=True)
class PaladinProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    channel_divinity: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Paladin level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 5:
            raise ValueError("Paladin progression rows require all five spell-slot columns")


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
        r"Core Paladin Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Paladin level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Armor Training (?P<armor>.+?) Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Paladin Traits table does not match the expected labels")
    return {
        "primaryAbilities": [
            value.strip().casefold() for value in match.group("primary").split(" and ")
        ],
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
        "weaponProficiencies": ["simple", "martial"],
        "armorTraining": ["light", "medium", "heavy", "shield"],
        "startingEquipmentText": match.group("equipment"),
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[PaladinProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 400 <= float(word["bbox"][1]) < 720
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Paladin progression table does not contain exactly levels 1–20")
    slot_boundaries = (395, 423, 452, 481, 510, 540)
    rows: list[PaladinProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 725
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 545
        ]
        feature_text = _column_text(row, 145, 300)
        channel_text = _column_text(row, 300, 345)
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            PaladinProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                channel_divinity=0 if channel_text == "—" else int(channel_text),
                prepared_spells=int(_column_text(row, 345, 395)),
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
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Level 1: Lay On Hands"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Paladin Spell List"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.paladin")
    expected = {
        "Lay On Hands",
        "Spellcasting",
        "Weapon Mastery",
        "Fighting Style",
        "Paladin’s Smite",
        "Channel Divinity",
        "Paladin Subclass",
        "Ability Score Improvement",
        "Extra Attack",
        "Faithful Steed",
        "Aura of Protection",
        "Abjure Foes",
        "Aura of Courage",
        "Radiant Strikes",
        "Restoring Touch",
        "Aura Expansion",
        "Epic Boon",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Paladin class feature extraction is incomplete")
    return features


def extract_devotion_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Paladin Subclass: Oath of Devotion"
    )
    end = next(
        index
        for index, node in enumerate(nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger"
    )
    features = _level_features(
        nodes, start + 1, end, "srd521.subclass-feature.paladin.oath-of-devotion"
    )
    expected = {
        "Oath of Devotion Spells",
        "Sacred Weapon",
        "Aura of Devotion",
        "Smite of Protection",
        "Holy Nimbus",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Oath of Devotion feature extraction is incomplete")
    return features


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    spells: dict[str, dict[str, Any]] = {}
    current_level: int | None = None
    level_pattern = re.compile(r"^Level (?P<level>\d+) Paladin Spells$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        r"(?P<special>[CRM](?:, [CRM])*|[—–])(?= [A-Z]|$)"
    )
    for node in document["nodes"]:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match is not None:
                current_level = int(match.group("level"))
            elif node["normalizedText"] == "Paladin Subclass: Oath of Devotion":
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
    if len(spells) < 30:
        raise ValueError(f"Paladin spell list is unexpectedly short: {len(spells)} entries")
    missing = set(REPRESENTATIVE_SPELLS) - spells.keys()
    if missing:
        raise ValueError(f"Representative spells missing from Paladin list: {sorted(missing)}")
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
        if name not in REPRESENTATIVE_SPELLS:
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
        list_entry = spell_list[name]
        if level != list_entry["level"] or school != list_entry["school"]:
            raise ValueError(f"{name} description disagrees with the Paladin spell list")
        body = {
            "level": level,
            "school": school,
            "classes": classes,
            "paladinSpell": True,
            "ritual": list_entry["ritual"],
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
                "id": list_entry["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "paladin"],
                "source": _source_spans(section),
                "body": body,
                "rules": [],
                "review": _review("Representative Paladin spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Paladin spell description extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "paladin"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Paladin description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.paladin.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.paladin.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.armor.heavy.chain-mail",
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
                        "entityId": "srd521.equipment.weapon.longsword",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.javelin",
                        "quantity": 6,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.holy-symbol",
                        "quantity": 1,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.priests-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 9,
            },
            {
                "id": "srd521.option.class.paladin.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 150,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[PaladinProgressionRow, ...],
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
        "name": {"en": "Paladin"},
        "tags": ["class", "paladin", "spellcaster", "martial"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 2 for level in range(1, 9)},
            },
            "weaponMasteryChoice": {
                "categories": ["simple", "martial"],
                "attackTypes": ["melee", "ranged"],
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 8,
                "defaultAbilityScores": {
                    "strength": 15,
                    "dexterity": 8,
                    "constitution": 14,
                    "intelligence": 8,
                    "wisdom": 10,
                    "charisma": 15,
                },
                "defaultAbilityScoreImprovementAbility": "charisma",
                "defaultClassSkillIds": [
                    "srd521.skill.insight",
                    "srd521.skill.persuasion",
                ],
                "defaultGrantedFeatIds": [],
            },
            "fightingStyleChoice": {
                "id": "srd521.choice.paladin.fighting-style",
                "level": 2,
                "minimum": 1,
                "maximum": 1,
                "options": [DEFENSE_ID],
            },
            "spellcastingAbility": "charisma",
            "spellPreparation": "full-list",
            "alwaysPreparedSpells": {
                "2": ["srd521.spell.divine-smite"],
                "5": ["srd521.spell.find-steed"],
            },
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
                        {"name": name, "entityId": feature_ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "weaponMastery": 2,
                    "channelDivinity": row.channel_divinity,
                    "cantrips": 0,
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
        "review": _review("Paladin progression and spellcasting table from pages 53–55."),
    }


def _subclass_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Paladin Subclass: Oath of Devotion"
    )
    intro = nodes[nodes.index(heading) + 1]
    spells_feature = next(
        feature for feature in features if feature["name"] == "Oath of Devotion Spells"
    )
    table = next(node for node in spells_feature["bodyNodes"] if node["kind"] == "TableNode")
    always_prepared: dict[str, list[str]] = {}
    for match in re.finditer(r"(?P<level>\d+) (?P<spells>.+?)(?= \d+ |$)", table["normalizedText"]):
        always_prepared[match.group("level")] = [
            f"srd521.spell.{_slug(name.strip())}" for name in match.group("spells").split(",")
        ]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Oath of Devotion"},
        "tags": ["subclass", "paladin", "oath-of-devotion"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(by_level.items())
            ],
            "alwaysPreparedSpells": always_prepared,
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Oath of Devotion subclass extracted from page 56."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _rule_table(
    progression: tuple[PaladinProgressionRow, ...],
    source: dict[str, Any],
    field: str,
    name: str,
) -> dict[str, Any]:
    entries = {
        str(row.level): 5 * row.level if field == "lay-on-hands" else row.channel_divinity
        for row in progression
    }
    return {
        "id": f"srd521.table.paladin.{field}",
        "kind": "rule-table",
        "name": {"en": name},
        "tags": ["rule-table", "paladin"],
        "source": [source],
        "body": {"keyType": "class-level", "valueType": "integer", "entries": entries},
        "rules": [],
        "review": _review("Extracted from the Paladin class progression and feature text."),
    }


def _feature_ir(
    feature: dict[str, Any],
    rules: list[dict[str, Any]],
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
        "proposedRules": rules,
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Targets, attack triggers, and applied conditions remain assisted."],
        },
    }


def _lay_on_hands_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "lay-on-hands-resource",
                "type": "grant-resource",
                "target": LAY_ON_HANDS_ID,
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.paladin.lay-on-hands",
                    "key": {"kind": "ref", "path": "classLevel.paladin"},
                },
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": "use-lay-on-hands",
                "type": "grant-action",
                "target": "action.lay-on-hands",
                "when": {"kind": "resourceAvailable", "resourceId": LAY_ON_HANDS_ID},
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "resourceId": LAY_ON_HANDS_ID,
                    "variableSpend": {"minimum": 1},
                    "healing": {"perResourcePoint": 1},
                },
                "automationLevel": "state-automated",
            },
        ],
    )


def _channel_divinity_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "channel-divinity-resource",
                "type": "grant-resource",
                "target": CHANNEL_DIVINITY_ID,
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.paladin.channel-divinity",
                    "key": {"kind": "ref", "path": "classLevel.paladin"},
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
                "id": "use-divine-sense",
                "type": "grant-action",
                "target": "action.divine-sense",
                "when": {"kind": "resourceAvailable", "resourceId": CHANNEL_DIVINITY_ID},
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": CHANNEL_DIVINITY_ID,
                },
                "automationLevel": "roll-assisted",
            },
        ],
    )


def _sacred_weapon_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "use-sacred-weapon",
                "type": "grant-action",
                "target": "action.sacred-weapon",
                "when": {"kind": "resourceAvailable", "resourceId": CHANNEL_DIVINITY_ID},
                "parameters": {
                    "actionEconomy": "part-of-attack-action",
                    "spends": 1,
                    "resourceId": CHANNEL_DIVINITY_ID,
                },
                "automationLevel": "roll-assisted",
            }
        ],
        kind="subclass-feature",
        parent_id=SUBCLASS_ID,
    )


def _free_spell_ir(
    feature: dict[str, Any], resource_id: str, action: str, economy: str
) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": f"{action}-resource",
                "type": "grant-resource",
                "target": resource_id,
                "expression": {"kind": "literal", "value": 1},
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": f"use-{action}",
                "type": "grant-action",
                "target": f"action.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": resource_id},
                "parameters": {
                    "actionEconomy": economy,
                    "spends": 1,
                    "resourceId": resource_id,
                },
                "automationLevel": "roll-assisted",
            },
        ],
    )


def _extra_attack_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "paladin-extra-attack",
                "type": "set-attack-count",
                "target": "attackAction.attacks",
                "expression": {"kind": "literal", "value": 2},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
    )


def generate_paladin_content(
    class_extraction_root: Path, spell_extraction_root: Path, output: Path
) -> dict[str, Any]:
    class_document = read_json(class_extraction_root / "normalized" / "document.json")
    spell_document = read_json(spell_extraction_root / "normalized" / "document.json")
    raw_page = read_json(class_extraction_root / "raw" / "pages" / "0053.json")
    core_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Paladin Traits")
    )
    progression_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and "Spell Slots per Spell Level" in node["normalizedText"]
    )
    traits = parse_core_traits(core_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(class_document)
    devotion_features = extract_devotion_features(class_document)
    spell_list = parse_spell_list(class_document)
    spell_entities = extract_spell_entities(spell_document, spell_list)
    progression_source = _source_spans([progression_node])[0]
    class_entity = _class_entity(
        traits,
        progression,
        features,
        spell_list,
        _source_spans([core_node, progression_node]),
    )
    paladin_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        _rule_table(progression, progression_source, "lay-on-hands", "Paladin Lay On Hands Pool"),
        _rule_table(
            progression, progression_source, "channel-divinity", "Paladin Channel Divinity Uses"
        ),
        *_subclass_entities(class_document, devotion_features),
        *spell_entities,
    ]
    aura = next(
        entity
        for entity in paladin_entities
        if entity["id"] == "srd521.class-feature.paladin.aura-of-protection"
    )
    status_id = "srd521.status.feature.aura-of-protection"
    aura_id = "srd521.aura.protection"
    aura["body"]["savingThrowAura"] = {
        "auraId": aura_id,
        "ability": "charisma",
        "minimumBonus": 1,
        "radiusFeet": 10,
        "recipientStatusId": status_id,
        "inactiveConditionIds": ["srd521.condition.incapacitated"],
    }
    aura["body"]["automationLevel"] = "sheet-automated"
    devotion = next(
        entity
        for entity in paladin_entities
        if entity["id"] == "srd521.subclass-feature.paladin.oath-of-devotion.aura-of-devotion"
    )
    devotion_status_id = "srd521.status.feature.aura-of-devotion"
    devotion["body"]["auraConditionImmunities"] = [
        {
            "auraId": aura_id,
            "conditionIds": ["srd521.condition.charmed"],
            "recipientStatusId": devotion_status_id,
        }
    ]
    devotion["body"]["automationLevel"] = "sheet-automated"
    paladin_entities.append(
        {
            "id": devotion_status_id,
            "kind": "status",
            "name": {"en": "Aura of Devotion (other Paladin)"},
            "tags": ["status", "aura", "paladin"],
            "source": devotion["source"],
            "body": {
                "sourceFeatureId": devotion["id"],
                "description": devotion["body"]["text"],
                "duration": "While inside an active Devotion Paladin's Aura of Protection",
                "concentration": False,
                "conditionImmunities": ["srd521.condition.charmed"],
                "assistedInstructions": [
                    "Set this status on allies inside a level-7 or higher Devotion Paladin's "
                    "active Aura of Protection.",
                    "Remove it when leaving the aura or when its Paladin is Incapacitated. "
                    "Recipient Incapacitation does not end this protection.",
                    "Charmed is suppressed, not removed. Leave the condition recorded if its "
                    "duration has not ended.",
                    "Set Aura of Protection separately with the chosen Paladin's saving-throw "
                    "bonus; this toggle grants no save bonus.",
                ],
                "automationLevel": "sheet-automated",
            },
            "rules": [],
            "review": _review(
                "Source-linked Aura of Devotion recipient toggle; range and source status "
                "are declared manually."
            ),
        }
    )
    paladin_entities.append(
        {
            "id": status_id,
            "kind": "status",
            "name": {"en": "Aura of Protection (chosen other Paladin)"},
            "tags": ["status", "aura", "paladin"],
            "source": aura["source"],
            "body": {
                "sourceFeatureId": aura["id"],
                "description": aura["body"]["text"],
                "duration": "While inside the chosen conscious Paladin's aura",
                "concentration": False,
                "savingThrowAuraRecipient": {
                    "auraId": aura_id,
                    "selectionLabel": "Chosen Paladin's save bonus (Charisma modifier, minimum +1)",
                    "minimum": 1,
                    "maximum": 10,
                },
                "assistedInstructions": [
                    "Set the chosen Paladin's bonus and stay within their aura's range.",
                    "Remove this status when leaving the aura or when its Paladin "
                    "is Incapacitated.",
                    "Only one Aura of Protection applies; this selection replaces "
                    "your own aura's bonus.",
                ],
                "automationLevel": "sheet-automated",
            },
            "rules": [],
            "review": _review("Source-linked recipient toggle for Aura of Protection."),
        }
    )
    existing = read_json(output / "entities.json")
    replacements = {
        entity["id"]: entity for entity in paladin_entities if entity["kind"] != "spell"
    }
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in paladin_entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "paladin.json", paladin_entities)
    write_json(output / "entities.json", all_entities)
    by_name = {feature["name"]: feature for feature in features}
    sacred_weapon = next(
        feature for feature in devotion_features if feature["name"] == "Sacred Weapon"
    )
    authoring = {
        "paladin.lay-on-hands.json": _lay_on_hands_ir(by_name["Lay On Hands"]),
        "paladin.channel-divinity.json": _channel_divinity_ir(by_name["Channel Divinity"]),
        "oath-of-devotion.sacred-weapon.json": _sacred_weapon_ir(sacred_weapon),
        "paladin.smite.json": _free_spell_ir(
            by_name["Paladin’s Smite"], SMITE_USE_ID, "free-divine-smite", "on-hit"
        ),
        "paladin.extra-attack.json": _extra_attack_ir(by_name["Extra Attack"]),
        "paladin.faithful-steed.json": _free_spell_ir(
            by_name["Faithful Steed"], STEED_USE_ID, "free-find-steed", "magic-action"
        ),
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
        "extractedDevotionFeatures": len(devotion_features),
        "paladinSpellListEntries": len(spell_list),
        "representativeSpells": [entity["id"] for entity in spell_entities],
        "generatedEntities": [entity["id"] for entity in paladin_entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "paladin-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_paladin_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Paladin entities; "
        f"{report['paladinSpellListEntries']} Paladin-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

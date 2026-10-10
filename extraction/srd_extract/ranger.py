"""Parse the Ranger class, Hunter subclass, and representative wilderness spells."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.wizard import (
    ABILITIES,
    SCHOOLS,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)

CLASS_ID = "srd521.class.ranger"
SUBCLASS_ID = "srd521.subclass.ranger.hunter"
FAVORED_ENEMY_ID = "srd521.resource.ranger.favored-enemy"
HUNTERS_PREY_CHOICE_ID = "srd521.choice.ranger.hunters-prey"
COLOSSUS_SLAYER_ID = "srd521.option.ranger.hunters-prey.colossus-slayer"
HORDE_BREAKER_ID = "srd521.option.ranger.hunters-prey.horde-breaker"
DEFENSIVE_TACTICS_CHOICE_ID = "srd521.choice.ranger.defensive-tactics"
ESCAPE_THE_HORDE_ID = "srd521.option.ranger.defensive-tactics.escape-the-horde"
MULTIATTACK_DEFENSE_ID = "srd521.option.ranger.defensive-tactics.multiattack-defense"
DEFENSE_ID = "srd521.feat.fighting-style.defense"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
REPRESENTATIVE_SPELLS = (
    "Ensnaring Strike",
    "Goodberry",
    "Hunter’s Mark",
    "Longstrider",
    "Spike Growth",
)


@dataclass(frozen=True, slots=True)
class RangerProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    favored_enemy: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Ranger level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 5:
            raise ValueError("Ranger progression rows require all five spell-slot columns")


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
        r"Core Ranger Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Ranger level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Armor Training (?P<armor>.+?) Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Ranger Traits table does not match the expected labels")
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
        "armorTraining": ["light", "medium", "shield"],
        "startingEquipmentText": match.group("equipment"),
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[RangerProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 60 <= float(word["bbox"][1]) < 400
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Ranger progression table does not contain exactly levels 1–20")
    slot_boundaries = (395, 423, 452, 481, 510, 540)
    rows: list[RangerProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 400
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 545
        ]
        feature_text = _column_text(row, 145, 315)
        favored_enemy_text = _column_text(row, 315, 350)
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            RangerProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                favored_enemy=int(favored_enemy_text),
                prepared_spells=int(_column_text(row, 350, 395)),
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
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger Spell List"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.ranger")
    expected = {
        "Spellcasting",
        "Favored Enemy",
        "Weapon Mastery",
        "Deft Explorer",
        "Fighting Style",
        "Ranger Subclass",
        "Ability Score Improvement",
        "Extra Attack",
        "Roving",
        "Expertise",
        "Tireless",
        "Relentless Hunter",
        "Nature’s Veil",
        "Precise Hunter",
        "Feral Senses",
        "Epic Boon",
        "Foe Slayer",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Ranger class feature extraction is incomplete")
    return features


def extract_hunter_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger Subclass: Hunter"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Rogue"
    )
    features = _level_features(nodes, start, end, "srd521.subclass-feature.ranger.hunter")
    expected = {
        "Hunter’s Lore",
        "Hunter’s Prey",
        "Defensive Tactics",
        "Superior Hunter’s Prey",
        "Superior Hunter’s Defense",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Hunter subclass feature extraction is incomplete")
    return features


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger Spell List"
    )
    end = next(
        index
        for index, node in enumerate(nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger Subclass: Hunter"
    )
    level_pattern = re.compile(r"^Level (?P<level>\d+) Ranger Spells$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        rf"(?P<special>(?:C(?:, [RM])?|R|M|—))"
        rf"(?= .+? (?:{'|'.join(SCHOOLS)}) |$)"
    )
    current_level: int | None = None
    spells: dict[str, dict[str, Any]] = {}
    for node in nodes[start + 1 : end]:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match is not None:
                current_level = int(match.group("level"))
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
    if len(spells) != 48:
        raise ValueError(f"Ranger spell list must contain 48 entries, found {len(spells)}")
    missing = set(REPRESENTATIVE_SPELLS) - spells.keys()
    if missing:
        raise ValueError(f"Representative spells missing from Ranger list: {sorted(missing)}")
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
            raise ValueError(f"{name} description disagrees with the Ranger spell list")
        body = {
            "level": level,
            "school": school,
            "classes": classes,
            "rangerSpell": True,
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
                    r"(?P<count>\d+)d(?P<size>\d+) (?P<type>[A-Z][a-z]+) damage", description
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
                "tags": ["spell", f"level-{level}", school, "ranger"],
                "source": _source_spans(section),
                "body": body,
                "rules": [],
                "review": _review("Representative Ranger spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Ranger spell description extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "ranger"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Ranger description."),
    }


def _preserve_spell_annotations(
    entities: list[dict[str, Any]], existing: list[dict[str, Any]]
) -> None:
    """Refresh parsed fields without dropping independently authored spell metadata."""
    by_id = {entity["id"]: entity for entity in existing}
    for entity in entities:
        previous = by_id.get(entity["id"])
        if entity["kind"] == "spell" and previous is not None:
            entity["body"] = {**previous["body"], **entity["body"]}


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.ranger.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.ranger.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.armor.light.studded-leather-armor",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.scimitar",
                        "quantity": 1,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.shortsword",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.longbow",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.ammunition.arrows",
                        "quantity": 20,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.quiver",
                        "quantity": 1,
                        "equipped": False,
                    },
                    {
                        "kind": "text",
                        "name": "Druidic Focus (sprig of mistletoe)",
                        "quantity": 1,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.explorers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 7,
            },
            {
                "id": "srd521.option.class.ranger.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 150,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[RangerProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Ranger"},
        "tags": ["class", "ranger", "spellcaster", "martial"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 3 for level in range(1, 8)},
            },
            "weaponMasteryChoice": {
                "categories": ["simple", "martial"],
                "attackTypes": ["melee", "ranged"],
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 7,
                "defaultAbilityScores": {
                    "strength": 10,
                    "dexterity": 15,
                    "constitution": 13,
                    "intelligence": 8,
                    "wisdom": 15,
                    "charisma": 10,
                },
                "defaultAbilityScoreImprovementAbility": "wisdom",
                "defaultClassSkillIds": [
                    "srd521.skill.perception",
                    "srd521.skill.stealth",
                    "srd521.skill.survival",
                ],
                "defaultGrantedFeatIds": [],
                "expertiseChoice": {
                    "sourceId": "srd521.class-feature.ranger.deft-explorer",
                    "minimumLevel": 2,
                    "eligibleSkillIds": [
                        "srd521.skill.acrobatics",
                        "srd521.skill.animal-handling",
                        "srd521.skill.arcana",
                        "srd521.skill.athletics",
                        "srd521.skill.deception",
                        "srd521.skill.history",
                        "srd521.skill.insight",
                        "srd521.skill.intimidation",
                        "srd521.skill.investigation",
                        "srd521.skill.medicine",
                        "srd521.skill.nature",
                        "srd521.skill.perception",
                        "srd521.skill.performance",
                        "srd521.skill.persuasion",
                        "srd521.skill.religion",
                        "srd521.skill.sleight-of-hand",
                        "srd521.skill.stealth",
                        "srd521.skill.survival",
                    ],
                    "requireClassProficiency": False,
                },
            },
            "fightingStyleChoice": {
                "id": "srd521.choice.ranger.fighting-style",
                "level": 2,
                "minimum": 1,
                "maximum": 1,
                "options": [DEFENSE_ID],
            },
            "spellcastingAbility": "wisdom",
            "spellPreparation": "full-list",
            "alwaysPreparedSpells": {"1": ["srd521.spell.hunter-s-mark"]},
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
                    "favoredEnemy": row.favored_enemy,
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
        "review": _review("Ranger progression and spellcasting table from pages 57–60."),
    }


def _hunter_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ranger Subclass: Hunter"
    )
    intro = nodes[nodes.index(heading) + 1]
    prey = next(feature for feature in features if feature["name"] == "Hunter’s Prey")
    tactics = next(feature for feature in features if feature["name"] == "Defensive Tactics")
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Hunter"},
        "tags": ["subclass", "ranger", "hunter"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(by_level.items())
            ],
            "huntersPreyChoice": {
                "id": HUNTERS_PREY_CHOICE_ID,
                "level": 3,
                "minimum": 1,
                "maximum": 1,
                "options": [COLOSSUS_SLAYER_ID, HORDE_BREAKER_ID],
                "changeOn": ["short-rest", "long-rest"],
                "optionSelection": {"sourceFeatureId": prey["id"]},
            },
            "defensiveTacticsChoice": {
                "id": DEFENSIVE_TACTICS_CHOICE_ID,
                "level": 7,
                "minimum": 1,
                "maximum": 1,
                "options": [ESCAPE_THE_HORDE_ID, MULTIATTACK_DEFENSE_ID],
                "defaultOptionIds": [ESCAPE_THE_HORDE_ID],
                "changeOn": ["short-rest", "long-rest"],
                "optionSelection": {"sourceFeatureId": tactics["id"]},
            },
            "alwaysPreparedSpells": {},
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Hunter subclass extracted from page 61."),
    }
    common = {"source": prey["source"], "rules": []}
    options = [
        *[
            {
                "id": option_id,
                "kind": "subclass-option",
                "name": {"en": name},
                "tags": ["subclass-option", "ranger", "hunter", "defensive-tactics"],
                "source": tactics["source"],
                "body": {
                    "choiceId": DEFENSIVE_TACTICS_CHOICE_ID,
                    "automationLevel": "assisted",
                    "description": description,
                },
                "rules": [],
                "review": _review(f"{name}: incoming attacks are adjudicated manually."),
            }
            for option_id, name, description in [
                (
                    ESCAPE_THE_HORDE_ID,
                    "Escape the Horde",
                    "Opportunity Attacks have Disadvantage against you. "
                    "Ask the attacker to apply this; enemy rolls are not tracked here.",
                ),
                (
                    MULTIATTACK_DEFENSE_ID,
                    "Multiattack Defense",
                    "When a creature hits you with an attack roll, that creature has "
                    "Disadvantage on all other attack rolls against you this turn. "
                    "Track the creature and end of turn manually; the first attack is unaffected.",
                ),
            ]
        ],
        {
            **common,
            "id": COLOSSUS_SLAYER_ID,
            "kind": "subclass-option",
            "name": {"en": "Colossus Slayer"},
            "tags": ["subclass-option", "ranger", "hunter", "hunters-prey"],
            "body": {
                "choiceId": HUNTERS_PREY_CHOICE_ID,
                "extraDamage": {"diceCount": 1, "diceSize": 8},
                "trigger": "weapon-hit-against-damaged-target",
                "frequency": "once-per-turn",
            },
            "review": _review("Colossus Slayer Hunter’s Prey option."),
        },
        {
            **common,
            "id": HORDE_BREAKER_ID,
            "kind": "subclass-option",
            "name": {"en": "Horde Breaker"},
            "tags": ["subclass-option", "ranger", "hunter", "hunters-prey"],
            "body": {
                "choiceId": HUNTERS_PREY_CHOICE_ID,
                "grantsAttack": 1,
                "trigger": "weapon-attack-against-adjacent-second-target",
                "frequency": "once-per-turn",
            },
            "review": _review("Horde Breaker Hunter’s Prey option."),
        },
    ]
    return [
        subclass,
        *options,
        *[_feature_entity(feature, "subclass-feature") for feature in features],
    ]


def _favored_enemy_table(
    progression: tuple[RangerProgressionRow, ...], source: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": "srd521.table.ranger.favored-enemy",
        "kind": "rule-table",
        "name": {"en": "Ranger Favored Enemy Uses"},
        "tags": ["rule-table", "ranger"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.favored_enemy for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Ranger class progression table."),
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
            "notes": ["Targets and situational attack requirements remain assisted."],
        },
    }


def _favored_enemy_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "favored-enemy-resource",
                "type": "grant-resource",
                "target": FAVORED_ENEMY_ID,
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.ranger.favored-enemy",
                    "key": {"kind": "ref", "path": "classLevel.ranger"},
                },
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": "use-favored-enemy",
                "type": "grant-action",
                "target": "action.free-hunters-mark",
                "when": {"kind": "resourceAvailable", "resourceId": FAVORED_ENEMY_ID},
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": FAVORED_ENEMY_ID,
                    "spellId": "srd521.spell.hunter-s-mark",
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
                "id": "ranger-extra-attack",
                "type": "set-attack-count",
                "target": "attackAction.attacks",
                "expression": {"kind": "literal", "value": 2},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
    )


def _roving_ir(feature: dict[str, Any]) -> dict[str, Any]:
    ir = _feature_ir(
        feature,
        [
            {
                "id": "ranger-roving-walking-speed",
                "type": "add-candidate-calculation",
                "target": "speed.walking",
                "when": {
                    "kind": "equals",
                    "left": {"kind": "ref", "path": "equipment.wearingHeavyArmor"},
                    "right": {"kind": "literal", "value": False},
                },
                "expression": {
                    "kind": "add",
                    "args": [
                        {"kind": "ref", "path": "speed.walking"},
                        {"kind": "literal", "value": 10},
                    ],
                },
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "ranger-roving-climb-speed",
                "type": "add-candidate-calculation",
                "target": "speed.climb",
                "expression": {"kind": "ref", "path": "speed.walking"},
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "ranger-roving-swim-speed",
                "type": "add-candidate-calculation",
                "target": "speed.swim",
                "expression": {"kind": "ref", "path": "speed.walking"},
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
        ],
    )
    ir["review"]["notes"] = [
        "Walking, Climb, and Swim speeds are calculated from the equipped armor state."
    ]
    return ir


def generate_ranger_content(
    class_extraction_root: Path, spell_extraction_root: Path, output: Path
) -> dict[str, Any]:
    class_document = read_json(class_extraction_root / "normalized" / "document.json")
    spell_document = read_json(spell_extraction_root / "normalized" / "document.json")
    raw_page = read_json(class_extraction_root / "raw" / "pages" / "0058.json")
    core_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Ranger Traits")
    )
    progression_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and "Spell Slots per Spell Level" in node["normalizedText"]
    )
    traits = parse_core_traits(core_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(class_document)
    hunter_features = extract_hunter_features(class_document)
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
    ranger_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        _favored_enemy_table(progression, progression_source),
        *_hunter_entities(class_document, hunter_features),
        *spell_entities,
    ]
    replacement_ids = {entity["id"] for entity in ranger_entities}
    current_entities = read_json(output / "entities.json")
    _preserve_spell_annotations(ranger_entities, current_entities)
    replacement_positions = [
        index for index, entity in enumerate(current_entities) if entity["id"] in replacement_ids
    ]
    insertion_index = min(replacement_positions, default=len(current_entities))
    existing = [entity for entity in current_entities if entity["id"] not in replacement_ids]
    all_entities = [
        *existing[:insertion_index],
        *ranger_entities,
        *existing[insertion_index:],
    ]
    write_json(output / "entities" / "ranger.json", ranger_entities)
    write_json(output / "entities.json", all_entities)
    by_name = {feature["name"]: feature for feature in features}
    authoring = {
        "ranger.favored-enemy.json": _favored_enemy_ir(by_name["Favored Enemy"]),
        "ranger.extra-attack.json": _extra_attack_ir(by_name["Extra Attack"]),
        "ranger.roving.json": _roving_ir(by_name["Roving"]),
    }
    for filename, ir in authoring.items():
        write_json(output / "authoring-ir" / filename, ir)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Cleric through level 5, Druid through level 5, Fighter through level 5, "
        "Monk through level 5, Paladin through level 5, Ranger through level 6, Wizard through "
        "level 5, Human, Soldier, equipment, and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedHunterFeatures": len(hunter_features),
        "rangerSpellListEntries": len(spell_list),
        "representativeSpells": [entity["id"] for entity in spell_entities],
        "generatedEntities": [entity["id"] for entity in ranger_entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "ranger-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_ranger_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Ranger entities; "
        f"{report['rangerSpellListEntries']} Ranger-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Parse the Cleric class, Life Domain, and representative divine spells."""

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

CLASS_ID = "srd521.class.cleric"
SUBCLASS_ID = "srd521.subclass.cleric.life-domain"
CHANNEL_DIVINITY_ID = "srd521.resource.cleric.channel-divinity"
DIVINE_ORDER_CHOICE_ID = "srd521.choice.cleric.divine-order"
PROTECTOR_ID = "srd521.option.cleric.divine-order.protector"
THAUMATURGE_ID = "srd521.option.cleric.divine-order.thaumaturge"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
REPRESENTATIVE_SPELLS = (
    "Guidance",
    "Sacred Flame",
    "Thaumaturgy",
    "Aid",
    "Bane",
    "Bless",
    "Cure Wounds",
    "Guiding Bolt",
    "Healing Word",
    "Hold Person",
    "Lesser Restoration",
    "Mass Healing Word",
    "Prayer of Healing",
    "Revivify",
    "Shield of Faith",
    "Spirit Guardians",
    "Spiritual Weapon",
)


@dataclass(frozen=True, slots=True)
class ClericProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    channel_divinity: int
    cantrips: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Cleric level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 9:
            raise ValueError("Cleric progression rows require all nine spell-slot columns")


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
        r"Core Cleric Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Cleric level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Armor Training (?P<armor>.+?) Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Cleric Traits table does not match the expected labels")
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
        "armorTraining": ["light", "medium", "shield"],
        "startingEquipmentText": match.group("equipment"),
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[ClericProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 55 <= float(word["bbox"][0]) < 80
        and 415 <= float(word["bbox"][1]) < 730
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Cleric progression table does not contain exactly levels 1–20")
    slot_boundaries = (390, 408, 426, 444, 462, 480, 498, 516, 534, 556)
    rows: list[ClericProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 725
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 50 <= float(word["bbox"][0]) <= 556
        ]
        feature_text = _column_text(row, 130, 255)
        features = (
            ()
            if feature_text == "—"
            else tuple(value.strip() for value in feature_text.split(",") if value.strip())
        )
        channel_text = _column_text(row, 255, 300)
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            ClericProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 90, 130).removeprefix("+")),
                feature_names=features,
                channel_divinity=0 if channel_text == "—" else int(channel_text),
                cantrips=int(_column_text(row, 300, 345)),
                prepared_spells=int(_column_text(row, 345, 390)),
                spell_slots=slots,
            )
        )
    return tuple(rows)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Cleric Spell List"
    )
    features: list[dict[str, Any]] = []
    for index, node in enumerate(nodes[:end]):
        if node["kind"] != "HeadingNode":
            continue
        match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if match is None:
            continue
        body_nodes: list[dict[str, Any]] = []
        for following in nodes[index + 1 : end]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] not in {"MetadataNode", "TableNode"}:
                body_nodes.append(following)
        if not body_nodes:
            raise ValueError(f"Cleric feature has no body: {node['normalizedText']}")
        name = match.group("name")
        features.append(
            {
                "id": f"srd521.class-feature.cleric.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": _source_spans([node, *body_nodes]),
            }
        )
    expected = {
        "Spellcasting",
        "Divine Order",
        "Channel Divinity",
        "Cleric Subclass",
        "Ability Score Improvement",
        "Sear Undead",
        "Blessed Strikes",
        "Divine Intervention",
        "Improved Blessed Strikes",
        "Epic Boon",
        "Greater Divine Intervention",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Cleric class feature extraction is incomplete")
    return tuple(features)


def extract_life_domain_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Cleric Subclass: Life Domain"
    )
    level_starts = [
        index
        for index, node in enumerate(nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and HEADING_PATTERN.fullmatch(node["normalizedText"])
    ]
    features: list[dict[str, Any]] = []
    for position, index in enumerate(level_starts):
        node = nodes[index]
        match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if match is None:
            continue
        end = level_starts[position + 1] if position + 1 < len(level_starts) else len(nodes)
        body_nodes = [
            following for following in nodes[index + 1 : end] if following["kind"] != "MetadataNode"
        ]
        name = match.group("name")
        features.append(
            {
                "id": f"srd521.subclass-feature.cleric.life-domain.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": _source_spans([node, *body_nodes]),
            }
        )
    expected = {
        "Disciple of Life",
        "Life Domain Spells",
        "Preserve Life",
        "Blessed Healer",
        "Supreme Healing",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Life Domain feature extraction is incomplete")
    return tuple(features)


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    spells: dict[str, dict[str, Any]] = {}
    current_level: int | None = None
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Cleric Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        r"(?P<special>[CRM](?:, [CRM])*|[—–])(?= [A-Z]|$)"
    )
    for node in nodes:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match is not None:
                current_level = int(match.group("level") or 0)
            elif node["normalizedText"] == "Cleric Subclass: Life Domain":
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
        raise ValueError(f"Cleric spell list is unexpectedly short: {len(spells)} entries")
    missing = set(REPRESENTATIVE_SPELLS) - spells.keys()
    if missing:
        raise ValueError(f"Representative spells missing from Cleric list: {sorted(missing)}")
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
            raise ValueError(f"{name} description disagrees with the Cleric spell list")
        body = {
            "level": level,
            "school": school,
            "classes": classes,
            "clericSpell": True,
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
            "healing": [
                {
                    "diceCount": int(match.group("count")),
                    "diceSize": int(match.group("size")),
                }
                for match in re.finditer(
                    r"regains (?P<count>\d+)d(?P<size>\d+) Hit Points", description
                )
            ],
            "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
            "description": description,
        }
        entities.append(
            {
                "id": list_entry["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "cleric"],
                "source": _source_spans(section),
                "body": body,
                "rules": [],
                "review": _review("Representative Cleric spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Cleric spell description extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "cleric"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Cleric class description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.cleric.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.cleric.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.armor.medium.chain-shirt",
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
                        "entityId": "srd521.equipment.weapon.mace",
                        "quantity": 1,
                        "equipped": True,
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
                "currencyGp": 7,
            },
            {
                "id": "srd521.option.class.cleric.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 110,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[ClericProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Cleric"},
        "tags": ["class", "cleric", "spellcaster"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits.get("skillProficiencyChoice", {}),
                "countByLevel": {str(level): 2 for level in range(1, 6)},
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 5,
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
                    "srd521.skill.insight",
                    "srd521.skill.religion",
                ],
                "defaultGrantedFeatIds": [],
            },
            "spellcastingAbility": "wisdom",
            "spellPreparation": "full-list",
            "spellList": [
                entry["id"]
                for name, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "divineOrderChoice": {
                "id": DIVINE_ORDER_CHOICE_ID,
                "level": 1,
                "minimum": 1,
                "maximum": 1,
                "options": [PROTECTOR_ID, THAUMATURGE_ID],
            },
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": feature_ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "channelDivinity": row.channel_divinity,
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
        "review": _review("Cleric progression and spellcasting table from pages 36–38."),
    }


def _choice_entities(feature: dict[str, Any]) -> list[dict[str, Any]]:
    source = feature["source"]
    return [
        {
            "id": PROTECTOR_ID,
            "kind": "class-option",
            "name": {"en": "Protector"},
            "tags": ["class-option", "cleric", "divine-order"],
            "source": source,
            "body": {
                "choiceId": DIVINE_ORDER_CHOICE_ID,
                "armorTraining": ["heavy"],
                "weaponProficiencies": ["martial"],
            },
            "rules": [],
            "review": _review("Protector Divine Order option."),
        },
        {
            "id": THAUMATURGE_ID,
            "kind": "class-option",
            "name": {"en": "Thaumaturge"},
            "tags": ["class-option", "cleric", "divine-order"],
            "source": source,
            "body": {
                "choiceId": DIVINE_ORDER_CHOICE_ID,
                "additionalCantrips": 1,
                "knowledgeCheckBonusAbility": "wisdom",
                "knowledgeChecks": ["arcana", "religion"],
            },
            "rules": [],
            "review": _review("Thaumaturge Divine Order option."),
        },
    ]


def _life_domain_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Cleric Subclass: Life Domain"
    )
    intro = nodes[nodes.index(heading) + 1]
    domain_spells = next(feature for feature in features if feature["name"] == "Life Domain Spells")
    table = next(node for node in domain_spells["bodyNodes"] if node["kind"] == "TableNode")
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
        "name": {"en": "Life Domain"},
        "tags": ["subclass", "cleric", "life-domain"],
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
        "review": _review("Life Domain subclass extracted from page 40."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _rule_table(
    progression: tuple[ClericProgressionRow, ...], source: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": "srd521.table.cleric.channel-divinity",
        "kind": "rule-table",
        "name": {"en": "Cleric Channel Divinity Uses"},
        "tags": ["rule-table", "cleric"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.channel_divinity for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Cleric Features table."),
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
            "notes": ["Targets and saving throws remain roll-assisted."],
        },
    }


def _channel_divinity_ir(feature: dict[str, Any]) -> dict[str, Any]:
    resource_rule = {
        "id": "channel-divinity-resource",
        "type": "grant-resource",
        "target": CHANNEL_DIVINITY_ID,
        "expression": {
            "kind": "tableLookup",
            "table": "srd521.table.cleric.channel-divinity",
            "key": {"kind": "ref", "path": "classLevel.cleric"},
        },
        "parameters": {
            "recharge": [
                {"event": "short-rest", "amount": 1},
                {"event": "long-rest", "amount": "all"},
            ]
        },
        "automationLevel": "state-automated",
    }
    actions = [
        {
            "id": f"use-{slug}",
            "type": "grant-action",
            "target": f"action.{slug}",
            "when": {"kind": "resourceAvailable", "resourceId": CHANNEL_DIVINITY_ID},
            "parameters": {
                "actionEconomy": "magic-action",
                "spends": 1,
                "resourceId": CHANNEL_DIVINITY_ID,
            },
            "automationLevel": "roll-assisted",
        }
        for slug in ("divine-spark", "turn-undead")
    ]
    return _feature_ir(feature, [resource_rule, *actions])


def _preserve_life_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "use-preserve-life",
                "type": "grant-action",
                "target": "action.preserve-life",
                "when": {"kind": "resourceAvailable", "resourceId": CHANNEL_DIVINITY_ID},
                "parameters": {
                    "actionEconomy": "magic-action",
                    "spends": 1,
                    "resourceId": CHANNEL_DIVINITY_ID,
                },
                "automationLevel": "roll-assisted",
            }
        ],
        kind="subclass-feature",
        parent_id=SUBCLASS_ID,
    )


def generate_cleric_content(
    class_extraction_root: Path, spell_extraction_root: Path, output: Path
) -> dict[str, Any]:
    class_document = read_json(class_extraction_root / "normalized" / "document.json")
    spell_document = read_json(spell_extraction_root / "normalized" / "document.json")
    raw_page = read_json(class_extraction_root / "raw" / "pages" / "0036.json")
    core_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "left-column-table"
    )
    progression_node = next(
        node
        for node in class_document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "full-width-table"
    )
    traits = parse_core_traits(core_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(class_document)
    life_features = extract_life_domain_features(class_document)
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
    divine_order = next(feature for feature in features if feature["name"] == "Divine Order")
    channel_divinity = next(
        feature for feature in features if feature["name"] == "Channel Divinity"
    )
    preserve_life = next(feature for feature in life_features if feature["name"] == "Preserve Life")
    cleric_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        *_choice_entities(divine_order),
        _rule_table(progression, progression_source),
        *_life_domain_entities(class_document, life_features),
        *spell_entities,
    ]
    replacement_ids = {entity["id"] for entity in cleric_entities}
    existing = [
        entity
        for entity in read_json(output / "entities.json")
        if entity["id"] not in replacement_ids
    ]
    all_entities = [*existing, *cleric_entities]
    write_json(output / "entities" / "cleric.json", cleric_entities)
    write_json(output / "entities.json", all_entities)
    write_json(
        output / "authoring-ir" / "cleric.channel-divinity.json",
        _channel_divinity_ir(channel_divinity),
    )
    write_json(
        output / "authoring-ir" / "life-domain.preserve-life.json",
        _preserve_life_ir(preserve_life),
    )
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Cleric through level 5, Fighter through level 5, Wizard through level 5, "
        "Human, Soldier, equipment, and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedLifeDomainFeatures": len(life_features),
        "clericSpellListEntries": len(spell_list),
        "representativeSpells": [entity["id"] for entity in spell_entities],
        "generatedEntities": [entity["id"] for entity in cleric_entities],
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "cleric-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_cleric_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Cleric entities; "
        f"{report['clericSpellListEntries']} Cleric-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Parse the Barbarian proof of concept into typed content and draft rules."""

from __future__ import annotations

import argparse
import hashlib
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any, Literal

from srd_extract.content_models import (
    ClassProgressionRow,
    CoreClassTraits,
    ExtractedFeature,
    typed_record_to_dict,
)
from srd_extract.io import read_json, write_json
from srd_extract.normalize import normalize_lines

SOURCE_ID = "wotc-srd-5.2.1-en"
CLASS_ID = "srd521.class.barbarian"
BERSERKER_ID = "srd521.subclass.barbarian.path-of-the-berserker"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
EXPECTED_CORE_LABELS = (
    "Primary Ability",
    "Hit Point Die",
    "Saving Throw Proficiencies",
    "Skill Proficiencies",
    "Weapon Proficiencies",
    "Armor Training",
    "Starting Equipment",
)


def _quote_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def _cluster_word_lines(
    words: Iterable[dict[str, Any]],
    tolerance: float = 1.5,
) -> list[list[dict[str, Any]]]:
    lines: list[list[dict[str, Any]]] = []
    for word in sorted(words, key=lambda item: (item["bbox"][1], item["bbox"][0])):
        word_y = float(word["bbox"][1])
        if not lines:
            lines.append([word])
            continue
        line_y = sum(float(item["bbox"][1]) for item in lines[-1]) / len(lines[-1])
        if abs(word_y - line_y) <= tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])
    for line in lines:
        line.sort(key=lambda item: item["bbox"][0])
    return lines


def _words_in_bbox(
    raw_page: dict[str, Any],
    bbox: list[float],
) -> list[dict[str, Any]]:
    x0, y0, x1, y1 = (float(value) for value in bbox)
    return [
        word
        for word in raw_page["words"]
        if float(word["bbox"][0]) >= x0
        and float(word["bbox"][2]) <= x1
        and float(word["bbox"][1]) >= y0
        and float(word["bbox"][3]) <= y1
    ]


def _line_text(words: list[dict[str, Any]]) -> str:
    return " ".join(str(word["text"]) for word in words)


def _line_bbox(words: list[dict[str, Any]]) -> list[float]:
    return [
        min(float(word["bbox"][0]) for word in words),
        min(float(word["bbox"][1]) for word in words),
        max(float(word["bbox"][2]) for word in words),
        max(float(word["bbox"][3]) for word in words),
    ]


def parse_core_traits(
    raw_page: dict[str, Any],
    table_region: dict[str, Any],
) -> tuple[CoreClassTraits, dict[str, str]]:
    bbox = table_region["bbox"]
    split_x = float(bbox[0]) + (float(bbox[2]) - float(bbox[0])) * 0.42
    clustered_lines = _cluster_word_lines(_words_in_bbox(raw_page, bbox))
    rows: list[dict[str, Any]] = []

    for words in clustered_lines:
        if float(words[0]["bbox"][1]) < 110:
            continue
        left_words = [word for word in words if float(word["bbox"][0]) < split_x]
        right_words = [word for word in words if float(word["bbox"][0]) >= split_x]
        if left_words and right_words:
            rows.append(
                {
                    "label": [_line_text(left_words)],
                    "value": [_line_text(right_words)],
                    "valueBboxes": [_line_bbox(right_words)],
                }
            )
        elif left_words:
            if not rows:
                raise ValueError("Core-traits continuation appeared before the first row")
            rows[-1]["label"].append(_line_text(left_words))
        elif right_words:
            if not rows:
                raise ValueError("Core-traits value appeared before the first row")
            rows[-1]["value"].append(_line_text(right_words))
            rows[-1]["valueBboxes"].append(_line_bbox(right_words))

    parsed_rows: dict[str, str] = {}
    for row in rows:
        label = " ".join(row["label"])
        value, _ = normalize_lines(
            row["value"],
            row["valueBboxes"],
            float(bbox[2]),
        )
        parsed_rows[label] = value
    if tuple(parsed_rows) != EXPECTED_CORE_LABELS:
        raise ValueError(
            f"Unexpected core-traits rows: {tuple(parsed_rows)}; expected {EXPECTED_CORE_LABELS}"
        )

    skill_match = re.fullmatch(r"Choose (\d+): (.+)", parsed_rows["Skill Proficiencies"])
    if skill_match is None:
        raise ValueError("Skill proficiency choice does not match the expected format")
    skill_options = tuple(
        option.strip().casefold()
        for option in re.split(r",| or ", skill_match.group(2))
        if option.strip()
    )
    hit_die_match = re.match(r"D(\d+)", parsed_rows["Hit Point Die"])
    if hit_die_match is None:
        raise ValueError("Hit Point Die does not begin with a die expression")

    traits = CoreClassTraits(
        primary_abilities=(parsed_rows["Primary Ability"].casefold(),),
        hit_point_die=int(hit_die_match.group(1)),
        saving_throw_proficiencies=tuple(
            value.casefold() for value in parsed_rows["Saving Throw Proficiencies"].split(" and ")
        ),
        skill_choice_count=int(skill_match.group(1)),
        skill_options=skill_options,
        weapon_proficiencies=("simple", "martial"),
        armor_training=("light", "medium", "shield"),
        starting_equipment_text=parsed_rows["Starting Equipment"],
    )
    return traits, parsed_rows


def parse_progression(
    raw_page: dict[str, Any],
    table_region: dict[str, Any],
) -> tuple[ClassProgressionRow, ...]:
    words = _words_in_bbox(raw_page, table_region["bbox"])
    rows: list[ClassProgressionRow] = []
    for line in _cluster_word_lines(words):
        if float(line[0]["bbox"][1]) < 418:
            continue
        columns: list[list[dict[str, Any]]] = [[] for _ in range(6)]
        for word in line:
            x = float(word["bbox"][0])
            column = (
                0
                if x < 110
                else 1
                if x < 155
                else 2
                if x < 390
                else 3
                if x < 440
                else 4
                if x < 490
                else 5
            )
            columns[column].append(word)
        values = [_line_text(column) for column in columns]
        if not values[0].isdigit():
            continue
        feature_names = tuple(
            feature.strip() for feature in values[2].split(",") if feature.strip()
        )
        rows.append(
            ClassProgressionRow(
                level=int(values[0]),
                proficiency_bonus=int(values[1].removeprefix("+")),
                feature_names=feature_names,
                rages=int(values[3]),
                rage_damage=int(values[4].removeprefix("+")),
                weapon_mastery=int(values[5]),
            )
        )
    if tuple(row.level for row in rows) != tuple(range(1, 21)):
        raise ValueError("Barbarian progression table does not contain exactly levels 1–20")
    return tuple(rows)


def _source_spans_for_nodes(nodes: Iterable[dict[str, Any]]) -> tuple[dict[str, Any], ...]:
    by_page: dict[int, dict[str, Any]] = defaultdict(lambda: {"blocks": [], "texts": []})
    for node in nodes:
        page = int(str(node["parentId"]).removeprefix("page-"))
        by_page[page]["blocks"].extend(node["sourceBlocks"])
        by_page[page]["texts"].append(node["normalizedText"])
    return tuple(
        {
            "sourceId": SOURCE_ID,
            "page": page,
            "blocks": list(dict.fromkeys(values["blocks"])),
            "quoteHash": _quote_hash("\n".join(values["texts"])),
        }
        for page, values in sorted(by_page.items())
    )


def extract_class_features(document: dict[str, Any]) -> tuple[ExtractedFeature, ...]:
    nodes: list[dict[str, Any]] = document["nodes"]
    features: list[ExtractedFeature] = []
    index = 0
    while index < len(nodes):
        node = nodes[index]
        if node["kind"] != "HeadingNode":
            index += 1
            continue
        if node["normalizedText"] == "Barbarian Subclass:":
            break
        heading_match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if heading_match is None:
            index += 1
            continue
        body_nodes: list[dict[str, Any]] = []
        following_index = index + 1
        while following_index < len(nodes):
            following = nodes[following_index]
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] not in {"MetadataNode", "TableNode"}:
                body_nodes.append(following)
            following_index += 1
        if not body_nodes:
            raise ValueError(f"Feature has no extracted body: {node['normalizedText']}")
        name = heading_match.group("name")
        level = int(heading_match.group("level"))
        feature_id = f"srd521.class-feature.barbarian.{_slug(name)}"
        if any(feature.id == feature_id for feature in features):
            feature_id = f"{feature_id}.level-{level}"
        source_nodes = [node, *body_nodes]
        features.append(
            ExtractedFeature(
                id=feature_id,
                name=name,
                level=level,
                heading_node_id=node["nodeId"],
                body_nodes=tuple(body_nodes),
                source_spans=_source_spans_for_nodes(source_nodes),
            )
        )
        index = following_index
    return tuple(features)


def extract_berserker_features(document: dict[str, Any]) -> tuple[ExtractedFeature, ...]:
    nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0030"]
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Path of the Berserker"
    )
    subclass_nodes = nodes[start:]
    features: list[ExtractedFeature] = []
    for index, node in enumerate(subclass_nodes):
        if node["kind"] != "HeadingNode":
            continue
        match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if match is None:
            continue
        body_nodes: list[dict[str, Any]] = []
        for following in subclass_nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] != "MetadataNode":
                body_nodes.append(following)
        if not body_nodes:
            raise ValueError(f"Berserker feature has no extracted body: {node['normalizedText']}")
        name = match.group("name")
        level = int(match.group("level"))
        features.append(
            ExtractedFeature(
                id=f"srd521.subclass-feature.barbarian.path-of-the-berserker.{_slug(name)}",
                name=name,
                level=level,
                heading_node_id=node["nodeId"],
                body_nodes=tuple(body_nodes),
                source_spans=_source_spans_for_nodes([node, *body_nodes]),
            )
        )
    expected = {"Frenzy", "Mindless Rage", "Retaliation", "Intimidating Presence"}
    if {feature.name for feature in features} != expected:
        raise ValueError("Path of the Berserker feature extraction is incomplete")
    return tuple(features)


def reconcile_progression(
    progression: tuple[ClassProgressionRow, ...],
    features: tuple[ExtractedFeature, ...],
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for row in progression:
        for name in row.feature_names:
            exact = next(
                (
                    feature
                    for feature in features
                    if feature.level == row.level and feature.name.casefold() == name.casefold()
                ),
                None,
            )
            if exact is not None:
                status = "resolved"
                entity_id = exact.id
            elif name == "Ability Score Improvement":
                template = next(
                    feature for feature in features if feature.name == name and feature.level == 4
                )
                status = "repeat-reference"
                entity_id = template.id
            elif name == "Subclass feature":
                status = "subclass-placeholder"
                entity_id = None
            else:
                status = "unresolved"
                entity_id = None
            entries.append(
                {
                    "level": row.level,
                    "name": name,
                    "status": status,
                    "entityId": entity_id,
                }
            )
    unresolved = [entry for entry in entries if entry["status"] == "unresolved"]
    return {
        "classId": CLASS_ID,
        "entries": entries,
        "counts": {
            status: sum(entry["status"] == status for entry in entries)
            for status in (
                "resolved",
                "repeat-reference",
                "subclass-placeholder",
                "unresolved",
            )
        },
        "valid": not unresolved,
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.barbarian.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.barbarian.starting-equipment.a",
                "label": "Package A",
                "items": [
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.greataxe",
                        "quantity": 1,
                        "equipped": True,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.weapon.handaxe",
                        "quantity": 4,
                        "equipped": False,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.explorers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 15,
            },
            {
                "id": "srd521.option.class.barbarian.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 75,
            },
        ],
    }


def _class_entity(
    traits: CoreClassTraits,
    progression: tuple[ClassProgressionRow, ...],
    reconciliation: dict[str, Any],
    source_spans: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {
        (int(entry["level"]), str(entry["name"])): entry["entityId"]
        for entry in reconciliation["entries"]
    }
    progression_body = [
        {
            "level": row.level,
            "proficiencyBonus": row.proficiency_bonus,
            "features": [
                {
                    "name": name,
                    "entityId": feature_ids[(row.level, name)],
                }
                for name in row.feature_names
            ],
            "rages": row.rages,
            "rageDamage": row.rage_damage,
            "weaponMastery": row.weapon_mastery,
            "walkingSpeedBonus": 10 if row.level >= 5 else 0,
        }
        for row in progression
    ]
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Barbarian"},
        "tags": ["class", "barbarian"],
        "source": source_spans,
        "body": {
            "primaryAbilities": list(traits.primary_abilities),
            "hitPointDie": traits.hit_point_die,
            "savingThrowProficiencies": list(traits.saving_throw_proficiencies),
            "skillProficiencyChoice": {
                "minimum": traits.skill_choice_count,
                "maximum": traits.skill_choice_count,
                "options": list(traits.skill_options),
                "countByLevel": {str(level): 2 if level < 3 else 3 for level in range(1, 10)},
            },
            "weaponProficiencies": list(traits.weapon_proficiencies),
            "weaponMasteryChoice": {
                "categories": ["simple", "martial"],
                "attackTypes": ["melee"],
            },
            "armorTraining": list(traits.armor_training),
            "startingEquipment": _starting_equipment(),
            "startingEquipmentText": traits.starting_equipment_text,
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 9,
                "defaultAbilityScores": {
                    "strength": 15,
                    "dexterity": 13,
                    "constitution": 14,
                    "intelligence": 8,
                    "wisdom": 12,
                    "charisma": 10,
                },
                "defaultAbilityScoreImprovementAbility": "strength",
                "defaultClassSkillIds": [
                    "srd521.skill.perception",
                    "srd521.skill.survival",
                    "srd521.skill.animal-handling",
                ],
                "defaultGrantedFeatIds": [],
            },
            "progression": progression_body,
        },
        "rules": [],
        "review": {
            "status": "STRUCTURED",
            "extractionApproved": True,
            "semanticsApproved": False,
            "testsApproved": False,
            "notes": "Pages 28–30 proof of concept; executable semantics remain draft.",
        },
    }


def _feature_text(feature: ExtractedFeature) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    for node in feature.body_nodes:
        text_node = {
            "kind": node["kind"],
            "text": node["normalizedText"],
        }
        if node["kind"] == "ListNode":
            text_node["items"] = [item["normalizedText"] for item in node["items"]]
        nodes.append(text_node)
    return {"title": feature.name, "nodes": nodes}


def _feature_entity(feature: ExtractedFeature) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": feature.id,
        "kind": "class-feature",
        "name": {"en": feature.name},
        "tags": ["class-feature", "barbarian", f"level-{feature.level}"],
        "source": list(feature.source_spans),
        "body": {
            "level": feature.level,
            "parentId": CLASS_ID,
            "text": _feature_text(feature),
            "automationLevel": "structured",
        },
        "rules": [],
        "review": {
            "status": "STRUCTURED",
            "extractionApproved": True,
            "semanticsApproved": False,
            "testsApproved": False,
            "notes": "Executable rules are proposals in the authoring IR.",
        },
    }
    if feature.name == "Instinctive Pounce":
        entity["body"].update(
            {
                "automationLevel": "sheet-automated",
                "actionEnhancements": [
                    {
                        "actionId": "action.enter-rage",
                        "movement": {
                            "speedFraction": 0.5,
                            "provokesOpportunityAttacks": True,
                        },
                    }
                ],
            }
        )
    if feature.name == "Reckless Attack":
        entity["body"].update(
            {
                "automationLevel": "sheet-automated",
                "attackRollOptions": [
                    {
                        "kind": "advantage",
                        "ability": "strength",
                        "requiresFirstAttackDeclaration": True,
                        "onceOnYourTurn": False,
                        "instructions": (
                            "Declare Reckless Attack when making your first attack roll "
                            "on your turn. "
                            "Strength attacks gain Advantage until the start of your next turn; "
                            "attack rolls against you also have Advantage during that time. "
                            "Keep the declaration for later attacks and eligible off-turn attacks."
                        ),
                        "effects": [],
                    }
                ],
            }
        )
    if feature.name == "Brutal Strike":
        entity["body"].update(
            {
                "automationLevel": "sheet-automated",
                "attackRollOptions": [
                    {
                        "kind": "forgo-advantage",
                        "ability": "strength",
                        "requiredOptionSourceId": "srd521.class-feature.barbarian.reckless-attack",
                        "requiresFirstAttackDeclaration": False,
                        "onceOnYourTurn": True,
                        "instructions": (
                            "While using Reckless Attack, forgo all Advantage on one "
                            "Strength attack on your turn. The attack must not have "
                            "Disadvantage. On a hit, add the "
                            "extra damage with the attack's damage type and choose one effect. "
                            "Only one chosen attack per turn, even if it misses."
                        ),
                        "damage": {"diceCount": 1, "diceSize": 10},
                        "effects": [
                            {
                                "id": "forceful-blow",
                                "name": "Forceful Blow",
                                "instructions": (
                                    "Push the target 15 feet straight away. You can then "
                                    "move up to half your Speed straight toward it "
                                    "without provoking Opportunity Attacks."
                                ),
                                "movement": {
                                    "speedFraction": 0.5,
                                    "provokesOpportunityAttacks": False,
                                },
                            },
                            {
                                "id": "hamstring-blow",
                                "name": "Hamstring Blow",
                                "instructions": (
                                    "Reduce the target's Speed by 15 feet until the start "
                                    "of your next turn. "
                                    "Only the most recent Hamstring Blow applies; do not stack it."
                                ),
                            },
                        ],
                    }
                ],
            }
        )
    return entity


def _berserker_entities(
    document: dict[str, Any],
    features: tuple[ExtractedFeature, ...],
) -> list[dict[str, Any]]:
    nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0030"]
    heading_index = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Path of the Berserker"
    )
    first_feature_index = next(
        index
        for index, node in enumerate(nodes[heading_index + 1 :], heading_index + 1)
        if node["kind"] == "HeadingNode" and HEADING_PATTERN.fullmatch(node["normalizedText"])
    )
    introduction = nodes[heading_index:first_feature_index]
    subclass = {
        "id": BERSERKER_ID,
        "kind": "subclass",
        "name": {"en": "Path of the Berserker"},
        "tags": ["subclass", "barbarian", "path-of-the-berserker"],
        "source": list(_source_spans_for_nodes(introduction)),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {
                    "level": level,
                    "features": [feature.id for feature in features if feature.level == level],
                }
                for level in sorted({feature.level for feature in features})
            ],
            "text": {
                "title": "Path of the Berserker",
                "nodes": [
                    {"kind": node["kind"], "text": node["normalizedText"]}
                    for node in introduction[1:]
                ],
            },
        },
        "rules": [],
        "review": {
            "status": "STRUCTURED",
            "extractionApproved": True,
            "semanticsApproved": False,
            "testsApproved": False,
            "notes": "Path of the Berserker extracted from page 30.",
        },
    }
    feature_entities = []
    for feature in features:
        entity = _feature_entity(feature)
        entity["kind"] = "subclass-feature"
        entity["tags"] = [
            "subclass-feature",
            "barbarian",
            "path-of-the-berserker",
            f"level-{feature.level}",
        ]
        entity["body"]["parentId"] = BERSERKER_ID
        if feature.name == "Mindless Rage":
            entity["body"].update(
                {
                    "automationLevel": "state-automated",
                    "activeEffectConditionImmunities": [
                        {
                            "activeEffectId": "srd521.effect.barbarian.rage",
                            "conditionIds": [
                                "srd521.condition.charmed",
                                "srd521.condition.frightened",
                            ],
                        }
                    ],
                    "actionEnhancements": [
                        {
                            "actionId": "action.enter-rage",
                            "endsConditionIds": [
                                "srd521.condition.charmed",
                                "srd521.condition.frightened",
                            ],
                        }
                    ],
                }
            )
        feature_entities.append(entity)
    return [subclass, *feature_entities]


def _rule_table_entity(
    progression: tuple[ClassProgressionRow, ...],
    *,
    table_id: str,
    name: str,
    field: Literal["rages", "rage_damage"],
    source_span: dict[str, Any],
) -> dict[str, Any]:
    entries = {str(row.level): getattr(row, field) for row in progression}
    return {
        "id": table_id,
        "kind": "rule-table",
        "name": {"en": name},
        "tags": ["rule-table", "barbarian"],
        "source": [source_span],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": entries,
        },
        "rules": [],
        "review": {
            "status": "STRUCTURED",
            "extractionApproved": True,
            "semanticsApproved": False,
            "testsApproved": False,
            "notes": "Extracted from the Barbarian Features table.",
        },
    }


def _equals_fact(path: str, value: bool | str) -> dict[str, Any]:
    return {
        "kind": "equals",
        "left": {"kind": "ref", "path": path},
        "right": {"kind": "literal", "value": value},
    }


def _rage_ir(feature: ExtractedFeature) -> dict[str, Any]:
    active = _equals_fact("state.rage.active", True)
    strength_attack = _equals_fact("attack.ability", "strength")
    return {
        "schemaVersion": "0.1.0",
        "id": feature.id,
        "kind": "class-feature",
        "parentId": CLASS_ID,
        "level": feature.level,
        "source": list(feature.source_spans),
        "text": _feature_text(feature),
        "proposedRules": [
            {
                "id": "rage-resource",
                "type": "grant-resource",
                "target": "srd521.resource.barbarian.rage",
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.barbarian.rages",
                    "key": {"kind": "ref", "path": "classLevel.barbarian"},
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
                "id": "enter-rage",
                "type": "grant-action",
                "target": "action.enter-rage",
                "when": {
                    "kind": "all",
                    "args": [
                        _equals_fact("equipment.wearingHeavyArmor", False),
                        {
                            "kind": "resourceAvailable",
                            "resourceId": "srd521.resource.barbarian.rage",
                        },
                        _equals_fact("state.rage.active", False),
                    ],
                },
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": "srd521.resource.barbarian.rage",
                    "activatesEffectId": "srd521.effect.barbarian.rage",
                },
                "automationLevel": "state-automated",
            },
            {
                "id": "rage-resistance",
                "type": "grant-resistance",
                "target": "defense.damage-resistance",
                "when": active,
                "parameters": {"damageTypes": ["bludgeoning", "piercing", "slashing"]},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "rage-damage",
                "type": "add-modifier",
                "target": "attack.damage.bonus",
                "when": {"kind": "all", "args": [active, strength_attack]},
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.barbarian.rage-damage",
                    "key": {"kind": "ref", "path": "classLevel.barbarian"},
                },
                "parameters": {"attackKinds": ["weapon", "unarmed-strike"]},
                "automationLevel": "roll-assisted",
            },
            {
                "id": "rage-strength-check-advantage",
                "type": "grant-advantage",
                "target": "d20.strength.check",
                "when": active,
                "parameters": {},
                "automationLevel": "roll-assisted",
            },
            {
                "id": "rage-strength-save-advantage",
                "type": "grant-advantage",
                "target": "d20.strength.saving-throw",
                "when": active,
                "parameters": {},
                "automationLevel": "roll-assisted",
            },
            {
                "id": "rage-spell-restriction",
                "type": "add-validation",
                "target": "state.rage.active",
                "when": active,
                "parameters": {
                    "forbids": ["concentration", "cast-spell"],
                    "severity": "error",
                },
                "automationLevel": "state-automated",
            },
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": [
                "Duration extension remains structured text pending the combat-turn state model."
            ],
        },
    }


def _unarmored_defense_ir(feature: ExtractedFeature) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature.id,
        "kind": "class-feature",
        "parentId": CLASS_ID,
        "level": feature.level,
        "source": list(feature.source_spans),
        "text": _feature_text(feature),
        "proposedRules": [
            {
                "id": "barbarian-unarmored-defense",
                "type": "add-candidate-calculation",
                "target": "armor-class",
                "when": _equals_fact("equipment.wearingArmor", False),
                "expression": {
                    "kind": "add",
                    "args": [
                        {"kind": "literal", "value": 10},
                        {"kind": "ref", "path": "ability.dexterity.modifier"},
                        {"kind": "ref", "path": "ability.constitution.modifier"},
                    ],
                },
                "parameters": {
                    "selection": "automatic-highest",
                    "shieldAllowed": True,
                },
                "automationLevel": "sheet-automated",
            }
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": [],
        },
    }


def _extra_attack_ir(feature: ExtractedFeature) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature.id,
        "kind": "class-feature",
        "parentId": CLASS_ID,
        "level": feature.level,
        "source": list(feature.source_spans),
        "text": _feature_text(feature),
        "proposedRules": [
            {
                "id": "barbarian-extra-attack",
                "type": "set-attack-count",
                "target": "attackAction.attacks",
                "expression": {"kind": "literal", "value": 2},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": [],
        },
    }


def generate_barbarian_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    raw_page = read_json(extraction_root / "raw" / "pages" / "0028.json")
    layout = read_json(extraction_root / "layout" / "pages" / "0028.json")
    document = read_json(extraction_root / "normalized" / "document.json")
    core_region = next(
        region for region in layout["tableRegions"] if region["regionType"] == "left-column-table"
    )
    progression_region = next(
        region for region in layout["tableRegions"] if region["regionType"] == "full-width-table"
    )
    traits, parsed_core_rows = parse_core_traits(raw_page, core_region)
    progression = parse_progression(raw_page, progression_region)
    features = extract_class_features(document)
    berserker_features = extract_berserker_features(document)
    reconciliation = reconcile_progression(progression, features)
    if not reconciliation["valid"]:
        raise ValueError("Class progression contains unresolved feature references")

    table_nodes = [node for node in document["nodes"] if node["kind"] == "TableNode"]
    class_source_spans = [
        {
            "sourceId": SOURCE_ID,
            "page": int(str(node["parentId"]).removeprefix("page-")),
            "blocks": node["sourceBlocks"],
            "quoteHash": _quote_hash(node["normalizedText"]),
        }
        for node in table_nodes
    ]
    progression_source_span = next(
        span
        for span, node in zip(class_source_spans, table_nodes, strict=True)
        if node["regionType"] == "full-width-table"
    )
    class_entity = _class_entity(
        traits,
        progression,
        reconciliation,
        class_source_spans,
    )
    selected_features = [
        next(feature for feature in features if feature.name == name and feature.level == 1)
        for name in ("Rage", "Unarmored Defense")
    ]
    feature_entities = [_feature_entity(feature) for feature in features]
    berserker_entities = _berserker_entities(document, berserker_features)
    rule_tables = [
        _rule_table_entity(
            progression,
            table_id="srd521.table.barbarian.rages",
            name="Barbarian Rages",
            field="rages",
            source_span=progression_source_span,
        ),
        _rule_table_entity(
            progression,
            table_id="srd521.table.barbarian.rage-damage",
            name="Barbarian Rage Damage",
            field="rage_damage",
            source_span=progression_source_span,
        ),
    ]
    all_entities = [class_entity, *feature_entities, *berserker_entities, *rule_tables]
    rage = selected_features[0]
    unarmored_defense = selected_features[1]

    aggregate_path = output / "entities.json"
    existing = read_json(aggregate_path) if aggregate_path.exists() else []
    replacements = {entity["id"]: entity for entity in all_entities}
    existing_ids = {entity["id"] for entity in existing}
    aggregate = [replacements.get(entity["id"], entity) for entity in existing]
    aggregate.extend(entity for entity in all_entities if entity["id"] not in existing_ids)
    write_json(aggregate_path, aggregate)
    write_json(output / "entities" / "classes.json", [class_entity])
    write_json(output / "entities" / "class-features.json", feature_entities)
    write_json(output / "entities" / "rule-tables.json", rule_tables)
    write_json(
        output / "coverage.json",
        {
            "package": "srd-5.2.1",
            "generatedAt": None,
            "counts": {
                "UNCLASSIFIED": 0,
                "TEXT_ONLY": 0,
                "STRUCTURED": len(aggregate),
                "EXECUTABLE": 0,
                "TESTED": 0,
                "VERIFIED": 0,
            },
            "note": (
                "Barbarian through level 9 from pages 28–30. Proposed executable rules remain "
                "in needs-review authoring IR."
            ),
        },
    )
    write_json(
        output / "authoring-ir" / "barbarian.rage.json",
        _rage_ir(rage),
    )
    write_json(
        output / "authoring-ir" / "barbarian.unarmored-defense.json",
        _unarmored_defense_ir(unarmored_defense),
    )
    extra_attack = next(
        feature for feature in features if feature.name == "Extra Attack" and feature.level == 5
    )
    write_json(
        output / "authoring-ir" / "barbarian.extra-attack.json",
        _extra_attack_ir(extra_attack),
    )
    feral_instinct = next(feature for feature in features if feature.name == "Feral Instinct")
    write_json(
        output / "authoring-ir" / "barbarian.feral-instinct.json",
        {
            "schemaVersion": "0.1.0",
            "id": feral_instinct.id,
            "kind": "class-feature",
            "parentId": CLASS_ID,
            "level": feral_instinct.level,
            "source": list(feral_instinct.source_spans),
            "text": _feature_text(feral_instinct),
            "proposedRules": [
                {
                    "id": "feral-instinct-initiative",
                    "type": "grant-advantage",
                    "target": "initiative",
                    "parameters": {},
                    "automationLevel": "sheet-automated",
                }
            ],
            "review": {
                "extraction": "approved",
                "semantics": "needs-review",
                "tests": "draft",
                "notes": [],
            },
        },
    )
    write_json(output / "indexes" / "barbarian-reconciliation.json", reconciliation)
    report = {
        "classId": CLASS_ID,
        "coreTraits": typed_record_to_dict(traits),
        "parsedCoreRows": parsed_core_rows,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedBerserkerFeatures": len(berserker_features),
        "generatedEntities": [entity["id"] for entity in all_entities],
        "reconciliation": reconciliation["counts"],
    }
    write_json(output / "barbarian-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_barbarian_content(options.extraction, options.output)
    print(
        f"Generated {len(report['generatedEntities'])} entities; "
        f"{report['progressionRows']} progression rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

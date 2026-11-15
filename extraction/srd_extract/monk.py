"""Parse the Monk class and Warrior of the Open Hand subclass."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.progression import progression_feature_ids
from srd_extract.wizard import _slug, _source_spans

CLASS_ID = "srd521.class.monk"
SUBCLASS_ID = "srd521.subclass.monk.warrior-of-the-open-hand"
FOCUS_ID = "srd521.resource.monk.focus-points"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")


@dataclass(frozen=True, slots=True)
class MonkProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    martial_arts_die: int
    focus_points: int
    unarmored_movement: int

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Monk level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if self.martial_arts_die not in {6, 8, 10, 12}:
            raise ValueError("Monk Martial Arts die must be d6, d8, d10, or d12")


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
        r"Core Monk Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Monk level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Tool Proficiencies (?P<tools>.+?) "
        r"Armor Training (?P<armor>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Monk Traits table does not match the expected labels")
    if "Choose one type of Artisan’s Tools or Musical Instrument" not in match.group("tools"):
        raise ValueError("Monk tool choice is missing its source categories")
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
        "weaponProficiencies": ["simple"],
        "conditionalWeaponProficiencies": [
            {"category": "martial", "attackType": "melee", "requiredProperties": ["light"]}
        ],
        "toolProficiencyChoiceText": match.group("tools"),
        "toolProficiencyChoice": {
            "minimum": 1,
            "maximum": 1,
            "categories": ["artisan", "musical-instrument"],
        },
        "armorTraining": [],
        "startingEquipmentText": starting_equipment,
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[MonkProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 75 <= float(word["bbox"][1]) < 390
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Monk progression table does not contain exactly levels 1–20")
    rows: list[MonkProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 396
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 550
        ]
        feature_text = _column_text(row, 150, 370)
        focus_text = _column_text(row, 425, 475)
        movement_text = _column_text(row, 475, 550)
        martial_match = re.fullmatch(r"1d(?P<size>\d+)", _column_text(row, 370, 425))
        if martial_match is None:
            raise ValueError(f"Monk level {level} has an invalid Martial Arts die")
        rows.append(
            MonkProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 150).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                martial_arts_die=int(martial_match.group("size")),
                focus_points=0 if focus_text == "—" else int(focus_text),
                unarmored_movement=(
                    0
                    if movement_text == "—"
                    else int(movement_text.removeprefix("+").removesuffix(" ft."))
                ),
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
            if node["kind"] not in {"MetadataNode", "TableNode"}
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
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Level 1: Martial Arts"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Monk Subclass: Warrior of the"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.monk")
    expected = {
        "Martial Arts",
        "Unarmored Defense",
        "Monk’s Focus",
        "Unarmored Movement",
        "Uncanny Metabolism",
        "Deflect Attacks",
        "Monk Subclass",
        "Ability Score Improvement",
        "Slow Fall",
        "Extra Attack",
        "Stunning Strike",
        "Empowered Strikes",
        "Evasion",
        "Acrobatic Movement",
        "Heightened Focus",
        "Self-Restoration",
        "Deflect Energy",
        "Disciplined Survivor",
        "Perfect Focus",
        "Superior Defense",
        "Epic Boon",
        "Body and Mind",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Monk class feature extraction is incomplete")
    return features


def extract_open_hand_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Open Hand"
    )
    end = next(
        index
        for index, node in enumerate(nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Paladin"
    )
    features = _level_features(
        nodes, start + 1, end, "srd521.subclass-feature.monk.warrior-of-the-open-hand"
    )
    expected = {"Open Hand Technique", "Wholeness of Body", "Fleet Step", "Quivering Palm"}
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Warrior of the Open Hand feature extraction is incomplete")
    return features


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "monk"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Monk description."),
    }
    if feature["name"] == "Evasion":
        entity["body"].update(
            {
                "automationLevel": "state-automated",
                "savingThrowDamageEffects": [
                    {
                        "ability": "dexterity",
                        "requiresHalfDamageOnSuccess": True,
                        "successFraction": 0,
                        "failureFraction": 0.5,
                        "inactiveConditionIds": ["srd521.condition.incapacitated"],
                    }
                ],
            }
        )
    if feature["name"] == "Acrobatic Movement":
        entity["body"].update(
            {
                "automationLevel": "sheet-automated",
                "movementCapabilities": [
                    {
                        "id": "srd521.movement.acrobatic-movement",
                        "surfaces": ["vertical-surfaces", "liquids"],
                        "requiresNoArmor": True,
                        "requiresNoShield": True,
                        "ownTurnOnly": True,
                        "preventsFallingDuringMovement": True,
                        "instructions": [
                            "On your turn, you can move along vertical surfaces and across "
                            "liquids without falling during that movement.",
                            "This uses your existing movement; it grants no separate movement "
                            "budget, Climb Speed, Swim Speed, or ability to fly.",
                            "The protection is during movement only. Resolve what supports "
                            "you when you stop, and any falling or sinking, with the DM.",
                        ],
                    }
                ],
            }
        )
    return entity


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.monk.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.monk.starting-equipment.a",
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
                        "quantity": 5,
                        "equipped": False,
                    },
                    {
                        "kind": "text",
                        "name": "Artisan’s Tools or Musical Instrument (choose one)",
                        "quantity": 1,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.explorers-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 11,
            },
            {
                "id": "srd521.option.class.monk.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 50,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[MonkProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = progression_feature_ids(
        features, ((row.level, row.feature_names) for row in progression)
    )
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Monk"},
        "tags": ["class", "monk", "martial"],
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
                    "strength": 8,
                    "dexterity": 15,
                    "constitution": 14,
                    "intelligence": 10,
                    "wisdom": 15,
                    "charisma": 8,
                },
                "defaultAbilityScoreImprovementAbility": "dexterity",
                "defaultClassSkillIds": [
                    "srd521.skill.acrobatics",
                    "srd521.skill.insight",
                ],
                "defaultGrantedFeatIds": [],
            },
            "featureSaveAbility": "wisdom",
            "martialArts": {
                "ability": "dexterity",
                "monkWeapon": {
                    "attackType": "melee",
                    "categories": ["simple"],
                    "conditionalCategories": [
                        {"category": "martial", "requiredProperties": ["light"]}
                    ],
                },
            },
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": feature_ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "martialArtsDie": {"diceCount": 1, "diceSize": row.martial_arts_die},
                    "focusPoints": row.focus_points,
                    "unarmoredMovement": row.unarmored_movement,
                }
                for row in progression
            ],
        },
        "rules": [],
        "review": _review("Monk progression table and class traits from pages 49–52."),
    }


def _subclass_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading_first = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode"
        and node["normalizedText"] == "Monk Subclass: Warrior of the"
    )
    heading_second = nodes[nodes.index(heading_first) + 1]
    intro = nodes[nodes.index(heading_second) + 1]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Warrior of the Open Hand"},
        "tags": ["subclass", "monk", "warrior-of-the-open-hand"],
        "source": _source_spans([heading_first, heading_second, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(by_level.items())
            ],
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Warrior of the Open Hand subclass extracted from page 52."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _rule_table(
    progression: tuple[MonkProgressionRow, ...],
    source: dict[str, Any],
    field: str,
    name: str,
) -> dict[str, Any]:
    return {
        "id": f"srd521.table.monk.{field.replace('_', '-')}",
        "kind": "rule-table",
        "name": {"en": name},
        "tags": ["rule-table", "monk"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): getattr(row, field) for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Monk Features table."),
    }


def _feature_ir(feature: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature["id"],
        "kind": "class-feature",
        "parentId": CLASS_ID,
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
            "notes": ["Targets and applied conditions remain roll-assisted."],
        },
    }


def _equals(path: str, value: bool) -> dict[str, Any]:
    return {
        "kind": "equals",
        "left": {"kind": "ref", "path": path},
        "right": {"kind": "literal", "value": value},
    }


def _unarmored_defense_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "monk-unarmored-defense",
                "type": "add-candidate-calculation",
                "target": "armor-class",
                "when": {
                    "kind": "all",
                    "args": [
                        _equals("equipment.wearingArmor", False),
                        _equals("equipment.wieldingShield", False),
                    ],
                },
                "expression": {
                    "kind": "add",
                    "args": [
                        {"kind": "literal", "value": 10},
                        {"kind": "ref", "path": "ability.dexterity.modifier"},
                        {"kind": "ref", "path": "ability.wisdom.modifier"},
                    ],
                },
                "parameters": {"selection": "automatic-highest", "shieldAllowed": False},
                "automationLevel": "sheet-automated",
            }
        ],
    )


def _focus_ir(feature: dict[str, Any]) -> dict[str, Any]:
    rules: list[dict[str, Any]] = [
        {
            "id": "focus-points-resource",
            "type": "grant-resource",
            "target": FOCUS_ID,
            "expression": {
                "kind": "tableLookup",
                "table": "srd521.table.monk.focus-points",
                "key": {"kind": "ref", "path": "classLevel.monk"},
            },
            "parameters": {
                "recharge": [
                    {"event": "short-rest", "amount": "all"},
                    {"event": "long-rest", "amount": "all"},
                ]
            },
            "automationLevel": "state-automated",
        }
    ]
    for action in ("flurry-of-blows", "patient-defense", "step-of-the-wind"):
        rules.append(
            {
                "id": f"use-{action}",
                "type": "grant-action",
                "target": f"action.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": FOCUS_ID},
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": FOCUS_ID,
                },
                "automationLevel": "state-automated",
            }
        )
    return _feature_ir(feature, rules)


def _focus_action_ir(feature: dict[str, Any], action: str, economy: str) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": f"use-{action}",
                "type": "grant-action",
                "target": f"action.{action}",
                "when": {"kind": "resourceAvailable", "resourceId": FOCUS_ID},
                "parameters": {
                    "actionEconomy": economy,
                    "spends": 1,
                    "resourceId": FOCUS_ID,
                },
                "automationLevel": "roll-assisted",
            }
        ],
    )


def _extra_attack_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "monk-extra-attack",
                "type": "set-attack-count",
                "target": "attackAction.attacks",
                "expression": {"kind": "literal", "value": 2},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
    )


def _wholeness_ir(feature: dict[str, Any]) -> dict[str, Any]:
    resource_id = "srd521.resource.monk.wholeness-of-body"
    ir = _feature_ir(
        feature,
        [
            {
                "id": "wholeness-of-body-resource",
                "type": "grant-resource",
                "target": resource_id,
                "expression": {
                    "kind": "max",
                    "args": [
                        {"kind": "literal", "value": 1},
                        {"kind": "ref", "path": "ability.wisdom.modifier"},
                    ],
                },
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": "use-wholeness-of-body",
                "type": "grant-action",
                "target": "action.wholeness-of-body",
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.monk.martial-arts-die",
                    "key": {"kind": "ref", "path": "classLevel.monk"},
                },
                "when": {
                    "kind": "all",
                    "args": [
                        {"kind": "resourceAvailable", "resourceId": resource_id},
                        {
                            "kind": "compare",
                            "op": "gt",
                            "left": {"kind": "ref", "path": "hitPoints.current"},
                            "right": {"kind": "literal", "value": 0},
                        },
                    ],
                },
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "spends": 1,
                    "resourceId": resource_id,
                    "healing": {
                        "diceCount": 1,
                        "bonusFact": "ability.wisdom.modifier",
                        "minimum": 1,
                    },
                },
                "automationLevel": "state-automated",
            },
        ],
    )
    ir["kind"] = "subclass-feature"
    ir["parentId"] = SUBCLASS_ID
    ir["review"]["notes"] = ["Healing requires an explicit Martial Arts die roll."]
    return ir


def generate_monk_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(extraction_root / "normalized" / "document.json")
    raw_page = read_json(extraction_root / "raw" / "pages" / "0050.json")
    core_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Monk Traits")
    )
    equipment_heading = next(
        node
        for node in document["nodes"]
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Starting Equipment"
    )
    equipment_node = document["nodes"][document["nodes"].index(equipment_heading) + 1]
    progression_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Monk Features")
    )
    traits = parse_core_traits(core_node["normalizedText"], equipment_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(document)
    open_hand_features = extract_open_hand_features(document)
    progression_source = _source_spans([progression_node])[0]
    class_entity = _class_entity(
        traits,
        progression,
        features,
        _source_spans([core_node, equipment_heading, equipment_node, progression_node]),
    )
    monk_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        _rule_table(progression, progression_source, "martial_arts_die", "Monk Martial Arts Die"),
        _rule_table(progression, progression_source, "focus_points", "Monk Focus Points"),
        _rule_table(
            progression, progression_source, "unarmored_movement", "Monk Unarmored Movement"
        ),
        *_subclass_entities(document, open_hand_features),
    ]
    for entity in monk_entities:
        if entity["id"] == "srd521.class-feature.monk.empowered-strikes":
            entity["body"]["unarmedStrikeDamageTypes"] = ["force"]
            entity["body"]["automationLevel"] = "roll-assisted"
    replacements = {entity["id"]: entity for entity in monk_entities}
    existing = read_json(output / "entities.json")
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in monk_entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "monk.json", monk_entities)
    write_json(output / "entities.json", all_entities)
    by_name = {feature["name"]: feature for feature in features}
    authoring = {
        "monk.unarmored-defense.json": _unarmored_defense_ir(by_name["Unarmored Defense"]),
        "monk.focus.json": _focus_ir(by_name["Monk’s Focus"]),
        "monk.deflect-attacks.json": _focus_action_ir(
            by_name["Deflect Attacks"], "deflect-attacks-redirect", "reaction-follow-up"
        ),
        "monk.extra-attack.json": _extra_attack_ir(by_name["Extra Attack"]),
        "monk.stunning-strike.json": _focus_action_ir(
            by_name["Stunning Strike"], "stunning-strike", "once-per-turn-on-hit"
        ),
        "monk.wholeness-of-body.json": _wholeness_ir(
            next(
                feature for feature in open_hand_features if feature["name"] == "Wholeness of Body"
            )
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
        "extractedOpenHandFeatures": len(open_hand_features),
        "generatedEntities": [entity["id"] for entity in monk_entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "monk-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_monk_content(options.extraction, options.output)
    print(
        f"Generated {len(report['generatedEntities'])} Monk entities with "
        f"{report['progressionRows']} progression rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

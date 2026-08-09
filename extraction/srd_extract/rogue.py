"""Parse the Rogue class, Thief subclass, and level-5 assisted mechanics."""

from __future__ import annotations

import argparse
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.wizard import _slug, _source_spans

CLASS_ID = "srd521.class.rogue"
SUBCLASS_ID = "srd521.subclass.rogue.thief"
CUNNING_STRIKE_OPTION_IDS = {
    "Poison": "srd521.option.rogue.cunning-strike.poison",
    "Trip": "srd521.option.rogue.cunning-strike.trip",
    "Withdraw": "srd521.option.rogue.cunning-strike.withdraw",
}
CUNNING_STRIKE_CHOICE_ID = "srd521.choice.rogue.cunning-strike"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")


@dataclass(frozen=True, slots=True)
class RogueProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    sneak_attack_dice: int

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Rogue level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        expected_dice = (self.level + 1) // 2
        if self.sneak_attack_dice != expected_dice:
            raise ValueError(
                f"Level {self.level} has {self.sneak_attack_dice} Sneak Attack dice; "
                f"expected {expected_dice}"
            )


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
        r"Core Rogue Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Rogue level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Tool Proficiencies (?P<tools>.+?) Armor Training (?P<armor>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Rogue Traits table does not match the expected labels")
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
        "conditionalWeaponProficiencies": [
            {
                "category": "martial",
                "attackType": "melee",
                "requiredProperties": ["finesse"],
            },
            {
                "category": "martial",
                "attackType": "melee",
                "requiredProperties": ["light"],
            },
        ],
        "toolProficiencies": [match.group("tools")],
        "armorTraining": ["light"],
        "startingEquipmentText": starting_equipment,
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[RogueProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 90
        and 70 <= float(word["bbox"][1]) < 380
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Rogue progression table does not contain exactly levels 1–20")
    rows: list[RogueProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 380
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 540
        ]
        feature_text = _column_text(row, 145, 440)
        sneak_attack = _column_text(row, 440, 530)
        match = re.fullmatch(r"(?P<count>\d+)d6", sneak_attack)
        if match is None:
            raise ValueError(f"Rogue level {level} Sneak Attack value is malformed")
        rows.append(
            RogueProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 95, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                sneak_attack_dice=int(match.group("count")),
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
    seen: Counter[str] = Counter()
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
                and str(node["normalizedText"]).startswith("Rogue Features")
            )
        ]
        name = match.group("name")
        level = int(match.group("level"))
        seen[name] += 1
        suffix = "" if seen[name] == 1 else f".level-{level}"
        features.append(
            {
                "id": f"{prefix}.{_slug(name)}{suffix}",
                "name": name,
                "level": level,
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
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Level 1: Expertise"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Rogue Subclass: Thief"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.rogue")
    expected = Counter(
        {
            "Expertise": 1,
            "Sneak Attack": 1,
            "Thieves’ Cant": 1,
            "Weapon Mastery": 1,
            "Cunning Action": 1,
            "Rogue Subclass": 1,
            "Steady Aim": 1,
            "Ability Score Improvement": 1,
            "Cunning Strike": 1,
            "Uncanny Dodge": 1,
            "Evasion": 1,
            "Reliable Talent": 1,
            "Improved Cunning Strike": 1,
            "Devious Strikes": 1,
            "Slippery Mind": 1,
            "Elusive": 1,
            "Epic Boon": 1,
            "Stroke of Luck": 1,
        }
    )
    if Counter(feature["name"] for feature in features) != expected:
        raise ValueError("Rogue class feature extraction is incomplete")
    return features


def extract_thief_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Rogue Subclass: Thief"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Sorcerer"
    )
    features = _level_features(nodes, start, end, "srd521.subclass-feature.rogue.thief")
    expected = {
        "Fast Hands",
        "Second-Story Work",
        "Supreme Sneak",
        "Use Magic Device",
        "Thief’s Reflexes",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Thief subclass feature extraction is incomplete")
    return features


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "rogue"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Rogue description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.rogue.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.rogue.starting-equipment.a",
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
                        "entityId": "srd521.equipment.weapon.shortbow",
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
                        "name": "Thieves’ Tools",
                        "quantity": 1,
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.burglars-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 8,
            },
            {
                "id": "srd521.option.class.rogue.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 100,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[RogueProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Rogue"},
        "tags": ["class", "rogue", "martial", "expertise"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 4 for level in range(1, 6)},
            },
            "weaponMasteryChoice": {
                "categories": ["simple"],
                "attackTypes": ["melee", "ranged"],
                "conditionalCategories": traits["conditionalWeaponProficiencies"],
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 5,
                "defaultAbilityScores": {
                    "strength": 10,
                    "dexterity": 15,
                    "constitution": 14,
                    "intelligence": 13,
                    "wisdom": 12,
                    "charisma": 8,
                },
                "defaultAbilityScoreImprovementAbility": "dexterity",
                "defaultClassSkillIds": [
                    "srd521.skill.acrobatics",
                    "srd521.skill.investigation",
                    "srd521.skill.sleight-of-hand",
                    "srd521.skill.stealth",
                ],
                "defaultGrantedFeatIds": [],
                "expertiseChoice": {
                    "sourceId": "srd521.class-feature.rogue.expertise",
                    "minimumLevel": 1,
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
                    "countByLevel": {str(level): 2 for level in range(1, 6)},
                },
            },
            "featureSaveAbility": "dexterity",
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": feature_ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "weaponMastery": 2,
                    "sneakAttack": {"diceCount": row.sneak_attack_dice, "diceSize": 6},
                }
                for row in progression
            ],
        },
        "rules": [],
        "review": _review("Rogue progression and Sneak Attack table from pages 61–63."),
    }


def _cunning_strike_options(feature: dict[str, Any]) -> list[dict[str, Any]]:
    common = {"source": feature["source"], "rules": []}
    definitions: dict[str, dict[str, Any]] = {
        "Poison": {
            "costDice": 1,
            "savingThrow": "constitution",
            "condition": "poisoned",
            "requires": "poisoners-kit",
        },
        "Trip": {
            "costDice": 1,
            "savingThrow": "dexterity",
            "condition": "prone",
            "maximumTargetSize": "large",
        },
        "Withdraw": {
            "costDice": 1,
            "movementSpeedFraction": 0.5,
            "provokesOpportunityAttacks": False,
        },
    }
    return [
        {
            **common,
            "id": CUNNING_STRIKE_OPTION_IDS[name],
            "kind": "class-option",
            "name": {"en": name},
            "tags": ["class-option", "rogue", "cunning-strike"],
            "body": {"choiceId": CUNNING_STRIKE_CHOICE_ID, **body},
            "review": _review(f"{name} Cunning Strike option."),
        }
        for name, body in definitions.items()
    ]


def _thief_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Rogue Subclass: Thief"
    )
    intro = nodes[nodes.index(heading) + 1]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Thief"},
        "tags": ["subclass", "rogue", "thief"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": feature_ids}
                for level, feature_ids in sorted(by_level.items())
            ],
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Thief subclass extracted from page 64."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _sneak_attack_table(
    progression: tuple[RogueProgressionRow, ...], source: dict[str, Any]
) -> dict[str, Any]:
    return {
        "id": "srd521.table.rogue.sneak-attack-dice",
        "kind": "rule-table",
        "name": {"en": "Rogue Sneak Attack Dice"},
        "tags": ["rule-table", "rogue"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.sneak_attack_dice for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Rogue class progression table."),
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
            "notes": ["Targets, turn state, and applied conditions remain assisted."],
        },
    }


def _always() -> dict[str, Any]:
    return {"kind": "all", "args": []}


def _sneak_attack_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "use-sneak-attack",
                "type": "grant-action",
                "target": "action.sneak-attack",
                "when": _always(),
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.rogue.sneak-attack-dice",
                    "key": {"kind": "ref", "path": "classLevel.rogue"},
                },
                "parameters": {
                    "actionEconomy": "on-hit",
                    "extraDamage": {
                        "diceSize": 6,
                        "type": "weapon-damage-type",
                        "frequency": "once-per-turn",
                    },
                    "requirements": ["finesse-or-ranged-weapon", "advantage-or-adjacent-ally"],
                },
                "automationLevel": "roll-assisted",
            }
        ],
    )


def _cunning_action_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": f"cunning-action-{action}",
                "type": "grant-action",
                "target": f"action.cunning-action.{action}",
                "when": _always(),
                "parameters": {"actionEconomy": "bonus-action", "grantsAction": action},
                "automationLevel": "sheet-automated",
            }
            for action in ("dash", "disengage", "hide")
        ],
    )


def _steady_aim_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "use-steady-aim",
                "type": "grant-action",
                "target": "action.steady-aim",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "grantsAction": "advantage-on-next-attack",
                    "requirements": ["has-not-moved-this-turn"],
                    "setsSpeed": 0,
                },
                "automationLevel": "roll-assisted",
            }
        ],
    )


def _cunning_strike_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "cunning-strike-poison",
                "type": "grant-action",
                "target": "action.cunning-strike.poison",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "on-sneak-attack",
                    "sneakAttackDiceCost": 1,
                    "savingThrow": {
                        "ability": "constitution",
                        "difficultyClassFact": "classFeature.rogue.saveDifficultyClass",
                    },
                    "requirements": ["poisoners-kit"],
                },
                "automationLevel": "roll-assisted",
            },
            {
                "id": "cunning-strike-trip",
                "type": "grant-action",
                "target": "action.cunning-strike.trip",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "on-sneak-attack",
                    "sneakAttackDiceCost": 1,
                    "savingThrow": {
                        "ability": "dexterity",
                        "difficultyClassFact": "classFeature.rogue.saveDifficultyClass",
                    },
                    "requirements": ["target-large-or-smaller"],
                },
                "automationLevel": "roll-assisted",
            },
            {
                "id": "cunning-strike-withdraw",
                "type": "grant-action",
                "target": "action.cunning-strike.withdraw",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "on-sneak-attack",
                    "sneakAttackDiceCost": 1,
                    "movement": {"speedFraction": 0.5, "provokesOpportunityAttacks": False},
                },
                "automationLevel": "roll-assisted",
            },
        ],
    )


def _uncanny_dodge_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "use-uncanny-dodge",
                "type": "grant-action",
                "target": "action.uncanny-dodge",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "reaction",
                    "damageReductionFraction": 0.5,
                    "requirements": ["visible-attacker-hit-with-attack-roll"],
                },
                "automationLevel": "roll-assisted",
            }
        ],
    )


def _fast_hands_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "fast-hands-sleight-of-hand",
                "type": "grant-action",
                "target": "action.fast-hands.sleight-of-hand",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "grantsAction": "sleight-of-hand-with-thieves-tools-or-pick-pocket",
                },
                "automationLevel": "roll-assisted",
            },
            {
                "id": "fast-hands-use-object",
                "type": "grant-action",
                "target": "action.fast-hands.use-object",
                "when": _always(),
                "parameters": {
                    "actionEconomy": "bonus-action",
                    "grantsAction": "utilize-or-magic-item-action",
                },
                "automationLevel": "roll-assisted",
            },
        ],
        kind="subclass-feature",
        parent_id=SUBCLASS_ID,
    )


def _second_story_work_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return _feature_ir(
        feature,
        [
            {
                "id": "thief-climb-speed",
                "type": "add-candidate-calculation",
                "target": "speed.climb",
                "expression": {"kind": "ref", "path": "speed.walking"},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
        kind="subclass-feature",
        parent_id=SUBCLASS_ID,
    )


def generate_rogue_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(extraction_root / "normalized" / "document.json")
    raw_page = read_json(extraction_root / "raw" / "pages" / "0062.json")
    nodes = list(document["nodes"])
    core_node = next(
        node
        for node in nodes
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Rogue Traits")
    )
    equipment_heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Starting Equipment"
    )
    equipment_node = nodes[nodes.index(equipment_heading) + 1]
    progression_node = next(
        node
        for node in nodes
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Rogue Features")
    )
    traits = parse_core_traits(core_node["normalizedText"], equipment_node["normalizedText"])
    progression = parse_progression(raw_page)
    features = extract_features(document)
    thief_features = extract_thief_features(document)
    progression_source = _source_spans([progression_node])[0]
    class_entity = _class_entity(
        traits,
        progression,
        features,
        _source_spans([core_node, equipment_heading, equipment_node, progression_node]),
    )
    cunning_strike = next(feature for feature in features if feature["name"] == "Cunning Strike")
    rogue_entities = [
        class_entity,
        *[_feature_entity(feature, "class-feature") for feature in features],
        _sneak_attack_table(progression, progression_source),
        *_cunning_strike_options(cunning_strike),
        *_thief_entities(document, thief_features),
    ]
    replacement_ids = {entity["id"] for entity in rogue_entities}
    existing = [
        entity
        for entity in read_json(output / "entities.json")
        if entity["id"] not in replacement_ids
    ]
    all_entities = [*existing, *rogue_entities]
    write_json(output / "entities" / "rogue.json", rogue_entities)
    write_json(output / "entities.json", all_entities)
    by_name = {feature["name"]: feature for feature in features}
    thief_by_name = {feature["name"]: feature for feature in thief_features}
    authoring = {
        "rogue.sneak-attack.json": _sneak_attack_ir(by_name["Sneak Attack"]),
        "rogue.cunning-action.json": _cunning_action_ir(by_name["Cunning Action"]),
        "rogue.steady-aim.json": _steady_aim_ir(by_name["Steady Aim"]),
        "rogue.cunning-strike.json": _cunning_strike_ir(by_name["Cunning Strike"]),
        "rogue.uncanny-dodge.json": _uncanny_dodge_ir(by_name["Uncanny Dodge"]),
        "thief.fast-hands.json": _fast_hands_ir(thief_by_name["Fast Hands"]),
        "thief.second-story-work.json": _second_story_work_ir(thief_by_name["Second-Story Work"]),
    }
    for filename, ir in authoring.items():
        write_json(output / "authoring-ir" / filename, ir)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Cleric through level 5, Druid through level 5, Fighter through level 5, "
        "Monk through level 5, Paladin through level 5, Ranger through level 5, Rogue through "
        "level 5, Wizard through level 5, Human, Soldier, equipment, and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedThiefFeatures": len(thief_features),
        "generatedEntities": [entity["id"] for entity in rogue_entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "rogue-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_rogue_content(options.extraction, options.output)
    print(
        f"Generated {len(report['generatedEntities'])} Rogue entities; "
        f"{report['progressionRows']} progression rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

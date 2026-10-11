"""Parse the Fighter level-1 vertical slice into typed content and draft rules."""

from __future__ import annotations

import argparse
import hashlib
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

SOURCE_ID = "wotc-srd-5.2.1-en"
CLASS_ID = "srd521.class.fighter"
DEFENSE_ID = "srd521.feat.fighting-style.defense"
FIGHTING_STYLE_IDS = [
    "srd521.feat.fighting-style.archery",
    DEFENSE_ID,
    "srd521.feat.fighting-style.great-weapon-fighting",
    "srd521.feat.fighting-style.two-weapon-fighting",
]
CHAMPION_ID = "srd521.subclass.fighter.champion"
ASI_ID = "srd521.feat.general.ability-score-improvement"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")


@dataclass(frozen=True, slots=True)
class FighterProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    second_wind: int
    weapon_mastery: int

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Fighter level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
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


def parse_progression(
    raw_page: dict[str, Any],
    table_region: dict[str, Any],
) -> tuple[FighterProgressionRow, ...]:
    rows: list[FighterProgressionRow] = []
    for line in _cluster_word_lines(_words_in_bbox(raw_page, table_region["bbox"])):
        if float(line[0]["bbox"][1]) < 418:
            continue
        columns: list[list[dict[str, Any]]] = [[] for _ in range(5)]
        for word in line:
            x = float(word["bbox"][0])
            column = 0 if x < 110 else 1 if x < 155 else 2 if x < 430 else 3 if x < 490 else 4
            columns[column].append(word)
        values = [_line_text(column) for column in columns]
        if not values[0].isdigit():
            continue
        rows.append(
            FighterProgressionRow(
                level=int(values[0]),
                proficiency_bonus=int(values[1].removeprefix("+")),
                feature_names=tuple(
                    feature.strip() for feature in values[2].split(",") if feature.strip()
                ),
                second_wind=int(values[3]),
                weapon_mastery=int(values[4]),
            )
        )
    if tuple(row.level for row in rows) != tuple(range(1, 21)):
        raise ValueError("Fighter progression table does not contain exactly levels 1–20")
    return tuple(rows)


def parse_core_traits(table_text: str) -> dict[str, Any]:
    pattern = re.compile(
        r"Core Fighter Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Fighter level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Armor Training (?P<armor>.+?) Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Fighter Traits table does not match the expected labels")
    skill_options = [
        option.strip().casefold()
        for option in re.split(r",| or ", match.group("skills"))
        if option.strip()
    ]
    return {
        "primaryAbilities": [
            value.strip().casefold() for value in match.group("primary").split(" or ")
        ],
        "hitPointDie": int(match.group("hit_die")),
        "savingThrowProficiencies": [
            value.strip().casefold() for value in match.group("saves").split(" and ")
        ],
        "skillProficiencyChoice": {
            "minimum": int(match.group("skill_count")),
            "maximum": int(match.group("skill_count")),
            "options": skill_options,
        },
        "weaponProficiencies": ["simple", "martial"],
        "armorTraining": ["light", "medium", "heavy", "shield"],
        "startingEquipmentText": match.group("equipment"),
    }


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


def extract_class_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes: list[dict[str, Any]] = [
        node for node in document["nodes"] if int(str(node["parentId"]).removeprefix("page-")) <= 48
    ]
    features: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        if node["kind"] != "HeadingNode":
            continue
        heading_match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if heading_match is None:
            continue
        body_nodes: list[dict[str, Any]] = []
        for following in nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] not in {"MetadataNode", "TableNode"}:
                body_nodes.append(following)
        if not body_nodes:
            raise ValueError(f"Feature has no body: {node['normalizedText']}")
        name = heading_match.group("name")
        level = int(heading_match.group("level"))
        feature_id = f"srd521.class-feature.fighter.{_slug(name)}"
        if any(feature["id"] == feature_id for feature in features):
            feature_id = f"{feature_id}.level-{level}"
        features.append(
            {
                "id": feature_id,
                "name": name,
                "level": level,
                "bodyNodes": body_nodes,
                "source": list(_source_spans_for_nodes([node, *body_nodes])),
            }
        )
    return tuple(features)


def extract_champion_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    page_nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0049"]
    start = next(
        index
        for index, node in enumerate(page_nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Fighter Subclass: Champion"
    )
    end = next(
        index
        for index, node in enumerate(page_nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Monk"
    )
    champion_nodes = page_nodes[start:end]
    features: list[dict[str, Any]] = []
    for index, node in enumerate(champion_nodes):
        if node["kind"] != "HeadingNode":
            continue
        match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if match is None:
            continue
        body_nodes: list[dict[str, Any]] = []
        for following in champion_nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            body_nodes.append(following)
        if not body_nodes:
            raise ValueError(f"Champion feature has no body: {node['normalizedText']}")
        name = match.group("name")
        features.append(
            {
                "id": f"srd521.subclass-feature.fighter.champion.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": list(_source_spans_for_nodes([node, *body_nodes])),
            }
        )
    expected = {
        "Improved Critical",
        "Remarkable Athlete",
        "Additional Fighting Style",
        "Heroic Warrior",
        "Superior Critical",
        "Survivor",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Champion feature extraction is incomplete")
    return tuple(features)


def _base_feature_name(name: str) -> str:
    return re.sub(r" \((?:one|two|three) uses?\)$", "", name)


def reconcile_progression(
    progression: tuple[FighterProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for row in progression:
        for listed_name in row.feature_names:
            name = _base_feature_name(listed_name)
            exact = next(
                (
                    feature
                    for feature in features
                    if feature["name"] == name and int(feature["level"]) == row.level
                ),
                None,
            )
            repeated = next(
                (feature for feature in features if feature["name"] == name),
                None,
            )
            if exact is not None:
                status = "resolved"
                entity_id = exact["id"]
            elif repeated is not None:
                status = "repeat-reference"
                entity_id = repeated["id"]
            elif name == "Subclass feature":
                status = "subclass-placeholder"
                entity_id = None
            else:
                status = "unresolved"
                entity_id = None
            entries.append(
                {
                    "level": row.level,
                    "name": listed_name,
                    "status": status,
                    "entityId": entity_id,
                }
            )
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
        "valid": not any(entry["status"] == "unresolved" for entry in entries),
    }


def _feature_text(feature: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": feature["name"],
        "nodes": [
            {"kind": node["kind"], "text": node["normalizedText"]} for node in feature["bodyNodes"]
        ],
    }


def _review(notes: str) -> dict[str, Any]:
    return {
        "status": "STRUCTURED",
        "extractionApproved": True,
        "semanticsApproved": False,
        "testsApproved": False,
        "notes": notes,
    }


def _feature_entity(feature: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": "class-feature",
        "name": {"en": feature["name"]},
        "tags": ["class-feature", "fighter", f"level-{feature['level']}"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "parentId": CLASS_ID,
            "text": _feature_text(feature),
            "automationLevel": "structured",
        },
        "rules": [],
        "review": _review("Executable rules are proposals in the authoring IR."),
    }


def _champion_entities(
    document: dict[str, Any],
    features: tuple[dict[str, Any], ...],
) -> list[dict[str, Any]]:
    page_nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0049"]
    heading_index = next(
        index
        for index, node in enumerate(page_nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Fighter Subclass: Champion"
    )
    introduction = page_nodes[heading_index : heading_index + 3]
    subclass = {
        "id": CHAMPION_ID,
        "kind": "subclass",
        "name": {"en": "Champion"},
        "tags": ["subclass", "fighter", "champion"],
        "source": list(_source_spans_for_nodes(introduction)),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {
                    "level": level,
                    "features": [
                        feature["id"] for feature in features if feature["level"] == level
                    ],
                }
                for level in sorted({int(feature["level"]) for feature in features})
            ],
            "text": {
                "title": "Champion",
                "nodes": [
                    {"kind": node["kind"], "text": node["normalizedText"]}
                    for node in introduction[1:]
                ],
            },
        },
        "rules": [],
        "review": _review("Champion extracted from Fighter subclass page 49."),
    }
    feature_entities = [
        {
            "id": feature["id"],
            "kind": "subclass-feature",
            "name": {"en": feature["name"]},
            "tags": [
                "subclass-feature",
                "fighter",
                "champion",
                f"level-{feature['level']}",
            ],
            "source": feature["source"],
            "body": {
                "level": feature["level"],
                "parentId": CHAMPION_ID,
                "text": _feature_text(feature),
                "automationLevel": "structured",
            },
            "rules": [],
            "review": _review("Executable rules are proposals in the authoring IR."),
        }
        for feature in features
    ]
    return [subclass, *feature_entities]


def _ability_score_improvement_entity(
    document: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    page_nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0087"]
    start = next(
        index
        for index, node in enumerate(page_nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Ability Score Improvement"
    )
    end = next(
        index
        for index, node in enumerate(page_nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Grappler"
    )
    nodes = page_nodes[start:end]
    text = " ".join(str(node["normalizedText"]) for node in nodes)
    if (
        "General Feat (Prerequisite: Level 4+)" not in text
        or "Increase one ability score of your choice by 2" not in text
        or "increase two ability scores of your choice by 1" not in text
        or "Repeatable." not in text
    ):
        raise ValueError("Ability Score Improvement feat text is incomplete")
    source = list(_source_spans_for_nodes(nodes))
    structured_text = {
        "title": "Ability Score Improvement",
        "nodes": [{"kind": node["kind"], "text": node["normalizedText"]} for node in nodes[1:]],
    }
    entity = {
        "id": ASI_ID,
        "kind": "feat",
        "name": {"en": "Ability Score Improvement"},
        "tags": ["feat", "general-feat"],
        "source": source,
        "body": {
            "category": "general",
            "repeatable": True,
            "prerequisite": {"minimumCharacterLevel": 4},
            "abilityScoreIncreasePatterns": [[2], [1, 1]],
            "maximumAbilityScore": 20,
            "text": structured_text,
        },
        "rules": [],
        "review": _review("Ability Score Improvement extracted from page 87."),
    }
    ir = {
        "schemaVersion": "0.1.0",
        "id": ASI_ID,
        "kind": "feat",
        "parentId": "srd521.class-feature.fighter.ability-score-improvement",
        "level": 4,
        "source": source,
        "text": structured_text,
        "proposedRules": [],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Selected increases are validated and materialized by the choice evaluator."],
        },
    }
    return entity, ir


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[FighterProgressionRow, ...],
    reconciliation: dict[str, Any],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {
        (int(entry["level"]), str(entry["name"])): entry["entityId"]
        for entry in reconciliation["entries"]
    }
    body = {
        **traits,
        "skillProficiencyChoice": {
            **traits.get("skillProficiencyChoice", {}),
            "countByLevel": {str(level): 2 for level in range(1, 9)},
        },
        "startingEquipment": {
            "id": "srd521.choice.class.fighter.starting-equipment",
            "minimum": 1,
            "maximum": 1,
            "options": [
                {
                    "id": "srd521.option.class.fighter.starting-equipment.a",
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
                            "entityId": "srd521.equipment.weapon.greatsword",
                            "quantity": 1,
                            "equipped": True,
                        },
                        {
                            "kind": "entity",
                            "entityId": "srd521.equipment.weapon.flail",
                            "quantity": 1,
                            "equipped": False,
                        },
                        {
                            "kind": "entity",
                            "entityId": "srd521.equipment.weapon.javelin",
                            "quantity": 8,
                            "equipped": False,
                        },
                        {
                            "kind": "entity",
                            "entityId": "srd521.equipment.gear.dungeoneers-pack",
                            "quantity": 1,
                            "equipped": False,
                        },
                    ],
                    "currencyGp": 4,
                },
                {
                    "id": "srd521.option.class.fighter.starting-equipment.b",
                    "label": "Package B",
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
                            "equipped": True,
                        },
                        {
                            "kind": "entity",
                            "entityId": "srd521.equipment.weapon.shortsword",
                            "quantity": 1,
                            "equipped": False,
                        },
                        {
                            "kind": "entity",
                            "entityId": "srd521.equipment.weapon.longbow",
                            "quantity": 1,
                            "equipped": False,
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
                            "kind": "entity",
                            "entityId": "srd521.equipment.gear.dungeoneers-pack",
                            "quantity": 1,
                            "equipped": False,
                        },
                    ],
                    "currencyGp": 11,
                },
                {
                    "id": "srd521.option.class.fighter.starting-equipment.c",
                    "label": "Package C",
                    "items": [],
                    "currencyGp": 155,
                },
            ],
        },
        "builder": {
            "supportedLevelMinimum": 1,
            "supportedLevelMaximum": 9,
            "defaultAbilityScores": {
                "strength": 15,
                "dexterity": 13,
                "constitution": 13,
                "intelligence": 10,
                "wisdom": 12,
                "charisma": 8,
            },
            "defaultAbilityScoreImprovementAbility": "strength",
            "defaultClassSkillIds": [
                "srd521.skill.perception",
                "srd521.skill.survival",
            ],
            "defaultGrantedFeatIds": [],
        },
        "fightingStyleChoice": {
            "id": "srd521.choice.fighter.fighting-style",
            "level": 1,
            "minimum": 1,
            "maximum": 1,
            "options": FIGHTING_STYLE_IDS,
            "defaultOptionIds": [DEFENSE_ID],
            "changeOn": ["level-up"],
            "replacementMaximum": 1,
            "featSelection": {
                "sourceFeatureId": "srd521.class-feature.fighter.fighting-style",
                "exclusiveGroup": "fighting-style",
            },
        },
        "progression": [
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
                "secondWind": row.second_wind,
                "weaponMastery": row.weapon_mastery,
            }
            for row in progression
        ],
    }
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Fighter"},
        "tags": ["class", "fighter"],
        "source": source,
        "body": body,
        "rules": [],
        "review": _review("Pages 47–48 Fighter vertical slice."),
    }


def _rule_table(
    progression: tuple[FighterProgressionRow, ...],
    source: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": "srd521.table.fighter.second-wind",
        "kind": "rule-table",
        "name": {"en": "Fighter Second Wind Uses"},
        "tags": ["rule-table", "fighter"],
        "source": [source],
        "body": {
            "keyType": "class-level",
            "valueType": "integer",
            "entries": {str(row.level): row.second_wind for row in progression},
        },
        "rules": [],
        "review": _review("Extracted from the Fighter Features table."),
    }


def _second_wind_ir(feature: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature["id"],
        "kind": "class-feature",
        "parentId": CLASS_ID,
        "level": 1,
        "source": feature["source"],
        "text": _feature_text(feature),
        "proposedRules": [
            {
                "id": "second-wind-resource",
                "type": "grant-resource",
                "target": "srd521.resource.fighter.second-wind",
                "expression": {
                    "kind": "tableLookup",
                    "table": "srd521.table.fighter.second-wind",
                    "key": {"kind": "ref", "path": "classLevel.fighter"},
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
                "id": "use-second-wind",
                "type": "grant-action",
                "target": "action.second-wind",
                "when": {
                    "kind": "all",
                    "args": [
                        {
                            "kind": "resourceAvailable",
                            "resourceId": "srd521.resource.fighter.second-wind",
                        },
                        {
                            "kind": "compare",
                            "op": "lt",
                            "left": {"kind": "ref", "path": "hitPoints.current"},
                            "right": {"kind": "ref", "path": "hitPoints.maximum"},
                        },
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
                    "resourceId": "srd521.resource.fighter.second-wind",
                    "healing": {
                        "diceCount": 1,
                        "diceSize": 10,
                        "bonusFact": "classLevel.fighter",
                    },
                },
                "automationLevel": "state-automated",
            },
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Healing resolution requires an explicit d10 roll."],
        },
    }


def _feature_ir(
    feature: dict[str, Any],
    proposed_rules: list[dict[str, Any]],
    notes: list[str] | None = None,
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
        "text": _feature_text(feature),
        "proposedRules": proposed_rules,
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": notes or [],
        },
    }


def _fighter_authoring_ir(
    features: tuple[dict[str, Any], ...],
    champion_features: tuple[dict[str, Any], ...],
) -> dict[str, dict[str, Any]]:
    by_name = {feature["name"]: feature for feature in features}
    champion_by_name = {feature["name"]: feature for feature in champion_features}
    action_surge = _feature_ir(
        by_name["Action Surge"],
        [
            {
                "id": "action-surge-resource",
                "type": "grant-resource",
                "target": "srd521.resource.fighter.action-surge",
                "expression": {
                    "kind": "if",
                    "condition": {
                        "kind": "compare",
                        "op": "gte",
                        "left": {"kind": "ref", "path": "classLevel.fighter"},
                        "right": {"kind": "literal", "value": 17},
                    },
                    "then": {"kind": "literal", "value": 2},
                    "else": {"kind": "literal", "value": 1},
                },
                "parameters": {
                    "recharge": [
                        {"event": "short-rest", "amount": "all"},
                        {"event": "long-rest", "amount": "all"},
                    ]
                },
                "automationLevel": "state-automated",
            },
            {
                "id": "use-action-surge",
                "type": "grant-action",
                "target": "action.action-surge",
                "when": {
                    "kind": "resourceAvailable",
                    "resourceId": "srd521.resource.fighter.action-surge",
                },
                "parameters": {
                    "actionEconomy": "on-your-turn",
                    "spends": 1,
                    "resourceId": "srd521.resource.fighter.action-surge",
                    "grantsAction": "one-additional-action",
                    "excludes": ["magic"],
                },
                "automationLevel": "state-automated",
            },
        ],
    )
    tactical_mind = _feature_ir(
        by_name["Tactical Mind"],
        [
            {
                "id": "use-tactical-mind",
                "type": "grant-action",
                "target": "action.tactical-mind",
                "when": {
                    "kind": "resourceAvailable",
                    "resourceId": "srd521.resource.fighter.second-wind",
                },
                "parameters": {
                    "actionEconomy": "failed-ability-check-trigger",
                    "resourceId": "srd521.resource.fighter.second-wind",
                    "checkBonus": {"diceCount": 1, "diceSize": 10},
                    "refundIfCheckStillFails": True,
                },
                "automationLevel": "roll-assisted",
            }
        ],
        ["The resource is spent only after the assisted check result is known."],
    )
    extra_attack = _feature_ir(
        by_name["Extra Attack"],
        [
            {
                "id": "fighter-extra-attack",
                "type": "set-attack-count",
                "target": "attackAction.attacks",
                "expression": {"kind": "literal", "value": 2},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
    )
    tactical_shift = _feature_ir(
        by_name["Tactical Shift"],
        [
            {
                "id": "use-tactical-shift",
                "type": "grant-action",
                "target": "action.tactical-shift",
                "when": {
                    "kind": "all",
                    "args": [
                        {
                            "kind": "resourceAvailable",
                            "resourceId": "srd521.resource.fighter.second-wind",
                        },
                        {
                            "kind": "compare",
                            "op": "lt",
                            "left": {"kind": "ref", "path": "hitPoints.current"},
                            "right": {"kind": "ref", "path": "hitPoints.maximum"},
                        },
                        {
                            "kind": "compare",
                            "op": "gt",
                            "left": {"kind": "ref", "path": "hitPoints.current"},
                            "right": {"kind": "literal", "value": 0},
                        },
                    ],
                },
                "parameters": {
                    "actionEconomy": "with-second-wind",
                    "movement": {
                        "speedFraction": 0.5,
                        "provokesOpportunityAttacks": False,
                    },
                },
                "automationLevel": "sheet-automated",
            }
        ],
    )
    improved_critical = _feature_ir(
        champion_by_name["Improved Critical"],
        [
            {
                "id": "champion-improved-critical",
                "type": "set-critical-threshold",
                "target": "weapon-attacks",
                "expression": {"kind": "literal", "value": 19},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
        kind="subclass-feature",
        parent_id=CHAMPION_ID,
    )
    remarkable_athlete = _feature_ir(
        champion_by_name["Remarkable Athlete"],
        [
            {
                "id": "remarkable-athlete-initiative",
                "type": "grant-advantage",
                "target": "initiative",
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "remarkable-athlete-athletics",
                "type": "grant-advantage",
                "target": "skill.athletics",
                "parameters": {},
                "automationLevel": "sheet-automated",
            },
            {
                "id": "remarkable-athlete-critical-move",
                "type": "grant-action",
                "target": "action.remarkable-athlete-critical-move",
                "when": {
                    "kind": "equals",
                    "left": {"kind": "literal", "value": True},
                    "right": {"kind": "literal", "value": True},
                },
                "parameters": {
                    "actionEconomy": "after-critical-hit",
                    "movement": {
                        "speedFraction": 0.5,
                        "provokesOpportunityAttacks": False,
                    },
                },
                "automationLevel": "sheet-automated",
            },
        ],
        kind="subclass-feature",
        parent_id=CHAMPION_ID,
    )
    indomitable_text = " ".join(
        node["normalizedText"] for node in by_name["Indomitable"]["bodyNodes"]
    )
    for phrase in [
        "fail a saving throw",
        "bonus equal to your Fighter level",
        "must use the new roll",
        "Long Rest",
        "level 13",
        "level 17",
    ]:
        if phrase not in indomitable_text:
            raise ValueError(f"Indomitable source is missing {phrase}")
    indomitable = _feature_ir(
        by_name["Indomitable"],
        [
            {
                "id": "indomitable-resource",
                "type": "grant-resource",
                "target": "srd521.resource.fighter.indomitable",
                "expression": {
                    "kind": "if",
                    "condition": {
                        "kind": "compare",
                        "op": "gte",
                        "left": {"kind": "ref", "path": "classLevel.fighter"},
                        "right": {"kind": "literal", "value": 17},
                    },
                    "then": {"kind": "literal", "value": 3},
                    "else": {
                        "kind": "if",
                        "condition": {
                            "kind": "compare",
                            "op": "gte",
                            "left": {"kind": "ref", "path": "classLevel.fighter"},
                            "right": {"kind": "literal", "value": 13},
                        },
                        "then": {"kind": "literal", "value": 2},
                        "else": {"kind": "literal", "value": 1},
                    },
                },
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": "use-indomitable",
                "type": "grant-action",
                "target": "action.indomitable",
                "when": {
                    "kind": "resourceAvailable",
                    "resourceId": "srd521.resource.fighter.indomitable",
                },
                "parameters": {
                    "actionEconomy": "no-action",
                    "spends": 1,
                    "resourceId": "srd521.resource.fighter.indomitable",
                    "failedSaveReroll": {"bonusFact": "classLevel.fighter"},
                },
                "automationLevel": "roll-assisted",
            },
        ],
        [
            "Declare a failed save. Spend one use, reroll with Fighter-level bonus, and use the "
            "new result. No Reaction is required. Failure resolution is manual."
        ],
    )
    return {
        "fighter.indomitable.json": indomitable,
        "fighter.action-surge.json": action_surge,
        "fighter.tactical-mind.json": tactical_mind,
        "fighter.extra-attack.json": extra_attack,
        "fighter.tactical-shift.json": tactical_shift,
        "champion.improved-critical.json": improved_critical,
        "champion.remarkable-athlete.json": remarkable_athlete,
    }


def _defense_entity_and_ir(nodes: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    defense_nodes = nodes[:3]
    source = list(_source_spans_for_nodes(defense_nodes))
    text = {
        "title": "Defense",
        "nodes": [
            {"kind": node["kind"], "text": node["normalizedText"]} for node in defense_nodes[1:]
        ],
    }
    entity = {
        "id": DEFENSE_ID,
        "kind": "feat",
        "name": {"en": "Defense"},
        "tags": ["feat", "fighting-style"],
        "source": source,
        "body": {
            "category": "fighting-style",
            "text": text,
            "requiresAnyFeatureIds": [
                "srd521.class-feature.fighter.fighting-style",
                "srd521.class-feature.paladin.fighting-style",
                "srd521.class-feature.ranger.fighting-style",
            ],
        },
        "rules": [],
        "review": _review("Defense Fighting Style extracted from page 88."),
    }
    ir = {
        "schemaVersion": "0.1.0",
        "id": DEFENSE_ID,
        "kind": "feat",
        "parentId": "srd521.class-feature.fighter.fighting-style",
        "level": 1,
        "source": source,
        "text": text,
        "proposedRules": [
            {
                "id": "defense-armor-class",
                "type": "add-modifier",
                "target": "armor-class",
                "when": {
                    "kind": "equals",
                    "left": {"kind": "ref", "path": "equipment.wearingArmor"},
                    "right": {"kind": "literal", "value": True},
                },
                "expression": {"kind": "literal", "value": 1},
                "parameters": {"stackingKey": "fighting-style.defense"},
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
    return entity, ir


def extract_fighting_styles(document: dict[str, Any]) -> list[dict[str, Any]]:
    names = {"Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"}
    nodes = list(document["nodes"])
    entities: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        if node["kind"] != "HeadingNode" or node["normalizedText"] not in names:
            continue
        selected = [node]
        for following in nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] != "MetadataNode":
                selected.append(following)
        name = node["normalizedText"]
        body: dict[str, Any] = {
            "category": "fighting-style",
            "requiresAnyFeatureIds": [
                "srd521.class-feature.fighter.fighting-style",
                "srd521.class-feature.paladin.fighting-style",
                "srd521.class-feature.ranger.fighting-style",
            ],
            "automationLevel": "assisted",
            "text": {
                "title": name,
                "nodes": [
                    {"kind": part["kind"], "text": part["normalizedText"]} for part in selected[1:]
                ],
            },
        }
        if name == "Archery":
            text = " ".join(str(part["normalizedText"]) for part in selected[1:])
            bonus = re.search(r"\+(\d+) bonus to attack rolls you make with Ranged weapons", text)
            if bonus is None:
                raise ValueError("Archery attack bonus could not be extracted")
            body["weaponAttackModifiers"] = [{"attackType": "ranged", "bonus": int(bonus.group(1))}]
            body["automationLevel"] = "sheet-automated"
        elif name == "Great Weapon Fighting":
            body["weaponDamageDieMinimums"] = [
                {
                    "attackType": "melee",
                    "anyProperties": ["two-handed", "versatile"],
                    "requiresTwoHands": True,
                    "minimum": 3,
                }
            ]
            body["automationLevel"] = "roll-automated"
        elif name == "Two-Weapon Fighting":
            body["extraAttackAbilityModifiers"] = [{"weaponProperty": "light"}]
            body["automationLevel"] = "roll-automated"
        entities.append(
            {
                "id": f"srd521.feat.fighting-style.{_slug(name)}",
                "kind": "feat",
                "name": {"en": name},
                "tags": ["feat", "fighting-style"],
                "body": body,
                "rules": [],
                "source": list(_source_spans_for_nodes(selected)),
                "review": _review(
                    "Fighting Style extracted from pages 87–88; semantics need independent review."
                ),
            }
        )
    if {entity["name"]["en"] for entity in entities} != names:
        raise ValueError("Fighting Style extraction is incomplete")
    return entities


def _grappler_entity(document: dict[str, Any]) -> dict[str, Any]:
    nodes = document["nodes"]
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Grappler"
    )
    selected = [nodes[start]]
    for node in nodes[start + 1 :]:
        if node["kind"] == "HeadingNode":
            break
        if node["kind"] != "MetadataNode":
            selected.append(node)
    text = " ".join(node["normalizedText"] for node in selected)
    for phrase in [
        "Level 4+",
        "Strength or Dexterity 13+",
        "Increase your Strength or Dexterity score by 1",
        "to a maximum of 20",
        "Grappled by you",
        "only once per turn",
        "your size or smaller",
    ]:
        if phrase not in text:
            raise ValueError(f"Grappler source is missing {phrase}")
    return {
        "id": "srd521.feat.general.grappler",
        "kind": "feat",
        "name": {"en": "Grappler"},
        "tags": ["feat", "general"],
        "source": list(_source_spans_for_nodes(selected)),
        "body": {
            "category": "general",
            "repeatable": False,
            "prerequisite": {
                "minimumCharacterLevel": 4,
                "anyAbilityScoreMinimums": [
                    {"ability": "strength", "minimum": 13},
                    {"ability": "dexterity", "minimum": 13},
                ],
            },
            "abilityScoreIncreasePatterns": [[1]],
            "abilityScoreIncreaseAbilities": ["strength", "dexterity"],
            "maximumAbilityScore": 20,
            "combatGuidance": [
                "Punch and Grab: once per turn, after hitting a creature with an Unarmed Strike "
                "as part of the Attack action on your turn, use both the Damage and Grapple "
                "options. Resolve the target's save and Grappled condition on its sheet.",
                "Attack Advantage: you have Advantage on attack rolls against a creature Grappled "
                "by you, not a creature grappled by someone else. Resolve cancellation with "
                "Disadvantage normally.",
                "Fast Wrestler: moving a creature Grappled by you costs no extra movement if it "
                "is your size or smaller. Resolve size, movement, and remaining Speed manually.",
            ],
            "automationLevel": "roll-assisted",
            "text": {
                "title": "Grappler",
                "nodes": [
                    {"kind": node["kind"], "text": node["normalizedText"]} for node in selected[1:]
                ],
            },
        },
        "rules": [],
        "review": _review(
            "Source-linked Grappler; ability increases automated, target-specific combat benefits "
            "assisted. Independent review outstanding."
        ),
    }


def generate_fighter_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    raw_page = read_json(extraction_root / "raw" / "pages" / "0047.json")
    layout = read_json(extraction_root / "layout" / "pages" / "0047.json")
    document = read_json(extraction_root / "normalized" / "document.json")
    core_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "left-column-table"
    )
    progression_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["regionType"] == "full-width-table"
    )
    progression_region = next(
        region for region in layout["tableRegions"] if region["regionType"] == "full-width-table"
    )
    traits = parse_core_traits(core_node["normalizedText"])
    progression = parse_progression(raw_page, progression_region)
    features = extract_class_features(document)
    reconciliation = reconcile_progression(progression, features)
    if not reconciliation["valid"]:
        raise ValueError("Fighter progression contains unresolved feature references")

    class_source = list(_source_spans_for_nodes([core_node, progression_node]))
    progression_source = next(source for source in class_source if source["page"] == 47)
    class_entity = _class_entity(traits, progression, reconciliation, class_source)
    feature_entities = [_feature_entity(feature) for feature in features]
    tactical_master = next(
        entity for entity in feature_entities if entity["name"]["en"] == "Tactical Master"
    )
    tactical_text = " ".join(node["text"] for node in tactical_master["body"]["text"]["nodes"])
    if "replace that property" not in tactical_text or "Push, Sap, or Slow" not in tactical_text:
        raise ValueError("Tactical Master source is incomplete")
    tactical_master["body"]["weaponMasteryReplacements"] = ["push", "sap", "slow"]
    tactical_master["body"]["automationLevel"] = "roll-assisted"
    champion_features = extract_champion_features(document)
    champion_entities = _champion_entities(document, champion_features)
    champion_entities[0]["body"]["additionalFightingStyleChoice"] = {
        "id": "srd521.choice.fighter.champion.additional-fighting-style",
        "level": 7,
        "minimum": 1,
        "maximum": 1,
        "options": FIGHTING_STYLE_IDS,
        "defaultOptionIds": [FIGHTING_STYLE_IDS[0]],
        "featSelection": {
            "sourceFeatureId": "srd521.subclass-feature.fighter.champion.additional-fighting-style",
            "exclusiveGroup": "fighting-style",
        },
    }
    asi_entity, asi_ir = _ability_score_improvement_entity(document)
    second_wind = next(feature for feature in features if feature["name"] == "Second Wind")
    defense_nodes = [node for node in document["nodes"] if str(node["parentId"]) == "page-0088"]
    defense_entity, defense_ir = _defense_entity_and_ir(defense_nodes)
    fighting_styles = [
        entity for entity in extract_fighting_styles(document) if entity["id"] != DEFENSE_ID
    ]
    second_wind_table = _rule_table(progression, progression_source)
    fighter_entities = [
        class_entity,
        *feature_entities,
        second_wind_table,
        defense_entity,
        *fighting_styles,
        *champion_entities,
        asi_entity,
        _grappler_entity(document),
    ]
    existing = read_json(output / "entities.json")
    replacements = {entity["id"]: entity for entity in fighter_entities}
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in fighter_entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "fighter.json", fighter_entities)
    write_json(output / "entities.json", all_entities)
    write_json(output / "authoring-ir" / "fighter.second-wind.json", _second_wind_ir(second_wind))
    write_json(output / "authoring-ir" / "fighting-style.defense.json", defense_ir)
    write_json(output / "authoring-ir" / "feat.ability-score-improvement.json", asi_ir)
    for filename, ir in _fighter_authoring_ir(features, champion_features).items():
        write_json(output / "authoring-ir" / filename, ir)
    write_json(output / "indexes" / "fighter-reconciliation.json", reconciliation)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Fighter through level 9, Human, Soldier, and equipment content. "
        "Proposed executable rules remain under review."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedChampionFeatures": len(champion_features),
        "generatedEntities": [entity["id"] for entity in fighter_entities],
        "reconciliation": reconciliation["counts"],
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "fighter-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_fighter_content(options.extraction, options.output)
    print(
        f"Generated {len(report['generatedEntities'])} Fighter entities; "
        f"{report['progressionRows']} progression rows"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

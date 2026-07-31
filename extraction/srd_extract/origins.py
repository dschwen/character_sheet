"""Parse the Human and Soldier origin vertical slice into typed content."""

from __future__ import annotations

import argparse
import hashlib
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

SOURCE_ID = "wotc-srd-5.2.1-en"
SOLDIER_ID = "srd521.background.soldier"
HUMAN_ID = "srd521.species.human"
SAVAGE_ATTACKER_ID = "srd521.feat.origin.savage-attacker"
SKILLED_ID = "srd521.feat.origin.skilled"
ORIGIN_IDS = {SOLDIER_ID, HUMAN_ID, SAVAGE_ATTACKER_ID, SKILLED_ID}


def _quote_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _source_spans(nodes: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    by_page: dict[int, dict[str, Any]] = defaultdict(lambda: {"blocks": [], "texts": []})
    for node in nodes:
        page = int(str(node["parentId"]).removeprefix("page-"))
        by_page[page]["blocks"].extend(node["sourceBlocks"])
        by_page[page]["texts"].append(node["normalizedText"])
    return [
        {
            "sourceId": SOURCE_ID,
            "page": page,
            "blocks": list(dict.fromkeys(values["blocks"])),
            "quoteHash": _quote_hash("\n".join(values["texts"])),
        }
        for page, values in sorted(by_page.items())
    ]


def _section(
    nodes: list[dict[str, Any]],
    heading: str,
    ending_heading: str,
) -> list[dict[str, Any]]:
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == heading
    )
    end = next(
        index
        for index, node in enumerate(nodes[start + 1 :], start + 1)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == ending_heading
    )
    return nodes[start:end]


def _text(nodes: Iterable[dict[str, Any]]) -> str:
    return " ".join(str(node["normalizedText"]) for node in nodes)


def parse_soldier(text: str) -> dict[str, Any]:
    match = re.fullmatch(
        r"Soldier Ability Scores: (?P<abilities>.+?) "
        r"Feat: (?P<feat>.+?) \(see “Feats”\) "
        r"Skill Proficiencies: (?P<skills>.+?) "
        r"Tool Proficiency: (?P<tool>.+?) "
        r"Equipment: (?P<equipment>.+)",
        text,
    )
    if match is None:
        raise ValueError("Soldier background does not match the expected fields")
    abilities = [value.casefold() for value in re.split(r", | and ", match.group("abilities"))]
    skills = [value.casefold() for value in match.group("skills").split(" and ")]
    if abilities != ["strength", "dexterity", "constitution"]:
        raise ValueError(f"Unexpected Soldier abilities: {abilities}")
    if skills != ["athletics", "intimidation"]:
        raise ValueError(f"Unexpected Soldier skills: {skills}")
    if match.group("feat") != "Savage Attacker":
        raise ValueError(f"Unexpected Soldier feat: {match.group('feat')}")
    return {
        "abilityScoreOptions": abilities,
        "abilityScoreIncreasePatterns": [[2, 1], [1, 1, 1]],
        "featId": SAVAGE_ATTACKER_ID,
        "skillProficiencies": [f"srd521.skill.{skill}" for skill in skills],
        "toolProficiencyChoice": {
            "minimum": 1,
            "maximum": 1,
            "category": "gaming-set",
            "text": match.group("tool"),
        },
        "equipmentText": match.group("equipment"),
    }


def parse_human(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>.+?), chosen when you select this species", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    traits = re.search(r"As a Human, you have these special traits\. (?P<value>.+)", text)
    if creature_type is None or size is None or speed is None or traits is None:
        raise ValueError("Human species does not match the expected fields")
    size_options = [
        value.casefold() for value in re.findall(r"\b(Medium|Small)\b", size.group("value"))
    ]
    trait_text = traits.group("value")
    required_phrases = (
        "Resourceful. You gain Heroic Inspiration whenever you finish a Long Rest.",
        "Skillful. You gain proficiency in one skill of your choice.",
        "Versatile. You gain an Origin feat of your choice",
    )
    if not all(phrase in trait_text for phrase in required_phrases):
        raise ValueError("Human trait text is incomplete")
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": size_options,
        "walkingSpeed": int(speed.group("value")),
        "longRestGrantsHeroicInspiration": True,
        "skillProficiencyChoice": {
            "minimum": 1,
            "maximum": 1,
            "options": "any-skill",
        },
        "originFeatChoice": {
            "minimum": 1,
            "maximum": 1,
            "category": "origin",
        },
        "recommendedOriginFeatId": SKILLED_ID,
        "traitsText": trait_text,
    }


def parse_origin_feat(name: str, text: str) -> dict[str, Any]:
    if not text.startswith(f"{name} Origin Feat "):
        raise ValueError(f"{name} is not labeled as an Origin Feat")
    description = text.removeprefix(f"{name} Origin Feat ")
    if name == "Savage Attacker":
        if "roll the weapon’s damage dice twice and use either roll" not in description:
            raise ValueError("Savage Attacker benefit text is incomplete")
        return {
            "category": "origin",
            "repeatable": False,
            "trigger": "once-per-turn-weapon-hit",
            "weaponDamageRolls": 2,
            "chooseDamageRoll": "either",
            "description": description,
        }
    if name == "Skilled":
        if "three skills or tools of your choice" not in description:
            raise ValueError("Skilled benefit text is incomplete")
        return {
            "category": "origin",
            "repeatable": True,
            "proficiencyChoice": {
                "minimum": 3,
                "maximum": 3,
                "categories": ["skill", "tool"],
            },
            "description": description,
        }
    raise ValueError(f"Unsupported Origin feat: {name}")


def _review(note: str) -> dict[str, Any]:
    return {
        "status": "STRUCTURED",
        "extractionApproved": True,
        "semanticsApproved": False,
        "testsApproved": False,
        "notes": note,
    }


def _entity(
    entity_id: str,
    kind: str,
    name: str,
    tags: list[str],
    source: list[dict[str, Any]],
    body: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": entity_id,
        "kind": kind,
        "name": {"en": name},
        "tags": tags,
        "source": source,
        "body": body,
        "rules": [],
        "review": _review(f"{name} extracted for the first character-origin vertical slice."),
    }


def _savage_attacker_ir(
    source: list[dict[str, Any]],
    body_nodes: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": SAVAGE_ATTACKER_ID,
        "kind": "feat",
        "parentId": SOLDIER_ID,
        "level": 1,
        "source": source,
        "text": {
            "title": "Savage Attacker",
            "nodes": [
                {"kind": node["kind"], "text": node["normalizedText"]} for node in body_nodes
            ],
        },
        "proposedRules": [
            {
                "id": "savage-attacker-damage-reroll",
                "type": "grant-action",
                "target": "action.savage-attacker",
                "when": {
                    "kind": "equals",
                    "left": {"kind": "literal", "value": True},
                    "right": {"kind": "literal", "value": True},
                },
                "parameters": {
                    "actionEconomy": "once-per-turn-trigger",
                    "damageReroll": {
                        "rolls": 2,
                        "choose": "either",
                        "appliesTo": "weapon-damage-dice",
                    },
                },
                "automationLevel": "roll-assisted",
            }
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["The engine exposes the option but does not roll weapon damage."],
        },
    }


def generate_origin_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(extraction_root / "normalized" / "document.json")
    nodes = document["nodes"]
    soldier_nodes = _section(nodes, "Soldier", "Character Species")
    human_nodes = _section(nodes, "Human", "Orc")
    savage_nodes = _section(nodes, "Savage Attacker", "Skilled")
    skilled_nodes = _section(nodes, "Skilled", "General Feats")

    soldier = _entity(
        SOLDIER_ID,
        "background",
        "Soldier",
        ["background", "origin"],
        _source_spans(soldier_nodes),
        parse_soldier(_text(soldier_nodes)),
    )
    human = _entity(
        HUMAN_ID,
        "species",
        "Human",
        ["species", "humanoid"],
        _source_spans(human_nodes),
        parse_human(_text(human_nodes)),
    )
    savage_source = _source_spans(savage_nodes)
    savage_attacker = _entity(
        SAVAGE_ATTACKER_ID,
        "feat",
        "Savage Attacker",
        ["feat", "origin-feat"],
        savage_source,
        parse_origin_feat("Savage Attacker", _text(savage_nodes)),
    )
    skilled = _entity(
        SKILLED_ID,
        "feat",
        "Skilled",
        ["feat", "origin-feat"],
        _source_spans(skilled_nodes),
        parse_origin_feat("Skilled", _text(skilled_nodes)),
    )
    origin_entities = [soldier, human, savage_attacker, skilled]
    existing = [
        entity for entity in read_json(output / "entities.json") if entity["id"] not in ORIGIN_IDS
    ]
    all_entities = [*existing, *origin_entities]
    write_json(output / "entities" / "origins.json", origin_entities)
    write_json(output / "entities.json", all_entities)
    write_json(
        output / "authoring-ir" / "origin.savage-attacker.json",
        _savage_attacker_ir(savage_source, savage_nodes[1:]),
    )
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Fighter level-1, Human, Soldier, origin-feat, and equipment "
        "proof-of-concept content. Proposed executable rules remain under review."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "generatedEntities": [entity["id"] for entity in origin_entities],
        "soldier": soldier["body"],
        "human": human["body"],
        "originFeats": {
            SAVAGE_ATTACKER_ID: savage_attacker["body"],
            SKILLED_ID: skilled["body"],
        },
    }
    write_json(output / "origins-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_origin_content(options.extraction, options.output)
    print(f"Generated {len(report['generatedEntities'])} character-origin entities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

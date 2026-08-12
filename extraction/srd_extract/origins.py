"""Parse the SRD backgrounds, Human, and Origin feats into typed content."""

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
BACKGROUND_IDS = {
    "Acolyte": "srd521.background.acolyte",
    "Criminal": "srd521.background.criminal",
    "Sage": "srd521.background.sage",
    "Soldier": "srd521.background.soldier",
}
HUMAN_ID = "srd521.species.human"
DWARF_ID = "srd521.species.dwarf"
ALERT_ID = "srd521.feat.origin.alert"
MAGIC_INITIATE_IDS = {
    "cleric": "srd521.feat.origin.magic-initiate.cleric",
    "druid": "srd521.feat.origin.magic-initiate.druid",
    "wizard": "srd521.feat.origin.magic-initiate.wizard",
}
SAVAGE_ATTACKER_ID = "srd521.feat.origin.savage-attacker"
SKILLED_ID = "srd521.feat.origin.skilled"
ORIGIN_IDS = {
    *BACKGROUND_IDS.values(),
    HUMAN_ID,
    DWARF_ID,
    ALERT_ID,
    *MAGIC_INITIATE_IDS.values(),
    SAVAGE_ATTACKER_ID,
    SKILLED_ID,
}

FEAT_IDS = {
    "Alert": ALERT_ID,
    "Magic Initiate (Cleric)": MAGIC_INITIATE_IDS["cleric"],
    "Magic Initiate (Druid)": MAGIC_INITIATE_IDS["druid"],
    "Magic Initiate (Wizard)": MAGIC_INITIATE_IDS["wizard"],
    "Savage Attacker": SAVAGE_ATTACKER_ID,
    "Skilled": SKILLED_ID,
}


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


def parse_background(name: str, text: str) -> dict[str, Any]:
    match = re.fullmatch(
        rf"{re.escape(name)} Ability Scores: (?P<abilities>.+?) "
        r"Feat: (?P<feat>.+?) \(see “Feats”\) "
        r"Skill Proficiencies: (?P<skills>.+?) "
        r"Tool Proficiency: (?P<tool>.+?) "
        r"Equipment: (?P<equipment>.+)",
        text,
    )
    if match is None:
        raise ValueError(f"{name} background does not match the expected fields")
    abilities = [value.casefold() for value in re.split(r", | and ", match.group("abilities"))]
    skills = [value.casefold() for value in match.group("skills").split(" and ")]
    if len(abilities) != 3:
        raise ValueError(f"{name} must grant exactly three ability-score options")
    if len(skills) != 2:
        raise ValueError(f"{name} must grant exactly two skill proficiencies")
    feat_name = match.group("feat")
    if feat_name not in FEAT_IDS:
        raise ValueError(f"Unsupported {name} feat: {feat_name}")
    return {
        "abilityScoreOptions": abilities,
        "abilityScoreIncreasePatterns": [[2, 1], [1, 1, 1]],
        "featId": FEAT_IDS[feat_name],
        "skillProficiencies": [f"srd521.skill.{skill.replace(' ', '-')}" for skill in skills],
        "toolProficiencyChoice": {
            "minimum": 1,
            "maximum": 1,
            "category": "tool",
            "text": match.group("tool"),
        },
        "equipmentText": match.group("equipment").replace("Callig- rapher", "Calligrapher"),
    }


def parse_soldier(text: str) -> dict[str, Any]:
    """Retain the original focused parser API for downstream callers."""
    return parse_background("Soldier", text)


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


def parse_dwarf(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    traits = re.search(r"As a Dwarf, you have these special traits\. (?P<value>.+)", text)
    if creature_type is None or size is None or speed is None or traits is None:
        raise ValueError("Dwarf species does not match the expected fields")
    trait_text = traits.group("value")
    required_phrases = (
        "Darkvision with a range of 120 feet",
        "Resistance to Poison damage",
        "Advantage on saving throws you make to avoid or end the Poisoned condition",
        "Hit Point maximum increases by 1",
        "Tremorsense with a range of 60 feet for 10 minutes",
        "number of times equal to your Proficiency Bonus",
        "finish a Long Rest",
    )
    if not all(phrase in trait_text for phrase in required_phrases):
        raise ValueError("Dwarf trait text is incomplete")
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 120,
        "damageResistances": ["poison"],
        "hitPointMaximumPerCharacterLevel": 1,
        "conditionalRollEffects": [
            {
                "testIds": "saving-throws",
                "kind": "advantage",
                "situationalTag": "avoid-or-end-poisoned",
                "source": "Dwarven Resilience",
            }
        ],
        "resources": [
            {
                "id": "srd521.resource.dwarf.stonecunning",
                "maximum": "proficiency-bonus",
                "recharge": [{"event": "long-rest", "amount": "all"}],
            }
        ],
        "actions": [
            {
                "id": "srd521.action.dwarf.stonecunning",
                "actionEconomy": "bonus-action",
                "resourceId": "srd521.resource.dwarf.stonecunning",
                "spends": 1,
                "sense": "tremorsense",
                "range": 60,
                "duration": "10 minutes",
                "requirement": "Touching a natural or worked stone surface",
            }
        ],
        "traitNames": ["Darkvision", "Dwarven Resilience", "Dwarven Toughness", "Stonecunning"],
        "traitsText": trait_text,
    }


def parse_origin_feat(
    name: str,
    text: str,
    *,
    spell_list: str | None = None,
) -> dict[str, Any]:
    if not text.startswith(f"{name} Origin Feat "):
        raise ValueError(f"{name} is not labeled as an Origin Feat")
    description = text.removeprefix(f"{name} Origin Feat ")
    if name == "Alert":
        if (
            "add your Proficiency Bonus" not in description
            or "swap your Initiative" not in description
        ):
            raise ValueError("Alert benefit text is incomplete")
        return {
            "category": "origin",
            "repeatable": False,
            "initiativeProficiency": True,
            "initiativeSwap": True,
            "description": description,
        }
    if name == "Magic Initiate":
        if (
            "Two Cantrips" not in description
            or "Level 1 Spell" not in description
            or "Spell Change" not in description
        ):
            raise ValueError("Magic Initiate benefit text is incomplete")
        if spell_list not in MAGIC_INITIATE_IDS:
            raise ValueError("Magic Initiate requires a Cleric, Druid, or Wizard spell list")
        return {
            "category": "origin",
            "repeatable": False,
            "spellListClassId": f"srd521.class.{spell_list}",
            "spellcastingAbilityChoice": ["intelligence", "wisdom", "charisma"],
            "cantripChoice": {"minimum": 2, "maximum": 2},
            "levelOneSpellChoice": {"minimum": 1, "maximum": 1},
            "freeCastRecharge": "long-rest",
            "spellChange": {"event": "level-up", "replacementMaximum": 1},
            "description": description,
        }
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
        "parentId": BACKGROUND_IDS["Soldier"],
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


def _alert_ir(
    source: list[dict[str, Any]],
    body_nodes: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": ALERT_ID,
        "kind": "feat",
        "parentId": BACKGROUND_IDS["Criminal"],
        "level": 1,
        "source": source,
        "text": {
            "title": "Alert",
            "nodes": [
                {"kind": node["kind"], "text": node["normalizedText"]} for node in body_nodes
            ],
        },
        "proposedRules": [
            {
                "id": "alert-initiative-proficiency",
                "type": "add-modifier",
                "target": "initiative",
                "expression": {"kind": "ref", "path": "proficiencyBonus"},
                "parameters": {},
                "automationLevel": "sheet-automated",
            }
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Initiative Swap remains a player-coordinated action."],
        },
    }


def generate_origin_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(extraction_root / "normalized" / "document.json")
    nodes = document["nodes"]
    background_sections = {
        "Acolyte": _section(nodes, "Acolyte", "Criminal"),
        "Criminal": _section(nodes, "Criminal", "Sage"),
        "Sage": _section(nodes, "Sage", "Soldier"),
        "Soldier": _section(nodes, "Soldier", "Character Species"),
    }
    human_nodes = _section(nodes, "Human", "Orc")
    dwarf_nodes = _section(nodes, "Dwarf", "Elf")
    alert_nodes = _section(nodes, "Alert", "Magic Initiate")
    magic_initiate_nodes = _section(nodes, "Magic Initiate", "Savage Attacker")
    savage_nodes = _section(nodes, "Savage Attacker", "Skilled")
    skilled_nodes = _section(nodes, "Skilled", "General Feats")

    backgrounds = [
        _entity(
            BACKGROUND_IDS[name],
            "background",
            name,
            ["background", "origin"],
            _source_spans(background_sections[name]),
            parse_background(name, _text(background_sections[name])),
        )
        for name in ("Soldier", "Acolyte", "Criminal", "Sage")
    ]
    human = _entity(
        HUMAN_ID,
        "species",
        "Human",
        ["species", "humanoid"],
        _source_spans(human_nodes),
        parse_human(_text(human_nodes)),
    )
    dwarf = _entity(
        DWARF_ID,
        "species",
        "Dwarf",
        ["species", "humanoid", "dwarf"],
        _source_spans(dwarf_nodes),
        parse_dwarf(_text(dwarf_nodes)),
    )
    alert_source = _source_spans(alert_nodes)
    alert = _entity(
        ALERT_ID,
        "feat",
        "Alert",
        ["feat", "origin-feat"],
        alert_source,
        parse_origin_feat("Alert", _text(alert_nodes)),
    )
    magic_initiate_source = _source_spans(magic_initiate_nodes)
    magic_initiates = [
        _entity(
            MAGIC_INITIATE_IDS[spell_list],
            "feat",
            f"Magic Initiate ({spell_list.title()})",
            ["feat", "origin-feat", "magic-initiate", spell_list],
            magic_initiate_source,
            parse_origin_feat(
                "Magic Initiate",
                _text(magic_initiate_nodes),
                spell_list=spell_list,
            ),
        )
        for spell_list in ("cleric", "druid", "wizard")
    ]
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
    origin_entities = [
        *backgrounds,
        human,
        dwarf,
        savage_attacker,
        skilled,
        alert,
        *magic_initiates,
    ]
    existing = read_json(output / "entities.json")
    origin_positions = [
        index for index, entity in enumerate(existing) if entity["id"] in ORIGIN_IDS
    ]
    insertion_index = min(origin_positions, default=len(existing))
    retained = [entity for entity in existing if entity["id"] not in ORIGIN_IDS]
    all_entities = [
        *retained[:insertion_index],
        *origin_entities,
        *retained[insertion_index:],
    ]
    write_json(output / "entities" / "origins.json", origin_entities)
    write_json(output / "entities.json", all_entities)
    write_json(
        output / "authoring-ir" / "origin.savage-attacker.json",
        _savage_attacker_ir(savage_source, savage_nodes[1:]),
    )
    write_json(
        output / "authoring-ir" / "origin.alert.json",
        _alert_ir(alert_source, alert_nodes[1:]),
    )
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    coverage["note"] = (
        "Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, "
        "Warlock, and Wizard through level 5; all four SRD backgrounds; Human and Dwarf; equipment; "
        "and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "generatedEntities": [entity["id"] for entity in origin_entities],
        "backgrounds": {entity["id"]: entity["body"] for entity in backgrounds},
        "human": human["body"],
        "dwarf": dwarf["body"],
        "originFeats": {
            ALERT_ID: alert["body"],
            **{entity["id"]: entity["body"] for entity in magic_initiates},
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

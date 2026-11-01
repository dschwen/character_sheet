"""Generate out-of-SRD edition-reference feat records (the Ritual Caster variants).

Ritual Caster appears in no SRD edition, so these records carry no span in the pinned source.
Their rules text was supplied by the project owner, their provenance is an explicit edition
reference, their quote hash covers the record's own text, and their review status is AUTHORED.
See docs/adr/0013-out-of-source-edition-reference-records.md.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

RITUAL_2014_ID = "dnd2014.feat.general.ritual-caster"
RITUAL_2024_ID = "dnd2024.feat.general.ritual-caster"

_TEXT_2024 = [
    "General Feat (Prerequisite: Level 4+; Intelligence, Wisdom, or Charisma 13+)",
    (
        "Ability Score Increase. Increase your Intelligence, Wisdom, or Charisma score by 1, "
        "to a maximum of 20."
    ),
    (
        "Ritual Spells. Choose a number of level 1 spells that have the Ritual tag, equal to "
        "your Proficiency Bonus. You always have those spells prepared, and you can cast them "
        "with any spell slots you have. The spells' spellcasting ability is the ability "
        "increased by this feat. Whenever your Proficiency Bonus increases, you can add one "
        "additional level 1 spell with the Ritual tag."
    ),
    (
        "Quick Ritual. You can cast one of these spells using its regular casting time rather "
        "than the extended time for a Ritual. Doing so doesn't require a spell slot. Once you "
        "cast a spell this way, you can't use this benefit again until you finish a Long Rest."
    ),
]

_TEXT_2014 = [
    "General Feat (Prerequisite: Intelligence or Wisdom 13 or higher)",
    (
        "Ritual Book. Choose one spellcasting class list: bard, cleric, druid, sorcerer, "
        "warlock, or wizard. Your ritual book contains two level 1 spells of your choice from "
        "that list; each chosen spell must have the Ritual tag. While you have the ritual book "
        "in your possession, you can cast the spells in it as Rituals. The spells' spellcasting "
        "ability is the ability your chosen class uses for its spells."
    ),
    (
        "Copying Scrolls. You can transcribe Ritual spells you find on scrolls or spellbooks "
        "into your ritual book if each is from your chosen class's list and its spell level is "
        "at most half your character level, rounded up."
    ),
]

# Machine field: class-list options resolve against class entities in the pinned SRD package.
# The record's rules text keeps the printed class-name wording; the engine consumes these ids.
_CLASS_LIST_2014 = [
    "srd521.class.bard",
    "srd521.class.cleric",
    "srd521.class.druid",
    "srd521.class.sorcerer",
    "srd521.class.warlock",
    "srd521.class.wizard",
]


def _text_nodes(texts: list[str]) -> list[dict[str, str]]:
    return [{"kind": "ParagraphNode", "text": text} for text in texts]


def _text_hash(nodes: list[dict[str, str]]) -> str:
    joined = "\n".join(str(node["text"]) for node in nodes)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _edition_span(
    *,
    source_id: str,
    edition: str,
    reference_url: str,
    supplied_note: str,
    nodes: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "quoteHash": _text_hash(nodes),
        "kind": "edition-reference",
        "edition": edition,
        "book": "Player's Handbook",
        "referenceUrl": reference_url,
        "note": supplied_note,
    }


def _review_notes(notes: str) -> dict[str, Any]:
    return {
        "status": "AUTHORED",
        "extractionApproved": False,
        "semanticsApproved": False,
        "testsApproved": False,
        "notes": notes,
    }


def _ritual_caster_2024() -> dict[str, Any]:
    nodes = _text_nodes(_TEXT_2024)
    return {
        "id": RITUAL_2024_ID,
        "kind": "feat",
        "name": {"en": "Ritual Caster (2024 PHB variant)"},
        "tags": ["feat", "general", "edition-reference", "out-of-srd"],
        "source": [
            _edition_span(
                source_id="phb-2024",
                edition="2024",
                reference_url="https://www.dndbeyond.com/feats/1789180-ritual-caster",
                supplied_note=(
                    "Rules supplied by the project owner; no licensed book text is reproduced; "
                    "no span in the pinned source applies."
                ),
                nodes=nodes,
            )
        ],
        "body": {
            "category": "general",
            "repeatable": False,
            "prerequisite": {
                "minimumCharacterLevel": 4,
                "anyAbilityScoreMinimums": [
                    {"ability": "intelligence", "minimum": 13},
                    {"ability": "wisdom", "minimum": 13},
                    {"ability": "charisma", "minimum": 13},
                ],
            },
            "abilityScoreIncreaseAbilities": ["intelligence", "wisdom", "charisma"],
            "abilityScoreIncreasePatterns": [[1]],
            "maximumAbilityScore": 20,
            "ritualCaster": {
                "edition": "2024",
                "requiredSpellTag": "ritual",
                "maximumSpellLevel": 1,
                "spellListSource": "all",
                "spellCountSource": "proficiency-bonus",
                "growsWithProficiencyBonus": True,
                "castingAbilitySource": "feat-increased-ability",
                "quickRitualRecharge": "long-rest",
            },
            "text": {"title": "Ritual Caster (2024 PHB variant)", "nodes": nodes},
        },
        "rules": [],
        "review": _review_notes(
            "Authored out-of-SRD edition-reference record; no SRD extraction applies (ADR 0013). "
            "Feats are offered at the app's reviewed Ability Score Improvement levels. Casting "
            "time is not modeled; Quick Ritual is one free casting use per Long Rest. Reference: "
            "https://www.dndbeyond.com/feats/1789180-ritual-caster"
        ),
    }


def _ritual_caster_2014() -> dict[str, Any]:
    nodes = _text_nodes(_TEXT_2014)
    return {
        "id": RITUAL_2014_ID,
        "kind": "feat",
        "name": {"en": "Ritual Caster (2014 PHB variant)"},
        "tags": ["feat", "general", "edition-reference", "out-of-srd"],
        "source": [
            _edition_span(
                source_id="phb-2014",
                edition="2014",
                reference_url="https://www.dndbeyond.com/feats/40-ritual-caster",
                supplied_note=(
                    "Rules supplied by the project owner (initial two spells; research capped at "
                    "half character level rounded up); original PHB renderings differ and are "
                    "recorded for review; no span in the pinned source applies."
                ),
                nodes=nodes,
            )
        ],
        "body": {
            "category": "general",
            "repeatable": False,
            "prerequisite": {
                "anyAbilityScoreMinimums": [
                    {"ability": "intelligence", "minimum": 13},
                    {"ability": "wisdom", "minimum": 13},
                ],
            },
            "abilityScoreIncreaseAbilities": [],
            "abilityScoreIncreasePatterns": [],
            "maximumAbilityScore": 20,
            "ritualCaster": {
                "edition": "2014",
                "requiredSpellTag": "ritual",
                "initialSpellCount": 2,
                "maximumInitialSpellLevel": 1,
                "researchSpellLevelCap": "half-character-level-rounded-up",
                "classListOptions": _CLASS_LIST_2014,
                "spellListSource": "chosen-class-list",
                "castingAbilitySource": "chosen-class-list",
                "growsWithProficiencyBonus": False,
                "quickRitualRecharge": None,
            },
            "text": {"title": "Ritual Caster (2014 PHB variant)", "nodes": nodes},
        },
        "rules": [],
        "review": _review_notes(
            "Authored out-of-SRD edition-reference record; no SRD extraction applies (ADR 0013). "
            "Rules as supplied by the project owner; captured 2014 renderings differ in starting "
            "count and growth and the divergence is recorded for human review. Book possession, "
            "finding scrolls, and casting-time extension are assisted, not modeled. Feats are "
            "offered at the app's reviewed Ability Score Improvement levels. Reference: "
            "https://www.dndbeyond.com/feats/40-ritual-caster"
        ),
    }


def generate_reference_records() -> list[dict[str, Any]]:
    return [_ritual_caster_2024(), _ritual_caster_2014()]


def merge_reference_records(
    existing: list[dict[str, Any]], records: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    replacements = {record["id"]: record for record in records}
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(record for record in records if record["id"] not in existing_ids)
    return all_entities


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    records = generate_reference_records()
    all_entities = merge_reference_records(read_json(options.output / "entities.json"), records)
    write_json(options.output / "entities" / "edition-references.json", records)
    write_json(options.output / "entities.json", all_entities)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

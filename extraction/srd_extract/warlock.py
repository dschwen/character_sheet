"""Parse the Warlock class, Fiend Patron, invocations, and representative spells."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.progression import progression_feature_ids
from srd_extract.ranger import _level_features
from srd_extract.wizard import (
    ABILITIES,
    SCHOOLS,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)

CLASS_ID = "srd521.class.warlock"
SUBCLASS_ID = "srd521.subclass.warlock.fiend-patron"
INVOCATION_CHOICE_ID = "srd521.choice.warlock.eldritch-invocation"
MAGICAL_CUNNING_ID = "srd521.resource.warlock.magical-cunning"
INVOCATION_NAMES = (
    "Agonizing Blast",
    "Armor of Shadows",
    "Ascendant Step",
    "Devil’s Sight",
    "Devouring Blade",
    "Eldritch Mind",
    "Eldritch Smite",
    "Eldritch Spear",
    "Fiendish Vigor",
    "Gaze of Two Minds",
    "Gift of the Depths",
    "Gift of the Protectors",
    "Investment of the Chain Master",
    "Lessons of the First Ones",
    "Lifedrinker",
    "Mask of Many Faces",
    "Master of Myriad Forms",
    "Misty Visions",
    "One with Shadows",
    "Otherworldly Leap",
    "Pact of the Blade",
    "Pact of the Chain",
    "Pact of the Tome",
    "Repelling Blast",
    "Thirsting Blade",
    "Visions of Distant Realms",
    "Whispers of the Grave",
    "Witch Sight",
)
REPRESENTATIVE_SPELLS = (
    "Eldritch Blast",
    "Hellish Rebuke",
    "Hex",
    "Prestidigitation",
    "Stinking Cloud",
    "Suggestion",
)


@dataclass(frozen=True, slots=True)
class WarlockProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    eldritch_invocations: int
    cantrips: int
    prepared_spells: int
    spell_slots: int
    slot_level: int

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Warlock level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if self.slot_level not in range(1, 6):
            raise ValueError(f"Warlock Pact Magic slot level is invalid: {self.slot_level}")


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
        r"Core Warlock Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Warlock level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) Armor Training (?P<armor>.+?) "
        r"Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Warlock Traits table does not match the expected labels")
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
        "armorTraining": ["light"],
        "startingEquipmentText": match.group("equipment"),
    }


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[WarlockProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (float(word["bbox"][1]), int(str(word["text"])))
        for word in words
        if 60 <= float(word["bbox"][0]) < 100
        and 75 <= float(word["bbox"][1]) < 400
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Warlock progression table does not contain exactly levels 1–20")
    rows: list[WarlockProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else start_y + 9
        row = [
            word
            for word in words
            if start_y - 1 <= float(word["bbox"][1]) < end_y - 1
            and 55 <= float(word["bbox"][0]) <= 545
        ]
        feature_text = _column_text(row, 145, 300)
        rows.append(
            WarlockProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 100, 145).removeprefix("+")),
                feature_names=(
                    ()
                    if feature_text == "—"
                    else tuple(value.strip() for value in feature_text.split(",") if value.strip())
                ),
                eldritch_invocations=int(_column_text(row, 300, 360)),
                cantrips=int(_column_text(row, 360, 405)),
                prepared_spells=int(_column_text(row, 405, 455)),
                spell_slots=int(_column_text(row, 455, 500)),
                slot_level=int(_column_text(row, 500, 545)),
            )
        )
    return tuple(rows)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Level 1: Eldritch Invocations"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Eldritch Invocation Options"
    )
    features = _level_features(nodes, start, end, "srd521.class-feature.warlock")
    expected = {
        "Eldritch Invocations",
        "Pact Magic",
        "Magical Cunning",
        "Warlock Subclass",
        "Ability Score Improvement",
        "Contact Patron",
        "Mystic Arcanum",
        "Epic Boon",
        "Eldritch Master",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Warlock class feature extraction is incomplete")
    return features


def extract_fiend_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Level 3: Dark One’s Blessing"
    )
    end = len(nodes)
    features = _level_features(nodes, start, end, "srd521.subclass-feature.warlock.fiend")
    expected = {
        "Dark One’s Blessing",
        "Fiend Spells",
        "Dark One’s Own Luck",
        "Fiendish Resilience",
        "Hurl Through Hell",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Fiend Patron feature extraction is incomplete")
    return features


def extract_invocations(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Eldritch Invocation Options"
    )
    end = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "Warlock Spell List"
    )
    headings = [
        index
        for index in range(start + 1, end)
        if nodes[index]["kind"] == "HeadingNode"
        and nodes[index]["normalizedText"] in INVOCATION_NAMES
    ]
    invocations: list[dict[str, Any]] = []
    for position, index in enumerate(headings):
        section_end = headings[position + 1] if position + 1 < len(headings) else end
        section = [node for node in nodes[index:section_end] if node["kind"] != "MetadataNode"]
        name = str(nodes[index]["normalizedText"])
        paragraphs = [str(node["normalizedText"]) for node in section[1:]]
        prerequisite = next(
            (paragraph for paragraph in paragraphs if paragraph.startswith("Prerequisite:")), ""
        )
        level_match = re.search(r"Level (?P<level>\d+)\+ Warlock", prerequisite)
        prerequisites = [
            f"srd521.option.warlock.invocation.{_slug(candidate)}"
            for candidate in INVOCATION_NAMES
            if f"{candidate} Invocation" in prerequisite
        ]
        invocations.append(
            {
                "id": f"srd521.option.warlock.invocation.{_slug(name)}",
                "name": name,
                "minimumWarlockLevel": int(level_match.group("level")) if level_match else 1,
                "prerequisiteInvocationIds": prerequisites,
                "prerequisiteText": prerequisite.removeprefix("Prerequisite: "),
                "repeatable": any("Repeatable." in paragraph for paragraph in paragraphs),
                "text": " ".join(paragraphs),
                "source": _source_spans(section),
            }
        )
    if tuple(invocation["name"] for invocation in invocations) != INVOCATION_NAMES:
        raise ValueError("Eldritch Invocation extraction is incomplete")
    return tuple(invocations)


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    start = next(
        index for index, node in enumerate(nodes) if node["normalizedText"] == "Warlock Spell List"
    )
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Warlock Subclass: Fiend Patron"
    )
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Warlock Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        rf"(?P<special>(?:[CRM](?:, [CRM])*|[—–-]))"
        rf"(?= .+? (?:{'|'.join(SCHOOLS)}) |$)"
    )
    current_level: int | None = None
    spells: dict[str, dict[str, Any]] = {}
    for node in nodes[start + 1 : end]:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match:
                current_level = int(match.group("level") or 0)
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
    if len(spells) != 72:
        raise ValueError(f"Warlock spell list must contain 72 entries, found {len(spells)}")
    missing = (set(REPRESENTATIVE_SPELLS) - {"Stinking Cloud"}) - spells.keys()
    if missing:
        raise ValueError(f"Representative Warlock spells missing: {sorted(missing)}")
    return spells


def extract_spell_entities(
    document: dict[str, Any], spell_list: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    starts: list[tuple[int, str, tuple[int, str, list[str]]]] = []
    for index, node in enumerate(nodes[:-1]):
        if node["kind"] == "HeadingNode" and nodes[index + 1]["kind"] == "ParagraphNode":
            signature = _spell_signature(str(nodes[index + 1]["normalizedText"]))
            if signature is not None:
                starts.append((index, str(node["normalizedText"]), signature))
    entities: list[dict[str, Any]] = []
    for position, (start, name, signature) in enumerate(starts):
        if name not in REPRESENTATIVE_SPELLS:
            continue
        end = starts[position + 1][0] if position + 1 < len(starts) else len(nodes)
        section = [node for node in nodes[start:end] if node["kind"] != "MetadataNode"]
        metadata: list[dict[str, Any]] = []
        description_nodes: list[dict[str, Any]] = []
        for node in section[2:]:
            if node["kind"] == "HeadingNode" and not description_nodes:
                metadata.append(node)
            else:
                description_nodes.append(node)
        casting = _parse_casting_metadata(" ".join(node["normalizedText"] for node in metadata))
        description = " ".join(node["normalizedText"] for node in description_nodes)
        level, school, classes = signature
        listed = spell_list.get(
            name,
            {
                "id": f"srd521.spell.{_slug(name)}",
                "level": level,
                "school": school,
                "ritual": False,
            },
        )
        if level != listed["level"] or school != listed["school"]:
            raise ValueError(f"{name} description disagrees with the Warlock spell list")
        entities.append(
            {
                "id": listed["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "warlock"],
                "source": _source_spans(section),
                "body": {
                    "level": level,
                    "school": school,
                    "classes": classes,
                    "warlockSpell": True,
                    "ritual": listed["ritual"],
                    **casting,
                    "attackType": "ranged" if "ranged spell attack" in description else None,
                    "savingThrows": sorted(
                        {
                            match.group("ability").casefold()
                            for match in re.finditer(
                                rf"(?P<ability>{'|'.join(ABILITIES)}) saving throw", description
                            )
                        }
                    ),
                    "damage": [],
                    "healing": [],
                    "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
                    "description": description,
                },
                "rules": [],
                "review": _review("Representative Warlock spell with structured casting fields."),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative Warlock spell extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "warlock"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Warlock description."),
    }


def _starting_equipment() -> dict[str, Any]:
    return {
        "id": "srd521.choice.class.warlock.starting-equipment",
        "minimum": 1,
        "maximum": 1,
        "options": [
            {
                "id": "srd521.option.class.warlock.starting-equipment.a",
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
                        "entityId": "srd521.equipment.weapon.sickle",
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
                        "entityId": "srd521.equipment.gear.arcane-focus",
                        "quantity": 1,
                        "equipped": False,
                        "label": "Arcane Focus (orb)",
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.book",
                        "quantity": 1,
                        "equipped": False,
                        "label": "Book (occult lore)",
                    },
                    {
                        "kind": "entity",
                        "entityId": "srd521.equipment.gear.scholars-pack",
                        "quantity": 1,
                        "equipped": False,
                    },
                ],
                "currencyGp": 15,
            },
            {
                "id": "srd521.option.class.warlock.starting-equipment.b",
                "label": "Package B",
                "items": [],
                "currencyGp": 100,
            },
        ],
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[WarlockProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    invocations: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    ids = progression_feature_ids(features, ((row.level, row.feature_names) for row in progression))
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Warlock"},
        "tags": ["class", "warlock", "spellcaster", "pact-magic"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits["skillProficiencyChoice"],
                "countByLevel": {str(level): 2 for level in range(1, 9)},
            },
            "startingEquipment": _starting_equipment(),
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 8,
                "defaultAbilityScores": {
                    "strength": 10,
                    "dexterity": 13,
                    "constitution": 14,
                    "intelligence": 10,
                    "wisdom": 10,
                    "charisma": 15,
                },
                "defaultAbilityScoreImprovementAbility": "charisma",
                "defaultClassSkillIds": [
                    "srd521.skill.arcana",
                    "srd521.skill.deception",
                ],
                "defaultGrantedFeatIds": [],
            },
            "spellcastingAbility": "charisma",
            "spellPreparation": "full-list",
            "spellPreparationChange": {
                "event": "level-up",
                "replacementMaximum": 1,
            },
            "cantripChange": {
                "event": "level-up",
                "replacementMaximum": 1,
            },
            "spellcastingModel": "pact-magic",
            "slotRecharge": "short-rest",
            "alwaysPreparedSpells": {},
            "spellList": [
                entry["id"]
                for name, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "eldritchInvocationChoice": {
                "id": INVOCATION_CHOICE_ID,
                "level": 1,
                "minimum": 1,
                "maximum": 6,
                "countByLevel": {
                    str(row.level): row.eldritch_invocations
                    for row in progression
                    if row.level <= 7
                },
                "options": [invocation["id"] for invocation in invocations],
                "defaultOptionIds": [
                    "srd521.option.warlock.invocation.pact-of-the-chain",
                    "srd521.option.warlock.invocation.devil-s-sight",
                    "srd521.option.warlock.invocation.fiendish-vigor",
                    "srd521.option.warlock.invocation.ascendant-step",
                    "srd521.option.warlock.invocation.one-with-shadows",
                    "srd521.option.warlock.invocation.eldritch-mind",
                ],
                "changeOn": ["level-up"],
                "replacementMaximum": 1,
            },
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {"name": name, "entityId": ids.get((row.level, name))}
                        for name in row.feature_names
                    ],
                    "eldritchInvocations": row.eldritch_invocations,
                    "cantrips": row.cantrips,
                    "preparedSpells": row.prepared_spells,
                    "pactSlots": row.spell_slots,
                    "pactSlotLevel": row.slot_level,
                    "spellSlots": {str(row.slot_level): row.spell_slots},
                }
                for row in progression
            ],
        },
        "rules": [],
        "review": _review("Warlock progression and Pact Magic table from pages 70–71."),
    }


def _invocation_entities(invocations: tuple[dict[str, Any], ...]) -> list[dict[str, Any]]:
    return [
        {
            "id": invocation["id"],
            "kind": "class-option",
            "name": {"en": invocation["name"]},
            "tags": ["class-option", "warlock", "eldritch-invocation"],
            "source": invocation["source"],
            "body": {
                "choiceId": INVOCATION_CHOICE_ID,
                "minimumWarlockLevel": invocation["minimumWarlockLevel"],
                "prerequisiteInvocationIds": invocation["prerequisiteInvocationIds"],
                "prerequisiteText": invocation["prerequisiteText"],
                "repeatable": invocation["repeatable"],
                "text": invocation["text"],
            },
            "rules": [],
            "review": _review(f"{invocation['name']} Eldritch Invocation option."),
        }
        for invocation in invocations
    ]


def _fiend_entities(
    document: dict[str, Any], features: tuple[dict[str, Any], ...]
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading_index = next(
        index
        for index, node in enumerate(nodes)
        if node["normalizedText"] == "Warlock Subclass: Fiend Patron"
    )
    heading, intro, tagline = nodes[heading_index : heading_index + 3]
    spells_feature = next(feature for feature in features if feature["name"] == "Fiend Spells")
    table = next(node for node in spells_feature["bodyNodes"] if node["kind"] == "TableNode")
    always: dict[str, list[str]] = {}
    for match in re.finditer(r"(?P<level>\d+) (?P<spells>.+?)(?= \d+ |$)", table["normalizedText"]):
        always[match.group("level")] = [
            f"srd521.spell.{_slug(name.strip())}"
            for name in match.group("spells").removeprefix("Warlock Level Spells ").split(",")
        ]
    by_level: dict[int, list[str]] = {}
    for feature in features:
        by_level.setdefault(feature["level"], []).append(feature["id"])
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Fiend Patron"},
        "tags": ["subclass", "warlock", "fiend-patron"],
        "source": _source_spans([heading, tagline, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": level, "features": ids} for level, ids in sorted(by_level.items())
            ],
            "alwaysPreparedSpells": always,
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Fiend Patron subclass extracted from page 76."),
    }
    return [subclass, *[_feature_entity(feature, "subclass-feature") for feature in features]]


def _magical_cunning_ir(feature: dict[str, Any]) -> dict[str, Any]:
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
        "proposedRules": [
            {
                "id": "magical-cunning-resource",
                "type": "grant-resource",
                "target": MAGICAL_CUNNING_ID,
                "expression": {"kind": "literal", "value": 1},
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            },
            {
                "id": "use-magical-cunning",
                "type": "grant-action",
                "target": "action.magical-cunning",
                "when": {"kind": "resourceAvailable", "resourceId": MAGICAL_CUNNING_ID},
                "parameters": {
                    "actionEconomy": "one-minute-rite",
                    "spends": 1,
                    "resourceId": MAGICAL_CUNNING_ID,
                    "restoresSpellSlots": {
                        "amountFact": "spellcasting.warlock.pactSlots.maximum",
                        "fraction": 0.5,
                        "round": "up",
                        "slotLevelFact": "spellcasting.warlock.pactSlotLevel",
                    },
                },
                "automationLevel": "state-automated",
            },
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["The one-minute rite is represented as an explicit atomic action."],
        },
    }


def _dark_ones_own_luck_ir(feature: dict[str, Any]) -> dict[str, Any]:
    resource_id = "srd521.resource.warlock.dark-ones-own-luck"
    ir = _magical_cunning_ir(feature)
    ir.update(kind="subclass-feature", parentId=SUBCLASS_ID)
    ir["proposedRules"] = [
        {
            "id": "dark-ones-own-luck-resource",
            "type": "grant-resource",
            "target": resource_id,
            "expression": {
                "kind": "max",
                "args": [
                    {"kind": "literal", "value": 1},
                    {"kind": "ref", "path": "ability.charisma.modifier"},
                ],
            },
            "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
            "automationLevel": "state-automated",
        },
        {
            "id": "use-dark-ones-own-luck",
            "type": "grant-action",
            "target": "action.dark-ones-own-luck",
            "when": {"kind": "resourceAvailable", "resourceId": resource_id},
            "parameters": {
                "actionEconomy": "no-action",
                "spends": 1,
                "resourceId": resource_id,
                "checkBonus": {
                    "diceCount": 1,
                    "diceSize": 10,
                    "mode": "add",
                    "appliesTo": ["ability-check", "saving-throw"],
                    "afterRoll": True,
                },
            },
            "automationLevel": "roll-assisted",
        },
    ]
    ir["review"]["notes"] = [
        "Apply after seeing an ability check or save, before its effects; once per roll.",
        "Completed-roll context is caller-owned, not persisted encounter history.",
    ]
    return ir


def generate_warlock_content(class_root: Path, spell_root: Path, output: Path) -> dict[str, Any]:
    document = read_json(class_root / "normalized" / "document.json")
    spell_document = read_json(spell_root / "normalized" / "document.json")
    raw = read_json(class_root / "raw" / "pages" / "0071.json")
    core = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Core Warlock Traits")
    )
    progression_node = next(
        node
        for node in document["nodes"]
        if node["kind"] == "TableNode" and node["normalizedText"].startswith("Warlock Features")
    )
    traits, progression = parse_core_traits(core["normalizedText"]), parse_progression(raw)
    features, fiend = extract_features(document), extract_fiend_features(document)
    invocations, spell_list = extract_invocations(document), parse_spell_list(document)
    spells = extract_spell_entities(spell_document, spell_list)
    entities = [
        _class_entity(
            traits,
            progression,
            features,
            invocations,
            spell_list,
            _source_spans([core, progression_node]),
        ),
        *[_feature_entity(feature, "class-feature") for feature in features],
        *_invocation_entities(invocations),
        *_fiend_entities(document, fiend),
        *spells,
    ]
    existing = read_json(output / "entities.json")
    replacements = {entity["id"]: entity for entity in entities if entity["kind"] != "spell"}
    existing_ids = {entity["id"] for entity in existing}
    all_entities = [replacements.get(entity["id"], entity) for entity in existing]
    all_entities.extend(entity for entity in entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "warlock.json", entities)
    write_json(output / "entities.json", all_entities)
    magical_cunning = next(feature for feature in features if feature["name"] == "Magical Cunning")
    luck = next(feature for feature in fiend if feature["name"] == "Dark One’s Own Luck")
    authoring = {
        "warlock.magical-cunning.json": _magical_cunning_ir(magical_cunning),
        "fiend.dark-ones-own-luck.json": _dark_ones_own_luck_ir(luck),
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
        "extractedFiendFeatures": len(fiend),
        "eldritchInvocations": len(invocations),
        "warlockSpellListEntries": len(spell_list),
        "representativeSpells": [spell["id"] for spell in spells],
        "generatedEntities": [entity["id"] for entity in entities],
        "authoringIr": list(authoring),
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "warlock-poc-report.json", report)
    return report


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args(arguments)
    report = generate_warlock_content(
        options.class_extraction, options.spell_extraction, options.output
    )
    print(
        f"Generated {len(report['generatedEntities'])} Warlock entities; "
        f"{report['warlockSpellListEntries']} Warlock-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

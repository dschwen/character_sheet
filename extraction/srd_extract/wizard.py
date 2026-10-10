"""Parse the Wizard class and a representative spellcasting content slice."""

from __future__ import annotations

import argparse
import hashlib
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from itertools import pairwise
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.spell_recovery import recovery_resource_ir

SOURCE_ID = "wotc-srd-5.2.1-en"
CLASS_ID = "srd521.class.wizard"
SUBCLASS_ID = "srd521.subclass.wizard.evoker"
SPELLBOOK_ID = "srd521.equipment.gear.spellbook"
HEADING_PATTERN = re.compile(r"^Level (?P<level>\d+): (?P<name>.+)$")
SCHOOLS = (
    "Abjuration",
    "Conjuration",
    "Divination",
    "Enchantment",
    "Evocation",
    "Illusion",
    "Necromancy",
    "Transmutation",
)
REPRESENTATIVE_SPELLS = (
    "Acid Splash",
    "Burning Hands",
    "Chill Touch",
    "Chromatic Orb",
    "Counterspell",
    "Darkness",
    "Detect Magic",
    "Feather Fall",
    "False Life",
    "Fireball",
    "Fly",
    "Light",
    "Mage Armor",
    "Mage Hand",
    "Magic Missile",
    "Mending",
    "Minor Illusion",
    "Misty Step",
    "Poison Spray",
    "Ray of Enfeeblement",
    "Ray of Frost",
    "Scorching Ray",
    "Shatter",
    "Shield",
    "Sleep",
    "Thunderwave",
    "Web",
)
ABILITIES = (
    "Strength",
    "Dexterity",
    "Constitution",
    "Intelligence",
    "Wisdom",
    "Charisma",
)


@dataclass(frozen=True, slots=True)
class WizardProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    cantrips: int
    prepared_spells: int
    spell_slots: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.level not in range(1, 21):
            raise ValueError(f"Wizard level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )
        if len(self.spell_slots) != 9:
            raise ValueError("Wizard progression rows require all nine spell-slot columns")


def _quote_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


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
        r"Core Wizard Traits Primary Ability (?P<primary>.+?) "
        r"Hit Point Die D(?P<hit_die>\d+) per Wizard level "
        r"Saving Throw Proficiencies (?P<saves>.+?) "
        r"Skill Proficiencies Choose (?P<skill_count>\d+): (?P<skills>.+?) "
        r"Weapon Proficiencies (?P<weapons>.+?) "
        r"Armor Training (?P<armor>.+?) Starting Equipment (?P<equipment>.+)$"
    )
    match = pattern.fullmatch(table_text)
    if match is None:
        raise ValueError("Core Wizard Traits table does not match the expected labels")
    skills = [
        value.strip().casefold()
        for value in re.split(r",| or ", match.group("skills"))
        if value.strip()
    ]
    return {
        "primaryAbilities": [match.group("primary").casefold()],
        "hitPointDie": int(match.group("hit_die")),
        "savingThrowProficiencies": [
            value.strip().casefold() for value in match.group("saves").split(" and ")
        ],
        "skillProficiencyChoice": {
            "minimum": int(match.group("skill_count")),
            "maximum": int(match.group("skill_count")),
            "options": skills,
        },
        "weaponProficiencies": ["simple"],
        "armorTraining": [],
        "startingEquipmentText": match.group("equipment"),
    }


def _row_words(
    words: list[dict[str, Any]],
    start_y: float,
    end_y: float,
) -> list[dict[str, Any]]:
    return [
        word
        for word in words
        if start_y <= float(word["bbox"][1]) < end_y and 63 <= float(word["bbox"][0]) <= 540
    ]


def _column_text(words: Iterable[dict[str, Any]], minimum_x: float, maximum_x: float) -> str:
    selected = [word for word in words if minimum_x <= float(word["bbox"][0]) < maximum_x]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def parse_progression(raw_page: dict[str, Any]) -> tuple[WizardProgressionRow, ...]:
    words = list(raw_page["words"])
    starts = sorted(
        (
            float(word["bbox"][1]),
            int(str(word["text"])),
        )
        for word in words
        if 70 <= float(word["bbox"][0]) < 90
        and 400 <= float(word["bbox"][1]) < 730
        and str(word["text"]).isdigit()
    )
    if [level for _, level in starts] != list(range(1, 21)):
        raise ValueError("Wizard progression table does not contain exactly levels 1–20")

    slot_boundaries = (375, 393, 411, 429, 447, 465, 483, 501, 519, 541)
    rows: list[WizardProgressionRow] = []
    for index, (start_y, level) in enumerate(starts):
        end_y = starts[index + 1][0] if index + 1 < len(starts) else 725
        row = _row_words(words, start_y - 1, end_y - 1)
        feature_text = _column_text(row, 140, 285)
        features = (
            ()
            if feature_text == "—"
            else tuple(value.strip() for value in feature_text.split(",") if value.strip())
        )
        slots = tuple(
            0 if (value := _column_text(row, left, right)) in {"", "—"} else int(value)
            for left, right in pairwise(slot_boundaries)
        )
        rows.append(
            WizardProgressionRow(
                level=level,
                proficiency_bonus=int(_column_text(row, 100, 140).removeprefix("+")),
                feature_names=features,
                cantrips=int(_column_text(row, 285, 330)),
                prepared_spells=int(_column_text(row, 330, 375)),
                spell_slots=slots,
            )
        )
    return tuple(rows)


def extract_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    end = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Wizard Spell List"
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
            raise ValueError(f"Wizard feature has no body: {node['normalizedText']}")
        name = match.group("name")
        features.append(
            {
                "id": f"srd521.class-feature.wizard.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": _source_spans([node, *body_nodes]),
            }
        )
    expected = {
        "Spellcasting",
        "Ritual Adept",
        "Arcane Recovery",
        "Scholar",
        "Wizard Subclass",
        "Ability Score Improvement",
        "Memorize Spell",
        "Spell Mastery",
        "Epic Boon",
        "Signature Spells",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Wizard class feature extraction is incomplete")
    return tuple(features)


def extract_evoker_features(document: dict[str, Any]) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    start = next(
        index
        for index, node in enumerate(nodes)
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Wizard Subclass: Evoker"
    )
    features: list[dict[str, Any]] = []
    for index, node in enumerate(nodes[start + 1 :], start + 1):
        if node["kind"] != "HeadingNode":
            continue
        match = HEADING_PATTERN.fullmatch(node["normalizedText"])
        if match is None:
            continue
        body_nodes: list[dict[str, Any]] = []
        for following in nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] != "MetadataNode":
                body_nodes.append(following)
        if not body_nodes:
            raise ValueError(f"Evoker feature has no body: {node['normalizedText']}")
        name = match.group("name")
        features.append(
            {
                "id": f"srd521.subclass-feature.wizard.evoker.{_slug(name)}",
                "name": name,
                "level": int(match.group("level")),
                "bodyNodes": body_nodes,
                "source": _source_spans([node, *body_nodes]),
            }
        )
    expected = {
        "Evocation Savant",
        "Potent Cantrip",
        "Sculpt Spells",
        "Empowered Evocation",
        "Overchannel",
    }
    if {feature["name"] for feature in features} != expected:
        raise ValueError("Evoker feature extraction is incomplete")
    return tuple(features)


def parse_spell_list(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nodes = list(document["nodes"])
    spell_list: dict[str, dict[str, Any]] = {}
    current_level: int | None = None
    level_pattern = re.compile(r"^(?:Cantrips \(Level 0|Level (?P<level>\d+)) Wizard Spells\)?$")
    entry_pattern = re.compile(
        rf"(?P<name>.+?) (?P<school>{'|'.join(SCHOOLS)}) "
        r"(?P<special>[CRM](?:, [CRM])*|[—–])(?= [A-Z]|$)"
    )
    for node in nodes:
        if node["kind"] == "HeadingNode":
            match = level_pattern.fullmatch(node["normalizedText"])
            if match is not None:
                current_level = int(match.group("level") or 0)
            elif node["normalizedText"] == "Wizard Subclass: Evoker":
                break
            continue
        if node["kind"] != "TableNode" or current_level is None:
            continue
        text = str(node["normalizedText"]).removeprefix("Spell School Special ")
        for match in entry_pattern.finditer(text):
            name = match.group("name").strip()
            special = match.group("special")
            spell_list[name] = {
                "id": f"srd521.spell.{_slug(name)}",
                "level": current_level,
                "school": match.group("school").casefold(),
                "concentration": "C" in special,
                "ritual": "R" in special,
                "specificMaterial": "M" in special,
            }
    if len(spell_list) < 150:
        raise ValueError(f"Wizard spell list is unexpectedly short: {len(spell_list)} entries")
    missing = set(REPRESENTATIVE_SPELLS) - spell_list.keys()
    if missing:
        raise ValueError(f"Representative spells missing from Wizard list: {sorted(missing)}")
    return spell_list


def _spell_signature(text: str) -> tuple[int, str, list[str]] | None:
    leveled = re.fullmatch(
        rf"Level (?P<level>\d+) (?P<school>{'|'.join(SCHOOLS)}) \((?P<classes>.+)\)",
        text,
    )
    cantrip = re.fullmatch(
        rf"(?P<school>{'|'.join(SCHOOLS)}) Cantrip \((?P<classes>.+)\)",
        text,
    )
    match = leveled or cantrip
    if match is None:
        return None
    return (
        int(match.groupdict().get("level") or 0),
        match.group("school").casefold(),
        [value.strip().casefold() for value in match.group("classes").split(",")],
    )


def _parse_casting_metadata(text: str) -> dict[str, Any]:
    match = re.fullmatch(
        r"Casting Time: (?P<casting_time>.+?) Range: (?P<range>.+?) "
        r"Components?: (?P<components>.+?) Duration: (?P<duration>.+)",
        text,
    )
    if match is None:
        raise ValueError(f"Spell casting metadata does not match expected labels: {text}")
    components = match.group("components")
    material = re.search(r"M \((?P<text>.+)\)", components)
    duration = match.group("duration")
    return {
        "castingTime": match.group("casting_time"),
        "range": match.group("range"),
        "components": {
            "verbal": bool(re.search(r"\bV\b", components)),
            "somatic": bool(re.search(r"\bS\b", components)),
            "material": bool(re.search(r"\bM\b", components)),
            **({} if material is None else {"materialText": material.group("text")}),
        },
        "duration": duration,
        "concentration": duration.startswith("Concentration"),
    }


def extract_spell_entities(
    document: dict[str, Any],
    spell_list: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], ...]:
    nodes = list(document["nodes"])
    starts: list[tuple[int, str, tuple[int, str, list[str]]]] = []
    for index, node in enumerate(nodes[:-1]):
        if node["kind"] != "HeadingNode":
            continue
        following = nodes[index + 1]
        if following["kind"] != "ParagraphNode":
            continue
        signature = _spell_signature(str(following["normalizedText"]))
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
                not description_nodes or str(node["normalizedText"]).startswith(("hit ", "which "))
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
            raise ValueError(f"{name} description disagrees with the Wizard spell list")
        damage = [
            {
                "diceCount": int(match.group("count")),
                "diceSize": int(match.group("size")),
                "type": match.group("type").casefold(),
            }
            for match in re.finditer(
                r"(?P<count>\d+)d(?P<size>\d+) (?P<type>[A-Z][a-z]+) damage",
                description,
            )
        ]
        saving_throws = sorted(
            {
                match.group("ability").casefold()
                for match in re.finditer(
                    rf"(?P<ability>{'|'.join(ABILITIES)}) saving throw",
                    description,
                )
            }
        )
        body = {
            "level": level,
            "school": school,
            "classes": classes,
            "wizardSpell": True,
            "ritual": list_entry["ritual"],
            **casting,
            "attackType": (
                "ranged"
                if "ranged spell attack" in description
                else "melee"
                if "melee spell attack" in description
                else None
            ),
            "savingThrows": saving_throws,
            "damage": damage,
            "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
            "description": description,
        }
        entities.append(
            {
                "id": list_entry["id"],
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, "wizard"],
                "source": _source_spans(section),
                "body": body,
                "rules": [],
                "review": _review(
                    "Representative Wizard spell with structured casting and effect fields."
                ),
            }
        )
    if {entity["name"]["en"] for entity in entities} != set(REPRESENTATIVE_SPELLS):
        raise ValueError("Representative spell description extraction is incomplete")
    return tuple(entities)


def _feature_entity(feature: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "id": feature["id"],
        "kind": kind,
        "name": {"en": feature["name"]},
        "tags": [kind, "wizard"],
        "source": feature["source"],
        "body": {
            "level": feature["level"],
            "text": " ".join(node["normalizedText"] for node in feature["bodyNodes"]),
        },
        "rules": [],
        "review": _review(f"{feature['name']} extracted from the Wizard class description."),
    }


def _spellbook_entity(document: dict[str, Any]) -> dict[str, Any]:
    node = next(
        node
        for node in document["nodes"]
        if "Your wizardly apprenticeship culminated" in str(node["normalizedText"])
    )
    return {
        "id": SPELLBOOK_ID,
        "kind": "equipment-gear",
        "name": {"en": "Spellbook"},
        "tags": ["equipment", "adventuring-gear", "spellcasting-focus", "wizard"],
        "source": _source_spans([node]),
        "body": {
            "weightLb": 3,
            "cost": None,
            "size": "tiny",
            "pageCount": 100,
            "spellcastingFocusFor": [CLASS_ID],
        },
        "rules": [],
        "review": _review("Wizard spellbook properties extracted from page 78."),
    }


def _class_entity(
    traits: dict[str, Any],
    progression: tuple[WizardProgressionRow, ...],
    features: tuple[dict[str, Any], ...],
    spell_list: dict[str, dict[str, Any]],
    source: list[dict[str, Any]],
) -> dict[str, Any]:
    feature_ids = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    return {
        "id": CLASS_ID,
        "kind": "class",
        "name": {"en": "Wizard"},
        "tags": ["class", "wizard", "spellcaster"],
        "source": source,
        "body": {
            **traits,
            "skillProficiencyChoice": {
                **traits.get("skillProficiencyChoice", {}),
                "countByLevel": {str(level): 2 for level in range(1, 7)},
            },
            "startingEquipment": {
                "id": "srd521.choice.class.wizard.starting-equipment",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": "srd521.option.class.wizard.starting-equipment.a",
                        "label": "Package A",
                        "items": [
                            {
                                "kind": "entity",
                                "entityId": "srd521.equipment.weapon.dagger",
                                "quantity": 2,
                                "equipped": False,
                            },
                            {
                                "kind": "entity",
                                "entityId": "srd521.equipment.weapon.quarterstaff",
                                "quantity": 1,
                                "equipped": True,
                                "label": "Arcane Focus (Quarterstaff)",
                            },
                            {
                                "kind": "entity",
                                "entityId": "srd521.equipment.gear.robe",
                                "quantity": 1,
                                "equipped": False,
                            },
                            {
                                "kind": "entity",
                                "entityId": SPELLBOOK_ID,
                                "quantity": 1,
                                "equipped": False,
                            },
                            {
                                "kind": "entity",
                                "entityId": "srd521.equipment.gear.scholars-pack",
                                "quantity": 1,
                                "equipped": False,
                            },
                        ],
                        "currencyGp": 5,
                    },
                    {
                        "id": "srd521.option.class.wizard.starting-equipment.b",
                        "label": "Package B",
                        "items": [],
                        "currencyGp": 55,
                    },
                ],
            },
            "builder": {
                "supportedLevelMinimum": 1,
                "supportedLevelMaximum": 6,
                "defaultAbilityScores": {
                    "strength": 8,
                    "dexterity": 14,
                    "constitution": 13,
                    "intelligence": 15,
                    "wisdom": 12,
                    "charisma": 10,
                },
                "defaultAbilityScoreImprovementAbility": "intelligence",
                "defaultClassSkillIds": [
                    "srd521.skill.arcana",
                    "srd521.skill.investigation",
                ],
                "defaultGrantedFeatIds": [],
                "expertiseChoice": {
                    "sourceId": "srd521.class-feature.wizard.scholar",
                    "minimumLevel": 2,
                    "eligibleSkillIds": [
                        "srd521.skill.arcana",
                        "srd521.skill.history",
                        "srd521.skill.investigation",
                        "srd521.skill.medicine",
                        "srd521.skill.nature",
                        "srd521.skill.religion",
                    ],
                    "requireClassProficiency": True,
                },
            },
            "spellcastingAbility": "intelligence",
            "spellPreparation": "spellbook",
            "spellbookStartingSpells": 6,
            "spellbookSpellsPerLevel": 2,
            "spellList": [
                entry["id"]
                for _, entry in sorted(
                    spell_list.items(), key=lambda item: (item[1]["level"], item[0])
                )
            ],
            "progression": [
                {
                    "level": row.level,
                    "proficiencyBonus": row.proficiency_bonus,
                    "features": [
                        {
                            "name": name,
                            "entityId": feature_ids.get((row.level, name)),
                        }
                        for name in row.feature_names
                    ],
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
        "review": _review("Wizard class progression and spellcasting table from pages 77–79."),
    }


def _subclass_entities(
    document: dict[str, Any],
    features: tuple[dict[str, Any], ...],
) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    heading = next(
        node
        for node in nodes
        if node["kind"] == "HeadingNode" and node["normalizedText"] == "Wizard Subclass: Evoker"
    )
    intro = nodes[nodes.index(heading) + 1]
    subclass = {
        "id": SUBCLASS_ID,
        "kind": "subclass",
        "name": {"en": "Evoker"},
        "tags": ["subclass", "wizard", "evoker"],
        "source": _source_spans([heading, intro]),
        "body": {
            "parentClassId": CLASS_ID,
            "progression": [
                {"level": feature["level"], "features": [feature["id"]]} for feature in features
            ],
            "description": intro["normalizedText"],
        },
        "rules": [],
        "review": _review("Evoker subclass extracted from page 82."),
    }
    return [
        subclass,
        *[_feature_entity(feature, "subclass-feature") for feature in features],
    ]


def generate_wizard_content(
    class_extraction_root: Path,
    spell_extraction_root: Path,
    output: Path,
) -> dict[str, Any]:
    class_document = read_json(class_extraction_root / "normalized" / "document.json")
    spell_document = read_json(spell_extraction_root / "normalized" / "document.json")
    raw_page = read_json(class_extraction_root / "raw" / "pages" / "0077.json")
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
    evoker_features = extract_evoker_features(class_document)
    spell_list = parse_spell_list(class_document)
    spell_entities = extract_spell_entities(spell_document, spell_list)
    class_entity = _class_entity(
        traits,
        progression,
        features,
        spell_list,
        _source_spans([core_node, progression_node]),
    )
    wizard_entities = [
        class_entity,
        _spellbook_entity(class_document),
        *[_feature_entity(feature, "class-feature") for feature in features],
        *_subclass_entities(class_document, evoker_features),
        *spell_entities,
    ]
    arcane_recovery = next(feature for feature in features if feature["name"] == "Arcane Recovery")
    sculpt = next(feature for feature in evoker_features if feature["name"] == "Sculpt Spells")
    for entity in wizard_entities:
        if entity["id"] == sculpt["id"]:
            entity["body"]["spellProtection"] = {
                "school": "evocation",
                "additionalTargets": 1,
                "requiresSight": True,
                "othersOnly": True,
                "automaticSaveSuccess": True,
                "noDamageOnSuccessfulHalfSave": True,
            }
            entity["body"]["automationLevel"] = "assisted"
    recovery_id = "srd521.resource.wizard.arcane-recovery"
    for entity in wizard_entities:
        if entity["id"] == arcane_recovery["id"]:
            entity["body"]["spellSlotRecovery"] = {
                "classId": CLASS_ID,
                "resourceId": recovery_id,
                "levelDivisor": 2,
                "maximumSlotLevel": 5,
                "event": "short-rest",
            }
            entity["body"]["automationLevel"] = "state-automated"
    write_json(
        output / "authoring-ir" / "wizard.arcane-recovery.json",
        recovery_resource_ir(arcane_recovery, CLASS_ID, [recovery_id]),
    )
    current_entities = read_json(output / "entities.json")
    evocations = [
        entity
        for entity in current_entities
        if entity["kind"] == "spell"
        and entity["body"]["school"] == "evocation"
        and entity["id"] in wizard_entities[0]["body"]["spellList"]
        and entity["body"]["level"] > 0
    ]
    savant = next(feature for feature in evoker_features if feature["name"] == "Evocation Savant")
    choices = [(3, 2, 2, ["srd521.spell.magic-missile", "srd521.spell.scorching-ray"])]
    first_levels: dict[int, int] = {}
    for row in wizard_entities[0]["body"]["progression"]:
        for slot_level in row["spellSlots"]:
            if int(slot_level) > 2:
                first_levels.setdefault(int(slot_level), row["level"])
    choices.extend((level, 1, slot_level, []) for slot_level, level in sorted(first_levels.items()))
    for entity in wizard_entities:
        if entity["id"] != SUBCLASS_ID:
            continue
        for level, count, maximum, defaults in choices:
            entity["body"][f"evocationSavantLevel{level}Choice"] = {
                "id": f"srd521.choice.wizard.evocation-savant.level-{level}",
                "level": level,
                "minimum": count,
                "maximum": count,
                "options": sorted(
                    spell["id"] for spell in evocations if spell["body"]["level"] <= maximum
                ),
                **({"defaultOptionIds": defaults} if defaults else {}),
                "spellSelection": {
                    "sourceFeatureId": savant["id"],
                    "castingClassId": CLASS_ID,
                    "sourceClassIds": [CLASS_ID],
                    "alwaysPrepared": False,
                    "spellbookAddition": True,
                    "allowCantrips": False,
                    "school": "evocation",
                    "maximumSpellLevel": maximum,
                },
            }
    replacements = {entity["id"]: entity for entity in wizard_entities if entity["kind"] != "spell"}
    existing_ids = {entity["id"] for entity in current_entities}
    all_entities = [replacements.get(entity["id"], entity) for entity in current_entities]
    all_entities.extend(entity for entity in wizard_entities if entity["id"] not in existing_ids)
    write_json(output / "entities" / "wizard.json", wizard_entities)
    write_json(output / "entities.json", all_entities)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(all_entities)
    write_json(output / "coverage.json", coverage)
    report = {
        "classId": CLASS_ID,
        "coreTraits": traits,
        "progressionRows": len(progression),
        "extractedClassFeatures": len(features),
        "extractedEvokerFeatures": len(evoker_features),
        "wizardSpellListEntries": len(spell_list),
        "representativeSpells": [entity["id"] for entity in spell_entities],
        "generatedEntities": [entity["id"] for entity in wizard_entities],
        "progression": [asdict(row) for row in progression],
    }
    write_json(output / "wizard-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--class-extraction", required=True, type=Path)
    parser.add_argument("--spell-extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_wizard_content(
        options.class_extraction,
        options.spell_extraction,
        options.output,
    )
    print(
        f"Generated {len(report['generatedEntities'])} Wizard entities; "
        f"{report['wizardSpellListEntries']} Wizard-list spells"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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
DRAGONBORN_ID = "srd521.species.dragonborn"
ELF_ID = "srd521.species.elf"
GNOME_ID = "srd521.species.gnome"
GOLIATH_ID = "srd521.species.goliath"
HALFLING_ID = "srd521.species.halfling"
ORC_ID = "srd521.species.orc"
TIEFLING_ID = "srd521.species.tiefling"
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
    DRAGONBORN_ID,
    ELF_ID,
    GNOME_ID,
    GOLIATH_ID,
    HALFLING_ID,
    ORC_ID,
    TIEFLING_ID,
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


def _raw_continuation_node(raw_page: dict[str, Any], block_id: str) -> dict[str, Any]:
    block = next(block for block in raw_page["blocks"] if block["block_id"] == block_id)
    normalized = re.sub(r"-\n(?=[a-z])", "", str(block["text"]))
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return {
        "kind": "ParagraphNode",
        "parentId": f"page-{int(raw_page['page']['number']):04d}",
        "sourceBlocks": [block_id],
        "normalizedText": normalized,
    }


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


def parse_dragonborn(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    traits = re.search(r"As a Dragonborn, you have these special traits\. (?P<value>.+)", text)
    if creature_type is None or size is None or speed is None or traits is None:
        raise ValueError("Dragonborn species does not match the expected fields")
    trait_text = traits.group("value")
    required_phrases = (
        "Draconic Ancestry",
        "Breath Weapon",
        "DC 8 plus your Constitution modifier and Proficiency Bonus",
        "number of times equal to your Proficiency Bonus",
        "Damage Resistance",
        "Darkvision with a range of 60 feet",
        "Draconic Flight",
        "character level 5",
    )
    if not all(phrase in trait_text for phrase in required_phrases):
        raise ValueError("Dragonborn trait text is incomplete")
    ancestors = [
        ("black", "Black", "acid"),
        ("blue", "Blue", "lightning"),
        ("brass", "Brass", "fire"),
        ("bronze", "Bronze", "lightning"),
        ("copper", "Copper", "acid"),
        ("gold", "Gold", "fire"),
        ("green", "Green", "poison"),
        ("red", "Red", "fire"),
        ("silver", "Silver", "cold"),
        ("white", "White", "cold"),
    ]
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 60,
        "choices": [
            {
                "id": "srd521.species.dragonborn.choice.draconic-ancestry",
                "prompt": "Choose a Draconic Ancestor",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.dragonborn.ancestry.{slug}",
                        "name": name,
                        "damageType": damage_type,
                    }
                    for slug, name, damage_type in ancestors
                ],
            }
        ],
        "resistanceFromChoiceId": "srd521.species.dragonborn.choice.draconic-ancestry",
        "resources": [
            {
                "id": "srd521.resource.dragonborn.breath-weapon",
                "maximum": "proficiency-bonus",
                "recharge": [{"event": "long-rest", "amount": "all"}],
            },
            {
                "id": "srd521.resource.dragonborn.draconic-flight",
                "maximum": 1,
                "minimumLevel": 5,
                "recharge": [{"event": "long-rest", "amount": "all"}],
            },
        ],
        "actions": [
            {
                "id": "srd521.action.dragonborn.breath-weapon",
                "actionEconomy": "replace-one-attack",
                "resourceId": "srd521.resource.dragonborn.breath-weapon",
                "spends": 1,
                "damage": {
                    "diceSize": 10,
                    "diceCountByLevel": {"1": 1, "5": 2, "11": 3, "17": 4},
                    "typeFromChoiceId": "srd521.species.dragonborn.choice.draconic-ancestry",
                },
                "savingThrow": {"ability": "dexterity", "difficultyClassAbility": "constitution"},
                "areaOptions": ["15-foot cone", "30-foot by 5-foot line"],
                "halfDamageOnSave": True,
            },
            {
                "id": "srd521.action.dragonborn.draconic-flight",
                "actionEconomy": "bonus-action",
                "resourceId": "srd521.resource.dragonborn.draconic-flight",
                "spends": 1,
                "minimumLevel": 5,
                "effect": "Fly Speed equal to Speed",
                "duration": "10 minutes",
            },
        ],
        "traitNames": [
            "Draconic Ancestry",
            "Breath Weapon",
            "Damage Resistance",
            "Darkvision",
            "Draconic Flight",
        ],
        "traitsText": trait_text,
    }


def parse_elf(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Darkvision with a range of 60 feet",
        "Elven Lineages",
        "Dancing Lights",
        "Faerie Fire",
        "Darkness",
        "Prestidigitation",
        "Detect Magic",
        "Misty Step",
        "Druidcraft",
        "Longstrider",
        "Pass without Trace",
        "Intelligence, Wisdom, or Charisma is your spellcasting ability",
        "avoid or end the Charmed condition",
        "Insight, Perception, or Survival skill",
        "Long Rest in 4 hours",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Elf species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Elf trait text is incomplete")
    lineage_choice_id = "srd521.species.elf.choice.elven-lineage"
    ability_choice_id = "srd521.species.elf.choice.spellcasting-ability"
    high_elf_cantrip_choice_id = "srd521.species.elf.choice.high-elf-cantrip"
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 60,
        "skillProficiencyChoice": {
            "minimum": 1,
            "maximum": 1,
            "options": [
                "srd521.skill.insight",
                "srd521.skill.perception",
                "srd521.skill.survival",
            ],
        },
        "choices": [
            {
                "id": lineage_choice_id,
                "prompt": "Choose an Elven Lineage",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": "srd521.species.elf.lineage.drow",
                        "name": "Drow",
                        "darkvisionRange": 120,
                        "spellGrants": [
                            {"spellId": "srd521.spell.dancing-lights", "minimumLevel": 1},
                            {
                                "spellId": "srd521.spell.faerie-fire",
                                "minimumLevel": 3,
                                "freeCastResourceId": "srd521.resource.elf.drow.faerie-fire",
                            },
                            {
                                "spellId": "srd521.spell.darkness",
                                "minimumLevel": 5,
                                "freeCastResourceId": "srd521.resource.elf.drow.darkness",
                            },
                        ],
                    },
                    {
                        "id": "srd521.species.elf.lineage.high",
                        "name": "High Elf",
                        "spellChoiceId": high_elf_cantrip_choice_id,
                        "spellGrants": [
                            {
                                "spellId": "srd521.spell.detect-magic",
                                "minimumLevel": 3,
                                "freeCastResourceId": "srd521.resource.elf.high.detect-magic",
                            },
                            {
                                "spellId": "srd521.spell.misty-step",
                                "minimumLevel": 5,
                                "freeCastResourceId": "srd521.resource.elf.high.misty-step",
                            },
                        ],
                    },
                    {
                        "id": "srd521.species.elf.lineage.wood",
                        "name": "Wood Elf",
                        "walkingSpeed": 35,
                        "spellGrants": [
                            {"spellId": "srd521.spell.druidcraft", "minimumLevel": 1},
                            {
                                "spellId": "srd521.spell.longstrider",
                                "minimumLevel": 3,
                                "freeCastResourceId": "srd521.resource.elf.wood.longstrider",
                            },
                            {
                                "spellId": "srd521.spell.pass-without-trace",
                                "minimumLevel": 5,
                                "freeCastResourceId": "srd521.resource.elf.wood.pass-without-trace",
                            },
                        ],
                    },
                ],
            },
            {
                "id": ability_choice_id,
                "prompt": "Choose an Elven Lineage spellcasting ability",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.elf.spellcasting-ability.{ability}",
                        "name": ability.title(),
                        "ability": ability,
                    }
                    for ability in ("intelligence", "wisdom", "charisma")
                ],
            },
        ],
        "spellChoices": [
            {
                "id": high_elf_cantrip_choice_id,
                "prompt": "Choose a High Elf cantrip",
                "minimum": 1,
                "maximum": 1,
                "requiredWhen": {
                    "choiceId": lineage_choice_id,
                    "optionId": "srd521.species.elf.lineage.high",
                },
                "spellListClassId": "srd521.class.wizard",
                "spellLevel": 0,
                "defaultSpellId": "srd521.spell.prestidigitation",
                "changeOn": ["long-rest"],
            }
        ],
        "spellcastingAbilityChoiceId": ability_choice_id,
        "conditionalRollEffects": [
            {
                "testIds": "saving-throws",
                "kind": "advantage",
                "situationalTag": "avoid-or-end-charmed",
                "source": "Fey Ancestry",
            }
        ],
        "longRestHours": 4,
        "sleepRequired": False,
        "immuneToMagicalSleep": True,
        "traitNames": ["Darkvision", "Elven Lineage", "Fey Ancestry", "Keen Senses", "Trance"],
        "traitsText": text,
    }


def parse_gnome(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Darkvision with a range of 60 feet",
        "Advantage on Intelligence, Wisdom, and Charisma saving throws",
        "Intelligence, Wisdom, or Charisma is your spellcasting ability",
        "Forest Gnome",
        "Minor Illusion",
        "Speak with Animals",
        "number of times equal to your Proficiency Bonus",
        "Rock Gnome",
        "Mending and Prestidigitation cantrips",
        "Tiny clockwork device",
        "three such devices in existence",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Gnome species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Gnome trait text is incomplete")
    lineage_choice_id = "srd521.species.gnome.choice.gnomish-lineage"
    ability_choice_id = "srd521.species.gnome.choice.spellcasting-ability"
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 60,
        "savingThrowAdvantages": ["intelligence", "wisdom", "charisma"],
        "choices": [
            {
                "id": lineage_choice_id,
                "prompt": "Choose a Gnomish Lineage",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": "srd521.species.gnome.lineage.forest",
                        "name": "Forest Gnome",
                        "spellGrants": [
                            {"spellId": "srd521.spell.minor-illusion", "minimumLevel": 1},
                            {
                                "spellId": "srd521.spell.speak-with-animals",
                                "minimumLevel": 1,
                                "freeCastResourceId": (
                                    "srd521.resource.gnome.forest.speak-with-animals"
                                ),
                                "freeCastMaximum": "proficiency-bonus",
                            },
                        ],
                    },
                    {
                        "id": "srd521.species.gnome.lineage.rock",
                        "name": "Rock Gnome",
                        "spellGrants": [
                            {"spellId": "srd521.spell.mending", "minimumLevel": 1},
                            {"spellId": "srd521.spell.prestidigitation", "minimumLevel": 1},
                        ],
                    },
                ],
            },
            {
                "id": ability_choice_id,
                "prompt": "Choose a Gnomish Lineage spellcasting ability",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.gnome.spellcasting-ability.{ability}",
                        "name": ability.title(),
                        "ability": ability,
                    }
                    for ability in ("intelligence", "wisdom", "charisma")
                ],
            },
        ],
        "spellcastingAbilityChoiceId": ability_choice_id,
        "actions": [
            {
                "id": "srd521.action.gnome.rock.clockwork-device",
                "actionEconomy": "10 minutes",
                "requiredWhen": {
                    "choiceId": lineage_choice_id,
                    "optionId": "srd521.species.gnome.lineage.rock",
                },
                "effect": (
                    "Cast Prestidigitation to create a Tiny clockwork device (AC 5, 1 HP) with "
                    "one chosen effect; a creature activates it by touch as a Bonus Action; up "
                    "to three devices can exist, and each lasts 8 hours"
                ),
            }
        ],
        "traitNames": ["Darkvision", "Gnomish Cunning", "Gnomish Lineage"],
        "traitsText": text,
    }


def parse_goliath(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Cloud’s Jaunt",
        "Fire’s Burn",
        "Frost’s Chill",
        "Hill’s Tumble",
        "Stone’s Endurance",
        "Storm’s Thunder",
        "number of times equal to your Proficiency Bonus",
        "Starting at character level 5",
        "Advantage on Strength checks",
        "count as one size larger when determining your carrying capacity",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Goliath species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Goliath trait text is incomplete")

    ancestry_choice_id = "srd521.species.goliath.choice.giant-ancestry"
    ancestry_resource_id = "srd521.resource.goliath.giant-ancestry"
    ancestry_options = [
        (
            "cloud",
            "Cloud Giant",
            "Bonus Action: teleport up to 30 feet to an unoccupied space you can see",
        ),
        ("fire", "Fire Giant", "On a damaging attack-roll hit: deal 1d10 extra Fire damage"),
        (
            "frost",
            "Frost Giant",
            "On a damaging attack-roll hit: deal 1d6 extra Cold damage and reduce Speed by 10 feet",
        ),
        (
            "hill",
            "Hill Giant",
            "On a damaging attack-roll hit: give a Large or smaller target the Prone condition",
        ),
        (
            "stone",
            "Stone Giant",
            "Reaction when damaged: reduce the damage by 1d12 plus your Constitution modifier",
        ),
        (
            "storm",
            "Storm Giant",
            "Reaction when damaged by a creature within 60 feet: deal 1d8 Thunder damage",
        ),
    ]

    def ancestry_requirement(kind: str) -> dict[str, str]:
        return {
            "choiceId": ancestry_choice_id,
            "optionId": f"srd521.species.goliath.ancestry.{kind}",
        }

    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "carryingCapacitySizeCategoryBonus": 1,
        "choices": [
            {
                "id": ancestry_choice_id,
                "prompt": "Choose a Giant Ancestry",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.goliath.ancestry.{kind}",
                        "name": name,
                        "summary": summary,
                    }
                    for kind, name, summary in ancestry_options
                ],
            }
        ],
        "conditionalRollEffects": [
            {
                "testIds": [
                    f"abilityCheck.{ability}"
                    for ability in (
                        "strength",
                        "dexterity",
                        "constitution",
                        "intelligence",
                        "wisdom",
                        "charisma",
                    )
                ],
                "kind": "advantage",
                "situationalTag": "end-grappled",
                "source": "Powerful Build",
            }
        ],
        "resources": [
            {
                "id": ancestry_resource_id,
                "maximum": "proficiency-bonus",
                "recharge": [{"event": "long-rest", "amount": "all"}],
            },
            {
                "id": "srd521.resource.goliath.large-form",
                "maximum": 1,
                "minimumLevel": 5,
                "recharge": [{"event": "long-rest", "amount": "all"}],
            },
        ],
        "actions": [
            {
                "id": "srd521.action.goliath.clouds-jaunt",
                "actionEconomy": "bonus-action",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("cloud"),
                "effect": "Teleport up to 30 feet to an unoccupied space you can see",
            },
            {
                "id": "srd521.action.goliath.fires-burn",
                "actionEconomy": "on-hit",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("fire"),
                "requirement": "Hit with an attack roll and deal damage",
                "damage": {"diceCount": 1, "diceSize": 10, "type": "fire"},
            },
            {
                "id": "srd521.action.goliath.frosts-chill",
                "actionEconomy": "on-hit",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("frost"),
                "requirement": "Hit with an attack roll and deal damage",
                "effect": "Reduce the target’s Speed by 10 feet until the start of your next turn",
                "damage": {"diceCount": 1, "diceSize": 6, "type": "cold"},
            },
            {
                "id": "srd521.action.goliath.hills-tumble",
                "actionEconomy": "on-hit",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("hill"),
                "requirement": "Hit a Large or smaller creature with an attack roll and deal damage",
                "effect": "Give the target the Prone condition",
            },
            {
                "id": "srd521.action.goliath.stones-endurance",
                "actionEconomy": "reaction",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("stone"),
                "requirement": "Take damage",
                "effect": "Reduce the triggering damage by the roll total",
                "roll": {
                    "diceCount": 1,
                    "diceSize": 12,
                    "label": "Damage reduction",
                    "bonusAbility": "constitution",
                },
            },
            {
                "id": "srd521.action.goliath.storms-thunder",
                "actionEconomy": "reaction",
                "resourceId": ancestry_resource_id,
                "spends": 1,
                "requiredWhen": ancestry_requirement("storm"),
                "requirement": "Take damage from a creature within 60 feet",
                "damage": {"diceCount": 1, "diceSize": 8, "type": "thunder"},
            },
            {
                "id": "srd521.action.goliath.large-form",
                "actionEconomy": "bonus-action",
                "resourceId": "srd521.resource.goliath.large-form",
                "spends": 1,
                "minimumLevel": 5,
                "requirement": "Be in a space large enough for Large size",
                "effect": (
                    "Become Large for 10 minutes; gain Advantage on Strength checks and increase "
                    "Speed by 10 feet; end the form with no action"
                ),
            },
        ],
        "traitNames": ["Giant Ancestry", "Large Form", "Powerful Build"],
        "traitsText": text,
    }


def parse_halfling(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Advantage on saving throws you make to avoid or end the Frightened condition",
        "move through the space of any creature that is a size larger than you",
        "When you roll a 1 on the d20 of a D20 Test",
        "you must use the new roll",
        "take the Hide action even when you are obscured only by a creature",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Halfling species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Halfling trait text is incomplete")
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "conditionalRollEffects": [
            {
                "testIds": "saving-throws",
                "kind": "advantage",
                "situationalTag": "avoid-or-end-frightened",
                "source": "Brave",
            }
        ],
        "d20RerollValues": [1],
        "d20RerollSource": "Luck",
        "factGrants": {
            "species.movement.canEnterLargerCreatureSpace": True,
            "species.hide.obscuredByLargerCreature": True,
        },
        "traitNames": ["Brave", "Halfling Nimbleness", "Luck", "Naturally Stealthy"],
        "traitsText": text,
    }


def parse_orc(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>Medium|Small)", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Dash action as a Bonus Action",
        "Temporary Hit Points equal to your Proficiency Bonus",
        "number of times equal to your Proficiency Bonus",
        "finish a Short or Long Rest",
        "Darkvision with a range of 120 feet",
        "reduced to 0 Hit Points but not killed outright",
        "drop to 1 Hit Point instead",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Orc species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Orc trait text is incomplete")
    adrenaline_resource_id = "srd521.resource.orc.adrenaline-rush"
    endurance_resource_id = "srd521.resource.orc.relentless-endurance"
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": [size.group("value").casefold()],
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 120,
        "resources": [
            {
                "id": adrenaline_resource_id,
                "maximum": "proficiency-bonus",
                "recharge": [
                    {"event": "short-rest", "amount": "all"},
                    {"event": "long-rest", "amount": "all"},
                ],
            },
            {
                "id": endurance_resource_id,
                "maximum": 1,
                "recharge": [{"event": "long-rest", "amount": "all"}],
            },
        ],
        "actions": [
            {
                "id": "srd521.action.orc.adrenaline-rush",
                "actionEconomy": "bonus-action",
                "resourceId": adrenaline_resource_id,
                "spends": 1,
                "effect": "Take the Dash action and gain Temporary Hit Points",
                "temporaryHitPointsFact": "proficiencyBonus",
            },
            {
                "id": "srd521.action.orc.relentless-endurance",
                "actionEconomy": "no-action",
                "resourceId": endurance_resource_id,
                "spends": 1,
                "requiredCurrentHitPoints": 0,
                "requirement": "Be reduced to 0 Hit Points without being killed outright",
                "effect": "Drop to 1 Hit Point instead",
                "minimumCurrentHitPoints": 1,
            },
        ],
        "traitNames": ["Adrenaline Rush", "Darkvision", "Relentless Endurance"],
        "traitsText": text,
    }


def parse_tiefling(text: str) -> dict[str, Any]:
    creature_type = re.search(r"Creature Type: (?P<value>\w+)", text)
    size = re.search(r"Size: (?P<value>.+?), chosen when you select this species", text)
    speed = re.search(r"Speed: (?P<value>\d+) feet", text)
    required_phrases = (
        "Darkvision with a range of 60 feet",
        "Choose a legacy from the Fiendish Legacies table",
        "character levels 3 and 5",
        "You always have that spell prepared",
        "cast it once without a spell slot",
        "Intelligence, Wisdom, or Charisma is your spellcasting ability",
        "Otherworldly Presence",
        "Thaumaturgy cantrip",
        "Poison Spray",
        "Ray of Sickness",
        "Hold Person",
        "Chill Touch",
        "False Life",
        "Ray of Enfeeblement",
        "Fire Bolt",
        "Hellish Rebuke",
        "Darkness",
    )
    if creature_type is None or size is None or speed is None:
        raise ValueError("Tiefling species does not match the expected fields")
    if not all(phrase in text for phrase in required_phrases):
        raise ValueError("Tiefling trait text is incomplete")
    size_options = [
        value.casefold() for value in re.findall(r"\b(Medium|Small)\b", size.group("value"))
    ]
    legacy_choice_id = "srd521.species.tiefling.choice.fiendish-legacy"
    ability_choice_id = "srd521.species.tiefling.choice.spellcasting-ability"

    def spell_grant(
        spell: str,
        minimum_level: int,
        *,
        free_cast: bool = False,
    ) -> dict[str, Any]:
        spell_id = f"srd521.spell.{spell}"
        return {
            "spellId": spell_id,
            "minimumLevel": minimum_level,
            **(
                {"freeCastResourceId": (f"srd521.resource.tiefling.{spell}.free-cast")}
                if free_cast
                else {}
            ),
        }

    legacies = (
        (
            "abyssal",
            "Abyssal",
            "poison",
            spell_grant("poison-spray", 1),
            spell_grant("ray-of-sickness", 3, free_cast=True),
            spell_grant("hold-person", 5, free_cast=True),
        ),
        (
            "chthonic",
            "Chthonic",
            "necrotic",
            spell_grant("chill-touch", 1),
            spell_grant("false-life", 3, free_cast=True),
            spell_grant("ray-of-enfeeblement", 5, free_cast=True),
        ),
        (
            "infernal",
            "Infernal",
            "fire",
            spell_grant("fire-bolt", 1),
            spell_grant("hellish-rebuke", 3, free_cast=True),
            spell_grant("darkness", 5, free_cast=True),
        ),
    )
    thaumaturgy = spell_grant("thaumaturgy", 1)
    return {
        "creatureType": creature_type.group("value").casefold(),
        "sizeOptions": size_options,
        "walkingSpeed": int(speed.group("value")),
        "darkvisionRange": 60,
        "choices": [
            {
                "id": legacy_choice_id,
                "prompt": "Choose a Fiendish Legacy",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.tiefling.legacy.{slug}",
                        "name": name,
                        "damageType": resistance,
                        "summary": f"{resistance.title()} resistance; legacy spells at levels 1, 3, and 5",
                        "spellGrants": [cantrip, level_three, level_five, thaumaturgy],
                    }
                    for slug, name, resistance, cantrip, level_three, level_five in legacies
                ],
            },
            {
                "id": ability_choice_id,
                "prompt": "Choose a Fiendish Legacy spellcasting ability",
                "minimum": 1,
                "maximum": 1,
                "options": [
                    {
                        "id": f"srd521.species.tiefling.spellcasting-ability.{ability}",
                        "name": ability.title(),
                        "ability": ability,
                    }
                    for ability in ("intelligence", "wisdom", "charisma")
                ],
            },
        ],
        "spellcastingAbilityChoiceId": ability_choice_id,
        "resistanceFromChoiceId": legacy_choice_id,
        "traitNames": ["Darkvision", "Fiendish Legacy", "Otherworldly Presence"],
        "traitsText": text,
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
    dragonborn_nodes = _section(nodes, "Dragonborn", "Dwarf")
    elf_nodes = [node for node in _section(nodes, "Elf", "Gnome") if node["kind"] != "MetadataNode"]
    raw_page_85 = read_json(extraction_root / "raw" / "pages" / "0085.json")
    elf_nodes.append(_raw_continuation_node(raw_page_85, "p0085-b002"))
    gnome_nodes = [
        node for node in _section(nodes, "Gnome", "Goliath") if node["kind"] != "MetadataNode"
    ]
    gnome_nodes.append(_raw_continuation_node(raw_page_85, "p0085-b008"))
    goliath_nodes = [
        node for node in _section(nodes, "Goliath", "Halfling") if node["kind"] != "MetadataNode"
    ]
    halfling_nodes = _section(nodes, "Halfling", "Human")
    orc_nodes = _section(nodes, "Orc", "Tiefling")
    tiefling_nodes = [
        node for node in _section(nodes, "Tiefling", "Feats") if node["kind"] != "MetadataNode"
    ]
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
    dragonborn = _entity(
        DRAGONBORN_ID,
        "species",
        "Dragonborn",
        ["species", "humanoid", "dragonborn"],
        _source_spans(dragonborn_nodes),
        parse_dragonborn(_text(dragonborn_nodes)),
    )
    elf = _entity(
        ELF_ID,
        "species",
        "Elf",
        ["species", "humanoid", "elf"],
        _source_spans(elf_nodes),
        parse_elf(_text(elf_nodes)),
    )
    gnome = _entity(
        GNOME_ID,
        "species",
        "Gnome",
        ["species", "humanoid", "gnome"],
        _source_spans(gnome_nodes),
        parse_gnome(_text(gnome_nodes).replace("Presti- digitation", "Prestidigitation")),
    )
    goliath = _entity(
        GOLIATH_ID,
        "species",
        "Goliath",
        ["species", "humanoid", "goliath", "giant-ancestry"],
        _source_spans(goliath_nodes),
        parse_goliath(_text(goliath_nodes)),
    )
    halfling = _entity(
        HALFLING_ID,
        "species",
        "Halfling",
        ["species", "humanoid", "halfling"],
        _source_spans(halfling_nodes),
        parse_halfling(_text(halfling_nodes)),
    )
    orc = _entity(
        ORC_ID,
        "species",
        "Orc",
        ["species", "humanoid", "orc"],
        _source_spans(orc_nodes),
        parse_orc(_text(orc_nodes)),
    )
    tiefling = _entity(
        TIEFLING_ID,
        "species",
        "Tiefling",
        ["species", "humanoid", "tiefling", "fiendish-legacy"],
        _source_spans(tiefling_nodes),
        parse_tiefling(_text(tiefling_nodes)),
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
        dragonborn,
        elf,
        gnome,
        goliath,
        halfling,
        orc,
        tiefling,
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
        "Warlock, and Wizard through level 5; all four SRD backgrounds; Human, Dwarf, Dragonborn, "
        "Elf, Gnome, Goliath, Halfling, Orc, and Tiefling; equipment; "
        "and representative spells."
    )
    write_json(output / "coverage.json", coverage)
    report = {
        "generatedEntities": [entity["id"] for entity in origin_entities],
        "backgrounds": {entity["id"]: entity["body"] for entity in backgrounds},
        "human": human["body"],
        "dwarf": dwarf["body"],
        "dragonborn": dragonborn["body"],
        "elf": elf["body"],
        "gnome": gnome["body"],
        "goliath": goliath["body"],
        "halfling": halfling["body"],
        "orc": orc["body"],
        "tiefling": tiefling["body"],
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

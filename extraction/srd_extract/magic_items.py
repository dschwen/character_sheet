"""Extract and annotate the supported magic items from the pinned SRD."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.wizard import _slug, _source_spans

ITEM_MECHANICS: dict[str, dict[str, Any]] = {
    "Boots of Speed": {
        "wearSlot": "footwear",
        "timedPower": {
            "maximumRounds": 100,
            "actionEconomy": "bonus-action",
            "activeDescription": "Opportunity attacks against you have Disadvantage.",
        },
        "speedMultiplier": 2,
        "factGrants": {"incomingOpportunityAttacks.disadvantage": True},
    },
    "Cloak of Protection": {
        "wearSlot": "cloak",
        "armorClassBonus": 1,
        "savingThrowBonus": 1,
    },
    "Cloak of the Manta Ray": {
        "wearSlot": "cloak",
        "speedOverrides": {"speed.swim": 60},
        "factGrants": {"respiration.underwater": True},
    },
    "Ring of Evasion": {
        "power": {
            "savingThrowAbility": "dexterity",
            "charges": {"maximum": 3, "maximumSpend": 1, "dawnDieSize": 3, "dawnBonus": 0},
        }
    },
    "Potion of Invulnerability": {
        "statusPotionId": "srd521.status.item.potion-of-invulnerability",
    },
    "Ring of Feather Falling": {
        "factGrants": {"fall.descentRateFeetPerRound": 60, "fall.damagePreventedOnLanding": True},
    },
    "Ring of Protection": {"armorClassBonus": 1, "savingThrowBonus": 1},
    "Ring of Swimming": {"speedOverrides": {"speed.swim": 40}},
    "Ring of Water Walking": {
        "power": {
            "spellId": "srd521.spell.water-walk",
            "selfStatusId": "srd521.status.spell.water-walk",
        }
    },
    "Wand of Magic Missiles": {
        "power": {
            "spellId": "srd521.spell.magic-missile",
            "baseDarts": 3,
            "charges": {
                "maximum": 7,
                "maximumSpend": 3,
                "dawnDieSize": 6,
                "dawnBonus": 1,
                "lastChargeDieSize": 20,
                "destroyedOn": 1,
            },
        }
    },
}
ITEM_TRAITS = re.compile(
    r"(Potion|Ring|Wand|Wondrous Item), (Uncommon|Rare)( \(Requires Attunement\))?"
)
COMMON_POTION = "srd521.equipment.gear.potion-of-healing"
POTION_VARIANTS = {"Common": "", "Uncommon": "Greater", "Rare": "Superior", "Very Rare": "Supreme"}


def parse_magic_items(document: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = [node for node in document["nodes"] if node["kind"] in {"HeadingNode", "ParagraphNode"}]
    items = []
    for index, heading in enumerate(nodes):
        name = heading["normalizedText"]
        if heading["kind"] != "HeadingNode" or name not in ITEM_MECHANICS:
            continue
        section = nodes[index : index + 3]
        if len(section) != 3 or any(node["kind"] != "ParagraphNode" for node in section[1:]):
            raise ValueError(f"{name} has no item traits or description")
        _, traits, description = section
        match = ITEM_TRAITS.fullmatch(traits["normalizedText"])
        if match is None:
            raise ValueError(f"{name} has unrecognized item traits: {traits['normalizedText']!r}")
        category, rarity, attunement = match.groups()
        items.append(
            {
                "id": f"srd521.magic-item.{_slug(name)}",
                "kind": "magic-item",
                "name": {"en": name},
                "tags": ["magic-item", _slug(category)],
                "source": _source_spans(section),
                "body": {
                    "category": _slug(category),
                    "rarity": rarity.lower(),
                    "requiresAttunement": attunement is not None,
                    "description": description["normalizedText"],
                    **ITEM_MECHANICS[name],
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                },
            }
        )
    if {item["name"]["en"] for item in items} != ITEM_MECHANICS.keys() or len(items) != len(
        ITEM_MECHANICS
    ):
        raise ValueError("Expected one source entry for every supported magic item")
    return items


def parse_healing_potions(
    document: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    nodes = document["nodes"]
    heading_index = next(
        i for i, node in enumerate(nodes) if node["normalizedText"] == "Potions of Healing"
    )
    section = nodes[heading_index : heading_index + 5]
    table = next(node for node in section if node["kind"] == "TableNode")
    supreme_label = "Potion of Healing (supreme)"
    if not any(node["normalizedText"] == supreme_label for node in section):
        raise ValueError("Missing Supreme potion table row")
    rows = re.findall(r"(\d+)d4 \+ (\d+) (Very Rare|Uncommon|Common|Rare)", table["normalizedText"])
    if (
        len(rows) != len(POTION_VARIANTS)
        or {rarity for _, _, rarity in rows} != POTION_VARIANTS.keys()
    ):
        raise ValueError("Unexpected Potions of Healing table")
    source = _source_spans(section)
    common: dict[str, Any] = {}
    variants: list[dict[str, Any]] = []
    for count, bonus, rarity in rows:
        variant = POTION_VARIANTS[rarity]
        body = {
            "category": "potion",
            "rarity": rarity.lower(),
            "requiresAttunement": False,
            "description": f"Regain {count}d4 + {bonus} Hit Points when you drink this potion.",
            "healingPotion": {"diceCount": int(count), "diceSize": 4, "bonus": int(bonus)},
        }
        if not variant:
            common = {"body": body, "source": source}
            continue
        name = f"Potion of Healing ({variant})"
        variants.append(
            {
                "id": f"srd521.magic-item.{_slug(name)}",
                "kind": "magic-item",
                "name": {"en": name},
                "tags": ["magic-item", "potion"],
                "source": source,
                "body": body,
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                },
            }
        )
    return common, variants


def annotate_common_potion(entity: dict[str, Any], potion: dict[str, Any]) -> dict[str, Any]:
    return {
        **entity,
        "body": {**entity["body"], **potion["body"]},
        "source": [
            *entity["source"],
            *(span for span in potion["source"] if span not in entity["source"]),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--document", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    document = read_json(args.document)
    potion, variants = parse_healing_potions(document)
    items = [*parse_magic_items(document), *variants]
    invulnerability = next(
        item for item in items if item["name"]["en"] == "Potion of Invulnerability"
    )
    potion_status = {
        **invulnerability,
        "id": invulnerability["body"]["statusPotionId"],
        "kind": "status",
        "name": {"en": "Potion of Invulnerability"},
        "tags": ["status", "beneficial", "potion"],
        "body": {
            "description": invulnerability["body"]["description"],
            "duration": "1 minute",
            "concentration": False,
            "damageResistances": ["all"],
            "endsOnRest": True,
            "assistedInstructions": ["End the effect after 1 minute."],
        },
    }
    base = read_json(args.output / "entities.json")
    merged = {entity["id"]: entity for entity in base}
    merged[COMMON_POTION] = annotate_common_potion(merged[COMMON_POTION], potion)
    merged.update({item["id"]: item for item in items})
    merged[potion_status["id"]] = potion_status
    write_json(args.output / "entities" / "magic-items.json", items)
    write_json(args.output / "entities" / "magic-item-statuses.json", [potion_status])
    equipment_file = args.output / "entities" / "equipment.json"
    write_json(
        equipment_file,
        [
            annotate_common_potion(entity, potion) if entity["id"] == COMMON_POTION else entity
            for entity in read_json(equipment_file)
        ],
    )
    write_json(args.output / "entities.json", list(merged.values()))
    print(f"Generated {len(items)} magic items")


if __name__ == "__main__":
    main()

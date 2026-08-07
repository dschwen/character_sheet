"""Parse the SRD weapon, armor, adventuring gear, and ammunition tables."""

from __future__ import annotations

import argparse
import hashlib
import re
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

SOURCE_ID = "wotc-srd-5.2.1-en"
WEAPON_CATEGORIES = {
    "Simple Melee Weapons": ("simple", "melee"),
    "Simple Ranged Weapons": ("simple", "ranged"),
    "Martial Melee Weapons": ("martial", "melee"),
    "Martial Ranged Weapons": ("martial", "ranged"),
}
ARMOR_CATEGORIES = {
    "Light Armor": "light",
    "Medium Armor": "medium",
    "Heavy Armor": "heavy",
    "Shield": "shield",
}
DAMAGE_PATTERN = re.compile(
    r"^(?:(?P<count>\d+)d(?P<size>\d+)|(?P<flat>\d+)) "
    r"(?P<type>Bludgeoning|Piercing|Slashing)$"
)


def _quote_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _slug(value: str) -> str:
    normalized = value.casefold().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")


def _column_text(
    words: Iterable[dict[str, Any]],
    minimum_x: float,
    maximum_x: float | None,
) -> str:
    selected = [
        word
        for word in words
        if float(word["bbox"][0]) >= minimum_x
        and (maximum_x is None or float(word["bbox"][0]) < maximum_x)
    ]
    selected.sort(key=lambda word: (float(word["bbox"][1]), float(word["bbox"][0])))
    return " ".join(str(word["text"]) for word in selected)


def _split_properties(value: str) -> list[str]:
    if value == "—":
        return []
    properties: list[str] = []
    start = 0
    depth = 0
    for index, character in enumerate(value):
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        elif character == "," and depth == 0:
            properties.append(value[start:index].strip())
            start = index + 1
    properties.append(value[start:].strip())
    return [property_text for property_text in properties if property_text]


def _parse_weight(value: str) -> float | None:
    if value in {"—", "Varies"}:
        return None
    number = value.replace(" lb. (full)", "").removesuffix(" lb.").strip()
    if number.endswith("½"):
        whole = number.removesuffix("½")
        return (float(whole) if whole else 0) + 0.5
    if "/" in number:
        numerator, denominator = number.split("/", maxsplit=1)
        return int(numerator) / int(denominator)
    return float(number)


def _parse_cost(value: str) -> dict[str, Any]:
    amount, denomination = value.replace(",", "").split()
    return {"amount": int(amount), "denomination": denomination.casefold()}


def _parse_optional_cost(value: str) -> dict[str, Any] | None:
    return None if value == "Varies" else _parse_cost(value)


def _source(block_ids: list[str], page: int, quote: str) -> list[dict[str, Any]]:
    return [
        {
            "sourceId": SOURCE_ID,
            "page": page,
            "blocks": block_ids,
            "quoteHash": _quote_hash(quote),
        }
    ]


def parse_weapon_table(raw_page: dict[str, Any]) -> list[dict[str, Any]]:
    blocks = sorted(raw_page["blocks"], key=lambda block: float(block["bbox"][1]))
    row_blocks = [
        block
        for block in blocks
        if len(str(block["text"]).splitlines()) >= 2
        and DAMAGE_PATTERN.fullmatch(str(block["text"]).splitlines()[1]) is not None
    ]
    category_blocks = [block for block in blocks if str(block["text"]) in WEAPON_CATEGORIES]
    entities: list[dict[str, Any]] = []

    for index, row_block in enumerate(row_blocks):
        row_y = float(row_block["bbox"][1])
        next_y = float(row_blocks[index + 1]["bbox"][1]) if index + 1 < len(row_blocks) else 740.0
        intervening_categories = [
            float(block["bbox"][1])
            for block in category_blocks
            if row_y < float(block["bbox"][1]) < next_y
        ]
        if intervening_categories:
            next_y = min(intervening_categories)
        category_block = max(
            (block for block in category_blocks if float(block["bbox"][1]) < row_y),
            key=lambda block: float(block["bbox"][1]),
        )
        training, attack_type = WEAPON_CATEGORIES[str(category_block["text"])]
        row_words = [
            word
            for word in raw_page["words"]
            if row_y - 1 <= float(word["bbox"][1]) < next_y - 1 and float(word["bbox"][0]) >= 60
        ]
        name = _column_text(row_words, 60, 137)
        damage_text = _column_text(row_words, 137, 215)
        property_text = _column_text(row_words, 215, 430)
        mastery = _column_text(row_words, 430, 480).casefold()
        weight_text = _column_text(row_words, 480, 520)
        cost_text = _column_text(row_words, 520, None)
        damage_match = DAMAGE_PATTERN.fullmatch(damage_text)
        if damage_match is None:
            raise ValueError(f"Unexpected weapon damage expression: {damage_text}")
        properties = _split_properties(property_text)
        range_match = re.search(
            r"Range (?P<normal>\d+)/(?P<long>\d+)(?:; (?P<ammunition>[^)]+))?",
            property_text,
        )
        versatile_match = re.search(r"Versatile \((?P<count>\d+)d(?P<size>\d+)\)", property_text)
        overlapping_blocks = [
            str(block["block_id"])
            for block in blocks
            if float(block["bbox"][1]) < next_y
            and float(block["bbox"][3]) >= row_y
            and float(block["bbox"][0]) >= 60
        ]
        body: dict[str, Any] = {
            "category": training,
            "attackType": attack_type,
            "damage": {
                "diceCount": (
                    None
                    if damage_match.group("count") is None
                    else int(damage_match.group("count"))
                ),
                "diceSize": (
                    None if damage_match.group("size") is None else int(damage_match.group("size"))
                ),
                "flat": (
                    None if damage_match.group("flat") is None else int(damage_match.group("flat"))
                ),
                "type": damage_match.group("type").casefold(),
            },
            "properties": [_slug(value.split("(", maxsplit=1)[0]) for value in properties],
            "propertyText": properties,
            "mastery": mastery,
            "weightLb": _parse_weight(weight_text),
            "cost": _parse_cost(cost_text),
        }
        if range_match is not None:
            body["range"] = {
                "normal": int(range_match.group("normal")),
                "long": int(range_match.group("long")),
                "ammunition": range_match.group("ammunition"),
            }
        if versatile_match is not None:
            body["versatileDamage"] = {
                "diceCount": int(versatile_match.group("count")),
                "diceSize": int(versatile_match.group("size")),
            }
        quote = "\n".join((name, damage_text, property_text, mastery, weight_text, cost_text))
        entities.append(
            {
                "id": f"srd521.equipment.weapon.{_slug(name)}",
                "kind": "equipment-weapon",
                "name": {"en": name},
                "tags": ["equipment", "weapon", training, attack_type],
                "source": _source(overlapping_blocks, 91, quote),
                "body": body,
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": "Extracted from the SRD Weapons table on page 91.",
                },
            }
        )
    if len(entities) != 38:
        raise ValueError(f"Expected 38 weapons; extracted {len(entities)}")
    return entities


def _armor_category(blocks: list[dict[str, Any]], row_y: float) -> str:
    heading = max(
        (
            block
            for block in blocks
            if float(block["bbox"][1]) < row_y
            and any(str(block["text"]).startswith(name) for name in ARMOR_CATEGORIES)
        ),
        key=lambda block: float(block["bbox"][1]),
    )
    name = next(name for name in ARMOR_CATEGORIES if str(heading["text"]).startswith(name))
    return ARMOR_CATEGORIES[name]


def parse_armor_table(raw_page: dict[str, Any]) -> list[dict[str, Any]]:
    blocks = sorted(raw_page["blocks"], key=lambda block: float(block["bbox"][1]))
    row_blocks = [
        block
        for block in blocks
        if 74 <= float(block["bbox"][0]) <= 76 and len(str(block["text"]).splitlines()) == 6
    ]
    entities: list[dict[str, Any]] = []
    for block in row_blocks:
        name, armor_class, strength, stealth, weight, cost = str(block["text"]).splitlines()
        category = _armor_category(blocks, float(block["bbox"][1]))
        if category == "shield":
            armor_class_body = {"kind": "bonus", "bonus": 2}
            kind = "equipment-shield"
        elif "Dex modifier" in armor_class:
            base = int(armor_class.split()[0])
            dexterity_cap_match = re.search(r"max (?P<cap>\d+)", armor_class)
            armor_class_body = {
                "kind": "formula",
                "base": base,
                "dexterityCap": (
                    None if dexterity_cap_match is None else int(dexterity_cap_match.group("cap"))
                ),
            }
            kind = "equipment-armor"
        else:
            armor_class_body = {"kind": "fixed", "base": int(armor_class)}
            kind = "equipment-armor"
        strength_match = re.fullmatch(r"Str (?P<score>\d+)", strength)
        quote = "\n".join((name, armor_class, strength, stealth, weight, cost))
        entities.append(
            {
                "id": (
                    "srd521.equipment.shield"
                    if category == "shield"
                    else f"srd521.equipment.armor.{category}.{_slug(name)}"
                ),
                "kind": kind,
                "name": {"en": name},
                "tags": ["equipment", "armor", category],
                "source": _source([str(block["block_id"])], 92, quote),
                "body": {
                    "category": category,
                    "armorClass": armor_class_body,
                    "strengthRequirement": (
                        None if strength_match is None else int(strength_match.group("score"))
                    ),
                    "stealthDisadvantage": stealth == "Disadvantage",
                    "weightLb": _parse_weight(weight),
                    "cost": _parse_cost(cost),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": "Extracted from the SRD Armor table on page 92.",
                },
            }
        )
    if len(entities) != 13:
        raise ValueError(f"Expected 13 armor and shield entries; extracted {len(entities)}")
    return entities


def parse_adventuring_gear_table(raw_page: dict[str, Any]) -> list[dict[str, Any]]:
    row_blocks = [
        block
        for block in raw_page["blocks"]
        if len(str(block["text"]).splitlines()) == 3
        and str(block["text"]).splitlines()[0] != "Item"
        and (66 <= float(block["bbox"][0]) < 67 or 320 <= float(block["bbox"][0]) < 321)
    ]
    entities: list[dict[str, Any]] = []
    for block in row_blocks:
        name, weight, cost = str(block["text"]).splitlines()
        quote = "\n".join((name, weight, cost))
        entities.append(
            {
                "id": f"srd521.equipment.gear.{_slug(name)}",
                "kind": "equipment-gear",
                "name": {"en": name},
                "tags": ["equipment", "adventuring-gear"],
                "source": _source([str(block["block_id"])], 95, quote),
                "body": {
                    "weightLb": _parse_weight(weight),
                    "cost": _parse_optional_cost(cost),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": "Extracted from the SRD Adventuring Gear table on page 95.",
                },
            }
        )
    if len(entities) != 82:
        raise ValueError(f"Expected 82 adventuring gear entries; extracted {len(entities)}")
    return entities


def parse_ammunition_table(raw_page: dict[str, Any]) -> list[dict[str, Any]]:
    row_blocks = [
        block
        for block in raw_page["blocks"]
        if len(str(block["text"]).splitlines()) == 5
        and str(block["text"]).splitlines()[0] != "Type"
        and 66 <= float(block["bbox"][0]) < 67
    ]
    entities: list[dict[str, Any]] = []
    for block in row_blocks:
        name, amount, storage, weight, cost = str(block["text"]).splitlines()
        quote = "\n".join((name, amount, storage, weight, cost))
        entities.append(
            {
                "id": f"srd521.equipment.ammunition.{_slug(name)}",
                "kind": "equipment-ammunition",
                "name": {"en": name},
                "tags": ["equipment", "ammunition"],
                "source": _source([str(block["block_id"])], 96, quote),
                "body": {
                    "purchaseQuantity": int(amount),
                    "storage": storage,
                    "weightLb": _parse_weight(weight),
                    "cost": _parse_cost(cost),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": "Extracted from the SRD Ammunition table on page 96.",
                },
            }
        )
    if len(entities) != 5:
        raise ValueError(f"Expected 5 ammunition entries; extracted {len(entities)}")
    return entities


def generate_equipment_content(extraction_root: Path, output: Path) -> dict[str, Any]:
    weapons = parse_weapon_table(read_json(extraction_root / "raw" / "pages" / "0091.json"))
    armor = parse_armor_table(read_json(extraction_root / "raw" / "pages" / "0092.json"))
    adventuring_gear = parse_adventuring_gear_table(
        read_json(extraction_root / "raw" / "pages" / "0095.json")
    )
    ammunition = parse_ammunition_table(read_json(extraction_root / "raw" / "pages" / "0096.json"))
    equipment = [*weapons, *armor, *adventuring_gear, *ammunition]
    previous_equipment_ids = {
        entity["id"] for entity in read_json(output / "entities" / "equipment.json")
    }
    existing = [
        entity
        for entity in read_json(output / "entities.json")
        if entity["id"] not in previous_equipment_ids
    ]
    all_entities = [*existing, *equipment]
    write_json(output / "entities" / "equipment.json", equipment)
    write_json(output / "entities.json", all_entities)
    write_json(
        output / "coverage.json",
        {
            "package": "srd-5.2.1",
            "generatedAt": None,
            "counts": {
                "UNCLASSIFIED": 0,
                "TEXT_ONLY": 0,
                "STRUCTURED": len(all_entities),
                "EXECUTABLE": 0,
                "TESTED": 0,
                "VERIFIED": 0,
            },
            "note": (
                "Barbarian pages 28–30 and equipment pages 91–92 and 95–96 proof of concept. "
                "Proposed executable rules remain under review."
            ),
        },
    )
    report = {
        "weapons": len(weapons),
        "armorAndShields": len(armor),
        "adventuringGear": len(adventuring_gear),
        "ammunition": len(ammunition),
        "generatedEntities": [entity["id"] for entity in equipment],
    }
    write_json(output / "equipment-poc-report.json", report)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    report = generate_equipment_content(options.extraction, options.output)
    print(
        f"Generated {report['weapons']} weapons and "
        f"{report['armorAndShields']} armor/shield, "
        f"{report['adventuringGear']} adventuring gear, and "
        f"{report['ammunition']} ammunition entries"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

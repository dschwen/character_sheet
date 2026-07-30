from typing import Any

from srd_extract.equipment import parse_armor_table, parse_weapon_table


def _word(text: str, x: float, y: float) -> dict[str, Any]:
    return {"text": text, "bbox": [x, y, x + 10, y + 8]}


def test_parse_weapon_table_reads_all_columns_and_wrapped_properties() -> None:
    categories = [
        ("Simple Melee Weapons", 40.0, 10),
        ("Simple Ranged Weapons", 200.0, 4),
        ("Martial Melee Weapons", 300.0, 18),
        ("Martial Ranged Weapons", 560.0, 6),
    ]
    blocks: list[dict[str, Any]] = []
    words: list[dict[str, Any]] = []
    expected_count = 0
    for category, category_y, row_count in categories:
        blocks.append(
            {
                "block_id": f"category-{expected_count}",
                "bbox": [53, category_y, 200, category_y + 10],
                "text": category,
            }
        )
        for offset in range(row_count):
            y = category_y + 15 + offset * 12
            name = f"Weapon {expected_count}"
            blocks.append(
                {
                    "block_id": f"row-{expected_count}",
                    "bbox": [61, y, 550, y + 10],
                    "text": f"{name}\n1d8 Slashing\nFinesse\nVex\n2 lb.\n5 GP",
                }
            )
            for text, x in (
                (name, 61),
                ("1d8", 140),
                ("Slashing", 165),
                ("Finesse", 220),
                ("Vex", 435),
                ("2", 492),
                ("lb.", 500),
                ("5", 533),
                ("GP", 542),
            ):
                words.append(_word(text, x, y))
            expected_count += 1
    page = {"blocks": blocks, "words": words}

    weapons = parse_weapon_table(page)

    assert len(weapons) == 38
    assert weapons[0]["body"]["damage"]["diceSize"] == 8
    assert weapons[0]["body"]["properties"] == ["finesse"]
    assert weapons[-1]["body"]["category"] == "martial"
    assert weapons[-1]["body"]["attackType"] == "ranged"


def test_parse_armor_table_reads_formulas_caps_and_shields() -> None:
    categories = (
        ("Light Armor", "light", 300.0, 3),
        ("Medium Armor", "medium", 380.0, 5),
        ("Heavy Armor", "heavy", 480.0, 4),
        ("Shield", "shield", 560.0, 1),
    )
    blocks: list[dict[str, Any]] = []
    row_number = 0
    for heading, category, y, count in categories:
        blocks.append(
            {
                "block_id": f"heading-{category}",
                "bbox": [66, y, 250, y + 10],
                "text": f"{heading} (time)",
            }
        )
        for offset in range(count):
            row_y = y + 15 + offset * 12
            if category == "shield":
                fields = ("Shield", "+2", "—", "—", "6 lb.", "10 GP")
            elif category == "heavy":
                fields = (f"Heavy {offset}", "16", "Str 13", "Disadvantage", "55 lb.", "75 GP")
            elif category == "medium":
                fields = (
                    f"Medium {offset}",
                    "13 + Dex modifier (max 2)",
                    "—",
                    "—",
                    "20 lb.",
                    "50 GP",
                )
            else:
                fields = (f"Light {offset}", "11 + Dex modifier", "—", "—", "10 lb.", "10 GP")
            blocks.append(
                {
                    "block_id": f"armor-{row_number}",
                    "bbox": [75, row_y, 536, row_y + 10],
                    "text": "\n".join(fields),
                }
            )
            row_number += 1

    armor = parse_armor_table({"blocks": blocks})

    assert len(armor) == 13
    assert armor[3]["body"]["armorClass"]["dexterityCap"] == 2
    assert armor[8]["body"]["strengthRequirement"] == 13
    assert armor[-1]["kind"] == "equipment-shield"
    assert armor[-1]["body"]["armorClass"] == {"kind": "bonus", "bonus": 2}

from typing import Any

from srd_extract.fighter import (
    _class_entity,
    extract_champion_features,
    parse_core_traits,
    parse_progression,
)


def _word(text: str, x: float, y: float) -> dict[str, Any]:
    return {
        "text": text,
        "bbox": [x, y, x + min(100, max(8, len(text) * 4)), y + 10],
    }


def test_parse_core_fighter_traits() -> None:
    traits = parse_core_traits(
        "Core Fighter Traits Primary Ability Strength or Dexterity "
        "Hit Point Die D10 per Fighter level "
        "Saving Throw Proficiencies Strength and Constitution "
        "Skill Proficiencies Choose 2: Acrobatics, Animal Handling, Athletics, History, "
        "Insight, Intimidation, Persuasion, Perception, or Survival "
        "Weapon Proficiencies Simple and Martial weapons "
        "Armor Training Light, Medium, and Heavy armor and Shields "
        "Starting Equipment Choose A, B, or C"
    )

    assert traits["primaryAbilities"] == ["strength", "dexterity"]
    assert traits["hitPointDie"] == 10
    assert traits["savingThrowProficiencies"] == ["strength", "constitution"]
    assert traits["skillProficiencyChoice"]["maximum"] == 2
    assert traits["armorTraining"] == ["light", "medium", "heavy", "shield"]


def test_fighter_starting_equipment_preserves_all_three_source_packages() -> None:
    entity = _class_entity({}, (), {"entries": []}, [])
    equipment = entity["body"]["startingEquipment"]

    assert equipment["minimum"] == equipment["maximum"] == 1
    assert [option["label"] for option in equipment["options"]] == [
        "Package A",
        "Package B",
        "Package C",
    ]
    assert equipment["options"][0]["items"][-1] == {
        "kind": "text",
        "name": "Dungeoneer's Pack",
        "quantity": 1,
    }
    assert equipment["options"][2]["currencyGp"] == 155


def test_parse_fighter_progression_enforces_twenty_levels() -> None:
    words: list[dict[str, Any]] = []
    for level in range(1, 21):
        y = 420.0 + level * 12
        bonus = 2 + (level - 1) // 4
        words.extend(
            [
                _word(str(level), 80, y),
                _word(f"+{bonus}", 130, y),
                _word("Feature", 170, y),
                _word("2", 450, y),
                _word("3", 510, y),
            ]
        )
    raw_page = {"words": words}
    region = {"bbox": [63.0, 376.0, 541.0, 725.0]}

    progression = parse_progression(raw_page, region)

    assert len(progression) == 20
    assert progression[0].second_wind == 2
    assert progression[0].weapon_mastery == 3
    assert progression[4].proficiency_bonus == 3
    assert progression[-1].level == 20


def test_extract_champion_features_reconciles_all_headings() -> None:
    nodes: list[dict[str, Any]] = [
        {
            "kind": "HeadingNode",
            "normalizedText": "Fighter Subclass: Champion",
            "parentId": "page-0049",
            "sourceBlocks": ["champion"],
        },
        {
            "kind": "ParagraphNode",
            "normalizedText": "Champion introduction.",
            "parentId": "page-0049",
            "sourceBlocks": ["intro"],
        },
    ]
    for level, name in (
        (3, "Improved Critical"),
        (3, "Remarkable Athlete"),
        (7, "Additional Fighting Style"),
        (10, "Heroic Warrior"),
        (15, "Superior Critical"),
        (18, "Survivor"),
    ):
        nodes.extend(
            [
                {
                    "kind": "HeadingNode",
                    "normalizedText": f"Level {level}: {name}",
                    "parentId": "page-0049",
                    "sourceBlocks": [f"heading-{level}-{name}"],
                },
                {
                    "kind": "ParagraphNode",
                    "normalizedText": f"{name} text.",
                    "parentId": "page-0049",
                    "sourceBlocks": [f"body-{level}-{name}"],
                },
            ]
        )
    nodes.append(
        {
            "kind": "HeadingNode",
            "normalizedText": "Monk",
            "parentId": "page-0049",
            "sourceBlocks": ["monk"],
        }
    )

    features = extract_champion_features({"nodes": nodes})

    assert len(features) == 6
    assert features[0]["id"] == "srd521.subclass-feature.fighter.champion.improved-critical"
    assert features[1]["level"] == 3
    assert features[-1]["name"] == "Survivor"

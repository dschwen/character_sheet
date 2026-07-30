from typing import Any

from srd_extract.barbarian import (
    extract_class_features,
    parse_core_traits,
    parse_progression,
)


def _word(text: str, x: float, y: float) -> dict[str, Any]:
    return {
        "text": text,
        "bbox": [x, y, x + min(100, max(8, len(text) * 4)), y + 10],
    }


def test_parse_core_traits_reconstructs_wrapped_values() -> None:
    rows = [
        ("Primary Ability", "Strength"),
        ("Hit Point Die", "D12 per Barbarian level"),
        ("Saving Throw Proficiencies", "Strength and Constitution"),
        (
            "Skill Proficiencies",
            "Choose 2: Animal Handling, Athletics, Intimidation, Na-",
        ),
        ("Weapon Proficiencies", "Simple and Martial weapons"),
        ("Armor Training", "Light and Medium armor and Shields"),
        (
            "Starting Equipment",
            "Choose A or B: (A) Greataxe, 4 Handaxes, Explorer’s Pack, and 15 GP; or (B) 75 GP",
        ),
    ]
    words: list[dict[str, Any]] = []
    y = 115.0
    for label, value in rows:
        words.extend([_word(label, 70, y), _word(value, 165, y)])
        if label == "Skill Proficiencies":
            words.append(_word("ture, Perception, or Survival", 165, y + 12))
            y += 12
        y += 20
    raw_page = {"words": words}
    region = {"bbox": [63.0, 90.0, 290.0, 310.0]}

    traits, parsed_rows = parse_core_traits(raw_page, region)

    assert traits.hit_point_die == 12
    assert traits.primary_abilities == ("strength",)
    assert traits.saving_throw_proficiencies == ("strength", "constitution")
    assert traits.skill_choice_count == 2
    assert traits.skill_options == (
        "animal handling",
        "athletics",
        "intimidation",
        "nature",
        "perception",
        "survival",
    )
    assert parsed_rows["Skill Proficiencies"].endswith("Nature, Perception, or Survival")


def test_parse_progression_enforces_all_twenty_levels_and_bonus_formula() -> None:
    words: list[dict[str, Any]] = []
    for level in range(1, 21):
        y = 420.0 + level * 12
        bonus = 2 + (level - 1) // 4
        words.extend(
            [
                _word(str(level), 80, y),
                _word(f"+{bonus}", 130, y),
                _word("Feature", 170, y),
                _word(str(min(6, 2 + level // 4)), 412, y),
                _word("+2", 461, y),
                _word("2", 515, y),
            ]
        )
    raw_page = {"words": words}
    region = {"bbox": [63.0, 376.0, 541.0, 725.0]}

    progression = parse_progression(raw_page, region)

    assert len(progression) == 20
    assert progression[0].level == 1
    assert progression[4].proficiency_bonus == 3
    assert progression[-1].level == 20
    assert progression[-1].proficiency_bonus == 6


def test_extract_class_features_crosses_metadata_and_table_nodes() -> None:
    document = {
        "nodes": [
            {
                "nodeId": "p0028-n001",
                "parentId": "page-0028",
                "kind": "HeadingNode",
                "normalizedText": "Level 1: Rage",
                "sourceBlocks": ["p0028-b001"],
            },
            {
                "nodeId": "p0028-n002",
                "parentId": "page-0028",
                "kind": "ParagraphNode",
                "normalizedText": "Enter a Rage.",
                "sourceBlocks": ["p0028-b002"],
            },
            {
                "nodeId": "p0028-n003",
                "parentId": "page-0028",
                "kind": "TableNode",
                "normalizedText": "Progression",
                "sourceBlocks": ["p0028-b003"],
            },
            {
                "nodeId": "p0028-n004",
                "parentId": "page-0028",
                "kind": "MetadataNode",
                "normalizedText": "28",
                "sourceBlocks": ["p0028-b004"],
            },
            {
                "nodeId": "p0029-n001",
                "parentId": "page-0029",
                "kind": "ParagraphNode",
                "normalizedText": "While active, Rage grants benefits.",
                "sourceBlocks": ["p0029-b001"],
            },
            {
                "nodeId": "p0029-n002",
                "parentId": "page-0029",
                "kind": "HeadingNode",
                "normalizedText": "Level 1: Unarmored Defense",
                "sourceBlocks": ["p0029-b002"],
            },
            {
                "nodeId": "p0029-n003",
                "parentId": "page-0029",
                "kind": "ParagraphNode",
                "normalizedText": "Your base Armor Class changes.",
                "sourceBlocks": ["p0029-b003"],
            },
        ]
    }

    features = extract_class_features(document)

    assert [feature.name for feature in features] == ["Rage", "Unarmored Defense"]
    assert len(features[0].body_nodes) == 2
    assert [span["page"] for span in features[0].source_spans] == [28, 29]

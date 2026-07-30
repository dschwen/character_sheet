from typing import Any

from srd_extract.fighter import parse_core_traits, parse_progression


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

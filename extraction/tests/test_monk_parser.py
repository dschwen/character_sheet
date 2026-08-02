import pytest

from srd_extract.monk import MonkProgressionRow, parse_core_traits


def test_parse_core_monk_traits() -> None:
    traits = parse_core_traits(
        "Core Monk Traits Primary Ability Dexterity and Wisdom "
        "Hit Point Die D8 per Monk level "
        "Saving Throw Proficiencies Strength and Dexterity "
        "Skill Proficiencies Choose 2: Acrobatics, Athletics, History, Insight, Religion, "
        "or Stealth "
        "Weapon Proficiencies Simple weapons and Martial weapons that have the Light property "
        "Tool Proficiencies Choose one type of Artisan’s Tools or Musical Instrument "
        "(see “Equipment”) "
        "Armor Training None",
        "Choose A or B",
    )

    assert traits["primaryAbilities"] == ["dexterity", "wisdom"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["strength", "dexterity"]
    assert traits["weaponProficiencies"] == ["simple"]
    assert traits["armorTraining"] == []


def test_monk_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        MonkProgressionRow(5, 2, ("Extra Attack", "Stunning Strike"), 8, 5, 10)


def test_monk_progression_accepts_level_five_row() -> None:
    row = MonkProgressionRow(5, 3, ("Extra Attack", "Stunning Strike"), 8, 5, 10)

    assert row.martial_arts_die == 8
    assert row.focus_points == 5
    assert row.unarmored_movement == 10

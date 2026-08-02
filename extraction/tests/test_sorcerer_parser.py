import pytest

from srd_extract.sorcerer import SorcererProgressionRow, parse_core_traits


def test_parse_core_sorcerer_traits() -> None:
    traits = parse_core_traits(
        "Core Sorcerer Traits Primary Ability Charisma Hit Point Die D6 per Sorcerer level "
        "Saving Throw Proficiencies Constitution and Charisma "
        "Skill Proficiencies Choose 2: Arcana, Deception, Insight, Intimidation, Persuasion, "
        "or Religion Weapon Proficiencies Simple weapons Armor Training None "
        "Starting Equipment Choose A or B: (A) arcane equipment; or (B) 50 GP"
    )

    assert traits["primaryAbilities"] == ["charisma"]
    assert traits["hitPointDie"] == 6
    assert traits["savingThrowProficiencies"] == ["constitution", "charisma"]
    assert traits["skillProficiencyChoice"]["minimum"] == 2
    assert traits["armorTraining"] == []


def test_sorcerer_progression_row_accepts_level_five_values() -> None:
    row = SorcererProgressionRow(
        5, 3, ("Sorcerous Restoration",), 5, 5, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0)
    )

    assert row.sorcery_points == 5
    assert row.cantrips == 5
    assert row.prepared_spells == 9


def test_sorcerer_progression_row_rejects_wrong_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        SorcererProgressionRow(5, 2, (), 5, 5, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))

import pytest

from srd_extract.cleric import (
    ClericProgressionRow,
    _class_entity,
    _starting_equipment,
    parse_core_traits,
)


def test_parse_core_cleric_traits() -> None:
    traits = parse_core_traits(
        "Core Cleric Traits Primary Ability Wisdom "
        "Hit Point Die D8 per Cleric level "
        "Saving Throw Proficiencies Wisdom and Charisma "
        "Skill Proficiencies Choose 2: History, Insight, Medicine, Persuasion, or Religion "
        "Weapon Proficiencies Simple weapons "
        "Armor Training Light and Medium armor and Shields "
        "Starting Equipment Choose A or B"
    )

    assert traits["primaryAbilities"] == ["wisdom"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["wisdom", "charisma"]
    assert traits["armorTraining"] == ["light", "medium", "shield"]


def test_cleric_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        ClericProgressionRow(5, 2, ("Sear Undead",), 2, 4, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))


def test_cleric_progression_accepts_level_five_row() -> None:
    row = ClericProgressionRow(5, 3, ("Sear Undead",), 2, 4, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))

    assert row.channel_divinity == 2
    assert row.prepared_spells == 9
    assert row.spell_slots[:3] == (4, 3, 2)


def test_level_nine_builder_and_progression() -> None:
    row = ClericProgressionRow(9, 4, (), 3, 4, 14, (4, 3, 3, 3, 1, 0, 0, 0, 0))
    body = _class_entity({}, (row,), (), {}, [])["body"]
    assert body["builder"]["supportedLevelMaximum"] == 9
    assert body["skillProficiencyChoice"]["countByLevel"]["9"] == 2
    assert body["progression"][0]["spellSlots"]["5"] == 1
    assert body["progression"][0]["preparedSpells"] == 14
    assert body["progression"][0]["channelDivinity"] == 3


def test_cleric_starting_equipment_preserves_package_and_gold_choices() -> None:
    choice = _starting_equipment()

    assert [option["currencyGp"] for option in choice["options"]] == [7, 110]
    assert [item["entityId"] for item in choice["options"][0]["items"]] == [
        "srd521.equipment.armor.medium.chain-shirt",
        "srd521.equipment.shield",
        "srd521.equipment.weapon.mace",
        "srd521.equipment.gear.holy-symbol",
        "srd521.equipment.gear.priests-pack",
    ]

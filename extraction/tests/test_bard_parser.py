import pytest

from srd_extract.bard import BardProgressionRow, _starting_equipment, parse_core_traits


def test_parse_core_bard_traits() -> None:
    traits = parse_core_traits(
        "Core Bard Traits Primary Ability Charisma Hit Point Die D8 per Bard level "
        "Saving Throw Proficiencies Dexterity and Charisma "
        "Skill Proficiencies Choose any 3 skills (see chapter 1) "
        "Weapon Proficiencies Simple weapons "
        "Tool Proficiencies Choose 3 Musical Instruments (see chapter 6) "
        "Armor Training Light armor",
        "Choose A or B: (A) Bard equipment; or (B) 90 GP",
    )

    assert traits["primaryAbilities"] == ["charisma"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["dexterity", "charisma"]
    assert traits["skillProficiencyChoice"]["maximum"] == 3
    assert traits["toolProficiencyChoice"]["maximum"] == 3
    assert traits["armorTraining"] == ["light"]


def test_bard_progression_row_accepts_level_five_values() -> None:
    row = BardProgressionRow(5, 3, (), 8, 3, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))

    assert row.bardic_die_size == 8
    assert row.cantrips == 3
    assert row.prepared_spells == 9
    assert row.spell_slots[:3] == (4, 3, 2)


def test_bard_progression_row_rejects_wrong_inspiration_die() -> None:
    with pytest.raises(ValueError, match="Bardic Inspiration die"):
        BardProgressionRow(5, 3, (), 6, 3, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))


def test_bard_starting_equipment_preserves_package_and_gold_choices() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [19, 90]
    assert [
        item.get("entityId", item.get("name")) for item in equipment["options"][0]["items"]
    ] == [
        "srd521.equipment.armor.light.leather-armor",
        "srd521.equipment.weapon.dagger",
        "Musical Instrument of your choice",
        "srd521.equipment.gear.entertainers-pack",
    ]

import pytest

from srd_extract.warlock import WarlockProgressionRow, _starting_equipment, parse_core_traits


def test_parse_core_warlock_traits() -> None:
    traits = parse_core_traits(
        "Core Warlock Traits Primary Ability Charisma Hit Point Die D8 per Warlock level "
        "Saving Throw Proficiencies Wisdom and Charisma "
        "Skill Proficiencies Choose 2: Arcana, Deception, History, Intimidation, Investigation, "
        "Nature, or Religion Weapon Proficiencies Simple weapons Armor Training Light armor "
        "Starting Equipment Choose A or B: (A) occult equipment; or (B) 100 GP"
    )

    assert traits["primaryAbilities"] == ["charisma"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["wisdom", "charisma"]
    assert traits["skillProficiencyChoice"]["maximum"] == 2
    assert traits["armorTraining"] == ["light"]


def test_warlock_progression_row_accepts_level_five_values() -> None:
    row = WarlockProgressionRow(5, 3, (), 5, 3, 6, 2, 3)

    assert row.eldritch_invocations == 5
    assert row.prepared_spells == 6
    assert row.spell_slots == 2
    assert row.slot_level == 3


def test_warlock_progression_row_rejects_wrong_slot_level() -> None:
    with pytest.raises(ValueError, match="slot level is invalid"):
        WarlockProgressionRow(5, 3, (), 5, 3, 6, 2, 6)


def test_warlock_starting_equipment_preserves_package_and_gold_choices() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [15, 100]
    assert [item["entityId"] for item in equipment["options"][0]["items"]] == [
        "srd521.equipment.armor.light.leather-armor",
        "srd521.equipment.weapon.sickle",
        "srd521.equipment.weapon.dagger",
        "srd521.equipment.gear.arcane-focus",
        "srd521.equipment.gear.book",
        "srd521.equipment.gear.scholars-pack",
    ]

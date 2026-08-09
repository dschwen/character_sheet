import pytest

from srd_extract.paladin import PaladinProgressionRow, _starting_equipment, parse_core_traits


def test_parse_core_paladin_traits() -> None:
    traits = parse_core_traits(
        "Core Paladin Traits Primary Ability Strength and Charisma "
        "Hit Point Die D10 per Paladin level "
        "Saving Throw Proficiencies Wisdom and Charisma "
        "Skill Proficiencies Choose 2: Athletics, Insight, Intimidation, Medicine, "
        "Persuasion, or Religion "
        "Weapon Proficiencies Simple and Martial weapons "
        "Armor Training Light, Medium, and Heavy armor and Shields "
        "Starting Equipment Choose A or B"
    )

    assert traits["primaryAbilities"] == ["strength", "charisma"]
    assert traits["hitPointDie"] == 10
    assert traits["savingThrowProficiencies"] == ["wisdom", "charisma"]
    assert traits["armorTraining"] == ["light", "medium", "heavy", "shield"]


def test_paladin_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        PaladinProgressionRow(5, 2, ("Extra Attack",), 2, 6, (4, 2, 0, 0, 0))


def test_paladin_progression_accepts_level_five_row() -> None:
    row = PaladinProgressionRow(5, 3, ("Extra Attack", "Faithful Steed"), 2, 6, (4, 2, 0, 0, 0))

    assert row.channel_divinity == 2
    assert row.prepared_spells == 6
    assert row.spell_slots[:2] == (4, 2)


def test_paladin_starting_equipment_preserves_both_source_packages() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [9, 150]
    assert [item.get("entityId") for item in equipment["options"][0]["items"]] == [
        "srd521.equipment.armor.heavy.chain-mail",
        "srd521.equipment.shield",
        "srd521.equipment.weapon.longsword",
        "srd521.equipment.weapon.javelin",
        "srd521.equipment.gear.holy-symbol",
        "srd521.equipment.gear.priests-pack",
    ]

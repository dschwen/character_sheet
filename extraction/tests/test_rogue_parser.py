import pytest

from srd_extract.rogue import RogueProgressionRow, _starting_equipment, parse_core_traits


def test_parse_core_rogue_traits() -> None:
    traits = parse_core_traits(
        "Core Rogue Traits Primary Ability Dexterity "
        "Hit Point Die D8 per Rogue level "
        "Saving Throw Proficiencies Dexterity and Intelligence "
        "Skill Proficiencies Choose 4: Acrobatics, Athletics, Deception, Insight, "
        "Intimidation, Investigation, Perception, Persuasion, Sleight of Hand, or Stealth "
        "Weapon Proficiencies Simple weapons and Martial weapons that have the Finesse or "
        "Light property Tool Proficiencies Thieves’ Tools Armor Training Light armor",
        "Choose A or B: (A) burglar’s equipment; or (B) 100 GP",
    )

    assert traits["primaryAbilities"] == ["dexterity"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["dexterity", "intelligence"]
    assert traits["skillProficiencyChoice"]["minimum"] == 4
    assert traits["toolProficiencies"] == ["Thieves’ Tools"]
    assert traits["armorTraining"] == ["light"]
    assert len(traits["conditionalWeaponProficiencies"]) == 2


def test_rogue_progression_row_accepts_level_five_values() -> None:
    row = RogueProgressionRow(5, 3, ("Cunning Strike", "Uncanny Dodge"), 3)

    assert row.sneak_attack_dice == 3
    assert row.feature_names == ("Cunning Strike", "Uncanny Dodge")


def test_rogue_progression_row_rejects_wrong_sneak_attack_scaling() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        RogueProgressionRow(5, 3, ("Cunning Strike", "Uncanny Dodge"), 2)


def test_rogue_starting_equipment_preserves_both_source_packages() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [8, 100]
    assert [item.get("entityId") for item in equipment["options"][0]["items"]] == [
        "srd521.equipment.armor.light.leather-armor",
        "srd521.equipment.weapon.dagger",
        "srd521.equipment.weapon.shortsword",
        "srd521.equipment.weapon.shortbow",
        "srd521.equipment.ammunition.arrows",
        "srd521.equipment.gear.quiver",
        None,
        "srd521.equipment.gear.burglars-pack",
    ]

import pytest

from srd_extract.ranger import (
    RangerProgressionRow,
    _roving_ir,
    _starting_equipment,
    parse_core_traits,
)


def test_parse_core_ranger_traits() -> None:
    traits = parse_core_traits(
        "Core Ranger Traits Primary Ability Dexterity and Wisdom "
        "Hit Point Die D10 per Ranger level "
        "Saving Throw Proficiencies Strength and Dexterity "
        "Skill Proficiencies Choose 3: Animal Handling, Athletics, Insight, Investigation, "
        "Nature, Perception, Stealth, or Survival "
        "Weapon Proficiencies Simple and Martial weapons "
        "Armor Training Light and Medium armor and Shields "
        "Starting Equipment Choose A or B: (A) wilderness gear; or (B) 150 GP"
    )

    assert traits["primaryAbilities"] == ["dexterity", "wisdom"]
    assert traits["hitPointDie"] == 10
    assert traits["savingThrowProficiencies"] == ["strength", "dexterity"]
    assert traits["skillProficiencyChoice"]["minimum"] == 3
    assert traits["skillProficiencyChoice"]["options"] == [
        "animal handling",
        "athletics",
        "insight",
        "investigation",
        "nature",
        "perception",
        "stealth",
        "survival",
    ]
    assert traits["armorTraining"] == ["light", "medium", "shield"]


def test_ranger_progression_row_accepts_level_five_values() -> None:
    row = RangerProgressionRow(5, 3, ("Extra Attack",), 3, 6, (4, 2, 0, 0, 0))

    assert row.favored_enemy == 3
    assert row.prepared_spells == 6
    assert row.spell_slots == (4, 2, 0, 0, 0)


def test_ranger_progression_row_rejects_wrong_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        RangerProgressionRow(5, 2, ("Extra Attack",), 3, 6, (4, 2, 0, 0, 0))


def test_roving_ir_increases_speed_without_heavy_armor_and_grants_movement_modes() -> None:
    rules = _roving_ir(
        {
            "id": "srd521.class-feature.ranger.roving",
            "level": 6,
            "name": "Roving",
            "source": [],
            "bodyNodes": [],
        }
    )["proposedRules"]

    assert [rule["target"] for rule in rules] == [
        "speed.walking",
        "speed.climb",
        "speed.swim",
    ]
    assert rules[0]["when"] == {
        "kind": "equals",
        "left": {"kind": "ref", "path": "equipment.wearingHeavyArmor"},
        "right": {"kind": "literal", "value": False},
    }
    assert rules[0]["expression"]["args"][1] == {"kind": "literal", "value": 10}
    assert rules[1]["expression"] == {"kind": "ref", "path": "speed.walking"}
    assert rules[2]["expression"] == {"kind": "ref", "path": "speed.walking"}


def test_ranger_starting_equipment_preserves_both_source_packages() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [7, 150]
    assert [item.get("entityId") for item in equipment["options"][0]["items"]] == [
        "srd521.equipment.armor.light.studded-leather-armor",
        "srd521.equipment.weapon.scimitar",
        "srd521.equipment.weapon.shortsword",
        "srd521.equipment.weapon.longbow",
        "srd521.equipment.ammunition.arrows",
        "srd521.equipment.gear.quiver",
        None,
        "srd521.equipment.gear.explorers-pack",
    ]

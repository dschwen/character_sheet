from typing import Any

import pytest

from srd_extract.sorcerer import (
    SorcererProgressionRow,
    _class_entity,
    _innate_sorcery_content,
    _starting_equipment,
    parse_core_traits,
)


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


def test_level_nine_builder_and_progression() -> None:
    row = SorcererProgressionRow(9, 4, (), 9, 5, 14, (4, 3, 3, 3, 1, 0, 0, 0, 0))
    entity = _class_entity({"skillProficiencyChoice": {}}, (row,), (), {}, [])
    assert entity["body"]["builder"]["supportedLevelMaximum"] == 9
    assert entity["body"]["skillProficiencyChoice"]["countByLevel"]["9"] == 2
    assert entity["body"]["progression"][0]["spellSlots"]["5"] == 1
    assert entity["body"]["progression"][0]["preparedSpells"] == 14


def test_sorcerer_progression_row_rejects_wrong_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        SorcererProgressionRow(5, 2, (), 5, 5, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))


def test_level_seven_incarnate_activation_preserves_source_and_exhaustion_prerequisite() -> None:
    def feature(name: str, slug: str, level: int) -> dict[str, Any]:
        return {
            "id": f"srd521.class-feature.sorcerer.{slug}",
            "name": name,
            "level": level,
            "source": [{"sourceId": "test", "page": 66}],
            "bodyNodes": [],
        }

    innate = feature("Innate Sorcery", "innate-sorcery", 1)
    incarnate = feature("Sorcery Incarnate", "sorcery-incarnate", 7)
    ordinary, alternate, status = _innate_sorcery_content(innate, incarnate)
    assert ordinary["source"] == innate["source"]
    assert alternate["source"] == incarnate["source"]
    action = alternate["proposedRules"][0]
    assert action["parameters"]["spends"] == 2
    assert action["when"]["args"][1] == {
        "kind": "not",
        "arg": {
            "kind": "resourceAvailable",
            "resourceId": "srd521.resource.sorcerer.innate-sorcery",
        },
    }
    assert action["when"]["args"][2]["minimum"] == 2
    assert ordinary["proposedRules"][1]["parameters"]["activatesEffectId"] == status["id"]
    assert status["body"]["spellcastingEnhancement"]["castingClassId"] == "srd521.class.sorcerer"
    assert status["body"]["endsOnRest"] is True
    row = SorcererProgressionRow(
        7, 3, ("Sorcery Incarnate",), 7, 5, 11, (4, 3, 3, 1, 0, 0, 0, 0, 0)
    )
    assert row.sorcery_points == 7
    assert row.prepared_spells == 11


def test_sorcerer_starting_equipment_preserves_both_source_packages() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [28, 50]
    assert [item["entityId"] for item in equipment["options"][0]["items"]] == [
        "srd521.equipment.weapon.spear",
        "srd521.equipment.weapon.dagger",
        "srd521.equipment.gear.arcane-focus",
        "srd521.equipment.gear.dungeoneers-pack",
    ]

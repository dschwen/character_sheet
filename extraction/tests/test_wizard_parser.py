from typing import Any

import pytest

from srd_extract.wizard import (
    WizardProgressionRow,
    _class_entity,
    _spellbook_entity,
    parse_core_traits,
)


def test_wizard_starting_equipment_preserves_package_and_gold_choices() -> None:
    entity = _class_entity({}, (), (), {}, [])
    equipment = entity["body"]["startingEquipment"]
    assert entity["body"]["builder"]["supportedLevelMaximum"] == 9
    assert entity["body"]["skillProficiencyChoice"]["countByLevel"]["9"] == 2

    assert [option["currencyGp"] for option in equipment["options"]] == [5, 55]
    assert equipment["options"][0]["items"][1] == {
        "kind": "entity",
        "entityId": "srd521.equipment.weapon.quarterstaff",
        "quantity": 1,
        "equipped": True,
        "label": "Arcane Focus (Quarterstaff)",
    }
    assert equipment["options"][0]["items"][3]["entityId"] == ("srd521.equipment.gear.spellbook")


def test_spellbook_entity_preserves_class_defined_physical_properties() -> None:
    node = {
        "parentId": "page-0078",
        "sourceBlocks": ["spellbook"],
        "normalizedText": ("Spellbook. Your wizardly apprenticeship culminated in a unique book."),
    }

    spellbook = _spellbook_entity({"nodes": [node]})

    assert spellbook["id"] == "srd521.equipment.gear.spellbook"
    assert spellbook["body"] == {
        "weightLb": 3,
        "cost": None,
        "size": "tiny",
        "pageCount": 100,
        "spellcastingFocusFor": ["srd521.class.wizard"],
    }


def test_parse_core_wizard_traits() -> None:
    traits = parse_core_traits(
        "Core Wizard Traits Primary Ability Intelligence "
        "Hit Point Die D6 per Wizard level "
        "Saving Throw Proficiencies Intelligence and Wisdom "
        "Skill Proficiencies Choose 2: Arcana, History, Insight, Investigation, "
        "Medicine, Nature, or Religion "
        "Weapon Proficiencies Simple weapons "
        "Armor Training None "
        "Starting Equipment Choose A or B"
    )

    assert traits["primaryAbilities"] == ["intelligence"]
    assert traits["hitPointDie"] == 6
    assert traits["savingThrowProficiencies"] == ["intelligence", "wisdom"]
    assert traits["skillProficiencyChoice"]["maximum"] == 2
    assert traits["armorTraining"] == []


def test_wizard_progression_requires_nine_slot_columns() -> None:
    with pytest.raises(ValueError, match="nine spell-slot columns"):
        WizardProgressionRow(1, 2, ("Spellcasting",), 3, 4, (2,))


def test_wizard_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        WizardProgressionRow(5, 2, ("Memorize Spell",), 4, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))


def test_wizard_progression_accepts_level_five_row() -> None:
    row: Any = WizardProgressionRow(
        5,
        3,
        ("Memorize Spell",),
        4,
        9,
        (4, 3, 2, 0, 0, 0, 0, 0, 0),
    )

    assert row.prepared_spells == 9
    assert row.spell_slots[:3] == (4, 3, 2)


def test_wizard_level_seven_adds_fourth_level_slot_and_preparation() -> None:
    row = WizardProgressionRow(7, 3, (), 4, 11, (4, 3, 3, 1, 0, 0, 0, 0, 0))
    assert row.cantrips == 4
    assert row.prepared_spells == 11
    assert row.spell_slots[:4] == (4, 3, 3, 1)

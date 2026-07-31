from typing import Any

import pytest

from srd_extract.wizard import (
    WizardProgressionRow,
    parse_core_traits,
)


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

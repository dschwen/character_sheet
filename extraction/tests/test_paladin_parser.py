from pathlib import Path

import pytest

from srd_extract.io import read_json, write_json
from srd_extract.paladin import (
    PaladinProgressionRow,
    _starting_equipment,
    generate_paladin_content,
    parse_core_traits,
)

ROOT = Path(__file__).resolve().parents[2]
CLASS_EXTRACTION = ROOT / "generated/extraction/srd-5.2.1-paladin"
SPELL_EXTRACTION = ROOT / "generated/extraction/srd-5.2.1-spells"


@pytest.mark.skipif(
    not (CLASS_EXTRACTION / "normalized/document.json").exists()
    or not (SPELL_EXTRACTION / "normalized/document.json").exists(),
    reason="Pinned local extraction inputs are unavailable",
)
def test_level_seven_generation_is_source_linked_and_idempotent(tmp_path: Path) -> None:
    content = ROOT / "packages/content-srd-5.2.1/generated"
    write_json(tmp_path / "entities.json", read_json(content / "entities.json"))
    write_json(tmp_path / "coverage.json", read_json(content / "coverage.json"))
    generate_paladin_content(CLASS_EXTRACTION, SPELL_EXTRACTION, tmp_path)
    first = (tmp_path / "entities.json").read_bytes()
    entities = read_json(tmp_path / "entities/paladin.json")
    by_id = {entity["id"]: entity for entity in entities}
    assert by_id["srd521.class.paladin"]["body"]["builder"]["supportedLevelMaximum"] == 7
    feature = by_id["srd521.subclass-feature.paladin.oath-of-devotion.aura-of-devotion"]
    status = by_id["srd521.status.feature.aura-of-devotion"]
    assert feature["body"]["auraConditionImmunities"] == [
        {
            "auraId": "srd521.aura.protection",
            "conditionIds": ["srd521.condition.charmed"],
            "recipientStatusId": status["id"],
        }
    ]
    assert {span["page"] for span in feature["source"]} == {56}
    assert status["source"] == feature["source"]
    assert status["body"]["conditionImmunities"] == ["srd521.condition.charmed"]
    assert "savingThrowAuraRecipient" not in status["body"]
    assert status["body"]["concentration"] is False
    generate_paladin_content(CLASS_EXTRACTION, SPELL_EXTRACTION, tmp_path)
    assert (tmp_path / "entities.json").read_bytes() == first


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

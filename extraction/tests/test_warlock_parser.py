import pytest

from srd_extract.warlock import (
    WarlockProgressionRow,
    _class_entity,
    _contact_patron_ir,
    _dark_ones_own_luck_ir,
    _starting_equipment,
    parse_core_traits,
)


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


def test_warlock_level_seven_adds_invocation_and_fourth_level_pact_slots() -> None:
    row = WarlockProgressionRow(7, 3, (), 6, 3, 8, 2, 4)
    assert row.eldritch_invocations == 6
    assert row.prepared_spells == 8
    assert row.spell_slots == 2
    assert row.slot_level == 4


def test_level_nine_builder_and_pact_progression() -> None:
    row = WarlockProgressionRow(9, 4, (), 7, 3, 10, 2, 5)
    body = _class_entity({"skillProficiencyChoice": {}}, (row,), (), (), {}, [])["body"]
    assert body["builder"]["supportedLevelMaximum"] == 9
    assert body["skillProficiencyChoice"]["countByLevel"]["9"] == 2
    assert body["eldritchInvocationChoice"]["countByLevel"]["9"] == 7
    assert body["alwaysPreparedSpells"]["9"] == ["srd521.spell.contact-other-plane"]
    assert body["progression"][0]["pactSlotLevel"] == 5


def test_contact_patron_has_a_single_long_rest_use_and_source_link() -> None:
    source = [{"sourceId": "test-source", "page": 72, "blocks": ["contact-patron"]}]
    ir = _contact_patron_ir(
        {
            "id": "srd521.class-feature.warlock.contact-patron",
            "name": "Contact Patron",
            "level": 9,
            "source": source,
            "bodyNodes": [],
        }
    )
    assert ir["level"] == 9
    assert ir["source"] == source
    assert len(ir["proposedRules"]) == 1
    assert ir["proposedRules"][0]["target"] == "srd521.resource.warlock.contact-patron"
    assert ir["proposedRules"][0]["parameters"]["recharge"] == [
        {"event": "long-rest", "amount": "all"}
    ]


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


def test_dark_ones_own_luck_preserves_source_and_post_roll_constraints() -> None:
    source = [{"sourceId": "test-source", "page": 76, "blocks": ["p0076-b029"]}]
    feature = {
        "id": "srd521.subclass-feature.warlock.fiend.dark-one-s-own-luck",
        "name": "Dark One’s Own Luck",
        "level": 6,
        "source": source,
        "bodyNodes": [{"kind": "ParagraphNode", "normalizedText": "Source-linked luck text."}],
    }
    ir = _dark_ones_own_luck_ir(feature)
    resource, action = ir["proposedRules"]
    assert ir["source"] == source
    assert ir["parentId"] == "srd521.subclass.warlock.fiend-patron"
    assert ir["text"]["nodes"][0]["text"] == "Source-linked luck text."
    assert resource["expression"]["kind"] == "max"
    assert resource["parameters"]["recharge"] == [{"event": "long-rest", "amount": "all"}]
    assert action["parameters"]["checkBonus"] == {
        "diceCount": 1,
        "diceSize": 10,
        "mode": "add",
        "appliesTo": ["ability-check", "saving-throw"],
        "afterRoll": True,
    }

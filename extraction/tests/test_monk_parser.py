import pytest

from srd_extract.monk import (
    MonkProgressionRow,
    _class_entity,
    _feature_entity,
    _starting_equipment,
    _wholeness_ir,
    parse_core_traits,
)


def test_evasion_retains_text_source_and_requires_half_damage_dexterity_save() -> None:
    source = [{"page": 51, "sourceId": "wotc-srd-5.2.1-en", "blocks": ["p0051-b001"]}]
    entity = _feature_entity(
        {
            "id": "srd521.class-feature.monk.evasion",
            "name": "Evasion",
            "level": 7,
            "source": source,
            "bodyNodes": [{"normalizedText": "Dexterity save for half; not Incapacitated."}],
        },
        "class-feature",
    )
    assert entity["source"] == source
    assert entity["body"]["level"] == 7
    assert entity["body"]["text"] == "Dexterity save for half; not Incapacitated."
    assert entity["body"]["savingThrowDamageEffects"] == [
        {
            "ability": "dexterity",
            "requiresHalfDamageOnSuccess": True,
            "successFraction": 0,
            "failureFraction": 0.5,
            "inactiveConditionIds": ["srd521.condition.incapacitated"],
        }
    ]
    assert entity["review"]["semanticsApproved"] is False


def test_wholeness_uses_progression_die_and_separate_long_rest_resource() -> None:
    ir = _wholeness_ir(
        {
            "id": "srd521.subclass-feature.monk.warrior-of-the-open-hand.wholeness-of-body",
            "level": 6,
            "name": "Wholeness of Body",
            "source": [],
            "bodyNodes": [],
        }
    )
    resource, action = ir["proposedRules"]
    assert ir["kind"] == "subclass-feature"
    assert ir["parentId"] == "srd521.subclass.monk.warrior-of-the-open-hand"
    assert resource["expression"]["kind"] == "max"
    assert resource["parameters"]["recharge"] == [{"event": "long-rest", "amount": "all"}]
    assert action["expression"]["table"] == "srd521.table.monk.martial-arts-die"
    assert action["parameters"]["resourceId"] == resource["target"]
    assert action["parameters"]["healing"] == {
        "diceCount": 1,
        "bonusFact": "ability.wisdom.modifier",
        "minimum": 1,
    }


def test_acrobatic_movement_retains_source_and_does_not_grant_a_speed() -> None:
    source = [{"page": 51, "sourceId": "wotc-srd-5.2.1-en", "blocks": ["p0051-b001"]}]
    entity = _feature_entity(
        {
            "id": "srd521.class-feature.monk.acrobatic-movement",
            "name": "Acrobatic Movement",
            "level": 9,
            "source": source,
            "bodyNodes": [
                {"normalizedText": "Move along vertical surfaces and across liquids on your turn."}
            ],
        },
        "class-feature",
    )
    assert entity["source"] == source
    assert entity["body"]["level"] == 9
    capability = entity["body"]["movementCapabilities"][0]
    assert capability["surfaces"] == ["vertical-surfaces", "liquids"]
    assert capability["requiresNoArmor"] is True
    assert capability["requiresNoShield"] is True
    assert capability["ownTurnOnly"] is True
    assert capability["preventsFallingDuringMovement"] is True
    assert "when you stop" in " ".join(capability["instructions"])
    assert "speedOverrides" not in entity["body"]
    assert entity["review"]["semanticsApproved"] is False


def test_level_nine_progression_uses_d8_nine_focus_and_fifteen_foot_bonus() -> None:
    row = MonkProgressionRow(9, 4, ("Acrobatic Movement",), 8, 9, 15)
    body = _class_entity({"skillProficiencyChoice": {}}, (row,), (), [])["body"]
    assert body["builder"]["supportedLevelMaximum"] == 9
    assert body["skillProficiencyChoice"]["countByLevel"]["9"] == 2
    assert body["progression"][0]["martialArtsDie"] == {"diceCount": 1, "diceSize": 8}
    assert body["progression"][0]["focusPoints"] == 9
    assert body["progression"][0]["unarmoredMovement"] == 15


def test_parse_core_monk_traits() -> None:
    traits = parse_core_traits(
        "Core Monk Traits Primary Ability Dexterity and Wisdom "
        "Hit Point Die D8 per Monk level "
        "Saving Throw Proficiencies Strength and Dexterity "
        "Skill Proficiencies Choose 2: Acrobatics, Athletics, History, Insight, Religion, "
        "or Stealth "
        "Weapon Proficiencies Simple weapons and Martial weapons that have the Light property "
        "Tool Proficiencies Choose one type of Artisan’s Tools or Musical Instrument "
        "(see “Equipment”) "
        "Armor Training None",
        "Choose A or B",
    )

    assert traits["primaryAbilities"] == ["dexterity", "wisdom"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["strength", "dexterity"]
    assert traits["weaponProficiencies"] == ["simple"]
    assert traits["armorTraining"] == []


def test_monk_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        MonkProgressionRow(5, 2, ("Extra Attack", "Stunning Strike"), 8, 5, 10)


def test_monk_progression_accepts_level_five_row() -> None:
    row = MonkProgressionRow(5, 3, ("Extra Attack", "Stunning Strike"), 8, 5, 10)

    assert row.martial_arts_die == 8
    assert row.focus_points == 5
    assert row.unarmored_movement == 10


def test_monk_starting_equipment_preserves_both_source_packages() -> None:
    equipment = _starting_equipment()

    assert [option["currencyGp"] for option in equipment["options"]] == [11, 50]
    assert equipment["options"][0]["items"] == [
        {
            "kind": "entity",
            "entityId": "srd521.equipment.weapon.spear",
            "quantity": 1,
            "equipped": True,
        },
        {
            "kind": "entity",
            "entityId": "srd521.equipment.weapon.dagger",
            "quantity": 5,
            "equipped": False,
        },
        {
            "kind": "text",
            "name": "Artisan’s Tools or Musical Instrument (choose one)",
            "quantity": 1,
        },
        {
            "kind": "entity",
            "entityId": "srd521.equipment.gear.explorers-pack",
            "quantity": 1,
            "equipped": False,
        },
    ]

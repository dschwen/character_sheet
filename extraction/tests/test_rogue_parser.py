import pytest

from srd_extract.rogue import (
    RogueProgressionRow,
    _feature_entity,
    _starting_equipment,
    _supreme_sneak_ir,
    parse_core_traits,
)


def test_supreme_sneak_preserves_hide_origin_cover_cost_and_source() -> None:
    source = [{"sourceId": "wotc-srd-5.2.1-en", "page": 64, "blocks": ["p0064-b001"]}]
    ir = _supreme_sneak_ir(
        {
            "id": "srd521.subclass-feature.rogue.thief.supreme-sneak",
            "name": "Supreme Sneak",
            "level": 9,
            "source": source,
            "bodyNodes": [{"kind": "ParagraphNode", "normalizedText": "Source rule text."}],
        }
    )
    assert ir["level"] == 9
    assert ir["source"] == source
    assert ir["parentId"] == "srd521.subclass.rogue.thief"
    rule = ir["proposedRules"][0]
    assert rule["target"] == "action.cunning-strike.stealth-attack"
    assert rule["parameters"]["sneakAttackDiceCost"] == 1
    assert rule["parameters"]["requirements"] == [
        "hide-action-invisible",
        "end-turn-behind-three-quarters-or-total-cover",
    ]
    assert "activatesEffectId" not in rule["parameters"]
    assert ir["review"]["semantics"] == "needs-review"


def test_rogue_level_nine_scaling() -> None:
    row = RogueProgressionRow(9, 4, ("Subclass feature",), 5)
    assert row.proficiency_bonus == 4
    assert row.sneak_attack_dice == 5


@pytest.mark.parametrize("name", ["Evasion", "Reliable Talent"])
def test_level_seven_features_retain_source_and_structured_semantics(name: str) -> None:
    source = [{"sourceId": "wotc-srd-5.2.1-en", "page": 63, "blocks": ["p0063-b001"]}]
    entity = _feature_entity(
        {
            "id": "test.feature",
            "name": name,
            "level": 7,
            "source": source,
            "bodyNodes": [{"normalizedText": "Source rule text."}],
        },
        "class-feature",
    )
    assert entity["source"] == source
    assert entity["body"]["text"] == "Source rule text."
    assert entity["body"]["level"] == 7
    if name == "Reliable Talent":
        assert entity["body"]["d20Minimums"] == [
            {"testKinds": ["skill", "tool"], "requiresProficiency": True, "minimum": 10}
        ]
    else:
        assert entity["body"]["savingThrowDamageEffects"][0] == {
            "ability": "dexterity",
            "requiresHalfDamageOnSuccess": True,
            "successFraction": 0,
            "failureFraction": 0.5,
            "inactiveConditionIds": ["srd521.condition.incapacitated"],
        }
    assert entity["review"]["semanticsApproved"] is False


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

from typing import Any

import pytest

from srd_extract.druid import (
    DruidProgressionRow,
    _circle_entities,
    _class_entity,
    _starting_equipment,
    parse_core_traits,
)


def test_circle_land_is_a_source_linked_long_rest_choice() -> None:
    def node(kind: str, text: str) -> dict[str, Any]:
        return {
            "kind": kind,
            "normalizedText": text,
            "parentId": "page-0046",
            "sourceBlocks": [text],
        }

    land_nodes = []
    for name in ("Arid Land", "Polar Land", "Temperate Land", "Tropical Land"):
        land_nodes.extend(
            [
                node("HeadingNode", name),
                node("TableNode", "3 Fire Bolt 5 Fireball"),
            ]
        )
    feature = {
        "id": "srd521.subclass-feature.druid.circle-of-the-land.circle-of-the-land-spells",
        "level": 3,
        "name": "Circle of the Land Spells",
        "bodyNodes": land_nodes,
        "source": [],
    }
    entities = _circle_entities(
        {
            "nodes": [
                node("HeadingNode", "Circle of the Land"),
                node("ParagraphNode", "Circle introduction"),
            ]
        },
        (feature,),
    )
    subclass = next(entity for entity in entities if entity["kind"] == "subclass")
    choice = subclass["body"]["landChoice"]
    assert choice["changeOn"] == ["long-rest"]
    assert choice["optionSelection"] == {"sourceFeatureId": feature["id"]}
    assert len(choice["options"]) == 4


def test_parse_core_druid_traits() -> None:
    traits = parse_core_traits(
        "Core Druid Traits Primary Ability Wisdom "
        "Hit Point Die D8 per Druid level "
        "Saving Throw Proficiencies Intelligence and Wisdom "
        "Skill Proficiencies Choose 2: Animal Handling, Arcana, Insight, Medicine, Nature, "
        "Perception, Religion, or Survival "
        "Weapon Proficiencies Simple weapons "
        "Tool Proficiencies Herbalism Kit "
        "Armor Training Light armor and Shields",
        "Choose A or B",
    )

    assert traits["primaryAbilities"] == ["wisdom"]
    assert traits["hitPointDie"] == 8
    assert traits["savingThrowProficiencies"] == ["intelligence", "wisdom"]
    assert traits["armorTraining"] == ["light", "shield"]
    assert traits["toolProficiencies"] == ["Herbalism Kit"]


def test_druid_progression_validates_proficiency_bonus() -> None:
    with pytest.raises(ValueError, match="expected 3"):
        DruidProgressionRow(5, 2, ("Wild Resurgence",), 2, 3, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))


def test_druid_progression_accepts_level_five_row() -> None:
    row = DruidProgressionRow(5, 3, ("Wild Resurgence",), 2, 3, 9, (4, 3, 2, 0, 0, 0, 0, 0, 0))

    assert row.wild_shape == 2
    assert row.prepared_spells == 9
    assert row.spell_slots[:3] == (4, 3, 2)


def test_level_nine_builder_and_progression() -> None:
    row = DruidProgressionRow(9, 4, (), 3, 3, 14, (4, 3, 3, 3, 1, 0, 0, 0, 0))
    body = _class_entity({}, (row,), (), {}, [])["body"]
    assert body["builder"]["supportedLevelMaximum"] == 9
    assert body["skillProficiencyChoice"]["countByLevel"]["9"] == 2
    assert body["progression"][0]["spellSlots"]["5"] == 1
    assert body["progression"][0]["preparedSpells"] == 14
    assert body["progression"][0]["wildShape"] == 3


def test_druid_starting_equipment_preserves_package_and_gold_choices() -> None:
    choice = _starting_equipment()

    assert [option["currencyGp"] for option in choice["options"]] == [9, 50]
    assert [item.get("entityId", item.get("name")) for item in choice["options"][0]["items"]] == [
        "srd521.equipment.armor.light.leather-armor",
        "srd521.equipment.shield",
        "srd521.equipment.weapon.sickle",
        "srd521.equipment.weapon.quarterstaff",
        "srd521.equipment.gear.explorers-pack",
        "Herbalism Kit",
    ]

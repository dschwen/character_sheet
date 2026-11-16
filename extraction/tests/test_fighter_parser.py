from typing import Any

import pytest

from srd_extract.fighter import (
    _class_entity,
    _fighter_authoring_ir,
    _grappler_entity,
    extract_champion_features,
    extract_fighting_styles,
    parse_core_traits,
    parse_progression,
)


def test_indomitable_authoring_and_source_guards() -> None:
    text = (
        "If you fail a saving throw, you can reroll it with a bonus equal to your Fighter level. "
        "You must use the new roll and regain this use after a Long Rest. "
        "Twice starting at level 13 and three times starting at level 17."
    )

    def feature(name: str, level: int = 2) -> dict[str, Any]:
        return {
            "id": f"srd521.class-feature.fighter.{name.lower().replace(' ', '-')}",
            "name": name,
            "level": level,
            "source": [{"sourceId": "test-source", "page": 48, "blocks": ["feature"]}],
            "bodyNodes": [{"kind": "ParagraphNode", "normalizedText": text}],
        }

    features = tuple(
        feature(name, 9 if name == "Indomitable" else 2)
        for name in [
            "Action Surge",
            "Tactical Mind",
            "Extra Attack",
            "Tactical Shift",
            "Indomitable",
        ]
    )
    heroic = feature("Heroic Warrior", 10)
    heroic["source"][0]["page"] = 49
    heroic["bodyNodes"][0]["normalizedText"] = (
        "During combat, you can give yourself Heroic Inspiration whenever you "
        "start your turn without it."
    )
    champion = (
        *tuple(feature(name, 3) for name in ["Improved Critical", "Remarkable Athlete"]),
        heroic,
    )
    records = _fighter_authoring_ir(features, champion)
    heroic_ir = records["champion.heroic-warrior.json"]
    assert heroic_ir["level"] == 10
    assert heroic_ir["source"][0]["page"] == 49
    assert heroic_ir["parentId"] == "srd521.subclass.fighter.champion"
    assert heroic_ir["proposedRules"][0]["parameters"]["grantsHeroicInspiration"] == {
        "trigger": "start-of-turn-in-combat",
        "requiresMissing": True,
    }
    assert "resourceId" not in heroic_ir["proposedRules"][0]["parameters"]
    ir = records["fighter.indomitable.json"]
    assert ir["level"] == 9
    assert ir["source"][0]["page"] == 48
    assert ir["review"]["semantics"] == "needs-review"
    resource, action = ir["proposedRules"]
    assert resource["parameters"]["recharge"] == [{"event": "long-rest", "amount": "all"}]
    assert resource["expression"]["then"]["value"] == 3
    assert resource["expression"]["else"]["then"]["value"] == 2
    assert resource["expression"]["else"]["else"]["value"] == 1
    assert action["parameters"]["spends"] == 1
    assert action["parameters"]["actionEconomy"] == "no-action"
    assert action["parameters"]["failedSaveReroll"] == {"bonusFact": "classLevel.fighter"}
    for phrase in [
        "fail a saving throw",
        "bonus equal to your Fighter level",
        "must use the new roll",
        "Long Rest",
        "level 13",
        "level 17",
    ]:
        features[-1]["bodyNodes"][0]["normalizedText"] = text.replace(phrase, "missing")
        with pytest.raises(ValueError, match="Indomitable source is missing"):
            _fighter_authoring_ir(features, champion)


def test_grappler_metadata_and_source_boundaries() -> None:
    text = (
        "General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+) "
        "Increase your Strength or Dexterity score by 1, to a maximum of 20. "
        "Punch and Grab. When you hit a creature with an Unarmed Strike as part of the Attack "
        "action on your turn, you can use both the Damage and the Grapple option, "
        "only once per turn. Attack Advantage. You have Advantage on attack rolls against "
        "a creature Grappled by you. Fast Wrestler. You don’t have to spend extra movement "
        "to move a creature Grappled by you if the creature is your size or smaller."
    )
    nodes: list[dict[str, Any]] = [
        {
            "kind": "HeadingNode",
            "normalizedText": "Grappler",
            "parentId": "page-0087",
            "sourceBlocks": ["grappler"],
        },
        {
            "kind": "ParagraphNode",
            "normalizedText": text,
            "parentId": "page-0087",
            "sourceBlocks": ["benefits"],
        },
        {
            "kind": "HeadingNode",
            "normalizedText": "Other feat",
            "parentId": "page-0087",
            "sourceBlocks": ["other"],
        },
        {
            "kind": "ParagraphNode",
            "normalizedText": "Unrelated content",
            "parentId": "page-0087",
            "sourceBlocks": ["unrelated"],
        },
    ]
    feat = _grappler_entity({"nodes": nodes})
    assert feat["id"] == "srd521.feat.general.grappler"
    assert feat["source"][0]["page"] == 87
    assert feat["source"][0]["blocks"] == ["grappler", "benefits"]
    assert feat["body"]["abilityScoreIncreaseAbilities"] == ["strength", "dexterity"]
    assert feat["body"]["abilityScoreIncreasePatterns"] == [[1]]
    assert feat["body"]["maximumAbilityScore"] == 20
    assert feat["body"]["prerequisite"]["minimumCharacterLevel"] == 4
    assert feat["body"]["repeatable"] is False
    assert len(feat["body"]["combatGuidance"]) == 3
    assert feat["body"]["grappleBenefits"]["damageAndGrapple"]["onceOnYourTurn"] is True
    assert feat["body"]["grappleBenefits"]["targetAdvantage"]["target"] == "grappled-by-you"
    assert "Unrelated content" not in str(feat)
    for phrase in [
        "Level 4+",
        "Strength or Dexterity 13+",
        "Increase your Strength or Dexterity score by 1",
        "to a maximum of 20",
        "Grappled by you",
        "only once per turn",
        "your size or smaller",
        "both the Damage and the Grapple option",
        "You have Advantage on attack rolls against a creature Grappled by you",
        "You don’t have to spend extra movement to move a creature Grappled by you",
    ]:
        broken = {"nodes": [dict(node) for node in nodes]}
        broken["nodes"][1]["normalizedText"] = text.replace(phrase, "missing")
        with pytest.raises(ValueError, match="Grappler source is missing"):
            _grappler_entity(broken)


def _word(text: str, x: float, y: float) -> dict[str, Any]:
    return {
        "text": text,
        "bbox": [x, y, x + min(100, max(8, len(text) * 4)), y + 10],
    }


def test_parse_core_fighter_traits() -> None:
    traits = parse_core_traits(
        "Core Fighter Traits Primary Ability Strength or Dexterity "
        "Hit Point Die D10 per Fighter level "
        "Saving Throw Proficiencies Strength and Constitution "
        "Skill Proficiencies Choose 2: Acrobatics, Animal Handling, Athletics, History, "
        "Insight, Intimidation, Persuasion, Perception, or Survival "
        "Weapon Proficiencies Simple and Martial weapons "
        "Armor Training Light, Medium, and Heavy armor and Shields "
        "Starting Equipment Choose A, B, or C"
    )

    assert traits["primaryAbilities"] == ["strength", "dexterity"]
    assert traits["hitPointDie"] == 10
    assert traits["savingThrowProficiencies"] == ["strength", "constitution"]
    assert traits["skillProficiencyChoice"]["maximum"] == 2
    assert traits["armorTraining"] == ["light", "medium", "heavy", "shield"]


def test_extract_all_four_fighting_styles_with_source_spans() -> None:
    nodes = []
    for name in ("Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"):
        nodes.extend(
            [
                {
                    "kind": "HeadingNode",
                    "normalizedText": name,
                    "parentId": "page-0088",
                    "sourceBlocks": [name],
                },
                {
                    "kind": "ParagraphNode",
                    "normalizedText": "Fighting Style Feat (Prerequisite: Fighting Style Feature)",
                    "parentId": "page-0088",
                    "sourceBlocks": [f"{name}-prerequisite"],
                },
                {
                    "kind": "ParagraphNode",
                    "normalizedText": (
                        "You gain a +2 bonus to attack rolls you make with Ranged weapons."
                    )
                    if name == "Archery"
                    else f"{name} effect.",
                    "parentId": "page-0088",
                    "sourceBlocks": [f"{name}-effect"],
                },
            ]
        )
    nodes.append(
        {
            "kind": "HeadingNode",
            "normalizedText": "Epic Boon Feats",
            "parentId": "page-0088",
            "sourceBlocks": ["boons"],
        }
    )
    styles = extract_fighting_styles({"nodes": nodes})
    assert len(styles) == 4
    assert styles[0]["body"]["weaponAttackModifiers"] == [{"attackType": "ranged", "bonus": 2}]
    assert all(style["source"][0]["page"] == 88 for style in styles)
    assert styles[-1]["body"]["text"]["nodes"][-1]["text"] == "Two-Weapon Fighting effect."
    with pytest.raises(ValueError, match="incomplete"):
        extract_fighting_styles({"nodes": nodes[3:]})


def test_fighter_starting_equipment_preserves_all_three_source_packages() -> None:
    entity = _class_entity({}, (), {"entries": []}, [])
    equipment = entity["body"]["startingEquipment"]

    assert equipment["minimum"] == equipment["maximum"] == 1
    assert [option["label"] for option in equipment["options"]] == [
        "Package A",
        "Package B",
        "Package C",
    ]
    assert equipment["options"][0]["items"][-1] == {
        "kind": "entity",
        "entityId": "srd521.equipment.gear.dungeoneers-pack",
        "quantity": 1,
        "equipped": False,
    }
    assert equipment["options"][2]["currencyGp"] == 155


def test_fighter_builder_level_ten_boundary() -> None:
    entity = _class_entity({}, (), {"entries": []}, [])
    assert entity["body"]["builder"]["supportedLevelMaximum"] == 10
    assert entity["body"]["skillProficiencyChoice"]["countByLevel"]["10"] == 2


def test_parse_fighter_progression_enforces_twenty_levels() -> None:
    words: list[dict[str, Any]] = []
    for level in range(1, 21):
        y = 420.0 + level * 12
        bonus = 2 + (level - 1) // 4
        words.extend(
            [
                _word(str(level), 80, y),
                _word(f"+{bonus}", 130, y),
                _word("Feature", 170, y),
                _word("2", 450, y),
                _word("3", 510, y),
            ]
        )
    raw_page = {"words": words}
    region = {"bbox": [63.0, 376.0, 541.0, 725.0]}

    progression = parse_progression(raw_page, region)

    assert len(progression) == 20
    assert progression[0].second_wind == 2
    assert progression[0].weapon_mastery == 3
    assert progression[4].proficiency_bonus == 3
    assert progression[-1].level == 20


def test_extract_champion_features_reconciles_all_headings() -> None:
    nodes: list[dict[str, Any]] = [
        {
            "kind": "HeadingNode",
            "normalizedText": "Fighter Subclass: Champion",
            "parentId": "page-0049",
            "sourceBlocks": ["champion"],
        },
        {
            "kind": "ParagraphNode",
            "normalizedText": "Champion introduction.",
            "parentId": "page-0049",
            "sourceBlocks": ["intro"],
        },
    ]
    for level, name in (
        (3, "Improved Critical"),
        (3, "Remarkable Athlete"),
        (7, "Additional Fighting Style"),
        (10, "Heroic Warrior"),
        (15, "Superior Critical"),
        (18, "Survivor"),
    ):
        nodes.extend(
            [
                {
                    "kind": "HeadingNode",
                    "normalizedText": f"Level {level}: {name}",
                    "parentId": "page-0049",
                    "sourceBlocks": [f"heading-{level}-{name}"],
                },
                {
                    "kind": "ParagraphNode",
                    "normalizedText": f"{name} text.",
                    "parentId": "page-0049",
                    "sourceBlocks": [f"body-{level}-{name}"],
                },
            ]
        )
    nodes.append(
        {
            "kind": "HeadingNode",
            "normalizedText": "Monk",
            "parentId": "page-0049",
            "sourceBlocks": ["monk"],
        }
    )

    features = extract_champion_features({"nodes": nodes})

    assert len(features) == 6
    assert features[0]["id"] == "srd521.subclass-feature.fighter.champion.improved-critical"
    assert features[1]["level"] == 3
    assert features[-1]["name"] == "Survivor"

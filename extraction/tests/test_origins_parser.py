import pytest

from srd_extract.origins import parse_human, parse_origin_feat, parse_soldier


def test_parse_soldier_background() -> None:
    body = parse_soldier(
        "Soldier Ability Scores: Strength, Dexterity, Constitution "
        "Feat: Savage Attacker (see “Feats”) "
        "Skill Proficiencies: Athletics and Intimidation "
        "Tool Proficiency: Choose one kind of Gaming Set (see “Equipment”) "
        "Equipment: Choose A or B: (A) Spear or (B) 50 GP"
    )

    assert body["abilityScoreOptions"] == ["strength", "dexterity", "constitution"]
    assert body["abilityScoreIncreasePatterns"] == [[2, 1], [1, 1, 1]]
    assert body["featId"] == "srd521.feat.origin.savage-attacker"
    assert body["skillProficiencies"] == [
        "srd521.skill.athletics",
        "srd521.skill.intimidation",
    ]


def test_parse_human_species() -> None:
    body = parse_human(
        "Human Creature Type: Humanoid "
        "Size: Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), "
        "chosen when you select this species Speed: 30 feet "
        "As a Human, you have these special traits. "
        "Resourceful. You gain Heroic Inspiration whenever you finish a Long Rest. "
        "Skillful. You gain proficiency in one skill of your choice. "
        "Versatile. You gain an Origin feat of your choice (see “Feats”). Skilled is recommended."
    )

    assert body["creatureType"] == "humanoid"
    assert body["sizeOptions"] == ["medium", "small"]
    assert body["walkingSpeed"] == 30
    assert body["longRestGrantsHeroicInspiration"] is True
    assert body["recommendedOriginFeatId"] == "srd521.feat.origin.skilled"


def test_parse_origin_feats_rejects_incomplete_benefits() -> None:
    savage = parse_origin_feat(
        "Savage Attacker",
        "Savage Attacker Origin Feat Once per turn when you hit a target with a weapon, "
        "you can roll the weapon’s damage dice twice and use either roll against the target.",
    )
    skilled = parse_origin_feat(
        "Skilled",
        "Skilled Origin Feat You gain proficiency in any combination of three skills or tools "
        "of your choice. Repeatable. You can take this feat more than once.",
    )

    assert savage["weaponDamageRolls"] == 2
    assert skilled["proficiencyChoice"]["maximum"] == 3
    with pytest.raises(ValueError, match="incomplete"):
        parse_origin_feat("Savage Attacker", "Savage Attacker Origin Feat Once per turn.")

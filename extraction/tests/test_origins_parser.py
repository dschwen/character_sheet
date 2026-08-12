import pytest

from srd_extract.origins import (
    parse_background,
    parse_dragonborn,
    parse_dwarf,
    parse_human,
    parse_origin_feat,
    parse_soldier,
)


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


@pytest.mark.parametrize(
    ("name", "abilities", "feat", "skills", "expected_feat_id"),
    [
        (
            "Acolyte",
            "Intelligence, Wisdom, Charisma",
            "Magic Initiate (Cleric)",
            "Insight and Religion",
            "srd521.feat.origin.magic-initiate.cleric",
        ),
        (
            "Criminal",
            "Dexterity, Constitution, Intelligence",
            "Alert",
            "Sleight of Hand and Stealth",
            "srd521.feat.origin.alert",
        ),
        (
            "Sage",
            "Constitution, Intelligence, Wisdom",
            "Magic Initiate (Wizard)",
            "Arcana and History",
            "srd521.feat.origin.magic-initiate.wizard",
        ),
    ],
)
def test_parse_additional_backgrounds(
    name: str,
    abilities: str,
    feat: str,
    skills: str,
    expected_feat_id: str,
) -> None:
    body = parse_background(
        name,
        f"{name} Ability Scores: {abilities} Feat: {feat} (see “Feats”) "
        f"Skill Proficiencies: {skills} Tool Proficiency: Thieves’ Tools "
        "Equipment: Choose A or B: (A) background gear; or (B) 50 GP",
    )

    assert body["featId"] == expected_feat_id
    assert len(body["abilityScoreOptions"]) == 3
    assert len(body["skillProficiencies"]) == 2


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


def test_parse_dwarf_species() -> None:
    body = parse_dwarf(
        "Dwarf Creature Type: Humanoid Size: Medium (about 4–5 feet tall) Speed: 30 feet "
        "As a Dwarf, you have these special traits. "
        "Darkvision. You have Darkvision with a range of 120 feet. "
        "Dwarven Resilience. You have Resistance to Poison damage. You also have Advantage "
        "on saving throws you make to avoid or end the Poisoned condition. "
        "Dwarven Toughness. Your Hit Point maximum increases by 1, and it increases by 1 "
        "again whenever you gain a level. Stonecunning. As a Bonus Action, you gain "
        "Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface. "
        "You can use this Bonus Action a number of times equal to your Proficiency Bonus, "
        "and you regain all expended uses when you finish a Long Rest."
    )

    assert body["sizeOptions"] == ["medium"]
    assert body["darkvisionRange"] == 120
    assert body["damageResistances"] == ["poison"]
    assert body["hitPointMaximumPerCharacterLevel"] == 1
    assert body["resources"][0]["maximum"] == "proficiency-bonus"
    assert body["actions"][0]["sense"] == "tremorsense"


def test_parse_dragonborn_species() -> None:
    body = parse_dragonborn(
        "Dragonborn Creature Type: Humanoid Size: Medium (about 5–7 feet tall) Speed: 30 feet "
        "As a Dragonborn, you have these special traits. Draconic Ancestry. Choose the kind of "
        "dragon. Breath Weapon. The save DC is DC 8 plus your Constitution modifier and "
        "Proficiency Bonus. You can use this Breath Weapon a number of times equal to your "
        "Proficiency Bonus. Damage Resistance. You have Resistance to the chosen damage type. "
        "Darkvision. You have Darkvision with a range of 60 feet. Draconic Flight. When you reach "
        "character level 5, you gain temporary flight."
    )

    choice = body["choices"][0]
    assert len(choice["options"]) == 10
    assert {option["damageType"] for option in choice["options"]} == {
        "acid",
        "cold",
        "fire",
        "lightning",
        "poison",
    }
    assert body["actions"][0]["damage"]["diceCountByLevel"]["5"] == 2
    assert body["actions"][1]["minimumLevel"] == 5


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


def test_parse_alert_and_magic_initiate() -> None:
    alert = parse_origin_feat(
        "Alert",
        "Alert Origin Feat Initiative Proficiency. You can add your Proficiency Bonus. "
        "Initiative Swap. You can swap your Initiative with an ally.",
    )
    magic_initiate = parse_origin_feat(
        "Magic Initiate",
        "Magic Initiate Origin Feat Two Cantrips. Choose two. Level 1 Spell. Choose one. "
        "Spell Change. Replace one spell. Repeatable. Choose a different spell list.",
        spell_list="druid",
    )

    assert alert["initiativeProficiency"] is True
    assert magic_initiate["spellListClassId"] == "srd521.class.druid"
    assert magic_initiate["cantripChoice"] == {"minimum": 2, "maximum": 2}

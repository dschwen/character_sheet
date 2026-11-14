import pytest

from srd_extract.origins import (
    parse_background,
    parse_dragonborn,
    parse_dwarf,
    parse_elf,
    parse_gnome,
    parse_goliath,
    parse_halfling,
    parse_human,
    parse_orc,
    parse_origin_feat,
    parse_soldier,
    parse_tiefling,
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
    assert body["toolProficiencies"] == []
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
    assert body["toolProficiencies"] == ["Thieves’ Tools"]
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


def test_parse_elf_species() -> None:
    body = parse_elf(
        "Elf Creature Type: Humanoid Size: Medium (about 5–6 feet tall) Speed: 30 feet "
        "As an Elf, you have these special traits. Darkvision. You have Darkvision with a range "
        "of 60 feet. Elven Lineage. Choose from the Elven Lineages table. Drow know Dancing "
        "Lights, Faerie Fire, and Darkness. High Elves know Prestidigitation, Detect Magic, and "
        "Misty Step. Wood Elves know Druidcraft, Longstrider, and Pass without Trace. "
        "Intelligence, Wisdom, or Charisma is your spellcasting ability. Fey Ancestry gives "
        "Advantage on saves to avoid or end the Charmed condition. Keen Senses grants the "
        "Insight, Perception, or Survival skill. Trance lets you finish a Long Rest in 4 hours."
    )

    lineage = body["choices"][0]
    assert [option["name"] for option in lineage["options"]] == ["Drow", "High Elf", "Wood Elf"]
    assert lineage["options"][0]["darkvisionRange"] == 120
    assert lineage["options"][2]["walkingSpeed"] == 35
    assert lineage["options"][1]["spellGrants"][1]["minimumLevel"] == 5
    assert body["spellChoices"][0]["defaultSpellId"] == "srd521.spell.prestidigitation"
    assert body["skillProficiencyChoice"]["options"] == [
        "srd521.skill.insight",
        "srd521.skill.perception",
        "srd521.skill.survival",
    ]


def test_parse_gnome_species() -> None:
    body = parse_gnome(
        "Gnome Creature Type: Humanoid Size: Small (about 3–4 feet tall) Speed: 30 feet "
        "Darkvision. You have Darkvision with a range of 60 feet. Gnomish Cunning. You have "
        "Advantage on Intelligence, Wisdom, and Charisma saving throws. Gnomish Lineage. "
        "Whichever lineage you choose, Intelligence, Wisdom, or Charisma is your spellcasting "
        "ability. Forest Gnome. You know Minor Illusion and always prepare Speak with Animals. "
        "You can cast it a number of times equal to your Proficiency Bonus. Rock Gnome. You know "
        "the Mending and Prestidigitation cantrips and can create a Tiny clockwork device. You "
        "can have three such devices in existence."
    )

    lineage = body["choices"][0]
    assert [option["name"] for option in lineage["options"]] == ["Forest Gnome", "Rock Gnome"]
    forest_spells = lineage["options"][0]["spellGrants"]
    assert forest_spells[1]["freeCastMaximum"] == "proficiency-bonus"
    assert lineage["options"][1]["spellGrants"] == [
        {"spellId": "srd521.spell.mending", "minimumLevel": 1},
        {"spellId": "srd521.spell.prestidigitation", "minimumLevel": 1},
    ]
    assert body["savingThrowAdvantages"] == ["intelligence", "wisdom", "charisma"]
    assert body["actions"][0]["requiredWhen"]["optionId"].endswith(".rock")


def test_parse_goliath_species() -> None:
    body = parse_goliath(
        "Goliath Creature Type: Humanoid Size: Medium (about 7–8 feet tall) Speed: 35 feet "
        "Giant Ancestry. Choose Cloud’s Jaunt, Fire’s Burn, Frost’s Chill, Hill’s Tumble, "
        "Stone’s Endurance, or Storm’s Thunder. You can use the benefit a number of times "
        "equal to your Proficiency Bonus. Starting at character level 5, Large Form grants "
        "Advantage on Strength checks. Powerful Build lets you count as one size larger when "
        "determining your carrying capacity."
    )

    ancestry = body["choices"][0]
    assert [option["name"] for option in ancestry["options"]] == [
        "Cloud Giant",
        "Fire Giant",
        "Frost Giant",
        "Hill Giant",
        "Stone Giant",
        "Storm Giant",
    ]
    assert body["walkingSpeed"] == 35
    assert body["carryingCapacitySizeCategoryBonus"] == 1
    assert body["resources"][0]["maximum"] == "proficiency-bonus"
    assert body["actions"][1]["damage"] == {"diceCount": 1, "diceSize": 10, "type": "fire"}
    assert body["actions"][4]["roll"]["bonusAbility"] == "constitution"
    assert body["actions"][-1]["minimumLevel"] == 5


def test_parse_halfling_species() -> None:
    body = parse_halfling(
        "Halfling Creature Type: Humanoid Size: Small (about 2–3 feet tall) Speed: 30 feet "
        "Brave. You have Advantage on saving throws you make to avoid or end the Frightened "
        "condition. Halfling Nimbleness. You can move through the space of any creature that is "
        "a size larger than you. Luck. When you roll a 1 on the d20 of a D20 Test, you can reroll "
        "the die, and you must use the new roll. Naturally Stealthy. You can take the Hide action "
        "even when you are obscured only by a creature that is at least one size larger than you."
    )

    assert body["sizeOptions"] == ["small"]
    assert body["walkingSpeed"] == 30
    assert body["d20RerollValues"] == [1]
    assert body["d20RerollSource"] == "Luck"
    assert body["conditionalRollEffects"][0]["situationalTag"] == "avoid-or-end-frightened"
    assert body["factGrants"] == {
        "species.movement.canEnterLargerCreatureSpace": True,
        "species.hide.obscuredByLargerCreature": True,
    }


def test_parse_orc_species() -> None:
    body = parse_orc(
        "Orc Creature Type: Humanoid Size: Medium (about 6–7 feet tall) Speed: 30 feet "
        "Adrenaline Rush. You can take the Dash action as a Bonus Action and gain Temporary Hit "
        "Points equal to your Proficiency Bonus. You can use this trait a number of times equal "
        "to your Proficiency Bonus, and regain uses when you finish a Short or Long Rest. "
        "Darkvision. You have Darkvision with a range of 120 feet. Relentless Endurance. When "
        "you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point "
        "instead."
    )

    assert body["sizeOptions"] == ["medium"]
    assert body["darkvisionRange"] == 120
    assert body["resources"][0]["maximum"] == "proficiency-bonus"
    assert [rule["event"] for rule in body["resources"][0]["recharge"]] == [
        "short-rest",
        "long-rest",
    ]
    assert body["actions"][0]["temporaryHitPointsFact"] == "proficiencyBonus"
    assert body["actions"][1]["requiredCurrentHitPoints"] == 0
    assert body["actions"][1]["minimumCurrentHitPoints"] == 1


def test_parse_tiefling_species() -> None:
    body = parse_tiefling(
        "Tiefling Creature Type: Humanoid Size: Medium (about 4–7 feet tall) or Small (about "
        "3–4 feet tall), chosen when you select this species Speed: 30 feet Darkvision. You have "
        "Darkvision with a range of 60 feet. Fiendish Legacy. Choose a legacy from the Fiendish "
        "Legacies table. At character levels 3 and 5, you learn a spell. You always have that "
        "spell prepared and can cast it once without a spell slot. Intelligence, Wisdom, or "
        "Charisma is your spellcasting ability. Otherworldly Presence grants the Thaumaturgy "
        "cantrip. Abyssal grants Poison Spray, Ray of Sickness, and Hold Person. Chthonic grants "
        "Chill Touch, False Life, and Ray of Enfeeblement. Infernal grants Fire Bolt, Hellish "
        "Rebuke, and Darkness."
    )

    assert body["sizeOptions"] == ["medium", "small"]
    assert body["darkvisionRange"] == 60
    legacy = body["choices"][0]
    assert [option["name"] for option in legacy["options"]] == [
        "Abyssal",
        "Chthonic",
        "Infernal",
    ]
    assert [option["damageType"] for option in legacy["options"]] == [
        "poison",
        "necrotic",
        "fire",
    ]
    assert [grant["minimumLevel"] for grant in legacy["options"][0]["spellGrants"]] == [
        1,
        3,
        5,
        1,
    ]
    assert legacy["options"][1]["spellGrants"][2]["spellId"].endswith("ray-of-enfeeblement")
    assert legacy["options"][2]["spellGrants"][1]["freeCastResourceId"].endswith(
        "hellish-rebuke.free-cast"
    )
    assert body["spellcastingAbilityChoiceId"].endswith("spellcasting-ability")


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
    assert savage["trigger"] == "once-per-turn-weapon-hit"
    assert savage["chooseDamageRoll"] == "either"
    assert skilled["proficiencyChoice"]["maximum"] == 3
    with pytest.raises(ValueError, match="incomplete"):
        parse_origin_feat("Savage Attacker", "Savage Attacker Origin Feat Once per turn.")
    with pytest.raises(ValueError, match="incomplete"):
        parse_origin_feat(
            "Savage Attacker",
            "Savage Attacker Origin Feat roll the weapon’s damage dice twice and use either roll",
        )


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

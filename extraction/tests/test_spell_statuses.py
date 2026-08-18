from srd_extract.spell_statuses import SPELL_STATUS_NAMES, annotate_spell_statuses


def _spell(spell_id: str, name: str) -> dict[str, object]:
    return {
        "id": spell_id,
        "kind": "spell",
        "name": {"en": name},
        "tags": ["spell"],
        "source": [{"sourceId": "srd", "page": 1, "blockIds": ["p0001-b001"]}],
        "body": {
            "description": f"{name} description.",
            "duration": "1 minute",
            "concentration": True,
        },
        "rules": [],
        "review": {},
    }


def test_annotate_spell_statuses_links_spells_and_status_entities() -> None:
    spells = [_spell(spell_id, status_name) for spell_id, status_name in SPELL_STATUS_NAMES.items()]

    entities, statuses = annotate_spell_statuses(spells)

    assert len(statuses) == len(SPELL_STATUS_NAMES)
    blessed = next(entity for entity in statuses if entity["name"]["en"] == "Blessed")
    bless = next(entity for entity in entities if entity["id"] == "srd521.spell.bless")
    assert blessed["id"] == "srd521.status.spell.bless"
    assert blessed["body"]["sourceSpellId"] == "srd521.spell.bless"
    assert blessed["body"]["d20BonusDice"] == [
        {"scope": "attack-rolls", "diceCount": 1, "diceSize": 4},
        {"scope": "saving-throw", "diceCount": 1, "diceSize": 4},
    ]
    assert bless["body"]["appliedStatuses"] == [
        {
            "statusId": "srd521.status.spell.bless",
            "statusName": "Blessed",
            "target": "target",
        }
    ]
    hasted = next(entity for entity in statuses if entity["name"]["en"] == "Hasted")
    assert hasted["body"]["speedMultiplier"] == 2
    assert hasted["body"]["armorClassBonus"] == 2
    mage_armor = next(entity for entity in statuses if entity["name"]["en"] == "Mage Armor")
    assert mage_armor["body"]["armorClassCandidate"] == {
        "base": 13,
        "ability": "dexterity",
        "requiresUnarmored": True,
    }
    aided = next(entity for entity in statuses if entity["name"]["en"] == "Aided")
    assert aided["body"]["hitPointBonus"]["base"] == 5
    hidden = next(entity for entity in statuses if entity["name"]["en"] == "Pass without Trace")
    assert hidden["body"]["d20Modifiers"] == [{"target": "skill.stealth", "bonus": 10}]


def test_annotate_spell_statuses_is_idempotent() -> None:
    spells = [_spell(spell_id, status_name) for spell_id, status_name in SPELL_STATUS_NAMES.items()]
    once, _ = annotate_spell_statuses(spells)
    twice, statuses = annotate_spell_statuses(once)

    assert len(twice) == len(spells) + len(statuses)

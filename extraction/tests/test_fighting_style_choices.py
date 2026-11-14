"""Shared authoring must discover pools from metadata, not class-name branches."""

from copy import deepcopy

import pytest

from srd_extract.fighting_style_choices import add_cantrip_alternative


def fixtures():
    class_entity = {
        "id": "test.class.paladin",
        "body": {
            "fightingStyleChoice": {"id": "test.choice.style", "options": ["test.feat.defense"]}
        },
    }
    feature = {
        "id": "test.feature.style",
        "name": "Fighting Style",
        "level": 2,
        "source": {"page": 54},
        "bodyNodes": [
            {
                "normalizedText": (
                    "Blessed Warrior: two Cleric cantrips count as Paladin spells; can replace one."
                )
            }
        ],
    }
    existing = [
        {
            "id": "test.class.cleric",
            "body": {"spellList": ["test.spell.a", "test.spell.b", "test.spell.level-one"]},
            "kind": "class",
        }
    ]
    existing.extend(
        {"id": f"test.spell.{slug}", "kind": "spell", "body": {"level": level}}
        for slug, level in [("a", 0), ("b", 0), ("foreign", 0), ("level-one", 1)]
    )
    existing.extend(
        {
            "id": f"test.feat.{slug}",
            "kind": "feat",
            "body": {"category": "fighting-style", "requiresAnyFeatureIds": [feature_id]},
        }
        for slug, feature_id in [
            ("defense", feature["id"]),
            ("custom", feature["id"]),
            ("foreign", "other.feature.style"),
        ]
    )
    return class_entity, (feature,), existing


def generate(class_entity, features, existing, defaults=None):
    return add_cantrip_alternative(
        class_entity,
        features,
        existing,
        name="Blessed Warrior",
        source_class_id="test.class.cleric",
        default_cantrips=defaults or ["test.spell.a", "test.spell.b"],
    )


def test_discovers_eligible_styles_and_cantrips_and_preserves_default():
    class_entity, features, existing = fixtures()
    original = deepcopy(existing)
    option = generate(class_entity, features, existing)
    parent = class_entity["body"]["fightingStyleChoice"]
    child = class_entity["body"]["fightingStyleCantripChoice"]
    assert parent["options"] == ["test.feat.custom", "test.feat.defense", option["id"]]
    assert parent["defaultOptionIds"] == ["test.feat.defense"]
    assert child["options"] == ["test.spell.a", "test.spell.b"]
    assert child["requiredOption"] == {"choiceId": parent["id"], "optionId": option["id"]}
    assert child["replacementMaximum"] == 1
    assert child["spellSelection"]["castingClassId"] == class_entity["id"]
    assert option["source"] == features[0]["source"]
    assert option["review"]["semanticsApproved"] is False
    assert existing == original


@pytest.mark.parametrize(
    "defaults",
    [
        ["test.spell.a", "test.spell.a"],
        ["test.spell.a", "test.spell.foreign"],
        ["test.spell.a", "test.spell.level-one"],
    ],
)
def test_rejects_invalid_defaults(defaults):
    with pytest.raises(ValueError, match="two loaded default cantrips"):
        generate(*fixtures(), defaults)


def test_rejects_missing_source_semantics():
    class_entity, features, existing = fixtures()
    features[0]["bodyNodes"] = [{"normalizedText": "Fighting Style"}]
    with pytest.raises(ValueError, match="missing Blessed Warrior"):
        generate(class_entity, features, existing)

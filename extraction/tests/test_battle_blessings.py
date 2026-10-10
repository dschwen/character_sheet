from typing import Any

import pytest

from srd_extract.battle_blessings import battle_blessing_choice


@pytest.mark.parametrize(
    ("class_slug", "slug", "strike", "types", "beast"),
    [
        ("cleric", "blessed-strikes", "Divine Strike", ["necrotic", "radiant"], False),
        (
            "druid",
            "elemental-fury",
            "Primal Strike",
            ["cold", "fire", "lightning", "thunder"],
            True,
        ),
    ],
)
def test_battle_blessing_choices_preserve_source_and_class_scoping(
    class_slug: str, slug: str, strike: str, types: list[str], beast: bool
) -> None:
    feature: dict[str, Any] = {
        "id": f"srd521.class-feature.{class_slug}.{slug}",
        "source": [{"sourceId": "wotc-srd-5.2.1-en", "page": 38 if class_slug == "cleric" else 43}],
    }
    class_id = f"srd521.class.{class_slug}"
    choice, options = battle_blessing_choice(
        feature, class_id, slug, strike, types, beast_attacks=beast
    )
    assert choice["level"] == 7
    assert choice["minimum"] == choice["maximum"] == 1
    assert "changeOn" not in choice
    assert choice["optionSelection"]["sourceFeatureId"] == feature["id"]
    assert choice["options"] == [option["id"] for option in options]
    assert choice["defaultOptionIds"] == [options[0]["id"]]
    assert all(option["source"] == feature["source"] for option in options)
    assert all(not option["review"]["semanticsApproved"] for option in options)
    assert options[0]["body"]["cantripDamageBonuses"] == [
        {"castingClassId": class_id, "ability": "wisdom"}
    ]
    assert options[1]["body"]["attackDamageRiders"] == [
        {
            "diceCount": 1,
            "diceSize": 8,
            "damageTypes": types,
            "attackKinds": ["weapon", *(["wild-shape-beast"] if beast else [])],
            "frequency": "once-on-each-of-your-turns",
        }
    ]

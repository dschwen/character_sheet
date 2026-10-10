"""Shared source-linked cantrip or attack-rider choices for seventh-level casters."""

from typing import Any


def battle_blessing_choice(
    feature: dict[str, Any],
    class_id: str,
    slug: str,
    strike_name: str,
    damage_types: list[str],
    *,
    beast_attacks: bool = False,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    class_slug = class_id.rsplit(".", 1)[-1]
    choice_id = f"srd521.choice.{class_slug}.{slug}"
    potent_id = f"srd521.option.{class_slug}.{slug}.potent-spellcasting"
    strike_id = f"srd521.option.{class_slug}.{slug}.{strike_name.lower().replace(' ', '-')}"
    choice = {
        "id": choice_id,
        "level": 7,
        "minimum": 1,
        "maximum": 1,
        "options": [potent_id, strike_id],
        "defaultOptionIds": [potent_id],
        "optionSelection": {"sourceFeatureId": feature["id"]},
    }
    options = []
    definitions: list[tuple[str, str, dict[str, Any], str]] = [
        (
            potent_id,
            "Potent Spellcasting",
            {"cantripDamageBonuses": [{"castingClassId": class_id, "ability": "wisdom"}]},
            f"Add your Wisdom modifier to damage dealt with any {class_slug.title()} cantrip.",
        ),
        (
            strike_id,
            strike_name,
            {
                "attackDamageRiders": [
                    {
                        "diceCount": 1,
                        "diceSize": 8,
                        "damageTypes": damage_types,
                        "attackKinds": ["weapon", *(["wild-shape-beast"] if beast_attacks else [])],
                        "frequency": "once-on-each-of-your-turns",
                    }
                ]
            },
            "Once on each of your turns, after hitting a creature with a weapon attack"
            + (" or a Beast form's attack in Wild Shape" if beast_attacks else "")
            + f", deal an extra 1d8 {' or '.join(damage_types)} damage (choose when you hit).",
        ),
    ]
    for option_id, name, mechanics, description in definitions:
        options.append(
            {
                "id": option_id,
                "kind": "class-option",
                "name": {"en": name},
                "tags": ["class-option", class_slug, slug],
                "source": feature["source"],
                "body": {"choiceId": choice_id, "description": description, **mechanics},
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": (
                        "Source-linked choice; hit, turn, target, "
                        "and damage application remain manual."
                    ),
                },
            }
        )
    return choice, options

"""Extract source-linked conditional weapon damage modes from pages 89–90."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from srd_extract.fighter import _source_spans_for_nodes
from srd_extract.io import read_json, write_json


def extract_weapon_properties(document: dict[str, Any]) -> list[dict[str, Any]]:
    definitions: dict[str, dict[str, Any]] = {
        "Light": {
            "id": "light-extra-attack",
            "name": "Light extra attack",
            "omitPositiveAbilityModifier": True,
            "requiresDifferentWeapon": True,
            "requiresTwoHands": False,
            "useVersatileDamage": False,
            "instructions": (
                "Declare an extra attack after attacking with a different Light weapon in the "
                "Attack action on this turn. One extra attack per turn, normally a Bonus Action; "
                "Nick timing must be adjudicated separately. Turn and action usage are not "
                "tracked automatically."
            ),
        },
        "Versatile": {
            "id": "two-handed",
            "name": "Two-handed",
            "omitPositiveAbilityModifier": False,
            "requiresDifferentWeapon": False,
            "requiresTwoHands": True,
            "useVersatileDamage": True,
            "instructions": (
                "Declare that this melee attack uses the weapon in two hands. "
                "Resolve other hand usage manually."
            ),
        },
        "Two-Handed": {
            "id": "two-handed",
            "name": "Two-handed",
            "omitPositiveAbilityModifier": False,
            "requiresDifferentWeapon": False,
            "requiresTwoHands": True,
            "useVersatileDamage": False,
            "instructions": (
                "Declare that this attack uses the weapon in two hands. "
                "Resolve other hand usage and mounted exceptions manually."
            ),
        },
    }
    nodes = list(document["nodes"])
    entities: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        name = node["normalizedText"]
        if node["kind"] != "HeadingNode" or name not in definitions:
            continue
        selected = [node]
        for following in nodes[index + 1 :]:
            if following["kind"] == "HeadingNode":
                break
            if following["kind"] != "MetadataNode":
                selected.append(following)
        if len(selected) < 2:
            raise ValueError(f"Missing weapon property text: {name}")
        entities.append(
            {
                "id": f"srd521.weapon-property.{name.casefold()}",
                "kind": "weapon-property",
                "name": {"en": name},
                "tags": ["weapon-property"],
                "source": list(_source_spans_for_nodes(selected)),
                "body": {
                    "property": name.casefold(),
                    "damageMode": definitions[name],
                    "text": " ".join(str(part["normalizedText"]) for part in selected[1:]),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": "Conditional damage-mode semantics require independent review.",
                },
            }
        )
    if len(entities) != len(definitions):
        raise ValueError("Weapon damage property extraction is incomplete")
    return entities


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    entities = extract_weapon_properties(
        read_json(args.extraction / "normalized" / "document.json")
    )
    current = read_json(args.output / "entities.json")
    replacements = {entity["id"]: entity for entity in entities}
    ids = {entity["id"] for entity in current}
    write_json(args.output / "entities" / "weapon-properties.json", entities)
    write_json(
        args.output / "entities.json",
        [replacements.get(entity["id"], entity) for entity in current]
        + [entity for entity in entities if entity["id"] not in ids],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Annotate reviewed immediate healing formulas without inferring arbitrary spell semantics."""

from __future__ import annotations

import argparse
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json

# Reviewed against each spell's pinned source-linked description. Find Steed's
# stat-block Healing Touch is deliberately not a healing effect of casting that spell.
HEALING_SPELLS = {
    "srd521.spell.cure-wounds": (2, 8, True, 2),
    "srd521.spell.healing-word": (2, 4, True, 2),
    "srd521.spell.mass-healing-word": (2, 4, True, 1),
    "srd521.spell.prayer-of-healing": (2, 8, False, 1),
}


def annotate_spell_healing(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = deepcopy(entities)
    for entity in result:
        recipe = HEALING_SPELLS.get(entity["id"])
        if recipe is None:
            continue
        if entity["kind"] != "spell":
            raise ValueError(f"{entity['id']} is not a spell")
        count, size, modifier, scaling = recipe
        body = entity["body"]
        text = body["description"]
        base, separator, higher = text.partition("Using a Higher-Level Spell Slot.")
        if (
            not re.search(
                rf"regains? (?:(?:a number of )?Hit Points equal to )?{count}d{size}\b", base
            )
            or not separator
        ):
            raise ValueError(f"{entity['id']} healing source has changed")
        if ("plus your spellcasting ability modifier" in base) != modifier:
            raise ValueError(f"{entity['id']} healing modifier source has changed")
        if not re.search(
            rf"increases by {scaling}d{size} for each spell slot level above {body['level']}\b",
            higher,
        ):
            raise ValueError(f"{entity['id']} healing scaling source has changed")
        body["healing"] = [
            {
                "diceCount": count,
                "diceSize": size,
                "addSpellcastingModifier": modifier,
                "dicePerSlotLevel": scaling,
            }
        ]
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    paths = [
        options.output / "entities.json",
        *sorted((options.output / "entities").glob("*.json")),
    ]
    for path in paths:
        before = read_json(path)
        after = annotate_spell_healing(before)
        if after != before:
            write_json(path, after)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

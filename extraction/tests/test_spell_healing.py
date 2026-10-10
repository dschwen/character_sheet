from copy import deepcopy
from typing import Any

import pytest

from srd_extract.spell_healing import annotate_spell_healing


def cure() -> dict[str, Any]:
    return {
        "id": "srd521.spell.cure-wounds",
        "kind": "spell",
        "body": {
            "level": 1,
            "description": (
                "A creature you touch regains a number of Hit Points equal to 2d8 "
                "plus your spellcasting ability modifier. Using a Higher-Level Spell Slot. "
                "The healing increases by 2d8 for each spell slot level above 1."
            ),
        },
    }


def test_healing_annotation_is_pure_and_idempotent() -> None:
    entities = [cure()]
    before = deepcopy(entities)
    result = annotate_spell_healing(entities)
    assert entities == before
    assert result == annotate_spell_healing(result)
    assert result[0]["body"]["healing"] == [
        {
            "diceCount": 2,
            "diceSize": 8,
            "addSpellcastingModifier": True,
            "dicePerSlotLevel": 2,
        }
    ]


@pytest.mark.parametrize(
    "original,replacement",
    [
        ("equal to 2d8", "equal to 3d8"),
        ("plus your spellcasting ability modifier", "plus 2"),
        ("increases by 2d8", "increases by 1d8"),
    ],
)
def test_healing_source_drift_requires_review(original: str, replacement: str) -> None:
    entity = cure()
    entity["body"]["description"] = entity["body"]["description"].replace(original, replacement)
    with pytest.raises(ValueError, match="source has changed"):
        annotate_spell_healing([entity])


def test_unreviewed_spells_are_not_inferred_from_their_text() -> None:
    entity = cure()
    entity["id"] = "srd521.spell.find-steed"
    assert annotate_spell_healing([entity]) == [entity]

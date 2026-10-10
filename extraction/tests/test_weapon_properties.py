from typing import Any

import pytest

from srd_extract.weapon_properties import extract_weapon_properties


def document() -> dict[str, Any]:
    nodes = []
    for name, page in (("Light", 89), ("Two-Handed", 90), ("Versatile", 90)):
        nodes.extend(
            [
                {
                    "kind": "HeadingNode",
                    "normalizedText": name,
                    "parentId": f"page-{page:04d}",
                    "sourceBlocks": [f"heading-{name}"],
                },
                {
                    "kind": "ParagraphNode",
                    "normalizedText": f"{name} source text.",
                    "parentId": f"page-{page:04d}",
                    "sourceBlocks": [f"body-{name}"],
                },
            ]
        )
    nodes.append(
        {
            "kind": "HeadingNode",
            "normalizedText": "Mastery Properties",
            "parentId": "page-0090",
            "sourceBlocks": ["masteries"],
        }
    )
    return {"nodes": nodes}


def test_weapon_modes_have_source_spans_and_exclude_following_headings() -> None:
    properties = extract_weapon_properties(document())
    assert len(properties) == 3
    light = properties[0]
    assert light["source"][0]["page"] == 89
    assert light["body"]["damageMode"]["omitPositiveAbilityModifier"] is True
    assert light["body"]["damageMode"]["requiresDifferentWeapon"] is True
    assert properties[-1]["body"]["damageMode"]["useVersatileDamage"] is True
    assert properties[-1]["body"]["text"] == "Versatile source text."
    assert all(property_["source"][0]["quoteHash"] for property_ in properties)


def test_weapon_mode_extraction_rejects_missing_or_empty_property_text() -> None:
    with pytest.raises(ValueError, match="incomplete"):
        extract_weapon_properties({"nodes": []})
    partial = document()
    partial["nodes"].pop(1)
    with pytest.raises(ValueError, match="Missing weapon property text"):
        extract_weapon_properties(partial)

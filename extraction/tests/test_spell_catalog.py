from pathlib import Path
from typing import Any

import pytest

from srd_extract.io import read_json, write_json
from srd_extract.spells import extract_spell_catalog, generate_spell_catalog


def node(kind: str, text: str, block: str, x: int = 63, y: int = 100) -> dict[str, Any]:
    return {
        "kind": kind,
        "normalizedText": text,
        "nodeId": block,
        "sourceBlocks": [block],
        "parentId": "page-0120",
        "bbox": [x, y, x + 200, y + 20],
    }


def document() -> dict[str, Any]:
    return {
        "nodes": [
            node("HeadingNode", "Test Spell", "heading"),
            node("ParagraphNode", "Level 2 Evocation (Cleric, Wizard)", "signature"),
            node(
                "HeadingNode",
                "Casting Time: Action or Ritual Range: 60 feet Components: V, S "
                "Duration: Concentration, up to 1 minute",
                "metadata",
            ),
            node(
                "ParagraphNode",
                "Make a ranged spell attack. A target makes a Dexterity saving throw. "
                "It takes 2d6 damage.",
                "description",
            ),
        ]
    }


def test_extract_catalog_preserves_casting_source_without_inventing_damage() -> None:
    spell = extract_spell_catalog(document())[0]
    assert spell["id"] == "srd521.spell.test-spell"
    assert spell["body"]["classes"] == ["cleric", "wizard"]
    assert spell["body"]["ritual"] is True
    assert spell["body"]["concentration"] is True
    assert spell["body"]["attackType"] == "ranged"
    assert spell["body"]["savingThrows"] == ["dexterity"]
    assert spell["body"]["damage"] == []
    assert spell["body"]["automationLevel"] == "display-only"
    assert spell["source"][0]["blocks"] == ["heading", "signature", "metadata", "description"]
    assert spell["review"]["semanticsApproved"] is False


def test_extract_catalog_recovers_explicit_top_of_column_casting_labels() -> None:
    source = {
        "nodes": [
            node("MetadataNode", "Components: V, S, M (diamond dust worth", "recovered", 313, 39),
            node("HeadingNode", "Nondetection", "heading", 63, 660),
            node(
                "ParagraphNode", "Level 3 Abjuration (Bard, Ranger, Wizard)", "signature", 63, 674
            ),
            node("HeadingNode", "Casting Time: Action Range: Touch", "metadata", 63, 690),
            node(
                "HeadingNode",
                "25+ GP, which the spell consumes) Duration: 8 hours",
                "continuation",
                313,
                51,
            ),
            node(
                "ParagraphNode",
                "The target is hidden from Divination spells.",
                "description",
                313,
                80,
            ),
        ]
    }
    spell = extract_spell_catalog(source)[0]
    assert (
        spell["body"]["components"]["materialText"]
        == "diamond dust worth 25+ GP, which the spell consumes"
    )
    assert "recovered" in spell["source"][0]["blocks"]
    assert source["nodes"][0]["kind"] == "MetadataNode"


def test_catalog_generation_preserves_annotations_and_is_idempotent(tmp_path: Path) -> None:
    write_json(tmp_path / "normalized" / "document.json", document())
    original: dict[str, Any] = {
        "id": "srd521.spell.test-spell",
        "kind": "spell",
        "body": {
            "damage": [{"diceCount": 2}],
            "appliedStatuses": [{"statusId": "test.status"}],
            "duration": "incorrect",
        },
    }
    write_json(tmp_path / "entities.json", [original])
    generate_spell_catalog(tmp_path, tmp_path)
    first = read_json(tmp_path / "entities.json")
    generate_spell_catalog(tmp_path, tmp_path)
    assert read_json(tmp_path / "entities.json") == first
    assert first[0]["body"]["damage"] == original["body"]["damage"]
    assert first[0]["body"]["appliedStatuses"] == original["body"]["appliedStatuses"]
    assert first[0]["body"]["duration"] == "Concentration, up to 1 minute"
    assert len(read_json(tmp_path / "entities" / "spells.json")) == 1


def test_catalog_rejects_duplicate_spell_ids() -> None:
    source = document()
    source["nodes"] *= 2
    with pytest.raises(ValueError, match="duplicate IDs"):
        extract_spell_catalog(source)


def test_spell_description_classified_as_heading_is_not_casting_metadata() -> None:
    source = document()
    source["nodes"][-1]["kind"] = "HeadingNode"
    spell = extract_spell_catalog(source)[0]
    assert spell["body"]["duration"] == "Concentration, up to 1 minute"
    assert spell["body"]["description"].startswith("Make a ranged spell attack.")

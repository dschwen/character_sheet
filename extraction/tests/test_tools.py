from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest

from srd_extract.io import read_json
from srd_extract.tools import parse_tools


def source() -> dict[str, Any]:
    document: dict[str, Any] = read_json(Path(__file__).parent / "fixtures/tools-source-nodes.json")
    return document


def test_all_source_tools_and_individual_variants() -> None:
    entities = parse_tools(source())
    assert entities == read_json(
        Path(__file__).parents[2] / "packages/content-srd-5.2.1/generated/entities/tools.json"
    )
    tools = [entity for entity in entities if entity["kind"] == "tool"]
    assert len(tools) == 37
    assert Counter(tool["body"]["category"] for tool in tools) == {
        "artisan": 17,
        "other": 6,
        "gaming-set": 4,
        "musical-instrument": 10,
    }
    assert (
        next(tool for tool in tools if tool["name"]["en"] == "Dulcimer")["body"]["ability"]
        == "charisma"
    )
    smith = next(tool for tool in tools if tool["id"].endswith(".smiths-tools"))
    assert [span["page"] for span in smith["source"]] == [93, 94]
    assert all(
        span["blocks"] and len(span["quoteHash"]) == 64 for tool in tools for span in tool["source"]
    )
    assert all(tool["review"]["semanticsApproved"] is False for tool in entities)


def test_source_does_not_mutate_and_generation_is_deterministic() -> None:
    document = source()
    before = deepcopy(document)
    assert parse_tools(document) == parse_tools(document)
    assert document == before


@pytest.mark.parametrize(
    "needle", ["Ability: Intelligence", "Variants: Dice", "add your Proficiency Bonus"]
)
def test_rejects_missing_source_semantics(needle: str) -> None:
    document = source()
    node = next(node for node in document["nodes"] if needle in node["normalizedText"])
    node["normalizedText"] = node["normalizedText"].replace(needle, "Missing")
    with pytest.raises(ValueError):
        parse_tools(document)

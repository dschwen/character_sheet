"""Extract tool proficiencies and individual variants from pinned SRD pages 93–94."""

from __future__ import annotations

import argparse
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from srd_extract.equipment import _slug, _source
from srd_extract.io import read_json, write_json

HEADER = re.compile(r"(?P<name>[A-Z][A-Za-z’ -]+?) \((?:\d+ GP|Varies)\)$")


def parse_tools(document: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = document["nodes"]
    start = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Artisan’s Tools")
    end = next(i for i, node in enumerate(nodes) if node["normalizedText"] == "Adventuring Gear")
    entries: list[dict[str, Any]] = []
    category = "artisan"
    groups: list[tuple[str, str, list[dict[str, Any]]]] = []
    for node in nodes[start + 1 : end]:
        text = node["normalizedText"]
        heading = HEADER.fullmatch(text)
        if text == "Other Tools":
            category = "other"
        elif heading is not None:
            groups.append((heading["name"], category, [node]))
        elif groups and not text.startswith("System Reference Document"):
            groups[-1][2].append(node)
    for name, category, group in groups:
        text = " ".join(node["normalizedText"] for node in group)
        text = re.sub(r"(?<=[a-z])- (?=[a-z])", "", text)
        ability = re.search(
            r"Ability: (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)", text
        )
        if ability is None:
            raise ValueError(f"{name} has no source ability")
        sources = []
        for page in sorted({int(node["parentId"][-4:]) for node in group}):
            page_nodes = [node for node in group if int(node["parentId"][-4:]) == page]
            sources.extend(
                _source(
                    list(
                        dict.fromkeys(
                            block for node in page_nodes for block in node["sourceBlocks"]
                        )
                    ),
                    page,
                    " ".join(node["normalizedText"] for node in page_nodes),
                )
            )
        variants = re.search(r"Variants: (.+)$", text)
        names = [name]
        if variants:
            names = re.findall(r"(?:^|, )([A-Za-z][A-Za-z -]+?) \([^)]*\)", variants[1])
            category = "gaming-set" if name == "Gaming Set" else "musical-instrument"
            expected = 4 if category == "gaming-set" else 10
            if len(names) != expected:
                raise ValueError(f"{name} requires {expected} distinct source variants")
        for tool_name in names:
            tool_name = tool_name[0].upper() + tool_name[1:]
            entries.append(
                {
                    "id": f"srd521.tool.{_slug(tool_name)}",
                    "kind": "tool",
                    "name": {"en": tool_name},
                    "tags": ["tool", category],
                    "source": sources,
                    "rules": [],
                    "body": {
                        "category": category,
                        "proficiencyRuleId": "srd521.rule.tool-proficiency",
                        "ability": ability[1].casefold(),
                        "description": text,
                        "checkId": re.sub(r"[^a-z0-9]+", "-", tool_name.casefold()).strip("-"),
                    },
                    "review": {
                        "status": "STRUCTURED",
                        "extractionApproved": True,
                        "semanticsApproved": False,
                        "testsApproved": False,
                    },
                }
            )
    if len(entries) != 37 or len({entry["id"] for entry in entries}) != len(entries):
        raise ValueError("Expected 37 distinct tools, including individual variants")
    rule_start = next(
        i for i, node in enumerate(nodes) if node["normalizedText"] == "Tool Proficiency"
    )
    rule_nodes = nodes[rule_start : rule_start + 2]
    rule_text = " ".join(node["normalizedText"] for node in rule_nodes)
    if "add your Proficiency Bonus" not in rule_text or "Advantage" not in rule_text:
        raise ValueError("Tool proficiency rule is missing its source benefits")
    entries.append(
        {
            "id": "srd521.rule.tool-proficiency",
            "kind": "rule",
            "name": {"en": "Tool Proficiency"},
            "tags": ["tool-proficiency"],
            "rules": [],
            "body": {"text": rule_text},
            "source": _source(
                list(dict.fromkeys(block for node in rule_nodes for block in node["sourceBlocks"])),
                93,
                rule_text,
            ),
            "review": {
                "status": "STRUCTURED",
                "extractionApproved": True,
                "semanticsApproved": False,
                "testsApproved": False,
            },
        }
    )
    return entries


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args(arguments)
    entities = parse_tools(read_json(options.extraction / "normalized" / "document.json"))
    existing = read_json(options.output / "entities.json")
    ids = {entity["id"] for entity in entities}
    write_json(options.output / "entities" / "tools.json", entities)
    write_json(
        options.output / "entities.json",
        [entity for entity in existing if entity["id"] not in ids] + entities,
    )
    print("Generated 37 source-linked tool proficiencies and their proficiency rule")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

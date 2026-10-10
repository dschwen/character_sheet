"""Extract the complete source-linked spell catalog without inventing roll automation."""

from __future__ import annotations

import argparse
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.wizard import (
    ABILITIES,
    _parse_casting_metadata,
    _slug,
    _source_spans,
    _spell_signature,
)


def extract_spell_catalog(document: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    # Some top-of-column casting labels were classified as running headers.
    # Recover only explicit spell labels, retaining their original source blocks.
    recovered = [
        node
        for node in nodes
        if node["kind"] == "MetadataNode"
        and re.match(r"^(Casting Time|Range|Components?|Duration):", node["normalizedText"])
    ]
    for node in recovered:
        nodes.remove(node)
        right_column = node["bbox"][0] >= 306
        insertion = next(
            (
                index
                for index, candidate in enumerate(nodes)
                if candidate["parentId"] == node["parentId"]
                and candidate["kind"] != "MetadataNode"
                and (candidate["bbox"][0] >= 306) == right_column
                and candidate["bbox"][1] >= node["bbox"][1]
            ),
            None,
        )
        if insertion is None:
            raise ValueError(f"Cannot recover casting metadata {node['nodeId']}")
        nodes.insert(insertion, {**node, "kind": "HeadingNode"})
    starts = []
    for index, node in enumerate(nodes[:-1]):
        if node["kind"] == "HeadingNode" and nodes[index + 1]["kind"] == "ParagraphNode":
            signature = _spell_signature(nodes[index + 1]["normalizedText"])
            if signature is not None:
                starts.append((index, node["normalizedText"], signature))
    entities: list[dict[str, Any]] = []
    for position, (start, name, signature) in enumerate(starts):
        end = starts[position + 1][0] if position + 1 < len(starts) else len(nodes)
        section = [node for node in nodes[start:end] if node["kind"] != "MetadataNode"]
        metadata: list[dict[str, Any]] = []
        description_nodes: list[dict[str, Any]] = []
        for node in section[2:]:
            if not description_nodes and not any(
                "Duration:" in field["normalizedText"] for field in metadata
            ):
                metadata.append(node)
            else:
                description_nodes.append(node)
        try:
            casting = _parse_casting_metadata(" ".join(node["normalizedText"] for node in metadata))
        except ValueError as error:
            raise ValueError(f"{name}: {error}") from error
        description = " ".join(node["normalizedText"] for node in description_nodes)
        level, school, classes = signature
        attack = re.search(r"\b(melee|ranged) spell attack\b", description, re.IGNORECASE)
        entities.append(
            {
                "id": f"srd521.spell.{_slug(name)}",
                "kind": "spell",
                "name": {"en": name},
                "tags": ["spell", f"level-{level}", school, *classes],
                "source": _source_spans(section),
                "body": {
                    "level": level,
                    "school": school,
                    "classes": classes,
                    **casting,
                    "ritual": "ritual" in casting["castingTime"].casefold(),
                    "attackType": attack.group(1).casefold() if attack else None,
                    "savingThrows": sorted(
                        {
                            match.group(1).casefold()
                            for match in re.finditer(
                                rf"\b({'|'.join(ABILITIES)}) saving throw",
                                description,
                                re.IGNORECASE,
                            )
                        }
                    ),
                    "damage": [],
                    "healing": [],
                    "hasHigherLevelEffect": "Using a Higher-Level Spell Slot." in description,
                    "description": description,
                    "automationLevel": "display-only",
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": (
                        "Source-linked spell; numerical and conditional effects "
                        "need semantic review."
                    ),
                },
            }
        )
    if not entities or len({entity["id"] for entity in entities}) != len(entities):
        raise ValueError("Spell catalog is empty or contains duplicate IDs.")
    return entities


def generate_spell_catalog(spell_root: Path, output: Path) -> list[dict[str, Any]]:
    entities = extract_spell_catalog(read_json(spell_root / "normalized" / "document.json"))
    existing = read_json(output / "entities.json")
    existing_ids = {entity["id"] for entity in existing}
    by_id = {entity["id"]: entity for entity in entities}
    source_fields = (
        "level",
        "school",
        "classes",
        "castingTime",
        "range",
        "components",
        "duration",
        "ritual",
        "concentration",
        "description",
        "hasHigherLevelEffect",
    )
    refreshed = []
    for entity in existing:
        canonical = by_id.get(entity["id"])
        if canonical is None or entity.get("kind") != "spell":
            refreshed.append(entity)
            continue
        refreshed.append(
            {
                **entity,
                "source": canonical["source"],
                "body": {
                    **entity["body"],
                    **{key: canonical["body"][key] for key in source_fields},
                },
            }
        )
    write_json(output / "entities" / "spells.json", entities)
    write_json(
        output / "entities.json",
        [*refreshed, *[entity for entity in entities if entity["id"] not in existing_ids]],
    )
    return entities


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spell-extraction", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args(arguments)
    entities = generate_spell_catalog(options.spell_extraction, options.output)
    print(f"Extracted {len(entities)} source-linked spells; preserved existing annotations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

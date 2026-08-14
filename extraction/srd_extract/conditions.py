"""Parse the standard SRD conditions into source-linked content entities."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

from srd_extract.io import read_json, write_json
from srd_extract.wizard import _slug, _source_spans

CONDITION_HEADING = re.compile(r"^(?P<name>.+) \[Condition\]$")
EXPECTED_CONDITIONS = (
    "Blinded",
    "Charmed",
    "Deafened",
    "Exhaustion",
    "Frightened",
    "Grappled",
    "Incapacitated",
    "Invisible",
    "Paralyzed",
    "Petrified",
    "Poisoned",
    "Prone",
    "Restrained",
    "Stunned",
    "Unconscious",
)

# Mechanical annotations are deliberately separate from the extracted prose.  The
# evaluator consumes these fields generically, so adding another condition does
# not require a condition-name switch in either rules-core or the web app.
CONDITION_MECHANICS: dict[str, dict[str, Any]] = {
    "Blinded": {"d20RollEffects": [{"scope": "attack-rolls", "kind": "disadvantage"}]},
    "Exhaustion": {"d20ModifierPerLevel": -2, "speedModifierPerLevel": -5},
    "Frightened": {
        "d20RollEffects": [
            {"scope": "ability-checks", "kind": "disadvantage"},
            {"scope": "attack-rolls", "kind": "disadvantage"},
        ]
    },
    "Grappled": {"speedMaximum": 0},
    "Incapacitated": {
        "disablesActions": True,
        "breaksConcentration": True,
        "d20RollEffects": [{"scope": "initiative", "kind": "disadvantage"}],
    },
    "Invisible": {
        "d20RollEffects": [
            {"scope": "initiative", "kind": "advantage"},
            {"scope": "attack-rolls", "kind": "advantage"},
        ]
    },
    "Paralyzed": {
        "grantsConditions": ["srd521.condition.incapacitated"],
        "speedMaximum": 0,
        "automaticFailedSavingThrows": ["strength", "dexterity"],
    },
    "Petrified": {
        "grantsConditions": ["srd521.condition.incapacitated"],
        "speedMaximum": 0,
        "automaticFailedSavingThrows": ["strength", "dexterity"],
        "damageResistances": ["all"],
        "conditionImmunities": ["srd521.condition.poisoned"],
    },
    "Poisoned": {
        "d20RollEffects": [
            {"scope": "ability-checks", "kind": "disadvantage"},
            {"scope": "attack-rolls", "kind": "disadvantage"},
        ]
    },
    "Prone": {"d20RollEffects": [{"scope": "attack-rolls", "kind": "disadvantage"}]},
    "Restrained": {
        "speedMaximum": 0,
        "d20RollEffects": [
            {"scope": "attack-rolls", "kind": "disadvantage"},
            {"scope": "saving-throw", "ability": "dexterity", "kind": "disadvantage"},
        ],
    },
    "Stunned": {
        "grantsConditions": ["srd521.condition.incapacitated"],
        "automaticFailedSavingThrows": ["strength", "dexterity"],
    },
    "Unconscious": {
        "grantsConditions": ["srd521.condition.incapacitated", "srd521.condition.prone"],
        "speedMaximum": 0,
        "automaticFailedSavingThrows": ["strength", "dexterity"],
    },
}


def parse_conditions(document: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = list(document["nodes"])
    conditions: list[dict[str, Any]] = []
    for index, heading in enumerate(nodes):
        if heading["kind"] != "HeadingNode":
            continue
        match = CONDITION_HEADING.fullmatch(heading["normalizedText"])
        if match is None:
            continue
        description = next(
            (
                node
                for node in nodes[index + 1 :]
                if node["kind"] not in {"MetadataNode", "ArtifactNode"}
            ),
            None,
        )
        if description is None or description["kind"] != "ParagraphNode":
            raise ValueError(f"{match.group('name')} has no condition description")
        name = match.group("name")
        conditions.append(
            {
                "id": f"srd521.condition.{_slug(name)}",
                "kind": "condition",
                "name": {"en": name},
                "tags": ["condition"],
                "source": _source_spans([heading, description]),
                "body": {
                    "description": description["normalizedText"],
                    **CONDITION_MECHANICS.get(name, {}),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": f"{name} condition text extracted from the Rules Glossary.",
                },
            }
        )
    names = tuple(condition["name"]["en"] for condition in conditions)
    if names != EXPECTED_CONDITIONS:
        raise ValueError(f"Unexpected condition set: {names!r}")
    return conditions


def generate_condition_content(extraction_root: Path, output: Path) -> list[dict[str, Any]]:
    document = read_json(extraction_root / "normalized" / "document.json")
    conditions = parse_conditions(document)
    replacement_ids = {condition["id"] for condition in conditions}
    current_entities = read_json(output / "entities.json")
    replacement_positions = [
        index for index, entity in enumerate(current_entities) if entity["id"] in replacement_ids
    ]
    insertion_index = min(replacement_positions, default=len(current_entities))
    retained = [entity for entity in current_entities if entity["id"] not in replacement_ids]
    entities = [
        *retained[:insertion_index],
        *conditions,
        *retained[insertion_index:],
    ]
    write_json(output / "entities" / "conditions.json", conditions)
    write_json(output / "entities.json", entities)
    coverage = read_json(output / "coverage.json")
    coverage["counts"]["STRUCTURED"] = len(entities)
    coverage_note = str(coverage["note"])
    if "standard conditions" not in coverage_note:
        coverage_note = coverage_note.removesuffix(".").replace(
            "; and representative spells", "; representative spells"
        )
        coverage_note = f"{coverage_note}; and all fifteen standard conditions."
    coverage["note"] = coverage_note
    write_json(output / "coverage.json", coverage)
    return conditions


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extraction", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    conditions = generate_condition_content(args.extraction, args.output)
    print(f"Generated {len(conditions)} standard condition entities")


if __name__ == "__main__":
    main()

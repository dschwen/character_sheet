from srd_extract.conditions import EXPECTED_CONDITIONS, parse_conditions


def _node(kind: str, text: str, index: int) -> dict[str, object]:
    return {
        "kind": kind,
        "normalizedText": text,
        "parentId": "page-0177",
        "sourceBlocks": [f"p0177-b{index:03d}"],
    }


def test_parse_conditions_builds_source_linked_entities() -> None:
    nodes: list[dict[str, object]] = []
    for index, name in enumerate(EXPECTED_CONDITIONS, start=1):
        nodes.extend(
            [
                _node("HeadingNode", f"{name} [Condition]", index * 2),
                _node(
                    "ParagraphNode",
                    f"While you have the {name} condition, its rules apply.",
                    index * 2 + 1,
                ),
            ]
        )

    conditions = parse_conditions({"nodes": nodes})

    assert len(conditions) == 15
    assert conditions[0]["id"] == "srd521.condition.blinded"
    assert conditions[-1]["id"] == "srd521.condition.unconscious"
    assert conditions[0]["source"][0]["page"] == 177
    assert conditions[0]["body"]["description"].startswith("While you have the Blinded")


def test_parse_conditions_rejects_an_incomplete_standard_set() -> None:
    try:
        parse_conditions(
            {
                "nodes": [
                    _node("HeadingNode", "Blinded [Condition]", 1),
                    _node("ParagraphNode", "Blinded description.", 2),
                ]
            }
        )
    except ValueError as error:
        assert "Unexpected condition set" in str(error)
    else:
        raise AssertionError("Expected an incomplete condition set to be rejected")

from typing import Any

from srd_extract.spell_recovery import recovery_resource_ir


def test_recovery_resources_have_independent_long_rest_uses_and_source_provenance() -> None:
    feature: dict[str, Any] = {
        "id": "test.feature",
        "name": "Natural Recovery",
        "level": 6,
        "source": [{"page": 46}],
        "bodyNodes": [{"kind": "ParagraphNode", "normalizedText": "Pinned source text"}],
    }
    ir = recovery_resource_ir(
        feature,
        "test.subclass",
        ["test.resource.recovery", "test.resource.free-cast"],
        kind="subclass-feature",
    )
    assert ir["source"] == feature["source"]
    assert ir["parentId"] == "test.subclass"
    assert ir["kind"] == "subclass-feature"
    assert ir["text"]["nodes"][0]["text"] == "Pinned source text"
    assert {rule["target"] for rule in ir["proposedRules"]} == {
        "test.resource.recovery",
        "test.resource.free-cast",
    }
    for rule in ir["proposedRules"]:
        assert rule["expression"] == {"kind": "literal", "value": 1}
        assert rule["parameters"]["recharge"] == [{"event": "long-rest", "amount": "all"}]

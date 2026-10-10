"""Shared source-linked resource authoring for rest-based spell-slot recovery."""

from __future__ import annotations

from typing import Any


def recovery_resource_ir(
    feature: dict[str, Any],
    parent_id: str,
    resource_ids: list[str],
    *,
    kind: str = "class-feature",
) -> dict[str, Any]:
    return {
        "schemaVersion": "0.1.0",
        "id": feature["id"],
        "kind": kind,
        "parentId": parent_id,
        "level": feature["level"],
        "source": feature["source"],
        "text": {
            "title": feature["name"],
            "nodes": [
                {"kind": node["kind"], "text": node["normalizedText"]}
                for node in feature["bodyNodes"]
                if node["kind"] in {"ParagraphNode", "ListNode"}
            ],
        },
        "proposedRules": [
            {
                "id": resource_id.rsplit(".", 1)[-1] + "-resource",
                "type": "grant-resource",
                "target": resource_id,
                "expression": {"kind": "literal", "value": 1},
                "parameters": {"recharge": [{"event": "long-rest", "amount": "all"}]},
                "automationLevel": "state-automated",
            }
            for resource_id in resource_ids
        ],
        "review": {
            "extraction": "approved",
            "semantics": "needs-review",
            "tests": "draft",
            "notes": ["Slot selection is an explicit atomic Short Rest request."],
        },
    }

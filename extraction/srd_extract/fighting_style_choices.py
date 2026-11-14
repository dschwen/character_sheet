"""Author source-linked Fighting Style alternatives using shared choice metadata."""

from typing import Any


def add_cantrip_alternative(
    class_entity: dict[str, Any],
    features: tuple[dict[str, Any], ...],
    existing: list[dict[str, Any]],
    *,
    name: str,
    source_class_id: str,
    default_cantrips: list[str],
) -> dict[str, Any]:
    feature = next(feature for feature in features if feature["name"] == "Fighting Style")
    text = " ".join(node["normalizedText"] for node in feature["bodyNodes"])
    source_name = source_class_id.rsplit(".", 1)[-1].capitalize()
    for phrase in (name, f"two {source_name} cantrips", "can replace one", "count as"):
        if phrase not in text:
            raise ValueError(f"Fighting Style source is missing {phrase}")
    source_class = next(entity for entity in existing if entity["id"] == source_class_id)
    source_ids = set(source_class["body"]["spellList"])
    cantrips = sorted(
        entity["id"]
        for entity in existing
        if entity["kind"] == "spell" and entity["id"] in source_ids and entity["body"]["level"] == 0
    )
    if len(set(default_cantrips)) != 2 or not set(default_cantrips).issubset(cantrips):
        raise ValueError("Fighting Style requires two loaded default cantrips from its source list")
    styles = sorted(
        entity["id"]
        for entity in existing
        if entity["kind"] == "feat"
        and entity["body"].get("category") == "fighting-style"
        and feature["id"] in entity["body"].get("requiresAnyFeatureIds", [])
    )
    choice = class_entity["body"]["fightingStyleChoice"]
    default_style = choice["options"][0]
    if default_style not in styles:
        raise ValueError("The default Fighting Style must be a loaded eligible feat")
    slug = name.casefold().replace(" ", "-")
    class_slug = class_entity["id"].rsplit(".", 1)[-1]
    option_id = f"srd521.option.{class_slug}.fighting-style.{slug}"
    choice.update(
        {
            "options": [*styles, option_id],
            "defaultOptionIds": [default_style],
            "featSelection": {
                "sourceFeatureId": feature["id"],
                "exclusiveGroup": "fighting-style",
                "allowAlternativeOptions": True,
            },
        }
    )
    class_entity["body"]["fightingStyleCantripChoice"] = {
        "id": f"srd521.choice.{class_slug}.{slug}-cantrips",
        "level": feature["level"],
        "minimum": 2,
        "maximum": 2,
        "options": cantrips,
        "defaultOptionIds": default_cantrips,
        "requiredOption": {"choiceId": choice["id"], "optionId": option_id},
        "changeOn": ["level-up"],
        "replacementMaximum": 1,
        "spellSelection": {
            "sourceFeatureId": feature["id"],
            "castingClassId": class_entity["id"],
            "sourceClassIds": [source_class_id],
            "alwaysPrepared": True,
            "allowCantrips": True,
            "maximumSpellLevel": 0,
        },
    }
    return {
        "id": option_id,
        "kind": "class-option",
        "name": {"en": name},
        "tags": ["class-option", class_slug, "fighting-style-alternative"],
        "source": feature["source"],
        "body": {"choiceId": choice["id"], "text": text},
        "rules": [],
        "review": {
            "status": "STRUCTURED",
            "extractionApproved": True,
            "semanticsApproved": False,
            "testsApproved": False,
        },
    }

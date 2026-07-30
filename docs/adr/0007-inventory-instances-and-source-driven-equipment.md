# ADR 0007: Use inventory instances and source-driven equipment

- Status: Accepted
- Date: 2026-07-29

## Decision

Owned equipment is persisted as inventory instances containing an instance ID, content entity ID,
and quantity. Equipped-item references point to instance IDs, while Weapon Mastery selections point
to stable weapon entity IDs.

Armor and weapon calculations consume structured entities generated from the pinned SRD tables.
The rules engine does not infer equipment statistics from identifiers or display names.

Weapon attacks select their ordinary ability from the weapon's attack type and properties. Finesse
weapons expose Strength and Dexterity as candidates and currently select the higher modifier.
Weapon proficiency, armor training, and mastery capacity come from the starting class entity.

## Consequences

Two copies of the same content item can have distinct equipped, attuned, or future mutable states.
Missing entities and invalid equipped-instance references are detectable. Inventory can be
serialized without persisting calculated AC or attack bonuses.

Equipment source spans flow into Armor Class, attack, damage, and armor-penalty traces. Future magic
items can extend inventory instances without changing ordinary equipment identity.

# Savage Attacker: declared whole-pool choices

SRD 5.2.1 page 87 permits rolling a weapon's damage dice twice and using either roll, once per
turn when hitting a target with a weapon. It is not restricted to the character's own turn.

The existing source-linked feat metadata (`trigger`, `weaponDamageRolls`, `chooseDamageRoll`)
is validated by `weaponDamageRollChoiceSchema`. The evaluator emits eligible choices on owned
weapon attacks, with a source-linked trace. The UI uses these summaries without checking a feat
ID or class name. Unarmed Strikes, spell damage, and fixed-damage attacks do not gain the choice.

In Combat, confirm that the weapon hit a target and that the benefit is unused this turn. An
optional critical-hit declaration doubles weapon dice only. The shared fullscreen roller throws
both complete pools together and partitions their settled results in throw order. Each candidate
includes its ordinary modifier exactly once, and applies any declared damage-mode die minimum
(such as Great Weapon Fighting) independently. Neither per-die best-of selection nor adding both
pools is allowed. The result picker permits either pool, including the lower result or a tie.

Extra dice from features, spells, and other damage riders are excluded and rolled separately.
Turn use and target damage remain manual: there is no encounter clock, target-sheet update, or
persisted use counter. A use clears the confirmations on every weapon row. Results are transient and do not
modify HP, equipment, resources, or saved history. A new roll clears the previous comparison;
character changes hide/clear it, and late results from a superseded character are ignored.

WebGL failure falls back to the same complete-pool resolver, rerolling all candidate pools and
reporting fallback use. Tests verify ownership, metadata-driven grants, declarations, ordinary
and critical dice, die minima, modifiers, lower/tied choices, invalid inputs, fallback parity,
and state preservation. The production-export browser gate exercises normal and critical
fullscreen rolls and intentionally unavailable WebGL at desktop/narrow viewports. Only the exact
vendor error deliberately induced by the negative test is accepted; all other render errors fail.
These tests do not constitute human extraction, semantics, or test approval.

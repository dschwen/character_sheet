# Death Saving Throws

The pinned SRD pages 17–18 define a saving throw with no ability modifier and no proficiency bonus.
The shared evaluator exposes `savingThrow.death` with source-linked traces. General saving-throw
effects such as Bless and another Paladin's declared Aura of Protection apply; ability-specific
effects do not. Exhaustion, applicable Advantage/Disadvantage, and species reroll treatment use
the existing d20 pipeline. This does not add automation for currently display-only spells.

## Rolling and resolving

Play → Hit Points provides fullscreen rolling and a separate **Apply final death save result**
control. The player confirms that their turn starts at 0 HP and that they are not Stable.
Resolve any reroll or post-roll bonus before applying marks. Indomitable is modeled as `no-action`,
so Incapacitated does not incorrectly prevent its use; the same distinction preserves Dark One's
Own Luck and Relentless Endurance while still blocking actions, Bonus Actions, and Reactions.

The engine's `proposeDeathSavingThrow` accepts declared final natural d20 and total results. It
does not roll dice or attest an external dice history. A total of at least 10 succeeds, except a
natural 1 always marks two failures. A natural 20 regains 1 HP regardless of modifiers and resets
both counters. A third success makes the character Stable and resets both counters; a third
failure records death. Ineligible requests are atomic and do not mutate the source document.
The UI clears the completed result after applying it, preventing accidental repeated application.

## Persistent play state

`stableAtZeroHitPoints` and `dead` are optional, backward-compatible state fields. Old documents
remain loadable without invented fields. Three saved failures still identify a dead character;
three saved successes at zero identify legacy stabilization. Massive damage records death
explicitly rather than inventing failed-save history. Six levels of Exhaustion cause death;
reducing Exhaustion alone does not revive the character.

Zero HP derives Unconscious (and its implications) without adding a persistent condition toggle.
Regaining HP therefore ends only the zero-HP cause; unrelated explicitly toggled Unconscious
effects remain. Spellcasting while Incapacitated is rejected. Death prevents ordinary healing,
feature actions, spellcasting, and rest-based revival.

Successful external first aid requires a declared Help action and successful DC 10 Wisdom
(Medicine) check, then stabilizes without healing. Stable characters do not roll and remain
unconscious. Damage at zero ends stability and adds a failure (two for a declared Critical Hit),
even when temporary HP absorb the damage. Massive damage is checked against maximum HP by the
sheet's damage workflow. Dropping to zero ends Concentration and linked self spell statuses.
Healing resets both save counters and clears stabilization without restoring spent resources.

## Remaining work

Turn boundaries, first-aid adjudication, external dice provenance, Stable recovery after 1d4 hours,
revival magic, and maximum-HP-draining effects remain manual or unfinished. General resource and
damage play-state provenance still requires the broader audit. Browser verification is outstanding
because no browser connection was available in the latest verification session. Source-linked
tests and production builds are not independent semantic review.

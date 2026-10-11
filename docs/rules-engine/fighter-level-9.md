# Fighter level 9

Fighter creation and same-class advancement reach level 9. Other class builders remain capped at
8 pending their level-9 features. Progression uses the pinned SRD tables; proficiency rises to +4
and earlier feats, Fighting Styles, inventory, current HP, conditions and expended resources are
preserved. Advancement is not a rest and does not restore Second Wind or Action Surge.

## Indomitable

The page-48 source grants a reroll of a failed saving throw, adding Fighter level to the new roll.
It does not grant Advantage or require a Reaction. One use recharges on a Long Rest, not a Short
Rest. The source-linked authoring IR also records the future two-use level-13 and three-use
level-17 progression; those levels are not yet offered by the builder.

The shared failed-save reroll action path requires a matching completed saving throw, a manual
failure declaration, an available use, and no previous application of that feature to the same
roll. Invalid requests are atomic and spend nothing. A legal request spends one use whether the
new result succeeds or fails. It never heals or removes a condition automatically. Resource
spending and the Fighter-level bonus have source-linked traces.

The UI rolls fullscreen with the existing dark-green/cream dice and falls back to ordinary dice
if WebGL fails. It retains the original roll mode, ongoing bonus-die definitions and applicable
species reroll treatment. Consumable post-roll bonus results are not automatically copied to the
new roll. The new result replaces the old one, even if worse; the user compares against the DC and
resolves the save's effects. A persistent combat log/remote target adjudicator is not implied.

The roller now also models Death Saving Throws, with no ability or proficiency bonus. Indomitable
can reroll a failed death save before its marks are applied; the replacement's natural d20 still
controls the special 1/20 outcomes. See [Death Saving Throws](death-saving-throws.md).

## Tactical Master

The page-48 feature supplies the replacement properties Push, Sap, and Slow as content metadata.
The evaluator exposes replacements only for a weapon whose mastery the character can use. It
does not change the weapon's original property, selected mastery IDs, damage or attack bonus.
Source-linked traces explain the available replacements.

Combat provides a per-attack selector. The roll receipt names the declared mastery and the
selection resets after rolling. A replacement never stacks with the original property; target
effects, size, movement, duration and other attack eligibility remain manually adjudicated.

Independent semantic review and rendered browser verification are still outstanding; extraction,
tests, and a successful build do not promote the review status to VERIFIED.

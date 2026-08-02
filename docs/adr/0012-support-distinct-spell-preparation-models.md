# ADR 0012: Support distinct spell preparation models

## Status

Accepted.

## Decision

Spellcasting classes declare a `spellPreparation` model in generated class content. `spellbook`
classes record cantrips and level 1+ spells in `learnedSpellIds`, then prepare a subset. `full-list`
classes record only learned cantrips and prepare level 1+ spells directly from their class list.

Subclass content may declare level-gated `alwaysPreparedSpells`. These spells are added to the
evaluated display and castable set without consuming the class's prepared-spell selections.

The calculation paths, validation codes, slots, attack bonus, save DC, spell summaries, and casting
transitions remain shared across preparation models.

Spellcasting content also declares a `spellcastingModel` and `slotRecharge`. Standard spellcasting
uses level-specific slots that recharge on a Long Rest. Pact Magic uses the progression’s single
current slot level and restores all of those slots on either a Short or Long Rest. Both models keep
the same spell-cast transition and persisted `expendedSpellSlots` representation.

## Consequences

- Wizard spellbook minimums remain reproducible without imposing spellbooks on divine casters.
- Cleric domain spells cannot accidentally consume prepared-spell selections.
- Pact Magic can share preparation, spell display, casting, and Concentration code while retaining
  its distinct slot progression and Short-Rest recharge.
- The current milestone remains single-class; multiclass spell-slot combination is deferred to the
  dedicated multiclassing milestone.

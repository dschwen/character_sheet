# Declared Grappler combat benefits

The SRD 5.2.1 Grappler feat (page 87) retains its existing acquisition rules. Its three combat
benefits are now authored as shared `grappleBenefits` capability metadata. The evaluator and UI
read this metadata; neither branches on a class or feat ID. The generators check the source's
Attack-action, own-turn, once-per-turn, target relationship and size wording before authoring it.
No new human review approvals are implied.

## Combat controls

The feat's Combat panel asks for a named target. Declarations are local UI state, not target
tracking or persistent effects. Ordinary attack/damage controls remain unchanged.

- **Attack Advantage:** confirm this specific creature is currently Grappled by you, not someone
  else. Choose a weapon, Unarmed Strike or spellcasting source. The dedicated roll adds this
  source's Advantage only to that declared target. Existing uncancelled Advantage/Disadvantage
  sources and additional situational declarations resolve normally; another Advantage cannot
  overcome any Disadvantage. Spell sources retain their own bonuses and class-specific benefits.
  Range, cover and nearby-hostile-creature Disadvantage remain manually declared, including for
  ranged spell attacks; holding a target does not bypass those rules.
  Target confirmation clears after the roll. Other attack tradeoffs remain in their existing
  controls and are not automatically chained by this panel.
- **Punch and Grab:** declare an Unarmed Strike hit on a creature as part of the Attack action
  on your turn, unused benefit this turn, a free hand, reach, eligible target and confirmed current
  sizes. A Bonus Action or Reaction hit does not qualify. The target cannot be more than one size
  larger. The panel resolves one damage result and supplies Strength-or-Dexterity save instructions
  with the derived DC; on a failed save, set Grappled on the target's sheet manually. Do not also
  apply a second ordinary damage roll for that same hit. Dice double on a critical hit, not flat
  damage or modifiers. Granted alternative Unarmed Strike damage types are selectable; ungranted
  types are rejected. Declarations clear after resolution.
- **Fast Wrestler:** confirm a creature Grappled by you, both actual current sizes and the proposed
  distance. A same-size or smaller target has no extra grapple movement cost. Larger targets use
  ordinary extra grapple movement cost. This is cost guidance, not an atomic movement transition:
  remaining movement, difficult terrain, other costs, transformations and positions are manual.
  The controls never change Speed or track a creature's location.

## Save DCs and boundaries

Unarmed grapple DC is 8 + Strength modifier + Proficiency Bonus (page 190). The Monk's Martial
Arts data permits Dexterity instead (page 50); the evaluator selects the better permitted modifier
only while the existing Martial Arts equipment restrictions are satisfied. The DC trace cites
both sources, and wearing armor or a shield disables that alternate path.

The resolver rejects missing declarations, unknown attacks or sources, oversized initial grapple
targets, invalid character history and Incapacitated/dead actors. It does not roll another
creature's saving throw, decide immunities, set a condition on the actor, spend an encounter
action budget or infer how many hands are free. Target sheets and once-per-turn use remain manual.

Dice results and receipts are transient. Changing character while a roll is settling invalidates
the pending result; it cannot publish an old target result or spend the new character's resources.
Tests cover source metadata, Strength/Monk DCs, armor gating, fixed/critical damage, weapon and
spell attacks, uncancelled roll-source cancellation, declarations, sizes and state preservation.
The production browser gate covers Fighter, Monk and Wizard flows, including late results after
a character switch, at desktop and narrow viewports.

# Barbarian level 9 and declared attack options

Builder and same-class advancement support Barbarian levels 1–9, using the pinned SRD
pages 28–30. Rage Damage increases to 3 through the existing progression table.
Advancement preserves earlier feat allocations, possessions, loadout, and spent state.

## Combat workflow

Under Combat → Attacks, open **Attack options** for a Strength-based attack.
Select Reckless Attack and confirm it was declared when making the first attack roll
on your turn and has not expired. It gives Advantage on Strength attacks until the
start of your next turn, including eligible off-turn attacks. Attack rolls against you
also gain Advantage during that time; this incoming effect is described, not silently
applied to other sheets. Rage is not required.

At level 9, choose Brutal Strike, confirm this attack is on your turn and no attack
has already used the choice this turn, and choose Forceful Blow or Hamstring Blow.
Declare additional situational Advantage or Disadvantage. The engine rejects the
tradeoff if **any** Disadvantage applies, including condition, status, or declared
context sources—even when Advantage would normally cancel it. An eligible strike
gives up all Advantage and rolls one d20, preserving modifiers, Bless dice, species
rerolls, and critical thresholds.

The roll label records the declaration and selected effect. After adjudicating a hit,
confirm **This chosen attack hit** and roll separate extra damage: 1d10 of the attack's
damage type, or 2d10 on a critical hit. No ability or Rage bonus is added again.
Applicable weapon damage die minima use the selected damage mode. Roll base weapon
damage separately. A missed chosen attack still uses the turn's choice.

Forceful Blow provides push guidance and calculates half the character's final adjusted
Speed, rounded down, for optional straight-line movement toward the target without
Opportunity Attacks. Hamstring Blow describes the 15-foot Speed reduction, expiry,
and non-stacking rule. Target sheets and positions are not mutated.

All characters now have the standard damage-option Unarmed Strike: Strength plus
Proficiency Bonus to hit, fixed 1 plus Strength Bludgeoning damage, with applicable
Rage damage. Monk Martial Arts retains its ability/die substitution. Fixed base damage
is displayed without invented dice; critical hits do not double the flat damage.
Brutal Strike can roll its extra dice. Grapple and Shove remain assisted rather than
being modeled as attack rolls. Unarmed Strike traces cite SRD page 190.

## Architecture and remaining limits

`featureAutomationBodySchema.attackRollOptions` supplies ability eligibility, benefit
dependencies, timing declarations, extra dice, effects, and movement fractions.
The evaluator exposes granted options for the attack's chosen ability with source-linked
traces. `resolveAttackRollOptions` validates declarations without mutating the character.
The UI has no Barbarian class-ID branches for these mechanics.

Declarations are local encounter controls, not a persistent initiative/turn engine.
The player confirms first-attack timing, expiry, and once-per-turn availability;
controls cannot independently verify those facts across attacks, reloads, or sheets.
Changing saved character state resets local controls. A single declaration offers its
extra-damage roll once, but does not prove an external hit or dice history.
Target movement, incoming Reckless Advantage, Hamstring expiry, Frenzy extra damage,
and other target-specific benefits remain assisted/manual. Higher Barbarian levels,
independent semantic review, and rendered browser verification remain unfinished.
The numeric Exhaustion attack gap is now fixed; see
`docs/rules-engine/attack-condition-modifiers.md`. Broader attack auditing remains open.

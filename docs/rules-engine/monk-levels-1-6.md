# Monk levels 1–7 vertical slice

The reviewed `monk-5.json` fixture is a Human Soldier Warrior of the Open Hand. It is unarmored,
wields a Spear, has Dexterity 18 and Wisdom 15, and exercises every persistent level-1–5 Monk
calculation.

The evaluator derives the Monk’s Dexterity-and-Wisdom Armor Class, unarmored movement bonus,
Wisdom-based Focus save DC, Martial Arts die substitution, Dexterous Attacks, a structured Unarmed
Strike, and Extra Attack. Five Focus Points fuel Flurry of Blows, Patient Defense, Step of the Wind,
Deflect Attacks redirection, and Stunning Strike. Action proposals spend Focus atomically, and
either Short or Long Rest restores it.

The generated content retains every Monk and Warrior of the Open Hand feature through level 20 as
source-linked structured text. The builder and advancement flow support level 7, granting seven Focus
Points, Empowered Strikes, and Wholeness of Body. Unarmed Strike damage offers a Force alternative
without changing weapon damage or requiring armor-free Martial Arts eligibility.

Wholeness of Body is a Bonus Action that rolls the current Martial Arts die (1d8 at level 6), adds
Wisdom, heals at least 1 HP, and caps healing at maximum HP. Its separate resource has a maximum
equal to Wisdom's modifier (minimum 1), recharges only on Long Rest, and cannot be used at 0 HP.
The generic action controls use the existing fullscreen dice roller before applying healing and
spending one use. The die is derived from the progression table rather than fixed in the UI.

At level 7, Evasion adds a source-linked saving-throw damage effect (page 51). For an effect that
normally permits a Dexterity save for half damage, a successful save deals zero and a failed save
deals half, rounded down. No Focus is spent, and armor or Shield use does not disable Evasion.
Effective Incapacitated disables it, including that granted by Stunned, Paralyzed, or Unconscious.
Prone and Grappled alone do not disable it.

Play → Hit Points offers an opt-in saving-throw damage resolver. Declare the ability, outcome,
and normal successful-save damage; the preview shows the fraction, rounded total, and explanation
trace. Only eligible, granted, active effects apply. Duplicate benefits select the lowest fraction
rather than multiplying. Ordinary resolved damage entry remains the default. Switching, importing,
creating, or advancing a character turns the resolver off to avoid carrying save declarations
across sheets.

Applying the preview uses the ordinary reversible HP update: Temporary HP absorbs damage first,
then current HP, without applying Evasion twice. The resolver itself changes no state. Healing
ignores save declarations. Outcome declaration (including forced failures), effect eligibility,
resistances, vulnerability, other reductions, and concentration checks remain manual. If other
modifiers apply, resolve those separately and turn off the resolver before entering an
already-resolved final total. Outgoing spell damage is unchanged.

Tests cover level gates, successful/failed and odd damage, condition inheritance, exhausted Focus,
armor, other abilities and save types, Temporary HP, duplicate/data-edited effects, malformed
inputs, and level-up preservation. Browser verification of the controls remains outstanding.

These limits remain intentionally assisted:

- Flurry of Blows spending is automated, but its two attack rolls are resolved by the player.
- Patient Defense, Step of the Wind, Stunning Strike, and Open Hand Technique expose or retain the
  rule without applying combat conditions, movement, or target saving throws.
- Deflect Attacks damage reduction and its reduce-to-zero trigger are resolved manually; the
  redirect action can then spend Focus.
- Uncanny Metabolism’s initiative trigger, healing roll, and Focus refill remain descriptive until
  initiative-triggered compound transitions are available.

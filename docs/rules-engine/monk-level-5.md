# Monk level 5 vertical slice

The reviewed `monk-5.json` fixture is a Human Soldier Warrior of the Open Hand. It is unarmored,
wields a Spear, has Dexterity 18 and Wisdom 15, and exercises every persistent level-1–5 Monk
calculation.

The evaluator derives the Monk’s Dexterity-and-Wisdom Armor Class, unarmored movement bonus,
Wisdom-based Focus save DC, Martial Arts die substitution, Dexterous Attacks, a structured Unarmed
Strike, and Extra Attack. Five Focus Points fuel Flurry of Blows, Patient Defense, Step of the Wind,
Deflect Attacks redirection, and Stunning Strike. Action proposals spend Focus atomically, and
either Short or Long Rest restores it.

The generated content retains every Monk and Warrior of the Open Hand feature through level 20 as
source-linked structured text. Through level 5, these limits remain intentionally assisted:

- Flurry of Blows spending is automated, but its two attack rolls are resolved by the player.
- Patient Defense, Step of the Wind, Stunning Strike, and Open Hand Technique expose or retain the
  rule without applying combat conditions, movement, or target saving throws.
- Deflect Attacks damage reduction and its reduce-to-zero trigger are resolved manually; the
  redirect action can then spend Focus.
- Uncanny Metabolism’s initiative trigger, healing roll, and Focus refill remain descriptive until
  initiative-triggered compound transitions are available.

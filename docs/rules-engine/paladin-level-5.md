# Paladin level 5 vertical slice

The reviewed `paladin-5.json` fixture is a Human Soldier Oath of Devotion Paladin. It wears Chain
Mail with a Shield, uses the Defense Fighting Style, masters Longswords and Javelins, prepares six
spells, and receives six additional always-prepared class and oath spells.

The evaluator derives Charisma spell attack and save values, spell slots, AC 19, Extra Attack,
Weapon Mastery, a 25-point Lay On Hands pool, two Channel Divinity uses, and the once-per-Long-Rest
free uses of Divine Smite and Find Steed. Lay On Hands accepts an explicit amount, heals and spends
that amount atomically, and rejects spending beyond the remaining pool.

The generated content retains every Paladin and Oath of Devotion feature through level 20 as
source-linked structured text. Through level 5, these limits remain intentionally assisted:

- Lay On Hands healing is automated; its alternative five-point Poisoned-condition removal remains
  descriptive.
- Divine Sense and Sacred Weapon spend Channel Divinity, but sensing and Sacred Weapon’s temporary
  attack bonus, light, and damage-type choice are resolved manually.
- The free Divine Smite and Find Steed uses are tracked separately from spell slots; their spell
  effects remain subject to the same assisted spell resolution as ordinary casting.
- Defense is the reviewed Fighting Style path. Blessed Warrior remains structured text pending a
  generic cross-class cantrip choice model.

# Paladin levels 1–7 vertical slice

The reviewed `paladin-5.json` fixture is a Human Soldier Oath of Devotion Paladin. It wears Chain
Mail with a Shield, uses the Defense Fighting Style, masters Longswords and Javelins, prepares six
spells, and receives six additional always-prepared class and oath spells.

The evaluator derives Charisma spell attack and save values, spell slots, AC 19, Extra Attack,
Weapon Mastery, a 25-point Lay On Hands pool, two Channel Divinity uses, and the once-per-Long-Rest
free uses of Divine Smite and Find Steed. Lay On Hands accepts an explicit amount, heals and spends
that amount atomically, and rejects spending beyond the remaining pool.

The generated content retains every Paladin and Oath of Devotion feature through level 20 as
source-linked structured text. Creation and same-class advancement support level 7, with a 35-point
Lay On Hands pool, Aura of Protection, and Aura of Devotion.

Aura of Protection adds Charisma's modifier (minimum +1) to all six saving throws, not ability
checks, skills, attacks, or Initiative. It becomes inactive when the Paladin is Incapacitated,
including when another condition grants Incapacitated. The aura's bonus, radius, and each saving
throw contribution have source-linked traces. The Play UI explains the 10-foot radius and tells
allies which status and bonus to set.

The recipient status requires an explicit caster bonus. It can benefit an incapacitated recipient
as long as the source Paladin's aura is active. On a Paladin's own sheet, choosing another Paladin's
aura replaces the own-aura contribution even when the chosen bonus is lower; the bonuses never
stack. Removing the other aura returns to the Paladin's own eligible bonus. Target positions,
source consciousness, and entry/exit from the aura are player-tracked, not automatically inferred.

At level 7, Aura of Devotion adds Charmed immunity to the active Aura of Protection. Both the
feature's grant and its dependency are content metadata, not class-specific UI logic. Direct and
inherited Incapacitated disable the source aura and its immunity. Existing Charmed is suppressed
without deleting the recorded condition. The condition toggle says “suppressed”; Shift-click
opens its source-linked explanation. When protection ends, an unexpired Charmed condition becomes
effective again. Unrelated conditions are not suppressed.

The Play aura summary tells allies to set “Aura of Devotion (other Paladin)” in Beneficial statuses.
The recipient toggle suppresses Charmed while set, independently of the recipient's own
Incapacitated state. It grants no saving-throw bonus; Aura of Protection's bonus remains a separate
selection. Range, ally eligibility, and the source Paladin's active state are manually declared;
there is no cross-sheet synchronization. Remove the status on exit or source incapacitation, and
remove Charmed separately when its duration actually expires. Browser verification of these new
controls remains outstanding because no browser was connected.

These limits remain intentionally assisted:

- Lay On Hands healing is automated; its alternative five-point Poisoned-condition removal remains
  descriptive.
- Divine Sense and Sacred Weapon spend Channel Divinity, but sensing and Sacred Weapon’s temporary
  attack bonus, light, and damage-type choice are resolved manually.
- The free Divine Smite and Find Steed uses are tracked separately from spell slots; their spell
  effects remain subject to the same assisted spell resolution as ordinary casting.
- Defense is the reviewed Fighting Style path. Blessed Warrior remains structured text pending a
  generic cross-class cantrip choice model.

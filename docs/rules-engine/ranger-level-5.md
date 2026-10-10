# Ranger level 5 vertical slice

The reviewed `ranger-5.json` fixture is a Human Soldier Hunter Ranger. It wears Studded Leather
Armor, uses the Defense Fighting Style, masters Longbows and Shortswords, prepares six spells, and
always has Hunter’s Mark prepared through Favored Enemy. Deft Explorer grants Expertise in
Stealth, and Colossus Slayer is the selected Hunter’s Prey option.

The evaluator derives Wisdom spell attack and save values, spell slots, AC 16, Extra Attack,
Weapon Mastery, three free Hunter’s Mark uses, and the Ranger’s skill Expertise. A free Hunter’s
Mark action spends its Favored Enemy resource and replaces Concentration atomically without
expending a spell slot. Long Rests restore both Favored Enemy uses and spell slots.

The generated content retains every Ranger and Hunter feature through level 20 as source-linked
structured text. Through level 5, these limits remain intentionally assisted:

- Hunter’s Lore records the information the player learns, but target Immunities, Resistances,
  and Vulnerabilities are supplied by the table or encounter system.
- Colossus Slayer’s once-per-turn `1d8` damage and Horde Breaker’s adjacent-target attack are
  structured options; their situational triggers and combat application remain manual.
- Deft Explorer validates and evaluates one Expertise selection. Its two language choices remain
  descriptive pending a general language-choice model.
- Defense is the reviewed Fighting Style path. Druidic Warrior remains structured text pending a
  generic cross-class cantrip choice model.

## Level 7 and rest-time choices

Creation and guided advancement now reach level 7. Hunters select Escape the Horde or Multiattack
Defense from source-linked options on SRD page 61. These are assisted incoming-attack rules:
Escape the Horde imposes Disadvantage on Opportunity Attacks against the Ranger; Multiattack
Defense imposes Disadvantage on a creature’s further attacks against the Ranger in the same turn
after it hits. The first attack is unaffected. Enemy hits and turn boundaries are not tracked, and
neither option modifies the Ranger’s AC or outgoing attacks.

Play → Rest shows the current options and permits replacement of both Defensive Tactics and
Hunter’s Prey during either rest. Selecting an option does not immediately change the sheet.
The shared rest proposal validates ownership, acquisition level, counts, option membership, and
the content-defined rest event, then returns the replacement build alongside recovered state.
Illegal replacements or failed rests return neither build changes nor resource recovery. Changes
retain the acquisition record and source-linked transition traces; unrelated choices are preserved.
Feat, spell, and other specialized choices cannot use this ordinary-option replacement path.

Ranger level 7 prepares seven spells and has four level-1 and three level-2 spell slots. Advancement
preserves existing prepared spells, adding the new selection through the existing preparation
workflow. Browser interaction verification remains outstanding because no browser was connected.

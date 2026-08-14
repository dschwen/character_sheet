# Rogue levels 5–6 vertical slice

The reviewed `rogue-5.json` fixture is a Human Soldier Thief Rogue. It wears Studded Leather Armor,
masters Daggers and Shortbows, has Expertise in Sleight of Hand and Stealth, and uses the full
level-5 Cunning Strike option set.

At level 6, the data-driven Expertise count increases from two to four. The level-up flow keeps the
existing choices locked, asks for two new proficient skills, and the evaluator doubles proficiency
for all four selections.

The evaluator derives AC 16, two doubled-proficiency skills, a Cunning Strike save DC of 15,
3d6 Sneak Attack, Weapon Mastery, Cunning Action, Steady Aim, Uncanny Dodge, Fast Hands, and the
Thief’s 30-foot Climb Speed. Withdraw calculates its maximum 15-foot movement from the current
walking speed, and all calculated values retain source-linked traces.

The generated content retains every Rogue and Thief feature through level 20 as source-linked
structured text. Through level 6, these limits remain intentionally assisted:

- Sneak Attack reports its dice and eligibility requirements, but encounter state determines
  Advantage, adjacent allies, and the once-per-turn limit.
- Poison and Trip report their die cost and calculated save DC; target saves and conditions remain
  encounter-assisted. Poison also records its Poisoner’s Kit requirement.
- Steady Aim reports its movement prerequisite and resulting attack Advantage, but turn movement
  state is not yet persisted by the character sheet.
- Uncanny Dodge reports its Reaction and one-half damage reduction; the triggering attack and
  incoming damage belong to the encounter system.
- Fast Hands exposes its Bonus Action alternatives. Lock, trap, pocket, object, and magic-item
  resolution remains assisted.
- Second-Story Work automates Climb Speed. Dexterity-based jump-distance resolution remains
  descriptive pending a general movement calculator.

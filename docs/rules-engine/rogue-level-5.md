# Rogue levels 5–7 vertical slice

The reviewed `rogue-5.json` fixture is a Human Soldier Thief Rogue. It wears Studded Leather Armor,
masters Daggers and Shortbows, has Expertise in Sleight of Hand and Stealth, and uses the full
level-5 Cunning Strike option set.

At level 6, the data-driven Expertise count increases from two to four. The level-up flow keeps the
existing choices locked, asks for two new proficient skills, and the evaluator doubles proficiency
for all four selections. Creation and same-class advancement now reach level 7 while preserving
those choices, possessions, and mutable play state; Sneak Attack increases to 4d6.

At level 7, Evasion uses the same content-driven incoming save-damage resolver as Monk. For an
eligible Dexterity save that normally halves damage, success deals zero and failure deals half,
rounded down. Effective Incapacitated disables the benefit, including that granted by Paralyzed,
Stunned, and Unconscious. The player still declares the incoming effect and save outcome.

Reliable Talent supplies a traced minimum d20 result of 10 on proficient/expert skill and tool
checks. The sheet's optional-minimum toggle lets the player decline the benefit; it resets to on
when loading or advancing a character. It does not affect unproficient skills, half-proficiency, bare ability checks, Initiative,
saving throws, attack rolls, or Passive Perception. The fullscreen and fallback rollers preserve
physical results, resolve Luck rerolls and advantage/disadvantage first, then apply the minimum
before adding modifiers and bonus dice once. The roll detail explains any treatment rather than
pretending another physical roll occurred. Skill/tool calculation traces cite page 63.

The sheet now lists fixed tool grants from class/background content, including Rogue Thieves’
Tools, Druid Herbalism Kit, and fixed background grants. Duplicate grants do not stack proficiency.
Each tool offers the six ability checks; the player uses the ability called for by the DM.
Exhaustion, ability-check roll effects, species rerolls, and compatible post-roll bonuses use the
shared check pipeline. Owning a tool is not required to display a proficiency, but actual tool use
and skill/tool overlap Advantage remain manually adjudicated.

Unresolved tool choices are not invented. Soldier Gaming Set, Monk artisan/instrument choices,
Bard instrument choices, and Skilled tool choices still need persisted choice workflows and the
complete tool catalog. These remain explicit limits rather than granting every possible tool.
Browser interaction verification of the new controls is outstanding.

The evaluator derives AC 16, two doubled-proficiency skills, a Cunning Strike save DC of 15,
3d6 Sneak Attack, Weapon Mastery, Cunning Action, Steady Aim, Uncanny Dodge, Fast Hands, and the
Thief’s 30-foot Climb Speed. Withdraw calculates its maximum 15-foot movement from the current
walking speed, and all calculated values retain source-linked traces.

The generated content retains every Rogue and Thief feature through level 20 as source-linked
structured text. Through level 7, these limits remain intentionally assisted:

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

# Human and Soldier origin evaluation

The engine treats origin inputs as persisted choices and derives their sheet effects from the
loaded content package.

## Persisted choices

For the supported Human Soldier slice, the build records:

- ability scores before background increases;
- the Soldier ability increases separately;
- Human and the selected Small or Medium size;
- Soldier;
- Savage Attacker and one additional Human Origin feat;
- one Human skill and any skill selections supplied by Skilled.

This separation makes the source of the final score reproducible. The evaluator validates that
Soldier increases only Strength, Dexterity, or Constitution and that the amounts match either
`+2/+1` or `+1/+1/+1`.

## Derived grants

Soldier automatically grants Athletics, Intimidation, and Savage Attacker. Human supplies a
30-foot walking speed, one selected skill, one selected Origin feat, and Resourceful. The fixture
selects Skilled as the Human feat and records three selected skill proficiencies.

Every derived numeric value has a trace. Walking Speed cites Human page 86, and the automatic
Athletics proficiency cites Soldier page 83. Savage Attacker is exposed as an available
once-per-turn roll-assisted option; actual weapon damage rolling remains a combat concern.

## Validation

The evaluator reports stable validation codes for:

- missing or mistyped origin entities;
- unsupported Soldier ability selections or increase patterns;
- final ability scores above 20;
- missing Soldier's granted feat;
- an invalid Human size;
- a missing or extra Human Origin feat;
- incorrect Human or Skilled skill-selection counts;
- unknown proficiency sources and duplicate skill grants.

Resourceful is part of the atomic Long Rest proposal. It sets Heroic Inspiration to true without
mutating the input and cites the Human source entity.

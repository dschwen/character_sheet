# Barbarian level 10: Retaliation

Source: pinned SRD 5.2.1, Barbarian table page 28 and Berserker page 30.

Creation and same-class advancement reach level 10: proficiency +4, four Rage uses,
Rage Damage +3, four Weapon Mastery choices, and two attacks with the Attack action.
Prior advancement history, equipment, and current/spent state are preserved.

Retaliation is a Reaction after taking damage from a creature within 5 feet: exactly
one melee weapon or Unarmed Strike attack against that creature. Rage, sight, an attack-roll
damage source, and being on your turn are not prerequisites. Intimidating Presence is level 14,
not level 10. Retaliation does not grant the Attack action or Extra Attack.

The shared strict reaction-attack metadata and pure resolver validate positive damage,
creature source, distance, Reaction availability, equipped attack eligibility, action availability,
and incapacitation/death. The source-linked receipt authorizes one attack without mutating HP,
resources, or conditions. Unsupported additional resource costs are rejected.

Play → Use a feature provides trigger declarations, an eligible attack selector, attack roll
options, hit confirmation, and normal/critical damage controls. A new trigger must be confirmed
before another attack. Existing fullscreen dice and attack-option resolution are reused.
Previously declared, still-active Reckless Attack can apply off-turn; Brutal Strike still requires
your own turn. Frenzy, mastery effects, and other situational triggers remain assisted.

Reaction availability/use, target identity, damage already taken, hit adjudication, turn boundaries,
and damage application are manual. No encounter tracker or target-sheet mutation is implied.
Independent semantic review and the full plan's level-20/browser gates remain outstanding.

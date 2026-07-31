# Rules coverage

The `srd-5.2.1` package currently contains structured Barbarian, Fighter, Wizard, Human, Soldier,
Origin Feat, Fighting Style, spell, weapon, and armor proof-of-concept content.

| Status | Count |
|---|---:|
| UNCLASSIFIED | 0 |
| TEXT_ONLY | 0 |
| STRUCTURED | 141 |
| EXECUTABLE | 0 |
| TESTED | 0 |
| VERIFIED | 0 |

The package contains the Barbarian, Fighter, and Wizard class progressions; their extracted class
features and scaling tables; Champion; Evoker; Human; Soldier; Savage Attacker; Skilled; Ability
Score Improvement; the Defense Fighting Style; the weapon and armor tables needed by the reviewed
fixtures; the complete 217-entry Wizard spell list; and 20 source-linked structured spell
descriptions. Rage, Unarmored Defense, the Fighter level 1–5 features, Champion level-3 features,
Defense, and Savage Attacker have schema-valid proposed rules with draft integration tests.
Wizard spellcasting is evaluated from structured class and spell fields. All entities remain
`STRUCTURED` until their semantics and tests are reviewed and approved.

# Rules coverage

The `srd-5.2.1` package currently contains structured Barbarian, Cleric, Fighter, Wizard, Human,
Soldier, Origin Feat, Fighting Style, spell, weapon, and armor proof-of-concept content.

| Status | Count |
|---|---:|
| UNCLASSIFIED | 0 |
| TEXT_ONLY | 0 |
| STRUCTURED | 179 |
| EXECUTABLE | 0 |
| TESTED | 0 |
| VERIFIED | 0 |

The package contains the Barbarian, Cleric, Fighter, and Wizard class progressions; their extracted
class features and scaling tables; Champion; Life Domain; Evoker; Human; Soldier; relevant feats;
the equipment tables needed by the reviewed fixtures; complete Cleric and Wizard spell lists; and
37 source-linked structured spell descriptions. Rage, Unarmored Defense, Fighter level 1–5,
Champion level-3 features, Channel Divinity, Preserve Life, Defense, and Savage Attacker have
schema-valid proposed rules with integration tests. Cleric and Wizard spellcasting are evaluated
from structured class, subclass, and spell fields. All entities remain `STRUCTURED` until their
semantics and tests are reviewed and approved.

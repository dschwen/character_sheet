# Cleric and Druid level 9

Creation and same-class advancement now support level 9 for Cleric and Druid.
Generated builder limits and skill-count metadata expose their existing source-driven
progression; no class-specific frontend calculation or selection branch was added.

The pinned SRD tables (Cleric page 36; Druid page 41) grant Proficiency Bonus +4,
four/three/three/three/one slots at spell levels 1–5, and fourteen ordinary prepared
spells. Channel Divinity and Wild Shape remain at three uses. Cleric retains four
table cantrips; Druid retains three, plus one if its Primal Order is Magician (page 42).
There is no new feat, battle-blessing choice, or ordinary class feature at level 9.

Life Domain (page 40) automatically prepares Greater Restoration and Mass Cure
Wounds, bringing its automatic total to ten. Circle of the Land (page 46) adds Wall
of Stone for arid land, Cone of Cold for polar, Tree Stride for temperate, or Insect
Plague for tropical. Automatic grants are shown in preparation controls but do not
consume ordinary selections. Both classes can prepare other eligible fifth-level
spells from their full lists without learning them in a spellbook.

Natural Recovery has a five-level recovery budget and can restore the new fifth-level
slot during a Short Rest. Its slot-recovery use is independent of its free Circle-spell
casting use; either is limited until a Long Rest. Casting a Circle spell freely spends
only the free-cast resource. Concentration begins for Wall of Stone, Tree Stride, and
Insect Plague; instantaneous Cone of Cold preserves existing Concentration.

Advancement preserves previous acquisitions, choices, feats, equipment, currency, HP,
temporary HP, and expended slots/resources. It does not refresh spent state. The new
fifth-level slot starts available. Exhausted and under-level casts fail atomically.

This slice provides progression, preparation, and casting-resource support. External
targets, costly spell components, and unmodeled spell effects still need manual
adjudication; it does not add full fifth-level effect automation or Wild Shape beast
stat blocks. Rest timing is declared by the player. Levels 10+, multiclass legality,
independent semantic review, and rendered browser verification remain unfinished.

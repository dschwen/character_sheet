# ADR 0013: Out-of-source edition-reference records

- Status: Accepted
- Date: 2026-10-31

## Decision

Some rules content exists only in books outside the pinned source (for example, the explicitly
authored Ritual Caster edition variants described here). This exception is not an enumeration of
SRD feats; see the [level-1–5 audit](../audits/level-1-5-feats-and-choices.md) for that inventory.
Such a record may carry an `edition-reference` source span instead of a pinned-source span: an
explicit edition and book, an optional reference URL, a note, and a quote hash of the record's own
stored rules text — and no page or blocks, because there is no pinned-source span to cite.

The record may live in its declared package, which lists every such record in a `referenceSources`
manifest section. Its entity review status is `AUTHORED`: it was authored from explicitly supplied
rules text, not extracted, and `extractionApproved` is false. Coverage reports attribute these
records separately from pinned-source entities; no tool may present them as SRD content, and they
make no claim of SRD provenance. Only rules text supplied explicitly and labeled by the project
owner may enter this way.

## Consequences

The "only the pinned source" property now applies to extracted content; edition-reference records
are a declared, labeled exception, not silent additions. Pinned spans keep their page and quote-hash
requirements unchanged, and review-ledger span verification applies only to pinned spans. A package
still pins exactly one source document hash (ADR 0003); each reference record describes its own
provenance. If out-of-SRD content ever needs its own lifecycle or license story, it moves to its
own package under ADR 0003 rather than growing silently inside the SRD package.

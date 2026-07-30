# ADR 0003: Pin versioned content and retain provenance

- Status: Accepted
- Date: 2026-07-29

## Decision

Rules packages are immutable, versioned, and pinned in every character document by ID, version, and
SHA-256. Extracted entities retain source spans and quote hashes. New SRD releases create new
packages and explicit migrations.

## Consequences

Existing characters do not silently change. Content generation and review tooling must preserve
source links and expose semantic changes.

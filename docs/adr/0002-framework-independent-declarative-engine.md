# ADR 0002: Use a framework-independent declarative engine

- Status: Accepted
- Date: 2026-07-29

## Decision

Implement the rules engine as strict TypeScript with no React, browser, database, or server
dependency. Content uses validated expressions, predicates, and typed effects; it cannot execute
JavaScript.

## Consequences

The same engine can run in browsers, Node.js, CLIs, and tests. The expression language must include
cycle detection, complexity bounds, type failures, and calculation traces.

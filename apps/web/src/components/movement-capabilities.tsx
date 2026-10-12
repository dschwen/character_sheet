"use client";

import type { MovementCapabilitySummary } from "@dnd/rules-api";

const surfaceNames = {
  "vertical-surfaces": "along vertical surfaces",
  liquids: "across liquids",
} as const;

export function MovementCapabilities({
  capabilities,
  onExplain,
}: Readonly<{
  capabilities: readonly MovementCapabilitySummary[];
  onExplain: (traceId: string) => void;
}>) {
  return (
    <div className="movement-capability-list">
      {capabilities.map((capability) => (
        <article
          key={`${capability.sourceId}:${capability.id}`}
          className="movement-capability"
          aria-label={capability.sourceName}
        >
          <h3>{capability.sourceName}</h3>
          <p>
            {capability.available ? "Available" : "Unavailable"}
            {capability.ownTurnOnly ? " · On your turn only" : ""}
          </p>
          <p>
            Movement {capability.surfaces.map((surface) => surfaceNames[surface]).join(" and ")}
            {capability.preventsFallingDuringMovement
              ? ", without falling during the movement"
              : ""}
            .
          </p>
          {capability.reasons.map((reason) => (
            <p className="builder-callout" key={reason}>
              {reason}
            </p>
          ))}
          <p>Uses your existing movement; turn timing and remaining movement are manual.</p>
          <div className="movement-capability-controls">
            <button
              type="button"
              className="button secondary compact"
              onClick={() => {
                onExplain(capability.speedTraceId);
              }}
            >
              Current Speed: {String(capability.walkingSpeed)} ft. · Explain
            </button>
            <button
              type="button"
              className="button secondary compact"
              onClick={() => {
                onExplain(capability.traceId);
              }}
            >
              Explain eligibility
            </button>
          </div>
          {capability.instructions.length === 0 ? null : (
            <details className="action-guidance">
              <summary>Movement limits and stopping points (manual)</summary>
              {capability.instructions.map((instruction) => (
                <p className="builder-callout" key={instruction}>
                  {instruction}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

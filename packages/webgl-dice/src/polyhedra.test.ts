import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

interface GeometryInspection {
  type: string;
  radius: number;
  faces: number;
  vertices: number;
  triangles: number;
  faceSizes: number[];
  inward: number;
  outside: number;
  unpairedEdges: number;
}

// Inspect the actual untyped vendored module in its own package, with its real Three dependency.
const inspections = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
  import { DICE_TYPES, getDieDefinition } from './src/polyhedra.js';
  const inspections = [];
  for (const radius of [0.5, 1, 2]) for (const type of DICE_TYPES) {
    const { geometry, faces, vertices } = getDieDefinition(type, radius);
    const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = mesh.getAttribute('position');
    const point = i => new vertices[0].constructor().fromBufferAttribute(position, i);
    const key = p => p.toArray().map(n => n.toFixed(5)).join(',');
    const edges = new Map();
    let inward = 0;
    let outside = 0;
    for (let i = 0; i < position.count; i += 3) {
      const a = point(i), b = point(i + 1), c = point(i + 2);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.dot(a) <= 0) inward++;
      if (vertices.some(v => normal.dot(v.clone().sub(a)) > 1e-5)) outside++;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const edge = [key(u), key(v)].sort().join('|');
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    inspections.push({ type, radius, faces: faces.length, vertices: vertices.length,
      triangles: position.count / 3, faceSizes: faces.map(f => f.vertices.length),
      inward, outside, unpairedEdges: [...edges.values()].filter(count => count !== 2).length });
    if (mesh !== geometry) mesh.dispose();
    geometry.dispose();
  }
  console.log(JSON.stringify(inspections));
`,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  ),
) as GeometryInspection[];

describe("vendored dice collision geometry", () => {
  it.each(inspections)(
    "$type at radius $radius is closed, convex and outward-wound",
    (inspection) => {
      expect(inspection.faces).toBe(Number(inspection.type.slice(1)));
      expect(inspection.inward).toBe(0);
      expect(inspection.outside).toBe(0);
      expect(inspection.unpairedEdges).toBe(0);
      if (inspection.type === "d10") {
        expect(inspection.vertices).toBe(12);
        expect(inspection.triangles).toBe(20);
        expect(inspection.faceSizes).toEqual(Array.from({ length: 10 }, () => 4));
      }
    },
  );
});

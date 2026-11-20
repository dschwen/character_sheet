import * as THREE from 'three';

const phi = (1 + Math.sqrt(5)) / 2;

function normalizeVertices(vertices, radius = 1) {
  return vertices.map(v => new THREE.Vector3(...v).normalize().multiplyScalar(radius));
}

function geometryFaces(geometry) {
  const pos = geometry.getAttribute('position');
  const indexed = geometry.index;
  const faces = [];
  if (indexed) {
    for (let i = 0; i < indexed.count; i += 3) {
      faces.push([indexed.getX(i), indexed.getX(i + 1), indexed.getX(i + 2)]);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) faces.push([i, i + 1, i + 2]);
  }
  return faces;
}

function mergeCoplanarTriangles(geometry, epsilon = 1e-4) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = nonIndexed.getAttribute('position');
  const groups = [];

  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const normal = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a)
    ).normalize();
    const center = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(center) < 0) normal.negate();
    const planeD = normal.dot(a);

    let g = groups.find(x => x.normal.dot(normal) > 1 - epsilon && Math.abs(x.planeD - planeD) < epsilon);
    if (!g) {
      g = { normal: normal.clone(), planeD, verts: [] };
      groups.push(g);
    }
    g.verts.push(a, b, c);
  }

  return groups.map(g => {
    const uniq = [];
    for (const v of g.verts) {
      if (!uniq.some(u => u.distanceToSquared(v) < epsilon * epsilon)) uniq.push(v.clone());
    }
    const center = uniq.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / uniq.length);
    return { normal: g.normal, center, vertices: uniq };
  });
}

function makeGeometry(type, radius = 1) {
  switch (type) {
    case 'd4': return new THREE.TetrahedronGeometry(radius, 0);
    case 'd6': return new THREE.BoxGeometry(radius * 1.45, radius * 1.45, radius * 1.45);
    case 'd8': return new THREE.OctahedronGeometry(radius, 0);
    case 'd12': return new THREE.DodecahedronGeometry(radius, 0);
    case 'd20': return new THREE.IcosahedronGeometry(radius, 0);
    case 'd10': return makeD10Geometry(radius);
    default: throw new Error(`Unknown die type: ${type}`);
  }
}

function makeD10Geometry(radius = 1) {
  // Pentagonal trapezohedron: 2 poles + alternating upper/lower rings.
  const vertices = [[0, radius * 1.08, 0], [0, -radius * 1.08, 0]];
  const ringR = radius * 0.95;
  // Keep each pole and its three ring vertices coplanar, making ten true kite faces.
  const halfStepCos = Math.cos(Math.PI / 5);
  const y = radius * 1.08 * (1 - halfStepCos) / (1 + halfStepCos);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    vertices.push([ringR * Math.cos(a), i % 2 === 0 ? y : -y, ringR * Math.sin(a)]);
  }
  const faces = [];
  for (let i = 0; i < 10; i++) {
    const cur = 2 + i;
    const next = 2 + ((i + 1) % 10);
    const end = 2 + ((i + 2) % 10);
    const pole = i % 2 === 0 ? 0 : 1;
    faces.push([pole, cur, next], [pole, next, end]);
  }
  const positions = [];
  for (const [ai, bi, ci] of faces) {
    const a = new THREE.Vector3(...vertices[ai]);
    const b = new THREE.Vector3(...vertices[bi]);
    const c = new THREE.Vector3(...vertices[ci]);
    const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    // Cannon and the visible mesh both require outward (counterclockwise) winding.
    const face = normal.dot(a) > 0 ? [ai, bi, ci] : [ai, ci, bi];
    for (const idx of face) positions.push(...vertices[idx]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

export function defaultLabels(type) {
  return Array.from({ length: Number(type.slice(1)) }, (_, i) => String(i + 1));
}

function uniqueVertices(geometry, epsilon = 1e-5) {
  const pos = geometry.getAttribute('position');
  const vertices = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (!vertices.some(u => u.distanceToSquared(v) < epsilon * epsilon)) vertices.push(v);
  }
  return vertices;
}

export function getDieDefinition(type, radius = 1) {
  const geometry = makeGeometry(type, radius);
  const faces = mergeCoplanarTriangles(geometry);
  const vertices = uniqueVertices(geometry);
  return { geometry, faces, vertices };
}

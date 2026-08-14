import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getDieDefinition, defaultLabels, DICE_TYPES } from './polyhedra.js';

function makeLabelMaps(text, opts = {}) {
  const size = opts.textureSize ?? 256;
  const visible = document.createElement('canvas');
  const height = document.createElement('canvas');
  visible.width = visible.height = size;
  height.width = height.height = size;

  const vctx = visible.getContext('2d');
  const hctx = height.getContext('2d');
  const x = size / 2;
  const y = size / 2;
  const font = opts.font ?? `700 ${Math.floor(size * 0.45)}px system-ui, sans-serif`;
  const labelColor = opts.labelColor ?? '#171717';
  const bevel = opts.embossBevel ?? Math.max(2, Math.round(size * 0.018));

  for (const ctx of [vctx, hctx]) {
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.lineJoin = 'round';
  }

  // Visible glyph. Lighting comes from MeshStandardMaterial; there are no
  // painted highlight/shadow offsets in this texture.
  vctx.fillStyle = labelColor;
  vctx.fillText(String(text), x, y);

  // Build a smooth grayscale height field. A blurred copy creates the bevel
  // ramp and a sharp glyph core creates a flatter plateau/floor. Three.js
  // converts the gradients in this map into perturbed fragment normals.
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, size, size);
  hctx.save();
  hctx.filter = `blur(${bevel}px)`;
  hctx.fillStyle = '#b0b0b0';
  hctx.fillText(String(text), x, y);
  hctx.restore();
  hctx.fillStyle = '#fff';
  hctx.fillText(String(text), x, y);

  const colorMap = new THREE.CanvasTexture(visible);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = opts.anisotropy ?? 4;
  colorMap.needsUpdate = true;

  const heightMap = new THREE.CanvasTexture(height);
  heightMap.colorSpace = THREE.NoColorSpace;
  heightMap.anisotropy = opts.anisotropy ?? 4;
  heightMap.needsUpdate = true;

  return { colorMap, heightMap };
}
function orientedLabelPlane(text, position, normal, radius, opts, scaleMultiplier = 1) {
  const { colorMap, heightMap } = makeLabelMaps(text, opts);
  const emboss = opts.emboss ?? 'recessed'; // false | 'recessed' | 'raised'
  const strength = opts.embossStrength ?? opts.embossDepth ?? 0.16;
  const bumpScale = emboss === false ? 0 : (emboss === 'raised' ? strength : -strength);
  const mat = new THREE.MeshStandardMaterial({
    map: colorMap,
    alphaMap: colorMap,
    bumpMap: emboss === false ? null : heightMap,
    bumpScale,
    transparent: true,
    alphaTest: opts.labelAlphaTest ?? 0.03,
    depthWrite: false,
    roughness: opts.labelRoughness ?? opts.roughness ?? 0.5,
    metalness: opts.labelMetalness ?? opts.metalness ?? 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const scale = radius * (opts.labelScale ?? 0.48) * scaleMultiplier;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), mat);
  const n = normal.clone().normalize();
  plane.position.copy(position).addScaledVector(n, radius * (opts.labelLift ?? 0.012));
  plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return plane;
}

function faceOverlay(face, text, radius, opts) {
  return orientedLabelPlane(text, face.center, face.normal, radius, opts);
}

function d4VertexOverlays(vertices, faces, labels, radius, opts) {
  const overlays = [];
  const epsilon2 = 1e-8;
  const inset = opts.d4VertexInset ?? 0.34; // 0 = at vertex, 1 = at face center
  const scale = opts.d4LabelScale ?? 0.52;

  vertices.forEach((vertex, vertexIndex) => {
    for (const face of faces) {
      const touchesVertex = face.vertices.some(v => v.distanceToSquared(vertex) < epsilon2);
      if (!touchesVertex) continue;

      // Place the glyph inside the triangular face, close to the vertex it
      // identifies. Repeating it on all 3 adjacent faces is the standard d4
      // layout and keeps the result readable from around the die.
      const position = vertex.clone().lerp(face.center, inset);
      overlays.push(orientedLabelPlane(
        labels[vertexIndex],
        position,
        face.normal,
        radius,
        { ...opts, labelScale: scale },
        1
      ));
    }
  });
  return overlays;
}

function convexFromGeometry(geometry) {
  const g = geometry.toNonIndexed();
  const pos = g.getAttribute('position');
  const vertices = [];
  const faces = [];
  const map = new Map();
  const key = v => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;

  const idxFor = v => {
    const k = key(v);
    if (!map.has(k)) {
      map.set(k, vertices.length);
      vertices.push(new CANNON.Vec3(v.x, v.y, v.z));
    }
    return map.get(k);
  };

  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    faces.push([idxFor(a), idxFor(b), idxFor(c)]);
  }
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

export class DiceRoller {
  constructor({
    container,
    width,
    height,
    background = 0xf3f4f6,
    gravity = -24,
    fullscreen = false,
    transparent = false,
    pointerEvents = false,
    zIndex = 9999,
    viewportWorldHeight = 12,
    floorY = 0,
    showFloor
  } = {}) {
    this.fullscreen = fullscreen;
    this.transparent = transparent || fullscreen;
    this.pointerEvents = pointerEvents;
    this.viewportWorldHeight = viewportWorldHeight;
    this.floorY = floorY;
    this.container = container ?? (fullscreen ? document.body : null);
    if (!this.container) throw new Error('DiceRoller requires a container element unless fullscreen: true');

    this.scene = new THREE.Scene();
    if (!this.transparent) this.scene.background = new THREE.Color(background);

    if (fullscreen) {
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      this.camera.position.set(0, 20, 0);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      this.camera.position.set(0, 7.5, 9);
      this.camera.lookAt(0, 0, 0);
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: this.transparent });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    if (this.transparent) this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;

    if (fullscreen) {
      Object.assign(this.canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        pointerEvents: pointerEvents ? 'auto' : 'none',
        zIndex: String(zIndex)
      });
      document.body.appendChild(this.canvas);
    } else {
      this.container.appendChild(this.canvas);
    }

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, gravity, 0) });
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.35;
    this.world.defaultContactMaterial.restitution = 0.38;

    this.dice = [];
    this._last = performance.now();
    this._trayBodies = [];
    this._disposed = false;

    const ambient = new THREE.HemisphereLight(0xffffff, 0x505050, 2.0);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(5, 10, 4);
    this.scene.add(key);

    const shouldShowFloor = showFloor ?? !fullscreen;
    if (shouldShowFloor) {
      this.floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0xd8dadd, roughness: 0.9 })
      );
      this.floorMesh.rotation.x = -Math.PI / 2;
      this.floorMesh.position.y = fullscreen ? floorY : -2.3;
      this.scene.add(this.floorMesh);
    }

    this._floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    this._floorBody.position.y = fullscreen ? floorY : -2.3;
    this._floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this._floorBody);

    this.resize(width, height);
    if (fullscreen) {
      this._onWindowResize = () => this.resize();
      window.addEventListener('resize', this._onWindowResize, { passive: true });
    } else {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.container);
    }

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  resize(width, height) {
    if (this.fullscreen) {
      width ??= window.innerWidth;
      height ??= window.innerHeight;
    } else {
      width ??= this.container.clientWidth || 640;
      height ??= this.container.clientHeight || 420;
    }

    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);

    if (this.fullscreen) {
      const halfH = this.viewportWorldHeight / 2;
      const halfW = halfH * (width / height);
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();
      this.viewportBounds = { halfWidth: halfW, halfHeight: halfH };
      this._rebuildViewportWalls();
    } else {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  _rebuildViewportWalls() {
    if (!this.fullscreen || !this.viewportBounds) return;
    for (const body of this._trayBodies) this.world.removeBody(body);
    this._trayBodies.length = 0;

    const { halfWidth: hw, halfHeight: hh } = this.viewportBounds;
    const wallThickness = 0.25;
    const wallHeight = 8;
    const y = this.floorY + wallHeight / 2;

    const addWall = (x, z, sx, sz) => {
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(sx / 2, wallHeight / 2, sz / 2))
      });
      body.position.set(x, y, z);
      this.world.addBody(body);
      this._trayBodies.push(body);
    };

    addWall(-hw - wallThickness / 2, 0, wallThickness, hh * 2 + wallThickness * 2);
    addWall( hw + wallThickness / 2, 0, wallThickness, hh * 2 + wallThickness * 2);
    addWall(0, -hh - wallThickness / 2, hw * 2 + wallThickness * 2, wallThickness);
    addWall(0,  hh + wallThickness / 2, hw * 2 + wallThickness * 2, wallThickness);
  }

  addDie(type, options = {}) {
    if (!DICE_TYPES.includes(type)) throw new Error(`Unsupported die type: ${type}`);
    const radius = options.radius ?? 1;
    const { geometry, faces, vertices } = getDieDefinition(type, radius);
    const expected = Number(type.slice(1));
    const labels = options.labels ?? defaultLabels(type);
    if (labels.length !== expected) throw new Error(`${type} requires exactly ${expected} labels`);

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: options.color ?? 0xffffff,
        roughness: options.roughness ?? 0.5,
        metalness: options.metalness ?? 0.0,
        flatShading: true
      })
    );
    group.add(mesh);

    if (type === 'd4') {
      d4VertexOverlays(vertices, faces, labels, radius, options).forEach(label => group.add(label));
    } else {
      faces.slice(0, labels.length).forEach((face, i) => {
        group.add(faceOverlay(face, labels[i], radius, options));
      });
    }

    const shape = convexFromGeometry(geometry);
    const body = new CANNON.Body({ mass: options.mass ?? 1, shape });
    body.linearDamping = options.linearDamping ?? 0.12;
    body.angularDamping = options.angularDamping ?? 0.12;
    body.allowSleep = true;
    body.sleepSpeedLimit = options.sleepSpeedLimit ?? 0.12;
    body.sleepTimeLimit = options.sleepTimeLimit ?? 0.45;

    const defaultY = this.fullscreen ? this.floorY + radius * 2.5 : 2;
    const position = options.position ?? [0, defaultY, 0];
    body.position.set(...position);
    this.world.addBody(body);
    this.scene.add(group);

    const die = { type, labels, radius, group, body, faces, vertices, options };
    this.dice.push(die);
    return die;
  }

  removeDie(die) {
    this.world.removeBody(die.body);
    this.scene.remove(die.group);
    die.group.traverse(obj => {
      if (obj.material?.map) obj.material.map.dispose();
      if (obj.material?.bumpMap && obj.material.bumpMap !== obj.material.map) obj.material.bumpMap.dispose();
      obj.material?.dispose?.();
      if (obj.geometry && obj !== die.group.children[0]) obj.geometry.dispose?.();
    });
    this.dice = this.dice.filter(d => d !== die);
  }

  clear() {
    [...this.dice].forEach(d => this.removeDie(d));
  }

  roll(die = null, options = {}) {
    const targets = die ? [die] : this.dice;
    for (const [i, d] of targets.entries()) {
      d.body.wakeUp();
      const baseY = this.fullscreen ? this.floorY : -2.3;
      d.body.position.set(
        (i - (targets.length - 1) / 2) * Math.min(1.8, d.radius * 2.2),
        baseY + (options.height ?? 4.5),
        (Math.random() - 0.5) * 1.8
      );
      d.body.velocity.set((Math.random() - 0.5) * 5, -0.5, (Math.random() - 0.5) * 5);
      d.body.angularVelocity.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18
      );
      d.body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    }
    return targets;
  }

  _pointForOrigin(origin, radius = 1, margin = 0.35) {
    if (!this.fullscreen) return new THREE.Vector3(0, 0, 0);
    const { halfWidth: hw, halfHeight: hh } = this.viewportBounds;
    const mx = Math.min(hw * 0.45, radius + margin);
    const mz = Math.min(hh * 0.45, radius + margin);
    const points = {
      center: [0, 0],
      left: [-hw + mx, 0],
      right: [hw - mx, 0],
      top: [0, -hh + mz],
      bottom: [0, hh - mz],
      'top-left': [-hw + mx, -hh + mz],
      'top-right': [hw - mx, -hh + mz],
      'bottom-left': [-hw + mx, hh - mz],
      'bottom-right': [hw - mx, hh - mz]
    };
    const p = points[origin] ?? points['bottom-left'];
    return new THREE.Vector3(p[0], 0, p[1]);
  }

  /**
   * Throw existing dice, die descriptors, or both across a fullscreen tray.
   * Descriptors have the form { type: 'd20', ...addDieOptions }.
   */
  throwDice(diceOrSpecs = this.dice, options = {}) {
    if (!this.fullscreen) {
      throw new Error('throwDice() requires DiceRoller({ fullscreen: true })');
    }

    const items = Array.isArray(diceOrSpecs) ? diceOrSpecs : [diceOrSpecs];
    const targets = items.map(item => {
      if (item?.body && item?.group) return item;
      if (typeof item === 'string') return this.addDie(item, options.dieOptions ?? {});
      if (item?.type) {
        const { type, ...dieOptions } = item;
        return this.addDie(type, dieOptions);
      }
      throw new Error('throwDice() expects die objects, die type strings, or { type, ...options } descriptors');
    });

    const from = options.from ?? 'bottom-left';
    const toward = options.toward ?? 'center';
    const speed = options.velocity ?? options.speed ?? 10;
    const lift = options.lift ?? 4.5;
    const spin = options.spin ?? 20;
    const spread = options.spread ?? 0.8;
    const spacing = options.spacing ?? 0.65;

    targets.forEach((d, i) => {
      const start = this._pointForOrigin(from, d.radius, options.margin ?? 0.35);
      const target = this._pointForOrigin(toward, d.radius, options.margin ?? 0.35);
      const dir = target.clone().sub(start);
      if (dir.lengthSq() < 1e-8) dir.set(1, 0, -1);
      dir.normalize();

      const tangent = new THREE.Vector3(-dir.z, 0, dir.x);
      const lane = (i - (targets.length - 1) / 2) * spacing * d.radius;
      start.addScaledVector(tangent, lane);
      dir.addScaledVector(tangent, (Math.random() - 0.5) * spread).normalize();

      d.body.wakeUp();
      d.body.position.set(start.x, this.floorY + (options.height ?? Math.max(2.6, d.radius * 3.2)), start.z);
      d.body.velocity.set(
        dir.x * speed,
        lift + (Math.random() - 0.5) * 1.2,
        dir.z * speed
      );
      d.body.angularVelocity.set(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin
      );
      d.body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    });

    return targets;
  }

  async throwAndWait(diceOrSpecs = this.dice, options = {}) {
    const targets = this.throwDice(diceOrSpecs, options);
    await this._waitForSettled(targets, options.timeout ?? 7000);
    return targets.map(d => this.getValue(d));
  }

  getValue(die) {
    const q = new THREE.Quaternion(
      die.body.quaternion.x,
      die.body.quaternion.y,
      die.body.quaternion.z,
      die.body.quaternion.w
    );

    if (die.type === 'd4') {
      let best = -Infinity;
      let bestIndex = 0;
      die.vertices.forEach((vertex, i) => {
        const worldVertex = vertex.clone().applyQuaternion(q);
        if (worldVertex.y > best) {
          best = worldVertex.y;
          bestIndex = i;
        }
      });
      return die.labels[bestIndex];
    }

    let best = -Infinity;
    let bestIndex = 0;
    die.faces.forEach((face, i) => {
      const worldNormal = face.normal.clone().applyQuaternion(q);
      if (worldNormal.y > best) {
        best = worldNormal.y;
        bestIndex = i;
      }
    });
    return die.labels[bestIndex];
  }

  async _waitForSettled(targets, timeout) {
    const start = performance.now();
    await new Promise(resolve => {
      const poll = () => {
        const asleep = targets.every(d => d.body.sleepState === CANNON.Body.SLEEPING || (
          d.body.velocity.lengthSquared() < 0.02 && d.body.angularVelocity.lengthSquared() < 0.02
        ));
        if (asleep || performance.now() - start > timeout) resolve();
        else requestAnimationFrame(poll);
      };
      poll();
    });
  }

  async rollAndWait(die = null, options = {}) {
    const targets = this.roll(die, options);
    await this._waitForSettled(targets, options.timeout ?? 5000);
    return targets.map(d => this.getValue(d));
  }

  _animate(now) {
    if (this._disposed) return;
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    this.world.step(1 / 60, dt, 4);
    for (const d of this.dice) {
      d.group.position.copy(d.body.position);
      d.group.quaternion.copy(d.body.quaternion);
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  }

  dispose() {
    this._disposed = true;
    this._resizeObserver?.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    this.clear();
    for (const body of this._trayBodies) this.world.removeBody(body);
    this._trayBodies.length = 0;
    this.world.removeBody(this._floorBody);
    this.floorMesh?.geometry.dispose();
    this.floorMesh?.material.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

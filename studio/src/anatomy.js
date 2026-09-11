import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STRUCTURE_DEFINITIONS, structureForMesh } from './anatomy-details.js';

/**
 * Original Vocal_01.glb viewer. The file contains authored shape states nested
 * beneath the *_Orig meshes, alongside *_Static geometry. We interpolate states
 * whose vertex count AND complete triangle indices match their original.
 * Audio values are artist-calibrated visual controls, not measurements of muscle
 * activity. No made-up deformation is added to meshes without a compatible state.
 */
export const LAYER_COLORS = Object.freeze({
  nas: '#b995ff', oro: '#f2c46e', aes: '#54d8d1', src: '#f18bc8',
});
const IDS = Object.keys(LAYER_COLORS);
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(+n) ? +n : 0));
const normalizedName = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ');

export function layerForName(name) {
  const n = normalizedName(name);
  if (/nasopharynx|nasal|veli palatini|superior pharyngeal/.test(n)) return 'nas';
  if (/oropharynx|middle pharyngeal|palatopharyngeus|stylopharyngeus/.test(n)) return 'oro';
  if (/laryngopharynx|thyropharyngeal|thyroepiglottic|epiglottic|vestibular/.test(n)) return 'aes';
  return 'src';
}

export function sameTopology(base, target) {
  if (!base?.attributes?.position || !target?.attributes?.position) return false;
  if (base.attributes.position.count !== target.attributes.position.count) return false;
  const a = base.index, b = target.index;
  if (!!a !== !!b) return false;
  if (!a) return true;
  if (a.count !== b.count) return false;
  for (let i = 0; i < a.count; i++) if (a.getX(i) !== b.getX(i)) return false;
  return true;
}

function disposeTree(root) {
  const geometries = new Set(), materials = new Set();
  root?.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) if (mat) materials.add(mat);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function splitGeometry(source, boundary) {
  // Only the supplied combined naso/oropharyngeal mucosa needs a display split.
  // Boundary is a documented UI partition, not a newly inferred anatomical border.
  const buckets = { nas: [], oro: [] }, p = source.attributes.position;
  const count = source.index ? source.index.count : p.count;
  const at = (i) => source.index ? source.index.getX(i) : i;
  for (let i = 0; i < count; i += 3) {
    const indices = [at(i), at(i + 1), at(i + 2)];
    const y = indices.reduce((sum, j) => sum + p.getY(j), 0) / 3;
    buckets[y >= boundary ? 'nas' : 'oro'].push(...indices);
  }
  return Object.entries(buckets).filter(([, indices]) => indices.length).map(([layer, indices]) => {
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) {
      const attr = source.attributes[name];
      if (!attr) continue;
      const values = new Float32Array(indices.length * 3);
      indices.forEach((i, j) => {
        values[j * 3] = attr.getX(i); values[j * 3 + 1] = attr.getY(i); values[j * 3 + 2] = attr.getZ(i);
      });
      geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    for (const name of ['position', 'normal']) {
      const sources = source.morphAttributes[name] || [];
      geometry.morphAttributes[name] = sources.map((attr) => {
        const values = new Float32Array(indices.length * 3);
        indices.forEach((i, j) => {
          values[j * 3] = attr.getX(i); values[j * 3 + 1] = attr.getY(i); values[j * 3 + 2] = attr.getZ(i);
        });
        const result = new THREE.BufferAttribute(values, 3); result.name = attr.name; return result;
      });
    }
    geometry.computeBoundingSphere();
    return { layer, geometry };
  });
}

export class AnatomyView {
  constructor(container, { onReady, onError, onSelect } = {}) {
    this.container = container;
    this.callbacks = { onReady, onError, onSelect };
    this.disposed = false;
    this.generation = 0;
    this.meshes = [];
    this.hiddenStructures = new Set(); // View-only state; never changes member calibration or geometry.
    this.levels = Object.fromEntries(IDS.map((id) => [id, 0]));
    this.targetLevels = { ...this.levels };
    this.selected = null;
    this.selectedStructure = null;
    this.focusTransition = null;
    this.opacity = .72;
    this.exploded = false;
    this.explodeAmount = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute('aria-label', '마우스로 회전하고 확대할 수 있는 발성기관 3D 모형');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.minDistance = 1.65;
    this.controls.maxDistance = 15;
    this.controls.maxPolarAngle = Math.PI * .92;
    this.controls.minPolarAngle = Math.PI * .08;
    this.controls.target.set(0, 0, 0);
    // Violet/cyan edge lighting keeps the anatomical surface sculptural on the
    // dark stage. Fresnel rim light adds a silhouette without a bloom blur pass.
    this.scene.add(new THREE.HemisphereLight(0xd9cbff, 0x160d31, 1.05));
    const light = (color, intensity, x, y, z) => {
      const l = new THREE.DirectionalLight(color, intensity); l.position.set(x, y, z); this.scene.add(l);
    };
    light(0xe7e9ff, 3.1, 4, 6, 7);
    light(0x9e6cff, 1.65, -5, 1, 3);
    light(0x6deee8, 2.8, -4, 2, -5);
    light(0xff8cdc, 1.8, 4, 0, -3);
    this.createStage();
    this.onOrbitStart = () => { this.focusTransition = null; };
    this.controls.addEventListener('start', this.onOrbitStart);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerStart = null;
    this.onPointerDown = (event) => { this.pointerStart = [event.clientX, event.clientY]; };
    this.onPointerUp = (event) => this.pick(event);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.setView('iso');
    this.resize();
    this.lastFrame = performance.now();
    this.frame = this.frame.bind(this);
    this.frameId = requestAnimationFrame(this.frame);
  }

  createStage() {
    const stage = new THREE.Group();
    stage.position.y = -2.56;
    const glow = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color('#7845ff') }, intensity: { value: .36 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform vec3 color; uniform float intensity; void main(){float r=length(vUv-.5);float glow=pow(1.0-smoothstep(0.03,.5,r),2.4);gl_FragColor=vec4(color,glow*intensity);}',
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), glow);
    floor.rotation.x = -Math.PI / 2;
    stage.add(floor);
    for (const [radius, thickness, color, opacity] of [[1.57, .008, '#a975ff', .52], [1.67, .0035, '#54d8d1', .2], [1.9, .003, '#9974eb', .17]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 128), new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .015;
      stage.add(ring);
    }
    const tickPositions = [];
    for (let i = 0; i < 48; i++) {
      const angle = i / 48 * Math.PI * 2, length = i % 4 === 0 ? .085 : .035;
      tickPositions.push(Math.cos(angle) * 1.77, .02, Math.sin(angle) * 1.77, Math.cos(angle) * (1.77 + length), .02, Math.sin(angle) * (1.77 + length));
    }
    const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3)), new THREE.LineBasicMaterial({ color: '#b38cf4', transparent: true, opacity: .3, depthWrite: false }));
    stage.add(ticks);
    this.stage = stage; this.stageGlow = glow;
    this.scene.add(stage);
  }

  async load(url) {
    const generation = ++this.generation;
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (this.disposed || generation !== this.generation) { disposeTree(gltf.scene); return; }
      gltf.scene.updateMatrixWorld(true);
      const originalMeshes = [];
      gltf.scene.traverse((o) => { if (o.isMesh && /_(Orig|Static)$/i.test(o.name)) originalMeshes.push(o); });
      if (!originalMeshes.length) throw new Error('GLB 안에 표시할 메시가 없습니다.');
      // setFromObject(scene) includes the hidden authored states with different
      // export transforms. Bounds must come from baseline geometry alone.
      const box = new THREE.Box3();
      for (const original of originalMeshes) {
        box.union(new THREE.Box3().setFromBufferAttribute(original.geometry.attributes.position).applyMatrix4(original.matrixWorld));
      }
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const scale = 4.6 / Math.max(size.x, size.y, size.z);
      const normalize = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
      const root = new THREE.Group();
      const items = [], rejected = [], accepted = [];
      const nodes = gltf.parser.json.nodes || [];
      const temporary = new Set();
      for (const original of originalMeshes) {
        const bakedMatrix = normalize.clone().multiply(original.matrixWorld);
        const geometry = original.geometry.clone().applyMatrix4(bakedMatrix);
        const base = original.name.replace(/_Orig$/i, '');
        const targets = [];
        if (/_Orig$/i.test(original.name)) {
          const candidates = nodes.filter((node) => node.mesh !== undefined && node.name?.startsWith(base) && /^_?\d+$/.test(node.name.slice(base.length)));
          for (const candidate of candidates) {
            const state = await gltf.parser.getDependency('mesh', candidate.mesh);
            const stateMesh = state.isMesh ? state : state.children.find((child) => child.isMesh);
            if (!stateMesh || !sameTopology(original.geometry, stateMesh.geometry)) {
              rejected.push({ original: original.name, state: candidate.name, reason: 'Different vertex/index topology; not morphed' });
              continue;
            }
            // State node transforms in this export differ by 100x / 90 degrees.
            // Vertex data uses the original's local coordinate frame. Bake with
            // ORIGINAL matrix, not the state node's display transform.
            const target = stateMesh.geometry.clone().applyMatrix4(bakedMatrix);
            temporary.add(target);
            targets.push({ geometry: target, name: candidate.name });
            accepted.push({ original: original.name, state: candidate.name });
          }
        }
        // First compatible authored state per structure; the shared naso/oro
        // membrane has two states with independently localized deformations.
        const combined = /MuscosaOfNasopharynxAndOropharynx/i.test(original.name);
        const usedTargets = combined ? targets : targets.slice(0, 1);
        geometry.morphAttributes.position = usedTargets.map((target) => {
          const attr = target.geometry.attributes.position.clone(); attr.name = target.name; return attr;
        });
        geometry.morphAttributes.normal = usedTargets.map((target) => {
          const attr = target.geometry.attributes.normal.clone(); attr.name = target.name; return attr;
        });
        geometry.morphTargetsRelative = false;
        const boundary = new THREE.Vector3(0, 0, -15.5).applyMatrix4(bakedMatrix).y;
        const pieces = combined ? splitGeometry(geometry, boundary) : [{ geometry, layer: layerForName(original.name) }];
        if (combined) geometry.dispose();
        for (const piece of pieces) {
          const shell = /muscosa|nasalcavity|cartilage/i.test(original.name);
          const color = new THREE.Color(LAYER_COLORS[piece.layer]);
          const bone = /cartilage/i.test(original.name);
          const material = new THREE.MeshStandardMaterial({
            color: color.clone().lerp(new THREE.Color('#e8e1ff'), bone ? .21 : .035),
            roughness: bone ? .36 : .45, metalness: .075,
            emissive: color, emissiveIntensity: .055,
            side: THREE.DoubleSide, transparent: true, opacity: shell ? .57 : .98,
            depthWrite: !shell,
          });
          const rimIntensity = { value: .2 };
          material.userData.rimIntensity = rimIntensity;
          material.onBeforeCompile = (shader) => {
            shader.uniforms.tvRimColor = { value: color };
            shader.uniforms.tvRimIntensity = rimIntensity;
            shader.fragmentShader = 'uniform vec3 tvRimColor; uniform float tvRimIntensity;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat tvFacing=clamp(dot(normal,normalize(vViewPosition)),0.0,1.0);\ntotalEmissiveRadiance+=tvRimColor*pow(1.0-tvFacing,2.6)*tvRimIntensity;');
          };
          material.customProgramCacheKey = () => 'touchingvoice-sculptural-rim-v1';
          // The curved nasal wall overlaps its own front/back surfaces. Draw its
          // back faces before front faces so GLB triangle order cannot create
          // translucent vertical bands. Other structures retain their single pass.
          material.forceSinglePass = !/LateralWallOfNasalCavity/i.test(original.name);
          const mesh = new THREE.Mesh(piece.geometry, material);
          mesh.name = `${original.name}${combined ? `_${piece.layer}` : ''}`;
          mesh.userData.layer = piece.layer;
          mesh.userData.structureId = structureForMesh(original.name, piece.layer)?.id || null;
          mesh.frustumCulled = false;
          mesh.renderOrder = shell ? 2 : 1;
          const targetIndex = combined && piece.layer === 'oro' ? usedTargets.findIndex((target) => /2$/.test(target.name)) : 0;
          mesh.userData.anatomy = { shell, bone, color, targetIndex: Math.max(0, targetIndex), originalName: original.name, sharedMembrane: combined };
          root.add(mesh); items.push(mesh);
        }
      }
      for (const geometry of temporary) geometry.dispose();
      disposeTree(gltf.scene);
      if (this.disposed || generation !== this.generation) { disposeTree(root); return; }
      if (this.model) { this.scene.remove(this.model); disposeTree(this.model); }
      this.model = root; this.meshes = items; this.scene.add(root);
      this._applyStructureVisibility();
      this.metadata = {
        meshCount: gltf.parser.json.meshes?.length || originalMeshes.length,
        sceneMeshes: originalMeshes.length,
        renderedMeshes: items.length,
        morphPairs: items.filter((mesh) => mesh.morphTargetInfluences?.length).length,
        compatibleStates: accepted.length,
        layers: Object.fromEntries(IDS.map((id) => [id, items.filter((mesh) => mesh.userData.layer === id).length])),
        meshMapping: items.map((mesh) => ({
          name: mesh.name,
          layer: mesh.userData.layer,
          structureId: mesh.userData.structureId,
          response: mesh.morphTargetInfluences?.length ? 'authored-state morph' : 'color highlight only',
          state: mesh.geometry.morphAttributes.position?.[mesh.userData.anatomy.targetIndex]?.name || null,
        })),
        excludedStates: rejected,
        mapping: 'Artist-calibrated visual response; authored shape interpolation, not direct physiological measurement',
        regionSplit: 'Combined naso/oropharynx display partition at original local Z = -15.5',
      };
      this.callbacks.onReady?.(this.metadata);
      return this.metadata;
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.callbacks.onError?.(error);
      throw error;
    }
  }

  setLevels(levels = {}) {
    for (const id of IDS) this.targetLevels[id] = clamp(levels[id] ?? this.targetLevels[id]);
  }

  selectLayer(id = null) {
    const wasFocused = !!this.selectedStructure;
    this.selected = IDS.includes(id) && this.getLayerVisibility(id) !== 'hidden' ? id : null;
    this.selectedStructure = null;
    if (wasFocused && this.camera && this.controls?.target) {
      const direction = this.camera.position.clone().sub(this.controls.target).normalize();
      this.focusTransition = { target: new THREE.Vector3(), position: direction.multiplyScalar(8.6) };
    }
  }

  getStructures(layer) {
    return STRUCTURE_DEFINITIONS.filter((entry) => !layer || entry.layer === layer).map((entry) => {
      const meshes = this.meshes.filter((mesh) => mesh.userData.structureId === entry.id);
      return {
        id: entry.id, name: entry.name, english: entry.english, layer: entry.layer,
        description: entry.description,
        hasMorph: meshes.some((mesh) => mesh.morphTargetInfluences?.length),
        morphMeshCount: meshes.filter((mesh) => mesh.morphTargetInfluences?.length).length,
        meshCount: meshes.length,
        sides: meshes.some((mesh) => /_L(?:_|\d)/.test(mesh.name)) && meshes.some((mesh) => /_R(?:_|\d)/.test(mesh.name)) ? '좌우' : null,
      };
    }).filter((entry) => entry.meshCount);
  }

  isStructureVisible(id) {
    return STRUCTURE_DEFINITIONS.some((entry) => entry.id === id) && !this.hiddenStructures?.has(id);
  }

  setStructureVisible(id, visible) {
    if (!STRUCTURE_DEFINITIONS.some((entry) => entry.id === id)) return null;
    this.hiddenStructures ??= new Set();
    if (visible) this.hiddenStructures.delete(id);
    else this.hiddenStructures.add(id);
    this._applyStructureVisibility();
    return this.isStructureVisible(id);
  }

  getLayerVisibility(layer) {
    const structures = STRUCTURE_DEFINITIONS.filter((entry) => entry.layer === layer);
    if (!structures.length) return 'hidden';
    const visible = structures.filter((entry) => this.isStructureVisible(entry.id)).length;
    return visible === structures.length ? 'visible' : visible ? 'partial' : 'hidden';
  }

  setLayerVisible(layer, visible) {
    if (!IDS.includes(layer)) return null;
    this.hiddenStructures ??= new Set();
    for (const entry of STRUCTURE_DEFINITIONS.filter((item) => item.layer === layer)) {
      if (visible) this.hiddenStructures.delete(entry.id);
      else this.hiddenStructures.add(entry.id);
    }
    this._applyStructureVisibility();
    return this.getLayerVisibility(layer);
  }

  showAllStructures() {
    this.hiddenStructures?.clear();
    this._applyStructureVisibility();
    return this.getHiddenStructureCount();
  }

  getHiddenStructureCount() { return this.hiddenStructures?.size || 0; }

  _applyStructureVisibility() {
    for (const mesh of this.meshes) mesh.visible = !this.hiddenStructures?.has(mesh.userData.structureId);
    // Reset camera focus through the existing selection path, then remove an
    // empty layer selection so the remaining visible anatomy is not dimmed.
    if (this.selectedStructure && !this.isStructureVisible(this.selectedStructure)) this.selectStructure(null);
    if (this.selected && !this.meshes.some((mesh) => mesh.visible && mesh.userData.layer === this.selected)) this.selectLayer(null);
  }

  selectStructure(id = null) {
    if (!id) {
      this.selectLayer(this.selected);
      return null;
    }
    if (!this.isStructureVisible(id)) return null;
    const definition = this.getStructures().find((entry) => entry.id === id);
    if (!definition) return null;
    this.selectedStructure = id;
    this.selected = definition.layer;
    const box = new THREE.Box3();
    this.model.updateMatrixWorld(true);
    for (const mesh of this.meshes.filter((item) => item.userData.structureId === id)) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    if (!box.isEmpty() && this.camera && this.controls?.target) {
      const target = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const distance = clamp(Math.max(size.x, size.y, size.z) * 2.7, 2.2, 6.5);
      const direction = this.camera.position.clone().sub(this.controls.target).normalize();
      if (!direction.lengthSq()) direction.set(.45, .1, 1).normalize();
      this.focusTransition = { target, position: target.clone().addScaledVector(direction, distance) };
    }
    return definition;
  }

  setView(view = 'iso') {
    this.focusTransition = null;
    const directions = { front: [0, .12, 1], side: [1, .08, .015], iso: [1, .17, 1.4] };
    const direction = new THREE.Vector3(...(directions[view] || directions.iso)).normalize();
    this.view = view;
    const distance = this.camera.aspect && this.camera.aspect < .72 ? 10.2 : 8.6;
    this.camera.position.copy(direction.multiplyScalar(distance));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setExploded(value) { this.exploded = !!value; }
  setOpacity(value) { this.opacity = clamp(value, .05, 1); }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  pick(event) {
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart[0], event.clientY - this.pointerStart[1]) > 5) return;
    this.pointerStart = null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates = this.meshes.filter((mesh) => mesh.visible && this.isStructureVisible(mesh.userData.structureId));
    const intersection = this.raycaster.intersectObjects(candidates, false).find((hit) => hit.object.visible && this.isStructureVisible(hit.object.userData.structureId) && hit.object.material.opacity > .12);
    if (intersection) {
      const layer = intersection.object.userData.layer;
      this.selectLayer(layer);
      this.callbacks.onSelect?.(layer, intersection.object.userData.anatomy.originalName, intersection.object.userData.structureId);
    }
  }

  frame(now) {
    if (this.disposed) return;
    if(document.hidden||document.body.dataset.suspended==='true'||document.body.dataset.tab!=='studio'){
      this.lastFrame=now;this.frameId=requestAnimationFrame(this.frame);return;
    }
    const dt = Math.min(.06, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const smooth = 1 - Math.exp(-dt * 15);
    // processLayers already applies the artist's attack/release calibration.
    // Do not add a second low-pass filter to vocal movement here.
    for (const id of IDS) this.levels[id] = this.targetLevels[id];
    this.explodeAmount += ((this.exploded ? 1 : 0) - this.explodeAmount) * (1 - Math.exp(-dt * 7));
    for (const mesh of this.meshes) {
      const id = mesh.userData.layer, meta = mesh.userData.anatomy, level = this.levels[id];
      const inLayer = !this.selected || this.selected === id;
      const selected = inLayer && (!this.selectedStructure || this.selectedStructure === mesh.userData.structureId);
      const opacity = meta.shell ? (.2 + this.opacity * .5) : (.8 + this.opacity * .2);
      const dim = this.selectedStructure ? (inLayer ? .16 : .065) : .14;
      const targetOpacity = (this.selectedStructure && selected ? Math.max(.82, opacity) : opacity) * (selected ? 1 : dim);
      mesh.material.opacity += (targetOpacity - mesh.material.opacity) * smooth;
      mesh.material.depthWrite = selected && !meta.shell && mesh.material.opacity > .92;
      mesh.material.emissiveIntensity = (selected ? .055 : .005) + level * (selected ? .23 : .012);
      if (mesh.material.userData.rimIntensity) mesh.material.userData.rimIntensity.value = selected ? (.2 + level * .38 + (this.selectedStructure ? .22 : 0)) : .03;
      mesh.position.y = ({ nas: .5, oro: .12, aes: -.24, src: -.56 }[id]) * this.explodeAmount;
      if (mesh.morphTargetInfluences?.length) {
        // Both display halves share the same authored membrane and must use
        // identical weights at their shared vertices, including shared normals.
        if (meta.sharedMembrane) {
          const total = Math.max(1, this.levels.nas + this.levels.oro);
          const names = mesh.geometry.morphAttributes.position;
          for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
            mesh.morphTargetInfluences[i] = (/2$/.test(names[i].name) ? this.levels.oro : this.levels.nas) / total;
          }
        } else {
          for (let i = 0; i < mesh.morphTargetInfluences.length; i++) mesh.morphTargetInfluences[i] = i === meta.targetIndex ? level : 0;
        }
      }
    }
    if (this.focusTransition && this.camera && this.controls?.target) {
      const ease = 1 - Math.exp(-dt * 7);
      this.camera.position.lerp(this.focusTransition.position, ease);
      this.controls.target.lerp(this.focusTransition.target, ease);
      if (this.camera.position.distanceTo(this.focusTransition.position) < .005 && this.controls.target.distanceTo(this.focusTransition.target) < .005) this.focusTransition = null;
    }
    if (this.stageGlow) this.stageGlow.uniforms.intensity.value = .3 + Math.max(...IDS.map((id) => this.levels[id])) * .3;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    disposeTree(this.model);
    disposeTree(this.stage);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.meshes = [];
  }
}

import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SPAWN } from './config.js';
import { createTrafficSignals } from './TrafficSignals.js';

const DRAW_RANGE = 230;
const DETAIL_RANGE = 140;

export async function createWorld(scene, physics, RAPIER) {
  const base = new URL('maps/', document.baseURI);
  const loader = new GLTFLoader();
  const started = performance.now();
  const manifestRequest = fetch(new URL('baradero/index.json', base)).then((response) => {
    if (!response.ok) throw new Error('No se pudo cargar el índice del mapa de Baradero.');
    return response.json();
  });
  const [sector, manifest] = await Promise.all([
    loader.loadAsync(new URL('san-martin.glb', base).href),
    manifestRequest,
  ]);
  const tiles = await Promise.all(manifest.chunks.map(async ({ file }) => {
    const { scene: tile } = await loader.loadAsync(new URL(`baradero/${file}`, base).href);
    return tile;
  }));
  const environment = addCityToWorld(scene, physics, RAPIER, sector.scene, tiles, manifest);
  return { ...environment, loadMs: performance.now() - started };
}

export function addCityToWorld(scene, physics, RAPIER, sector, tiles, manifest) {
  if (tiles.length !== manifest.chunks.length || !tiles.length) {
    throw new Error('La ciudad necesita todas las teselas del índice.');
  }
  sector.add(...tiles);
  const environment = addMapToWorld(scene, physics, RAPIER, sector, { openSector: true });
  // Estos puntos se ubican sobre la parte central de un segmento recto de cada eje OSM.
  const routes = ['228161673', '228161596'].map((id) => {
    const { name, points } = manifest.routes.find((route) => route.id === id);
    const segments = points.slice(1).map(([x, z], i) => {
      const [a, b] = points[i];
      return { xyz: [(x + a) / 2, 0.52, (z + b) / 2], dx: x - a, dz: z - b };
    });
    const segment = segments.reduce((longest, item) => (
      Math.hypot(item.dx, item.dz) > Math.hypot(longest.dx, longest.dz) ? item : longest
    ));
    return { name, segment };
  });
  // Se resuelven al pedirlas: el sector puede moverse después (restoreMapCoordinates).
  const starts = routes.map(({ name, segment }) => ({
    name,
    pose() {
      sector.updateMatrixWorld(true);
      const from = sector.localToWorld(new Vector3(...segment.xyz));
      const to = sector.localToWorld(new Vector3(segment.xyz[0] + segment.dx, segment.xyz[1], segment.xyz[2] + segment.dz));
      return { position: from, heading: Math.atan2(from.x - to.x, from.z - to.z) };
    },
  }));
  const tileBounds = tiles.map((tile) => new Box3().setFromObject(tile));
  // La niebla oculta todo más allá de 225 m: las teselas lejanas no se dibujan.
  const point = new Vector3();
  const small = [];
  tiles.forEach((tile, i) => tile.traverse((mesh) => {
    if (!mesh.isMesh || mesh.name.startsWith('col_') || ['road', 'curb', 'sidewalk', 'ground'].includes(mesh.userData.layer)) return;
    if (mesh.userData.layer === 'building') return;
    small.push({ mesh, box: new Box3().setFromObject(mesh), tile: i });
  }));
  const last = new Vector3(Infinity, 0, Infinity);
  let visibleTiles = tiles.length;
  const updateTiles = (position, range = DRAW_RANGE) => {
    if (Math.hypot(position.x - last.x, position.z - last.z) < 4) return visibleTiles;
    last.copy(position);
    visibleTiles = 0;
    tiles.forEach((tile, i) => {
      tile.visible = tileBounds[i].distanceToPoint(point.copy(position)) < range;
      if (tile.visible) visibleTiles++;
    });
    for (const { mesh, box } of small) mesh.visible = box.distanceToPoint(point.copy(position)) < DETAIL_RANGE;
    return visibleTiles;
  };
  return { ...environment, starts, tileBounds, updateTiles };
}

export function addMapToWorld(scene, physics, RAPIER, group, { openSector = false } = {}) {
  const spawn = group.getObjectByName('spawn');
  if (!spawn) throw new Error('El mapa de San Martín necesita un punto de salida.');
  group.updateMatrixWorld(true);

  // Encajar la salida del sector en la pose de reinicio del vehículo.
  const origin = spawn.getWorldPosition(new Vector3());
  spawn.getWorldQuaternion(group.quaternion).invert();
  group.position.copy(SPAWN).sub(origin.applyQuaternion(group.quaternion));
  group.updateMatrixWorld(true);

  const obstacles = new Set();
  const cameraObstacles = [];
  const collisionMeshes = [];
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (mesh.name.startsWith('col_')) {
      mesh.visible = false;
      if (!openSector || mesh.userData.surface !== 'boundary') collisionMeshes.push(mesh);
      return;
    }
    mesh.receiveShadow = true;
    mesh.castShadow = !['ground', 'road', 'curb', 'sidewalk', 'vegetation', 'detail', 'road-detail'].includes(mesh.userData.layer);
  });
  if (!collisionMeshes.some((mesh) => mesh.userData.surface === 'road')) {
    throw new Error('El mapa de San Martín necesita una calzada transitable.');
  }

  // Construir una malla continua por superficie vial para resolver juntas coplanares.
  const surfaces = new Map();
  for (const mesh of collisionMeshes) {
    const { surface } = mesh.userData;
    const name = ['road', 'curb', 'sidewalk'].includes(surface) ? surface : mesh.name;
    const batch = surfaces.get(name) ?? { surface, meshes: [] };
    batch.meshes.push(mesh);
    surfaces.set(name, batch);
    if (surface === 'building') cameraObstacles.push(mesh);
  }

  const point = new Vector3();
  const surfaceHandles = new Map();
  for (const { surface, meshes } of surfaces.values()) {
    const vertices = [];
    const indices = [];
    const vertexIds = new Map();
    for (const mesh of meshes) {
      const { attributes: { position }, index } = mesh.geometry;
      const vertexMap = [];
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const key = point.toArray().map((coordinate) => Math.round(coordinate * 10000)).join(',');
        if (!vertexIds.has(key)) {
          vertexIds.set(key, vertices.length / 3);
          vertices.push(point.x, point.y, point.z);
        }
        vertexMap.push(vertexIds.get(key));
      }
      for (let i = 0; i < (index?.count ?? position.count); i++) {
        indices.push(vertexMap[index ? index.getX(i) : i]);
      }
    }
    const desc = RAPIER.ColliderDesc.trimesh(
      Float32Array.from(vertices), Uint32Array.from(indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ).setFriction(surface === 'road' ? 0.1 : 0.55);
    const collider = physics.createCollider(desc);
    surfaceHandles.set(collider.handle, surface);
    if (surface === 'building' || surface === 'boundary') obstacles.add(collider.handle);
  }

  scene.add(group);
  return { obstacles, cameraObstacles, surfaceHandles, updateSignals: createTrafficSignals(group) };
}

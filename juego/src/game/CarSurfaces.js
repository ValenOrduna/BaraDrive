import * as THREE from 'three';

// Intensidad del reflejo del parabrisas: 1 desde afuera, tenue desde la cabina.
export const windshieldReflection = { value: 1 };

function carTexture(pixels, size, repeat) {
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createCabinSurfaces() {
  const size = 128;
  const grain = new Uint8Array(size * size * 4);
  const threads = new Uint8Array(grain.length);
  const nap = new Uint8Array(grain.length);
  let state = 43892;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = 4 * (y * size + x);
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      const pebble = 156 + (state >>> 25) * 0.70;
      grain.set([pebble, pebble, pebble, 255], offset);
      const warp = x * Math.PI / 4;
      const weft = y * Math.PI / 4;
      // Relieve periódico de trama y urdimbre, con rugosidad propia de los hilos.
      const nx = Math.cos(warp) * (0.55 + 0.45 * Math.sin(weft));
      const ny = Math.cos(weft) * (0.55 + 0.45 * Math.sin(warp));
      const normalLength = Math.hypot(nx, ny, 1);
      threads.set([128 + 127 * nx / normalLength, 128 + 127 * ny / normalLength, 128 + 127 / normalLength, 255], offset);
      const roughness = 198 + 20 * (Math.sin(warp) * Math.sin(weft) + 1);
      nap.set([roughness, roughness, roughness, 255], offset);
    }
  }
  return {
    grain: carTexture(grain, size, 3),
    fabricNormal: carTexture(threads, size, 3.5),
    fabricRoughness: carTexture(nap, size, 3.5),
  };
}

export function setCarSurfaces(meshes, { grain, fabricNormal, fabricRoughness }) {
  const glass = meshes.find(({ material }) => material.name === 'glass.001')?.material;
  const cabin = meshes.find(({ material }) => material.name === 'interior')?.material;
  if (!glass || !cabin) throw new Error('El compacto necesita materiales de cristal y habitáculo.');
  const windshield = glass.clone();
  const upholstery = cabin.clone();
  const tread = meshes.find(({ material }) => material.name === 'rubber.001').material.clone();
  const alloy = meshes.find(({ material }) => material.name === 'chrome').material.clone();
  tread.name = 'tread';
  alloy.name = 'alloy';
  for (const mesh of meshes) {
    if (mesh.name === 'Raked_laminated_windshield') mesh.material = windshield;
    if (mesh.material === cabin && /seat|headrest|carpet/i.test(mesh.name)) mesh.material = upholstery;
    if (mesh.name.startsWith('Siped_tread_blocks')) mesh.material = tread;
    if (mesh.name.includes('Alloy_five_spoke_rim')) mesh.material = alloy;
  }
  windshield.name = 'windshield';
  upholstery.name = 'upholstery';
  const brakeLights = [];
  const materials = new Set(meshes.map(({ material }) => material));

  for (const material of materials) {
    material.envMapIntensity = 0.85;
    switch (material.name) {
      case 'paint':
        material.color.set('#a6b9cc');
        material.envMapIntensity = 1.36;
        material.metalness = 0.54;
        material.roughness = 0.26;
        material.clearcoat = 0.94;
        material.clearcoatRoughness = 0.105;
        break;
      case 'interior':
      case 'upholstery': {
        const fabric = material.name === 'upholstery';
        material.color.set(fabric ? '#a69a90' : '#a0a6aa');
        material.roughness = fabric ? 0.98 : 0.85;
        material.roughnessMap = fabric ? fabricRoughness : grain;
        material.vertexColors = true;
        if (fabric) {
          material.normalMap = fabricNormal;
          material.normalScale.set(0.40, 0.40);
        } else {
          material.bumpMap = grain;
          material.bumpScale = 0.0010;
        }
        break;
      }
      case 'windshield':
      case 'glass.001': {
        const front = material.name === 'windshield';
        // Vidrio fino: el reflejo de Fresnel se suma sin atenuar y la opacidad solo
        // tiñe lo que está detrás. Evita el pase de transmisión, que desenfoca la
        // calle y duplica el costo del render.
        material.map = null;
        material.transmission = 0;
        material.transparent = true;
        material.depthWrite = false;
        material.color.set(front ? '#0d1416' : '#091013');
        material.opacity = front ? 0.07 : 0.40;
        material.metalness = 0;
        material.roughness = front ? 0.035 : 0.06;
        material.ior = 1.52;
        material.specularIntensity = 1;
        material.clearcoat = 0;
        material.envMapIntensity = front ? 0.7 : 1.45;
        material.side = front ? THREE.DoubleSide : THREE.FrontSide;
        material.blending = THREE.CustomBlending;
        material.blendEquation = THREE.AddEquation;
        material.blendSrc = THREE.OneFactor;
        material.blendDst = THREE.OneMinusSrcAlphaFactor;
        if (front) {
          // Desde la cabina el parabrisas refleja sobre todo el tablero oscuro, no el
          // cielo del mapa de entorno: la cara interior conserva un reflejo tenue.
          material.customProgramCacheKey = () => 'thin-windshield';
          material.onBeforeCompile = (shader) => {
            shader.uniforms.windshieldReflection = windshieldReflection;
            shader.fragmentShader = `uniform float windshieldReflection;\n${shader.fragmentShader}`.replace(
              '#include <opaque_fragment>',
              'outgoingLight *= windshieldReflection;\n#include <opaque_fragment>',
            );
          };
        }
        break;
      }
      case 'clearlens':
        material.transmission = 0;
        material.transparent = true;
        material.opacity = 0.37;
        material.depthWrite = false;
        material.roughness = 0.12;
        break;
      case 'alloy':
        material.color.set('#d0d7da');
        material.roughness = 0.23;
        material.metalness = 0.91;
        material.envMapIntensity = 1.24;
        break;
      case 'chrome':
      case 'steel.001':
        material.roughness = material.name === 'chrome' ? 0.30 : 0.46;
        material.metalness = material.name === 'chrome' ? 0.79 : 0.70;
        break;
      case 'rubber.001':
      case 'tread':
        material.map = null;
        material.color.set(material.name === 'tread' ? '#2b2e2e' : '#252727');
        material.roughness = material.name === 'tread' ? 0.91 : 0.76;
        material.bumpMap = grain;
        material.bumpScale = material.name === 'tread' ? 0.002 : 0.0009;
        break;
      case 'redlens':
        material.transmission = 0;
        material.emissive.set('#d01009');
        brakeLights.push(material);
        break;
    }
  }
  return brakeLights;
}

export function shapeHatch(geometry, spoiler) {
  // Extender el techo hacia el portón y reducir la repisa bajo la luneta.
  const { position, normal } = geometry.attributes;
  const outward = (y, z) => {
    const advance = 0.48 * THREE.MathUtils.smoothstep(z, 0.76, 1.23)
      * THREE.MathUtils.smoothstep(y, 0.18, 0.61) * Math.max(0, 2.12 - z);
    return spoiler ? advance - 0.57 * Math.max(0, z + advance - 1.55) : advance;
  };
  const epsilon = 0.001;
  const corrected = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const z = position.getZ(i);
    const change = outward(y, z);
    if (change === 0) continue;
    position.setZ(i, z + change);
    const slopeY = (outward(y + epsilon, z) - outward(y - epsilon, z)) / (2 * epsilon);
    const slopeZ = (outward(y, z + epsilon) - outward(y, z - epsilon)) / (2 * epsilon);
    // Inversa transpuesta del jacobiano de la deformación Y/Z.
    const nz = normal.getZ(i) / (1 + slopeZ);
    corrected.set(normal.getX(i), normal.getY(i) - nz * slopeY, nz).normalize();
    normal.setXYZ(i, corrected.x, corrected.y, corrected.z);
  }
}

export function vertexShading(geometry, shadeAt) {
  const { position } = geometry.attributes;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const shade = shadeAt(position.getX(i), position.getY(i), position.getZ(i));
    colors.fill(shade, 3 * i, 3 * i + 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

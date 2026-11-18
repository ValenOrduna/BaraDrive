import {
  BackSide, Color, DirectionalLight, FogExp2, HemisphereLight, Mesh,
  ShaderMaterial, SphereGeometry, Vector3,
} from 'three';

export function createStreetAtmosphere(scene) {
  const horizon = new Color('#c0d4df');
  const sunDirection = new Vector3(-0.29, 0.36, -0.89).normalize();
  scene.background = horizon;
  scene.fog = new FogExp2(horizon, 0.0065);

  const sky = new Mesh(new SphereGeometry(230, 24, 12), new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      horizon: { value: horizon },
      zenith: { value: new Color('#3b87c6') },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `
      varying vec3 ray;
      void main() {
        ray = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform vec3 horizon, zenith, sunDirection;
      varying vec3 ray;
      float hash(vec2 p) {
        return fract(43758.5453 * sin(dot(p, vec2(127.1, 311.7))));
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(ray);
        float height = max(d.y, 0.0);
        vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.60, height));
        if (height > 0.02) {
          vec2 uv = d.xz * (3.4 / (height + 0.21));
          float cloud = smoothstep(0.52, 0.74, noise(uv)) * smoothstep(0.02, 0.16, height);
          color = mix(color, vec3(0.91, 0.94, 0.96), cloud * 0.76);
        }
        float angle = max(dot(d, sunDirection), 0.0);
        color += vec3(1.0, 0.77, 0.48) * pow(angle, 55.0) * 0.27;
        color = mix(color, vec3(3.2, 2.75, 1.88), smoothstep(0.99978, 0.99996, angle));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.name = 'Cielo de San Martín';
  sky.frustumCulled = false;
  // Draw after opaque objects. Depth testing skips the pixels they already cover.
  sky.renderOrder = 1;
  scene.add(sky);
  scene.add(new HemisphereLight('#e2efff', '#a18f79', 2.15));

  const sun = new DirectionalLight('#fff2db', 3.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 175 });
  sun.shadow.normalBias = 0.036;
  sun.shadow.bias = -0.00012;
  scene.add(sun, sun.target);

  return (position) => {
    sky.position.copy(position);
    sun.target.position.copy(position);
    sun.position.copy(position).addScaledVector(sunDirection, 90);
  };
}

const lensColors = {
  roja: 0xff3322,
  ambar: 0xffa51c,
  verde: 0x3bff73,
};

export function createTrafficSignals(group) {
  const lenses = new Map();
  group.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      const match = material.name.match(/^MAT_SM_luz_(roja|ambar|verde)(?:\.\d+)?$/);
      if (match) lenses.set(material, match[1]);
    }
  });

  let current;
  const update = (seconds) => {
    const elapsed = seconds % 33;
    const phase = elapsed < 15 ? 'roja' : elapsed < 30 ? 'verde' : 'ambar';
    if (phase === current) return;
    current = phase;
    for (const [material, lens] of lenses) {
      const lit = lens === phase;
      material.color.setHex(lit ? lensColors[lens] : 0x242322);
      material.emissive.setHex(lensColors[lens]);
      material.emissiveIntensity = lit ? 1.4 : 0;
    }
  };
  update(0);
  return update;
}

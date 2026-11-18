import { Quaternion, Vector3 } from 'three';

// Se llama antes de crear el vehículo, cuando el mundo físico contiene solo el sector.
export function restoreMapCoordinates(scene, physics) {
  const spawn = scene.getObjectByName('spawn');
  if (!spawn) throw new Error('El mapa necesita un nodo de salida.');
  let map = spawn;
  while (map.parent !== scene) map = map.parent;

  // World monta un sector relativo al origen de prueba. Deshacer ese marco rígido
  // en el sector visual y en sus colisiones ya construidas.
  const inverse = map.matrix.clone().invert();
  const rotation = new Quaternion().setFromRotationMatrix(inverse);
  const position = new Vector3();
  const orientation = new Quaternion();
  physics.forEachCollider((collider) => {
    collider.setTranslation(position.copy(collider.translation()).applyMatrix4(inverse));
    collider.setRotation(orientation.copy(collider.rotation()).premultiply(rotation));
  });
  map.position.set(0, 0, 0);
  map.quaternion.identity();
  map.updateMatrixWorld(true);

  return {
    position: spawn.getWorldPosition(new Vector3()),
    rotation: spawn.getWorldQuaternion(new Quaternion()),
  };
}

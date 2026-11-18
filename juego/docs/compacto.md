# Modelo del compacto

El modelo usa carrocería, cristales, pilares, asientos, ruedas y luces del
[Blue five-door compact hatchback de Innerscene](https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0)
bajo [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Los reflejos exteriores toman la luz de
[Suburban Parking Area de Jacopo Voltolina](https://polyhaven.com/a/suburban_parking_area),
publicada por Poly Haven bajo [CC0](https://polyhaven.com/license).

El GLB queda en metros, con Y arriba y frente hacia −Z. Los nodos
`wheel_front_left`, `wheel_front_right`, `wheel_rear_left` y `wheel_rear_right`
giran y se desplazan con la dirección y la suspensión. Cada nodo tiene una
rama giratoria para neumático, llanta y disco, y otra para el cáliper que
acompaña la suspensión y la dirección. La malla visual se ajusta a los 2,551 m
de batalla, 1,50 m de trocha y 0,31 m de radio de la física. El collider
del chasis procede de la calibración descrita en [física](fisica.md).

El volante se renderiza con piezas propias y gira con la dirección. El tablero
tiene una visera con volumen, una aguja 3D y un visor digital de velocidad y marcha.
La cámara interior se ubica a la altura de los ojos, 9 cm hacia el centro
respecto del eje del volante, con un campo horizontal fijo de 85°. Así el pilar A
izquierdo no pasa del 17,4 % izquierdo de la pantalla en 16:10, 16:9, 21:9 y 5:4
(`tests/cabin-view.test.js`). Como contrapartida, el volante aparece algo a la izquierda. El cuadro
del auto es la única indicación de velocidad en esa vista. El retrovisor
interior muestra una vista trasera en vivo. Los laterales reflejan la iluminación
del entorno.

El acabado visual extiende el techo hacia el portón para dar al compacto una
silueta de hatchback; la aleta trasera se acorta para sobresalir menos del portón.
Los parámetros están en `src/game/CarSurfaces.js` y son ajustes visuales, no
mediciones de un auto real:

- Pintura metalizada: metalness 0,54, rugosidad 0,26, clearcoat 0,94 con
  rugosidad 0,105 y reflejos del HDR de entorno (intensidad 1,36).
- Cristales finos sin pase de transmisión: el reflejo de Fresnel (IOR 1,52) se
  suma sin atenuar y la opacidad solo tiñe (parabrisas 7 %, laterales 40 %). El
  pase de transmisión desenfocaba la calle y bajaba la vista exterior a 47 FPS.
  Desde la cabina el reflejo del parabrisas baja al 28 %, porque uno real refleja
  sobre todo el tablero oscuro.
- Neumáticos: banda con relieve y más rugosidad que el flanco, que suma dos
  nervaduras. Llantas de aleación (metalness 0,91) con un aro pulido en el talón.
- Cabina: tapizado con mapa normal de trama y urdimbre y rugosidad variable,
  plásticos con grano en rugosidad y relieve, y sombreado de contacto por vértice
  (más oscuro abajo y hacia los bordes) en tablero, butacas y alfombra.

Los limpiaparabrisas delanteros quedan ocultos en la posición de reposo.

## Regenerar el GLB

Descargá el GLB original desde la página de Innerscene. El archivo debe tener
SHA-256 `b5b7b28d4746b025a1d10ffd1d1682cfd7bea54af2ae9144ca88003487f4978a`.
Desde `juego/`:

```sh
npm ci
node scripts/preparar-compacto.mjs /ruta/al/compacto-original.glb src/assets/compacto.glb
npm test
```

El compacto es genérico. Sus dimensiones de manejo se basan en la referencia
del Chevrolet Onix documentada en la calibración.

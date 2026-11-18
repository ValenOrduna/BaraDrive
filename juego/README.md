# BARA-DRIVE · Prototipo jugable 0.1

Videojuego de conducción 3D con **Three.js, JavaScript, Vite y Rapier 3D**.
El recorrido abre en **Av. San Martín, de Malabia a Santa María de Oro**,
con la escena de Blender y el trazado OSM del repositorio.

## Probar en Windows

En esta computadora, hacer doble clic en **`iniciar.cmd`**. El script reconoce la
copia portátil de Node preparada para el desarrollo y abre el navegador en
`http://127.0.0.1:5173`. Dejar la consola abierta mientras se juega.

En otra computadora, instalar **Node.js 24 LTS** (mínimo soportado por el proyecto:
22.12), abrir una terminal en `juego` y ejecutar:

```sh
npm ci
npm run dev
```

Abrir **http://127.0.0.1:5173**, esperar «Motor listo» y presionar
**EMPEZAR A CONDUCIR**. Se necesita un navegador actualizado con WebGL 2 y
aceleración gráfica. Edge está probado por la suite automatizada.

`npm ci` necesita Internet la primera vez. El escenario, materiales, fuentes del
sistema y física WASM se cargan localmente; no se consultan mapas ni CDN al jugar.

**Este prototipo todavía usa un servidor local de Vite.** No es aún un `.exe`
independiente. El empaquetado con Electron corresponde a una etapa posterior.
No se necesita Blender para ejecutar o compilar el juego.

## Controles

| Tecla | Acción |
|---|---|
| W / ↑ | Acelerar hacia adelante; frenar si se está retrocediendo |
| S / ↓ | Frenar y, al bajar la velocidad, activar marcha atrás |
| A / D o ← / → | Girar a izquierda / derecha |
| Espacio | Frenar sin activar marcha atrás |
| C | Alternar cámara exterior e interior |
| R | Volver al punto de salida y detener el auto |
| Esc | Pausar / continuar |

El juego se pausa al perder el foco o cambiar de pestaña y limpia las teclas
presionadas, evitando que el auto siga acelerando. La cámara interior incluye
volante animado y un tablero con velocidad; el HUD también muestra km/h y marcha.

## Compilar y comprobar

```sh
npm test
npm run build
npm run preview
```

La compilación queda en `dist/`. La previsualización está en
**http://127.0.0.1:4173**. No abrir `dist/index.html` con doble clic: los módulos
JavaScript necesitan un origen HTTP local en esta etapa. `dist/` y `node_modules/`
son salidas regenerables y están ignorados por Git. `package-lock.json` fija las
versiones instaladas.

Pruebas de navegador (después de compilar, con los puertos 5173 y 4173 libres):

```sh
npm run test:e2e
```

Usan Microsoft Edge mediante Playwright; no descargan un navegador adicional.
Para ejecutar las pruebas con otro navegador Chromium, usá `BARADRIVE_BROWSER`
con la ruta del ejecutable. La suite inicia y detiene sus servidores. Se pueden
elegir otros puertos con `BARADRIVE_DEV_PORT` y `BARADRIVE_PREVIEW_PORT`.

Las pruebas de física comprueban aceleración, frenado, reversa, giro, colisión real
con un muro y reinicio. Las pruebas de navegador comprueban teclado, movimiento,
cámaras, pausa, pérdida de foco, recorrido de San Martín, carga local del GLB
y un mensaje de error recuperable cuando falta WebGL. Las capturas se guardan en
`test-results/`.

## Estructura

```text
juego/
  src/
    main.js             Inicio, bucle de juego y estados menú/juego/pausa
    ui.js               Menú, HUD, avisos y diálogo de pausa
    style.css           Interfaz adaptable sin fuentes externas
    game/
      config.js         Escala, punto de salida y parámetros del auto
      Vehicle.js        Cuerpo físico y control de conducción
      CarModel.js       Modelo visual, ruedas, interior y tablero
      World.js          Sector de San Martín y colisiones estáticas
      Cameras.js        Cámaras interior/exterior y obstrucciones
      Input.js          Teclado y acciones
  tests/
    vehicle.test.js     Pruebas de Rapier sin renderer
    browser/            Pruebas de integración en navegador
```

## Decisiones de estabilidad y rendimiento

- Unidades: metros, segundos y kilogramos; Y arriba y frente del auto hacia −Z.
- Rapier avanza a **60 pasos físicos por segundo**, separado del renderizado e
  interpolado. Se limita la recuperación de frames lentos a seis pasos por frame.
- El chasis dinámico usa detección continua de colisiones. Rapier simula el
  contacto, la suspensión, el frenado y el agarre de cada rueda. El eje delantero
  recibe la tracción y la dirección. La carrocería se inclina con la suspensión.
  Consultá las [mediciones y parámetros](docs/fisica.md).
- Colisiones simplificadas, geometrías/materiales compartidos, marcas viales y
  ventanas instanciadas, pixel ratio máximo de 1.5 y un solo mapa de sombras de 1024 px.
- Física WASM cargada en un archivo separado para mostrar el menú antes de que
  termine de inicializar el motor.
- El compacto y los reflejos se cargan desde archivos locales.
  Consultá los [créditos y la preparación del modelo](docs/compacto.md).
- Los [créditos del mapa](public/maps/CREDITOS.md) describen sus fuentes y licencias.
- Cámaras con interpolación; la exterior va centrada detrás del auto (5,9 m atrás, 2,05 m de alto) y evita atravesar los edificios.
- En desarrollo, `window.__BARA_DRIVE__.snapshot()` incluye estado, posición,
  velocidad, orientación y datos de contacto de las cuatro ruedas.

## Mapa de San Martín

El GLB en `public/maps/san-martin.glb` sale de `mapa/blender/mapabaradero.blend`
en `main` (`69640d4`). Tiene 17.565.148 bytes y 313.551 triángulos de escena,
incluidos 1.333 de colisión. Malabia y Santa María de Oro están a 136,79 m entre ejes.
Se conservan los nombres de los objetos visuales de la calzada, los cordones,
las veredas y las fachadas. Las colisiones se exportan en mallas independientes
`col_*` con un tipo de superficie. El nodo `spawn` marca el carril de salida en
`(2.35, 0.52, -24.5)` en metros. Sale 24,5 m después de Malabia, con Y arriba
y el frente hacia Santa María de Oro (−Z).
La palmera más cercana queda a 6,6 m en planta desde el punto de salida
(tronco; el borde de las hojas queda a 3,4 m).
El juego conserva las coordenadas del GLB y usa la posición y el rumbo del nodo
`spawn` para el arranque y para el reinicio con R (`src/game/TrackSpawn.js`).
`SPAWN` en `config.js` queda solo para el circuito provisional de las pruebas.

Para regenerar el GLB, desde la raíz del repositorio con Blender 4.5.16 LTS:

```sh
blender -b mapa/blender/mapabaradero.blend --python-exit-code 1 \
  -P scripts/exportar_sanmartin.py -- "$PWD" "$PWD/juego/public/maps/san-martin.glb"
```

La exportación procesa la escena en memoria. El Blender maestro conserva
su SHA-256 `7d75011786511626b10854bd0b854f0fd00f6af75cabd8d1c3a4f4edb55c0a83`.
Las fachadas y alturas son aproximaciones de las referencias fotográficas.
Hay límites físicos en los bordes del sector. El semáforo de Malabia alterna
15 s en rojo, 15 s en verde y 3 s en ámbar. Las fases corresponden a esta
simulación y no se midieron en el cruce. Todavía no aplica infracciones.

### Cruce de cordón

Usá el acceso al portón gris del lado derecho, antes del edificio con balcones.
El bisel de hormigón está entre 34,6 y 41,4 m después del eje de Malabia. Es una
aproximación modelada a partir de `referencias/avenida-sanmartin/avsanmartin2.png`.
El cordón conserva sus 14 cm de desnivel entre calzada y vereda.

La prueba de `npm test` toma las colisiones del GLB. Arranca en
`(-1.5, 0.52, -28.2)` en coordenadas del mapa y gira la pose 25° a la derecha
del eje de la avenida. Regula el acelerador para entrar al bisel a 15 km/h.
Comprueba el contacto de las dos ruedas derechas, la compresión delantera, la
subida del chasis y que no choque con edificios ni con los límites.

La prueba de recorrido en Node usa el mismo cargador de colisiones y exige llegar
a Santa María de Oro en 16 s de simulación. El e2e comprueba también que el juego
reciba teclado y reinicie con R. Tiene hasta 150 s para recorrer la distancia con
renderizado por software.

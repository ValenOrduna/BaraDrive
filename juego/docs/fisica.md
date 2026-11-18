# Calibración inicial del vehículo

La referencia dimensional es el Chevrolet Onix hatchback 1.2 MT LS MY24
argentino. El catálogo indica 2,551 m entre ejes y neumáticos 185/70 R14,
de los que se obtiene un radio nominal de 0,307 m. El manual indica una masa
en orden de marcha de 1042 kg, con aproximadamente 62 % sobre el eje delantero.
El prototipo usa 1150 kg como estimación con ocupante y carga, y 59 % delante.
[Catálogo Chevrolet MY24](https://www.chevrolet.com.ar/content/dam/chevrolet/sa/argentina/espanol/index/download-a-catalog/07-pdfs/catalogo-onix-argentina-my24.pdf),
[manual del propietario MY24, datos técnicos](https://www.chevrolet.com.ar/content/dam/chevrolet/sa/argentina/espanol/index/manuals/pdf/onix/2024/onix-manual-del-propietario-2024.pdf).

| Parámetro | Valor de partida |
|---|---|
| Distancia entre ejes, trocha y radio de rueda | 2,551 m, 1,50 m estimado y 0,31 m redondeado |
| Centro de masa e inercia | Centro 4 cm arriba y 23 cm por delante del origen del chasis, inercia X/Y/Z de 1450/1600/300 kg·m² estimada |
| Suspensión por rueda | 0,34 m en reposo y recorrido parametrizado de ±0,14 m. Rigidez 36 s⁻² y amortiguación 3,4/4,4 s⁻¹ en compresión/extensión, normalizadas por la masa según Rapier. Tope de 9000 N |
| Agarre | Factor de tracción 0,92 y de rigidez lateral 0,8, adimensionales y ajustados sobre una superficie uniforme |
| Tracción | Hasta 4600 N y 48 kW en las ruedas delanteras. Hasta 3000 N en reversa. Estimaciones para el prototipo |
| Velocidad urbana | Límites de tracción de 60 km/h (16,67 m/s) adelante y 15 km/h (4,17 m/s) en reversa. El par cae en los últimos 0,55 m/s antes de cada límite |
| Frenado | Hasta 9400 N solicitados, con reparto 66 % delante y 34 % detrás. Rapier recibe un impulso por rueda proporcional al paso físico |
| Resistencia y dirección | 110 N de rodadura en retención y 0,38 kg/m de arrastre cuadrático. Dirección de hasta 0,50 rad al centro del eje, reducida con la velocidad para teclado |

Las mediciones se reproducen con `npm test` sobre piso plano y a 60 Hz.
Son resultados del modelo, pendientes de contraste con un auto real.

| Maniobra | Resultado simulado |
|---|---|
| Velocidad sostenida durante 15 s de acelerador a fondo | 59,89 km/h adelante y 14,96 km/h en reversa |
| Frenada recta de 50 a menos de 0,3 km/h desde el primer paso de freno | 11,64 m en 1,70 s y 1,67° de inclinación hacia delante |
| Giro sostenido con dirección completa a 10,19 km/h de media | Radio de trayectoria del chasis de 5,90 m y balanceo máximo de 0,12° |
| Cordón de 10 cm bajo las ruedas derechas, a unos 9 km/h | Compresión delantera derecha adicional de 6,5 cm y balanceo máximo de 3,71° |

El límite gobierna el par motor. La inercia, un impacto externo o una bajada
pueden elevar la velocidad por encima del objetivo. El freno de servicio
actúa con la misma fuerza disponible a cualquier velocidad.

Cada neumático toma una muestra puntual bajo su centro. Eso limita la
simulación del impacto contra la cara de un cordón y del contacto de costado.
El prototipo usa un chasis simplificado, agarre uniforme y una entrega de
potencia continua. Embrague, caja manual, ABS y hardware de volante y pedales
quedan pendientes. [Controlador vehicular de Rapier](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html).

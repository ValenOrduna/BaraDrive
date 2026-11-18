# BaraDrive

Simulador de conducción en Baradero (Three.js, Vite y Rapier). Auto compacto de
tracción delantera con cuatro ruedas simuladas, suspensión y cámaras exterior e interior,
sobre el mapa de Baradero con Av. San Martín y la plaza.

## Probarlo

```sh
cd juego
npm ci
npm run dev
```

Abrir http://127.0.0.1:5173. Controles y detalles: [juego/README.md](juego/README.md).

## Qué no incluye esta copia pública

- Los `.blend` de Blender (más de 100 MB; el mapa ya viene exportado a GLB en `juego/public/maps`).
- Las fotos de referencia (`referencias/`) y los respaldos.
- Los créditos y licencias de los modelos están en `juego/public/maps/CREDITOS.md`.
  Las licencias del auto y de los árboles no están verificadas.

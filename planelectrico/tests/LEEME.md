# Pruebas DOM de PlanEléctrico Pro

Verifican la app por DOM (el JS vive en un IIFE: no hay API interna accesible).

## Cómo correrlas

Desde la raíz del proyecto — la carpeta que tiene `PlanElectricoPro.html`:

```
node tests/todo.mjs                 # las 7 suites sobre la FUENTE
node tests/todo.mjs app/index.html  # las 7 suites sobre la RÉPLICA PWA
node tests/regresion.mjs            # una sola suite
```

Requisitos: Node ≥ 18 y Playwright. Playwright se resuelve desde el
`node_modules` **global** (el proyecto sigue sin npm ni bundler); si está en
otro lado, se indica con la variable `PLAYWRIGHT_MODULE`. El navegador se
elige con `CHROME_PATH`.

## Qué cubre cada suite

| Suite | Qué protege |
|---|---|
| `regresion` | Lo que YA funcionaba: historial atómico, tema, táctil, pestañas, 3D, persistencia, cubicación |
| `bodega` | Alta, edición, borrado con confirmación, sitios jerárquicos, búsqueda que perdona tildes |
| `materiales` | La lista viva: crece al colocar, metros del trazado real, guarda de firma |
| `puente` | El cruce contra bodega: tengo/falta, lista de compras, enlace manual persistente |
| `movimientos` | Entró/salió/se movió/lo conté, y la reversión por contra-asiento |
| `calidad` | Modo avión, 30 colocaciones seguidas, teclado, foco visible, táctil, estados rotos |
| `recorrido` | El criterio de aceptación completo: abrir → pared → 2 tomas → línea → lista |

## Trampas ya resueltas (no volver a caer)

- `render()` recrea los nodos SVG: nunca guardar handles, re-consultar por `[data-id]`.
- `onDown` llama `setPointerCapture` sin try/catch: con punteros sintéticos hay
  que stubbearlo **antes** de cargar la página (lo hace `arnes.mjs`).
- Los modales enfocan con `setTimeout(...,30)`: hay que **esperar el foco**
  (`esperarFoco`) antes de escribir en otro campo, o el texto se sobrescribe.
- El anillo de foco se **anima** (`button{transition:.12s}` vale por `all`):
  medirlo en t=0 da `0px` y parece que no hay foco.
- `#t3d` y `#t2d` son un control segmentado, no un interruptor: para volver al
  2D hay que tocar `#t2d`.

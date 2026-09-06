// todo.mjs — corre TODAS las pruebas DOM sobre un archivo.
// Uso: node tests/todo.mjs [archivo]      (por defecto PlanElectricoPro.html)
// Sale con codigo 1 si alguna falla, para poder encadenarlo con los gates.

import { spawnSync } from 'node:child_process';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const SUITES = ['regresion', 'bodega', 'materiales', 'puente', 'movimientos', 'calidad',
                'recorrido', 'seleccion', 'punteria'];

let fallaron = 0;
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [`tests/${s}.mjs`, ARCHIVO],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const salida = (r.stdout || '') + (r.stderr || '');
  const resumen = salida.split('\n').filter(l => l.startsWith('[OK]') || l.startsWith('[FALLO]'));
  const fallos = salida.split('\n').filter(l => l.includes('- FALLO'));
  fallos.forEach(l => console.log(l));
  console.log(resumen[resumen.length - 1] || `[FALLO] ${s}: no produjo resumen`);
  if (r.status !== 0) fallaron++;
}
console.log(fallaron
  ? `[FALLO] ${fallaron} suite(s) con pruebas rojas`
  : `[OK]    todas las suites en verde (${SUITES.length})`);
process.exit(fallaron ? 1 : 0);

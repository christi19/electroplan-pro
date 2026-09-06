// seleccion.mjs — el selector: agarrar y mover tubos y cotas.
// Escrita ANTES del arreglo: hoy tiene que FALLAR en los puntos marcados (HOY ROJO).
// Uso: node tests/seleccion.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual,
  elegirHerramienta, puntoLienzo, arrastrarMouse, arrastrarDedo, tocar,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const c = crearCorredor(`SELECCION ${ARCHIVO}`);
console.log(`SELECCION ${ARCHIVO}`);

const { browser, context } = await abrirNavegador();
const page = await abrirApp(context, ARCHIVO);

// ---------------------------------------------------------------- utilidades

/** Dibuja un tubo horizontal y devuelve sus extremos en px de pantalla. */
async function dibujarTubo(fy = 0.66) {
  await elegirHerramienta(page, 'route');
  const a = await puntoLienzo(page, 0.30, fy);
  const b = await puntoLienzo(page, 0.62, fy);
  const antes = await page.evaluate(() =>
    document.querySelectorAll('#canvas [data-kind="route"]').length);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-kind="route"]').length > n,
    antes, { timeout: 8000 });
  await elegirHerramienta(page, 'select');
  return { a, b, mid: { x: (a.x + b.x) / 2, y: a.y } };
}

/** Punto medio ACTUAL de un objeto, en px de pantalla. Nunca se cachea: el
 *  objeto se mueve y el punto viejo cae sobre otra cosa. */
const medioDe = kind => page.evaluate(k => {
  const n = document.querySelector('#canvas [data-kind="' + k + '"]');
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, kind);

const puntosTubo = () => page.evaluate(() => {
  const n = document.querySelector('#canvas [data-kind="route"]');
  return n ? n.getAttribute('points') : null;
});

/** Largo del tubo en unidades de mundo, para detectar que se estire al moverlo. */
const largoTubo = () => page.evaluate(() => {
  const n = document.querySelector('#canvas [data-kind="route"]');
  if (!n) return null;
  const p = n.getAttribute('points').trim().split(/\s+/).map(s => s.split(',').map(Number));
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return Math.round(L * 100) / 100;
});

/**
 * Grosor del blanco agarrable en PIXELES DE PANTALLA.
 * El halo se dibuja con stroke="transparent" y stroke-width en unidades de
 * MUNDO, asi que hay que convertirlo por la escala del viewBox — salvo que
 * lleve vector-effect="non-scaling-stroke", donde ya viene en px de pantalla.
 */
const blancoPx = kind => page.evaluate(k => {
  const svg = document.getElementById('canvas');
  const n = svg.querySelector('[data-kind="' + k + '"][stroke="transparent"]');
  if (!n) return null;
  const sw = parseFloat(n.getAttribute('stroke-width') || 0);
  if (n.getAttribute('vector-effect') === 'non-scaling-stroke') return Math.round(sw);
  const escala = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  return Math.round(sw * escala);
}, kind);

const puedeDeshacer = () => page.evaluate(() => !document.getElementById('undo').disabled);

/** Que objeto quedo elegido, segun lo que la app le muestra al usuario.
 *  El #ctxbar vive oculto en escritorio; el inspector del panel es el que
 *  siempre dice que hay elegido ("Tuberia / canalizacion", "Cota", ...). */
const elegido = () => page.evaluate(() =>
  document.getElementById('panelbody')?.textContent?.replace(/\s+/g, ' ').trim() || '');

/**
 * ALCANCE EFECTIVO: a cuantos px de la linea se puede tocar y aun asi agarrarla.
 * Se mide el COMPORTAMIENTO, no el stroke-width: al electricista no le importa
 * como este implementado el blanco, le importa si le acierta con el dedo.
 */
async function alcance(punto, patron, { dedo = false } = {}) {
  const vacio = await puntoLienzo(page, 0.07, 0.13);
  let mejor = -1;
  for (const d of [0, 4, 8, 9, 12, 16, 20, 21, 25, 30]) {
    await page.mouse.click(vacio.x, vacio.y);              // limpiar seleccion
    if (dedo) await tocar(page, { x: punto.x, y: punto.y + d });
    else await page.mouse.click(punto.x, punto.y + d);
    if (patron.test(await elegido())) mejor = d; else break;
  }
  return mejor;
}

// ------------------------------------------------------------------ el tubo

let tubo, blancoTubo = null;
await c.prueba('preparar: dibujar un tubo', async () => {
  tubo = await dibujarTubo();
  afirmar(await puntosTubo(), 'no se dibujo el tubo');
  blancoTubo = await blancoPx('route');     // se mide recien dibujado
  afirmar(blancoTubo !== null, 'no encontre el halo agarrable del tubo');
});

await c.prueba('tocar el tubo lo selecciona', async () => {
  const m = await medioDe('route');
  await page.mouse.click(m.x, m.y);
  const sb = await page.evaluate(() => {
    const s = document.getElementById('selbar');
    return !!(s && getComputedStyle(s).display !== 'none');
  });
  afirmar(sb, 'tocar el tubo no abrio la barra de seleccion');
});

// HOY ROJO
await c.prueba('arrastrar el tubo lo MUEVE', async () => {
  const antes = await puntosTubo();
  const m = await medioDe('route');
  await page.mouse.click(m.x, m.y);
  await arrastrarMouse(page, m, { x: m.x + 70, y: m.y + 50 });
  const desp = await puntosTubo();
  afirmar(desp !== antes, 'el tubo se selecciona pero queda clavado: no se mueve');
});

// HOY ROJO — la regresion que ya paso con la pared: moverla la estiraba
await c.prueba('mover el tubo NO le cambia el largo', async () => {
  const L0 = await largoTubo();
  const m = await medioDe('route');
  await page.mouse.click(m.x, m.y);
  await arrastrarMouse(page, m, { x: m.x - 40, y: m.y + 30 });
  const L1 = await largoTubo();
  afirmarIgual(L1, L0, 'el tubo cambio de largo con solo moverlo');
});

// HOY ROJO
await c.prueba('mover el tubo es UN solo paso de deshacer', async () => {
  const antes = await puntosTubo();
  const m = await medioDe('route');
  await page.mouse.click(m.x, m.y);
  await arrastrarMouse(page, m, { x: m.x + 55, y: m.y - 35 });
  const movido = await puntosTubo();
  afirmar(movido !== antes, 'el tubo no se movio (lo cubre la prueba anterior)');
  afirmar(await puedeDeshacer(), 'mover el tubo no dejo paso de deshacer');
  await page.click('#undo');
  await page.waitForFunction(
    p => { const n = document.querySelector('#canvas [data-kind="route"]');
           return n && n.getAttribute('points') === p; }, antes, { timeout: 8000 });
});

await c.prueba('un tap seco sobre el tubo NO lo mueve', async () => {
  if (!await puntosTubo()) tubo = await dibujarTubo();     // independiente del orden
  const antes = await puntosTubo();
  const m = await medioDe('route');
  await page.mouse.click(m.x, m.y);
  afirmarIgual(await puntosTubo(), antes, 'un tap seco movio el tubo');
});

// Lo que importa es el ALCANCE, no el stroke-width. Y cada puntero tiene su
// vara: radioSelPx da 22 al dedo y 10 al mouse, a proposito.
await c.prueba('con el DEDO se agarra el tubo a 22px de la linea', async () => {
  const px = await alcance(await medioDe('route'), /tuber/i, { dedo: true });
  console.log(`     (alcance del tubo con dedo: ${px}px · halo dibujado: ${blancoTubo}px)`);
  // radioSelPx(touch)=22 y la comparacion es estricta (d<bd): el alcance util
  // es "casi 22", por eso se exige 21.
  afirmar(px >= 21, `solo se agarra a ${px}px; un dedo necesita ~22 de radio`);
});

await c.prueba('con el MOUSE se agarra el tubo a 9px (su radio es 10, menor a proposito)', async () => {
  const px = await alcance(await medioDe('route'), /tuber/i);
  afirmar(px >= 9, `con mouse solo se agarra a ${px}px; su radio es 10`);
});

// HOY ROJO
await c.prueba('con el dedo tambien se agarra y se mueve', async () => {
  const antes = await puntosTubo();
  const m = await medioDe('route');
  await arrastrarDedo(page, m, { x: m.x + 60, y: m.y + 45 });
  afirmar(await puntosTubo() !== antes, 'con el dedo el tubo no se mueve');
});

// ------------------------------------------------------------------ la cota

let cota, blancoCota = null;
await c.prueba('preparar: dibujar una cota', async () => {
  await elegirHerramienta(page, 'dim');
  // Lejos de la casa de ejemplo: pegada a una pared, el ancla de esquina gana
  // por diseno y estariamos midiendo la prioridad del ancla, no la cota.
  const a = await puntoLienzo(page, 0.10, 0.14);
  const b = await puntoLienzo(page, 0.40, 0.14);
  await arrastrarMouse(page, a, b);
  await page.waitForFunction(
    () => document.querySelectorAll('#canvas [data-kind="dim"]').length > 0, null, { timeout: 8000 });
  await elegirHerramienta(page, 'select');
  cota = { a, b, mid: { x: (a.x + b.x) / 2, y: a.y } };
  blancoCota = await blancoPx('dim');        // se mide recien dibujada
  afirmar(blancoCota !== null, 'no encontre el halo agarrable de la cota');
});

const geoCota = () => page.evaluate(() => {
  const n = document.querySelector('#canvas [data-kind="dim"]');
  return n ? [n.getAttribute('x1'), n.getAttribute('y1'), n.getAttribute('x2'), n.getAttribute('y2')].join('|') : null;
});
const geoParedes = () => page.evaluate(() =>
  [...document.querySelectorAll('#canvas [data-kind="wall"]')]
    .map(n => n.getAttribute('x1') + ',' + n.getAttribute('y1')).join(';'));

// HOY ROJO
await c.prueba('arrastrar la cota la MUEVE', async () => {
  const antes = await geoCota();
  const m = await medioDe('dim');
  await page.mouse.click(m.x, m.y);
  await arrastrarMouse(page, m, { x: m.x + 50, y: m.y - 40 });
  afirmar(await geoCota() !== antes, 'la cota se selecciona pero queda clavada');
});

await c.prueba('mover una cota NO deforma la casa', async () => {
  const paredes0 = await geoParedes();
  const m = await medioDe('dim');
  await page.mouse.click(m.x, m.y);
  await arrastrarMouse(page, m, { x: m.x + 30, y: m.y + 30 });
  afirmarIgual(await geoParedes(), paredes0, 'mover la cota movio paredes del plano');
});

await c.prueba('con el DEDO se agarra la cota a 22px de la linea', async () => {
  const px = await alcance(await medioDe('dim'), /cota/i, { dedo: true });
  console.log(`     (alcance de la cota con dedo: ${px}px · halo dibujado: ${blancoCota}px)`);
  afirmar(px >= 21, `solo se agarra a ${px}px; un dedo necesita ~22 de radio`);
});

// ------------------------------------------------- no robarle el tap a nadie

await c.prueba('el halo mas gordo no le roba el tap a un simbolo cercano', async () => {
  // Se coloca una toma justo encima del tubo: tocarla tiene que elegir la TOMA.
  await elegirHerramienta(page, 'toma');
  const p = await puntoLienzo(page, 0.40, 0.66);
  const antes = await page.evaluate(() =>
    document.querySelectorAll('#canvas [data-kind="element"]').length);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-kind="element"]').length > n,
    antes, { timeout: 8000 });
  await elegirHerramienta(page, 'select');
  const centro = await page.evaluate(() => {
    const ns = [...document.querySelectorAll('#canvas [data-kind="element"][data-id]')];
    const n = ns[ns.length - 1];
    const r = n.getBoundingClientRect();
    return { id: n.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(centro.x, centro.y);
  // FALSO VERDE corregido: esta asercion leia #ctxbar, que en escritorio vive
  // OCULTO. textContent daba "" y !/tuber/.test("") pasaba SIEMPRE — la prueba
  // no medía nada. El inspector (#panelbody) es el que de verdad dice qué quedó
  // elegido, y ahora además se exige el resultado POSITIVO: tocando la toma
  // tiene que quedar elegida la toma, no basta con que no salga el tubo.
  const q = await elegido();
  afirmar(!/tuber|canaliz/i.test(q), `tocando la toma se eligio el tubo: "${q.slice(0, 60)}"`);
  afirmar(/toma|tomacorriente/i.test(q), `tocando la toma no quedo elegida la toma: "${q.slice(0, 60)}"`);
});

await c.prueba('arrastrar en el vacio sigue haciendo marquesina', async () => {
  await elegirHerramienta(page, 'select');
  const v1 = await puntoLienzo(page, 0.10, 0.12), v2 = await puntoLienzo(page, 0.50, 0.45);
  await page.mouse.move(v1.x, v1.y); await page.mouse.down();
  // varios pasos: hay que superar la histeresis (3px con mouse) para que
  // marquesinaViva() llegue a dibujar el rectangulo #gVivoMarco
  for (let i = 1; i <= 6; i++)
    await page.mouse.move(v1.x + (v2.x - v1.x) * i / 6, v1.y + (v2.y - v1.y) * i / 6);
  const viva = await page.evaluate(() => !!document.getElementById('gVivoMarco'));
  await page.mouse.up();
  afirmar(viva, 'no aparecio la marquesina viva al arrastrar en el vacio');
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

await c.prueba('con Ctrl, un tap cercano al tubo lo SUMA (no reemplaza)', async () => {
  // Al ampliar el rescate del tap cercano, un Ctrl mal apuntado podia caer en el
  // rescate y reemplazar la seleccion entera en vez de agrandarla.
  if (!await puntosTubo()) tubo = await dibujarTubo();
  await elegirHerramienta(page, 'select');
  const elem = await page.evaluate(() => {
    const n = document.querySelector('#canvas [data-kind="element"][data-id]');
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(elem.x, elem.y);                       // 1 elegido
  const m = await medioDe('route');
  await page.keyboard.down('Control');
  await page.mouse.click(m.x, m.y + 12);                        // cerca, no encima
  await page.keyboard.up('Control');
  const cuenta = await page.evaluate(() =>
    document.getElementById('selbar')?.textContent?.match(/(\d+)\s*sel/)?.[1] || '?');
  afirmarIgual(cuenta, '2', `Ctrl cerca del tubo dejo ${cuenta} elegidos en vez de sumar`);
});

await c.prueba('con la capa electrica bloqueada, el tubo no se agarra', async () => {
  await page.click('.tabs button[data-tab="layers"]');
  await page.waitForSelector('[data-lock="electrical"]', { timeout: 5000 });
  await page.click('[data-lock="electrical"]');
  await page.click('.tabs button[data-tab="insp"]');
  const vacio = await puntoLienzo(page, 0.07, 0.13);
  await page.mouse.click(vacio.x, vacio.y);
  const m = await medioDe('route');
  await tocar(page, { x: m.x, y: m.y + 12 });
  afirmar(!/tuber/i.test(await elegido()),
    'con la capa bloqueada el rescate igual agarro el tubo');
  await page.click('.tabs button[data-tab="layers"]');
  await page.click('[data-lock="electrical"]');                 // devolver el candado
  await page.click('.tabs button[data-tab="insp"]');
});

await c.prueba('un tubo que termina en una esquina NO tapa el vertice', async () => {
  // Lo levanto la revision del equipo: si el agarre del tubo se come la esquina,
  // el vertice de la pared queda imposible de mover. El ancla corre ANTES del
  // rescate justamente para que gane, pero hay que demostrarlo.
  await elegirHerramienta(page, 'select');
  const esquina = await page.evaluate(() => {
    const n = document.querySelector('#canvas [data-kind="node"]');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  afirmar(esquina, 'no hay esquinas dibujadas en el plano de ejemplo');

  // Se tiende un tubo que TERMINA exactamente en esa esquina.
  await elegirHerramienta(page, 'route');
  await page.mouse.click(esquina.x - 120, esquina.y);
  await page.mouse.click(esquina.x, esquina.y);
  await page.keyboard.press('Enter');
  await elegirHerramienta(page, 'select');

  // Tocar la esquina tiene que agarrar la ESQUINA, no el tubo: moverla deforma
  // la pared (que es lo que el usuario quiere al agarrar un vertice).
  const paredes0 = await geoParedes();
  await arrastrarMouse(page, esquina, { x: esquina.x + 40, y: esquina.y + 40 });
  afirmar(await geoParedes() !== paredes0,
    'tocar la esquina agarro el tubo: el vertice quedo intocable');
});

await c.prueba('el selector no genero errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

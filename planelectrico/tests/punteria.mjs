// punteria.mjs — QUIEN gana el tap, y que le pasa al grupo cuando el tap falla.
// Escrita ANTES del arreglo: los puntos marcados (HOY ROJO) tienen que fallar.
//
// Sale de una revision adversarial que corrio contra el archivo YA empujado y
// encontro dos regresiones abiertas por el ciclo anterior del selector:
//   B) sacar route/dim de OBJ_ENCIMA arreglo el vertice tapado por el tubo,
//      pero abrio su espejo: el tap APUNTADO al tubo cerca de una esquina
//      agarra la esquina y deforma la casa.
//   A) el rescate geometrico hace setSel([uno]) sin preguntar: si el dedo cae
//      en el hueco al lado de un miembro de una seleccion multiple, el grupo
//      entero se pierde.
// Uso: node tests/punteria.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual,
  elegirHerramienta, puntoLienzo, arrastrarMouse, arrastrarDedo, tocar,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const c = crearCorredor(`PUNTERIA ${ARCHIVO}`);
console.log(`PUNTERIA ${ARCHIVO}`);

const { browser, context } = await abrirNavegador();
const page = await abrirApp(context, ARCHIVO);

// ---------------------------------------------------------------- utilidades

/** Lo que la app le DICE al usuario que hay elegido. #ctxbar vive oculto en
 *  escritorio: leerlo da "" y cualquier asercion sobre el pasa siempre. */
const elegido = () => page.evaluate(() =>
  document.getElementById('panelbody')?.textContent?.replace(/\s+/g, ' ').trim() || '');

// La barra OCULTA conserva su texto viejo: si se lee el "N sel." antes de mirar
// el display, una seleccion vacia se lee como la de hace tres pruebas. El estado
// manda sobre el texto.
const cuantosElegidos = () => page.evaluate(() => {
  const s = document.getElementById('selbar');
  if (!s || getComputedStyle(s).display === 'none') return 0;
  const m = (s.textContent || '').match(/(\d+)\s*sel/);
  return m ? +m[1] : 1;
});

/** Firma geometrica de TODAS las paredes: si cambia, la casa se deformo. */
const geoParedes = () => page.evaluate(() =>
  [...document.querySelectorAll('#canvas [data-kind="wall"]')]
    .map(n => n.getAttribute('x1') + ',' + n.getAttribute('y1') + ',' +
              n.getAttribute('x2') + ',' + n.getAttribute('y2')).join(';'));

const puntosDe = id => page.evaluate(i => {
  const n = document.querySelector(`#canvas [data-kind="route"][data-id="${i}"]`);
  return n ? n.getAttribute('points') : null;
}, id);

const vaciar = async () => {
  const v = await puntoLienzo(page, 0.07, 0.13);
  await page.mouse.click(v.x, v.y);
};

/** Dibuja un tubo horizontal entre dos puntos de pantalla y devuelve su id. */
async function tenderTubo(a, b) {
  await elegirHerramienta(page, 'route');
  const antes = await page.evaluate(() => [...document.querySelectorAll('#canvas [data-kind="route"][data-id]')]
    .map(n => n.getAttribute('data-id')));
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Enter');
  await page.waitForFunction(n => new Set([...document.querySelectorAll('#canvas [data-kind="route"][data-id]')]
    .map(x => x.getAttribute('data-id'))).size > n, antes.length, { timeout: 8000 });
  const id = await page.evaluate(prev => [...new Set([...document.querySelectorAll('#canvas [data-kind="route"][data-id]')]
    .map(n => n.getAttribute('data-id')))].find(x => !prev.includes(x)), antes);
  await elegirHerramienta(page, 'select');
  return id;
}

// =========================================================== B) el espejo del vertice

let esquina = null, tuboId = null, dSep = null;

/** Posicion ACTUAL del primer vertice dibujado. Nunca se cachea entre pruebas:
 *  si una deforma la casa, el punto viejo deja de tener un vertice debajo y la
 *  siguiente falla por arrastre en vez de por lo que mide. */
const esquinaViva = () => page.evaluate(() => {
  const n = document.querySelector('#canvas [data-kind="node"]');
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await c.prueba('preparar: tender un tubo que PASA cerca de una esquina dibujada', async () => {
  esquina = await page.evaluate(() => {
    const n = document.querySelector('#canvas [data-kind="node"]');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  afirmar(esquina, 'el plano de ejemplo no dibuja ningun vertice');
  // Los extremos van LEJOS de la esquina para que el iman de dibujo no los
  // pegue a ella: lo que tiene que pasar cerca es el MEDIO del tubo.
  tuboId = await tenderTubo({ x: esquina.x - 160, y: esquina.y + 10 },
                            { x: esquina.x + 160, y: esquina.y + 10 });
  afirmar(tuboId, 'no se creo el tubo');
  // Separacion REAL medida, no supuesta: el iman de grilla pudo correr la linea.
  dSep = await page.evaluate(([i, e]) => {
    const n = document.querySelector(`#canvas [data-kind="route"][data-id="${i}"]`);
    const r = n.getBoundingClientRect();
    return Math.abs((r.top + r.height / 2) - e.y);
  }, [tuboId, esquina]);
  // El defecto solo existe dentro del radio del ancla (14px con mouse).
  afirmar(dSep >= 4 && dSep <= 13,
    `el tubo quedo a ${Math.round(dSep)}px de la esquina; la prueba necesita 4..13`);
});

/** Punto EXACTAMENTE sobre el eje del tubo, a la altura de la esquina. */
const sobreElTubo = () => page.evaluate(i => {
  const n = document.querySelector(`#canvas [data-kind="route"][data-id="${i}"]`);
  const r = n.getBoundingClientRect();
  return { y: r.top + r.height / 2 };
}, tuboId);

// HOY ROJO
await c.prueba('tocar el tubo cerca de una esquina elige el TUBO, no la esquina', async () => {
  await vaciar();
  const eje = await sobreElTubo();
  const e = await esquinaViva();
  await page.mouse.click(e.x, eje.y);
  const q = await elegido();
  afirmar(/tuber|canaliz/i.test(q),
    `apuntando al tubo a ${Math.round(dSep)}px de la esquina quedo elegido: "${q.slice(0, 60)}"`);
});

// HOY ROJO — este es el dano de verdad: la casa se deforma sola
await c.prueba('arrastrar el tubo cerca de una esquina NO deforma la casa', async () => {
  await vaciar();
  const e = await esquinaViva();
  const paredes0 = await geoParedes();
  const pts0 = await puntosDe(tuboId);
  const eje = await sobreElTubo();
  await arrastrarMouse(page, { x: e.x, y: eje.y }, { x: e.x + 60, y: eje.y + 45 });
  const paredes1 = await geoParedes(), pts1 = await puntosDe(tuboId);
  await page.click('#undo');                       // restaurar ANTES de afirmar
  afirmarIgual(paredes1, paredes0, 'arrastrar el tubo movio una esquina de la casa');
  afirmar(pts1 !== pts0, 'el tubo no se movio');
});

// La otra mitad: corregir el espejo no puede volver a tapar el vertice.
await c.prueba('apuntar A LA ESQUINA sigue agarrando la esquina', async () => {
  await vaciar();
  const e = await esquinaViva();
  const paredes0 = await geoParedes();
  const pts0 = await puntosDe(tuboId);
  await arrastrarMouse(page, e, { x: e.x + 50, y: e.y - 40 });
  const paredes1 = await geoParedes(), pts1 = await puntosDe(tuboId);
  await page.click('#undo');                       // restaurar ANTES de afirmar
  afirmar(paredes1 !== paredes0,
    'apuntando a la esquina no se movio ningun vertice: el tubo se la volvio a comer');
  afirmarIgual(pts1, pts0, 'apuntando a la esquina se movio el tubo');
});

// =========================================== A) el rescate contra la seleccion multiple

await c.prueba('preparar: elegir un grupo con el marco', async () => {
  await vaciar();
  await elegirHerramienta(page, 'select');
  const v1 = await puntoLienzo(page, 0.05, 0.08), v2 = await puntoLienzo(page, 0.95, 0.95);
  await arrastrarMouse(page, v1, v2, 8);
  const n = await cuantosElegidos();
  afirmar(n > 1, `el marco dejo ${n} elegidos; la prueba necesita un grupo`);
});

// HOY ROJO — el hueco al lado de un miembro no puede borrar el grupo
await c.prueba('un toque en el hueco JUNTO a un miembro conserva el grupo', async () => {
  const antes = await cuantosElegidos();
  const eje = await sobreElTubo();
  // 12px fuera del eje: el halo del tubo mide 16px (+-8), asi que el DOM NO
  // acierta y el tap cae en el rescate. Con el dedo (radio 22) el rescate si
  // lo encuentra: es exactamente el camino que borraba la seleccion.
  const e = await esquinaViva();
  await tocar(page, { x: e.x + 40, y: eje.y + 12 });
  const desp = await cuantosElegidos();
  afirmarIgual(desp, antes, `el rescate dejo ${desp} elegidos de ${antes}: se perdio el grupo`);
});

// La otra mitad: el vacio DE VERDAD tiene que seguir deseleccionando.
await c.prueba('un toque en el vacio real SI deselecciona', async () => {
  const v = await puntoLienzo(page, 0.07, 0.13);
  await tocar(page, v);
  afirmarIgual(await cuantosElegidos(), 0, 'tocar el vacio ya no deselecciona');
});

// ================================================ D) sumar con la vara del puntero

await c.prueba('con Ctrl, tocar el VACIO conserva la seleccion', async () => {
  // La revision proponia bajar el alcance de sumar (22px) al del puntero (10 con
  // mouse) por simetria con el clic normal. Se descarto MIDIENDO el fallo que
  // eso produce: un Ctrl que se pasa de largo no cae en "no sumo nada", cae en
  // el vacio — y el vacio hacia setSel([]). Achicar el alcance solo habria hecho
  // ese barrido mas frecuente. El alcance generoso de sumar es indulgencia con
  // la punteria y ademas es preexistente; lo que estaba roto era el castigo.
  await vaciar();
  await elegirHerramienta(page, 'select');
  const v1 = await puntoLienzo(page, 0.05, 0.08), v2 = await puntoLienzo(page, 0.95, 0.95);
  await arrastrarMouse(page, v1, v2, 8);
  const antes = await cuantosElegidos();
  afirmar(antes > 1, `el marco dejo ${antes} elegidos; la prueba necesita un grupo`);
  const v = await puntoLienzo(page, 0.07, 0.13);
  await page.keyboard.down('Control');
  await page.mouse.click(v.x, v.y);
  await page.keyboard.up('Control');
  const desp = await cuantosElegidos();
  afirmarIgual(desp, antes,
    `Ctrl en el vacio dejo ${desp} de ${antes} elegidos: barrio el grupo entero`);
});

await c.prueba('SIN Ctrl, tocar el vacio sigue deseleccionando', async () => {
  const v = await puntoLienzo(page, 0.07, 0.13);
  await page.mouse.click(v.x, v.y);
  afirmarIgual(await cuantosElegidos(), 0, 'el vacio dejo de deseleccionar');
});

await c.prueba('la punteria no genero errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

// ======================================= E) los primeros 700ms de vida de la app

// dedoEnModoLapiz() compara performance.now() contra ultimoLapiz, que arranca en
// 0. Como performance.now() arranca en 0 al cargar la pagina, durante los
// primeros LAPIZ_GRACIA_MS la resta da menos que la ventana y la guarda dice
// "el lapiz esta dibujando" SIN QUE HAYA HABIDO NINGUN LAPIZ. Se fija el reloj
// dentro de esa ventana para que la prueba no dependa de lo rapida que sea la
// maquina: la app cree que lleva 300 ms viva, que es lo que cree de verdad un
// iPad recien abierto.
await c.prueba('el primer toque de dedo tras abrir la app NO se descarta', async () => {
  const ctx2 = await browser.newContext({ hasTouch: true, isMobile: true,
    viewport: { width: 820, height: 1180 } });
  await ctx2.addInitScript(() => {
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
    const real = performance.now.bind(performance);
    performance.now = () => Math.min(real(), 300);
  });
  const p2 = await abrirApp(ctx2, ARCHIVO);
  const pared = await p2.evaluate(() => {
    const n = document.querySelector('#canvas [data-kind="wall"][data-id]');
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await p2.evaluate(async pt => {
    const svg = document.getElementById('canvas');
    const ev = (t, n, b) => t.dispatchEvent(new PointerEvent(n, { pointerId: 1, pointerType: 'touch',
      isPrimary: true, bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, buttons: b }));
    ev(document.elementFromPoint(pt.x, pt.y) || svg, 'pointerdown', 1);
    await new Promise(r => requestAnimationFrame(r));
    ev(svg, 'pointerup', 0);
  }, pared);
  const q = await p2.evaluate(() =>
    document.getElementById('panelbody')?.textContent?.replace(/\s+/g, ' ').trim() || '');
  await ctx2.close();
  afirmar(q && !/nada seleccionad/i.test(q),
    `recien abierta la app, el toque de dedo se descarto como "la mano del lapiz": "${q.slice(0, 50)}"`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

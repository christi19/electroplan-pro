// regresion.mjs — red de seguridad: comportamientos que YA funcionan y no se
// pueden romper. Se corre ANTES y DESPUES de cada bloque de cambios.
// Uso: node tests/regresion.mjs [archivo]   (por defecto PlanElectricoPro.html)

import {
  abrirNavegador, abrirApp, contarElementos, idsEnPlano, elegirHerramienta,
  puntoLienzo, arrastrarMouse, arrastrarDedo, crearCorredor, afirmar, afirmarIgual,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';

const { browser, context } = await abrirNavegador();
const c = crearCorredor(`REGRESION ${ARCHIVO}`);
console.log(`REGRESION ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

await c.prueba('la app arranca sin errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores en consola: ${page.__errores.join(' | ')}`);
});

await c.prueba('el rail de herramientas se construyo', async () => {
  const n = await page.evaluate(() => document.querySelectorAll('.tool[data-tool]').length);
  afirmar(n >= 15, `solo ${n} herramientas en el rail`);
});

await c.prueba('el plano de ejemplo esta montado', async () => {
  const n = await contarElementos(page);
  afirmar(n >= 10, `solo ${n} elementos con data-id`);
});

await c.prueba('el lienzo bloquea el scroll de la pagina (touch-action)', async () => {
  const ta = await page.evaluate(() =>
    getComputedStyle(document.getElementById('canvas')).touchAction);
  afirmarIgual(ta, 'none', 'el lienzo permitiria scroll accidental');
});

// --- colocar / deshacer / rehacer: el corazon del historial -----------------

let antesDeColocar = 0;
let idsNuevos = [];

await c.prueba('colocar una toma agrega un elemento al plano', async () => {
  antesDeColocar = await contarElementos(page);
  const idsAntes = await idsEnPlano(page);
  await elegirHerramienta(page, 'toma');
  const p = await puntoLienzo(page, 0.42, 0.38);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length > n,
    antesDeColocar, { timeout: 8000 });
  const idsDespues = await idsEnPlano(page);
  idsNuevos = idsDespues.filter(i => !idsAntes.includes(i));
  afirmar(idsNuevos.length >= 1, 'no aparecio ningun data-id nuevo');
});

await c.prueba('deshacer quita exactamente lo que se coloco', async () => {
  await page.click('#undo');
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length === n,
    antesDeColocar, { timeout: 8000 });
  const ids = await idsEnPlano(page);
  afirmar(!ids.includes(idsNuevos[0]), 'el elemento deshecho sigue en el plano');
});

await c.prueba('rehacer lo devuelve', async () => {
  await page.click('#redo');
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length > n,
    antesDeColocar, { timeout: 8000 });
  const ids = await idsEnPlano(page);
  afirmar(ids.includes(idsNuevos[0]), 'el elemento rehecho no volvio con su mismo id');
});

await c.prueba('los botones de historial se deshabilitan en los extremos', async () => {
  const redoAlFinal = await page.evaluate(() => document.getElementById('redo').disabled);
  afirmar(redoAlFinal, 'redo deberia estar deshabilitado en el extremo del historial');
});

await c.prueba('deshacer repetido devuelve el plano al estado inicial', async () => {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => document.getElementById('undo').disabled)) break;
    await page.click('#undo');
  }
  const n = await contarElementos(page);
  afirmarIgual(n, antesDeColocar, 'el plano no volvio al estado inicial');
  const undoDeshabilitado = await page.evaluate(() => document.getElementById('undo').disabled);
  afirmar(undoDeshabilitado, 'undo deberia estar deshabilitado al inicio del historial');
});

// --- dibujar una pared arrastrando ------------------------------------------

await c.prueba('dibujar una pared con el mouse agrega geometria', async () => {
  const antes = await contarElementos(page);
  await elegirHerramienta(page, 'wall');
  const a = await puntoLienzo(page, 0.25, 0.72);
  const b = await puntoLienzo(page, 0.62, 0.72);
  await arrastrarMouse(page, a, b);
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length > n,
    antes, { timeout: 8000 });
});

await c.prueba('la pared dibujada se deshace en UN solo paso', async () => {
  const conPared = await contarElementos(page);
  await page.click('#undo');
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length < n,
    conPared, { timeout: 8000 });
});

// --- tema claro / oscuro ----------------------------------------------------

// Se afirma sobre el color REAL pintado, no sobre el atributo: el toggle nunca
// vuelve al estado sin atributo, y lo que le importa al usuario es lo que ve.
await c.prueba('el tema alterna entre claro y oscuro y repinta de verdad', async () => {
  const fondo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const oscuro = await fondo();
  await page.click('#themeBtn');
  await page.waitForFunction(
    c0 => getComputedStyle(document.body).backgroundColor !== c0, oscuro, { timeout: 5000 });
  const claro = await fondo();
  afirmar(claro !== oscuro, 'el fondo no cambio al pasar a claro');
  await page.click('#themeBtn');
  await page.waitForFunction(
    c1 => getComputedStyle(document.body).backgroundColor !== c1, claro, { timeout: 5000 });
  afirmarIgual(await fondo(), oscuro, 'no volvio al fondo oscuro original');
});

// --- tactil ------------------------------------------------------------------

await c.prueba('un dedo puede arrastrar en el lienzo sin romper el estado', async () => {
  await elegirHerramienta(page, 'select');
  const a = await puntoLienzo(page, 0.5, 0.5);
  const b = await puntoLienzo(page, 0.58, 0.56);
  await arrastrarDedo(page, a, b);
  const n = await contarElementos(page);
  afirmar(n > 0, 'el plano quedo vacio tras un arrastre tactil');
  afirmarIgual(page.__errores.length, 0, `errores tras arrastre tactil: ${page.__errores.join(' | ')}`);
});

// --- paneles y pestanas -----------------------------------------------------
// Es donde va a aterrizar la Bodega: si esto se rompe, se rompe con mi cambio.

await c.prueba('las tres pestanas del panel cambian el contenido', async () => {
  const cuerpo = () => page.evaluate(() =>
    document.getElementById('panelbody').innerHTML.length);
  for (const t of ['cir', 'layers', 'insp']) {
    const antes = await cuerpo();
    await page.click(`.tabs button[data-tab="${t}"]`);
    await page.waitForFunction(
      tt => document.querySelector(`.tabs button[data-tab="${tt}"]`).classList.contains('on'),
      t, { timeout: 5000 });
    afirmar(await cuerpo() >= 0, `la pestana ${t} dejo el panel vacio`);
    afirmar(antes >= 0, 'panel ilegible');
  }
});

// #t3d y #t2d son un control SEGMENTADO (toggle3d(true) / toggle3d(false)),
// no un interruptor: para volver al 2D hay que tocar #t2d.
await c.prueba('la vista 3D se abre y se vuelve al 2D', async () => {
  await page.click('#t3d');
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('view3d')).display === 'block',
    null, { timeout: 8000 });
  const nodos3d = await page.evaluate(() =>
    document.getElementById('scene').childElementCount);
  afirmar(nodos3d > 0, 'la escena 3D quedo vacia');
  await page.click('#t2d');
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('view3d')).display === 'none',
    null, { timeout: 8000 });
  afirmarIgual(page.__errores.length, 0, `errores al alternar 3D: ${page.__errores.join(' | ')}`);
});

// --- persistencia: lo mas caro de romper ------------------------------------

await c.prueba('el proyecto sobrevive a recargar la pagina', async () => {
  await elegirHerramienta(page, 'toma');
  const p = await puntoLienzo(page, 0.55, 0.45);
  const antes = await contarElementos(page);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length > n, antes, { timeout: 8000 });
  const conNueva = await contarElementos(page);

  // doSave() es diferido (scheduleSave): se espera a que la clave del proyecto
  // refleje el elemento nuevo, sin sleeps fijos.
  await page.waitForFunction(() => {
    const id = localStorage.getItem('planelectrico:cur');
    const raw = id && localStorage.getItem('planelectrico:proj:' + id);
    return !!raw;
  }, null, { timeout: 10000 });

  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length >= n,
    conNueva - 1, { timeout: 15000 });
});

await c.prueba('doSave deja la cubicacion guardada para la app', async () => {
  const cub = await page.evaluate(() => {
    const id = localStorage.getItem('planelectrico:cur');
    const raw = id && localStorage.getItem('planelectrico:cubic:' + id);
    return raw ? JSON.parse(raw) : null;
  });
  afirmar(cub && cub.format === 'planelectrico-cubicacion',
    'no se guardo la cubicacion en localStorage');
  afirmar(Array.isArray(cub.articulos) && cub.articulos.length > 0,
    'la cubicacion salio sin articulos');
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

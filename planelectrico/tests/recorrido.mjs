// recorrido.mjs — el criterio de aceptacion 5, ejecutable.
// "Alguien sin instrucciones puede: abrir la app -> colocar una pared -> poner
//  dos tomas -> conectarlas con una linea -> ver la lista de materiales."
// Cada paso se hace usando SOLO lo que se ve en pantalla: si para dar un paso
// hay que saber algo que la pantalla no dice, la prueba lo deja escrito.
// Uso: node tests/recorrido.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual,
  puntoLienzo, arrastrarMouse, contarElementos,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const { browser, context } = await abrirNavegador();
const c = crearCorredor(`RECORRIDO ${ARCHIVO}`);
console.log(`RECORRIDO ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

/** Toca una herramienta buscandola por su ETIQUETA VISIBLE, como haria alguien. */
async function tocarHerramientaPorTexto(texto) {
  const sel = await page.evaluate(t => {
    const b = [...document.querySelectorAll('.tool[data-tool]')]
      .find(x => x.textContent.toLowerCase().includes(t.toLowerCase()));
    return b ? b.dataset.tool : null;
  }, texto);
  afirmar(sel, `ninguna herramienta se llama "${texto}" en pantalla`);
  await page.click(`.tool[data-tool="${sel}"]`);
  await page.waitForFunction(
    s => document.querySelector(`.tool[data-tool="${s}"]`)?.classList.contains('on'),
    sel, { timeout: 5000 });
  return sel;
}

// --- paso 0: lo primero que ve -----------------------------------------------

await c.prueba('PASO 0 · al abrir, la app enseña sola', async () => {
  // El tutorial lo quita el arnes; se comprueba que EXISTE y que el lienzo
  // arranca con un plano de ejemplo tocable, no con una hoja en blanco.
  const hayEjemplo = await contarElementos(page);
  afirmar(hayEjemplo > 0, 'la app abre vacia: no hay nada que tocar sin miedo');
  const tieneAyuda = await page.evaluate(() => !!document.getElementById('helpBtn'));
  afirmar(tieneAyuda, 'no hay forma de volver a ver la explicacion');
});

await c.prueba('PASO 0 · toda herramienta tiene etiqueta de palabras, no solo icono', async () => {
  const mudas = await page.evaluate(() =>
    [...document.querySelectorAll('.tool[data-tool]')]
      .filter(b => !/[a-záéíóúñ]{3,}/i.test(b.textContent))
      .map(b => b.dataset.tool));
  afirmarIgual(mudas.length, 0, `herramientas sin palabra visible: ${mudas.join(', ')}`);
});

// --- paso 1: colocar una pared -----------------------------------------------

let paredesAntes = 0;
await c.prueba('PASO 1 · colocar una pared, buscandola por su nombre', async () => {
  paredesAntes = await page.evaluate(() =>
    document.querySelectorAll('#canvas [data-kind="wall"], #canvas [data-wall]').length);
  await tocarHerramientaPorTexto('Pared');
  const a = await puntoLienzo(page, 0.22, 0.78);
  const b = await puntoLienzo(page, 0.60, 0.78);
  const antes = await contarElementos(page);
  await arrastrarMouse(page, a, b);
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-id]').length > n, antes, { timeout: 8000 });
});

// --- paso 2: dos tomas --------------------------------------------------------

await c.prueba('PASO 2 · poner dos tomas, buscandolas por su nombre', async () => {
  await tocarHerramientaPorTexto('Toma');
  for (const fx of [0.30, 0.52]) {
    const antes = await contarElementos(page);
    const p = await puntoLienzo(page, fx, 0.755);
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(
      n => document.querySelectorAll('#canvas [data-id]').length > n, antes, { timeout: 8000 });
  }
});

// --- paso 3: conectarlas con una linea ---------------------------------------

await c.prueba('PASO 3 · conectar las dos tomas con una linea', async () => {
  const tubosAntes = await page.evaluate(() =>
    document.querySelectorAll('#canvas [data-kind="route"]').length);
  await tocarHerramientaPorTexto('Tubo');
  const a = await puntoLienzo(page, 0.30, 0.755);
  const b = await puntoLienzo(page, 0.52, 0.755);
  // Como lo intentaria alguien que nunca uso una app de diseno: ARRASTRAR
  // de una toma a la otra, igual que en el resto de la app.
  await arrastrarMouse(page, a, b);
  const trasArrastre = await page.evaluate(() =>
    document.querySelectorAll('#canvas [data-kind="route"]').length);
  const conArrastre = trasArrastre > tubosAntes;

  // Camino que la app SI implementa: tocar, tocar y cerrar con el boton/Enter.
  if (!conArrastre) {
    await page.keyboard.press('Escape');
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(
    n => document.querySelectorAll('#canvas [data-kind="route"]').length > n,
    tubosAntes, { timeout: 8000 });

  // El paso SE COMPLETA. Lo que esta prueba deja registrado es el hueco real:
  // en esta app todo lo demas se dibuja ARRASTRANDO (pared, cuarto, puerta,
  // ventana, escalera lo dicen en su propia pista), pero conectar es
  // tocar-tocar-cerrar. Esa inconsistencia de GESTO es el hueco del criterio 5,
  // no la falta de explicacion: la pista de la herramienta si lo explica.
  if (!conArrastre) console.log('     (nota: conectar NO admite arrastre continuo; ' +
    'se completo por tocar-tocar-cerrar)');
  const pista = await page.evaluate(() => document.getElementById('hint')?.textContent || '');
  afirmar(/l[ií]nea/i.test(pista),
    `la pista no habla de conectar con una linea: "${pista.slice(0, 80)}"`);
  afirmar(/✔|Enter/.test(pista), 'la pista no dice como cerrar el trazo');
});

// --- paso 4: ver la lista de materiales --------------------------------------

await c.prueba('PASO 4 · encontrar la lista de materiales sin que nadie explique', async () => {
  const pestana = await page.evaluate(() =>
    [...document.querySelectorAll('.tabs button')]
      .find(b => /material/i.test(b.textContent))?.dataset.tab);
  afirmar(pestana, 'no hay ninguna pestana que se llame "Materiales"');
  await page.click(`.tabs button[data-tab="${pestana}"]`);
  await page.waitForSelector('#matLista', { timeout: 5000 });
  const filas = await page.evaluate(() =>
    document.querySelectorAll('#matLista [data-mat]').length);
  afirmar(filas > 0, 'la lista salio vacia despues de dibujar');
});

await c.prueba('PASO 4 · la lista refleja lo que acaba de dibujar', async () => {
  const cifras = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('#panelbody .matstat').forEach(n => {
      o[n.querySelector('span').textContent.trim()] = parseFloat(n.querySelector('b').textContent);
    });
    return o;
  });
  afirmar(cifras.puntos >= 2, `esperaba al menos las 2 tomas nuevas, hay ${cifras.puntos}`);
  afirmar(cifras['m de tubo'] > 0, 'la linea dibujada no aparece como metros de tubo');
});

// --- paso 5: el remate, que es lo que hace valiosa la app ---------------------

await c.prueba('PASO 5 · la app dice sola que hacer con la bodega', async () => {
  const puente = await page.evaluate(() =>
    document.querySelector('.matpuente')?.textContent.replace(/\s+/g, ' ').trim());
  afirmar(puente, 'no hay ninguna frase que conecte la lista con la bodega');
  afirmar(/Bodega/i.test(puente), 'la frase no nombra la bodega');
});

await c.prueba('el recorrido completo no dejo ningun error de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

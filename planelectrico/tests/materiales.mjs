// materiales.mjs — pruebas DOM de la lista de materiales en vivo.
// Uso: node tests/materiales.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual,
  elegirHerramienta, puntoLienzo,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const { browser, context } = await abrirNavegador();
const c = crearCorredor(`MATERIALES ${ARCHIVO}`);
console.log(`MATERIALES ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

const abrirMat = async () => {
  await page.click('.tabs button[data-tab="mat"]');
  await page.waitForSelector('#matLista', { timeout: 5000 });
};

/** Lee las tres cifras grandes del encabezado. */
const cifras = () => page.evaluate(() => {
  const s = [...document.querySelectorAll('#panelbody .matstat')];
  const o = {};
  s.forEach(n => { o[n.querySelector('span').textContent.trim()] = parseFloat(n.querySelector('b').textContent); });
  return o;
});

/** Devuelve la cantidad de un articulo por su nombre visible. */
const cantidadDe = nombre => page.evaluate(n => {
  const fila = [...document.querySelectorAll('#matLista [data-mat]')]
    .find(r => r.querySelector('.bodnom b').textContent.includes(n));
  return fila ? parseFloat(fila.querySelector('.bodcant').textContent) : null;
}, nombre);

await c.prueba('la pestana Materiales existe y muestra la lista', async () => {
  await abrirMat();
  const txt = await page.evaluate(() => document.getElementById('panelbody').textContent);
  afirmar(txt.includes('Lo que se ocupa'), 'no se ve el titulo');
  afirmar(txt.includes('trazado real'), 'no se explica de donde salen los metros');
});

await c.prueba('muestra puntos, metros de cable y metros de tubo', async () => {
  const n = await cifras();
  afirmar('puntos' in n, 'falta el conteo de puntos');
  afirmar('m de cable' in n, 'faltan los metros de cable');
  afirmar('m de tubo' in n, 'faltan los metros de tubo');
  afirmar(n.puntos > 0, 'el plano de ejemplo deberia tener puntos');
});

await c.prueba('agrupa por tipo y suma por articulo', async () => {
  const grupos = await page.evaluate(() =>
    [...document.querySelectorAll('#panelbody .matgrupo')].map(g => g.textContent.trim()));
  afirmar(grupos.length > 0, 'no hay grupos');
  const filas = await page.evaluate(() => document.querySelectorAll('#matLista [data-mat]').length);
  afirmar(filas > 0, 'no hay articulos listados');
});

// --- lo esencial: EN VIVO --------------------------------------------------

await c.prueba('colocar una toma hace crecer la lista SIN cambiar de pestana', async () => {
  const antes = await cifras();
  const antesToma = await cantidadDe('oma');            // "Toma..." sin atarse al nombre exacto
  await elegirHerramienta(page, 'toma');
  const p = await puntoLienzo(page, 0.44, 0.36);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(
    n => {
      const s = [...document.querySelectorAll('#panelbody .matstat')]
        .find(x => x.querySelector('span').textContent.trim() === 'puntos');
      return s && parseFloat(s.querySelector('b').textContent) > n;
    }, antes.puntos, { timeout: 8000 });
  const despues = await cifras();
  afirmarIgual(despues.puntos, antes.puntos + 1, 'los puntos no subieron de a uno');
  if (antesToma != null) {
    const ahora = await cantidadDe('oma');
    afirmarIgual(ahora, antesToma + 1, 'la fila de tomas no sumo');
  }
  // La pestana sigue siendo Materiales: no hubo que ir a buscar la lista.
  const activa = await page.evaluate(() =>
    document.querySelector('.tabs button.on')?.dataset.tab);
  afirmarIgual(activa, 'mat', 'la pestana cambio sola');
});

await c.prueba('deshacer devuelve la lista al estado anterior', async () => {
  const antes = await cifras();
  await page.click('#undo');
  await page.waitForFunction(
    n => {
      const s = [...document.querySelectorAll('#panelbody .matstat')]
        .find(x => x.querySelector('span').textContent.trim() === 'puntos');
      return s && parseFloat(s.querySelector('b').textContent) < n;
    }, antes.puntos, { timeout: 8000 });
  const despues = await cifras();
  afirmarIgual(despues.puntos, antes.puntos - 1, 'deshacer no bajo el conteo');
});

await c.prueba('los metros de tubo salen del trazado dibujado', async () => {
  const antes = await cifras();
  await elegirHerramienta(page, 'route');   // el id de la herramienta "Tubo"
  const a = await puntoLienzo(page, 0.30, 0.62);
  const b = await puntoLienzo(page, 0.66, 0.62);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.press('Enter');        // cierra el trazo
  await page.waitForFunction(
    n => {
      const s = [...document.querySelectorAll('#panelbody .matstat')]
        .find(x => x.querySelector('span').textContent.trim() === 'm de tubo');
      return s && parseFloat(s.querySelector('b').textContent) > n;
    }, antes['m de tubo'], { timeout: 8000 });
  const despues = await cifras();
  afirmar(despues['m de tubo'] > antes['m de tubo'],
    'dibujar un tubo no sumo metros');
});

await c.prueba('repintar la lista no rehace el DOM cuando nada cambio', async () => {
  // Guarda de firma: si la cubicacion no cambio, el nodo de la lista es EL MISMO.
  // Ojo: MOVER algo si cambia los metros de cable (dependen de la distancia al
  // tablero), asi que el gesto neutro tiene que ser solo cambiar la seleccion.
  await page.evaluate(() => { document.getElementById('matLista').dataset.marca = 'antes'; });
  await elegirHerramienta(page, 'select');
  const vacio = await puntoLienzo(page, 0.06, 0.94);
  await page.mouse.click(vacio.x, vacio.y);
  await page.mouse.click(vacio.x, vacio.y);
  const marca = await page.evaluate(() =>
    document.getElementById('matLista')?.dataset.marca);
  afirmarIgual(marca, 'antes', 'la lista se rehizo aunque la cubicacion no cambio');
});

await c.prueba('la lista se lee bien en tema claro', async () => {
  const leer = () => page.evaluate(() => {
    const b = document.querySelector('#panelbody .matstat b');
    const g = document.querySelector('#panelbody .matgrupo');
    return b && g ? { cifra: getComputedStyle(b).color, grupo: getComputedStyle(g).color } : null;
  });
  const oscuro = await leer();
  afirmar(oscuro, 'no hay cifras para medir');
  const fondoAntes = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#themeBtn');
  await page.waitForFunction(
    c0 => getComputedStyle(document.body).backgroundColor !== c0, fondoAntes, { timeout: 5000 });
  const claro = await leer();
  afirmar(claro.cifra !== oscuro.cifra, 'la cifra no cambio de color (color quemado)');
  await page.click('#themeBtn');
});

await c.prueba('la lista de materiales no genero errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

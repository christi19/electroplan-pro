// bodega.mjs — pruebas DOM del modulo de Bodega.
// Uso: node tests/bodega.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual, esperarFoco,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const { browser, context } = await abrirNavegador();
const c = crearCorredor(`BODEGA ${ARCHIVO}`);
console.log(`BODEGA ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

const abrirBodega = async () => {
  await page.click('.tabs button[data-tab="bodega"]');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
};

/** Llena el formulario del modal y guarda. */
async function agregarItem({ nombre, cantidad = 1, unidad = 'u', sitio, minimo = 0, codigo = '' }) {
  await page.click('#bodAdd');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');   // el modal enfoca a los 30ms: no correrle
  await page.fill('#bfNom', nombre);
  await page.fill('#bfCant', String(cantidad));
  await page.selectOption('#bfUni', unidad);
  if (sitio) await elegirSitio('#bfUb', sitio);
  if (minimo) await page.fill('#bfMin', String(minimo));
  if (codigo) await page.fill('#bfCod', codigo);
  await page.click('#bfOk');
  await page.waitForFunction(
    n => document.querySelectorAll('#bodLista [data-bitem]').length >= n,
    1, { timeout: 5000 });
}

// El <option> muestra el camino completo ("Bodega > Estante 1"): se busca por el
// ultimo tramo para no atarse a como se dibuje la jerarquia.
async function elegirSitio(sel, nombre) {
  const val = await page.evaluate(([s, n]) =>
    [...document.querySelectorAll(s + ' option')]
      .find(o => o.textContent.trim().split('\u203a').pop().trim() === n)?.value,
    [sel, nombre]);
  if (val == null) throw new Error(`no existe el sitio "${nombre}" en ${sel}`);
  await page.selectOption(sel, val);
}

const filas = () => page.evaluate(() =>
  [...document.querySelectorAll('#bodLista [data-bitem]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));

await c.prueba('la pestana Bodega existe y abre su pantalla', async () => {
  await abrirBodega();
  const titulo = await page.evaluate(() =>
    document.getElementById('panelbody').textContent.includes('Mi bodega'));
  afirmar(titulo, 'no se ve el titulo "Mi bodega"');
});

await c.prueba('la bodega vacia ENSENA en vez de mostrar una hoja en blanco', async () => {
  const txt = await page.evaluate(() => document.getElementById('bodLista').textContent);
  afirmar(txt.includes('vacía'), 'no hay estado vacio');
  afirmar(/taladro|cable/i.test(txt), 'el estado vacio no da un ejemplo concreto');
});

await c.prueba('agregar una herramienta la deja listada con su sitio', async () => {
  await agregarItem({ nombre: 'Taladro', cantidad: 1, sitio: 'Buseta' });
  const f = await filas();
  afirmarIgual(f.length, 1, 'deberia haber exactamente 1 cosa');
  afirmar(f[0].includes('Taladro'), 'no aparece el nombre');
  afirmar(f[0].includes('Buseta'), 'no aparece el sitio');
});

await c.prueba('la bodega sobrevive a recargar la pagina', async () => {
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  await abrirBodega();
  const f = await filas();
  afirmar(f.some(x => x.includes('Taladro')), 'el taladro no sobrevivio a la recarga');
});

await c.prueba('la busqueda perdona tildes y mayusculas', async () => {
  await agregarItem({ nombre: 'Lámpara LED 9W', cantidad: 6, sitio: 'Estante 1' });
  await page.fill('#bodBuscar', 'lampara');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 1, null, { timeout: 5000 });
  const f = await filas();
  afirmar(f[0].includes('Lámpara'), 'buscar sin tilde no encontro la lampara');
});

await c.prueba('la busqueda tambien encuentra por sitio ("que tengo en el buseta")', async () => {
  await page.fill('#bodBuscar', 'buseta');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 1, null, { timeout: 5000 });
  const f = await filas();
  afirmar(f[0].includes('Taladro'), 'buscar por sitio no trajo lo que hay ahi');
  await page.fill('#bodBuscar', '');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 2, null, { timeout: 5000 });
});

await c.prueba('escribir en el buscador NO roba el foco', async () => {
  await page.click('#bodBuscar');
  await page.keyboard.type('lam');
  const foco = await page.evaluate(() => document.activeElement?.id);
  afirmarIgual(foco, 'bodBuscar', 'el foco se perdio al escribir');
  await page.fill('#bodBuscar', '');
});

await c.prueba('lo que esta bajo el minimo se marca y se puede filtrar', async () => {
  await agregarItem({ nombre: 'Cable THHN #12', cantidad: 8, unidad: 'm', sitio: 'Bodega', minimo: 20 });
  const bajos = await page.evaluate(() =>
    [...document.querySelectorAll('#bodLista .bodcant.bajo')].map(n => n.closest('[data-bitem]').innerText));
  afirmarIgual(bajos.length, 1, 'deberia haber exactamente 1 bajo minimo');
  afirmar(bajos[0].includes('Cable'), 'se marco el item equivocado');

  await page.click('#bodBajos');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 1, null, { timeout: 5000 });
  await page.click('#bodBajos');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 3, null, { timeout: 5000 });
});

await c.prueba('el filtro por sitio deja ver un solo sitio', async () => {
  await elegirSitio('#bodSitioSel', 'Buseta');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 1, null, { timeout: 5000 });
  await page.selectOption('#bodSitioSel', '');
  await page.waitForFunction(
    () => document.querySelectorAll('#bodLista [data-bitem]').length === 3, null, { timeout: 5000 });
});

await c.prueba('los sitios son del usuario: se crean y se renombran', async () => {
  await page.click('#bodSitiosEd');
  await page.waitForSelector('#bsLista', { timeout: 5000 });
  const antes = await page.evaluate(() => document.querySelectorAll('#bsLista .bodrow').length);
  await page.click('#bsAdd');
  await page.waitForSelector('#uiIn', { timeout: 5000 });
  await esperarFoco(page, 'uiIn');
  await page.fill('#uiIn', 'Obra Siquirres');
  await page.click('#uiOk');
  await page.waitForFunction(
    n => document.querySelectorAll('#bsLista .bodrow').length === n + 1, antes, { timeout: 5000 });
  await page.click('#bsCerrar');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
  const opciones = await page.evaluate(() =>
    [...document.querySelectorAll('#bodSitioSel option')].map(o => o.textContent.trim()));
  afirmar(opciones.some(o => o.includes('Obra Siquirres')), 'el sitio nuevo no aparece en el filtro');
});

await c.prueba('borrar un item pide confirmacion y no destruye trabajo en silencio', async () => {
  await page.click('#bodLista [data-bitem] [data-bedit]');
  await page.waitForSelector('#bfDel', { timeout: 5000 });
  await page.click('#bfDel');
  await page.waitForSelector('#uiOk', { timeout: 5000 });
  const txt = await page.evaluate(() =>
    document.querySelector('#uiOk')?.closest('div[style]')?.textContent || '');
  afirmar(/Quitar/i.test(txt), 'no se pidio confirmacion antes de borrar');
  await page.click('#uiNo');   // se cancela: nada se pierde
  await page.waitForFunction(
    () => !document.querySelector('#bfDel') || document.querySelectorAll('#bodLista [data-bitem]').length === 3,
    null, { timeout: 5000 });
});

// --- barra de calidad --------------------------------------------------------

await c.prueba('las zonas de toque llegan a 44px', async () => {
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  await abrirBodega();
  const chicos = await page.evaluate(() =>
    [...document.querySelectorAll('#panelbody .bodadd, #panelbody .bodchip, #panelbody .bodbtn, #panelbody .bodbusca, #panelbody .bodfiltros select')]
      .filter(n => n.getBoundingClientRect().height < 44)
      .map(n => (n.id || n.className) + ':' + Math.round(n.getBoundingClientRect().height)));
  afirmarIgual(chicos.length, 0, `controles por debajo de 44px: ${chicos.join(', ')}`);
});

await c.prueba('todo boton solo-icono tiene aria-label', async () => {
  const sin = await page.evaluate(() =>
    [...document.querySelectorAll('#panelbody .bodbtn')]
      .filter(b => !b.getAttribute('aria-label'))
      .map(b => b.textContent.trim()));
  afirmarIgual(sin.length, 0, `botones solo-icono sin aria-label: ${sin.join(', ')}`);
});

await c.prueba('la bodega se repinta bien en tema claro', async () => {
  const leer = () => page.evaluate(() => {
    const r = document.querySelector('#bodLista .bodnom b');
    const f = document.querySelector('#panelbody .bodbusca');
    return r && f ? { texto: getComputedStyle(r).color, campo: getComputedStyle(f).backgroundColor } : null;
  });
  const oscuro = await leer();
  afirmar(oscuro, 'no hay filas para medir');
  // El color de referencia se lee ANTES del clic: leerlo despues seria esperar
  // a que un valor sea distinto de si mismo.
  const fondoAntes = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click('#themeBtn');
  await page.waitForFunction(
    c0 => getComputedStyle(document.body).backgroundColor !== c0, fondoAntes, { timeout: 5000 });
  const claro = await leer();
  afirmar(claro.texto !== oscuro.texto, 'el texto no cambio de color en tema claro (color quemado)');
  afirmar(claro.campo !== oscuro.campo, 'el buscador no cambio de fondo en tema claro (color quemado)');
  await page.click('#themeBtn');
});

await c.prueba('la bodega no genero errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

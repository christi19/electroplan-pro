// movimientos.mjs — pruebas DOM de los movimientos de bodega y su reversibilidad.
// Uso: node tests/movimientos.mjs [archivo]

import {
  abrirNavegador, abrirApp, crearCorredor, afirmar, afirmarIgual, esperarFoco,
} from './arnes.mjs';

const ARCHIVO = process.argv[2] || 'PlanElectricoPro.html';
const { browser, context } = await abrirNavegador();
const c = crearCorredor(`MOVIMIENTOS ${ARCHIVO}`);
console.log(`MOVIMIENTOS ${ARCHIVO}`);

const page = await abrirApp(context, ARCHIVO);

const abrirBodega = async () => {
  await page.click('.tabs button[data-tab="bodega"]');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
};

async function agregarItem({ nombre, cantidad, unidad = 'u', sitio }) {
  await page.click('#bodAdd');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');
  await page.fill('#bfNom', nombre);
  await page.fill('#bfCant', String(cantidad));
  await page.selectOption('#bfUni', unidad);
  if (sitio) {
    const val = await page.evaluate(n => [...document.querySelectorAll('#bfUb option')]
      .find(o => o.textContent.trim().split('›').pop().trim() === n)?.value, sitio);
    await page.selectOption('#bfUb', val);
  }
  await page.click('#bfOk');
  await page.waitForSelector('#bodLista [data-bitem]', { timeout: 5000 });
}

/** Lee las filas como {nombre, sitio, cantidad}. */
const filas = () => page.evaluate(() =>
  [...document.querySelectorAll('#bodLista [data-bitem]')].map(r => ({
    nombre: r.querySelector('.bodnom b').textContent.trim(),
    sitio: r.querySelector('.bodnom small').textContent.trim(),
    cant: parseFloat(r.querySelector('.bodcant').textContent),
  })));
const cantidadDe = async n => (await filas()).find(f => f.nombre.includes(n))?.cant ?? null;

/** Corre el flujo: tocar la cosa -> elegir tipo -> cantidad -> (destino). */
async function anotar(nombreItem, tipo, cantidad, destino) {
  const idx = await page.evaluate(n => [...document.querySelectorAll('#bodLista [data-bitem]')]
    .findIndex(r => r.querySelector('.bodnom b').textContent.includes(n)), nombreItem);
  afirmar(idx >= 0, `no encuentro "${nombreItem}" en la lista`);
  await page.click(`#bodLista [data-bitem]:nth-of-type(${idx + 1}) [data-bmov]`);
  await page.waitForSelector(`[data-k="${tipo}"]`, { timeout: 5000 });
  await page.click(`[data-k="${tipo}"]`);
  await page.waitForSelector('#uiIn', { timeout: 5000 });
  await esperarFoco(page, 'uiIn');
  await page.fill('#uiIn', String(cantidad));
  await page.click('#uiOk');
  if (destino) {
    await page.waitForSelector('[data-k]', { timeout: 5000 });
    const k = await page.evaluate(d => [...document.querySelectorAll('[data-k]')]
      .find(b => b.textContent.split('›').pop().trim() === d)?.dataset.k, destino);
    afirmar(k, `no ofrecio el sitio destino "${destino}"`);
    await page.click(`[data-k="${k}"]`);
  }
  await page.waitForSelector('#bodLista', { timeout: 5000 });
}

await c.prueba('preparar: una cosa en la bodega', async () => {
  await abrirBodega();
  await agregarItem({ nombre: 'Cable THHN #12', cantidad: 100, unidad: 'm', sitio: 'Bodega' });
  afirmarIgual(await cantidadDe('Cable'), 100, 'no quedo con 100');
});

await c.prueba('anotar que ENTRO suma al inventario', async () => {
  await anotar('Cable', 'entrada', 50);
  afirmarIgual(await cantidadDe('Cable'), 150, 'la entrada no sumo');
});

await c.prueba('anotar que SALIO resta del inventario', async () => {
  await anotar('Cable', 'salida', 30);
  afirmarIgual(await cantidadDe('Cable'), 120, 'la salida no resto');
});

await c.prueba('no deja sacar mas de lo que hay', async () => {
  const antes = await cantidadDe('Cable');
  const idx = await page.evaluate(() => 0);
  await page.click(`#bodLista [data-bitem]:nth-of-type(${idx + 1}) [data-bmov]`);
  await page.waitForSelector('[data-k="salida"]', { timeout: 5000 });
  await page.click('[data-k="salida"]');
  await page.waitForSelector('#uiIn', { timeout: 5000 });
  await esperarFoco(page, 'uiIn');
  await page.fill('#uiIn', '9999');
  await page.click('#uiOk');
  await page.waitForFunction(() => {
    const t = document.getElementById('avisoToast');
    return t && /No pod[eé]s sacar/i.test(t.textContent);
  }, null, { timeout: 5000 });
  afirmarIgual(await cantidadDe('Cable'), antes, 'dejo el inventario en negativo');
});

await c.prueba('TRASLADO mueve la cantidad y crea la fila en el otro sitio', async () => {
  await anotar('Cable', 'traslado', 40, 'Buseta');
  const f = await filas();
  const enBodega = f.find(x => x.nombre.includes('Cable') && /Bodega/.test(x.sitio));
  const enBuseta = f.find(x => x.nombre.includes('Cable') && /Buseta/.test(x.sitio));
  afirmar(enBodega && enBuseta, `esperaba la misma cosa en dos sitios: ${JSON.stringify(f)}`);
  afirmarIgual(enBodega.cant, 80, 'no descontó del origen');
  afirmarIgual(enBuseta.cant, 40, 'no sumó en el destino');
});

await c.prueba('CONTE fija la cantidad al valor contado', async () => {
  await anotar('Cable', 'ajuste', 75);
  const f = await filas();
  const enBodega = f.find(x => x.nombre.includes('Cable') && /Bodega/.test(x.sitio));
  afirmarIgual(enBodega.cant, 75, 'el conteo no fijo la cantidad');
});

// --- reversibilidad ----------------------------------------------------------

await c.prueba('el historial lista los movimientos, lo ultimo primero', async () => {
  await page.click('#bodMovs');
  await page.waitForSelector('#mvLista', { timeout: 5000 });
  const filas = await page.evaluate(() =>
    [...document.querySelectorAll('#mvLista .bodrow')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  // 4 anotados: entrada, salida, traslado y conteo. La salida rechazada por
  // falta de existencias NO se anota, y eso es justamente lo correcto.
  afirmarIgual(filas.length, 4, 'la cantidad de movimientos anotados no cuadra');
  afirmar(/Lo cont/i.test(filas[0]), `el primero deberia ser el conteo: ${filas[0]}`);
});

await c.prueba('revertir NO borra: anota el contrario y la cuenta vuelve', async () => {
  const antesFilas = await page.evaluate(() => document.querySelectorAll('#mvLista .bodrow').length);
  await page.click('#mvLista [data-brev]');
  await page.waitForSelector('#uiOk', { timeout: 5000 });
  await page.click('#uiOk');
  await page.waitForFunction(
    n => document.querySelectorAll('#mvLista .bodrow').length === n + 1,
    antesFilas, { timeout: 5000 });
  const marcados = await page.evaluate(() =>
    document.querySelectorAll('#mvLista .bodrow.revertido').length);
  afirmarIgual(marcados, 1, 'el movimiento original no quedo marcado como revertido');
});

await c.prueba('un movimiento revertido ya no se puede volver a revertir', async () => {
  const revertibles = await page.evaluate(() => {
    const filas = [...document.querySelectorAll('#mvLista .bodrow')];
    return filas.slice(0, 2).map(r => !!r.querySelector('[data-brev]'));
  });
  afirmarIgual(revertibles[0], false, 'el contra-asiento se puede revertir (descuadraria)');
  afirmarIgual(revertibles[1], false, 'el movimiento ya revertido sigue revertible');
});

await c.prueba('revertir el conteo devolvio la cantidad anterior', async () => {
  await page.click('#mvCerrar');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
  const f = await filas();
  const enBodega = f.find(x => x.nombre.includes('Cable') && /Bodega/.test(x.sitio));
  afirmarIgual(enBodega.cant, 80, 'no volvio a los 80 que habia antes de contar');
});

await c.prueba('los movimientos sobreviven a recargar', async () => {
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.tool[data-tool]').length >= 10, null, { timeout: 20000 });
  await page.evaluate(() => document.getElementById('tutomodal')?.remove());
  await abrirBodega();
  await page.click('#bodMovs');
  await page.waitForSelector('#mvLista', { timeout: 5000 });
  const n = await page.evaluate(() => document.querySelectorAll('#mvLista .bodrow').length);
  afirmarIgual(n, 5, 'se perdieron movimientos al recargar (4 + el contra-asiento)');
  await page.click('#mvCerrar');
});

await c.prueba('corregir la cantidad a mano tambien queda anotado', async () => {
  // Si el formulario cambiara el inventario sin dejar rastro, el historial
  // contaria una historia falsa.
  const antes = await page.evaluate(async () => {
    document.getElementById('bodMovs').click();
    await new Promise(r => requestAnimationFrame(r));
    const n = document.querySelectorAll('#mvLista .bodrow').length;
    document.getElementById('mvCerrar').click();
    return n;
  });
  await page.waitForSelector('#bodLista', { timeout: 5000 });
  await page.click('#bodLista [data-bitem] [data-bedit]');
  await page.waitForSelector('#bfNom', { timeout: 5000 });
  await esperarFoco(page, 'bfNom');
  await page.fill('#bfCant', '999');
  await page.click('#bfOk');
  await page.waitForSelector('#bodLista', { timeout: 5000 });
  await page.click('#bodMovs');
  await page.waitForSelector('#mvLista', { timeout: 5000 });
  const despues = await page.evaluate(() => document.querySelectorAll('#mvLista .bodrow').length);
  afirmarIgual(despues, antes + 1, 'la correccion a mano no quedo en el historial');
  const primero = await page.evaluate(() =>
    document.querySelector('#mvLista .bodrow').textContent.replace(/\s+/g, ' '));
  afirmar(/corregido a mano/i.test(primero), `no se marca como corregido: ${primero}`);
  await page.click('#mvCerrar');
});

await c.prueba('los movimientos no generaron errores de JS', async () => {
  afirmarIgual(page.__errores.length, 0, `errores: ${page.__errores.join(' | ')}`);
});

const verde = c.resumen();
await browser.close();
process.exit(verde ? 0 : 1);

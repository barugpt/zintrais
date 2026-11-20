const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPrecioMercadoLibre } = require('../services/mercadoLibreEngine');

test('calcula el precio para cubrir costos y margen solicitado', () => {
    const resultado = calcularPrecioMercadoLibre(1000, 0.5);
    const precio = Number(resultado.precioPublicar.replace(/[^\d,]/g, '').replace(',', '.'));
    assert.ok(precio > 1000);
    assert.equal(resultado.porcentajeCostos, 25.6);
});

test('rechaza costos inválidos y márgenes fuera del rango permitido', () => {
    assert.throws(() => calcularPrecioMercadoLibre(0, 0.5), TypeError);
    assert.throws(() => calcularPrecioMercadoLibre(1000, -0.1), TypeError);
    assert.throws(() => calcularPrecioMercadoLibre(1000, 11), TypeError);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calcularJugadaMayorista,
    filtrarProductosCompetitivos,
    rankearProductos
} = require('../services/tradingEngine');

test('calcula un precio de venta con 50% de ganancia sobre el costo', () => {
    const resultado = calcularJugadaMayorista(18200);
    assert.equal(resultado.precioVentaNumerico, 27300);
    assert.equal(resultado.gananciaNumerica, 9100);
    assert.equal(resultado.rentabilidad, '50%');
    assert.match(resultado.precioVentaSugerido, /27\.300/);
});

test('rechaza costos vacíos, negativos o no numéricos', () => {
    for (const costo of [0, -1, 'no es un precio']) {
        assert.throws(() => calcularJugadaMayorista(costo), TypeError);
    }
});

test('acepta solo productos cuyo precio sugerido es menor que el precio web', () => {
    const productos = filtrarProductosCompetitivos([
        { producto: 'Aceptado', costoProveedor: 1000, precioWeb: 1501 },
        { producto: 'Mismo precio', costoProveedor: 1000, precioWeb: 1500 },
        { producto: 'Competencia más barata', costoProveedor: 1000, precioWeb: 1499 }
    ]);

    assert.deepEqual(productos.map((producto) => producto.producto), ['Aceptado']);
});

test('rechaza precios web inválidos al aplicar el filtro de competencia', () => {
    assert.throws(() => filtrarProductosCompetitivos([
        { producto: 'Sin precio web', costoProveedor: 1000 }
    ]), TypeError);
});

test('ordena por ganancia ponderando al doble los productos de alta rotación', () => {
    const lista = rankearProductos([
        { producto: 'Producto común', gananciaNumerica: 150 },
        { producto: 'Parlante portátil', gananciaNumerica: 100 }
    ]);
    assert.equal(lista[0].producto, 'Parlante portátil');
    assert.equal(lista[0].esTendencia, true);
});

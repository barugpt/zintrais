const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularJugadaMayorista, rankearProductos } = require('../services/tradingEngine');

test('calcula precios y ganancia con un costo válido', () => {
    const resultado = calcularJugadaMayorista(4200);
    assert.equal(resultado.gananciaNumerica, 3675);
    assert.equal(resultado.rentabilidad, '88%');
    assert.match(resultado.precioVentaSugerido, /7\.875/);
});

test('rechaza costos vacíos, negativos o no numéricos', () => {
    for (const costo of [0, -1, 'no es un precio']) {
        assert.throws(() => calcularJugadaMayorista(costo), TypeError);
    }
});

test('ordena por ganancia ponderando palabras de tendencia', () => {
    const lista = rankearProductos([
        { producto: 'Producto común', gananciaNumerica: 100 },
        { producto: 'Parlante portátil', gananciaNumerica: 80 }
    ], ['parlante']);
    assert.equal(lista[0].producto, 'Parlante portátil');
    assert.equal(lista[0].esTendencia, true);
});

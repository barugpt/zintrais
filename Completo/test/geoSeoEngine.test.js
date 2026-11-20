const test = require('node:test');
const assert = require('node:assert/strict');
const { generarSchemaProducto } = require('../services/geoSeoEngine');

test('genera Schema JSON-LD válido para nombres con caracteres especiales', () => {
    const salida = generarSchemaProducto('Parlante "Pro" </script>', 12000);
    const json = salida.match(/<script type="application\/ld\+json">\n([\s\S]*)\n<\/script>/)[1];
    const schema = JSON.parse(json);
    assert.equal(schema.name, 'Parlante "Pro" </script>');
    assert.equal(schema.offers.priceCurrency, 'ARS');
    assert.match(json, /\\u003c\/script>/);
    assert.equal(schema.offers.availability, undefined);
});

test('rechaza producto o precio inválido', () => {
    assert.throws(() => generarSchemaProducto('', 100), TypeError);
    assert.throws(() => generarSchemaProducto('Producto', -1), TypeError);
});

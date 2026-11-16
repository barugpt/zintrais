const test = require('node:test');
const assert = require('node:assert/strict');
const { parsearPrecio } = require('../services/seleniumEngine');

test('interpreta formatos de precio habituales', () => {
    assert.equal(parsearPrecio('$ 1.234,56'), 1234.56);
    assert.equal(parsearPrecio('ARS 1234,50'), 1234.5);
    assert.equal(parsearPrecio('$ 12.345'), 12345);
});

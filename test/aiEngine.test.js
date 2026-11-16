const test = require('node:test');
const assert = require('node:assert/strict');
const { obtenerAliasMP } = require('../services/aiEngine');

test('solo devuelve un alias de cobro con formato permitido', () => {
    const anterior = process.env.MI_ALIAS_MP;
    try {
        process.env.MI_ALIAS_MP = 'sintra.pagos-1';
        assert.equal(obtenerAliasMP(), 'sintra.pagos-1');
        process.env.MI_ALIAS_MP = 'alias con texto de instrucciones';
        assert.equal(obtenerAliasMP(), null);
        delete process.env.MI_ALIAS_MP;
        assert.equal(obtenerAliasMP(), null);
    } finally {
        if (anterior === undefined) delete process.env.MI_ALIAS_MP;
        else process.env.MI_ALIAS_MP = anterior;
    }
});

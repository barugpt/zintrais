const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parsearPrecio,
    resolverUrlPublica,
    extraerProductosProtrade
} = require('../services/seleniumEngine');

test('interpreta formatos de precio habituales', () => {
    assert.equal(parsearPrecio('$ 1.234,56'), 1234.56);
    assert.equal(parsearPrecio('ARS 1234,50'), 1234.5);
    assert.equal(parsearPrecio('$ 12.345'), 12345);
});

test('resuelve URLs del catálogo y rechaza protocolos no web', () => {
    assert.equal(
        resolverUrlPublica('/products/termo', 'https://protrade.test/collections/all'),
        'https://protrade.test/products/termo'
    );
    assert.equal(resolverUrlPublica('javascript:alert(1)', 'https://protrade.test'), null);
});

test('extrae título, costo en centavos, ID, URL e imagen de Tiendanube', () => {
    const html = `
        <div class="js-item-product">
            <a href="/productos/termo-123/"><img src="//cdn.example.test/termo.jpg"></a>
            <a class="item-link">
                <div class="js-item-name" data-store="product-item-name-123">Termo eléctrico</div>
                <span class="js-price-display" data-product-price="1820000">$18.200,00</span>
            </a>
        </div>`;
    const productos = extraerProductosProtrade(html, 'https://protrade.test/todos-los-productos/');

    assert.deepEqual(productos, [{
        id: '123',
        nombre: 'Termo eléctrico',
        costoProveedor: 18200,
        stock: null,
        url: 'https://protrade.test/productos/termo-123/',
        imagenUrl: 'https://cdn.example.test/termo.jpg'
    }]);
});

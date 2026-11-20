const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parsearPrecio,
    resolverUrlPublica,
    extraerProductosProtrade,
    escanearProtrade,
    crearOpcionesChrome,
    describirErrorProtrade
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

test('configura Chrome headless con las opciones necesarias para Linux', () => {
    const opciones = crearOpcionesChrome('linux').get('goog:chromeOptions');

    assert.ok(opciones.args.includes('--headless=new'));
    assert.ok(opciones.args.includes('--no-sandbox'));
    assert.ok(opciones.args.includes('--disable-dev-shm-usage'));
    assert.equal(opciones.args.some((argumento) => argumento.includes('user-agent')), false);
});

test('usa Selenium como fallback si la respuesta HTTP no contiene productos', async () => {
    const html = `
        <div class="js-item-product">
            <a href="/productos/termo-123/">
                <div class="js-item-name" data-store="product-item-name-123">Termo eléctrico</div>
                <span class="js-price-display" data-product-price="1820000">$18.200,00</span>
            </a>
        </div>`;
    let urlUsada = '';
    const resultado = await escanearProtrade({
        httpGet: async () => ({ status: 200, data: '<html><title>Catálogo</title></html>' }),
        cargarHtmlConChrome: async (url) => {
            urlUsada = url;
            return html;
        }
    });

    assert.equal(urlUsada, 'https://protrade.com.ar/todos-los-productos/');
    assert.equal(resultado.demo, false);
    assert.equal(resultado.fuente, 'Protrade (Chrome)');
    assert.equal(resultado.productos[0].costoProveedor, 18200);
});

test('identifica bloqueos y evita reintentar con una identidad falsa', async () => {
    const error = new Error('Request failed with status code 403');
    error.response = { status: 403 };
    let intentoChrome = false;
    const resultado = await escanearProtrade({
        httpGet: async () => { throw error; },
        cargarHtmlConChrome: async () => {
            intentoChrome = true;
            return '';
        }
    });

    assert.match(describirErrorProtrade(error), /HTTP 403/);
    assert.equal(intentoChrome, false);
    assert.equal(resultado.demo, true);
    assert.match(resultado.aviso, /habilitación al proveedor/);
});

test('distingue los timeouts de red en el diagnóstico', () => {
    const error = new Error('timeout of 10000ms exceeded');
    error.code = 'ECONNABORTED';
    assert.match(describirErrorProtrade(error), /tiempo de espera/);
});

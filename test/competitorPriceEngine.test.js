const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizarTerminos,
    seleccionarProductoComparable,
    extraerResultadosFravega,
    buscarPrecioCompetencia
} = require('../services/competitorPriceEngine');

test('normaliza acentos y plurales para comparar nombres', () => {
    assert.deepEqual(normalizarTerminos('Auriculares inalámbricos'), [
        'auricular',
        'inalambrico'
    ]);
});

test('elige el menor precio argentino entre resultados comparables', () => {
    const resultado = seleccionarProductoComparable('Termo eléctrico', [
        {
            title: 'Termo electrico 1.5 litros',
            price: 25000,
            currency_id: 'ARS',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-1'
        },
        {
            title: 'Termo eléctrico acero inoxidable',
            price: 22000,
            currency_id: 'ARS',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-2'
        },
        {
            title: 'Termo electrico',
            price: 100,
            currency_id: 'USD',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-3'
        }
    ]);

    assert.equal(resultado.price, 22000);
});

test('omite resultados sin coincidencia suficiente o sin enlace HTTPS', () => {
    const resultado = seleccionarProductoComparable('Termo eléctrico', [
        {
            title: 'Auriculares inalámbricos',
            price: 1000,
            currency_id: 'ARS',
            permalink: 'https://articulo.mercadolibre.com.ar/MLA-1'
        },
        {
            title: 'Termo eléctrico',
            price: 2000,
            currency_id: 'ARS',
            permalink: 'http://articulo.mercadolibre.com.ar/MLA-2'
        }
    ]);

    assert.equal(resultado, null);
});

test('extrae título, precio ARS y link de los resultados SSR de Frávega', () => {
    const pageData = {
        props: {
            pageProps: {
                __APOLLO_STATE__: {
                    ROOT_QUERY: {
                        'items({"keywords":"termo electrico"})': {
                            __typename: 'ItemResponse',
                            results: [{
                                code: '12345',
                                item: {
                                    active: true,
                                    title: 'Termo Eléctrico Prueba',
                                    slug: 'termo-electrico-prueba'
                                },
                                pricing: { salePrice: 49999 },
                                stock: { labels: ['HOME_DELIVERY_IN_24_HOURS'] }
                            }]
                        }
                    }
                }
            }
        }
    };
    const html = `<script id="__NEXT_DATA__">${JSON.stringify(pageData)}</script>`;

    assert.deepEqual(extraerResultadosFravega(html), [{
        title: 'Termo Eléctrico Prueba',
        price: 49999,
        currency_id: 'ARS',
        available: true,
        permalink: 'https://www.fravega.com/p/termo-electrico-prueba-12345/'
    }]);
});

test('usa Frávega aunque la búsqueda de Mercado Libre esté bloqueada', async () => {
    const resultado = await buscarPrecioCompetencia('Termo eléctrico', [
        {
            nombre: 'Mercado Libre',
            buscar: async () => {
                throw new Error('HTTP 403');
            }
        },
        {
            nombre: 'Frávega',
            buscar: async () => [{
                title: 'Termo eléctrico 1 litro',
                price: 70000,
                currency_id: 'ARS',
                permalink: 'https://www.fravega.com/p/termo-123/'
            }]
        }
    ]);

    assert.equal(resultado.precioWeb, 70000);
    assert.equal(resultado.fuenteWeb, 'Frávega');
});

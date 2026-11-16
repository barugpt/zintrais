const axios = require('axios');
const cheerio = require('cheerio');

const PRODUCTOS_DEMO = [
    { nombre: 'Parlante Bluetooth GTS', costoProveedor: 4200, stock: 50 },
    { nombre: 'Auriculares Inalámbricos', costoProveedor: 3920, stock: 100 },
    { nombre: 'Smartwatch Deportivo', costoProveedor: 8500, stock: 30 },
    { nombre: 'Micrófono Inalámbrico', costoProveedor: 13300, stock: 20 },
    { nombre: 'Luces LED RGB', costoProveedor: 2500, stock: 200 }
];

function parsearPrecio(texto) {
    let valor = String(texto).replace(/[^\d.,-]/g, '');
    if (!valor) return NaN;

    if (valor.includes(',')) {
        valor = valor.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(?:\.\d{3})+$/.test(valor)) {
        valor = valor.replace(/\./g, '');
    }

    return Number(valor);
}

async function escanearProtrade() {
    const url = process.env.PROTRADE_COLLECTION_URL ||
        'https://protrade.com.ar/collections/all';

    try {
        const response = await axios.get(url, {
            timeout: 10000,
            maxContentLength: 5 * 1024 * 1024,
            headers: {
                'User-Agent': 'SINTRA-IS/1.0 (+local product catalog fetcher)',
                Accept: 'text/html'
            }
        });
        const $ = cheerio.load(response.data);
        const productos = [];

        $('.product-card, .grid-product, .product-item, .product-card-wrapper').each((_, elemento) => {
            const tarjeta = $(elemento);
            const nombre = tarjeta
                .find('.product-card__title, .grid-product__title, .card__heading, .product-title')
                .first()
                .text()
                .trim();
            const precioTexto = tarjeta
                .find('.price, .product-card__price, .price-item, .money')
                .first()
                .text()
                .trim();
            const costoProveedor = parsearPrecio(precioTexto);

            if (nombre && Number.isFinite(costoProveedor) && costoProveedor > 0) {
                productos.push({ nombre, costoProveedor, stock: null });
            }
        });

        if (productos.length) {
            return { productos, fuente: 'Protrade', demo: false, aviso: null };
        }

        return {
            productos: PRODUCTOS_DEMO,
            fuente: 'Datos de demostración',
            demo: true,
            aviso: 'No se reconocieron productos en la página. Se muestran datos de demostración.'
        };
    } catch (error) {
        console.error(`No se pudo consultar Protrade: ${error.message}`);
        return {
            productos: PRODUCTOS_DEMO,
            fuente: 'Datos de demostración',
            demo: true,
            aviso: 'Protrade no respondió. Se muestran datos de demostración; revisa la URL y la conexión.'
        };
    }
}

module.exports = { escanearProtrade, parsearPrecio };

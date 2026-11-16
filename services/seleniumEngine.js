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

function resolverUrlPublica(valor, baseUrl) {
    if (typeof valor !== 'string' || !valor.trim()) return null;
    try {
        const url = new URL(valor.trim(), baseUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function extraerProductosProtrade(html, collectionUrl) {
    const $ = cheerio.load(html);
    const productos = [];

    $('.js-item-product, .product-card, .grid-product, .product-item, .product-card-wrapper')
        .each((_, elemento) => {
            const tarjeta = $(elemento);
            const nombreElement = tarjeta.find(
                '.js-item-name, .product-card__title, .grid-product__title, .card__heading, .product-title'
            ).first();
            const nombre = nombreElement.text().trim() ||
                tarjeta.find('a[title]').first().attr('title')?.trim() || '';
            const precioElement = tarjeta.find(
                '.js-price-display, [data-product-price], .price, .product-card__price, .price-item, .money'
            ).first();
            const precioRaw = precioElement.attr('data-product-price');
            const costoProveedor = precioRaw && /^\d+$/.test(precioRaw)
                ? Number(precioRaw) / 100
                : parsearPrecio(precioElement.text().trim());

            if (!nombre || !Number.isFinite(costoProveedor) || costoProveedor <= 0) return;

            const enlace = tarjeta.find('a[href]').first().attr('href');
            const imagen = tarjeta.find('img').first();
            const imagenUrl = imagen.attr('data-src') ||
                imagen.attr('data-original') ||
                imagen.attr('data-lazy-src') ||
                imagen.attr('src') ||
                imagen.attr('srcset')?.split(',')[0].trim().split(/\s+/)[0];
            const productUrl = resolverUrlPublica(enlace, collectionUrl);
            const dataStoreId = nombreElement.attr('data-store')?.match(/(\d+)$/)?.[1];
            const stockRaw = tarjeta.attr('data-stock') ||
                tarjeta.find('[data-stock]').first().attr('data-stock');
            const stock = stockRaw !== undefined && /^\d+$/.test(stockRaw)
                ? Number(stockRaw)
                : null;

            productos.push({
                id: tarjeta.attr('data-product-id') ||
                    tarjeta.attr('data-id') ||
                    dataStoreId ||
                    (productUrl ? new URL(productUrl).pathname : null),
                nombre,
                costoProveedor,
                stock,
                url: productUrl,
                imagenUrl: resolverUrlPublica(imagenUrl, collectionUrl)
            });
        });

    return productos;
}

async function escanearProtrade() {
    const collectionUrl = process.env.PROTRADE_COLLECTION_URL ||
        'https://protrade.com.ar/todos-los-productos/';

    try {
        const response = await axios.get(collectionUrl, {
            timeout: 10000,
            maxContentLength: 5 * 1024 * 1024,
            headers: {
                'User-Agent': 'SINTRA-IS/1.0 (+local product catalog fetcher)',
                Accept: 'text/html'
            }
        });
        const productos = extraerProductosProtrade(response.data, collectionUrl);

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

module.exports = {
    escanearProtrade,
    parsearPrecio,
    resolverUrlPublica,
    extraerProductosProtrade
};

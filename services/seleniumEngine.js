const axios = require('axios');
const cheerio = require('cheerio');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const URL_CATALOGO_PROTRADE = 'https://protrade.com.ar/todos-los-productos/';
const SELECTOR_TARJETA_PRODUCTO =
    '.js-item-product, .product-card, .grid-product, .product-item, .product-card-wrapper';
const TIMEOUT_CARGA_PAGINA_MS = 30000;
const TIMEOUT_TARJETAS_MS = 20000;

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

    $(SELECTOR_TARJETA_PRODUCTO).each((_, elemento) => {
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

function crearOpcionesChrome(plataforma = process.platform) {
    const opciones = new chrome.Options();
    opciones.addArguments('--headless=new', '--disable-gpu', '--window-size=1280,1600');
    if (plataforma === 'linux') {
        opciones.addArguments('--no-sandbox', '--disable-dev-shm-usage');
    }

    const rutaChrome = process.env.CHROME_BIN?.trim();
    if (rutaChrome) opciones.setChromeBinaryPath(rutaChrome);
    return opciones;
}

function describirErrorProtrade(error) {
    const status = error.response?.status;
    if (status === 403 || status === 429) {
        return `Protrade respondió HTTP ${status}; puede estar rechazando o limitando el acceso desde este servidor.`;
    }
    if (status === 404) {
        return 'Protrade respondió HTTP 404; revisa PROTRADE_COLLECTION_URL.';
    }
    if (status) return `Protrade respondió HTTP ${status}.`;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ||
        error.name === 'TimeoutError' || /timeout/i.test(error.message || '')) {
        return 'Se agotó el tiempo de espera al consultar Protrade.';
    }
    if (error.code) return `Error de conexión ${error.code}: ${error.message}`;
    return error.message || 'Error desconocido al consultar Protrade.';
}

function crearResultadoDemo(aviso) {
    return {
        productos: PRODUCTOS_DEMO,
        fuente: 'Datos de demostración',
        demo: true,
        aviso
    };
}

function diagnosticarHtml(html) {
    const $ = cheerio.load(html);
    return {
        titulo: $('title').first().text().trim() || '(sin título)',
        cantidadTarjetas: $(SELECTOR_TARJETA_PRODUCTO).length,
        bytesHtml: Buffer.byteLength(String(html))
    };
}

async function obtenerDiagnosticoChrome(driver) {
    const [titulo, url, cuerpo] = await Promise.all([
        driver.getTitle().catch(() => ''),
        driver.getCurrentUrl().catch(() => ''),
        driver.findElement(By.css('body')).then((body) => body.getText()).catch(() => '')
    ]);
    const texto = cuerpo.replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
        titulo: titulo || '(sin título)',
        url,
        texto,
        posibleBloqueo: /(access denied|access forbidden|captcha|unusual traffic|security check|403 forbidden)/i.test(texto)
    };
}

async function cargarHtmlConChrome(url) {
    let driver;
    try {
        const opciones = crearOpcionesChrome();
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(opciones)
            .build();
        await driver.manage().setTimeouts({
            pageLoad: TIMEOUT_CARGA_PAGINA_MS,
            script: 15000,
            implicit: 0
        });
        await driver.get(url);
        await driver.wait(
            until.elementLocated(By.css(SELECTOR_TARJETA_PRODUCTO)),
            TIMEOUT_TARJETAS_MS,
            `No aparecieron tarjetas de producto en ${TIMEOUT_TARJETAS_MS} ms.`
        );
        return await driver.getPageSource();
    } catch (error) {
        const diagnostico = driver ? await obtenerDiagnosticoChrome(driver) : null;
        console.error('[Protrade][Chrome] Falló la carga o la espera de productos.', {
            detalle: describirErrorProtrade(error),
            diagnostico,
            error
        });
        throw error;
    } finally {
        if (driver) {
            try {
                await driver.quit();
            } catch (error) {
                console.error('[Protrade][Chrome] No se pudo cerrar el navegador.', error);
            }
        }
    }
}

async function intentarFallbackChrome(collectionUrl, motivo, cargarHtml = cargarHtmlConChrome) {
    console.info(`[Protrade][Chrome] Usando navegador headless: ${motivo}`);
    try {
        const html = await cargarHtml(collectionUrl);
        const productos = extraerProductosProtrade(html, collectionUrl);
        if (productos.length) {
            console.info(`[Protrade][Chrome] Se extrajeron ${productos.length} productos.`);
            return { productos, fuente: 'Protrade (Chrome)', demo: false, aviso: null };
        }

        const diagnostico = diagnosticarHtml(html);
        const aviso = 'Chrome cargó la página, pero los selectores de productos no encontraron resultados.';
        console.error(`[Protrade][Selectores] ${aviso}`, {
            url: collectionUrl,
            selectores: SELECTOR_TARJETA_PRODUCTO,
            ...diagnostico
        });
        return crearResultadoDemo(aviso);
    } catch (error) {
        const detalle = describirErrorProtrade(error);
        console.error(`[Protrade][Chrome] El fallback no pudo obtener el catálogo: ${detalle}`, error);
        return crearResultadoDemo(
            `Falló la consulta HTTP y también el navegador Chrome. HTTP: ${motivo}. Chrome: ${detalle}`
        );
    }
}

async function escanearProtrade(servicios = {}) {
    const collectionUrl = process.env.PROTRADE_COLLECTION_URL || URL_CATALOGO_PROTRADE;
    const httpGet = servicios.httpGet || axios.get;
    const cargarHtml = servicios.cargarHtmlConChrome || cargarHtmlConChrome;

    try {
        const response = await httpGet(collectionUrl, {
            timeout: 10000,
            maxContentLength: 5 * 1024 * 1024,
            headers: {
                Accept: 'text/html'
            }
        });
        const productos = extraerProductosProtrade(response.data, collectionUrl);

        if (productos.length) {
            console.info(`[Protrade][HTTP] Se extrajeron ${productos.length} productos.`);
            return { productos, fuente: 'Protrade', demo: false, aviso: null };
        }

        const diagnostico = diagnosticarHtml(response.data);
        const motivo = `HTTP ${response.status}: no se detectaron tarjetas con los selectores conocidos.`;
        console.error(`[Protrade][Selectores] ${motivo}`, {
            url: collectionUrl,
            selectores: SELECTOR_TARJETA_PRODUCTO,
            ...diagnostico
        });
        return intentarFallbackChrome(collectionUrl, motivo, cargarHtml);
    } catch (error) {
        const detalle = describirErrorProtrade(error);
        console.error(`[Protrade][HTTP] ${detalle}`, error);
        const status = error.response?.status;

        if (status === 403 || status === 429) {
            return crearResultadoDemo(
                `${detalle} No se intentó eludir el bloqueo; solicita acceso o habilitación al proveedor.`
            );
        }
        if (status && status >= 400 && status < 500) {
            return crearResultadoDemo(detalle);
        }

        return intentarFallbackChrome(collectionUrl, detalle, cargarHtml);
    }
}

module.exports = {
    escanearProtrade,
    parsearPrecio,
    resolverUrlPublica,
    extraerProductosProtrade,
    crearOpcionesChrome,
    describirErrorProtrade,
    cargarHtmlConChrome
};

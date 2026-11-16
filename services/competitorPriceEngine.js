const axios = require('axios');
const cheerio = require('cheerio');

const MERCADOLIBRE_SEARCH_URL = 'https://api.mercadolibre.com/sites/MLA/search';
const FRAVEGA_SEARCH_URL = 'https://www.fravega.com/l/';
const MINIMUM_MATCH_RATIO = 0.6;

function normalizarTerminos(texto) {
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-AR')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((termino) => {
            if (termino.length > 4 && termino.endsWith('ces')) {
                return `${termino.slice(0, -3)}z`;
            }
            if (termino.length > 5 && termino.endsWith('es')) return termino.slice(0, -2);
            if (termino.length > 4 && termino.endsWith('s')) return termino.slice(0, -1);
            return termino;
        });
}

function seleccionarProductoComparable(nombreProducto, resultados) {
    const terminosProducto = [...new Set(normalizarTerminos(nombreProducto))];
    if (!terminosProducto.length) return null;

    return resultados
        .filter((resultado) =>
            resultado &&
            Number.isFinite(Number(resultado.price)) &&
            Number(resultado.price) > 0 &&
            resultado.currency_id === 'ARS' &&
            resultado.available !== false &&
            typeof resultado.title === 'string' &&
            typeof resultado.permalink === 'string' &&
            /^https:\/\//i.test(resultado.permalink)
        )
        .map((resultado) => {
            const terminosResultado = new Set(normalizarTerminos(resultado.title));
            const coincidencias = terminosProducto.filter((termino) =>
                terminosResultado.has(termino)
            ).length;
            return {
                ...resultado,
                ratioCoincidencia: coincidencias / terminosProducto.length
            };
        })
        .filter((resultado) => resultado.ratioCoincidencia >= MINIMUM_MATCH_RATIO)
        .sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
}

function extraerResultadosFravega(html) {
    const $ = cheerio.load(html);
    const nextData = $('#__NEXT_DATA__').html();
    if (!nextData) {
        throw new Error('Frávega devolvió una página sin datos de búsqueda.');
    }

    let pageData;
    try {
        pageData = JSON.parse(nextData);
    } catch {
        throw new Error('Frávega devolvió datos de búsqueda inválidos.');
    }

    const rootQuery = pageData.props?.pageProps?.__APOLLO_STATE__?.ROOT_QUERY;
    const respuestas = Object.entries(rootQuery || {})
        .filter(([key, value]) =>
            key.startsWith('items(') && Array.isArray(value?.results)
        )
        .map(([, value]) => value.results)
        .flat();

    if (!rootQuery || !Object.values(rootQuery).some((value) =>
        value?.__typename === 'ItemResponse' && Array.isArray(value.results)
    )) {
        throw new Error('Frávega no incluyó resultados de productos en la respuesta.');
    }

    return respuestas
        .filter((resultado) =>
            resultado?.item?.active === true &&
            Array.isArray(resultado.stock?.labels) &&
            resultado.stock.labels.length > 0
        )
        .map((resultado) => ({
            title: resultado.item.title,
            price: resultado.pricing?.salePrice,
            currency_id: 'ARS',
            available: true,
            permalink: `https://www.fravega.com/p/${resultado.item.slug}-${resultado.code}/`
        }));
}

async function buscarResultadosMercadoLibre(nombreProducto) {
    const headers = { Accept: 'application/json' };
    if (process.env.MERCADOLIBRE_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.MERCADOLIBRE_ACCESS_TOKEN}`;
    }

    let response;
    try {
        response = await axios.get(MERCADOLIBRE_SEARCH_URL, {
            params: { q: nombreProducto, limit: 20, sort: 'price_asc' },
            headers,
            timeout: 10000,
            maxContentLength: 2 * 1024 * 1024
        });
    } catch (error) {
        const status = error.response?.status;
        const detalle = status ? ` (HTTP ${status})` : '';
        throw new Error(`No se pudo consultar Mercado Libre para "${nombreProducto}"${detalle}.`);
    }

    if (!Array.isArray(response.data?.results)) {
        throw new Error('Mercado Libre devolvió una respuesta de búsqueda inválida.');
    }

    return response.data.results;
}

async function buscarResultadosFravega(nombreProducto) {
    let response;
    try {
        response = await axios.get(FRAVEGA_SEARCH_URL, {
            params: { keyword: nombreProducto },
            headers: {
                Accept: 'text/html',
                'User-Agent': 'Mozilla/5.0 (compatible; SINTRA-IS/1.0)'
            },
            timeout: 12000,
            maxContentLength: 5 * 1024 * 1024
        });
    } catch (error) {
        const status = error.response?.status;
        const detalle = status ? ` (HTTP ${status})` : '';
        throw new Error(`No se pudo consultar Frávega para "${nombreProducto}"${detalle}.`);
    }

    return extraerResultadosFravega(response.data);
}

async function buscarPrecioCompetencia(nombreProducto, fuentes = [
    { nombre: 'Mercado Libre', buscar: buscarResultadosMercadoLibre },
    { nombre: 'Frávega', buscar: buscarResultadosFravega }
]) {
    const respuestas = await Promise.all(fuentes.map(async (fuente) => {
        try {
            return {
                nombre: fuente.nombre,
                resultados: await fuente.buscar(nombreProducto)
            };
        } catch (error) {
            return { nombre: fuente.nombre, error };
        }
    }));

    const comparables = respuestas
        .flatMap((respuesta) => {
            if (respuesta.error) return [];
            const resultado = seleccionarProductoComparable(
                nombreProducto,
                respuesta.resultados
            );
            return resultado ? [{ ...resultado, fuente: respuesta.nombre }] : [];
        })
        .sort((a, b) => Number(a.price) - Number(b.price));

    if (comparables.length) {
        const mejorResultado = comparables[0];
        return {
            precioWeb: Number(mejorResultado.price),
            fuenteWeb: mejorResultado.fuente,
            urlWeb: mejorResultado.permalink
        };
    }

    const errores = respuestas.filter((respuesta) => respuesta.error);
    if (errores.length === fuentes.length) {
        throw new Error(
            `No se pudo consultar ninguna fuente de competencia para "${nombreProducto}": ` +
            errores.map((respuesta) => respuesta.error.message).join(' ')
        );
    }

    return null;
}

async function consultarPreciosCompetencia(productos) {
    const resultados = new Array(productos.length);
    let siguienteIndice = 0;
    const cantidadWorkers = Math.min(4, productos.length);

    await Promise.all(Array.from({ length: cantidadWorkers }, async () => {
        while (siguienteIndice < productos.length) {
            const indice = siguienteIndice++;
            const producto = productos[indice];
            const competencia = await buscarPrecioCompetencia(producto.nombre);
            if (competencia) {
                resultados[indice] = { ...producto, ...competencia };
            }
        }
    }));

    return resultados.filter(Boolean);
}

module.exports = {
    normalizarTerminos,
    seleccionarProductoComparable,
    extraerResultadosFravega,
    buscarPrecioCompetencia,
    consultarPreciosCompetencia
};

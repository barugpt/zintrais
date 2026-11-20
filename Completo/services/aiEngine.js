const axios = require('axios');

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_HISTORIAL = 12;

function obtenerAliasMP() {
    const alias = process.env.MI_ALIAS_MP?.trim();
    return alias && /^[A-Za-z0-9._-]{3,30}$/.test(alias) ? alias : null;
}

function normalizarHistorial(historial) {
    if (historial === undefined) return [];
    if (!Array.isArray(historial)) {
        throw new TypeError('El historial debe ser una lista de mensajes.');
    }

    return historial.slice(-MAX_HISTORIAL).map((mensaje) => {
        if (!mensaje || !['user', 'assistant'].includes(mensaje.role) ||
            typeof mensaje.content !== 'string' || mensaje.content.length > 2000) {
            throw new TypeError('El historial contiene un mensaje inválido.');
        }
        return { role: mensaje.role, content: mensaje.content };
    });
}

async function generarRespuestaVenta(mensajeUsuario, historial = []) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        const error = new Error('Configura GROQ_API_KEY en el archivo .env para activar el asistente.');
        error.status = 503;
        throw error;
    }
    if (typeof mensajeUsuario !== 'string' || !mensajeUsuario.trim() ||
        mensajeUsuario.length > 2000) {
        throw new TypeError('El mensaje debe tener entre 1 y 2000 caracteres.');
    }

    const alias = obtenerAliasMP();
    const systemPrompt = [
        'Eres el asistente de ventas de SINTRA IS, especializado en tecnología y accesorios.',
        'Responde en español, de forma directa, cordial y honesta.',
        'Sugiere complementos solo cuando sean pertinentes.',
        'No inventes stock, precios, garantías, disponibilidad ni plazos de envío.',
        'Si faltan datos, indícalo y pide la información necesaria.',
        'Si consultan por cantidad, ofrece revisar condiciones mayoristas sin prometer descuentos.',
        'No confirmes pagos, no pidas comprobantes y no afirmes que una transferencia se recibió.',
        alias
            ? `Si preguntan específicamente cómo pagar, informa el alias configurado exactamente así: ${alias}.`
            : 'No inventes ni compartas alias o datos de cobro; indica que deben consultar al negocio.'
    ].join(' ');

    const response = await axios.post(
        API_URL,
        {
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                ...normalizarHistorial(historial),
                { role: 'user', content: mensajeUsuario.trim() }
            ],
            temperature: 0.5,
            max_tokens: 500
        },
        {
            timeout: 20000,
            headers: { Authorization: `Bearer ${apiKey}` }
        }
    );

    const respuesta = response.data?.choices?.[0]?.message?.content;
    if (typeof respuesta !== 'string' || !respuesta.trim()) {
        throw new Error('El proveedor de IA devolvió una respuesta vacía.');
    }
    return respuesta.trim();
}

module.exports = { generarRespuestaVenta, normalizarHistorial, obtenerAliasMP };

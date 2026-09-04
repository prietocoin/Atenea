const cheerio = require('cheerio');
const { ProxyAgent } = require('undici');

const MONEDAS = [
  "PEN", "COP", "CLP", "ARS", "MXN", "VES", "PYG", "DOP", "CRC", "EUR", "CAD", "BOB", "BRL", "BCV"
];

// Configuración de la Proxy Antibloqueo
const PROXY_IP = process.env.PROXY_IP || '46.203.210.178';
const PROXY_PORT = process.env.PROXY_PORT || '5625';
const PROXY_USER = process.env.PROXY_USER || 'ttsctjnu';
const PROXY_PASS = process.env.PROXY_PASS || 'ul2gxifzz0pk';

const PROXY_URL = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_IP}:${PROXY_PORT}`;
const proxyAgent = new ProxyAgent(PROXY_URL);

/**
 * Función central de conexión:
 * Intenta conectar de forma directa primero. Si la IP del VPS está bloqueada
 * o hay un problema en Docker, salta automáticamente al túnel Proxy.
 */
async function conectarHoo(ruta) {
  const url = `https://hoo.jairokov.com${ruta}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
    'Accept': 'application/json, text/html, */*'
  };

  // 1. Intento Directo
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
  } catch (e) {}

  // 2. Intento vía Proxy
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { headers, dispatcher: proxyAgent, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
  } catch (e) {}

  return null;
}

/**
 * Scraping Simple:
 * Emula un navegador leyendo el HTML puro y descarta el código basura.
 */
async function ejecutarRadarCompleto() {
  console.log('🚀 [Atenea Radar] Ejecutando Scraping Simple en hoo.jairokov.com...');
  const resultados = {};

  // PASO 1: Intentar leer el Endpoint JSON nativo (/radar)
  const jsonRaw = await conectarHoo('/radar');
  if (jsonRaw) {
    try {
      const data = JSON.parse(jsonRaw);
      if (data && data.rates) {
        MONEDAS.forEach(m => {
          if (data.rates[m]) resultados[m] = parseFloat(data.rates[m]);
        });
        if (Object.keys(resultados).length > 5) {
          console.log('✅ [Atenea Radar] Leído desde JSON:', resultados);
          return resultados;
        }
      }
    } catch (e) {
      console.warn('⚠️ /radar devolvió formato web. Pasando a modo Scraping Visual...');
    }
  }

  // PASO 2: Simple Scraping Visual a la pantalla principal (/)
  const htmlRaw = await conectarHoo('/');
  if (!htmlRaw) {
    console.error('❌ [Atenea Radar] Imposible acceder a la web de Hoo.');
    return {};
  }

  // Cargar el HTML en Cheerio (DOM Parser)
  const $ = cheerio.load(htmlRaw);
  
  // ¡EL TRUCO!: Eliminar todos los scripts y código interno para EVITAR "ARS: 8" o errores
  $('script, style, meta, link, noscript, svg, path').remove();
  
  // Extraer el texto puramente visual de la pantalla y condensarlo
  const textoLimpio = $('body').text().replace(/\s+/g, ' ').toUpperCase();

  // Buscar cada moneda y el número que tiene al lado en las tarjetas
  MONEDAS.forEach(fiat => {
    // Regex inteligente: Busca la moneda (Ej: "PEN") seguida de texto visual y un número
    const regex = new RegExp(`${fiat}\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]+)?)`);
    const match = textoLimpio.match(regex);
    
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (val > 0.1) {
        resultados[fiat] = val;
      }
    }
  });

  console.log('✅ [Atenea Radar] Scraping Visual Completado:', resultados);
  return resultados;
}

module.exports = { ejecutarRadarCompleto };

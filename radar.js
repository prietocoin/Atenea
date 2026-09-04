const { ProxyAgent } = require('undici');

// Lista de divisas Binance P2P
const BINANCE_FIATS = [
  "PEN", "COP", "CLP", "ARS", "MXN", "VES", "PYG", "DOP", "CRC", "EUR", "CAD", "BOB"
];

const PROXY_IP = process.env.PROXY_IP || '46.203.210.178';
const PROXY_PORT = process.env.PROXY_PORT || '5625';
const PROXY_USER = process.env.PROXY_USER || 'ttsctjnu';
const PROXY_PASS = process.env.PROXY_PASS || 'ul2gxifzz0pk';

const PROXY_URL = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_IP}:${PROXY_PORT}`;
const proxyAgent = new ProxyAgent(PROXY_URL);

/**
 * Algoritmo de Purificación:
 * 1. Toma los primeros 7 valores capturados.
 * 2. Los ordena de menor a mayor.
 * 3. Selecciona la ventana de 5 valores continuos con la menor diferencia (max - min).
 * 4. Calcula el promedio exacto de esos 5 precios.
 */
function calcularPromedioPurificado(prices) {
  if (!prices || prices.length === 0) return 0.0;
  
  let top7 = prices.slice(0, 7).map(Number).filter(n => !isNaN(n) && n > 0);
  if (top7.length === 0) return 0.0;
  if (top7.length < 5) {
    return top7.reduce((a, b) => a + b, 0) / top7.length;
  }

  top7.sort((a, b) => a - b);

  let menorRango = Infinity;
  let mejorGrupo = top7.slice(0, 5);

  for (let i = 0; i <= top7.length - 5; i++) {
    let grupo = top7.slice(i, i + 5);
    let rango = grupo[4] - grupo[0];
    if (rango < menorRango) {
      menorRango = rango;
      mejorGrupo = grupo;
    }
  }

  return mejorGrupo.reduce((a, b) => a + b, 0) / 5;
}

async function fetchConFallback(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      ...options,
      dispatcher: proxyAgent,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) return res;
  } catch (e) {
    // Intentar reintento directo si la proxy falla o da timeout
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) return res;
  } catch (e) {
    return null;
  }
  return null;
}

async function obtenerPreciosBinanceApi(fiat) {
  const payload = JSON.stringify({
    asset: 'USDT',
    fiat: fiat,
    merchantCheck: false,
    page: 1,
    payTypes: [],
    publisherType: null,
    rows: 15,
    tradeType: 'BUY'
  });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  };

  const res = await fetchConFallback('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers,
    body: payload
  });

  if (!res) return [];

  try {
    const data = await res.json();
    if (data && data.data && Array.isArray(data.data)) {
      return data.data
        .map(item => parseFloat(item?.adv?.price))
        .filter(price => !isNaN(price) && price > 0.1);
    }
  } catch (err) {
    console.error(`⚠️ Error parseando Binance P2P (${fiat}):`, err.message);
  }
  return [];
}

// API Pública Dedicada BRL
async function obtenerPrecioBRL() {
  const res1 = await fetchConFallback("https://economia.awesomeapi.com.br/json/last/USDT-BRL");
  if (res1) {
    try {
      const data = await res1.json();
      if (data && data.USDTBRL && data.USDTBRL.bid) {
        return parseFloat(data.USDTBRL.bid);
      }
    } catch {}
  }

  const res2 = await fetchConFallback("https://api.binance.com/api/3/ticker/price?symbol=USDTBRL");
  if (res2) {
    try {
      const data = await res2.json();
      if (data && data.price) {
        return parseFloat(data.price);
      }
    } catch {}
  }

  const preciosP2P = await obtenerPreciosBinanceApi("BRL");
  return calcularPromedioPurificado(preciosP2P);
}

// API Pública Dedicada BCV
async function obtenerPrecioBCV() {
  const res1 = await fetchConFallback("https://ve.dolarapi.com/v1/dolares/oficial");
  if (res1) {
    try {
      const data = await res1.json();
      const val = parseFloat(data.promedio || data.precio);
      if (!isNaN(val) && val > 0) return val;
    } catch {}
  }

  const res2 = await fetchConFallback("https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv");
  if (res2) {
    try {
      const data = await res2.json();
      const val = parseFloat(data?.monitors?.bcv?.price || data?.promedio);
      if (!isNaN(val) && val > 0) return val;
    } catch {}
  }

  const res3 = await fetchConFallback("https://www.tcambio.app/");
  if (res3) {
    try {
      const text = await res3.text();
      const match = text.match(/(?:BCV|Central|Dólar).*?([\d,.]+)/i);
      if (match) {
        let val = match[1].replace(',', '.');
        if ((val.match(/\./g) || []).length > 1) {
          const parts = val.split('.');
          val = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
        }
        return parseFloat(val);
      }
    } catch {}
  }

  return 0.0;
}

async function ejecutarRadarCompleto() {
  console.log(`🚀 [Atenea Radar] Escaneando 14 divisas (Algoritmo 5 de 7)...`);
  const resultados = {};

  for (const fiat of BINANCE_FIATS) {
    const precios = await obtenerPreciosBinanceApi(fiat);
    const rawAvg = calcularPromedioPurificado(precios);
    
    if (rawAvg > 0) {
      const adj = (fiat === "COP" || fiat === "VES") ? 0.99 : 1.0;
      const valAdj = rawAvg * adj;
      resultados[fiat] = valAdj >= 100 ? Math.round(valAdj) : parseFloat(valAdj.toFixed(2));
    }
  }

  const brl = await obtenerPrecioBRL();
  if (brl > 0) resultados["BRL"] = parseFloat(brl.toFixed(2));

  const bcv = await obtenerPrecioBCV();
  if (bcv > 0) resultados["BCV"] = parseFloat(bcv.toFixed(2));

  console.log("✅ [Atenea Radar] Escaneo completado. 14 divisas cargadas:", resultados);
  return resultados;
}

module.exports = { ejecutarRadarCompleto };

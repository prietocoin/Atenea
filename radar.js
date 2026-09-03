const { ProxyAgent } = require('undici');

const BINANCE_URLS_FIAT = ["PEN", "COP", "CLP", "ARS", "MXN", "VES", "PYG", "DOP", "CRC", "EUR", "CAD", "BRL"];

// Configuración de Proxy (Variables de Entorno con Fallback Exacto a Easypanel)
const PROXY_IP = process.env.PROXY_IP || '46.203.210.178';
const PROXY_PORT = process.env.PROXY_PORT || '5625';
const PROXY_USER = process.env.PROXY_USER || 'ttsctjnu';
const PROXY_PASS = process.env.PROXY_PASS || 'ul2gxifzz0pk';

const PROXY_URL = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_IP}:${PROXY_PORT}`;
const proxyAgent = new ProxyAgent(PROXY_URL);

function calcularPromedioPurificado(prices) {
  if (!prices || prices.length === 0) return 0.0;
  if (prices.length === 1) return prices[0];
  
  let p = [...prices].sort((a, b) => a - b);
  if (p.length > 5) {
    p = p.slice(1, -1);
  }
  
  const avg = p.reduce((sum, val) => sum + val, 0) / p.length;
  const purified = p.filter(x => x >= avg * 0.98 && x <= avg * 1.02);
  
  if (purified.length > 0) {
    return purified.reduce((sum, val) => sum + val, 0) / purified.length;
  }
  return avg;
}

async function obtenerPreciosBinanceApi(fiat) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      dispatcher: proxyAgent,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        asset: 'USDT',
        fiat: fiat,
        merchantCheck: false,
        page: 1,
        payTypes: [],
        publisherType: null,
        rows: 15,
        tradeType: 'BUY'
      })
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`⚠️ Petición a Binance P2P (${fiat}) retornó estado: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (data && data.data && Array.isArray(data.data)) {
      return data.data
        .map(item => parseFloat(item?.adv?.price))
        .filter(price => !isNaN(price) && price > 0.1);
    }
    return [];
  } catch (err) {
    console.error(`⚠️ Error consultando BAPI Binance (${fiat}) mediante Proxy:`, err.message);
    return [];
  }
}

async function obtenerBrlFallback() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USDT-BRL", {
      dispatcher: proxyAgent
    });
    const data = await res.json();
    return [parseFloat(data.USDTBRL.bid)];
  } catch {
    return [];
  }
}

async function obtenerBCV() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://www.tcambio.app/", { 
      dispatcher: proxyAgent,
      signal: controller.signal 
    });
    clearTimeout(timeout);
    const text = await res.text();
    const match = text.match(/(?:BCV|Central|Dólar).*?([\d,.]+)/i);
    if (match) {
      let val = match[1].replace(',', '.');
      if ((val.match(/\./g) || []).length > 1) {
        const parts = val.split('.');
        val = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
      }
      return parseFloat(val);
    }
    return 0.0;
  } catch {
    return 0.0;
  }
}

async function ejecutarRadarCompleto() {
  console.log(`🚀 [Atenea Radar] Escaneando divisas a través de Proxy (${PROXY_IP}:${PROXY_PORT})...`);
  const resultados = {};

  for (const fiat of BINANCE_URLS_FIAT) {
    let precios = await obtenerPreciosBinanceApi(fiat);
    if (precios.length === 0 && fiat === "BRL") {
      precios = await obtenerBrlFallback();
    }
    
    let rawAvg = calcularPromedioPurificado(precios);
    if (rawAvg > 0) {
      const adj = (fiat === "COP" || fiat === "VES") ? 0.99 : 1.0;
      const valAdj = rawAvg * adj;
      resultados[fiat] = valAdj >= 100 ? Math.round(valAdj) : parseFloat(valAdj.toFixed(2));
    }
  }

  const bcv = await obtenerBCV();
  if (bcv > 0) resultados["BCV"] = bcv;

  console.log("✅ [Atenea Radar] Escaneo completado exitosamente con Proxy:", resultados);
  return resultados;
}

module.exports = { ejecutarRadarCompleto };

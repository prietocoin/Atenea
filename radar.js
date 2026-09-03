const puppeteer = require('puppeteer');

const BINANCE_URLS = {
  PEN: "https://p2p.binance.com/trade/all-payments/USDT?fiat=PEN",
  COP: "https://p2p.binance.com/trade/all-payments/USDT?fiat=COP",
  CLP: "https://p2p.binance.com/trade/all-payments/USDT?fiat=CLP",
  ARS: "https://p2p.binance.com/trade/all-payments/USDT?fiat=ARS",
  MXN: "https://p2p.binance.com/trade/all-payments/USDT?fiat=MXN",
  VES: "https://p2p.binance.com/trade/all-payments/USDT?fiat=VES",
  PYG: "https://p2p.binance.com/trade/all-payments/USDT?fiat=PYG",
  DOP: "https://p2p.binance.com/trade/all-payments/USDT?fiat=DOP",
  CRC: "https://p2p.binance.com/trade/all-payments/USDT?fiat=CRC",
  EUR: "https://p2p.binance.com/trade/all-payments/USDT?fiat=EUR",
  CAD: "https://p2p.binance.com/trade/all-payments/USDT?fiat=CAD",
  BRL: "https://p2p.binance.com/trade/all-payments/USDT?fiat=BRL"
};

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

async function escanearFiat(browser, fiat, url) {
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 4000));

    const prices = await page.evaluate(() => {
      const results = [];
      const rows = Array.from(document.querySelectorAll('.bn-web-table-row, [role="row"]'));
      rows.forEach(row => {
        const text = row.innerText.replace(/,/g, '');
        const matches = text.match(/(\d+\.\d{2,})/g);
        if (matches) {
          matches.forEach(m => {
            const val = parseFloat(m);
            if (val > 0.1) results.push(val);
          });
        }
      });
      return results;
    });

    await page.close();
    return prices.slice(0, 15);
  } catch (err) {
    console.error(`⚠️ Error escaneando ${fiat}:`, err.message);
    if (page) await page.close().catch(() => {});
    return [];
  }
}

async function obtenerBrlFallback() {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USDT-BRL");
    const data = await res.json();
    return [parseFloat(data.USDTBRL.bid)];
  } catch {
    return [];
  }
}

async function obtenerBCV(browser) {
  let page;
  try {
    page = await browser.newPage();
    await page.goto("https://www.tcambio.app/", { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const text = await page.evaluate(() => document.body.innerText);
    await page.close();

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
  } catch (err) {
    console.error("⚠️ Error escaneando BCV:", err.message);
    if (page) await page.close().catch(() => {});
    return 0.0;
  }
}

async function ejecutarRadarCompleto() {
  console.log("🚀 [Atenea Radar] Iniciando ciclo de escaneo nativo...");
  
  const launchOptions = {
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (e) {
    console.error("❌ Error al iniciar Puppeteer Browser:", e.message);
    return {};
  }

  const resultados = {};

  for (const [fiat, url] of Object.entries(BINANCE_URLS)) {
    let precios = await escanearFiat(browser, fiat, url);
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

  const bcv = await obtenerBCV(browser);
  if (bcv > 0) resultados["BCV"] = bcv;

  await browser.close().catch(() => {});
  console.log("✅ [Atenea Radar] Ciclo finalizado. Tasas capturadas:", resultados);
  return resultados;
}

module.exports = { ejecutarRadarCompleto };

const HOO_URL = 'https://hoo.jairokov.com/radar';

async function ejecutarRadarCompleto() {
  try {
    console.log("📡 Sincronizando datos desde https://hoo.jairokov.com/radar...");
    
    const res = await fetch(HOO_URL, {
      headers: { 
        'User-Agent': 'AteneaBackend/2.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.warn(`⚠️ Hoo respondió con estatus HTTP: ${res.status}`);
      return {};
    }

    const data = await res.json();
    if (data && data.rates && Object.keys(data.rates).length > 0) {
      console.log("✅ Tasas capturadas de Hoo exitosamente:", data.rates);
      return data.rates;
    }
  } catch (err) {
    console.error("❌ Error de comunicación con Hoo:", err.message);
  }
  return {};
}

module.exports = { ejecutarRadarCompleto };

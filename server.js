const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Manejo global de excepciones
process.on('uncaughtException', (err) => {
  console.error('⚠️ Excepción aislada:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Promesa rechazada aislada:', reason);
});

// Configuración de PostgreSQL
const DEFAULT_DB_URL = 'postgres://postgres:lrh48me5dz3pqtgg214j@automat_postgres-db:5432/automat';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_DB_URL,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('⚠️ Error en PostgreSQL:', err.message);
});

// Inicialización de tablas requeridas en PostgreSQL
pool.query(`
  CREATE TABLE IF NOT EXISTS mercado_tasas (
    id SERIAL PRIMARY KEY,
    id_tasa VARCHAR(20) NOT NULL,
    moneda VARCHAR(10) NOT NULL,
    tasa_base NUMERIC(18, 6) NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mercado_tasas_id_tasa ON mercado_tasas(id_tasa);
  CREATE INDEX IF NOT EXISTS idx_mercado_tasas_moneda_ts ON mercado_tasas(moneda, timestamp DESC);
`).then(() => console.log('✅ Tabla mercado_tasas verificada/creada correctamente.'))
  .catch(err => console.error('⚠️ Error al verificar tabla mercado_tasas:', err.message));

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Almacenamiento temporal en memoria para auditoría en el Baúl
let borradorTasas = {};

// --- DIAGNÓSTICO ---
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/test-db', async (req, res) => {
  try {
    const testQuery = await pool.query('SELECT NOW();');
    const countMaster = await pool.query(
      'SELECT COUNT(*) FROM comprobantes_fb f INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo WHERE c.conteo > 1;'
    );
    res.json({
      status: 'OK',
      hora_servidor: testQuery.rows[0].now,
      registros_tabla_maestra: parseInt(countMaster.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', mensaje: err.message });
  }
});

// --- MÓDULO DE TASAS ---

// 1. Webhook receptor unificado desde n8n
app.post('/api/tasas/n8n-webhook', (req, res) => {
  try {
    let payload = req.body;
    
    // Extraer si viene envuelto como arreglo [{...}]
    if (Array.isArray(payload)) {
      payload = payload[0] || {};
    }
    // Extraer si viene en objeto .json
    if (payload.json) {
      payload = payload.json;
    }

    borradorTasas = payload;
    console.log('✅ Borrador de tasas actualizado desde n8n:', borradorTasas);
    return res.json({ success: true, message: 'Borrador cargado en memoria', rates: borradorTasas });
  } catch (err) {
    console.error('❌ Error al recibir borrador:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Endpoint consultado por Atenea Panel ("Conectar Hoo API")
app.get('/api/tasas/fetch-hoo', (req, res) => {
  if (!borradorTasas || Object.keys(borradorTasas).length === 0) {
    return res.status(404).json({
      success: false,
      msg: 'El motor de n8n aún no ha enviado un borrador reciente.'
    });
  }

  return res.json({
    success: true,
    rates: borradorTasas
  });
});

// 3. Endpoint de guardado definitivo en PostgreSQL
app.post('/api/tasas/publicar', async (req, res) => {
  try {
    const { id_tasa, tasas } = req.body;
    const timestamp = Math.floor(Date.now() / 1000);

    if (!tasas || Object.keys(tasas).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron tasas para publicar.' });
    }

    let codigoTasa = id_tasa;
    if (!codigoTasa) {
      const lastRes = await pool.query("SELECT id_tasa FROM mercado_tasas ORDER BY id DESC LIMIT 1;");
      if (lastRes.rows.length > 0) {
        const num = parseInt(lastRes.rows[0].id_tasa.replace('T', '')) + 1;
        codigoTasa = `T${String(num).padStart(3, '0')}`;
      } else {
        codigoTasa = 'T359';
      }
    }

    for (const [moneda, valor] of Object.entries(tasas)) {
      if (valor && !isNaN(valor)) {
        await pool.query(
          `INSERT INTO mercado_tasas (id_tasa, moneda, tasa_base, timestamp) VALUES ($1, $2, $3, $4);`,
          [codigoTasa, moneda.toUpperCase(), parseFloat(valor), timestamp]
        );
      }
    }

    console.log(`✅ Lote ${codigoTasa} guardado exitosamente en PostgreSQL.`);
    res.json({ success: true, id_tasa: codigoTasa, message: `Tasa ${codigoTasa} publicada correctamente` });
  } catch (err) {
    console.error("❌ Error al publicar tasa:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- COMPROBANTES Y TABLA MAESTRA ---
const getComprobantesHandler = async (req, res) => {
  try {
    const { socio, fechaInicio, hash } = req.query;

    let query = `
      SELECT 
        f.hash_largo, f.monto, f.moneda, f.banco, f.referencia, f.titular, f.procesado_ia,
        c.hash_corto, c.url_imagen, c.nombre_socio_1, c.nombre_socio_2, c.caption, c.timestamp, c.conteo
      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      WHERE c.conteo > 1
    `;

    const values = [];
    let paramIndex = 1;

    if (socio) {
      query += ` AND (c.nombre_socio_1 = $${paramIndex} OR c.nombre_socio_2 = $${paramIndex})`;
      values.push(socio);
      paramIndex++;
    }

    if (fechaInicio) {
      const startTimestamp = Math.floor(new Date(fechaInicio).getTime() / 1000);
      query += ` AND c.timestamp >= $${paramIndex}`;
      values.push(startTimestamp);
      paramIndex++;
    }

    if (hash) {
      query += ` AND c.hash_corto = $${paramIndex}`;
      values.push(hash);
      paramIndex++;
    }

    query += ` ORDER BY c.timestamp DESC;`;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/comprobantes', getComprobantesHandler);
app.get('/api/cola', getComprobantesHandler);

app.put('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { monto, moneda, banco, referencia, titular, nombre_socio_1, nombre_socio_2 } = req.body;

    const queryMaster = `
      UPDATE comprobantes_fb
      SET monto = $1, moneda = $2, banco = $3, referencia = $4, titular = $5, procesado_ia = TRUE
      WHERE hash_largo = $6 RETURNING *;
    `;

    const { rows } = await pool.query(queryMaster, [
      monto !== undefined && monto !== '' ? parseFloat(monto) : null,
      moneda || null,
      banco ? banco.toUpperCase() : null,
      referencia || null,
      titular ? titular.toUpperCase() : null,
      hash_largo
    ]);

    if (nombre_socio_1 !== undefined || nombre_socio_2 !== undefined) {
      await pool.query(
        `UPDATE cola_fb SET nombre_socio_1 = $1, nombre_socio_2 = $2 WHERE hash_largo = $3;`,
        [nombre_socio_1 || null, nombre_socio_2 || null, hash_largo]
      );
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en PUT /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { rows } = await pool.query(`DELETE FROM comprobantes_fb WHERE hash_largo = $1 RETURNING *;`, [hash_largo]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    await pool.query(`UPDATE cola_fb SET estado = 'DESCARTADO' WHERE hash_largo = $1;`, [hash_largo]);
    res.json({ success: true, message: 'Comprobante eliminado' });
  } catch (err) {
    console.error('Error en DELETE /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- SOCIOS Y DIRECTORIO ---
app.get('/api/socios', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre FROM cola_fb WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre FROM cola_fb WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre FROM nombres_fb WHERE roles = 'SOCIO'
      ) s ORDER BY nombre ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/socios', async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(c.nombre_socio_1, 'Sin Asignar') AS socio,
        COUNT(DISTINCT f.hash_largo) AS total_comprobantes,
        SUM(COALESCE(f.monto, 0)) AS total_monto_acumulado
      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      WHERE c.conteo > 1
      GROUP BY COALESCE(c.nombre_socio_1, 'Sin Asignar')
      ORDER BY total_comprobantes DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/directorio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nombres_fb ORDER BY nombre ASC;');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/directorio', async (req, res) => {
  try {
    const { id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp } = req.body;
    const query = `
      INSERT INTO nombres_fb (id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id_grupo) DO UPDATE SET
        nombre = EXCLUDED.nombre, roles = EXCLUDED.roles, moneda_socio = EXCLUDED.moneda_socio,
        usd = EXCLUDED.usd, pen = EXCLUDED.pen, cop = EXCLUDED.cop, clp = EXCLUDED.clp
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [id_grupo, nombre, roles || 'GRUPO', moneda_socio || null, usd || null, pen || null, cop || null, clp || null]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- FRONTEND SPA ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor Atenea v2 activo en http://${HOST}:${PORT}`);
});

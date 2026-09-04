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

// Matriz de factores de ajuste por socio (extraída de Hoole - T_Ajustes.csv)
const MATRIZ_AJUSTES_SOCIOS = {
  "OMAR": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "D-ECU": 1.064, "P-BRL": 0.971, "D-BRL": -1.031, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.97, "D-PYG": 1.03, "P-EUR": 0.962, "D-EUR": -1.042, "P-BOB": -0.926, "D-BOB": 1.087 },
  "CHASAN": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": 0.98, "D-CLP": -1.02, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "P-ECU": -0.96, "D-ECU": 1.042, "P-MXN": 0.97, "D-MXN": -1.03, "P-BRL": -0.952, "D-BRL": 1.053, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 },
  "JOSEM": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": 0.98, "D-CLP": -1.02, "P-ARS": -0.962, "D-ARS": 1.042, "D-USD": 1.087, "P-ECU": -0.94, "D-ECU": 1.064, "P-MXN": -0.943, "D-MXN": 1.064, "P-BRL": -0.952, "D-BRL": 1.053, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 },
  "NELSY": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": 0.98, "D-ARS": -1.02, "P-USD": -0.93, "D-USD": 1.087, "P-ECU": -0.94, "D-ECU": 1.064, "P-MXN": -0.943, "D-MXN": 1.064, "P-BRL": -0.952, "D-BRL": 1.053, "P-VES": 0.99, "P-PYG": -0.97, "D-PYG": 1.03, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 },
  "YARELIS": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": -0.962, "D-ARS": 1.042, "P-ECU": 0.98, "D-ECU": 1.02, "P-MXN": -0.943, "D-MXN": 1.064, "P-BRL": -0.952, "D-BRL": 1.053, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 },
  "ELIS": { "P-USDT": 1.0, "D-USDT": 1.0, "P-PYUSD": -0.8, "D-PYUSD": 1.2, "P-PEN": -0.976, "D-PEN": 1.026, "P-COP": -0.976, "D-COP": 1.03, "P-CLP": -0.962, "D-CLP": 1.042, "P-ARS": -0.962, "D-ARS": 1.042, "P-USD": -0.93, "D-USD": 1.087, "P-ECU": -0.94, "D-ECU": 1.064, "P-MXN": -0.943, "D-MXN": 1.064, "P-PYG": -0.962, "D-PYG": 1.042, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.943, "D-DOP": 1.064, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.943, "D-CRC": 1.064, "P-CAD": -0.962, "D-CAD": 1.042 },
  "IRIS": { "P-USDT": -0.926, "D-USDT": 1.087, "P-PYUSD": -0.926, "D-PYUSD": 1.087, "P-PEN": -0.967, "D-PEN": 1.047, "P-COP": 0.98, "D-COP": -1.02, "P-CLP": -0.967, "D-CLP": 1.047, "P-ARS": -0.967, "D-ARS": 1.047, "P-USD": -0.926, "D-USD": 1.087, "P-ECU": -0.926, "D-ECU": 1.064, "P-MXN": -0.926, "D-MXN": 1.087, "P-BRL": -0.926, "D-BRL": 1.087, "P-VES": -0.976, "D-VES": 1.026, "P-PYG": -0.926, "D-PYG": 1.087, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.926, "D-DOP": 1.087, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.926, "D-CRC": 1.087, "P-CAD": -0.926, "D-CAD": 1.087 },
  "MERLI": { "P-USDT": -0.926, "D-USDT": 1.087, "P-PYUSD": -0.926, "D-PYUSD": 1.087, "P-PEN": -0.967, "D-PEN": 1.047, "P-COP": -0.967, "D-COP": 1.047, "P-CLP": -0.967, "D-CLP": 1.047, "P-ARS": -0.967, "D-ARS": 1.047, "P-USD": -0.926, "D-USD": 1.087, "P-ECU": -0.926, "D-ECU": 1.064, "P-MXN": -0.926, "D-MXN": 1.087, "P-BRL": -0.926, "D-BRL": 1.087, "P-VES": -0.967, "D-VES": 1.047, "P-PYG": -0.926, "D-PYG": 1.087, "P-EUR": -0.926, "D-EUR": 1.087, "P-DOP": -0.926, "D-DOP": 1.087, "P-BOB": -0.926, "D-BOB": 1.087, "P-CRC": -0.926, "D-CRC": 1.087, "P-CAD": -0.926, "D-CAD": 1.087 }
};

// Inicialización automática de esquema
async function initDB() {
  try {
    await pool.query(`
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
      CREATE INDEX IF NOT EXISTS idx_mercado_tasas_ts ON mercado_tasas (timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_cola_fb_ts ON cola_fb (timestamp DESC);
    `);

    // 1. Garantizar columnas de monedas y 'ajustes' JSONB en nombres_fb
    await pool.query(`
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS usd VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS pen VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS cop VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS clp VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ves VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ars VARCHAR(10);
      ALTER TABLE nombres_fb ADD COLUMN IF NOT EXISTS ajustes JSONB DEFAULT '{}'::jsonb;
    `);

    // 2. Sembrar/Actualizar matriz de ajustes en nombres_fb
    for (const [socio, ajustesObj] of Object.entries(MATRIZ_AJUSTES_SOCIOS)) {
      await pool.query(
        `UPDATE nombres_fb SET ajustes = $1 WHERE UPPER(TRIM(nombre)) = UPPER(TRIM($2));`,
        [JSON.stringify(ajustesObj), socio]
      );
    }
    console.log('✅ Matriz de ajustes sembrada e integrada en la tabla nombres_fb.');

    // 3. Recreación limpia de la Vista v_comprobantes_auditados
    await pool.query(`
      DROP VIEW IF EXISTS v_comprobantes_auditados CASCADE;
      CREATE VIEW v_comprobantes_auditados AS
      WITH primer_lote AS (
        SELECT id_tasa, timestamp
        FROM mercado_tasas
        ORDER BY timestamp ASC
        LIMIT 1
      ),
      lotes_rangos AS (
        SELECT 
          id_tasa,
          timestamp AS t_inicio,
          LEAD(timestamp) OVER (ORDER BY timestamp ASC) AS t_fin
        FROM (
          SELECT DISTINCT id_tasa, timestamp 
          FROM mercado_tasas
        ) lotes
      )
      SELECT 
        f.hash_largo,
        c.hash_corto,
        c.timestamp AS timestamp_comprobante,
        to_timestamp(c.timestamp) AS fecha_hora_comprobante,
        f.monto,
        UPPER(f.moneda) AS moneda,
        f.banco,
        f.titular,
        f.referencia,
        f.procesado_ia,
        c.nombre_socio_1,
        c.nombre_socio_2,
        c.url_imagen,
        c.conteo,
        COALESCE(lr.id_tasa, (SELECT id_tasa FROM primer_lote)) AS lote_tasa_asignado,
        COALESCE(mt.tasa_base, mt_primer.tasa_base) AS tasa_mercado_aplicada,
        CASE 
          WHEN COALESCE(mt.tasa_base, mt_primer.tasa_base) IS NOT NULL AND COALESCE(mt.tasa_base, mt_primer.tasa_base) > 0 
          THEN ROUND((f.monto / COALESCE(mt.tasa_base, mt_primer.tasa_base))::numeric, 2)
          ELSE NULL
        END AS monto_usd_equivalente
      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      LEFT JOIN lotes_rangos lr 
        ON c.timestamp >= lr.t_inicio 
       AND (lr.t_fin IS NULL OR c.timestamp < lr.t_fin)
      LEFT JOIN mercado_tasas mt 
        ON mt.id_tasa = lr.id_tasa 
       AND mt.moneda = UPPER(f.moneda)
      LEFT JOIN mercado_tasas mt_primer
        ON mt_primer.id_tasa = (SELECT id_tasa FROM primer_lote)
       AND mt_primer.moneda = UPPER(f.moneda);
    `);
    console.log('✅ Vista v_comprobantes_auditados actualizada.');
  } catch (err) {
    console.error('⚠️ Error al inicializar esquema en PostgreSQL:', err.message);
  }
}

initDB();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let borradorTasas = {};

// --- DIAGNÓSTICO ---
app.get('/health', (req, res) => res.status(200).send('OK'));

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
app.post('/api/tasas/n8n-webhook', (req, res) => {
  try {
    let payload = req.body;
    if (Array.isArray(payload)) payload = payload[0] || {};
    if (payload.json) payload = payload.json;

    borradorTasas = payload;
    console.log('✅ Borrador de tasas actualizado desde n8n:', borradorTasas);
    return res.json({ success: true, message: 'Borrador cargado en memoria', rates: borradorTasas });
  } catch (err) {
    console.error('❌ Error al recibir borrador:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tasas/fetch-hoo', (req, res) => {
  if (!borradorTasas || Object.keys(borradorTasas).length === 0) {
    return res.status(404).json({ success: false, msg: 'El motor de n8n aún no ha enviado un borrador reciente.' });
  }
  return res.json({ success: true, rates: borradorTasas });
});

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

// --- COMPROBANTES Y CÁLCULO DE TASA 1 Y TASA 2 ---
const getComprobantesHandler = async (req, res) => {
  try {
    const { socio, fechaInicio, hash } = req.query;

    let query = `
      SELECT 
        v.hash_largo, 
        v.monto, 
        v.moneda, 
        v.banco, 
        v.referencia, 
        v.titular, 
        v.procesado_ia,
        v.hash_corto, 
        v.url_imagen, 
        v.nombre_socio_1, 
        v.nombre_socio_2, 
        v.timestamp_comprobante AS timestamp, 
        v.conteo, 
        v.lote_tasa_asignado, 
        v.tasa_mercado_aplicada AS tasa_base,
        v.monto_usd_equivalente,

        -- Tasa ajustada para Socio 1 según la columna 'ajustes' de nombres_fb
        COALESCE(
          ROUND((v.tasa_mercado_aplicada * ABS(
            COALESCE(
              (n1.ajustes->>(
                COALESCE(
                  CASE v.moneda
                    WHEN 'PEN' THEN n1.pen
                    WHEN 'COP' THEN n1.cop
                    WHEN 'CLP' THEN n1.clp
                    WHEN 'VES' THEN n1.ves
                    WHEN 'ARS' THEN n1.ars
                    WHEN 'USD' THEN n1.usd
                    ELSE 'D'
                  END, 'D'
                ) || '-' || v.moneda
              ))::numeric,
              1
            )
          ))::numeric, 6),
          v.tasa_mercado_aplicada
        ) AS tasa_1,

        -- Tasa ajustada para Socio 2 según la columna 'ajustes' de nombres_fb
        COALESCE(
          ROUND((v.tasa_mercado_aplicada * ABS(
            COALESCE(
              (n2.ajustes->>(
                COALESCE(
                  CASE v.moneda
                    WHEN 'PEN' THEN n2.pen
                    WHEN 'COP' THEN n2.cop
                    WHEN 'CLP' THEN n2.clp
                    WHEN 'VES' THEN n2.ves
                    WHEN 'ARS' THEN n2.ars
                    WHEN 'USD' THEN n2.usd
                    ELSE 'D'
                  END, 'D'
                ) || '-' || v.moneda
              ))::numeric,
              1
            )
          ))::numeric, 6),
          v.tasa_mercado_aplicada
        ) AS tasa_2

      FROM v_comprobantes_auditados v
      LEFT JOIN nombres_fb n1 ON UPPER(TRIM(n1.nombre)) = UPPER(TRIM(v.nombre_socio_1))
      LEFT JOIN nombres_fb n2 ON UPPER(TRIM(n2.nombre)) = UPPER(TRIM(v.nombre_socio_2))
      WHERE v.conteo > 1
    `;

    const values = [];
    let paramIndex = 1;

    if (socio) {
      query += ` AND (v.nombre_socio_1 = $${paramIndex} OR v.nombre_socio_2 = $${paramIndex})`;
      values.push(socio);
      paramIndex++;
    }

    if (fechaInicio) {
      const startTimestamp = Math.floor(new Date(fechaInicio).getTime() / 1000);
      query += ` AND v.timestamp_comprobante >= $${paramIndex}`;
      values.push(startTimestamp);
      paramIndex++;
    }

    if (hash) {
      query += ` AND v.hash_corto = $${paramIndex}`;
      values.push(hash);
      paramIndex++;
    }

    query += ` ORDER BY v.timestamp_comprobante DESC;`;

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
    const { id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp, ves, ars, ajustes } = req.body;
    const query = `
      INSERT INTO nombres_fb (id_grupo, nombre, roles, moneda_socio, usd, pen, cop, clp, ves, ars, ajustes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id_grupo) DO UPDATE SET
        nombre = EXCLUDED.nombre, roles = EXCLUDED.roles, moneda_socio = EXCLUDED.moneda_socio,
        usd = EXCLUDED.usd, pen = EXCLUDED.pen, cop = EXCLUDED.cop, clp = EXCLUDED.clp,
        ves = EXCLUDED.ves, ars = EXCLUDED.ars,
        ajustes = COALESCE(EXCLUDED.ajustes, nombres_fb.ajustes)
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [
      id_grupo, nombre, roles || 'GRUPO', moneda_socio || null, 
      usd || null, pen || null, cop || null, clp || null,
      ves || null, ars || null,
      ajustes ? JSON.stringify(ajustes) : null
    ]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Servidor Atenea v2 activo en http://${HOST}:${PORT}`);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Credenciales verificadas de tu contenedor en Coolify
const DEFAULT_DB_URL = 'postgres://postgres:lrh48me5dz3pqtgg214j@automat_postgres-db:5432/automat';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_DB_URL,
  ssl: false
});

// Verificación inicial de conexión
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error de conexión en PostgreSQL:', err.message);
  } else {
    console.log('✅ Backend conectado correctamente a la base de datos "automat"');
    release();
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// -----------------------------------------------------------------------------
// DIAGNÓSTICO RÁPIDO DE BASE DE DATOS
// -----------------------------------------------------------------------------
app.get('/api/test-db', async (req, res) => {
  try {
    const testQuery = await pool.query('SELECT NOW();');
    const countMaster = await pool.query('SELECT COUNT(*) FROM comprobantes_fb;');
    res.json({
      status: 'OK',
      conexion: 'Exitosa',
      hora_servidor: testQuery.rows[0].now,
      registros_tabla_maestra: countMaster.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', mensaje: err.message, codigo: err.code });
  }
});

// -----------------------------------------------------------------------------
// 1. LECTURA PRINCIPAL: TABLA MAESTRA (comprobantes_fb)
// -----------------------------------------------------------------------------
app.get('/api/comprobantes', async (req, res) => {
  try {
    const { socio, fechaInicio, hash, soloDuplicados } = req.query;

    let query = `
      SELECT 
        f.hash_largo, 
        f.monto, 
        f.moneda, 
        f.banco, 
        f.referencia, 
        f.titular, 
        f.procesado_ia,
        c.hash_corto, 
        c.url_imagen, 
        c.nombre_socio_1, 
        c.nombre_socio_2, 
        c.caption, 
        c.timestamp, 
        c.conteo
      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      WHERE 1=1
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

    if (soloDuplicados === 'true') {
      query += ` AND c.conteo > 1`;
    }

    query += ` ORDER BY c.timestamp DESC;`;

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. EDICIÓN / AUDITORÍA DIRECTA EN TABLA MAESTRA
// -----------------------------------------------------------------------------
app.put('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;
    const { monto, moneda, banco, referencia, titular, nombre_socio_1, nombre_socio_2 } = req.body;

    const queryMaster = `
      UPDATE comprobantes_fb
      SET 
        monto = $1,
        moneda = $2,
        banco = $3,
        referencia = $4,
        titular = $5,
        procesado_ia = TRUE
      WHERE hash_largo = $6
      RETURNING *;
    `;

    const { rows } = await pool.query(queryMaster, [
      monto !== undefined && monto !== '' ? parseFloat(monto) : null,
      moneda || null,
      banco ? banco.toUpperCase() : null,
      referencia || null,
      titular ? titular.toUpperCase() : null,
      hash_largo
    ]);

    // Mantiene la asignación del socio en la tabla de soporte
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

// -----------------------------------------------------------------------------
// 3. ELIMINACIÓN DE REGISTROS DE LA TABLA MAESTRA
// -----------------------------------------------------------------------------
app.delete('/api/comprobantes/:hash_largo', async (req, res) => {
  try {
    const { hash_largo } = req.params;

    const { rows } = await pool.query(`DELETE FROM comprobantes_fb WHERE hash_largo = $1 RETURNING *;`, [hash_largo]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado en comprobantes_fb' });
    }

    res.json({ success: true, message: 'Comprobante eliminado de la tabla maestra' });
  } catch (err) {
    console.error('Error en DELETE /api/comprobantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. LISTA DE SOCIOS PARA FILTROS
// -----------------------------------------------------------------------------
app.get('/api/socios', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT nombre FROM (
        SELECT nombre_socio_1 AS nombre FROM cola_fb WHERE nombre_socio_1 IS NOT NULL AND nombre_socio_1 != ''
        UNION
        SELECT nombre_socio_2 AS nombre FROM cola_fb WHERE nombre_socio_2 IS NOT NULL AND nombre_socio_2 != ''
        UNION
        SELECT nombre FROM nombres_fb WHERE roles = 'SOCIO'
      ) s
      ORDER BY nombre ASC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/socios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. REPORTES CONSOLIDADOS (BASADOS EN REGISTROS VALIDADOS)
// -----------------------------------------------------------------------------
app.get('/api/reportes/socios', async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(c.nombre_socio_1, 'Sin Asignar') AS socio,
        COUNT(DISTINCT f.hash_largo) AS total_comprobantes,
        SUM(f.monto) AS total_monto_acumulado
      FROM comprobantes_fb f
      INNER JOIN cola_fb c ON f.hash_largo = c.hash_largo
      GROUP BY COALESCE(c.nombre_socio_1, 'Sin Asignar')
      ORDER BY total_comprobantes DESC;
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/reportes/socios:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. DIRECTORIO (nombres_fb)
// -----------------------------------------------------------------------------
app.get('/api/directorio', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nombres_fb ORDER BY nombre ASC;');
    res.json(rows);
  } catch (err) {
    console.error('Error en GET /api/directorio:', err.message);
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
        nombre = EXCLUDED.nombre,
        roles = EXCLUDED.roles,
        moneda_socio = EXCLUDED.moneda_socio,
        usd = EXCLUDED.usd,
        pen = EXCLUDED.pen,
        cop = EXCLUDED.cop,
        clp = EXCLUDED.clp
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      id_grupo,
      nombre,
      roles || 'GRUPO',
      moneda_socio || null,
      usd || null,
      pen || null,
      cop || null,
      clp || null
    ]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error en POST /api/directorio:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback (raíz)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Backend Atenea activo en puerto ${PORT}`);
});

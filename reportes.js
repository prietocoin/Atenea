const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
});

router.get('/reportes', (req, res) => {
  res.sendFile(path.join(__dirname, 'reportes.html'));
});

router.get('/api/reportes/operaciones', async (req, res) => {
  try {
    const { rol, nombre, fechaInicio, fechaFin, desdeHash } = req.query;

    let query = `
      SELECT 
        id,
        created_at AS fecha_hora,
        hash,
        descripcion,
        banco,
        moneda_origen,
        lote,
        tasa_base,
        tasa_socio,
        monto_origen,
        monto_socio,
        moneda_socio,
        equiv_usd
      FROM operaciones
      WHERE 1=1
    `;

    const queryParams = [];

    if (rol && rol !== 'TODOS') {
      queryParams.push(rol);
      query += ` AND COALESCE(rol, 'SOCIO') = $${queryParams.length}`;
    }

    if (nombre && nombre !== 'TODOS') {
      queryParams.push(nombre);
      query += ` AND entidad_auditada = $${queryParams.length}`;
    }

    if (fechaInicio) {
      queryParams.push(fechaInicio);
      query += ` AND created_at >= $${queryParams.length}::timestamp`;
    }

    if (fechaFin) {
      queryParams.push(`${fechaFin} 23:59:59`);
      query += ` AND created_at <= $${queryParams.length}::timestamp`;
    }

    if (desdeHash) {
      queryParams.push(desdeHash);
      query += ` AND id >= (SELECT id FROM operaciones WHERE hash = $${queryParams.length} LIMIT 1)`;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, queryParams);

    const totalComprobantes = rows.length;
    const totalMontoSocio = rows.reduce((acc, row) => acc + (parseFloat(row.monto_socio) || 0), 0);

    res.json({
      success: true,
      data: rows,
      totales: {
        comprobantes: totalComprobantes,
        montoAcumulado: Number(totalMontoSocio.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error en módulo reportes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/reportes/filtros', async (req, res) => {
  try {
    const { rol } = req.query;

    const rolesQuery = `
      SELECT DISTINCT COALESCE(rol, 'SOCIO') AS rol 
      FROM operaciones 
      WHERE rol IS NOT NULL AND rol != ''
      ORDER BY rol ASC
    `;

    let entidadesQuery = `
      SELECT DISTINCT entidad_auditada 
      FROM operaciones 
      WHERE entidad_auditada IS NOT NULL AND entidad_auditada != ''
    `;
    const params = [];

    if (rol && rol !== 'TODOS') {
      params.push(rol);
      entidadesQuery += ` AND COALESCE(rol, 'SOCIO') = $1`;
    }
    entidadesQuery += ` ORDER BY entidad_auditada ASC`;

    const hashesQuery = `
      SELECT DISTINCT hash, id 
      FROM operaciones 
      WHERE hash IS NOT NULL AND hash != '' 
      ORDER BY id DESC 
      LIMIT 100
    `;

    const [rolesRes, entidadesRes, hashesRes] = await Promise.all([
      pool.query(rolesQuery),
      pool.query(entidadesQuery, params),
      pool.query(hashesQuery)
    ]);

    res.json({
      success: true,
      roles: rolesRes.rows.length > 0 ? rolesRes.rows.map(r => r.rol) : ['SOCIO', 'GRUPO', 'ASESOR'],
      entidades: entidadesRes.rows.map(r => r.entidad_auditada),
      hashes: hashesRes.rows.map(r => r.hash)
    });
  } catch (error) {
    console.error('Error obteniendo lista de filtros:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Conexión independiente utilizando las mismas variables de entorno existentes
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
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

    // Cálculo de acumulados en memoria
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

module.exports = router;

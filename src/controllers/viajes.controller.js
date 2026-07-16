const { getPool, sql } = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const { buscar, pagina = 1, limite = 10 } = req.query;
    const pool = await getPool();
    const paginaNum = Math.max(1, Number(pagina));
    const limiteNum = Math.max(1, Number(limite));
    const offset = (paginaNum - 1) * limiteNum;

    let whereClause = '';
    if (buscar) {
      whereClause = ' WHERE Destino LIKE @buscar OR Estado LIKE @buscar';
    }

    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM Viajes${whereClause}`);
    const total = countResult.recordset[0].total;

    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT * FROM Viajes${whereClause}
      ORDER BY Fecha DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `);

    res.json({
      datos: result.recordset,
      total,
      pagina: paginaNum,
      totalPaginas: Math.ceil(total / limiteNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  const { fecha, destino, precio, montoPagado } = req.body;
  if (!fecha || !destino || precio == null) {
    return res.status(400).json({ error: 'Fecha, destino y precio son obligatorios' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const insertRequest = new sql.Request(transaction);
    const result = await insertRequest
      .input('fecha', sql.Date, fecha)
      .input('destino', sql.NVarChar(150), destino)
      .input('precio', sql.Decimal(10, 2), precio)
      .input('pagado', sql.Decimal(10, 2), montoPagado || 0)
      .query(`
        INSERT INTO Viajes (Fecha, Destino, Precio, MontoPagado)
        OUTPUT INSERTED.*
        VALUES (@fecha, @destino, @precio, @pagado)
      `);

    const nuevoViaje = result.recordset[0];

    // Si registró un pago inicial, queda también en el historial de abonos
    if (montoPagado && Number(montoPagado) > 0) {
      const abonoRequest = new sql.Request(transaction);
      await abonoRequest
        .input('viajeId', sql.Int, nuevoViaje.ViajeId)
        .input('monto', sql.Decimal(10, 2), montoPagado)
        .input('fecha', sql.Date, fecha)
        .query(`INSERT INTO AbonosViajes (ViajeId, Monto, FechaAbono) VALUES (@viajeId, @monto, @fecha)`);
    }

    await transaction.commit();
    res.status(201).json(nuevoViaje);
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { fecha, destino, precio } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('fecha', sql.Date, fecha)
      .input('destino', sql.NVarChar(150), destino)
      .input('precio', sql.Decimal(10, 2), precio)
      .query(`UPDATE Viajes SET Fecha=@fecha, Destino=@destino, Precio=@precio OUTPUT INSERTED.* WHERE ViajeId=@id`);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Registrar un abono posterior, con su propia fecha
exports.registrarAbono = async (req, res) => {
  const { monto, fechaAbono } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto de abono inválido' });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const fecha = fechaAbono || new Date();

    const abonoRequest = new sql.Request(transaction);
    await abonoRequest
      .input('viajeId', sql.Int, req.params.id)
      .input('monto', sql.Decimal(10, 2), monto)
      .input('fecha', sql.Date, fecha)
      .query(`INSERT INTO AbonosViajes (ViajeId, Monto, FechaAbono) VALUES (@viajeId, @monto, @fecha)`);

    const updateRequest = new sql.Request(transaction);
    const result = await updateRequest
      .input('id', sql.Int, req.params.id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        UPDATE Viajes SET MontoPagado = MontoPagado + @monto
        OUTPUT INSERTED.*
        WHERE ViajeId = @id
      `);

    if (result.recordset.length === 0) throw new Error('Viaje no encontrado');

    await transaction.commit();
    res.json(result.recordset[0]);
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ error: err.message });
  }
};

exports.getAbonos = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('viajeId', sql.Int, req.params.id)
      .query('SELECT * FROM AbonosViajes WHERE ViajeId = @viajeId ORDER BY FechaAbono ASC, AbonoId ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Viajes WHERE ViajeId=@id');
    res.json({ mensaje: 'Viaje eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
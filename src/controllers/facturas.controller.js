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
      whereClause = ' WHERE Nombre LIKE @buscar OR Estado LIKE @buscar';
    }

    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM Facturas${whereClause}`);
    const total = countResult.recordset[0].total;

    // Suma total del Monto sobre TODOS los registros que coinciden con la búsqueda (no solo la página actual)
    const sumRequest = pool.request();
    if (buscar) sumRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const sumResult = await sumRequest.query(`SELECT ISNULL(SUM(Monto), 0) AS totalMonto FROM Facturas${whereClause}`);
    const totalMontoGeneral = sumResult.recordset[0].totalMonto;

    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT * FROM Facturas${whereClause}
      ORDER BY FacturaId DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `);

    res.json({
      datos: result.recordset,
      total,
      pagina: paginaNum,
      totalPaginas: Math.ceil(total / limiteNum) || 1,
      totalMontoGeneral,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Facturas WHERE FacturaId = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  const { nombre, fecha, monto, porcentajeIva, montoPagado } = req.body;

  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!fecha || monto == null) {
    return res.status(400).json({ error: 'Fecha y monto son obligatorios' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const insertRequest = new sql.Request(transaction);
    const result = await insertRequest
      .input('nombre', sql.NVarChar(150), nombre)
      .input('fecha', sql.Date, fecha)
      .input('monto', sql.Decimal(10, 2), monto)
      .input('iva', sql.Decimal(5, 2), porcentajeIva ?? 13.00)
      .input('pagado', sql.Decimal(10, 2), montoPagado || 0)
      .query(`
        INSERT INTO Facturas (Nombre, Fecha, Monto, PorcentajeIva, MontoPagado)
        OUTPUT INSERTED.*
        VALUES (@nombre, @fecha, @monto, @iva, @pagado)
      `);

    const nuevaFactura = result.recordset[0];

    if (montoPagado && Number(montoPagado) > 0) {
      const abonoRequest = new sql.Request(transaction);
      await abonoRequest
        .input('facturaId', sql.Int, nuevaFactura.FacturaId)
        .input('monto', sql.Decimal(10, 2), montoPagado)
        .input('fecha', sql.Date, fecha)
        .query(`INSERT INTO AbonosFacturas (FacturaId, Monto, FechaAbono) VALUES (@facturaId, @monto, @fecha)`);
    }

    await transaction.commit();
    res.status(201).json(nuevaFactura);
  } catch (err) {
    await transaction.rollback();
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre, fecha, monto, porcentajeIva } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('fecha', sql.Date, fecha)
      .input('monto', sql.Decimal(10, 2), monto)
      .input('iva', sql.Decimal(5, 2), porcentajeIva)
      .query(`
        UPDATE Facturas
        SET Nombre=@nombre, Fecha=@fecha, Monto=@monto, PorcentajeIva=@iva
        OUTPUT INSERTED.*
        WHERE FacturaId=@id
      `);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Registrar un abono posterior, con su propia fecha (se aplica sobre el monto del IVA)
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
      .input('facturaId', sql.Int, req.params.id)
      .input('monto', sql.Decimal(10, 2), monto)
      .input('fecha', sql.Date, fecha)
      .query(`INSERT INTO AbonosFacturas (FacturaId, Monto, FechaAbono) VALUES (@facturaId, @monto, @fecha)`);

    const updateRequest = new sql.Request(transaction);
    const result = await updateRequest
      .input('id', sql.Int, req.params.id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        UPDATE Facturas SET MontoPagado = MontoPagado + @monto
        OUTPUT INSERTED.*
        WHERE FacturaId = @id
      `);

    if (result.recordset.length === 0) throw new Error('Factura no encontrada');

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
      .input('facturaId', sql.Int, req.params.id)
      .query('SELECT * FROM AbonosFacturas WHERE FacturaId = @facturaId ORDER BY FechaAbono ASC, AbonoId ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Facturas WHERE FacturaId=@id');
    res.json({ mensaje: 'Factura eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
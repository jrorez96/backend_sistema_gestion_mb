const { getPool, sql } = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const { buscar, pagina = 1, limite = 10 } = req.query;
    const pool = await getPool();
    const paginaNum = Math.max(1, Number(pagina));
    const limiteNum = Math.max(1, Number(limite));
    const offset = (paginaNum - 1) * limiteNum;

    const baseFrom = `
      FROM Ventas v
      JOIN Clientes c ON v.ClienteId = c.ClienteId
      JOIN Llantas l ON v.LlantaId = l.LlantaId
    `;
    let whereClause = '';
    if (buscar) {
      whereClause = ' WHERE c.Nombre LIKE @buscar OR l.Marca LIKE @buscar OR l.Medida LIKE @buscar OR v.Estado LIKE @buscar';
    }

    const countRequest = pool.request();
    if (buscar) countRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total ${baseFrom}${whereClause}`);
    const total = countResult.recordset[0].total;

    const dataRequest = pool.request();
    if (buscar) dataRequest.input('buscar', sql.NVarChar, `%${buscar}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limite', sql.Int, limiteNum);

    const result = await dataRequest.query(`
      SELECT v.*, c.Nombre AS ClienteNombre, l.Marca, l.Medida
      ${baseFrom}${whereClause}
      ORDER BY v.VentaId DESC
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
  const { clienteId, llantaId, cantidad, porcentajeIva, montoPagado } = req.body;

  if (!clienteId || !llantaId || !cantidad) {
    return res.status(400).json({ error: 'clienteId, llantaId y cantidad son obligatorios' });
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = new sql.Request(transaction);

    const llanta = await request
      .input('llantaId', sql.Int, llantaId)
      .query('SELECT PrecioVenta, Cantidad FROM Llantas WHERE LlantaId = @llantaId');

    if (llanta.recordset.length === 0) throw new Error('Llanta no encontrada');
    const { PrecioVenta, Cantidad: stockDisponible } = llanta.recordset[0];

    if (stockDisponible < cantidad) {
      throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}`);
    }

    const insertRequest = new sql.Request(transaction);
    const ventaResult = await insertRequest
      .input('clienteId', sql.Int, clienteId)
      .input('llantaId', sql.Int, llantaId)
      .input('cantidad', sql.Int, cantidad)
      .input('precio', sql.Decimal(10, 2), PrecioVenta)
      .input('iva', sql.Decimal(5, 2), porcentajeIva ?? 13.00)
      .input('pagado', sql.Decimal(10, 2), montoPagado || 0)
      .query(`
        INSERT INTO Ventas (ClienteId, LlantaId, Cantidad, PrecioVentaUnitario, PorcentajeIva, MontoPagado)
        OUTPUT INSERTED.*
        VALUES (@clienteId, @llantaId, @cantidad, @precio, @iva, @pagado)
      `);

    const stockRequest = new sql.Request(transaction);
    await stockRequest
      .input('llantaId', sql.Int, llantaId)
      .input('cantidad', sql.Int, cantidad)
      .query('UPDATE Llantas SET Cantidad = Cantidad - @cantidad WHERE LlantaId = @llantaId');

    await transaction.commit();
    res.status(201).json(ventaResult.recordset[0]);
  } catch (err) {
    await transaction.rollback();
    res.status(400).json({ error: err.message });
  }
};

exports.registrarAbono = async (req, res) => {
  try {
    const { monto } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto de abono inválido' });

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('monto', sql.Decimal(10, 2), monto)
      .query(`
        UPDATE Ventas SET MontoPagado = MontoPagado + @monto
        OUTPUT INSERTED.*
        WHERE VentaId = @id
      `);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Ventas WHERE VentaId = @id');
    res.json({ mensaje: 'Venta eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
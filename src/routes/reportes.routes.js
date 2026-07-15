const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportes.controller');

router.get('/ventas', controller.reporteVentas);
router.get('/viajes', controller.reporteViajes);
router.get('/facturas', controller.reporteFacturas);

module.exports = router;
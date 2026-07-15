const express = require('express');
const router = express.Router();
const controller = require('../controllers/ventas.controller');

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/:id/abono', controller.registrarAbono);
router.delete('/:id', controller.remove);

module.exports = router;
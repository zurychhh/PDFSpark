const express = require('express');
const router = express.Router();
const { getSessionUser } = require('../middlewares/auth');
const conversionController = require('../controllers/conversionController');

// Apply session user middleware to all routes
router.use(getSessionUser);

// Conversion routes
router.post('/convert', conversionController.startConversion);
router.get('/operations/:id/status', conversionController.getConversionStatus);
router.get('/operations/:id/download', conversionController.getConversionResult);
router.get('/operations/:id/preview', conversionController.getResultPreview);

// Payment routes
router.post('/payments/create', conversionController.createPayment);
router.get('/payments/:id/status', conversionController.getPaymentStatus);

// Stripe webhook endpoint (no session middleware needed)
router.post('/webhook', conversionController.stripeWebhook);

module.exports = router;
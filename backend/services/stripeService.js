const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
});
const Payment = require('../models/Payment');
const Operation = require('../models/Operation');

// Create a checkout session for a premium conversion
exports.createCheckoutSession = async (operation, returnUrl) => {
  try {
    // Get the operation format price
    const prices = {
      'xlsx': 1.99,
      'pptx': 1.99,
      'docx': 0.99,
      'jpg': 0.99,
      'txt': 0.49
    };
    
    const price = prices[operation.targetFormat] || 0.99;
    const priceInCents = Math.round(price * 100);
    
    // Create a Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `PDF to ${operation.targetFormat.toUpperCase()} Conversion`,
              description: 'One-time PDF conversion service',
            },
            unit_amount: priceInCents, // Price in cents
          },
          quantity: 1,
        },
      ],
      client_reference_id: operation._id.toString(),
      mode: 'payment',
      success_url: `${returnUrl}?payment_id={CHECKOUT_SESSION_ID}&operation_id=${operation._id}`,
      cancel_url: `${returnUrl}?canceled=true&operation_id=${operation._id}`,
      metadata: {
        operationId: operation._id.toString(),
        service: 'pdf-conversion',
        format: operation.targetFormat
      }
    });
    
    return session;
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    throw error;
  }
};

// Process Stripe webhook event
exports.handleWebhookEvent = async (event) => {
  const { type, data } = event;
  
  try {
    switch (type) {
      case 'checkout.session.completed':
        await handleCompletedCheckout(data.object);
        break;
      case 'checkout.session.expired':
        await handleExpiredCheckout(data.object);
        break;
      case 'payment_intent.succeeded':
        await handleSuccessfulPayment(data.object);
        break;
      case 'payment_intent.payment_failed':
        await handleFailedPayment(data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Handle subscription events in a real implementation
        console.log(`Received subscription event: ${type}`);
        break;
      default:
        console.log(`Unhandled Stripe event type: ${type}`);
    }
  } catch (error) {
    console.error(`Error handling webhook event ${type}:`, error);
    // Don't throw here, we want to acknowledge the webhook receipt
  }
};

// Handle completed checkout session
const handleCompletedCheckout = async (session) => {
  try {
    const operationId = session.metadata.operationId;
    
    // Find the operation and payment
    const operation = await Operation.findById(operationId);
    if (!operation) {
      console.error(`Operation not found for ID: ${operationId}`);
      return;
    }
    
    // Find or create a payment
    let payment = await Payment.findOne({ 
      operationId: operation._id, 
      stripeSessionId: session.id 
    });
    
    if (!payment) {
      payment = await Payment.create({
        userId: operation.userId,
        sessionId: operation.sessionId,
        amount: session.amount_total / 100, // Convert cents to dollars
        currency: session.currency,
        operationId: operation._id,
        paymentMethod: 'card',
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent,
        status: 'successful',
        itemType: 'operation',
        completedAt: new Date()
      });
    } else {
      payment.status = 'successful';
      payment.completedAt = new Date();
      await payment.save();
    }
    
    // Update the operation
    operation.isPaid = true;
    operation.paymentId = payment._id;
    await operation.save();
    
    console.log(`Payment processed successfully for operation: ${operationId}`);
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
};

// Handle successful payment
const handleSuccessfulPayment = async (paymentIntent) => {
  try {
    // Find payments with this payment intent
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
    
    if (payment) {
      payment.status = 'successful';
      payment.completedAt = new Date();
      await payment.save();
      
      // Update the operation if available
      if (payment.operationId) {
        const operation = await Operation.findById(payment.operationId);
        if (operation) {
          operation.isPaid = true;
          await operation.save();
        }
      }
      
      console.log(`Payment updated for payment intent: ${paymentIntent.id}`);
    }
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
};

// Handle failed payment
const handleFailedPayment = async (paymentIntent) => {
  try {
    // Find payments with this payment intent
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
    
    if (payment) {
      payment.status = 'failed';
      await payment.save();
      console.log(`Payment marked as failed for payment intent: ${paymentIntent.id}`);
    }
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
};

// Handle expired checkout session
const handleExpiredCheckout = async (session) => {
  try {
    // Find the payment for this session
    const payment = await Payment.findOne({ stripeSessionId: session.id });
    
    if (payment) {
      payment.status = 'failed';
      payment.completedAt = new Date();
      await payment.save();
      
      console.log(`Payment marked as failed due to expired session: ${session.id}`);
    }
  } catch (error) {
    console.error('Error handling expired checkout session:', error);
  }
};
const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { protect } = require('../middleware/authMiddleware');
const Order = require('../models/Order');

// @desc    Create payment intent for order
// @route   POST /api/payments/create-payment-intent
// @access  Private
router.post('/create-payment-intent', protect, async (req, res) => {
  try {
    const { orderId, paymentMethodId } = req.body;

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user owns this order
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to pay for this order' });
    }

    // Check if order is still pending payment
    if (order.paymentStatus !== 'pending') {
      return res.status(400).json({ message: 'Order payment already processed' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.totalAmount * 100), // Convert to cents
      currency: 'usd', // You can change this to ETB when available
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        customerEmail: order.customerEmail,
      },
      receipt_email: order.customerEmail,
    });

    // Update order with payment intent ID
    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// @desc    Confirm payment (webhook handler)
// @route   POST /api/payments/webhook
// @access  Public (Stripe webhook)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
      break;
    case 'payment_intent.payment_failed':
      const failedPaymentIntent = event.data.object;
      await handlePaymentFailure(failedPaymentIntent);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// @desc    Get payment methods for customer
// @route   GET /api/payments/payment-methods
// @access  Private
router.get('/payment-methods', protect, async (req, res) => {
  try {
    // In a real implementation, you'd store customer payment methods
    // For now, return empty array
    res.json({
      success: true,
      paymentMethods: []
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ message: 'Failed to get payment methods' });
  }
});

// @desc    Process cash payment (for cash on delivery)
// @route   POST /api/payments/cash-payment
// @access  Private (staff only)
router.post('/cash-payment', protect, async (req, res) => {
  try {
    const { orderId, amountReceived, change } = req.body;

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update order payment status
    order.paymentStatus = 'completed';
    order.paymentMethod = 'cash';
    order.amountReceived = amountReceived;
    order.change = change;
    order.paidAt = new Date();

    await order.save();

    res.json({
      success: true,
      message: 'Cash payment processed successfully',
      order
    });
  } catch (error) {
    console.error('Cash payment error:', error);
    res.status(500).json({ message: 'Failed to process cash payment' });
  }
});

// Helper function to handle successful payment
async function handlePaymentSuccess(paymentIntent) {
  try {
    const orderId = paymentIntent.metadata.orderId;

    const order = await Order.findById(orderId);
    if (order) {
      order.paymentStatus = 'completed';
      order.stripePaymentIntentId = paymentIntent.id;
      order.paidAt = new Date();
      await order.save();

      console.log(`Payment completed for order ${order.orderNumber}`);
    }
  } catch (error) {
    console.error('Handle payment success error:', error);
  }
}

// Helper function to handle failed payment
async function handlePaymentFailure(paymentIntent) {
  try {
    const orderId = paymentIntent.metadata.orderId;

    const order = await Order.findById(orderId);
    if (order) {
      order.paymentStatus = 'failed';
      order.stripePaymentIntentId = paymentIntent.id;
      await order.save();

      console.log(`Payment failed for order ${order.orderNumber}`);
    }
  } catch (error) {
    console.error('Handle payment failure error:', error);
  }
}

module.exports = router;
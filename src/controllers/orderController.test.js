const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const stripePath = require.resolve('../config/stripe');
const originalStripeModule = require.cache[stripePath];
require.cache[stripePath] = {
  id: stripePath,
  filename: stripePath,
  loaded: true,
  exports: {}
};
const { updateOrderStatus } = require('./orderController');
delete require.cache[stripePath];
if (originalStripeModule) require.cache[stripePath] = originalStripeModule;

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('admin kitchen completion records payment using the order payment method', async (t) => {
  const originalFindById = Order.findById;
  const adminId = 'admin-id';
  const order = {
    _id: 'order-id',
    status: 'preparing',
    paymentStatus: 'pending',
    paymentMethod: 'bank',
    statusHistory: [],
    save: async () => {},
    populate: async () => order
  };
  t.after(() => { Order.findById = originalFindById; });
  Order.findById = async () => order;

  const res = createResponse();
  await updateOrderStatus({
    params: { id: order._id },
    body: { status: 'ready', confirmPayment: true },
    user: { _id: adminId, name: 'Admin', role: 'admin' },
    app: { get: () => null }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.status, 'ready');
  assert.equal(order.paymentStatus, 'completed');
  assert.equal(order.paymentMethod, 'bank');
  assert.equal(order.processedBy, adminId);
  assert.equal(order.processedByName, 'Admin');
  assert.equal(order.paidAt.getTime(), order.processedAt.getTime());
  assert.match(order.statusHistory[0].notes, /payment confirmed in kitchen display \(bank\)/);
});

test('only admins may confirm payment from the kitchen display', async (t) => {
  const originalFindById = Order.findById;
  t.after(() => { Order.findById = originalFindById; });
  Order.findById = async () => {
    throw new Error('Order lookup should not occur');
  };

  const res = createResponse();
  await updateOrderStatus({
    params: { id: 'order-id' },
    body: { status: 'ready', confirmPayment: true },
    user: { _id: 'cook-id', role: 'cook' },
    app: { get: () => null }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'Only an admin can confirm payment from the kitchen display');
});

test('kitchen completion does not overwrite a refunded payment', async (t) => {
  const originalFindById = Order.findById;
  const order = {
    _id: 'order-id',
    status: 'preparing',
    paymentStatus: 'refunded'
  };
  t.after(() => { Order.findById = originalFindById; });
  Order.findById = async () => order;

  const res = createResponse();
  await updateOrderStatus({
    params: { id: order._id },
    body: { status: 'ready', confirmPayment: true },
    user: { _id: 'admin-id', role: 'admin' },
    app: { get: () => null }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(order.status, 'preparing');
  assert.equal(order.paymentStatus, 'refunded');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../models/Order');
const User = require('../models/User');
const Expense = require('../models/Expense');
const { getUnifiedReport } = require('./reportService');

test('menu and staff report totals use paid sales without top-item or staff-attribution limits', async (t) => {
  const originalOrderAggregate = Order.aggregate;
  const originalUserFind = User.find;
  const originalExpenseAggregate = Expense.aggregate;
  const waiterId = 'waiter-id';
  const deliveryId = 'delivery-id';
  const itemFacets = {
    totals: [{
      totalOrders: 5,
      paidOrders: 3,
      paidRevenue: 58855,
      unitsSold: 293,
      cancelledOrders: 1,
      outstandingRevenue: 0,
      refundedValue: 0
    }],
    categories: [],
    itemTotals: [{ unitsSold: 293 }],
    topItems: Array.from({ length: 15 }, (_, index) => ({
      _id: `Item ${index + 1}`,
      quantity: 1,
      revenue: 100
    }))
  };
  const staffRevenuePipelines = [];
  let itemFacetPipeline;

  t.after(() => {
    Order.aggregate = originalOrderAggregate;
    User.find = originalUserFind;
    Expense.aggregate = originalExpenseAggregate;
  });

  Order.aggregate = async (pipeline) => {
    const match = pipeline.find((stage) => stage.$match)?.$match || {};
    if (pipeline.some((stage) => stage.$facet)) {
      itemFacetPipeline = pipeline[1].$facet;
      return [itemFacets];
    }

    if (pipeline.some((stage) => stage.$group?.paidRevenue)) {
      return [{
        totalOrders: 5,
        paidOrders: 3,
        paidRevenue: 58855,
        unitsSold: 293,
        cancelledOrders: 1,
        outstandingRevenue: 0,
        refundedValue: 0
      }];
    }

    const staffRole = ['assignedChef', 'assignedDelivery', 'processedBy', 'assignedWaiter']
      .find((field) => Object.hasOwn(match, field));
    if (!staffRole) return [];

    const group = pipeline.find((stage) => stage.$group)?.$group;
    staffRevenuePipelines.push({
      staffRole,
      revenue: group.revenue,
      unitsSold: group.unitsSold
    });
    if (staffRole === 'assignedDelivery') {
      return [{ _id: deliveryId, totalOrders: 1, revenue: 20000 }];
    }
    if (staffRole === 'assignedWaiter') {
      return [{ _id: waiterId, totalOrders: 1, revenue: 58535, unitsSold: 161 }];
    }
    return [];
  };
  User.find = () => ({
    lean: async () => [
      { _id: waiterId, name: 'Waiter', role: 'waiter' },
      { _id: deliveryId, name: 'Delivery', role: 'delivery' }
    ]
  });
  Expense.aggregate = async () => [];

  const itemsReport = await getUnifiedReport({
    start: '2026-11-27',
    end: '2026-11-27',
    section: 'items'
  });
  const staffReport = await getUnifiedReport({
    start: '2026-11-27',
    end: '2026-11-27',
    section: 'staff'
  });

  assert.equal(itemsReport.totals.paidRevenue, 58855);
  assert.equal(itemsReport.totals.unitsSold, 293);
  assert.equal(itemsReport.itemSummary.unitsSold, 293);
  assert.equal(itemsReport.topItems.length, 15);
  assert.equal(staffReport.totals.paidRevenue, 58855);
  assert.equal(staffReport.totals.unitsSold, 293);
  assert.equal(staffReport.staff.find((row) => row.staffId === waiterId).unitsSold, 161);
  assert.equal(
    staffReport.staff.reduce((sum, row) => sum + row.revenue, 0),
    78535,
    'staff attributions may add up to more than unique cafe sales'
  );
  assert.equal(itemFacetPipeline.itemTotals[0].$match.paymentStatus, 'completed');
  assert.equal(itemFacetPipeline.topItems[0].$match.paymentStatus, 'completed');
  assert.equal(itemFacetPipeline.categories[0].$match.paymentStatus, 'completed');
  assert.equal(itemFacetPipeline.totals[0].$group.unitsSold.$sum.$cond[0].$eq[1], 'completed');
  assert.equal(staffRevenuePipelines.length, 4);
  assert.ok(staffRevenuePipelines.some(({ staffRole }) => staffRole === 'assignedWaiter'));
  assert.ok(!staffRevenuePipelines.some(({ staffRole }) => staffRole === 'createdBy'));
  for (const { unitsSold } of staffRevenuePipelines) {
    assert.equal(unitsSold.$sum.$cond[0].$eq[1], 'completed');
    assert.deepEqual(unitsSold.$sum.$cond[1].$reduce.input.$ifNull, ['$items', []]);
    assert.equal(unitsSold.$sum.$cond[1].$reduce.in.$add[1].$ifNull[0], '$$this.quantity');
  }
  for (const { revenue } of staffRevenuePipelines) {
    assert.equal(revenue.$sum.$cond[0].$eq[1], 'completed');
  }
});

test('waiter detail uses the same assigned orders as the waiter task page', async (t) => {
  const originalOrderAggregate = Order.aggregate;
  const originalOrderFind = Order.find;
  const originalOrderFindOne = Order.findOne;
  const originalUserFind = User.find;
  const originalUserFindById = User.findById;
  const originalExpenseAggregate = Expense.aggregate;
  let orderMatch;
  let firstAssignmentMatch;
  const aggregateMatches = [];

  t.after(() => {
    Order.aggregate = originalOrderAggregate;
    Order.find = originalOrderFind;
    Order.findOne = originalOrderFindOne;
    User.find = originalUserFind;
    User.findById = originalUserFindById;
    Expense.aggregate = originalExpenseAggregate;
  });

  Order.aggregate = async (pipeline) => {
    aggregateMatches.push(pipeline[0].$match);
    return [];
  };
  Order.find = (match) => {
    orderMatch = match;
    return {
      sort() { return this; },
      limit() { return this; },
      select() { return this; },
      lean: async () => []
    };
  };
  Order.findOne = (match) => {
    firstAssignmentMatch = match;
    return {
      sort() { return this; },
      select() { return this; },
      lean: async () => null
    };
  };
  User.find = () => ({ lean: async () => [] });
  User.findById = () => ({
    lean: async () => ({ _id: 'waiter-id', name: 'Meba', role: 'waiter' })
  });
  Expense.aggregate = async () => [];

  await getUnifiedReport({ staffId: 'waiter-id', section: 'staff' });

  assert.equal(orderMatch.assignedWaiter, 'waiter-id');
  assert.equal(firstAssignmentMatch.assignedWaiter, 'waiter-id');
  assert.ok(aggregateMatches.some((match) => match.paymentStatus === 'completed'));
  assert.ok(aggregateMatches.some(
    (match) => match.assignedWaiter === 'waiter-id' && !Object.hasOwn(match, 'paymentStatus')
  ));
  assert.equal(Object.hasOwn(orderMatch, 'createdBy'), false);
});

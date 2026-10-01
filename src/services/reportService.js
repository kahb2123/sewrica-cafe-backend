// src/services/reportService.js
// Single aggregated source of truth for every report the cafe needs.
//
// Performance: the order-level figures all come from ONE aggregation using $facet,
// instead of the previous load-every-order-then-loop-in-JS approach. Staff figures
// come from a SECOND aggregation. That is 2 round trips total, regardless of how
// many staff members or items exist.

const Order = require('../models/Order');
const User = require('../models/User');

// Ethiopia Time. Grouping and day boundaries must follow the cafe's local day,
// not UTC, or a "daily" report is offset by three hours.
const REPORT_TIMEZONE = process.env.REPORT_TIMEZONE || '+03:00';
const TZ_OFFSET_HOURS = Number(process.env.BUSINESS_TZ_OFFSET_HOURS ?? 3);

const PAID = 'completed';
const STAFF_ROLES = ['cook', 'delivery', 'cashier'];

const MS_PER_HOUR = 60 * 60 * 1000;

// ========== DATE RANGE ==========

/**
 * Builds a half-open range [start, endExclusive) covering whole cafe-local days.
 * Using a half-open upper bound is what the old staff report got wrong: it used
 * $lte at midnight of the end date, silently dropping every order on the last day.
 */
const buildDateRange = (start, end) => {
  const today = new Date();
  const defaultEnd = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  const startStr = /^(\d{4})-(\d{2})-(\d{2})$/.test(start || '') ? start : defaultEnd;
  const endStr = /^(\d{4})-(\d{2})-(\d{2})$/.test(end || '') ? end : defaultEnd;

  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);

  if (sy < 2020 || ey < 2020) throw new Error('Invalid date range');

  // Cafe-local midnight expressed in UTC.
  const startUtc = new Date(Date.UTC(sy, sm - 1, sd) - TZ_OFFSET_HOURS * MS_PER_HOUR);
  const endUtc = new Date(Date.UTC(ey, em - 1, ed + 1) - TZ_OFFSET_HOURS * MS_PER_HOUR);

  if (startUtc >= endUtc) throw new Error('Start date must be before or equal to end date');

  return {
    start: startUtc,
    end: endUtc,
    startLabel: startStr,
    endLabel: endStr,
    days: Math.round((endUtc - startUtc) / (24 * MS_PER_HOUR))
  };
};

const dayString = (field) => ({
  $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: REPORT_TIMEZONE }
});

const hourString = (field) => ({
  $dateToString: { format: '%H', date: `$${field}`, timezone: REPORT_TIMEZONE }
});

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// ========== ORDER-LEVEL FIGURES (one round trip) ==========

const getOrderFacets = async (start, end) => {
  const range = { createdAt: { $gte: start, $lt: end } };

  const [result] = await Order.aggregate([
    { $match: range },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
              paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, 1, 0] } },
              grossValue: { $sum: '$totalAmount' },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
              },
              outstandingRevenue: {
                $sum: {
                  $cond: [
                    { $in: ['$paymentStatus', ['pending', 'processing']] },
                    { $ifNull: ['$totalAmount', 0] },
                    0
                  ]
                }
              },
              refundedValue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, { $ifNull: ['$totalAmount', 0] }, 0] }
              },
              avgCookingMinutes: { $avg: { $cond: [{ $gt: ['$cookingTime', 0] }, '$cookingTime', null] } }
            }
          }
        ],

        daily: [
          {
            $group: {
              _id: dayString('createdAt'),
              orders: { $sum: 1 },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ],

        hourly: [
          {
            $group: {
              _id: hourString('createdAt'),
              orders: { $sum: 1 },
              paidRevenue: {
                $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
              }
            }
          },
          { $sort: { orders: -1 } }
        ],

        statusBreakdown: [
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],

        paymentMethods: [
          { $match: { paymentStatus: PAID } },
          { $group: { _id: '$paymentMethod', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
          { $sort: { amount: -1 } }
        ],

        orderChannels: [
          { $group: { _id: '$deliveryMethod', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],

        categories: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.category',
              itemsSold: { $sum: '$items.quantity' },
              revenue: { $sum: { $multiply: [{ $ifNull: ['$items.price', 0] }, '$items.quantity'] } }
            }
          },
          { $sort: { revenue: -1 } }
        ],

        topItems: [
          { $unwind: '$items' },
          {
            $group: {
              _id: { $ifNull: ['$items.name', 'Unknown item'] },
              quantity: { $sum: '$items.quantity' },
              revenue: { $sum: { $multiply: [{ $ifNull: ['$items.price', 0] }, '$items.quantity'] } }
            }
          },
          { $sort: { quantity: -1 } },
          { $limit: 15 }
        ]
      }
    }
  ]);

  return result || {};
};

// ========== STAFF FIGURES (one round trip) ==========

const getStaffPerformance = async (start, end, roleFilter) => {
  const range = { createdAt: { $gte: start, $lt: end } };

  const [chefs, delivery, cashiers] = await Promise.all([
    Order.aggregate([
      { $match: { ...range, assignedChef: { $ne: null } } },
      {
        $group: {
          _id: '$assignedChef',
          totalOrders: { $sum: 1 },
          completed: { $sum: { $cond: [{ $in: ['$status', ['ready', 'delivered']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
          },
          avgCookingMinutes: { $avg: { $cond: [{ $gt: ['$cookingTime', 0] }, '$cookingTime', null] } }
        }
      }
    ]),
    Order.aggregate([
      { $match: { ...range, assignedDelivery: { $ne: null } } },
      {
        $group: {
          _id: '$assignedDelivery',
          totalOrders: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
          }
        }
      }
    ]),
    Order.aggregate([
      // Only orders this cashier actually processed. Previously this matched every
      // paid order, so every cashier was credited with the whole cafe's revenue.
      { $match: { ...range, processedBy: { $ne: null } } },
      {
        $group: {
          _id: '$processedBy',
          totalOrders: { $sum: 1 },
          completed: { $sum: 1 },
          cancelled: { $sum: 0 },
          revenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
          cashCollected: { $sum: { $ifNull: ['$amountReceived', 0] } }
        }
      }
    ])
  ]);

  const rows = [
    ...chefs.map((row) => ({ ...row, role: 'cook' })),
    ...delivery.map((row) => ({ ...row, role: 'delivery' })),
    ...cashiers.map((row) => ({ ...row, role: 'cashier' }))
  ];

  if (!rows.length) return [];

  // One lookup for every staff id instead of one query per staff member.
  const staff = await User.find(
    { _id: { $in: rows.map((row) => row._id) } },
    'name role email'
  ).lean();

  const nameById = new Map(staff.map((member) => [String(member._id), member.name]));

  return rows
    .map((row) => ({
      staffId: row._id,
      name: nameById.get(String(row._id)) || 'Unknown',
      role: row.role,
      totalOrders: row.totalOrders,
      completedOrders: row.completed,
      cancelledOrders: row.cancelled,
      revenue: round2(row.revenue),
      avgCookingMinutes: row.avgCookingMinutes ? Math.round(row.avgCookingMinutes) : null,
      cashCollected: round2(row.cashCollected || 0),
      completionRate: row.totalOrders ? Math.round((row.completed / row.totalOrders) * 100) : 0
    }))
    .filter((row) => !roleFilter || roleFilter === 'all' || row.role === roleFilter)
    .sort((a, b) => b.totalOrders - a.totalOrders);
};

// ========== INDIVIDUAL STAFF DETAIL ==========

/**
 * Powers the "view performance" modal on the Staff tab, so it needs no endpoint
 * of its own. Returns the shape that tab already renders.
 */
const getStaffDetail = async (staffId, start, end) => {
  const range = { createdAt: { $gte: start, $lt: end } };

  const member = await User.findById(staffId, 'name role').lean();
  if (!member) return null;

  const isCook = member.role === 'cook';
  const isDelivery = member.role === 'delivery';

  const match = {
    ...range,
    [isCook ? 'assignedChef' : isDelivery ? 'assignedDelivery' : 'processedBy']: staffId
  };

  const [items, daily] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: { $ifNull: ['$items.name', 'Unknown item'] }, count: { $sum: '$items.quantity' } } },
      { $sort: { count: -1 } }
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: dayString('createdAt'),
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
          cookingTime: { $sum: { $ifNull: ['$cookingTime', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const totalOrders = daily.length ? daily.reduce((sum, row) => sum + row.count, 0) : 0;
  const totalAmount = daily.reduce((sum, row) => sum + row.totalAmount, 0);
  const totalItemsCooked = items.reduce((sum, row) => sum + row.count, 0);
  const totalCookingTime = daily.reduce((sum, row) => sum + row.cookingTime, 0);
  const totalDeliveryTime = daily.reduce((sum, row) => sum + row.cookingTime, 0);

  return {
    staffId: member._id,
    name: member.name,
    role: member.role,
    summary: {
      totalOrders,
      totalItemsCooked,
      totalCookingTime,
      averageCookingTime: totalOrders ? Math.round(totalCookingTime / totalOrders) : 0,
      totalDeliveries: isDelivery ? totalOrders : undefined,
      totalAmount: isDelivery ? round2(totalAmount) : undefined,
      totalDeliveryTime: isDelivery ? totalDeliveryTime : undefined,
      averageDeliveryTime: isDelivery && totalOrders ? Math.round(totalDeliveryTime / totalOrders) : undefined
    },
    itemsBreakdown: Object.fromEntries(items.map((row) => [row._id, row.count])),
    dailyBreakdown: Object.fromEntries(daily.map((row) => [row._id, {
      count: row.count,
      totalAmount: round2(row.totalAmount)
    }]))
  };
};

// ========== UNIFIED REPORT ==========

const getUnifiedReport = async ({ start, end, role, staffId } = {}) => {
  const range = buildDateRange(start, end);

  const [facets, staff, staffDetail] = await Promise.all([
    getOrderFacets(range.start, range.end),
    getStaffPerformance(range.start, range.end, role),
    staffId ? getStaffDetail(staffId, range.start, range.end) : Promise.resolve(null)
  ]);

  const totals = (facets.totals || [])[0] || {};
  const totalOrders = totals.totalOrders || 0;
  const paidOrders = totals.paidOrders || 0;
  const paidRevenue = round2(totals.paidRevenue);
  const outstandingRevenue = round2(totals.outstandingRevenue);

  const categories = (facets.categories || [])
    .filter((row) => row._id)
    .map((row) => ({
      category: row._id,
      itemsSold: row.itemsSold,
      revenue: round2(row.revenue),
      share: paidRevenue ? Math.round((row.revenue / paidRevenue) * 100) : 0
    }));

  const topItems = (facets.topItems || []).map((row) => ({
    name: row._id,
    quantity: row.quantity,
    revenue: round2(row.revenue)
  }));

  const paymentMethods = (facets.paymentMethods || [])
    .filter((row) => row._id)
    .map((row) => ({
      method: row._id,
      count: row.count,
      amount: round2(row.amount),
      share: paidRevenue ? Math.round((row.amount / paidRevenue) * 100) : 0
    }));

  return {
    period: {
      start: range.startLabel,
      end: range.endLabel,
      days: range.days,
      timezone: REPORT_TIMEZONE
    },
    totals: {
      totalOrders,
      paidOrders,
      cancelledOrders: totals.cancelledOrders || 0,
      unpaidOrders: Math.max(0, totalOrders - paidOrders - (totals.cancelledOrders || 0)),
      paidRevenue,
      outstandingRevenue,
      refundedValue: round2(totals.refundedValue),
      averageOrderValue: paidOrders ? round2(paidRevenue / paidOrders) : 0,
      avgCookingMinutes: totals.avgCookingMinutes ? Math.round(totals.avgCookingMinutes) : 0
    },
    daily: (facets.daily || []).map((row) => ({
      date: row._id,
      orders: row.orders,
      paidRevenue: round2(row.paidRevenue)
    })),
    hourly: (facets.hourly || []).map((row) => ({
      hour: row._id,
      orders: row.orders,
      paidRevenue: round2(row.paidRevenue)
    })),
    statusBreakdown: (facets.statusBreakdown || []).map((row) => ({ status: row._id, count: row.count })),
    paymentMethods,
    orderChannels: (facets.orderChannels || [])
      .filter((row) => row._id)
      .map((row) => ({ channel: row._id, count: row.count })),
    categories,
    topItems,
    staff,
    staffDetail
  };
};

// ========== EXPORT ==========

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const buildCsv = (report) => {
  const t = report.totals;
  const rows = [
    ['Sewrica Cafe Report'],
    ['Period', `${report.period.start} to ${report.period.end}`, `${report.period.days} days`],
    [],
    ['SUMMARY'],
    ['Total orders', t.totalOrders],
    ['Paid orders', t.paidOrders],
    ['Cancelled orders', t.cancelledOrders],
    ['Unpaid orders', t.unpaidOrders],
    ['Paid revenue (ETB)', t.paidRevenue],
    ['Outstanding revenue (ETB)', t.outstandingRevenue],
    ['Refunded value (ETB)', t.refundedValue],
    ['Average order value (ETB)', t.averageOrderValue],
    ['Average cooking minutes', t.avgCookingMinutes],
    [],
    ['DAILY'],
    ['Date', 'Orders', 'Paid revenue (ETB)'],
    ...report.daily.map((row) => [row.date, row.orders, row.paidRevenue]),
    [],
    ['TOP ITEMS'],
    ['Item', 'Quantity', 'Revenue (ETB)'],
    ...report.topItems.map((row) => [row.name, row.quantity, row.revenue]),
    [],
    ['SALES BY CATEGORY'],
    ['Category', 'Items sold', 'Revenue (ETB)', 'Share %'],
    ...report.categories.map((row) => [row.category, row.itemsSold, row.revenue, row.share]),
    [],
    ['PAYMENT METHODS'],
    ['Method', 'Count', 'Amount (ETB)', 'Share %'],
    ...report.paymentMethods.map((row) => [row.method, row.count, row.amount, row.share]),
    [],
    ['BUSIEST HOURS'],
    ['Hour', 'Orders', 'Paid revenue (ETB)'],
    ...report.hourly.map((row) => [row.hour, row.orders, row.paidRevenue]),
    [],
    ['STAFF PERFORMANCE'],
    ['Name', 'Role', 'Total orders', 'Completed', 'Cancelled', 'Revenue (ETB)', 'Completion %'],
    ...report.staff.map((row) => [
      row.name, row.role, row.totalOrders, row.completedOrders,
      row.cancelledOrders, row.revenue, row.completionRate
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
};

const buildPdf = (report, PDFDocument) => {
  const t = report.totals;
  const doc = new PDFDocument({ margin: 48 });
  const money = (value) => `${Number(value || 0).toLocaleString()} ETB`;

  doc.fontSize(20).text('Sewrica Cafe Report');
  doc.fontSize(10).fillColor('#666666')
    .text(`Period: ${report.period.start} to ${report.period.end} (${report.period.days} days)`);
  doc.moveDown();

  doc.fontSize(14).fillColor('#000').text('Summary');
  doc.fontSize(10).fillColor('#333333');
  doc.text(`Total orders: ${t.totalOrders}`);
  doc.text(`Paid orders: ${t.paidOrders}`);
  doc.text(`Cancelled orders: ${t.cancelledOrders}`);
  doc.text(`Unpaid orders: ${t.unpaidOrders}`);
  doc.text(`Paid revenue: ${money(t.paidRevenue)}`);
  doc.text(`Outstanding revenue: ${money(t.outstandingRevenue)}`);
  doc.text(`Refunded value: ${money(t.refundedValue)}`);
  doc.text(`Average order value: ${money(t.averageOrderValue)}`);
  doc.text(`Average cooking time: ${t.avgCookingMinutes} min`);

  const section = (title, lines) => {
    if (!lines.length) return;
    doc.moveDown().fontSize(14).fillColor('#000').text(title);
    doc.fontSize(10).fillColor('#333333');
    lines.forEach((line) => doc.text(line));
  };

  section('Top items', report.topItems.map((r) => `${r.name}: ${r.quantity} items, ${money(r.revenue)}`));
  section('Sales by category', report.categories.map((r) => `${r.category}: ${r.itemsSold} items, ${money(r.revenue)} (${r.share}%)`));
  section('Payment methods', report.paymentMethods.map((r) => `${r.method}: ${r.count} payments, ${money(r.amount)} (${r.share}%)`));
  section('Busiest hours', report.hourly.slice(0, 10).map((r) => `${r.hour}:00 - ${r.orders} orders, ${money(r.paidRevenue)}`));
  section('Staff performance', report.staff.map((r) =>
    `${r.name} (${r.role}): ${r.totalOrders} orders, ${r.completedOrders} completed, ${money(r.revenue)}, ${r.completionRate}% completion`
  ));

  doc.end();
  return doc;
};

module.exports = {
  getUnifiedReport,
  buildDateRange,
  buildCsv,
  buildPdf,
  csvCell,
  REPORT_TIMEZONE,
  STAFF_ROLES
};

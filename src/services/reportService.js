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
          completed: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          revenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
          },
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
 * Full drill-down for one staff member. Attribution follows how the work was
 * actually assigned:
 *   chef     -> orders the admin assigned via assignedChef
 *   delivery -> orders the admin assigned via assignedDelivery
 *   cashier  -> orders whose payment this person took via processedBy
 */
const getStaffDetail = async (staffId, start, end) => {
  const range = { createdAt: { $gte: start, $lt: end } };

  const member = await User.findById(staffId, 'name role email phone').lean();
  if (!member) return null;

  const role = member.role;
  const assignmentField = role === 'cook'
    ? 'assignedChef'
    : role === 'delivery'
      ? 'assignedDelivery'
      : 'processedBy';

  const match = { ...range, [assignmentField]: staffId };

  const [items, daily, orders, assignedAt] = await Promise.all([
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
          completed: { $sum: { $cond: [{ $in: ['$status', ['ready', 'delivered']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, 1, 0] } },
          paidAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAID] }, { $ifNull: ['$totalAmount', 0] }, 0] }
          },
          outstanding: {
            $sum: {
              $cond: [
                { $in: ['$paymentStatus', ['pending', 'processing']] },
                { $ifNull: ['$totalAmount', 0] },
                0
              ]
            }
          },
          cookingTimeSum: {
            $sum: { $cond: [{ $gt: ['$cookingTime', 0] }, '$cookingTime', 0] }
          },
          cookingTimeCount: {
            $sum: { $cond: [{ $gt: ['$cookingTime', 0] }, 1, 0] }
          },
          deliveryTimeSum: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$deliveryCompletedAt', null] }, { $gt: ['$cookingStartedAt', null] }] },
                { $subtract: ['$deliveryCompletedAt', '$cookingStartedAt'] },
                0
              ]
            }
          },
          deliveryTimeCount: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$deliveryCompletedAt', null] }, { $gt: ['$cookingStartedAt', null] }] },
                1,
                0
              ]
            }
          },
          avgCookingMinutes: { $avg: { $cond: [{ $gt: ['$cookingTime', 0] }, '$cookingTime', null] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Order.find(match)
      .sort({ createdAt: -1 })
      .limit(60)
      .select('orderNumber items status paymentStatus paymentMethod totalAmount createdAt cookingStartedAt cookingCompletedAt cookingTime deliveryCompletedAt assignedAt')
      .lean(),
    Order.findOne({ [assignmentField]: staffId })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean()
  ]);

  // Summary figures come from the complete daily aggregation, NOT the 60-order
  // sample used for the recent-orders list below. Deriving them from the
  // truncated list silently undercounted every metric for staff with >60 orders.
  const totalOrders = daily.reduce((sum, row) => sum + row.count, 0);
  const completedOrders = daily.reduce((sum, row) => sum + row.completed, 0);
  const cancelledOrders = daily.reduce((sum, row) => sum + row.cancelled, 0);
  const paidOrders = daily.reduce((sum, row) => sum + row.paid, 0);
  const totalAmount = daily.reduce((sum, row) => sum + row.totalAmount, 0);
  const outstandingRevenue = daily.reduce((sum, row) => sum + row.outstanding, 0);
  const totalItemsCooked = items.reduce((sum, row) => sum + row.count, 0);

  const cookingTimeSum = daily.reduce((sum, row) => sum + (row.cookingTimeSum || 0), 0);
  const cookingTimeCount = daily.reduce((sum, row) => sum + (row.cookingTimeCount || 0), 0);
  const deliveryTimeSum = daily.reduce((sum, row) => sum + (row.deliveryTimeSum || 0), 0);
  const deliveryTimeCount = daily.reduce((sum, row) => sum + (row.deliveryTimeCount || 0), 0);

  return {
    staffId: member._id,
    name: member.name,
    role,
    email: member.email || '',
    phone: member.phone || '',
    firstAssignedAt: assignedAt?.createdAt || null,
    summary: {
      totalOrders,
      completedOrders,
      cancelledOrders,
      unpaidOrders: Math.max(0, totalOrders - paidOrders - cancelledOrders),
      paidOrders,
      paidRevenue: round2(daily.reduce((sum, row) => sum + (row.paidAmount || 0), 0)),
      outstandingRevenue: round2(outstandingRevenue),
      completionRate: totalOrders ? Math.round((completedOrders / totalOrders) * 100) : 0,
      cancellationRate: totalOrders ? Math.round((cancelledOrders / totalOrders) * 100) : 0,
      totalItemsCooked,
      totalCookingTime: Math.round(cookingTimeSum / 60000),
      averageCookingTime: cookingTimeCount ? Math.round(cookingTimeSum / cookingTimeCount / 60000) : 0,
      slowestCookingTime: Math.max(
        ...orders.map((order) => Number(order.cookingTime) || 0).filter((value) => value > 0),
        0
      ),
      totalDeliveries: role === 'delivery' ? totalOrders : undefined,
      totalAmount: role === 'delivery' ? round2(totalAmount) : undefined,
      totalDeliveryTime: role === 'delivery' ? Math.round(deliveryTimeSum / 60000) : undefined,
      averageDeliveryTime: role === 'delivery'
        ? (deliveryTimeCount ? Math.round(deliveryTimeSum / deliveryTimeCount / 60000) : undefined)
        : undefined
    },
    itemsBreakdown: Object.fromEntries(items.map((row) => [row._id, row.count])),
    dailyBreakdown: Object.fromEntries(daily.map((row) => [row._id, {
      count: row.count,
      completed: row.completed,
      cancelled: row.cancelled,
      totalAmount: round2(row.totalAmount),
      avgCookingMinutes: row.avgCookingMinutes ? Math.round(row.avgCookingMinutes) : null
    }])),
    orders: orders.map((order) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: round2(order.totalAmount),
      createdAt: order.createdAt,
      assignedAt: order.assignedAt?.chef || order.assignedAt?.delivery || order.paidAt || order.createdAt,
      completedAt: order.deliveryCompletedAt || order.cookingCompletedAt || null,
      cookingTime: Number(order.cookingTime) || 0,
      items: (order.items || []).map((item) => ({
        name: item.name || 'Unknown item',
        quantity: item.quantity
      }))
    }))
  };
};

// ========== UNIFIED REPORT ==========
//
// `section` lets callers request only one part of the report (sales | items |
// staff). Skipping the unneeded aggregations makes exports faster and keeps the
// generated file focused on what the caller actually asked for.

const getUnifiedReport = async ({ start, end, role, staffId, section } = {}) => {
  const range = buildDateRange(start, end);
  const wantSales = !section || section === 'sales';
  const wantItems = !section || section === 'items';
  const wantStaff = !section || section === 'staff';

  const [facets, staff, staffDetail] = await Promise.all([
    wantSales || wantItems ? getOrderFacets(range.start, range.end) : Promise.resolve({}),
    wantStaff ? getStaffPerformance(range.start, range.end, role) : Promise.resolve([]),
    staffId ? getStaffDetail(staffId, range.start, range.end) : Promise.resolve(null)
  ]);

  const totalsList = wantSales ? (facets.totals || []) : [];
  const totals = totalsList[0] || {};
  const totalOrders = totals.totalOrders || 0;
  const paidOrders = totals.paidOrders || 0;
  const paidRevenue = round2(totals.paidRevenue);
  const outstandingRevenue = round2(totals.outstandingRevenue);

  const categories = (wantItems ? facets.categories : []) || []
    .filter((row) => row._id)
    .map((row) => ({
      category: row._id,
      itemsSold: row.itemsSold,
      revenue: round2(row.revenue),
      share: paidRevenue ? Math.round((row.revenue / paidRevenue) * 100) : 0
    }));

  const topItems = (wantItems ? facets.topItems : []) || []
    .map((row) => ({
      name: row._id,
      quantity: row.quantity,
      revenue: round2(row.revenue)
    }));

  const paymentMethods = (wantSales ? facets.paymentMethods : []) || []
    .filter((row) => row._id)
    .map((row) => ({
      method: row._id,
      count: row.count,
      amount: round2(row.amount),
      share: paidRevenue ? Math.round((row.amount / paidRevenue) * 100) : 0
    }));

  return {
    section: section || 'all',
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
    daily: (wantSales ? facets.daily : []) || []
      .filter((row) => row._id)
      .map((row) => ({
        date: row._id,
        orders: row.orders,
        paidRevenue: round2(row.paidRevenue)
      })),
    hourly: (wantSales ? facets.hourly : []) || []
      .filter((row) => row._id)
      .map((row) => ({
        hour: row._id,
        orders: row.orders,
        paidRevenue: round2(row.paidRevenue)
      })),
    statusBreakdown: (wantSales ? facets.statusBreakdown : []) || []
      .map((row) => ({ status: row._id, count: row.count })),
    paymentMethods,
    orderChannels: (wantSales ? facets.orderChannels : []) || []
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
  const section = report.section || 'all';
  const wantSales = section === 'all' || section === 'sales';
  const wantItems = section === 'all' || section === 'items';
  const wantStaff = section === 'all' || section === 'staff';

  const rows = [
    ['Sewrica Cafe Report'],
    ['Period', `${report.period.start} to ${report.period.end}`, `${report.period.days} days`],
    []
  ];

  if (wantSales || wantItems) {
    rows.push(
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
      []
    );
  }

  if (wantSales) {
    rows.push(
      ['DAILY'],
      ['Date', 'Orders', 'Paid revenue (ETB)'],
      ...report.daily.map((row) => [row.date, row.orders, row.paidRevenue]),
      [],
      ['PAYMENT METHODS'],
      ['Method', 'Count', 'Amount (ETB)', 'Share %'],
      ...report.paymentMethods.map((row) => [row.method, row.count, row.amount, row.share]),
      [],
      ['BUSIEST HOURS'],
      ['Hour', 'Orders', 'Paid revenue (ETB)'],
      ...report.hourly.map((row) => [row.hour, row.orders, row.paidRevenue]),
      [],
      ['ORDER CHANNELS'],
      ['Channel', 'Count'],
      ...report.orderChannels.map((row) => [row.channel, row.count]),
      [],
      ['ORDER STATUSES'],
      ['Status', 'Count'],
      ...report.statusBreakdown.map((row) => [row.status, row.count]),
      []
    );
  }

  if (wantItems) {
    rows.push(
      ['TOP ITEMS'],
      ['Item', 'Quantity', 'Revenue (ETB)'],
      ...report.topItems.map((row) => [row.name, row.quantity, row.revenue]),
      [],
      ['SALES BY CATEGORY'],
      ['Category', 'Items sold', 'Revenue (ETB)', 'Share %'],
      ...report.categories.map((row) => [row.category, row.itemsSold, row.revenue, row.share]),
      []
    );
  }

  if (wantStaff) {
    rows.push(
      ['STAFF PERFORMANCE'],
      ['Name', 'Role', 'Total orders', 'Completed', 'Cancelled', 'Revenue (ETB)', 'Completion %'],
      ...report.staff.map((row) => [
        row.name, row.role, row.totalOrders, row.completedOrders,
        row.cancelledOrders, row.revenue, row.completionRate
      ]),
      []
    );
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
};

// ========== PDF ==========

const PDF_COLORS = {
  brand: '#1f6f5c',
  brandDark: '#134a3e',
  ink: '#1c1917',
  body: '#3f3a35',
  muted: '#8a7f76',
  line: '#e4ddd4',
  zebra: '#faf7f2',
  card: '#f4f0e9'
};

const PDF_MARGIN = 44;

const money = (value) => `${Number(value || 0).toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

/**
 * A printable report with a branded header, metric cards, and zebra-striped
 * tables. Falls back to a new page automatically when a section runs long.
 */
const buildPdf = (report, PDFDocument) => {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
  const t = report.totals || {};
  const contentWidth = doc.page.width - PDF_MARGIN * 2;
  const right = doc.page.width - PDF_MARGIN;

  // ---------- helpers ----------

  const drawHeader = () => {
    const top = PDF_MARGIN;
    doc.rect(0, 0, doc.page.width, 118).fill(PDF_COLORS.brand);

    doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
      .text('SEWRICA CAFE', PDF_MARGIN, top + 20, { characterSpacing: 2 });

    doc.fontSize(23).font('Helvetica-Bold')
      .text('Business Report', PDF_MARGIN, top + 36);

    doc.fontSize(10).font('Helvetica').fillColor('#cfe6dd')
      .text(`${report.period.start}  to  ${report.period.end}   ·   ${report.period.days} days`, PDF_MARGIN, top + 68);

    doc.fontSize(8).font('Helvetica').fillColor('#a9cfc1')
      .text(`Generated ${new Date().toLocaleString('en-GB')}   ·   Times shown in ${report.period.timezone} (cafe local)`, PDF_MARGIN, top + 88);

    doc.y = 118 + 26;
  };

  const drawSectionTitle = (title, hint) => {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(0.8);

    const y = doc.y;
    doc.rect(PDF_MARGIN, y, 3, 15).fill(PDF_COLORS.brand);
    doc.fillColor(PDF_COLORS.ink).fontSize(13).font('Helvetica-Bold')
      .text(title, PDF_MARGIN + 11, y + 1);

    if (hint) {
      doc.fillColor(PDF_COLORS.muted).fontSize(8).font('Helvetica')
        .text(hint, PDF_MARGIN + 11, y + 17);
    }

    doc.y = y + (hint ? 34 : 24);
    doc.moveTo(PDF_MARGIN, doc.y - 6).lineTo(right, doc.y - 6).lineWidth(0.5).stroke(PDF_COLORS.line);
    doc.y += 6;
  };

  // Metric cards laid out in a responsive grid
  const drawCards = (cards) => {
    const gap = 10;
    const perRow = 3;
    const cardWidth = (contentWidth - gap * (perRow - 1)) / perRow;

    cards.forEach((card, index) => {
      const col = index % perRow;
      const row = Math.floor(index / perRow);

      if (col === 0 && doc.y > doc.page.height - 150) doc.addPage();

      const x = PDF_MARGIN + col * (cardWidth + gap);
      const y = doc.y + row * 62;
      const height = 52;

      doc.roundedRect(x, y, cardWidth, height, 6).fill(PDF_COLORS.card);
      doc.rect(x, y, 3, height).fill(card.color || PDF_COLORS.brand);

      doc.fillColor(PDF_COLORS.muted).fontSize(7).font('Helvetica-Bold')
        .text(card.label.toUpperCase(), x + 12, y + 9, { characterSpacing: 0.6, width: cardWidth - 20 });

      doc.fillColor(PDF_COLORS.ink).fontSize(13).font('Helvetica-Bold')
        .text(card.value, x + 12, y + 22, { width: cardWidth - 20, ellipsis: true });

      if (card.sub) {
        doc.fillColor(PDF_COLORS.muted).fontSize(7).font('Helvetica')
          .text(card.sub, x + 12, y + 38, { width: cardWidth - 20, ellipsis: true });
      }
    });

    doc.y += Math.ceil(cards.length / perRow) * 62 + 4;
  };

  /**
   * columns: [{ key, label, align, width (0-1 share) }]
   */
  const drawTable = (columns, rows) => {
    if (!rows.length) {
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica-Oblique')
        .text('No data for this period.', PDF_MARGIN, doc.y);
      doc.y += 16;
      return;
    }

    const rowHeight = 19;
    const renderHead = () => {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.rect(PDF_MARGIN, doc.y, contentWidth, rowHeight).fill(PDF_COLORS.brandDark);
      let x = PDF_MARGIN + 8;
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      columns.forEach((col) => {
        const w = contentWidth * (col.width || 0.25) - 16;
        doc.text(col.label.toUpperCase(), x, doc.y + 6, {
          width: w,
          align: col.align || 'left',
          characterSpacing: 0.4,
          ellipsis: true,
          lineBreak: false
        });
        x += contentWidth * (col.width || 0.25);
      });
      doc.y += rowHeight;
    };

    renderHead();

    rows.forEach((row, index) => {
      if (doc.y > doc.page.height - 90) {
        doc.addPage();
        renderHead();
      }

      if (index % 2 === 1) doc.rect(PDF_MARGIN, doc.y, contentWidth, rowHeight).fill(PDF_COLORS.zebra);

      let x = PDF_MARGIN + 8;
      doc.fillColor(PDF_COLORS.body).fontSize(8.5).font('Helvetica');
      columns.forEach((col) => {
        const w = contentWidth * (col.width || 0.25) - 16;
        doc.text(String(row[col.key] ?? '—'), x, doc.y + 6, {
          width: w,
          align: col.align || 'left',
          ellipsis: true,
          lineBreak: false
        });
        x += contentWidth * (col.width || 0.25);
      });

      doc.y += rowHeight;
      doc.moveTo(PDF_MARGIN, doc.y).lineTo(right, doc.y).lineWidth(0.4).stroke(PDF_COLORS.line);
    });

    doc.y += 10;
  };

  // ---------- document ----------
  //
  // Sections are gated on `report.section` so a staff-only export never
  // carries sales tables, and vice versa. When the section is empty the whole
  // report is rendered.

  const section = report.section || 'all';
  const wantSales = section === 'all' || section === 'sales';
  const wantItems = section === 'all' || section === 'items';
  const wantStaff = section === 'all' || section === 'staff';

  drawHeader();

  if (wantSales || wantItems) {
    drawCards([
      { label: 'Total orders', value: (t.totalOrders || 0).toLocaleString('en-ET'), sub: `${t.paidOrders || 0} paid · ${t.cancelledOrders || 0} cancelled`, color: '#2f6fb5' },
      { label: 'Paid revenue', value: money(t.paidRevenue), sub: 'Settled payments only', color: '#1f6f5c' },
      { label: 'Outstanding', value: money(t.outstandingRevenue), sub: `${t.unpaidOrders || 0} unpaid orders`, color: '#c08420' },
      { label: 'Average order', value: money(t.averageOrderValue), sub: 'Per paid order', color: '#7d7269' },
      { label: 'Refunded', value: money(t.refundedValue), sub: 'Reversed payments', color: '#b3402a' },
      { label: 'Avg cooking', value: `${t.avgCookingMinutes || 0} min`, sub: 'Across all chefs', color: '#6b4fa8' }
    ]);
  }

  if (wantSales) {
    drawSectionTitle('Daily revenue', 'Paid revenue per cafe-local day');
    drawTable(
      [
        { key: 'date', label: 'Date', width: 0.4 },
        { key: 'orders', label: 'Orders', width: 0.3, align: 'right' },
        { key: 'paidRevenue', label: 'Paid revenue', width: 0.3, align: 'right' }
      ],
      report.daily.map((row) => ({ ...row, paidRevenue: money(row.paidRevenue) }))
    );

    if (report.paymentMethods.length) {
      drawSectionTitle('Payment methods');
      drawTable(
        [
          { key: 'method', label: 'Method', width: 0.34 },
          { key: 'count', label: 'Payments', width: 0.22, align: 'right' },
          { key: 'amount', label: 'Amount', width: 0.28, align: 'right' },
          { key: 'share', label: 'Share', width: 0.16, align: 'right' }
        ],
        report.paymentMethods.map((row) => ({ ...row, amount: money(row.amount), share: `${row.share}%` }))
      );
    }

    if (report.hourly.length) {
      drawSectionTitle('Busiest hours', 'Orders and revenue by hour of the day');
      drawTable(
        [
          { key: 'hour', label: 'Hour', width: 0.25 },
          { key: 'orders', label: 'Orders', width: 0.3, align: 'right' },
          { key: 'paidRevenue', label: 'Paid revenue', width: 0.45, align: 'right' }
        ],
        report.hourly.map((row) => ({ ...row, hour: `${row.hour}:00`, paidRevenue: money(row.paidRevenue) }))
      );
    }

    if (report.statusBreakdown.length) {
      drawSectionTitle('Order statuses');
      drawTable(
        [
          { key: 'status', label: 'Status', width: 0.5 },
          { key: 'count', label: 'Orders', width: 0.5, align: 'right' }
        ],
        report.statusBreakdown.map((row) => ({ ...row, count: (row.count || 0).toLocaleString('en-ET') }))
      );
    }

    if (report.orderChannels.length) {
      drawSectionTitle('Order channels');
      drawTable(
        [
          { key: 'channel', label: 'Channel', width: 0.6 },
          { key: 'count', label: 'Orders', width: 0.4, align: 'right' }
        ],
        report.orderChannels.map((row) => ({ ...row, count: (row.count || 0).toLocaleString('en-ET') }))
      );
    }
  }

  if (wantItems) {
    drawSectionTitle('Top selling items', 'Ranked by quantity sold');
    drawTable(
      [
        { key: 'rank', label: '#', width: 0.08, align: 'center' },
        { key: 'name', label: 'Item', width: 0.46 },
        { key: 'quantity', label: 'Qty', width: 0.2, align: 'right' },
        { key: 'revenue', label: 'Revenue', width: 0.26, align: 'right' }
      ],
      report.topItems.map((row, index) => ({ ...row, rank: index + 1, revenue: money(row.revenue) }))
    );

    if (report.categories.length) {
      drawSectionTitle('Sales by category');
      drawTable(
        [
          { key: 'category', label: 'Category', width: 0.4 },
          { key: 'itemsSold', label: 'Items', width: 0.2, align: 'right' },
          { key: 'revenue', label: 'Revenue', width: 0.22, align: 'right' },
          { key: 'share', label: 'Share', width: 0.18, align: 'right' }
        ],
        report.categories.map((row) => ({ ...row, revenue: money(row.revenue), share: `${row.share}%` }))
      );
    }
  }

  if (wantStaff) {
    if (report.staff.length) {
      drawSectionTitle('Staff performance', 'Revenue is credited to whoever completed the assigned work');
      drawTable(
        [
          { key: 'name', label: 'Name', width: 0.28 },
          { key: 'role', label: 'Role', width: 0.14 },
          { key: 'totalOrders', label: 'Orders', width: 0.13, align: 'right' },
          { key: 'completedOrders', label: 'Done', width: 0.11, align: 'right' },
          { key: 'cancelledOrders', label: 'Cancelled', width: 0.13, align: 'right' },
          { key: 'revenue', label: 'Revenue', width: 0.15, align: 'right' },
          { key: 'completionRate', label: 'Rate', width: 0.14, align: 'right' }
        ],
        report.staff.map((row) => ({
          ...row,
          revenue: money(row.revenue),
          completionRate: `${row.completionRate}%`
        }))
      );
    } else {
      doc.fillColor(PDF_COLORS.muted).fontSize(9).font('Helvetica-Oblique')
        .text('No staff activity in this period.', PDF_MARGIN, doc.y);
      doc.y += 16;
    }
  }

  // ---------- footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - 34;

    doc.moveTo(PDF_MARGIN, y - 6).lineTo(right, y - 6).lineWidth(0.5).stroke(PDF_COLORS.line);
    doc.fillColor(PDF_COLORS.muted).fontSize(7.5).font('Helvetica')
      .text('Sewrica Cafe · Confidential', PDF_MARGIN, y, { width: contentWidth / 2 });
    doc.text(`Page ${i + 1} of ${range.count}`, PDF_MARGIN + contentWidth / 2, y, {
      width: contentWidth / 2,
      align: 'right'
    });
  }

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

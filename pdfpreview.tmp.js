require('dotenv').config();
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { buildPdf } = require('./src/services/reportService');

// Sample report shaped exactly like getUnifiedReport returns
const report = {
  period: { start: '2026-09-01', end: '2026-09-30', days: 30, timezone: '+03:00' },
  totals: {
    totalOrders: 412, paidOrders: 386, cancelledOrders: 14, unpaidOrders: 12,
    paidRevenue: 68420.5, outstandingRevenue: 2240, refundedValue: 320,
    averageOrderValue: 177.25, avgCookingMinutes: 11
  },
  daily: [
    { date: '2026-09-01', orders: 18, paidRevenue: 3120 },
    { date: '2026-09-02', orders: 21, paidRevenue: 3980 },
    { date: '2026-09-03', orders: 12, paidRevenue: 2140 },
    { date: '2026-09-04', orders: 26, paidRevenue: 4720 },
    { date: '2026-09-05', orders: 31, paidRevenue: 5890 },
    { date: '2026-09-06', orders: 28, paidRevenue: 5010 },
    { date: '2026-09-07', orders: 24, paidRevenue: 4380 },
    { date: '2026-09-08', orders: 33, paidRevenue: 6210 },
    { date: '2026-09-09', orders: 19, paidRevenue: 3450 },
    { date: '2026-09-10', orders: 22, paidRevenue: 3990 },
    { date: '2026-09-11', orders: 27, paidRevenue: 4870 },
    { date: '2026-09-12', orders: 30, paidRevenue: 5240 },
    { date: '2026-09-13', orders: 16, paidRevenue: 2810 },
    { date: '2026-09-14', orders: 14, paidRevenue: 2380 },
    { date: '2026-09-15', orders: 25, paidRevenue: 4490 }
  ],
  hourly: [
    { hour: '12', orders: 48, paidRevenue: 8420 },
    { hour: '13', orders: 44, paidRevenue: 7910 },
    { hour: '18', orders: 41, paidRevenue: 7230 },
    { hour: '19', orders: 38, paidRevenue: 6890 },
    { hour: '14', orders: 32, paidRevenue: 5610 },
    { hour: '20', orders: 29, paidRevenue: 4980 },
    { hour: '08', orders: 24, paidRevenue: 4120 },
    { hour: '17', orders: 22, paidRevenue: 3760 }
  ],
  statusBreakdown: [{ status: 'delivered', count: 300 }, { status: 'cancelled', count: 14 }],
  paymentMethods: [
    { method: 'cash', count: 241, amount: 42800, share: 63 },
    { method: 'card', count: 98, amount: 17400, share: 25 },
    { method: 'tele_birr', count: 47, amount: 8220.5, share: 12 }
  ],
  orderChannels: [{ channel: 'delivery', count: 288 }, { channel: 'pickup', count: 124 }],
  categories: [
    { category: 'Main Course', itemsSold: 412, revenue: 34200, share: 50 },
    { category: 'Fast Food', itemsSold: 288, revenue: 19400, share: 28 },
    { category: 'Drinks', itemsSold: 356, revenue: 9820.5, share: 15 },
    { category: 'Desserts', itemsSold: 92, revenue: 4999.99, share: 7 }
  ],
  topItems: [
    { name: 'Doro Wat with Rice', quantity: 148, revenue: 19240 },
    { name: 'Kitfo Special', quantity: 121, revenue: 15730 },
    { name: 'Cheese Burger', quantity: 96, revenue: 12480 },
    { name: 'Buna (Ethiopian Coffee)', quantity: 88, revenue: 7040 },
    { name: 'Kisir with Ayib', quantity: 74, revenue: 9620 },
    { name: 'Fresh Juice Blend', quantity: 69, revenue: 4140 },
    { name: 'Pasta Arrabbiata', quantity: 54, revenue: 6480 },
    { name: 'Shiro Platter', quantity: 49, revenue: 5390 }
  ],
  staff: [
    { staffId: '1', name: 'Selam Bekele', role: 'cook', totalOrders: 96, completedOrders: 92, cancelledOrders: 4, revenue: 24800, avgCookingMinutes: 12, cashCollected: 0, completionRate: 96 },
    { staffId: '2', name: 'Yonas Tadesse', role: 'cook', totalOrders: 84, completedOrders: 80, cancelledOrders: 4, revenue: 21100, avgCookingMinutes: 10, cashCollected: 0, completionRate: 95 },
    { staffId: '3', name: 'Marta Tesfaye', role: 'delivery', totalOrders: 78, completedOrders: 76, cancelledOrders: 2, revenue: 18300, avgCookingMinutes: null, cashCollected: 0, completionRate: 97 },
    { staffId: '4', name: 'Assefa Girma', role: 'cashier', totalOrders: 104, completedOrders: 104, cancelledOrders: 0, revenue: 21320, avgCookingMinutes: null, cashCollected: 24000, completionRate: 100 },
    { staffId: '5', name: 'Hana Mulugeta', role: 'cashier', totalOrders: 78, completedOrders: 78, cancelledOrders: 0, revenue: 15980, avgCookingMinutes: null, cashCollected: 18200, completionRate: 100 }
  ],
  staffDetail: null
};

const doc = buildPdf(report, PDFDocument);
const out = fs.createWriteStream('./pdf-preview.pdf');
doc.pipe(out);
out.on('finish', () => {
  const size = fs.statSync('./pdf-preview.pdf').size;
  console.log('PDF written: ./pdf-preview.pdf');
  console.log('size:', (size / 1024).toFixed(1), 'KB');
  console.log('sections rendered: header, 6 metric cards, 5 tables, footer');
});

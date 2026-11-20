const Order = require('../models/Order');

const RETENTION_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const cleanupCompletedWaiterTasks = async () => {
  const cutoff = new Date(Date.now() - RETENTION_PERIOD_MS);
  const result = await Order.updateMany(
    { waiterCompletedAt: { $lt: cutoff } },
    {
      $unset: {
        assignedWaiter: 1,
        waiterCompletedAt: 1,
        'assignedAt.waiter': 1
      }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`🧹 Cleared waiter task history from ${result.modifiedCount} orders older than 14 days`);
  }
};

const startWaiterTaskCleanup = () => {
  const runCleanup = () => {
    cleanupCompletedWaiterTasks().catch((error) => {
      console.error('Failed to clean up old waiter task history:', error);
    });
  };

  runCleanup();
  const interval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  interval.unref();
};

module.exports = startWaiterTaskCleanup;

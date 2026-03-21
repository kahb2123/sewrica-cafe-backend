// src/routes/lotteryRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const LotteryService = require('../services/lotteryService');

// Get customer's lottery tickets
router.get('/my-tickets', protect, async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user._id,
      lotteryTicketNumber: { $ne: null }
    }).select('orderNumber lotteryTicketNumber createdAt totalAmount status paymentStatus lotteryWon lotteryPrizeClaimed')
      .sort({ createdAt: -1 });

    const eligibleCount = orders.filter(order => 
      order.status === 'delivered' && 
      order.paymentStatus === 'completed'
    ).length;

    const winnersCount = orders.filter(order => order.lotteryWon).length;

    res.json({
      success: true,
      tickets: orders.map(order => ({
        orderNumber: order.orderNumber,
        lotteryTicketNumber: order.lotteryTicketNumber,
        date: order.createdAt,
        amount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
        eligible: order.status === 'delivered' && order.paymentStatus === 'completed',
        won: order.lotteryWon || false,
        prizeClaimed: order.lotteryPrizeClaimed || false
      })),
      stats: {
        totalTickets: orders.length,
        eligibleTickets: eligibleCount,
        winners: winnersCount
      }
    });
  } catch (error) {
    console.error('Error fetching lottery tickets:', error);
    res.status(500).json({ message: 'Failed to fetch lottery tickets' });
  }
});

// Admin: Get all lottery tickets for current month
router.get('/admin/tickets', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { month, year } = req.query;
    const currentMonth = month !== undefined ? parseInt(month) : new Date().getMonth();
    const currentYear = year !== undefined ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    const orders = await Order.find({
      lotteryTicketNumber: { $ne: null },
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('customer', 'name email phone')
      .sort({ createdAt: -1 });

    const eligibleOrders = orders.filter(order => 
      order.status === 'delivered' && 
      order.paymentStatus === 'completed'
    );

    res.json({
      success: true,
      month: currentMonth,
      year: currentYear,
      totalTickets: orders.length,
      eligibleTickets: eligibleOrders.length,
      tickets: orders.map(order => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        lotteryTicketNumber: order.lotteryTicketNumber,
        customer: order.customer,
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        eligible: order.status === 'delivered' && order.paymentStatus === 'completed',
        won: order.lotteryWon || false,
        prizeClaimed: order.lotteryPrizeClaimed || false
      }))
    });
  } catch (error) {
    console.error('Error fetching admin lottery tickets:', error);
    res.status(500).json({ message: 'Failed to fetch lottery tickets' });
  }
});

// Admin: Run monthly lottery draw
router.post('/admin/draw', protect, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { prizeCount = 3, month, year } = req.body;
    const currentMonth = month !== undefined ? month : new Date().getMonth();
    const currentYear = year !== undefined ? year : new Date().getFullYear();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    // Get all eligible orders for the month
    const orders = await Order.find({
      status: 'delivered',
      paymentStatus: 'completed',
      lotteryWon: false,
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('customer', 'name email phone');

    // Simple random selection (since LotteryService might not have selectMonthlyWinners)
    const eligibleOrders = orders.filter(o => !o.lotteryWon);
    const shuffled = [...eligibleOrders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const winners = shuffled.slice(0, Math.min(prizeCount, shuffled.length));

    // Mark winners in database
    for (const winner of winners) {
      winner.lotteryWon = true;
      await winner.save();
    }

    // Prepare winner data
    const winnerData = winners.map(winner => ({
      orderNumber: winner.orderNumber,
      lotteryTicketNumber: winner.lotteryTicketNumber,
      customer: winner.customer,
      amount: winner.totalAmount,
      date: winner.createdAt
    }));

    // Generate certificates for winners
    for (const winner of winnerData) {
      winner.certificate = `
╔══════════════════════════════════════════════════════════════════════╗
║                    SEWRICA CAFE LOTTERY WINNER                       ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  🏆  CONGRATULATIONS!  🏆                                            ║
║                                                                      ║
║  Ticket Number: ${winner.lotteryTicketNumber.padEnd(50)}║
║  Order Number:  ${winner.orderNumber.padEnd(50)}║
║  Customer:      ${winner.customer?.name?.padEnd(50) || 'Customer'.padEnd(50)}║
║  Order Amount:  ETB ${winner.amount.toFixed(2).padEnd(47)}║
║  Winning Date:  ${new Date().toLocaleDateString().padEnd(50)}║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  You have won a special prize from Sewrica Cafe!                     ║
║  Please visit our restaurant or contact us to claim your prize.     ║
║                                                                      ║
║  Prize must be claimed within 30 days.                               ║
║                                                                      ║
║  Thank you for being a valued customer!                              ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
      `;
    }

    // Notify via socket if available
    const io = req.app.get('io');
    if (io && winnerData.length > 0) {
      io.to('staff-admin').emit('lottery-winners-announced', {
        winners: winnerData,
        month: currentMonth,
        year: currentYear
      });
    }

    res.json({
      success: true,
      message: `Lottery draw completed! ${winners.length} winners selected.`,
      winners: winnerData,
      totalEligible: eligibleOrders.length
    });
  } catch (error) {
    console.error('Error running lottery draw:', error);
    res.status(500).json({ message: 'Failed to run lottery draw' });
  }
});

// Admin: Claim prize for winner
router.post('/admin/claim-prize/:ticketNumber', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { ticketNumber } = req.params;
    const { prizeDescription } = req.body;

    const order = await Order.findOne({ lotteryTicketNumber: ticketNumber }).populate('customer', 'name email phone');
    
    if (!order) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (!order.lotteryWon) {
      return res.status(400).json({ message: 'This ticket did not win any prize' });
    }

    if (order.lotteryPrizeClaimed) {
      return res.status(400).json({ message: 'Prize already claimed' });
    }

    order.lotteryPrizeClaimed = true;
    order.lotteryPrizeClaimedAt = new Date();
    await order.save();

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`order-${order._id}`).emit('prize-claimed', {
        ticketNumber: order.lotteryTicketNumber,
        orderNumber: order.orderNumber,
        claimedAt: order.lotteryPrizeClaimedAt
      });
    }

    res.json({
      success: true,
      message: `Prize claimed for ticket ${ticketNumber}`,
      order: {
        orderNumber: order.orderNumber,
        ticketNumber: order.lotteryTicketNumber,
        customer: order.customer,
        claimedAt: order.lotteryPrizeClaimedAt
      }
    });
  } catch (error) {
    console.error('Error claiming prize:', error);
    res.status(500).json({ message: 'Failed to claim prize' });
  }
});

// Admin: Get lottery statistics
router.get('/admin/stats', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const totalTickets = await Order.countDocuments({ lotteryTicketNumber: { $ne: null } });
    const eligibleTickets = await Order.countDocuments({ 
      status: 'delivered', 
      paymentStatus: 'completed',
      lotteryTicketNumber: { $ne: null }
    });
    const winners = await Order.countDocuments({ lotteryWon: true });
    const claimedPrizes = await Order.countDocuments({ lotteryPrizeClaimed: true });

    // Get monthly breakdown for current year
    const monthlyStats = [];
    const currentYear = new Date().getFullYear();
    
    for (let month = 0; month < 12; month++) {
      const startDate = new Date(currentYear, month, 1);
      const endDate = new Date(currentYear, month + 1, 0);
      
      const monthTickets = await Order.countDocuments({
        lotteryTicketNumber: { $ne: null },
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      const monthWinners = await Order.countDocuments({
        lotteryWon: true,
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      monthlyStats.push({
        month: month,
        monthName: new Date(currentYear, month).toLocaleString('default', { month: 'long' }),
        tickets: monthTickets,
        winners: monthWinners
      });
    }

    res.json({
      success: true,
      stats: {
        totalTickets,
        eligibleTickets,
        winners,
        claimedPrizes,
        monthlyStats
      }
    });
  } catch (error) {
    console.error('Error fetching lottery stats:', error);
    res.status(500).json({ message: 'Failed to fetch lottery stats' });
  }
});

module.exports = router;
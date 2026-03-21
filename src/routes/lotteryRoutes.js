// src/routes/lotteryRoutes.js (Create new file)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Order = require('../models/Order');
const LotteryService = require('../services/lotteryService');
const User = require('../models/User');

// Get customer's lottery tickets
router.get('/my-tickets', protect, async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user._id,
      lotteryTicketNumber: { $ne: null }
    }).select('orderNumber lotteryTicketNumber createdAt totalAmount status paymentStatus')
      .sort({ createdAt: -1 });

    const eligibleTickets = orders.filter(order => 
      order.status === 'delivered' && 
      order.paymentStatus === 'completed'
    );

    res.json({
      success: true,
      tickets: orders,
      eligibleTickets: eligibleTickets.length,
      tickets: orders.map(order => ({
        orderNumber: order.orderNumber,
        lotteryTicketNumber: order.lotteryTicketNumber,
        date: order.createdAt,
        amount: order.totalAmount,
        eligible: order.status === 'delivered' && order.paymentStatus === 'completed'
      }))
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
    const currentMonth = month ? parseInt(month) : new Date().getMonth();
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    const orders = await Order.find({
      lotteryTicketNumber: { $ne: null },
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('customer', 'name email phone')
      .sort({ createdAt: -1 });

    const eligibleOrders = orders.filter(order => 
      LotteryService.isEligible(order)
    );

    res.json({
      success: true,
      month: currentMonth,
      year: currentYear,
      totalTickets: orders.length,
      eligibleTickets: eligibleOrders.length,
      tickets: orders.map(order => ({
        orderNumber: order.orderNumber,
        lotteryTicketNumber: order.lotteryTicketNumber,
        customer: order.customer,
        amount: order.totalAmount,
        date: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        eligible: LotteryService.isEligible(order),
        won: order.lotteryWon || false
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

    // Select winners
    const winners = await LotteryService.selectMonthlyWinners(orders, prizeCount);

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

    res.json({
      success: true,
      message: `Lottery draw completed! ${winners.length} winners selected.`,
      winners: winnerData,
      totalEligible: orders.length
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

    const order = await Order.findOne({ lotteryTicketNumber: ticketNumber });
    
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

module.exports = router;
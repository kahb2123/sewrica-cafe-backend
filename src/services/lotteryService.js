// src/services/lotteryService.js
const crypto = require('crypto');

class LotteryService {
  // Generate a unique lottery ticket number
  static generateTicketNumber(orderNumber, customerId) {
    const timestamp = Date.now().toString().slice(-8);
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    const customerHash = customerId.toString().slice(-6);
    const orderHash = orderNumber.toString().slice(-6);
    return `LOT-${timestamp}-${customerHash}-${orderHash}-${random}`;
  }

  // Check if order is eligible for lottery
  static isEligible(order) {
    // Only completed orders with valid payment are eligible
    // Minimum order amount of 100 ETB to prevent spam
    return order.status === 'delivered' && 
           order.paymentStatus === 'completed' &&
           order.totalAmount >= 100;
  }

  // Monthly lottery winner selection
  static async selectMonthlyWinners(orders, prizeCount = 3) {
    // Filter eligible orders from the current month
    const eligibleOrders = orders.filter(order => 
      this.isEligible(order) && 
      !order.lotteryWon
    );
    
    if (eligibleOrders.length === 0) return [];
    
    // Randomly select winners using Fisher-Yates shuffle
    const shuffled = [...eligibleOrders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Take first prizeCount winners
    const winners = shuffled.slice(0, Math.min(prizeCount, shuffled.length));
    
    return winners;
  }

  // Generate winner certificate
  static generateWinnerCertificate(winner) {
    const date = new Date().toLocaleDateString();
    const ticketNumber = winner.lotteryTicketNumber || 'N/A';
    const orderNumber = winner.orderNumber || 'N/A';
    const customerName = winner.customerName || winner.customer?.name || 'Customer';
    const amount = winner.totalAmount || 0;
    
    return `
╔══════════════════════════════════════════════════════════════════════╗
║                    SEWRICA CAFE LOTTERY WINNER                       ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  🏆  CONGRATULATIONS!  🏆                                            ║
║                                                                      ║
║  Ticket Number: ${ticketNumber.padEnd(50)}║
║  Order Number:  ${orderNumber.padEnd(50)}║
║  Customer:      ${customerName.padEnd(50)}║
║  Order Amount:  ETB ${amount.toFixed(2).padEnd(47)}║
║  Winning Date:  ${date.padEnd(50)}║
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

  // Validate lottery ticket number format
  static validateTicketNumber(ticketNumber) {
    const pattern = /^LOT-\d{8}-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{8}$/;
    return pattern.test(ticketNumber);
  }

  // Parse ticket number to get order and customer info
  static parseTicketNumber(ticketNumber) {
    if (!this.validateTicketNumber(ticketNumber)) {
      return null;
    }
    
    const parts = ticketNumber.split('-');
    return {
      timestamp: parts[1],
      customerHash: parts[2],
      orderHash: parts[3],
      random: parts[4]
    };
  }
}

module.exports = LotteryService;
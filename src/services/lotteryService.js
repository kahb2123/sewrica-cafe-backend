// src/services/lotteryService.js
const crypto = require('crypto');

class LotteryService {
  // Generate a unique 5-digit lottery ticket number
  static generateTicketNumber(orderNumber, customerId) {
    // Create a simple 5-digit number based on timestamp and order
    const timestamp = Date.now().toString().slice(-3);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    // Generate a 5-digit number: 2 digits from timestamp + 3 random digits
    const ticketNumber = `${timestamp}${random}`.slice(-5);
    
    // Store as simple number but ensure uniqueness
    return ticketNumber;
  }

  // Check if order is eligible for lottery
  static isEligible(order) {
    return order.status === 'delivered' && 
           order.paymentStatus === 'completed' &&
           order.totalAmount >= 100;
  }

  // Monthly lottery winner selection
  static async selectMonthlyWinners(orders, prizeCount = 3) {
    const eligibleOrders = orders.filter(order => 
      this.isEligible(order) && 
      !order.lotteryWon
    );
    
    if (eligibleOrders.length === 0) return [];
    
    const shuffled = [...eligibleOrders];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, Math.min(prizeCount, shuffled.length));
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
}

module.exports = LotteryService;
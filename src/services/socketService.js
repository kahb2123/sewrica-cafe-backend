const socketIo = require('socket.io');

let io;

const initSocket = (server, allowedOrigins) => {
  io = socketIo(server, {
    cors: {
      origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
          return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }
        if (origin && origin.match && origin.match(/\.vercel\.app$/)) {
          return callback(null, true);
        }
        callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // Customer registers to their order room
    socket.on('register-order', (orderId) => {
      const roomName = `order-${orderId}`;
      socket.join(roomName);
      console.log(`📦 Customer joined room: ${roomName}`);
      socket.emit('registered', { orderId, room: roomName, message: 'Successfully registered for order updates' });
    });

    // Staff joins their staff room
    socket.on('register-staff', (staffId, role) => {
      const roomName = `staff-${role}`;
      socket.join(roomName);
      console.log(`👨‍🍳 Staff joined room: ${roomName} (ID: ${staffId})`);
      socket.emit('staff-registered', { role, room: roomName, message: `Registered as ${role}` });
    });

    // Specialized registrations
    socket.on('register-chef', (chefId) => {
      socket.join(`chef-${chefId}`);
      socket.join('staff-cook');
    });

    socket.on('register-delivery', (deliveryId) => {
      socket.join(`delivery-${deliveryId}`);
      socket.join('staff-delivery');
    });

    socket.on('register-admin', (adminId) => socket.join('staff-admin'));
    socket.on('register-cashier', (cashierId) => socket.join('staff-cashier'));

    socket.on('disconnect', (reason) => {
      console.log('🔌 Client disconnected:', socket.id, 'Reason:', reason);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIO };

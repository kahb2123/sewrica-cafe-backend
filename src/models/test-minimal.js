const mongoose = require('mongoose');
const User = require('./User');

async function testMinimal() {
  try {
    await mongoose.connect('mongodb://localhost:27017/sewrica_cafe');
    console.log('✅ Connected');

    const testUser = new User({
      name: 'Test',
      email: 'test@test.com',
      password: '123456',
      phone: '1234567890'
    });

    await testUser.save();
    console.log('✅ User saved');

    await User.deleteMany({ email: 'test@test.com' });
    console.log('✅ Cleanup done');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testMinimal();
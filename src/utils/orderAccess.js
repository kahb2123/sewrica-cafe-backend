const crypto = require('crypto');

const createGuestAccessToken = () => crypto.randomBytes(32).toString('hex');

const hashGuestAccessToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const guestTokenMatches = (order, token) => {
  if (!order.guestAccessTokenHash || typeof token !== 'string' || token.length !== 64) {
    return false;
  }

  const providedHash = Buffer.from(hashGuestAccessToken(token), 'hex');
  const storedHash = Buffer.from(order.guestAccessTokenHash, 'hex');
  return providedHash.length === storedHash.length &&
    crypto.timingSafeEqual(providedHash, storedHash);
};

module.exports = {
  createGuestAccessToken,
  hashGuestAccessToken,
  guestTokenMatches
};

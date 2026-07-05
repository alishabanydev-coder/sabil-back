const {
  create,
  deriveHmacKeySecret,
  randomInt,
  CappedMap,
} = require('altcha-lib/frameworks/express');
const { deriveKey } = require('altcha-lib/algorithms/pbkdf2');

let altchaInstance = null;

const isDevelopment = process.env.NODE_ENV !== 'production';

async function initAltcha() {
  const secret = process.env.ALTCHA_HMAC_SECRET;
  if (!secret) {
    throw new Error('ALTCHA_HMAC_SECRET is not configured.');
  }

  altchaInstance = create({
    hmacSignatureSecret: secret,
    hmacKeySignatureSecret: await deriveHmacKeySecret(secret),
    createChallengeParameters: () => ({
      algorithm: 'PBKDF2/SHA-256',
      cost: isDevelopment ? 2000 : 5000,
      counter: isDevelopment
        ? randomInt(2000, 4000)
        : randomInt(5000, 10000),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }),
    deriveKey,
    store: new CappedMap({ maxSize: 1000 }),
  });

  return altchaInstance;
}

function getAltcha() {
  if (!altchaInstance) {
    throw new Error('ALTCHA has not been initialized.');
  }

  return altchaInstance;
}

function altchaMiddleware(req, res, next) {
  try {
    getAltcha().middleware()(req, res, (err) => {
      if (err) {
        return res.status(err.status || 403).json({
          message: err.message || 'Security verification failed. Please try again.',
        });
      }

      return next();
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || 'Security verification is unavailable.',
    });
  }
}

function altchaChallengeHandler(req, res, next) {
  try {
    getAltcha().challengeHandler(req, res, next);
  } catch (error) {
    return res.status(500).json({
      message: error.message || 'Could not create security challenge.',
    });
  }
}

module.exports = {
  initAltcha,
  getAltcha,
  altchaMiddleware,
  altchaChallengeHandler,
};

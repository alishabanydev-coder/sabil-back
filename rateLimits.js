const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function rateLimitMessage(message) {
  return { message };
}

const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    'Too many admin login attempts. Please try again in 15 minutes.'
  ),
});

const userLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    'Too many sign-in attempts. Please try again in 15 minutes.'
  ),
});

const userRegisterRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(
    'Too many registration attempts. Please try again in an hour.'
  ),
});

const commentPostRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?._id) {
      return req.user._id.toString();
    }

    return ipKeyGenerator(req.ip);
  },
  message: rateLimitMessage(
    'Comment limit reached. You can post up to 10 comments per hour.'
  ),
});

module.exports = {
  adminLoginRateLimit,
  userLoginRateLimit,
  userRegisterRateLimit,
  commentPostRateLimit,
};

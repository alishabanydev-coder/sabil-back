const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../models/user.model');
const {
  altchaChallengeHandler,
  altchaMiddleware,
} = require('../../altchaSetup');
const {
  userLoginRateLimit,
  userRegisterRateLimit,
  commentPostRateLimit,
} = require('../../rateLimits');
const {
  parseCommentPageLimit,
  parseCreatePublicComment,
  parsePublicCommentListQuery,
} = require('../comments/comment.validation');
const {
  createPublicComment,
  listFeaturedPublicComments,
  listPublicComments,
} = require('../comments/comment.service');

const router = express.Router();

function getUserJwtSecret() {
  return process.env.USER_JWT_SECRET;
}

function buildUserToken(user) {
  const authUser = user.toAuthJSON();

  return jwt.sign(
    {
      userId: authUser.id,
    },
    getUserJwtSecret(),
    {
      subject: authUser.id,
      expiresIn: '1d',
    }
  );
}

async function authenticateUser(req, res, next) {
  const jwtSecret = getUserJwtSecret();
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!jwtSecret) {
    return res.status(500).json({
      message: 'User JWT secret is not configured.',
    });
  }

  if (!token) {
    return res.status(401).json({
      message: 'User authentication token is required.',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId || decoded.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: 'User account is inactive or no longer exists.',
      });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired user token.',
    });
  }
}

function normalizePublicComment(comment, userById = new Map()) {
  if (!comment) {
    return comment;
  }

  const plain = comment.toObject ? comment.toObject() : comment;
  const userId =
    plain.userId && typeof plain.userId === 'object'
      ? plain.userId._id?.toString?.() || plain.userId.toString()
      : plain.userId?.toString?.() || null;

  const linkedUser = userId ? userById.get(userId) : null;
  const authorPresentation = linkedUser
    ? linkedUser.getCommentAuthorPresentation()
    : {
        username: plain.username,
        avatar: plain.avatar ?? null,
      };

  return {
    ...plain,
    _id: typeof plain._id === 'string' ? plain._id : plain._id?.toString?.() || '',
    userId,
    username: authorPresentation.username,
    avatar: authorPresentation.avatar,
    targetId: plain.targetId ? plain.targetId.toString() : null,
    parentCommentId: plain.parentCommentId ? plain.parentCommentId.toString() : null,
  };
}

async function buildUserMapForComments(comments) {
  const userIds = [
    ...new Set(
      comments
        .map((comment) => {
          const plain = comment.toObject ? comment.toObject() : comment;
          if (!plain.userId) {
            return null;
          }

          return typeof plain.userId === 'object'
            ? plain.userId._id?.toString?.()
            : plain.userId.toString();
        })
        .filter(Boolean)
    ),
  ];

  if (!userIds.length) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: userIds } }).select(
    'displayName avatar showAsAnonymousInDonations'
  );

  return new Map(users.map((user) => [user._id.toString(), user]));
}

function reject(res, parsed) {
  return res.status(400).json({ message: parsed.message });
}

router.get('/altcha/challenge', altchaChallengeHandler);

router.post('/register', userRegisterRateLimit, altchaMiddleware, async (req, res) => {
  const jwtSecret = getUserJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({
      message: 'User JWT secret is not configured.',
    });
  }

  const { email, password, displayName } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  const normalizedPassword = typeof password === 'string' ? password : '';

  if (!normalizedEmail || !normalizedPassword || !normalizedDisplayName) {
    return res.status(400).json({
      message: 'Email, password, and display name are required.',
    });
  }

  if (normalizedPassword.length < 6) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters.',
    });
  }

  try {
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await User.hashPassword(normalizedPassword);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      displayName: normalizedDisplayName,
    });

    const token = buildUserToken(user);

    return res.status(201).json({
      token,
      user: user.toAuthJSON(),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.post('/login', userLoginRateLimit, altchaMiddleware, async (req, res) => {
  const jwtSecret = getUserJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({
      message: 'User JWT secret is not configured.',
    });
  }

  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPassword = typeof password === 'string' ? password : '';

  if (!normalizedEmail || !normalizedPassword) {
    return res.status(400).json({
      message: 'Email and password are required.',
    });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user || !user.isActive) {
    return res.status(401).json({
      message: 'Invalid email or password.',
    });
  }

  const passwordMatches = await user.comparePassword(normalizedPassword);
  if (!passwordMatches) {
    return res.status(401).json({
      message: 'Invalid email or password.',
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  return res.status(200).json({
    token: buildUserToken(user),
    user: user.toAuthJSON(),
  });
});

router.get('/me', authenticateUser, (req, res) => {
  return res.status(200).json({
    user: req.user.toAuthJSON(),
  });
});

const PUBLIC_DONATION_FEATURED_COMMENTS_DEFAULT_LIMIT = 6;
const PUBLIC_DONATION_FEATURED_COMMENTS_MAX_LIMIT = 20;

router.get('/public/comments/donation-featured', async (req, res) => {
  const limit = parseCommentPageLimit(
    req.query?.limit,
    PUBLIC_DONATION_FEATURED_COMMENTS_DEFAULT_LIMIT,
    PUBLIC_DONATION_FEATURED_COMMENTS_MAX_LIMIT
  );
  const comments = await listFeaturedPublicComments(limit);
  const userById = await buildUserMapForComments(comments);

  return res.status(200).json({
    comments: comments.map((comment) => normalizePublicComment(comment, userById)),
  });
});

router.get('/public/comments', async (req, res) => {
  const parsed = parsePublicCommentListQuery(req.query);
  if (!parsed.ok) {
    return reject(res, parsed);
  }

  const pageResult = await listPublicComments(parsed.value);
  const userById = await buildUserMapForComments(pageResult.comments);

  return res.status(200).json({
    comments: pageResult.comments.map((comment) => normalizePublicComment(comment, userById)),
    page: pageResult.page,
    limit: pageResult.limit,
    totalRoots: pageResult.totalRoots,
    totalPages: pageResult.totalPages,
  });
});

router.post(
  '/public/comments',
  authenticateUser,
  commentPostRateLimit,
  altchaMiddleware,
  async (req, res) => {
    const parsed = parseCreatePublicComment(req.body);
    if (!parsed.ok) {
      return reject(res, parsed);
    }

    const comment = await createPublicComment(req.user, parsed.value);
    return res.status(201).json({
      comment: normalizePublicComment(comment, new Map([[req.user._id.toString(), req.user]])),
    });
  }
);

module.exports = {
  userAuthRouter: router,
  authenticateUser,
};

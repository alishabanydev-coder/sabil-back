const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/user.model');
const Comment = require('./models/comment.model');
const DonationProject = require('./models/donationProject.model');
const Project = require('./models/project.model');
const Video = require('./models/video.model');
const Blog = require('./models/blog.model');
const ProjectBreakDown = require('./models/projectBreakDown.model');

const router = express.Router();

const PUBLIC_COMMENT_TARGET_TYPES = [
  'video',
  'blog',
  'breakdown',
  'general',
  'project',
  'projectDonation',
];

const COMMENT_TARGET_MODELS = {
  video: Video,
  blog: Blog,
  breakdown: ProjectBreakDown,
  project: Project,
  projectDonation: DonationProject,
};

function getUserJwtSecret() {
  return process.env.USER_JWT_SECRET;
}

function normalizeCommentTargetType(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidPublicCommentTargetType(targetType) {
  return PUBLIC_COMMENT_TARGET_TYPES.includes(targetType);
}

function commentTargetRequiresId(targetType) {
  return targetType !== 'general';
}

function normalizeCommentTargetId(targetType, targetId) {
  if (!commentTargetRequiresId(targetType)) {
    return null;
  }

  if (targetId === undefined || targetId === null || targetId === '') {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(targetId) ? targetId : null;
}

async function commentTargetExists(targetType, targetId) {
  if (targetType === 'general') {
    return targetId === null || targetId === undefined;
  }

  if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
    return false;
  }

  const model = COMMENT_TARGET_MODELS[targetType];
  if (!model) {
    return false;
  }

  const target = await model.findById(targetId).select('_id');
  return Boolean(target);
}

function commentTargetsMatch(firstTargetType, firstTargetId, secondTargetType, secondTargetId) {
  const first = firstTargetId ? firstTargetId.toString() : null;
  const second = secondTargetId ? secondTargetId.toString() : null;

  return firstTargetType === secondTargetType && first === second;
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

function normalizePublicComment(comment) {
  if (!comment) {
    return comment;
  }

  const plain = comment.toObject ? comment.toObject() : comment;

  return {
    ...plain,
    _id:
      typeof plain._id === 'string'
        ? plain._id
        : plain._id?.toString?.() || '',
    userId:
      plain.userId && typeof plain.userId === 'object'
        ? plain.userId._id?.toString?.() || plain.userId.toString()
        : plain.userId?.toString?.() || null,
    targetId: plain.targetId ? plain.targetId.toString() : null,
    parentCommentId: plain.parentCommentId
      ? plain.parentCommentId.toString()
      : null,
  };
}

router.post('/register', async (req, res) => {
  const jwtSecret = getUserJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({
      message: 'User JWT secret is not configured.',
    });
  }

  const { email, password, displayName } = req.body || {};
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedDisplayName =
    typeof displayName === 'string' ? displayName.trim() : '';
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

router.post('/login', async (req, res) => {
  const jwtSecret = getUserJwtSecret();
  if (!jwtSecret) {
    return res.status(500).json({
      message: 'User JWT secret is not configured.',
    });
  }

  const { email, password } = req.body || {};
  const normalizedEmail =
    typeof email === 'string' ? email.trim().toLowerCase() : '';
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

router.get('/public/comments', async (req, res) => {
  const { targetType, targetId } = req.query || {};
  const normalizedTargetType = normalizeCommentTargetType(targetType);
  const normalizedTargetId = normalizeCommentTargetId(
    normalizedTargetType,
    targetId
  );

  if (!isValidPublicCommentTargetType(normalizedTargetType)) {
    return res.status(400).json({
      message: 'A valid target type is required.',
    });
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return res.status(400).json({
      message: 'Target id is required for this target type.',
    });
  }

  if (!(await commentTargetExists(normalizedTargetType, normalizedTargetId))) {
    return res.status(404).json({
      message: 'Comment target not found.',
    });
  }

  const comments = await Comment.find({
    targetType: normalizedTargetType,
    targetId: normalizedTargetId,
  }).sort({ createdAt: -1 });

  return res.status(200).json({
    comments: comments.map(normalizePublicComment),
  });
});

router.post('/public/comments', authenticateUser, async (req, res) => {
  const { text, targetType, targetId, parentCommentId } = req.body || {};
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const normalizedTargetType = normalizeCommentTargetType(targetType);
  const normalizedTargetId = normalizeCommentTargetId(
    normalizedTargetType,
    targetId
  );

  if (!normalizedText || !isValidPublicCommentTargetType(normalizedTargetType)) {
    return res.status(400).json({
      message: 'Text and a valid target type are required.',
    });
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return res.status(400).json({
      message: 'Target id is required for this target type.',
    });
  }

  if (!(await commentTargetExists(normalizedTargetType, normalizedTargetId))) {
    return res.status(404).json({
      message: 'Comment target not found.',
    });
  }

  let normalizedParentCommentId = null;
  if (parentCommentId !== undefined && parentCommentId !== null && parentCommentId !== '') {
    if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
      return res.status(400).json({
        message: 'Invalid parent comment id.',
      });
    }

    const parentComment = await Comment.findById(parentCommentId);
    if (!parentComment) {
      return res.status(404).json({
        message: 'Parent comment not found.',
      });
    }

    if (
      !commentTargetsMatch(
        parentComment.targetType,
        parentComment.targetId,
        normalizedTargetType,
        normalizedTargetId
      )
    ) {
      return res.status(400).json({
        message: 'Parent comment target does not match this comment target.',
      });
    }

    normalizedParentCommentId = parentComment._id;
  }

  try {
    const comment = await Comment.create({
      userId: req.user._id,
      text: normalizedText,
      username: req.user.displayName,
      avatar: req.user.avatar,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      parentCommentId: normalizedParentCommentId,
    });

    return res.status(201).json({
      comment: normalizePublicComment(comment),
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

module.exports = {
  userAuthRouter: router,
  authenticateUser,
};

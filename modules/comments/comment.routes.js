const express = require('express');
const mongoose = require('mongoose');
const { ADMIN_ROLES } = require('../../adminPermissions');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const Blog = require('../../models/blog.model');
const Comment = require('../../models/comment.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const DonationProject = require('../../models/donationProject.model');
const {
  authenticateAdmin,
  getAllowedChannelProjectIds,
  hasPermission,
  requireCommentAccess,
} = require('../../middleware/adminAuth');

const COMMENT_TARGET_TYPES = [
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

function normalizeCommentTargetType(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim().toLowerCase();
  const aliases = {
    video: 'video',
    blog: 'blog',
    breakdown: 'breakdown',
    general: 'general',
    project: 'project',
    projectdonation: 'projectDonation',
  };

  return aliases[normalized] || '';
}

function isValidCommentTargetType(targetType) {
  return COMMENT_TARGET_TYPES.includes(targetType);
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

function commentTargetIdsMatch(firstTargetId, secondTargetId) {
  const first = firstTargetId ? firstTargetId.toString() : null;
  const second = secondTargetId ? secondTargetId.toString() : null;
  return first === second;
}

function commentTargetsMatch(firstTargetType, firstTargetId, secondTargetType, secondTargetId) {
  return (
    firstTargetType === secondTargetType &&
    commentTargetIdsMatch(firstTargetId, secondTargetId)
  );
}

function normalizeAdminCommentRecord(comment) {
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
    targetId: plain.targetId ? plain.targetId.toString() : null,
    parentCommentId: plain.parentCommentId
      ? plain.parentCommentId.toString()
      : null,
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
  };
}

function buildAdminCommentThread(comments) {
  const normalizedComments = comments.map(normalizeAdminCommentRecord);
  const repliesByParent = new Map();

  normalizedComments.forEach((comment) => {
    if (!comment.parentCommentId) {
      return;
    }

    const siblings = repliesByParent.get(comment.parentCommentId) || [];
    siblings.push(comment);
    repliesByParent.set(comment.parentCommentId, siblings);
  });

  const roots = normalizedComments.filter((comment) => !comment.parentCommentId);
  const sortNewestFirst = (a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  const sortOldestFirst = (a, b) =>
    new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();

  roots.sort(sortNewestFirst);
  repliesByParent.forEach((replies) => replies.sort(sortOldestFirst));

  return roots.map((root) => ({
    ...root,
    replies: repliesByParent.get(root._id) || [],
  }));
}

const ADMIN_COMMENT_THREAD_PAGE_SIZE = 10;
const ADMIN_COMMENT_THREAD_MAX_PAGE_SIZE = 50;

function parseAdminCommentPageLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ADMIN_COMMENT_THREAD_PAGE_SIZE;
  }

  return Math.min(parsed, ADMIN_COMMENT_THREAD_MAX_PAGE_SIZE);
}

function encodeAdminCommentCursor(comment) {
  if (!comment?.createdAt || !comment?._id) {
    return null;
  }

  return `${new Date(comment.createdAt).toISOString()}:${comment._id.toString()}`;
}

function parseAdminCommentCursor(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return null;
  }

  const createdAtValue = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtValue);

  if (Number.isNaN(createdAt.getTime()) || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  return { createdAt, id };
}

function buildOlderAdminRootCommentCursorFilter(cursor) {
  if (!cursor) {
    return {};
  }

  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
}

async function fetchPaginatedAdminRootComments({
  targetType,
  targetId,
  limit,
  cursor,
}) {
  const parsedCursor = parseAdminCommentCursor(cursor);
  if (cursor && !parsedCursor) {
    return { error: 'Invalid comments cursor.' };
  }

  const rootFilter = {
    targetType,
    targetId,
    parentCommentId: null,
    ...buildOlderAdminRootCommentCursorFilter(parsedCursor),
  };

  const rootComments = await Comment.find(rootFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasMore = rootComments.length > limit;
  const pageRoots = hasMore ? rootComments.slice(0, limit) : rootComments;
  const rootIds = pageRoots.map((comment) => comment._id);

  const replies =
    rootIds.length > 0
      ? await Comment.find({
          parentCommentId: { $in: rootIds },
        }).sort({ createdAt: 1, _id: 1 })
      : [];

  const nextCursor =
    hasMore && pageRoots.length > 0
      ? encodeAdminCommentCursor(pageRoots[pageRoots.length - 1])
      : null;

  return {
    comments: [...pageRoots, ...replies],
    hasMore,
    nextCursor,
  };
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

async function canAdminAccessCommentTarget(admin, targetType, targetId) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  if (targetType === 'general' || targetType === 'blog') {
    return false;
  }

  if (targetType === 'projectDonation') {
    return hasPermission(admin, 'donation', 'read');
  }

  const allowedProjectIds = getAllowedChannelProjectIds(admin);
  if (!Array.isArray(allowedProjectIds) || allowedProjectIds.length === 0) {
    return false;
  }

  if (targetType === 'project') {
    return Boolean(targetId && allowedProjectIds.includes(targetId.toString()));
  }

  if (targetType === 'video') {
    const video = await Video.findById(targetId).select('projectId');
    return Boolean(video?.projectId && allowedProjectIds.includes(video.projectId.toString()));
  }

  if (targetType === 'breakdown') {
    const breakdown = await ProjectBreakDown.findById(targetId).select('projectId');
    return Boolean(
      breakdown?.projectId && allowedProjectIds.includes(breakdown.projectId.toString())
    );
  }

  return false;
}
const router = express.Router();

router.post(
  '/comments',
  authenticateAdmin,
  requireCommentAccess('create'),
  async (req, res) => {
    const { text, username, targetType, targetId, parentCommentId } = req.body || {};
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedTargetType = normalizeCommentTargetType(targetType);
    const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, targetId);

    if (!normalizedText || !normalizedUsername || !isValidCommentTargetType(normalizedTargetType)) {
      return res.status(400).json({
        message: 'Text, username, and a valid target type are required.',
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

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        normalizedTargetType,
        normalizedTargetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
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
        text: normalizedText,
        username: normalizedUsername,
        targetType: normalizedTargetType,
        targetId: normalizedTargetId,
        parentCommentId: normalizedParentCommentId,
      });

      return res.status(201).json({
        comment,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get(
  '/comments',
  authenticateAdmin,
  requireCommentAccess('read'),
  async (req, res) => {
    const { targetType, username } = req.query || {};
    const filter = {};

    if (typeof targetType === 'string' && targetType.trim()) {
      const normalizedTargetType = normalizeCommentTargetType(targetType);
      if (!isValidCommentTargetType(normalizedTargetType)) {
        return res.status(400).json({
          message: 'Invalid target type filter.',
        });
      }

      filter.targetType = normalizedTargetType;
    }

    if (typeof username === 'string' && username.trim()) {
      filter.username = {
        $regex: username.trim(),
        $options: 'i',
      };
    }

    if (req.admin?.role !== ADMIN_ROLES.SUPER_ADMIN) {
      const allowedProjectIds = getAllowedChannelProjectIds(req.admin);
      const hasDonationRead = hasPermission(req.admin, 'donation', 'read');
      const hasChannelScope =
        Array.isArray(allowedProjectIds) && allowedProjectIds.length > 0;

      if (!hasChannelScope && !hasDonationRead) {
        return res.status(200).json({
          comments: [],
        });
      }

      if (!hasChannelScope && hasDonationRead) {
        if (filter.targetType === 'blog' || filter.targetType === 'general') {
          return res.status(200).json({
            comments: [],
          });
        }

        if (!filter.targetType) {
          filter.targetType = 'projectDonation';
        } else if (filter.targetType !== 'projectDonation') {
          return res.status(200).json({
            comments: [],
          });
        }
      }

      if (hasChannelScope) {
        const [videos, breakdowns] = await Promise.all([
          Video.find({ projectId: { $in: allowedProjectIds } }).select('_id'),
          ProjectBreakDown.find({ projectId: { $in: allowedProjectIds } }).select('_id'),
        ]);

        const allowedVideoIds = videos.map((item) => item._id.toString());
        const allowedBreakdownIds = breakdowns.map((item) => item._id.toString());

        if (filter.targetType === 'video') {
          filter.targetId = { $in: allowedVideoIds };
        } else if (filter.targetType === 'breakdown') {
          filter.targetId = { $in: allowedBreakdownIds };
        } else if (filter.targetType === 'project') {
          filter.targetId = { $in: allowedProjectIds };
        } else if (filter.targetType === 'projectDonation') {
          if (!hasDonationRead) {
            return res.status(200).json({
              comments: [],
            });
          }
        } else if (filter.targetType === 'blog' || filter.targetType === 'general') {
          return res.status(200).json({
            comments: [],
          });
        } else {
          const orConditions = [
            {
              targetType: 'video',
              targetId: { $in: allowedVideoIds },
            },
            {
              targetType: 'breakdown',
              targetId: { $in: allowedBreakdownIds },
            },
            {
              targetType: 'project',
              targetId: { $in: allowedProjectIds },
            },
          ];

          if (hasDonationRead) {
            orConditions.push({ targetType: 'projectDonation' });
          }

          filter.$or = orConditions;
        }
      }
    }

    const comments = await Comment.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      comments,
    });
  }
);

router.get(
  '/comments/thread',
  authenticateAdmin,
  requireCommentAccess('read'),
  async (req, res) => {
    const { targetType, targetId, limit, cursor } = req.query || {};
    const normalizedTargetType = normalizeCommentTargetType(targetType);
    const normalizedTargetId = normalizeCommentTargetId(
      normalizedTargetType,
      targetId
    );
    const pageLimit = parseAdminCommentPageLimit(limit);

    if (!isValidCommentTargetType(normalizedTargetType)) {
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

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        normalizedTargetType,
        normalizedTargetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target.',
      });
    }

    const pageResult = await fetchPaginatedAdminRootComments({
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      limit: pageLimit,
      cursor,
    });

    if (pageResult.error) {
      return res.status(400).json({
        message: pageResult.error,
      });
    }

    return res.status(200).json({
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      thread: buildAdminCommentThread(pageResult.comments),
      hasMore: pageResult.hasMore,
      nextCursor: pageResult.nextCursor,
    });
  }
);

router.put(
  '/comments/:id',
  authenticateAdmin,
  requireCommentAccess('update'),
  async (req, res) => {
    const { id } = req.params;
    const { text, username, targetType, targetId, parentCommentId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid comment id.',
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found.',
      });
    }

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        comment.targetType,
        comment.targetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
      });
    }

    const hasText = typeof text === 'string';
    const hasUsername = typeof username === 'string';
    const hasTargetType = typeof targetType === 'string';
    const hasTargetId = Object.prototype.hasOwnProperty.call(req.body || {}, 'targetId');
    const hasParentCommentId = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentCommentId');

    const nextText = hasText ? text.trim() : comment.text;
    const nextUsername = hasUsername ? username.trim() : comment.username;
    const nextTargetType = hasTargetType
      ? normalizeCommentTargetType(targetType)
      : comment.targetType;
    const nextTargetId = hasTargetId
      ? normalizeCommentTargetId(nextTargetType, targetId)
      : comment.targetId;

    if (!nextText || !nextUsername) {
      return res.status(400).json({
        message: 'Text and username cannot be empty.',
      });
    }

    if (!isValidCommentTargetType(nextTargetType)) {
      return res.status(400).json({
        message: 'Invalid target type.',
      });
    }

    if (commentTargetRequiresId(nextTargetType) && !nextTargetId) {
      return res.status(400).json({
        message: 'Target id is required for this target type.',
      });
    }

    if (!(await commentTargetExists(nextTargetType, nextTargetId))) {
      return res.status(404).json({
        message: 'Comment target not found.',
      });
    }

    if (!(await canAdminAccessCommentTarget(req.admin, nextTargetType, nextTargetId))) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
      });
    }

    let nextParentCommentId = comment.parentCommentId;
    if (hasParentCommentId) {
      const normalizedParentValue =
        parentCommentId === '' || parentCommentId === null ? null : parentCommentId;

      if (normalizedParentValue === null) {
        nextParentCommentId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(normalizedParentValue)) {
          return res.status(400).json({
            message: 'Invalid parent comment id.',
          });
        }

        if (normalizedParentValue === id) {
          return res.status(400).json({
            message: 'A comment cannot be its own parent.',
          });
        }

        const parentComment = await Comment.findById(normalizedParentValue);
        if (!parentComment) {
          return res.status(404).json({
            message: 'Parent comment not found.',
          });
        }

        if (
          !commentTargetsMatch(
            parentComment.targetType,
            parentComment.targetId,
            nextTargetType,
            nextTargetId
          )
        ) {
          return res.status(400).json({
            message: 'Parent comment target does not match this comment target.',
          });
        }

        nextParentCommentId = parentComment._id;
      }
    } else if (
      comment.parentCommentId &&
      (hasTargetType || hasTargetId) &&
      (await Comment.findById(comment.parentCommentId).select('_id targetType targetId').then(
        (parentComment) =>
          parentComment &&
          !commentTargetsMatch(
            parentComment.targetType,
            parentComment.targetId,
            nextTargetType,
            nextTargetId
          )
      ))
    ) {
      return res.status(400).json({
        message:
          'Changing target type or target id requires updating parent comment id as well.',
      });
    }

    try {
      comment.text = nextText;
      comment.username = nextUsername;
      comment.targetType = nextTargetType;
      comment.targetId = nextTargetId;
      comment.parentCommentId = nextParentCommentId;

      await comment.save();

      return res.status(200).json({
        comment,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/comments/:id',
  authenticateAdmin,
  requireCommentAccess('delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid comment id.',
      });
    }

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found.',
      });
    }

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        comment.targetType,
        comment.targetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
      });
    }

    await comment.deleteOne();

    await Comment.updateMany(
      { parentCommentId: id },
      {
        $set: {
          parentCommentId: null,
        },
      }
    );

    return res.status(200).json({
      message: 'Comment deleted.',
    });
  }
);

module.exports = router;


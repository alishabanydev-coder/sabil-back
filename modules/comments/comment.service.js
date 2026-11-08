const mongoose = require('mongoose');
const { ADMIN_ROLES } = require('../../adminPermissions');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const Blog = require('../../models/blog.model');
const Comment = require('../../models/comment.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const DonationProject = require('../../models/donationProject.model');
const {
  getAllowedChannelProjectIds,
  hasPermission,
} = require('../../middleware/adminAuth');
const { fail } = require('../../lib/httpError');
const {
  commentTargetRequiresId,
  escapeRegex,
  isValidCommentTargetType,
  normalizeCommentTargetId,
} = require('./comment.validation');

const COMMENT_TARGET_MODELS = {
  video: Video,
  blog: Blog,
  breakdown: ProjectBreakDown,
  project: Project,
  projectDonation: DonationProject,
};

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
    _id: typeof plain._id === 'string' ? plain._id : plain._id?.toString?.() || '',
    targetId: plain.targetId ? plain.targetId.toString() : null,
    parentCommentId: plain.parentCommentId ? plain.parentCommentId.toString() : null,
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

async function fetchCommentDescendants(rootIds) {
  const descendants = [];
  const seen = new Set(rootIds.map((id) => id.toString()));
  let parentIds = rootIds;

  while (parentIds.length > 0) {
    const children = await Comment.find({
      parentCommentId: { $in: parentIds },
    }).sort({ createdAt: 1, _id: 1 });

    parentIds = [];
    children.forEach((child) => {
      const childId = child._id.toString();
      if (seen.has(childId)) {
        return;
      }

      seen.add(childId);
      descendants.push(child);
      parentIds.push(child._id);
    });
  }

  return descendants;
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

async function assertCommentTargetAccess(admin, targetType, targetId, message) {
  if (!(await canAdminAccessCommentTarget(admin, targetType, targetId))) {
    throw fail(403, message);
  }
}

async function resolveParentCommentId(parentCommentId, targetType, targetId, commentId) {
  if (parentCommentId === undefined || parentCommentId === null || parentCommentId === '') {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
    throw fail(400, 'Invalid parent comment id.');
  }

  if (commentId && parentCommentId === commentId) {
    throw fail(400, 'A comment cannot be its own parent.');
  }

  const parentComment = await Comment.findById(parentCommentId);
  if (!parentComment) {
    throw fail(404, 'Parent comment not found.');
  }

  if (
    !commentTargetsMatch(
      parentComment.targetType,
      parentComment.targetId,
      targetType,
      targetId
    )
  ) {
    throw fail(400, 'Parent comment target does not match this comment target.');
  }

  return parentComment._id;
}

const DONATION_PAGE_COMMENT_SORT = {
  showInDonationPage: -1,
  donationPageOrder: 1,
  createdAt: -1,
};

async function getDonationPageCommentItems() {
  const items = await Comment.find({ parentCommentId: null }).sort(DONATION_PAGE_COMMENT_SORT);
  return items.map(normalizeAdminCommentRecord);
}

async function reorderDonationPageComments(orderedIds) {
  if (orderedIds.length > 0) {
    const rootCommentsCount = await Comment.countDocuments({
      _id: { $in: orderedIds },
      parentCommentId: null,
    });

    if (rootCommentsCount !== orderedIds.length) {
      throw fail(404, 'One or more comments were not found or are replies.');
    }
  }

  await Comment.updateMany(
    {
      showInDonationPage: true,
      _id: { $nin: orderedIds },
    },
    {
      $set: {
        showInDonationPage: false,
        donationPageOrder: null,
      },
    }
  );

  if (orderedIds.length > 0) {
    await Comment.bulkWrite(
      orderedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              showInDonationPage: true,
              donationPageOrder: index + 1,
            },
          },
        },
      }))
    );
  }

  return getDonationPageCommentItems();
}

async function updateDonationPageComment(id, updates) {
  const comment = await Comment.findById(id);
  if (!comment) {
    throw fail(404, 'Comment not found.');
  }

  const isEnabling = updates.showInDonationPage === true;
  const isSettingOrder = Number.isInteger(updates.donationPageOrder);
  if (comment.parentCommentId && (isEnabling || isSettingOrder)) {
    throw fail(400, 'Replies cannot be featured on the donation page.');
  }

  Object.assign(comment, updates);
  await comment.save();

  return normalizeAdminCommentRecord(comment);
}

async function createAdminComment(input, admin) {
  if (!(await commentTargetExists(input.targetType, input.targetId))) {
    throw fail(404, 'Comment target not found.');
  }

  await assertCommentTargetAccess(
    admin,
    input.targetType,
    input.targetId,
    'You do not have access to this comment target project.'
  );

  let normalizedParentCommentId = null;
  if (
    input.parentCommentId !== undefined &&
    input.parentCommentId !== null &&
    input.parentCommentId !== ''
  ) {
    normalizedParentCommentId = await resolveParentCommentId(
      input.parentCommentId,
      input.targetType,
      input.targetId
    );
  }

  return Comment.create({
    text: input.text,
    username: input.username,
    targetType: input.targetType,
    targetId: input.targetId,
    parentCommentId: normalizedParentCommentId,
  });
}

async function listAdminComments(parsedQuery, admin) {
  const filter = { ...parsedQuery.filter };

  if (parsedQuery.username) {
    filter.username = {
      $regex: escapeRegex(parsedQuery.username),
      $options: 'i',
    };
  }

  if (admin?.role !== ADMIN_ROLES.SUPER_ADMIN) {
    const allowedProjectIds = getAllowedChannelProjectIds(admin);
    const hasDonationRead = hasPermission(admin, 'donation', 'read');
    const hasChannelScope = Array.isArray(allowedProjectIds) && allowedProjectIds.length > 0;

    if (!hasChannelScope && !hasDonationRead) {
      return [];
    }

    if (!hasChannelScope && hasDonationRead) {
      if (filter.targetType === 'blog' || filter.targetType === 'general') {
        return [];
      }

      if (!filter.targetType) {
        filter.targetType = 'projectDonation';
      } else if (filter.targetType !== 'projectDonation') {
        return [];
      }
    }

    if (hasChannelScope) {
      const [videos, breakdowns] = await Promise.all([
        Video.find({ projectId: { $in: allowedProjectIds } }).select('_id'),
        ProjectBreakDown.find({
          projectId: { $in: allowedProjectIds },
        }).select('_id'),
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
          return [];
        }
      } else if (filter.targetType === 'blog' || filter.targetType === 'general') {
        return [];
      } else {
        const orConditions = [
          { targetType: 'video', targetId: { $in: allowedVideoIds } },
          { targetType: 'breakdown', targetId: { $in: allowedBreakdownIds } },
          { targetType: 'project', targetId: { $in: allowedProjectIds } },
        ];

        if (hasDonationRead) {
          orConditions.push({ targetType: 'projectDonation' });
        }

        filter.$or = orConditions;
      }
    }
  }

  return Comment.find(filter).sort({ createdAt: -1 });
}

async function getAdminCommentThread(input, admin) {
  if (!(await commentTargetExists(input.targetType, input.targetId))) {
    throw fail(404, 'Comment target not found.');
  }

  await assertCommentTargetAccess(
    admin,
    input.targetType,
    input.targetId,
    'You do not have access to this comment target.'
  );

  const parsedCursor = parseAdminCommentCursor(input.cursor);
  if (input.cursor && !parsedCursor) {
    throw fail(400, 'Invalid comments cursor.');
  }

  const rootFilter = {
    targetType: input.targetType,
    targetId: input.targetId,
    parentCommentId: null,
    ...buildOlderAdminRootCommentCursorFilter(parsedCursor),
  };

  const rootComments = await Comment.find(rootFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(input.limit + 1);

  const hasMore = rootComments.length > input.limit;
  const pageRoots = hasMore ? rootComments.slice(0, input.limit) : rootComments;
  const rootIds = pageRoots.map((comment) => comment._id);
  const replies = rootIds.length > 0 ? await fetchCommentDescendants(rootIds) : [];
  const nextCursor =
    hasMore && pageRoots.length > 0
      ? encodeAdminCommentCursor(pageRoots[pageRoots.length - 1])
      : null;

  return {
    targetType: input.targetType,
    targetId: input.targetId,
    thread: buildAdminCommentThread([...pageRoots, ...replies]),
    hasMore,
    nextCursor,
  };
}

async function updateAdminComment(input, admin) {
  const comment = await Comment.findById(input.id);
  if (!comment) {
    throw fail(404, 'Comment not found.');
  }

  await assertCommentTargetAccess(
    admin,
    comment.targetType,
    comment.targetId,
    'You do not have access to this comment target project.'
  );

  const nextText = input.text !== undefined ? input.text : comment.text;
  const nextUsername = input.username !== undefined ? input.username : comment.username;
  const nextTargetType = input.hasTargetType ? input.targetType : comment.targetType;
  const nextTargetId = input.hasTargetId
    ? normalizeCommentTargetId(nextTargetType, input.targetId)
    : comment.targetId;

  if (!nextText || !nextUsername) {
    throw fail(400, 'Text and username cannot be empty.');
  }

  if (!isValidCommentTargetType(nextTargetType)) {
    throw fail(400, 'Invalid target type.');
  }

  if (commentTargetRequiresId(nextTargetType) && !nextTargetId) {
    throw fail(400, 'Target id is required for this target type.');
  }

  if (!(await commentTargetExists(nextTargetType, nextTargetId))) {
    throw fail(404, 'Comment target not found.');
  }

  await assertCommentTargetAccess(
    admin,
    nextTargetType,
    nextTargetId,
    'You do not have access to this comment target project.'
  );

  let nextParentCommentId = comment.parentCommentId;
  if (input.hasParentCommentId) {
    const normalizedParentValue =
      input.parentCommentId === '' || input.parentCommentId === null
        ? null
        : input.parentCommentId;

    if (normalizedParentValue === null) {
      nextParentCommentId = null;
    } else {
      nextParentCommentId = await resolveParentCommentId(
        normalizedParentValue,
        nextTargetType,
        nextTargetId,
        input.id
      );
    }
  } else if (
    comment.parentCommentId &&
    (input.hasTargetType || input.hasTargetId) &&
    (await Comment.findById(comment.parentCommentId)
      .select('_id targetType targetId')
      .then(
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
    throw fail(
      400,
      'Changing target type or target id requires updating parent comment id as well.'
    );
  }

  comment.text = nextText;
  comment.username = nextUsername;
  comment.targetType = nextTargetType;
  comment.targetId = nextTargetId;
  comment.parentCommentId = nextParentCommentId;
  await comment.save();

  return comment;
}

async function deleteAdminComment(id, admin) {
  const comment = await Comment.findById(id);
  if (!comment) {
    throw fail(404, 'Comment not found.');
  }

  await assertCommentTargetAccess(
    admin,
    comment.targetType,
    comment.targetId,
    'You do not have access to this comment target project.'
  );

  await comment.deleteOne();
  await Comment.updateMany(
    { parentCommentId: id },
    {
      $set: {
        parentCommentId: null,
      },
    }
  );
}

async function listFeaturedPublicComments(limit) {
  const featuredComments = await Comment.find({
    showInDonationPage: true,
    parentCommentId: null,
  }).sort({ createdAt: -1, _id: -1 });

  const orderValue = (comment) =>
    Number.isInteger(comment.donationPageOrder) && comment.donationPageOrder > 0
      ? comment.donationPageOrder
      : Number.MAX_SAFE_INTEGER;

  return featuredComments
    .sort((first, second) => orderValue(first) - orderValue(second))
    .slice(0, limit);
}

async function listPublicComments(input) {
  if (!(await commentTargetExists(input.targetType, input.targetId))) {
    throw fail(404, 'Comment target not found.');
  }

  const rootFilter = {
    targetType: input.targetType,
    targetId: input.targetId,
    parentCommentId: null,
  };

  const totalRoots = await Comment.countDocuments(rootFilter);
  const totalPages = totalRoots === 0 ? 1 : Math.ceil(totalRoots / input.limit);
  const safePage = Math.min(input.page, totalPages);
  const skip = (safePage - 1) * input.limit;
  const rootComments = await Comment.find(rootFilter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(input.limit);
  const rootIds = rootComments.map((comment) => comment._id);
  const replies = rootIds.length > 0 ? await fetchCommentDescendants(rootIds) : [];

  return {
    comments: [...rootComments, ...replies],
    page: safePage,
    limit: input.limit,
    totalRoots,
    totalPages,
  };
}

async function createPublicComment(user, input) {
  if (!(await commentTargetExists(input.targetType, input.targetId))) {
    throw fail(404, 'Comment target not found.');
  }

  let normalizedParentCommentId = null;
  if (
    input.parentCommentId !== undefined &&
    input.parentCommentId !== null &&
    input.parentCommentId !== ''
  ) {
    normalizedParentCommentId = await resolveParentCommentId(
      input.parentCommentId,
      input.targetType,
      input.targetId
    );
  }

  const authorPresentation = user.getCommentAuthorPresentation();
  return Comment.create({
    userId: user._id,
    text: input.text,
    username: authorPresentation.username,
    avatar: authorPresentation.avatar,
    targetType: input.targetType,
    targetId: input.targetId,
    parentCommentId: normalizedParentCommentId,
  });
}

module.exports = {
  getDonationPageCommentItems,
  reorderDonationPageComments,
  updateDonationPageComment,
  createAdminComment,
  listAdminComments,
  getAdminCommentThread,
  updateAdminComment,
  deleteAdminComment,
  listFeaturedPublicComments,
  listPublicComments,
  createPublicComment,
};

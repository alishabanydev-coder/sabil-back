const mongoose = require('mongoose');
const {
  parseOptionalBoolean,
  parseOptionalHomepageOrder,
} = require('../../lib/parse');

const COMMENT_TARGET_TYPES = [
  'video',
  'blog',
  'breakdown',
  'general',
  'project',
  'projectDonation',
];

function normalizeAdminCommentTargetType(value) {
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

function normalizePublicCommentTargetType(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function parseOrderedCommentIds(body) {
  const orderedIds = body?.orderedIds;

  if (!Array.isArray(orderedIds)) {
    return { ok: false, message: 'orderedIds must be an array of comment ids.' };
  }

  const hasInvalidId = orderedIds.some(
    (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
  );
  if (hasInvalidId) {
    return { ok: false, message: 'orderedIds must contain valid comment ids.' };
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, message: 'orderedIds must not contain duplicates.' };
  }

  return { ok: true, value: orderedIds };
}

function parseDonationPageCommentPatch(body = {}) {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'showInDonationPage')) {
    const parsedShowInDonationPage = parseOptionalBoolean(body.showInDonationPage);
    if (parsedShowInDonationPage === undefined) {
      return { ok: false, message: 'showInDonationPage must be a boolean.' };
    }
    updates.showInDonationPage = parsedShowInDonationPage;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'donationPageOrder')) {
    const parsedDonationPageOrder = parseOptionalHomepageOrder(body.donationPageOrder);
    if (parsedDonationPageOrder === undefined) {
      return {
        ok: false,
        message: 'donationPageOrder must be a positive integer or null.',
      };
    }
    updates.donationPageOrder = parsedDonationPageOrder;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: 'Nothing to update.' };
  }

  if (updates.showInDonationPage === false) {
    updates.donationPageOrder = null;
  }

  return { ok: true, value: updates };
}

function parseCommentId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'Invalid comment id.' };
  }

  return { ok: true, value: id };
}

function parseCreateAdminComment(body = {}) {
  const normalizedText = typeof body.text === 'string' ? body.text.trim() : '';
  const normalizedUsername = typeof body.username === 'string' ? body.username.trim() : '';
  const normalizedTargetType = normalizeAdminCommentTargetType(body.targetType);
  const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, body.targetId);

  if (!normalizedText || !normalizedUsername || !isValidCommentTargetType(normalizedTargetType)) {
    return {
      ok: false,
      message: 'Text, username, and a valid target type are required.',
    };
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return { ok: false, message: 'Target id is required for this target type.' };
  }

  return {
    ok: true,
    value: {
      text: normalizedText,
      username: normalizedUsername,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      parentCommentId: body.parentCommentId,
    },
  };
}

function parseAdminCommentListQuery(query = {}) {
  const filter = {};

  if (typeof query.targetType === 'string' && query.targetType.trim()) {
    const normalizedTargetType = normalizeAdminCommentTargetType(query.targetType);
    if (!isValidCommentTargetType(normalizedTargetType)) {
      return { ok: false, message: 'Invalid target type filter.' };
    }
    filter.targetType = normalizedTargetType;
  }

  const username =
    typeof query.username === 'string' && query.username.trim()
      ? query.username.trim().slice(0, 80)
      : '';

  return { ok: true, value: { filter, username } };
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

function parseAdminCommentThreadQuery(query = {}) {
  const normalizedTargetType = normalizeAdminCommentTargetType(query.targetType);
  const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, query.targetId);

  if (!isValidCommentTargetType(normalizedTargetType)) {
    return { ok: false, message: 'A valid target type is required.' };
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return { ok: false, message: 'Target id is required for this target type.' };
  }

  return {
    ok: true,
    value: {
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      limit: parseAdminCommentPageLimit(query.limit),
      cursor: query.cursor,
    },
  };
}

function parseUpdateAdminComment(id, body = {}) {
  const parsedId = parseCommentId(id);
  if (!parsedId.ok) {
    return parsedId;
  }

  const hasText = typeof body.text === 'string';
  const hasUsername = typeof body.username === 'string';
  const hasTargetType = typeof body.targetType === 'string';
  const hasTargetId = Object.prototype.hasOwnProperty.call(body, 'targetId');
  const hasParentCommentId = Object.prototype.hasOwnProperty.call(body, 'parentCommentId');

  return {
    ok: true,
    value: {
      id,
      text: hasText ? body.text.trim() : undefined,
      username: hasUsername ? body.username.trim() : undefined,
      targetType: hasTargetType ? normalizeAdminCommentTargetType(body.targetType) : undefined,
      hasTargetType,
      targetId: hasTargetId ? body.targetId : undefined,
      hasTargetId,
      parentCommentId: hasParentCommentId ? body.parentCommentId : undefined,
      hasParentCommentId,
    },
  };
}

function parseCommentPageLimit(value, defaultLimit, maxLimit) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

function parseCommentPageNumber(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function parsePublicCommentListQuery(query = {}) {
  const normalizedTargetType = normalizePublicCommentTargetType(query.targetType);
  const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, query.targetId);
  const pageLimit = parseCommentPageLimit(query.limit, 10, 50);
  const pageNumber = parseCommentPageNumber(query.page);

  if (!isValidCommentTargetType(normalizedTargetType)) {
    return { ok: false, message: 'A valid target type is required.' };
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return { ok: false, message: 'Target id is required for this target type.' };
  }

  return {
    ok: true,
    value: {
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      limit: pageLimit,
      page: pageNumber,
    },
  };
}

function parseCreatePublicComment(body = {}) {
  const normalizedText = typeof body.text === 'string' ? body.text.trim() : '';
  const normalizedTargetType = normalizePublicCommentTargetType(body.targetType);
  const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, body.targetId);

  if (!normalizedText || !isValidCommentTargetType(normalizedTargetType)) {
    return { ok: false, message: 'Text and a valid target type are required.' };
  }

  if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
    return { ok: false, message: 'Target id is required for this target type.' };
  }

  return {
    ok: true,
    value: {
      text: normalizedText,
      targetType: normalizedTargetType,
      targetId: normalizedTargetId,
      parentCommentId: body.parentCommentId,
    },
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  normalizeAdminCommentTargetType,
  isValidCommentTargetType,
  commentTargetRequiresId,
  normalizeCommentTargetId,
  parseOrderedCommentIds,
  parseDonationPageCommentPatch,
  parseCommentId,
  parseCreateAdminComment,
  parseAdminCommentListQuery,
  parseAdminCommentThreadQuery,
  parseUpdateAdminComment,
  parseCommentPageLimit,
  parsePublicCommentListQuery,
  parseCreatePublicComment,
  escapeRegex,
};

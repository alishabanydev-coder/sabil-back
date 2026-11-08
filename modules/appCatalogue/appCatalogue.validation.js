const mongoose = require('mongoose');

function readJsonArray(value) {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    return value;
  }

  return null;
}

function validateIdList(ids, fieldName) {
  const normalizedIds = ids.map((id) => (typeof id === 'string' ? id.trim() : ''));
  if (normalizedIds.some((id) => !id || !mongoose.Types.ObjectId.isValid(id))) {
    return { ok: false, message: `${fieldName} must contain valid ids.` };
  }

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    return { ok: false, message: `${fieldName} must not contain duplicates.` };
  }

  return { ok: true, ids: normalizedIds };
}

function parseOrderedObjectIdArray(value, fieldName) {
  const parsedValue = readJsonArray(value);
  if (!Array.isArray(parsedValue)) {
    return { ok: false, message: `${fieldName} must be an array of ids.` };
  }

  return validateIdList(parsedValue, fieldName);
}

function parseHomeVideosUpdate(body = {}) {
  const hasMode = Object.prototype.hasOwnProperty.call(body, 'mode');
  const hasManualVideoIds = Object.prototype.hasOwnProperty.call(body, 'manualVideoIds');
  const normalizedMode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';

  if (hasMode && !['random', 'manual'].includes(normalizedMode)) {
    return { ok: false, message: 'mode must be either random or manual.' };
  }

  const parsedManualVideoIds = hasManualVideoIds ? readJsonArray(body.manualVideoIds) : null;
  if (hasManualVideoIds && !Array.isArray(parsedManualVideoIds)) {
    return { ok: false, message: 'manualVideoIds must be an array of video ids.' };
  }

  const validated = hasManualVideoIds
    ? validateIdList(parsedManualVideoIds, 'manualVideoIds')
    : { ok: true, ids: [] };
  if (!validated.ok) {
    return {
      ok: false,
      message: validated.message.replace('valid ids.', 'valid video ids.'),
    };
  }

  return {
    ok: true,
    value: {
      hasMode,
      mode: normalizedMode,
      hasManualVideoIds,
      manualVideoIds: validated.ids,
    },
  };
}

function parseNavigationUpdate(body = {}) {
  const rawProjectIds = body.projectIds;
  const parsedProjectIds =
    typeof rawProjectIds === 'string' || Array.isArray(rawProjectIds)
      ? readJsonArray(rawProjectIds)
      : [];

  if (!Array.isArray(parsedProjectIds)) {
    return { ok: false, message: 'projectIds must be an array of project ids.' };
  }

  const validated = validateIdList(parsedProjectIds, 'projectIds');
  if (!validated.ok) {
    return {
      ok: false,
      message: validated.message.replace('valid ids.', 'valid project ids.'),
    };
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'homeImage') &&
    typeof body.homeImage !== 'undefined' &&
    body.homeImage !== null &&
    typeof body.homeImage !== 'string'
  ) {
    return { ok: false, message: 'homeImage must be a string.' };
  }

  return {
    ok: true,
    value: {
      projectIds: validated.ids,
      hasHomeImage: Object.prototype.hasOwnProperty.call(body, 'homeImage'),
      homeImage: body.homeImage,
    },
  };
}

function parseProjectId(projectId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return { ok: false, message: 'Invalid project id.' };
  }

  return { ok: true, value: projectId };
}

module.exports = {
  parseOrderedObjectIdArray,
  parseHomeVideosUpdate,
  parseNavigationUpdate,
  parseProjectId,
};

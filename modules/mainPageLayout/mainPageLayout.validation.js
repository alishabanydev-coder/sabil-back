const mongoose = require('mongoose');
const {
  parseOptionalBoolean,
  parseOptionalHomepageOrder,
} = require('../../lib/parse');

const MAIN_PAGE_LAYOUT_SECTIONS = [
  'banner',
  'projects',
  'catalogues',
  'breakdown',
  'video',
  'comment',
  'blog',
];

const INVALID_SECTION_MESSAGE =
  'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.';

function parseMainPageLayoutSection(section) {
  const normalized = typeof section === 'string' ? section.trim().toLowerCase() : '';
  if (!MAIN_PAGE_LAYOUT_SECTIONS.includes(normalized)) {
    return { ok: false, message: INVALID_SECTION_MESSAGE };
  }

  return { ok: true, value: normalized };
}

function parseOrderedIds(orderedIds) {
  if (!Array.isArray(orderedIds)) {
    return { ok: false, message: 'orderedIds must be an array of item ids.' };
  }

  const hasInvalidId = orderedIds.some(
    (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
  );
  if (hasInvalidId) {
    return { ok: false, message: 'orderedIds must contain valid item ids.' };
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, message: 'orderedIds must not contain duplicates.' };
  }

  return { ok: true, value: orderedIds };
}

function parseCatalogueReorder(body = {}) {
  const parsedIds = parseOrderedIds(body.orderedIds);
  if (!parsedIds.ok) {
    return parsedIds;
  }

  if (typeof body.projectId !== 'string' || !mongoose.Types.ObjectId.isValid(body.projectId)) {
    return { ok: false, message: 'projectId must be a valid project id.' };
  }

  return {
    ok: true,
    value: {
      orderedIds: parsedIds.value,
      projectId: body.projectId,
    },
  };
}

function parseLayoutItemId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'Invalid item id.' };
  }

  return { ok: true, value: id };
}

function parseLayoutItemPatch(body = {}) {
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'showInHomepage')) {
    const parsedShowInHomepage = parseOptionalBoolean(body.showInHomepage);
    if (parsedShowInHomepage === undefined) {
      return { ok: false, message: 'showInHomepage must be a boolean.' };
    }
    updates.showInHomepage = parsedShowInHomepage;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'homepageOrder')) {
    const parsedHomepageOrder = parseOptionalHomepageOrder(body.homepageOrder);
    if (parsedHomepageOrder === undefined) {
      return { ok: false, message: 'homepageOrder must be a positive integer or null.' };
    }
    updates.homepageOrder = parsedHomepageOrder;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: 'Nothing to update.' };
  }

  if (updates.showInHomepage === false) {
    updates.homepageOrder = null;
  }

  return { ok: true, value: updates };
}

module.exports = {
  parseCatalogueReorder,
  parseLayoutItemId,
  parseLayoutItemPatch,
  parseMainPageLayoutSection,
  parseOrderedIds,
};

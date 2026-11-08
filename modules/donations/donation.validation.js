const mongoose = require('mongoose');

function slugifyDonationTitle(title) {
  const slug = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  return slug || `donation-${Date.now()}`;
}

function normalizeStoredAssetPath(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.startsWith('/uploads/') ? parsed.pathname : trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseJsonField(rawValue, fieldName) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { ok: true, value: [] };
  }

  if (typeof rawValue === 'string') {
    try {
      return { ok: true, value: JSON.parse(rawValue) };
    } catch {
      return { ok: false, message: `Invalid ${fieldName} payload.` };
    }
  }

  return { ok: true, value: rawValue };
}

function parseSectionsField(rawSections, uploadedSectionImages) {
  const parsed = parseJsonField(rawSections, 'sections');
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, message: 'Sections must be an array.' };
  }

  const usedImageFileIndices = [];
  const sections = [];

  for (const item of parsed.value) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!id) {
      return { ok: false, message: 'Each section requires an id.' };
    }

    const images = [];
    const rawImages = Array.isArray(item?.images) ? item.images : [];

    for (const imageItem of rawImages) {
      if (typeof imageItem === 'string') {
        const normalized = normalizeStoredAssetPath(imageItem);
        if (normalized) {
          images.push(normalized);
        }
        continue;
      }

      if (imageItem && typeof imageItem === 'object' && Number.isInteger(imageItem.imageFileIndex)) {
        const uploadedFile = uploadedSectionImages[imageItem.imageFileIndex] || null;
        if (!uploadedFile) {
          return {
            ok: false,
            message: 'Section image upload is missing for one or more sections.',
          };
        }

        usedImageFileIndices.push(imageItem.imageFileIndex);
        images.push(`/uploads/donation-section-images/${uploadedFile.filename}`);
      }
    }

    sections.push({
      id,
      header: typeof item?.header === 'string' && item.header.trim() ? item.header.trim() : null,
      text: typeof item?.text === 'string' && item.text.trim() ? item.text.trim() : null,
      images,
      order: typeof item?.order === 'number' && item.order >= 0 ? item.order : 0,
    });
  }

  return { ok: true, sections, usedImageFileIndices };
}

function mapOrInvalid(items, mapper) {
  try {
    return { ok: true, value: items.map(mapper) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function parseFaqField(rawFaq) {
  const parsed = parseJsonField(rawFaq, 'faq');
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, message: 'FAQ must be an array.' };
  }

  const mapped = mapOrInvalid(parsed.value, (item, index) => {
    const header = typeof item?.header === 'string' ? item.header.trim() : '';
    const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';

    if (!header) {
      throw new Error(`FAQ item ${index + 1} requires a header.`);
    }

    return {
      header,
      summary: summary || '-',
      order: typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
    };
  });

  if (!mapped.ok) {
    return mapped;
  }

  return { ok: true, faq: mapped.value };
}

function parseStepsField(rawSteps) {
  const parsed = parseJsonField(rawSteps, 'steps');
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, message: 'Steps must be an array.' };
  }

  const allowedStatuses = new Set(['upcoming', 'in_progress', 'completed', 'skipped']);
  const mapped = mapOrInvalid(parsed.value, (item, index) => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const status = allowedStatuses.has(item?.status) ? item.status : 'upcoming';
    const spentAmount = Number(item?.spentAmount ?? 0);

    if (!id) {
      throw new Error(`Step ${index + 1} requires an id.`);
    }

    if (!label) {
      throw new Error(`Step ${index + 1} requires a label.`);
    }

    if (!Number.isFinite(spentAmount) || spentAmount < 0) {
      throw new Error(`Step ${index + 1} spent amount must be non-negative.`);
    }

    return {
      id,
      label,
      status,
      spentAmount: status === 'upcoming' ? 0 : spentAmount,
      order: typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
    };
  });

  if (!mapped.ok) {
    return mapped;
  }

  return { ok: true, steps: mapped.value };
}

function parseStaffField(rawStaff, uploadedStaffPhotos = []) {
  const parsed = parseJsonField(rawStaff, 'staff');
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, message: 'Staff must be an array.' };
  }

  const usedPhotoFileIndices = [];
  const mapped = mapOrInvalid(parsed.value, (item, index) => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const role = typeof item?.role === 'string' ? item.role.trim() : '';
    const bio = typeof item?.bio === 'string' && item.bio.trim() ? item.bio.trim() : null;
    let photo = null;

    if (!id) {
      throw new Error(`Staff member ${index + 1} requires an id.`);
    }

    if (!name) {
      throw new Error(`Staff member ${index + 1} requires a name.`);
    }

    if (!role) {
      throw new Error(`Staff member ${index + 1} requires a role.`);
    }

    if (Number.isInteger(item?.photoFileIndex)) {
      const uploadedFile = uploadedStaffPhotos[item.photoFileIndex] || null;
      if (!uploadedFile) {
        throw new Error(`Staff member ${index + 1} photo upload is missing.`);
      }

      usedPhotoFileIndices.push(item.photoFileIndex);
      photo = `/uploads/donation-staff-photos/${uploadedFile.filename}`;
    } else if (item?.photo !== undefined && item?.photo !== null && item?.photo !== '') {
      const normalized = normalizeStoredAssetPath(item.photo);
      if (!normalized.startsWith('/uploads/')) {
        throw new Error(`Staff member ${index + 1} photo must be an uploaded image file.`);
      }
      photo = normalized;
    }

    return {
      id,
      name,
      role,
      photo,
      bio,
      order: typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
    };
  });

  if (!mapped.ok) {
    return mapped;
  }

  return { ok: true, staff: mapped.value, usedPhotoFileIndices };
}

function parseUpdateRefsField(rawUpdateRefs) {
  const parsed = parseJsonField(rawUpdateRefs, 'updateRefs');
  if (!parsed.ok) {
    return parsed;
  }

  if (!Array.isArray(parsed.value)) {
    return { ok: false, message: 'updateRefs must be an array.' };
  }

  const updateRefs = [];

  for (const [index, item] of parsed.value.entries()) {
    const refType = item?.refType;
    const refId = item?.refId;

    if (refType !== 'Blog' && refType !== 'BreakDown') {
      return { ok: false, message: `Update ref ${index + 1} has an invalid refType.` };
    }

    if (!mongoose.Types.ObjectId.isValid(refId)) {
      return { ok: false, message: `Update ref ${index + 1} has an invalid refId.` };
    }

    updateRefs.push({
      refType,
      refId,
      order: typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
    });
  }

  return { ok: true, updateRefs };
}

function parseShowOnDonationPage(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (value === false || value === 'false' || value === '0') {
    return false;
  }

  return true;
}

function parseDonationScalarFields(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const shortDescription =
    typeof body.shortDescription === 'string' ? body.shortDescription.trim() : '';
  const goalAmount = Number(body.goalAmount);
  const raisedAmount =
    body.raisedAmount === undefined || body.raisedAmount === '' ? 0 : Number(body.raisedAmount);
  const donorCount =
    body.donorCount === undefined || body.donorCount === '' ? 0 : Number(body.donorCount);
  const currency = body.currency === 'INR' ? 'INR' : 'USD';
  const status =
    body.status === 'finished' || body.status === 'paused' ? body.status : 'ongoing';
  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate =
    body.endDate === undefined || body.endDate === null || body.endDate === ''
      ? null
      : new Date(body.endDate);
  const projectId =
    body.projectId && mongoose.Types.ObjectId.isValid(String(body.projectId))
      ? body.projectId
      : null;
  const listOrderRaw = body.listOrder;
  const listOrder =
    listOrderRaw === undefined || listOrderRaw === null || listOrderRaw === ''
      ? null
      : Number(listOrderRaw);
  const videoUrl =
    typeof body.videoUrl === 'string' && body.videoUrl.trim() ? body.videoUrl.trim() : null;
  const slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase()
      : slugifyDonationTitle(title);

  return {
    title,
    slug,
    shortDescription,
    goalAmount,
    raisedAmount,
    donorCount,
    currency,
    status,
    startDate,
    endDate,
    projectId,
    showOnDonationPage: parseShowOnDonationPage(body.showOnDonationPage),
    listOrder,
    videoUrl,
  };
}

function validateDonationScalars(fields, { requirePosterPath }) {
  if (!fields.title) {
    return 'Title is required.';
  }

  if (!Number.isFinite(fields.goalAmount) || fields.goalAmount < 0) {
    return 'Goal amount must be a valid non-negative number.';
  }

  if (!Number.isFinite(fields.raisedAmount) || fields.raisedAmount < 0) {
    return 'Raised amount must be a valid non-negative number.';
  }

  if (!Number.isFinite(fields.donorCount) || fields.donorCount < 0) {
    return 'Donor count must be a valid non-negative number.';
  }

  if (!Number.isInteger(fields.donorCount)) {
    return 'Donor count must be a whole number.';
  }

  if (!fields.startDate || Number.isNaN(fields.startDate.getTime())) {
    return 'Start date is required.';
  }

  if (
    fields.endDate &&
    (Number.isNaN(fields.endDate.getTime()) ||
      fields.endDate.getTime() < fields.startDate.getTime())
  ) {
    return 'End date must be after the start date.';
  }

  if (
    fields.listOrder !== null &&
    (!Number.isInteger(fields.listOrder) || fields.listOrder < 1)
  ) {
    return 'listOrder must be a positive integer when provided.';
  }

  if (!requirePosterPath) {
    return 'Poster image is required.';
  }

  return '';
}

function parseDonationProjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message: 'Invalid donation project id.' };
  }

  return { ok: true, value: id };
}

module.exports = {
  slugifyDonationTitle,
  normalizeStoredAssetPath,
  parseSectionsField,
  parseFaqField,
  parseStepsField,
  parseStaffField,
  parseUpdateRefsField,
  parseDonationScalarFields,
  validateDonationScalars,
  parseDonationProjectId,
};

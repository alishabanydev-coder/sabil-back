const mongoose = require('mongoose');

const DONATION_CURRENCIES = ['USD', 'INR'];
const DONATION_SOURCES = ['manual', 'patreon', 'whatsapp'];

function parseObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message };
  }

  return { ok: true, value: id };
}

function parseDonationAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function optionalTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseCreateSiteUser(body = {}) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password || !displayName) {
    return { ok: false, message: 'Email, password, and display name are required.' };
  }

  if (password.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }

  return {
    ok: true,
    value: {
      email,
      displayName,
      password,
      showAsAnonymousInDonations:
        typeof body.showAsAnonymousInDonations === 'boolean'
          ? body.showAsAnonymousInDonations
          : false,
    },
  };
}

function parseUserPatch(body = {}) {
  const value = {};

  if (typeof body.isActive === 'boolean') {
    value.isActive = body.isActive;
  }

  if (typeof body.showAsAnonymousInDonations === 'boolean') {
    value.showAsAnonymousInDonations = body.showAsAnonymousInDonations;
  }

  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    value.displayName = body.displayName.trim();
  }

  return { ok: true, value };
}

function parseDonationWrite(body = {}, { userIdFromRoute = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(body.donationProjectId)) {
    return { ok: false, message: 'A valid donation project id is required.' };
  }

  const amount = parseDonationAmount(body.amount);
  if (amount === null) {
    return { ok: false, message: 'A valid non-negative amount is required.' };
  }

  let userId;
  if (!userIdFromRoute && body.userId !== undefined && body.userId !== null && body.userId !== '') {
    if (!mongoose.Types.ObjectId.isValid(body.userId)) {
      return { ok: false, message: 'Invalid user id.' };
    }
    userId = body.userId;
  }

  return {
    ok: true,
    value: {
      donationProjectId: body.donationProjectId,
      amount,
      currency:
        typeof body.currency === 'string' && DONATION_CURRENCIES.includes(body.currency)
          ? body.currency
          : 'USD',
      source:
        typeof body.source === 'string' && DONATION_SOURCES.includes(body.source)
          ? body.source
          : 'manual',
      externalDonorName: optionalTrimmedString(body.externalDonorName),
      notes: optionalTrimmedString(body.notes),
      userId,
    },
  };
}

function parseDonationPatch(body = {}) {
  const value = {};

  if (body.userId !== undefined) {
    if (body.userId === null || body.userId === '') {
      value.userId = null;
    } else if (!mongoose.Types.ObjectId.isValid(body.userId)) {
      return { ok: false, message: 'Invalid user id.' };
    } else {
      value.userId = body.userId;
    }
  }

  if (body.amount !== undefined) {
    const amount = parseDonationAmount(body.amount);
    if (amount === null) {
      return { ok: false, message: 'A valid non-negative amount is required.' };
    }
    value.amount = amount;
  }

  if (typeof body.currency === 'string' && DONATION_CURRENCIES.includes(body.currency)) {
    value.currency = body.currency;
  }

  if (typeof body.source === 'string' && DONATION_SOURCES.includes(body.source)) {
    value.source = body.source;
  }

  if (body.externalDonorName !== undefined) {
    value.externalDonorName = optionalTrimmedString(body.externalDonorName);
  }

  if (body.notes !== undefined) {
    value.notes = optionalTrimmedString(body.notes);
  }

  return { ok: true, value };
}

module.exports = {
  parseCreateSiteUser,
  parseDonationPatch,
  parseDonationWrite,
  parseObjectId,
  parseUserPatch,
};

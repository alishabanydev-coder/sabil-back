const User = require('../../models/user.model');
const Donation = require('../../models/donation.model');
const DonationProject = require('../../models/donationProject.model');
const { fail } = require('../../lib/httpError');

function normalizeDonationProjectRef(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    const id =
      typeof value._id === 'string' ? value._id : value._id?.toString?.() || null;

    if (value.title) {
      return {
        _id: id,
        title: value.title,
        slug: value.slug || null,
        currency: value.currency || null,
      };
    }

    return id;
  }

  return value.toString?.() || null;
}

function normalizeDonationRecord(donation) {
  if (!donation) {
    return donation;
  }

  const plain = donation.toObject ? donation.toObject() : donation;

  return {
    ...plain,
    _id: typeof plain._id === 'string' ? plain._id : plain._id?.toString?.() || '',
    userId:
      plain.userId && typeof plain.userId === 'object'
        ? plain.userId._id?.toString?.() || plain.userId.toString()
        : plain.userId?.toString?.() || null,
    donationProjectId: normalizeDonationProjectRef(plain.donationProjectId),
  };
}

function normalizeUserRecord(user) {
  if (!user) {
    return user;
  }

  const plain = user.toObject ? user.toObject() : user;

  return {
    _id: typeof plain._id === 'string' ? plain._id : plain._id?.toString?.() || '',
    email: plain.email,
    displayName: plain.displayName,
    avatar: plain.avatar,
    showAsAnonymousInDonations: Boolean(plain.showAsAnonymousInDonations),
    isActive: Boolean(plain.isActive),
    emailVerified: Boolean(plain.emailVerified),
    lastLoginAt: plain.lastLoginAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

async function listSiteUsers() {
  const users = await User.find({ isActive: true }).sort({ createdAt: -1 });
  const userIds = users.map((user) => user._id);
  const donationStats = await Donation.aggregate([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        donationCount: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);
  const donatedProjectsByUser = await Donation.aggregate([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        donationProjectIds: { $addToSet: '$donationProjectId' },
      },
    },
  ]);
  const allDonationProjectIds = [
    ...new Set(donatedProjectsByUser.flatMap((entry) => entry.donationProjectIds)),
  ];
  const donationProjects = allDonationProjectIds.length
    ? await DonationProject.find({ _id: { $in: allDonationProjectIds } }).select('title').lean()
    : [];
  const donationProjectTitleById = donationProjects.reduce((accumulator, project) => {
    accumulator[project._id.toString()] = project.title;
    return accumulator;
  }, {});
  const statsByUserId = donationStats.reduce((accumulator, entry) => {
    accumulator[entry._id.toString()] = {
      donationCount: entry.donationCount,
      totalAmount: entry.totalAmount,
    };
    return accumulator;
  }, {});
  const donatedProjectsByUserId = donatedProjectsByUser.reduce((accumulator, entry) => {
    accumulator[entry._id.toString()] = entry.donationProjectIds
      .map((projectId) => donationProjectTitleById[projectId.toString()])
      .filter(Boolean);
    return accumulator;
  }, {});

  return users.map((user) => {
    const stats = statsByUserId[user._id.toString()] || {
      donationCount: 0,
      totalAmount: 0,
    };

    return {
      ...normalizeUserRecord(user),
      donationCount: stats.donationCount,
      totalAmount: stats.totalAmount,
      donatedProjects: donatedProjectsByUserId[user._id.toString()] || [],
    };
  });
}

async function createSiteUser(input) {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    throw fail(409, 'An account with this email already exists.');
  }

  const passwordHash = await User.hashPassword(input.password);
  const user = await User.create({
    email: input.email,
    passwordHash,
    displayName: input.displayName,
    showAsAnonymousInDonations: input.showAsAnonymousInDonations,
  });

  return normalizeUserRecord(user);
}

async function getSiteUser(id) {
  const user = await User.findById(id);
  if (!user) {
    throw fail(404, 'User not found.');
  }

  const donations = await Donation.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .populate('donationProjectId', 'title slug currency');
  const totalAmount = donations.reduce((sum, donation) => sum + Number(donation.amount || 0), 0);

  return {
    user: normalizeUserRecord(user),
    donations: donations.map(normalizeDonationRecord),
    donationCount: donations.length,
    totalAmount,
  };
}

async function updateSiteUser(id, updates) {
  const user = await User.findById(id);
  if (!user) {
    throw fail(404, 'User not found.');
  }

  if (typeof updates.isActive === 'boolean') {
    user.isActive = updates.isActive;
  }

  if (typeof updates.showAsAnonymousInDonations === 'boolean') {
    user.showAsAnonymousInDonations = updates.showAsAnonymousInDonations;
  }

  if (typeof updates.displayName === 'string' && updates.displayName.trim()) {
    user.displayName = updates.displayName.trim();
  }

  await user.save();
  return normalizeUserRecord(user);
}

async function deactivateSiteUser(id) {
  const user = await User.findById(id);
  if (!user) {
    throw fail(404, 'User not found.');
  }

  if (!user.isActive) {
    throw fail(400, 'User is already deactivated.');
  }

  user.isActive = false;
  await user.save();
  return normalizeUserRecord(user);
}

async function listDonations(unlinked) {
  const filter = {};
  if (unlinked === 'true') {
    filter.userId = null;
  }

  const donations = await Donation.find(filter)
    .sort({ createdAt: -1 })
    .populate('donationProjectId', 'title slug currency')
    .populate('userId', 'email displayName avatar');

  return donations.map(normalizeDonationRecord);
}

async function assertDonationProject(donationProjectId) {
  const project = await DonationProject.findById(donationProjectId).select('_id');
  if (!project) {
    throw fail(404, 'Donation project not found.');
  }

  return project;
}

async function assertUser(userId) {
  const user = await User.findById(userId).select('_id');
  if (!user) {
    throw fail(404, 'User not found.');
  }

  return user;
}

async function requireSiteUser(id) {
  return assertUser(id);
}

async function createDonationRecord(input) {
  const project = await assertDonationProject(input.donationProjectId);
  let userId = null;

  if (input.userId) {
    const user = await assertUser(input.userId);
    userId = user._id;
  }

  const donation = await Donation.create({
    userId,
    donationProjectId: project._id,
    amount: input.amount,
    currency: input.currency,
    source: input.source,
    externalDonorName: input.externalDonorName,
    notes: input.notes,
  });

  return normalizeDonationRecord(donation);
}

async function updateDonation(id, updates) {
  const donation = await Donation.findById(id);
  if (!donation) {
    throw fail(404, 'Donation not found.');
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'userId')) {
    if (updates.userId === null) {
      donation.userId = null;
    } else {
      const linkedUser = await assertUser(updates.userId);
      donation.userId = linkedUser._id;
    }
  }

  if (updates.amount !== undefined) {
    donation.amount = updates.amount;
  }

  if (updates.currency) {
    donation.currency = updates.currency;
  }

  if (updates.source) {
    donation.source = updates.source;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'externalDonorName')) {
    donation.externalDonorName = updates.externalDonorName;
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'notes')) {
    donation.notes = updates.notes;
  }

  await donation.save();
  return normalizeDonationRecord(donation);
}

async function deleteDonation(id) {
  const donation = await Donation.findByIdAndDelete(id);
  if (!donation) {
    throw fail(404, 'Donation not found.');
  }
}

module.exports = {
  createDonationRecord,
  createSiteUser,
  deactivateSiteUser,
  deleteDonation,
  getSiteUser,
  listDonations,
  listSiteUsers,
  requireSiteUser,
  updateDonation,
  updateSiteUser,
};

function createUserAdminRoutes({
  router,
  mongoose,
  User,
  Donation,
  DonationProject,
  authenticateAdmin,
  requireTabPermission,
}) {
  const DONATION_CURRENCIES = ['USD', 'INR'];
  const DONATION_SOURCES = ['manual', 'patreon', 'whatsapp'];

  function normalizeDonationRecord(donation) {
    if (!donation) {
      return donation;
    }

    const plain = donation.toObject ? donation.toObject() : donation;

    return {
      ...plain,
      _id:
        typeof plain._id === 'string'
          ? plain._id
          : plain._id?.toString?.() || '',
      userId: plain.userId ? plain.userId.toString() : null,
      donationProjectId: plain.donationProjectId
        ? plain.donationProjectId.toString()
        : null,
    };
  }

  function normalizeUserRecord(user) {
    if (!user) {
      return user;
    }

    const plain = user.toObject ? user.toObject() : user;

    return {
      _id:
        typeof plain._id === 'string'
          ? plain._id
          : plain._id?.toString?.() || '',
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

  function parseDonationAmount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  router.get(
    '/site-users',
    authenticateAdmin,
    requireTabPermission('users', 'read'),
    async (_req, res) => {
      const users = await User.find({}).sort({ createdAt: -1 });
      const userIds = users.map((user) => user._id);

      const donationStats = await Donation.aggregate([
        {
          $match: {
            userId: { $in: userIds },
          },
        },
        {
          $group: {
            _id: '$userId',
            donationCount: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
          },
        },
      ]);

      const statsByUserId = donationStats.reduce((accumulator, entry) => {
        accumulator[entry._id.toString()] = {
          donationCount: entry.donationCount,
          totalAmount: entry.totalAmount,
        };
        return accumulator;
      }, {});

      return res.status(200).json({
        users: users.map((user) => {
          const stats = statsByUserId[user._id.toString()] || {
            donationCount: 0,
            totalAmount: 0,
          };

          return {
            ...normalizeUserRecord(user),
            donationCount: stats.donationCount,
            totalAmount: stats.totalAmount,
          };
        }),
      });
    }
  );

  router.get(
    '/site-users/:id',
    authenticateAdmin,
    requireTabPermission('users', 'read'),
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid user id.',
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      const donations = await Donation.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .populate('donationProjectId', 'title slug currency');

      const totalAmount = donations.reduce(
        (sum, donation) => sum + Number(donation.amount || 0),
        0
      );

      return res.status(200).json({
        user: normalizeUserRecord(user),
        donations: donations.map(normalizeDonationRecord),
        donationCount: donations.length,
        totalAmount,
      });
    }
  );

  router.patch(
    '/site-users/:id',
    authenticateAdmin,
    requireTabPermission('users', 'update'),
    async (req, res) => {
      const { id } = req.params;
      const { isActive, displayName, showAsAnonymousInDonations } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid user id.',
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      if (typeof isActive === 'boolean') {
        user.isActive = isActive;
      }

      if (typeof showAsAnonymousInDonations === 'boolean') {
        user.showAsAnonymousInDonations = showAsAnonymousInDonations;
      }

      if (typeof displayName === 'string' && displayName.trim()) {
        user.displayName = displayName.trim();
      }

      await user.save();

      return res.status(200).json({
        user: normalizeUserRecord(user),
      });
    }
  );

  router.get(
    '/donations',
    authenticateAdmin,
    requireTabPermission('donation', 'read'),
    async (req, res) => {
      const { unlinked } = req.query || {};
      const filter = {};

      if (unlinked === 'true') {
        filter.userId = null;
      }

      const donations = await Donation.find(filter)
        .sort({ createdAt: -1 })
        .populate('donationProjectId', 'title slug currency')
        .populate('userId', 'email displayName avatar');

      return res.status(200).json({
        donations: donations.map(normalizeDonationRecord),
      });
    }
  );

  router.post(
    '/site-users/:id/donations',
    authenticateAdmin,
    requireTabPermission('donation', 'create'),
    async (req, res) => {
      const { id } = req.params;
      const {
        donationProjectId,
        amount,
        currency,
        source,
        externalDonorName,
        notes,
      } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid user id.',
        });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      if (!mongoose.Types.ObjectId.isValid(donationProjectId)) {
        return res.status(400).json({
          message: 'A valid donation project id is required.',
        });
      }

      const project = await DonationProject.findById(donationProjectId).select('_id');
      if (!project) {
        return res.status(404).json({
          message: 'Donation project not found.',
        });
      }

      const parsedAmount = parseDonationAmount(amount);
      if (parsedAmount === null) {
        return res.status(400).json({
          message: 'A valid non-negative amount is required.',
        });
      }

      const normalizedCurrency =
        typeof currency === 'string' && DONATION_CURRENCIES.includes(currency)
          ? currency
          : 'USD';

      const normalizedSource =
        typeof source === 'string' && DONATION_SOURCES.includes(source)
          ? source
          : 'manual';

      try {
        const donation = await Donation.create({
          userId: user._id,
          donationProjectId: project._id,
          amount: parsedAmount,
          currency: normalizedCurrency,
          source: normalizedSource,
          externalDonorName:
            typeof externalDonorName === 'string' && externalDonorName.trim()
              ? externalDonorName.trim()
              : null,
          notes:
            typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        });

        return res.status(201).json({
          donation: normalizeDonationRecord(donation),
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }
  );

  router.post(
    '/donations',
    authenticateAdmin,
    requireTabPermission('donation', 'create'),
    async (req, res) => {
      const {
        donationProjectId,
        amount,
        currency,
        source,
        externalDonorName,
        notes,
        userId,
      } = req.body || {};

      if (!mongoose.Types.ObjectId.isValid(donationProjectId)) {
        return res.status(400).json({
          message: 'A valid donation project id is required.',
        });
      }

      const project = await DonationProject.findById(donationProjectId).select('_id');
      if (!project) {
        return res.status(404).json({
          message: 'Donation project not found.',
        });
      }

      const parsedAmount = parseDonationAmount(amount);
      if (parsedAmount === null) {
        return res.status(400).json({
          message: 'A valid non-negative amount is required.',
        });
      }

      let normalizedUserId = null;
      if (userId !== undefined && userId !== null && userId !== '') {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({
            message: 'Invalid user id.',
          });
        }

        const linkedUser = await User.findById(userId).select('_id');
        if (!linkedUser) {
          return res.status(404).json({
            message: 'User not found.',
          });
        }

        normalizedUserId = linkedUser._id;
      }

      const normalizedCurrency =
        typeof currency === 'string' && DONATION_CURRENCIES.includes(currency)
          ? currency
          : 'USD';

      const normalizedSource =
        typeof source === 'string' && DONATION_SOURCES.includes(source)
          ? source
          : 'manual';

      try {
        const donation = await Donation.create({
          userId: normalizedUserId,
          donationProjectId: project._id,
          amount: parsedAmount,
          currency: normalizedCurrency,
          source: normalizedSource,
          externalDonorName:
            typeof externalDonorName === 'string' && externalDonorName.trim()
              ? externalDonorName.trim()
              : null,
          notes:
            typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        });

        return res.status(201).json({
          donation: normalizeDonationRecord(donation),
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }
  );

  router.patch(
    '/donations/:id',
    authenticateAdmin,
    requireTabPermission('donation', 'update'),
    async (req, res) => {
      const { id } = req.params;
      const { userId, amount, currency, source, externalDonorName, notes } =
        req.body || {};

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid donation id.',
        });
      }

      const donation = await Donation.findById(id);
      if (!donation) {
        return res.status(404).json({
          message: 'Donation not found.',
        });
      }

      if (userId !== undefined) {
        if (userId === null || userId === '') {
          donation.userId = null;
        } else if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({
            message: 'Invalid user id.',
          });
        } else {
          const linkedUser = await User.findById(userId).select('_id');
          if (!linkedUser) {
            return res.status(404).json({
              message: 'User not found.',
            });
          }
          donation.userId = linkedUser._id;
        }
      }

      if (amount !== undefined) {
        const parsedAmount = parseDonationAmount(amount);
        if (parsedAmount === null) {
          return res.status(400).json({
            message: 'A valid non-negative amount is required.',
          });
        }
        donation.amount = parsedAmount;
      }

      if (typeof currency === 'string' && DONATION_CURRENCIES.includes(currency)) {
        donation.currency = currency;
      }

      if (typeof source === 'string' && DONATION_SOURCES.includes(source)) {
        donation.source = source;
      }

      if (externalDonorName !== undefined) {
        donation.externalDonorName =
          typeof externalDonorName === 'string' && externalDonorName.trim()
            ? externalDonorName.trim()
            : null;
      }

      if (notes !== undefined) {
        donation.notes =
          typeof notes === 'string' && notes.trim() ? notes.trim() : null;
      }

      await donation.save();

      return res.status(200).json({
        donation: normalizeDonationRecord(donation),
      });
    }
  );

  router.delete(
    '/donations/:id',
    authenticateAdmin,
    requireTabPermission('donation', 'delete'),
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid donation id.',
        });
      }

      const donation = await Donation.findByIdAndDelete(id);
      if (!donation) {
        return res.status(404).json({
          message: 'Donation not found.',
        });
      }

      return res.status(200).json({
        message: 'Donation deleted.',
      });
    }
  );
}

module.exports = {
  createUserAdminRoutes,
};

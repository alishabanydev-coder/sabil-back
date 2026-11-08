const express = require('express');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  parseCreateSiteUser,
  parseDonationPatch,
  parseDonationWrite,
  parseObjectId,
  parseUserPatch,
} = require('./user.validation');
const {
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
} = require('./user.service');

const router = express.Router();

function reject(res, message) {
  return res.status(400).json({ message });
}

router.get('/site-users', authenticateAdmin, requireTabPermission('users', 'read'), async (_req, res) => {
  return res.status(200).json({ users: await listSiteUsers() });
});

router.post(
  '/site-users',
  authenticateAdmin,
  requireTabPermission('users', 'create'),
  async (req, res) => {
    const parsed = parseCreateSiteUser(req.body);
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    const user = await createSiteUser(parsed.value);
    return res.status(201).json({ user });
  }
);

router.get(
  '/site-users/:id',
  authenticateAdmin,
  requireTabPermission('users', 'read'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid user id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    return res.status(200).json(await getSiteUser(parsedId.value));
  }
);

router.patch(
  '/site-users/:id',
  authenticateAdmin,
  requireTabPermission('users', 'update'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid user id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const parsed = parseUserPatch(req.body);
    const user = await updateSiteUser(parsedId.value, parsed.value);
    return res.status(200).json({ user });
  }
);

router.delete(
  '/site-users/:id',
  authenticateAdmin,
  requireTabPermission('users', 'delete'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid user id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const user = await deactivateSiteUser(parsedId.value);
    return res.status(200).json({
      message: 'User deactivated.',
      user,
    });
  }
);

router.get(
  '/donations',
  authenticateAdmin,
  requireTabPermission('donation', 'read'),
  async (req, res) => {
    return res.status(200).json({
      donations: await listDonations(req.query?.unlinked),
    });
  }
);

router.post(
  '/site-users/:id/donations',
  authenticateAdmin,
  requireTabPermission('donation', 'create'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid user id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    await requireSiteUser(parsedId.value);

    const parsed = parseDonationWrite(req.body, { userIdFromRoute: true });
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    const donation = await createDonationRecord({
      ...parsed.value,
      userId: parsedId.value,
    });
    return res.status(201).json({ donation });
  }
);

router.post(
  '/donations',
  authenticateAdmin,
  requireTabPermission('donation', 'create'),
  async (req, res) => {
    const parsed = parseDonationWrite(req.body);
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    const donation = await createDonationRecord(parsed.value);
    return res.status(201).json({ donation });
  }
);

router.patch(
  '/donations/:id',
  authenticateAdmin,
  requireTabPermission('donation', 'update'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid donation id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const parsed = parseDonationPatch(req.body);
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    const donation = await updateDonation(parsedId.value, parsed.value);
    return res.status(200).json({ donation });
  }
);

router.delete(
  '/donations/:id',
  authenticateAdmin,
  requireTabPermission('donation', 'delete'),
  async (req, res) => {
    const parsedId = parseObjectId(req.params.id, 'Invalid donation id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    await deleteDonation(parsedId.value);
    return res.status(200).json({ message: 'Donation deleted.' });
  }
);

module.exports = router;

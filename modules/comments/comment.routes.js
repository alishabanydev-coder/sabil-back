const express = require('express');
const {
  authenticateAdmin,
  hasPermission,
  requireCommentAccess,
} = require('../../middleware/adminAuth');
const {
  parseAdminCommentListQuery,
  parseAdminCommentThreadQuery,
  parseCommentId,
  parseCreateAdminComment,
  parseDonationPageCommentPatch,
  parseOrderedCommentIds,
  parseUpdateAdminComment,
} = require('./comment.validation');
const {
  createAdminComment,
  deleteAdminComment,
  getAdminCommentThread,
  getDonationPageCommentItems,
  listAdminComments,
  reorderDonationPageComments,
  updateAdminComment,
  updateDonationPageComment,
} = require('./comment.service');

const router = express.Router();

function requireDonationPageCommentAccess(action) {
  return (req, res, next) => {
    if (
      hasPermission(req.admin, 'donation', action) ||
      hasPermission(req.admin, 'comments', action)
    ) {
      return next();
    }

    return res.status(403).json({
      message: `Admin ${action} access is required for donation page comments.`,
    });
  };
}

function reject(res, parsed) {
  return res.status(400).json({ message: parsed.message });
}

router.get(
  '/comments/donation-page',
  authenticateAdmin,
  requireDonationPageCommentAccess('read'),
  async (_req, res) => {
    const items = await getDonationPageCommentItems();
    return res.status(200).json({ items });
  }
);

router.put(
  '/comments/donation-page',
  authenticateAdmin,
  requireDonationPageCommentAccess('update'),
  async (req, res) => {
    const parsed = parseOrderedCommentIds(req.body);
    if (!parsed.ok) {
      return reject(res, parsed);
    }

    const items = await reorderDonationPageComments(parsed.value);
    return res.status(200).json({ items });
  }
);

router.patch(
  '/comments/:id/donation-page',
  authenticateAdmin,
  requireDonationPageCommentAccess('update'),
  async (req, res) => {
    const parsedId = parseCommentId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId);
    }

    const parsed = parseDonationPageCommentPatch(req.body);
    if (!parsed.ok) {
      return reject(res, parsed);
    }

    const item = await updateDonationPageComment(parsedId.value, parsed.value);
    return res.status(200).json({ item });
  }
);

router.post('/comments', authenticateAdmin, requireCommentAccess('create'), async (req, res) => {
  const parsed = parseCreateAdminComment(req.body);
  if (!parsed.ok) {
    return reject(res, parsed);
  }

  const comment = await createAdminComment(parsed.value, req.admin);
  return res.status(201).json({ comment });
});

router.get('/comments', authenticateAdmin, requireCommentAccess('read'), async (req, res) => {
  const parsed = parseAdminCommentListQuery(req.query);
  if (!parsed.ok) {
    return reject(res, parsed);
  }

  const comments = await listAdminComments(parsed.value, req.admin);
  return res.status(200).json({ comments });
});

router.get(
  '/comments/thread',
  authenticateAdmin,
  requireCommentAccess('read'),
  async (req, res) => {
    const parsed = parseAdminCommentThreadQuery(req.query);
    if (!parsed.ok) {
      return reject(res, parsed);
    }

    const thread = await getAdminCommentThread(parsed.value, req.admin);
    return res.status(200).json(thread);
  }
);

router.put('/comments/:id', authenticateAdmin, requireCommentAccess('update'), async (req, res) => {
  const parsed = parseUpdateAdminComment(req.params.id, req.body);
  if (!parsed.ok) {
    return reject(res, parsed);
  }

  const comment = await updateAdminComment(parsed.value, req.admin);
  return res.status(200).json({ comment });
});

router.delete(
  '/comments/:id',
  authenticateAdmin,
  requireCommentAccess('delete'),
  async (req, res) => {
    const parsedId = parseCommentId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId);
    }

    await deleteAdminComment(parsedId.value, req.admin);
    return res.status(200).json({ message: 'Comment deleted.' });
  }
);

module.exports = router;

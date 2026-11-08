const express = require('express');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  parseCatalogueReorder,
  parseLayoutItemId,
  parseLayoutItemPatch,
  parseMainPageLayoutSection,
  parseOrderedIds,
} = require('./mainPageLayout.validation');
const {
  listAdminMainPageLayout,
  listPublicMainPageLayout,
  reorderCatalogues,
  reorderMainPageLayout,
  updateCatalogueLayoutItem,
  updateMainPageLayoutItem,
} = require('./mainPageLayout.service');

const router = express.Router();

function reject(res, message) {
  return res.status(400).json({ message });
}

router.get(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'read'),
  async (req, res) => {
    const parsedSection = parseMainPageLayoutSection(req.params.section);
    if (!parsedSection.ok) {
      return reject(res, parsedSection.message);
    }

    return res.status(200).json(await listAdminMainPageLayout(parsedSection.value));
  }
);

router.get('/public/main-page-layout/:section', async (req, res) => {
  const parsedSection = parseMainPageLayoutSection(req.params.section);
  if (!parsedSection.ok) {
    return reject(res, parsedSection.message);
  }

  return res.status(200).json(await listPublicMainPageLayout(parsedSection.value));
});

router.put(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const parsedSection = parseMainPageLayoutSection(req.params.section);
    if (!parsedSection.ok) {
      return reject(res, parsedSection.message);
    }

    if (parsedSection.value === 'catalogues') {
      const parsed = parseCatalogueReorder(req.body);
      if (!parsed.ok) {
        return reject(res, parsed.message);
      }

      const items = await reorderCatalogues(parsed.value.projectId, parsed.value.orderedIds);
      return res.status(200).json({ items });
    }

    const parsedIds = parseOrderedIds(req.body?.orderedIds);
    if (!parsedIds.ok) {
      return reject(res, parsedIds.message);
    }

    const items = await reorderMainPageLayout(parsedSection.value, parsedIds.value);
    return res.status(200).json({ items });
  }
);

router.patch(
  '/main-page-layout/:section/:id',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const parsedSection = parseMainPageLayoutSection(req.params.section);
    if (!parsedSection.ok) {
      return reject(res, parsedSection.message);
    }

    const parsedId = parseLayoutItemId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const parsedPatch = parseLayoutItemPatch(req.body);
    if (!parsedPatch.ok) {
      return reject(res, parsedPatch.message);
    }

    const item =
      parsedSection.value === 'catalogues'
        ? await updateCatalogueLayoutItem(parsedId.value, parsedPatch.value)
        : await updateMainPageLayoutItem(parsedSection.value, parsedId.value, parsedPatch.value);

    return res.status(200).json({ item });
  }
);

module.exports = router;

const express = require('express');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const { createImageUpload, deleteUploadedFile } = require('../../lib/uploads');
const {
  parseHomeVideosUpdate,
  parseNavigationUpdate,
  parseOrderedObjectIdArray,
  parseProjectId,
} = require('./appCatalogue.validation');
const {
  getAdminFeaturedVideos,
  getAdminHomeVideos,
  getAdminNavigation,
  getAdminSuggestedVideos,
  getPublicFeaturedVideos,
  getPublicHomeVideos,
  getPublicNavigation,
  getPublicProjectFeaturedVideos,
  getPublicSuggestedVideos,
  updateAdminFeaturedVideos,
  updateAdminHomeVideos,
  updateAdminNavigation,
  updateAdminSuggestedVideos,
} = require('./appCatalogue.service');

const router = express.Router();

const uploadAppCatalogueHomeImage = createImageUpload({
  folder: 'app-catalogue',
  field: 'image',
  invalidTypeMessage: 'Home image must be an image file.',
});

function reject(res, message) {
  return res.status(400).json({ message });
}

router.get(
  '/app-catalogue/navigation-buttons',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    return res.status(200).json(await getAdminNavigation());
  }
);

router.put(
  '/app-catalogue/navigation-buttons',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  uploadAppCatalogueHomeImage,
  async (req, res, next) => {
    const parsed = parseNavigationUpdate(req.body);
    if (!parsed.ok) {
      deleteUploadedFile(req.file);
      return reject(res, parsed.message);
    }

    try {
      const navigation = await updateAdminNavigation({
        ...parsed.value,
        uploadedFile: req.file,
      });
      return res.status(200).json(navigation);
    } catch (error) {
      deleteUploadedFile(req.file);
      return next(error);
    }
  }
);

router.get(
  '/app-catalogue/home-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    return res.status(200).json(await getAdminHomeVideos());
  }
);

router.put(
  '/app-catalogue/home-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const parsed = parseHomeVideosUpdate(req.body);
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    return res.status(200).json(await updateAdminHomeVideos(parsed.value));
  }
);

router.get(
  '/app-catalogue/suggested-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    return res.status(200).json(await getAdminSuggestedVideos());
  }
);

router.put(
  '/app-catalogue/suggested-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const parsed = parseOrderedObjectIdArray(req.body?.videoIds, 'videoIds');
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    return res.status(200).json(await updateAdminSuggestedVideos(parsed.ids));
  }
);

router.get(
  '/app-catalogue/projects/:projectId/featured-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (req, res) => {
    const parsedId = parseProjectId(req.params.projectId);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    return res.status(200).json(await getAdminFeaturedVideos(parsedId.value));
  }
);

router.put(
  '/app-catalogue/projects/:projectId/featured-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const parsedId = parseProjectId(req.params.projectId);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const parsedVideoIds = parseOrderedObjectIdArray(req.body?.videoIds, 'videoIds');
    if (!parsedVideoIds.ok) {
      return reject(res, parsedVideoIds.message);
    }

    return res.status(200).json(
      await updateAdminFeaturedVideos(parsedId.value, parsedVideoIds.ids)
    );
  }
);

router.get('/public/app-catalogue/navigation-buttons', async (_req, res) => {
  return res.status(200).json(await getPublicNavigation());
});

router.get('/public/app-catalogue/home-videos', async (_req, res) => {
  const homeVideos = await getPublicHomeVideos();
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(homeVideos);
});

router.get('/public/app-catalogue/suggested-videos', async (_req, res) => {
  const suggestedVideos = await getPublicSuggestedVideos();
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(suggestedVideos);
});

router.get('/public/app-catalogue/featured-videos', async (_req, res) => {
  const featuredVideos = await getPublicFeaturedVideos();
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(featuredVideos);
});

router.get('/public/app-catalogue/projects/:projectId/featured-videos', async (req, res) => {
  const parsedId = parseProjectId(req.params.projectId);
  if (!parsedId.ok) {
    return reject(res, parsedId.message);
  }

  const featuredVideos = await getPublicProjectFeaturedVideos(parsedId.value);
  res.set('Cache-Control', 'no-store');
  return res.status(200).json(featuredVideos);
});

module.exports = router;

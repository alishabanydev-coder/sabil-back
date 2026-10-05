const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const SiteSettings = require('../../models/siteSettings.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteStoredUpload,
} = require('../../lib/uploads');

const socialMediaIconUploadDir = path.join(__dirname, '..', '..', 'uploads', 'social-media-icons');

const socialMediaIconUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(socialMediaIconUploadDir, { recursive: true });
      callback(null, socialMediaIconUploadDir);
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

      callback(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Social media icon must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

function uploadSocialMediaIcon(req, res, next) {
  socialMediaIconUpload.single('icon')(req, res, (error) => {
    if (!error) {
      return next();
    }

    return res.status(400).json({
      message: error.message,
    });
  });
}
async function getOrCreateSiteSettings() {
  const siteSettings = await SiteSettings.findOneAndUpdate(
    { singletonKey: 'main' },
    { $setOnInsert: { singletonKey: 'main' } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return siteSettings;
}
const router = express.Router();

router.get('/public/social-media', async (_req, res) => {
  const siteSettings = await getOrCreateSiteSettings();
  const socialMediaLinks = Array.isArray(siteSettings.socialMediaLinks)
    ? siteSettings.socialMediaLinks
    : [];

  return res.status(200).json({
    socialMediaLinks,
  });
});

router.get(
  '/social-media',
  authenticateAdmin,
  requireTabPermission('socialMedia', 'read'),
  async (_req, res) => {
    const siteSettings = await getOrCreateSiteSettings();
    const socialMediaLinks = Array.isArray(siteSettings.socialMediaLinks)
      ? siteSettings.socialMediaLinks
      : [];

    return res.status(200).json({
      socialMediaLinks,
    });
  }
);

router.post(
  '/social-media',
  authenticateAdmin,
  requireTabPermission('socialMedia', 'create'),
  uploadSocialMediaIcon,
  async (req, res) => {
    const { name, url } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';

    if (!normalizedName || !normalizedUrl || !req.file) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Name, url, and icon are required.',
      });
    }

    const nextIcon = `/uploads/social-media-icons/${req.file.filename}`;

    try {
      const siteSettings = await getOrCreateSiteSettings();
      siteSettings.socialMediaLinks.push({
        name: normalizedName,
        url: normalizedUrl,
        icon: nextIcon,
      });
      await siteSettings.save();

      const createdItem =
        siteSettings.socialMediaLinks[siteSettings.socialMediaLinks.length - 1];

      return res.status(201).json({
        socialMediaLink: createdItem,
      });
    } catch (error) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.put(
  '/social-media/:id',
  authenticateAdmin,
  requireTabPermission('socialMedia', 'update'),
  uploadSocialMediaIcon,
  async (req, res) => {
    const { id } = req.params;
    const { name, url } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Invalid social media id.',
      });
    }

    try {
      const siteSettings = await getOrCreateSiteSettings();
      const item = siteSettings.socialMediaLinks.id(id);

      if (!item) {
        deleteUploadedFile(req.file);

        return res.status(404).json({
          message: 'Social media item not found.',
        });
      }

      const hasName = typeof name === 'string';
      const hasUrl = typeof url === 'string';
      const normalizedName = hasName ? name.trim() : '';
      const normalizedUrl = hasUrl ? url.trim() : '';

      if (hasName && !normalizedName) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          message: 'Name cannot be empty.',
        });
      }

      if (hasUrl && !normalizedUrl) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          message: 'Url cannot be empty.',
        });
      }

      if (hasName) {
        item.name = normalizedName;
      }

      if (hasUrl) {
        item.url = normalizedUrl;
      }

      if (req.file) {
        const previousIcon = item.icon;
        item.icon = `/uploads/social-media-icons/${req.file.filename}`;
        deleteStoredUpload(previousIcon);
      }

      await siteSettings.save();

      return res.status(200).json({
        socialMediaLink: item,
      });
    } catch (error) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/social-media/:id',
  authenticateAdmin,
  requireTabPermission('socialMedia', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid social media id.',
      });
    }

    const siteSettings = await getOrCreateSiteSettings();
    const item = siteSettings.socialMediaLinks.id(id);

    if (!item) {
      return res.status(404).json({
        message: 'Social media item not found.',
      });
    }

    const iconPath = item.icon;
    item.deleteOne();
    await siteSettings.save();
    deleteStoredUpload(iconPath);

    return res.status(200).json({
      message: 'Social media item deleted.',
    });
  }
);

module.exports = router;


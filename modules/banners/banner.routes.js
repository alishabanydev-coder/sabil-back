const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Banner = require('../../models/banner.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteStoredUpload,
} = require('../../lib/uploads');

const bannerPosterUploadDir = path.join(__dirname, '..', '..', 'uploads', 'banners');

const bannerPosterUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(bannerPosterUploadDir, { recursive: true });
      callback(null, bannerPosterUploadDir);
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
      callback(new Error('Banner poster must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

function uploadBannerPoster(req, res, next) {
  bannerPosterUpload.single('poster')(req, res, (error) => {
    if (!error) {
      return next();
    }

    return res.status(400).json({
      message: error.message,
    });
  });
}
const router = express.Router();

router.get(
  '/banner',
  authenticateAdmin,
  requireTabPermission('banner', 'read'),
  async (_req, res) => {
    const banners = await Banner.find({ isActive: true }).sort({ updatedAt: -1 });

    return res.status(200).json({
      banners,
    });
  }
);

router.post(
  '/banner',
  authenticateAdmin,
  requireTabPermission('banner', 'create'),
  uploadBannerPoster,
  async (req, res) => {
    const { title } = req.body || {};

    if (typeof title !== 'string' || !title.trim() || !req.file) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Banner title and poster are required.',
      });
    }

    const nextPoster = `/uploads/banners/${req.file.filename}`;

    try {
      const banner = await Banner.create({
        title: title.trim(),
        poster: nextPoster,
        isActive: true,
      });

      return res.status(201).json({
        banner,
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
  '/banner/:id',
  authenticateAdmin,
  requireTabPermission('banner', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid banner id.',
      });
    }

    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      return res.status(404).json({
        message: 'Banner not found.',
      });
    }

    deleteStoredUpload(banner.poster);

    return res.status(200).json({
      message: 'Banner deleted.',
    });
  }
);

router.delete(
  '/banner',
  authenticateAdmin,
  requireTabPermission('banner', 'delete'),
  async (_req, res) => {
    const banner = await Banner.findOne({ isActive: true }).sort({ updatedAt: -1 });

    if (!banner) {
      return res.status(404).json({
        message: 'Banner not found.',
      });
    }

    await banner.deleteOne();
    deleteStoredUpload(banner.poster);

    return res.status(200).json({
      message: 'Banner deleted.',
    });
  }
);

module.exports = router;


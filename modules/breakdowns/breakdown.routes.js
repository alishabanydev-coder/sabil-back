const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Project = require('../../models/project.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteStoredUpload,
} = require('../../lib/uploads');
const { normalizeProjectThumbnailPath } = require('../../lib/mediaPaths');

const breakdownThumbnailUploadDir = path.join(__dirname, '..', '..', 'uploads', 'breakdown-thumbnails');

const breakdownThumbnailUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(breakdownThumbnailUploadDir, { recursive: true });
      callback(null, breakdownThumbnailUploadDir);
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
      callback(new Error('Breakdown thumbnail must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

function uploadBreakdownThumbnail(req, res, next) {
  breakdownThumbnailUpload.single('thumbnail')(req, res, (error) => {
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
  '/breakdowns',
  authenticateAdmin,
  requireTabPermission('breakdowns', 'read'),
  async (_req, res) => {
    const breakdowns = await ProjectBreakDown.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      breakdowns,
    });
  }
);

router.post(
  '/breakdowns',
  authenticateAdmin,
  requireTabPermission('breakdowns', 'create'),
  uploadBreakdownThumbnail,
  async (req, res) => {
    const { projectId, title, content, videoUrl, thumbnail } = req.body || {};

    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      typeof title !== 'string' ||
      typeof content !== 'string' ||
      !title.trim() ||
      !content.trim()
    ) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Project, title, and content are required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      deleteUploadedFile(req.file);

      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    const nextThumbnail = req.file
      ? `/uploads/breakdown-thumbnails/${req.file.filename}`
      : normalizeProjectThumbnailPath(thumbnail);

    if (!nextThumbnail) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Breakdown thumbnail is required.',
      });
    }

    try {
      const breakdown = await ProjectBreakDown.create({
        projectId,
        title: title.trim(),
        content: content.trim(),
        thumbnail: nextThumbnail,
        ...(typeof videoUrl === 'string' && videoUrl.trim()
          ? { videoUrl: videoUrl.trim() }
          : {}),
      });

      return res.status(201).json({
        breakdown,
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
  '/breakdowns/:id',
  authenticateAdmin,
  requireTabPermission('breakdowns', 'update'),
  uploadBreakdownThumbnail,
  async (req, res) => {
    const { id } = req.params;
    const { projectId, title, content, videoUrl, thumbnail } = req.body || {};

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(projectId) ||
      typeof title !== 'string' ||
      typeof content !== 'string' ||
      !title.trim() ||
      !content.trim()
    ) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Breakdown id, project, title, and content are required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      deleteUploadedFile(req.file);

      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    try {
      const existingBreakdown = await ProjectBreakDown.findById(id);

      if (!existingBreakdown) {
        deleteUploadedFile(req.file);

        return res.status(404).json({
          message: 'Breakdown not found.',
        });
      }

      const nextThumbnail = req.file
        ? `/uploads/breakdown-thumbnails/${req.file.filename}`
        : normalizeProjectThumbnailPath(thumbnail) || existingBreakdown.thumbnail;

      if (!nextThumbnail) {
        deleteUploadedFile(req.file);

        return res.status(400).json({
          message: 'Breakdown thumbnail is required.',
        });
      }

      const updateDocument = {
        $set: {
          projectId,
          title: title.trim(),
          content: content.trim(),
          thumbnail: nextThumbnail,
        },
      };

      if (typeof videoUrl === 'string' && videoUrl.trim()) {
        updateDocument.$set.videoUrl = videoUrl.trim();
      } else {
        updateDocument.$unset = { videoUrl: 1 };
      }

      const breakdown = await ProjectBreakDown.findByIdAndUpdate(
        id,
        updateDocument,
        {
          returnDocument: 'after',
          runValidators: true,
        }
      );

      if (req.file && existingBreakdown.thumbnail !== nextThumbnail) {
        deleteStoredUpload(existingBreakdown.thumbnail);
      }

      return res.status(200).json({
        breakdown,
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
  '/breakdowns/:id',
  authenticateAdmin,
  requireTabPermission('breakdowns', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid breakdown id.',
      });
    }

    const breakdown = await ProjectBreakDown.findByIdAndDelete(id);

    if (!breakdown) {
      return res.status(404).json({
        message: 'Breakdown not found.',
      });
    }

    deleteStoredUpload(breakdown.thumbnail);

    return res.status(200).json({
      message: 'Breakdown deleted.',
    });
  }
);

module.exports = router;


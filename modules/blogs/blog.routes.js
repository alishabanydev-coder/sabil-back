const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Blog = require('../../models/blog.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFiles,
  deleteStoredUpload,
} = require('../../lib/uploads');
const { normalizeBlogImagePath } = require('../../lib/mediaPaths');

const blogImageUploadDir = path.join(__dirname, '..', '..', 'uploads', 'blog-images');

const blogImageUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(blogImageUploadDir, { recursive: true });
      callback(null, blogImageUploadDir);
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
    files: 12,
  },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Blog images must be image files.'));
      return;
    }

    callback(null, true);
  },
});

function uploadBlogImages(req, res, next) {
  blogImageUpload.array('images', 12)(req, res, (error) => {
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
  '/blogs',
  authenticateAdmin,
  requireTabPermission('blog', 'read'),
  async (_req, res) => {
    const blogs = await Blog.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      blogs,
    });
  }
);

router.post(
  '/blogs',
  authenticateAdmin,
  requireTabPermission('blog', 'create'),
  uploadBlogImages,
  async (req, res) => {
    const { title, subHeader, videoUrl, content } = req.body || {};
    const normalizedContent = typeof content === 'string' ? content.trim() : '';

    if (typeof title !== 'string' || !title.trim() || !normalizedContent) {
      deleteUploadedFiles(req.files);

      return res.status(400).json({
        message: 'Title and content are required.',
      });
    }

    const images = Array.isArray(req.files)
      ? req.files.map((file) => `/uploads/blog-images/${file.filename}`)
      : [];

    try {
      const blog = await Blog.create({
        title: title.trim(),
        ...(typeof subHeader === 'string' && subHeader.trim()
          ? { subHeader: subHeader.trim() }
          : {}),
        content: normalizedContent,
        image: images,
        ...(typeof videoUrl === 'string' && videoUrl.trim()
          ? { videoUrl: videoUrl.trim() }
          : {}),
      });

      return res.status(201).json({
        blog,
      });
    } catch (error) {
      deleteUploadedFiles(req.files);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.put(
  '/blogs/:id',
  authenticateAdmin,
  requireTabPermission('blog', 'update'),
  uploadBlogImages,
  async (req, res) => {
    const { id } = req.params;
    const { title, subHeader, videoUrl, content, keepImages } = req.body || {};
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    const parsedKeepImages =
      typeof keepImages === 'string'
        ? (() => {
            try {
              return JSON.parse(keepImages);
            } catch {
              return null;
            }
          })()
        : [];
    const normalizedKeptImages = Array.isArray(parsedKeepImages)
      ? parsedKeepImages
          .map((imagePath) => normalizeBlogImagePath(imagePath))
          .filter(Boolean)
      : [];

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      typeof title !== 'string' ||
      !title.trim() ||
      !normalizedContent
    ) {
      deleteUploadedFiles(req.files);

      return res.status(400).json({
        message: 'Blog id, title, and content are required.',
      });
    }

    try {
      const blog = await Blog.findById(id);

      if (!blog) {
        deleteUploadedFiles(req.files);

        return res.status(404).json({
          message: 'Blog not found.',
        });
      }

      const uploadedImages = Array.isArray(req.files)
        ? req.files.map((file) => `/uploads/blog-images/${file.filename}`)
        : [];
      const nextImages = [...normalizedKeptImages, ...uploadedImages];

      blog.title = title.trim();
      blog.content = normalizedContent;

      if (typeof subHeader === 'string' && subHeader.trim()) {
        blog.subHeader = subHeader.trim();
      } else {
        blog.subHeader = undefined;
      }

      if (typeof videoUrl === 'string' && videoUrl.trim()) {
        blog.videoUrl = videoUrl.trim();
      } else {
        blog.videoUrl = undefined;
      }

      const previousImages = Array.isArray(blog.image) ? blog.image : [];
      blog.image = nextImages;
      previousImages
        .filter((imagePath) => !nextImages.includes(imagePath))
        .forEach((imagePath) => {
          deleteStoredUpload(imagePath);
        });

      await blog.save();

      return res.status(200).json({
        blog,
      });
    } catch (error) {
      deleteUploadedFiles(req.files);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/blogs/:id',
  authenticateAdmin,
  requireTabPermission('blog', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid blog id.',
      });
    }

    const blog = await Blog.findByIdAndDelete(id);

    if (!blog) {
      return res.status(404).json({
        message: 'Blog not found.',
      });
    }

    const images = Array.isArray(blog.image) ? blog.image : [];
    images.forEach((imagePath) => {
      deleteStoredUpload(imagePath);
    });

    return res.status(200).json({
      message: 'Blog deleted.',
    });
  }
);

module.exports = router;


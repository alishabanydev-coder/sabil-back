const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const Admin = require('./models/admin.model');
const Project = require('./models/project.model');
const Video = require('./models/video.model');
const Blog = require('./models/blog.model');
const Comment = require('./models/comment.model');
const Banner = require('./models/banner.model');
const ProjectBreakDown = require('./models/projectBreakDown.model');
const SiteSettings = require('./models/siteSettings.model');
const Supporter = require('./models/supporter.model');
const {
  ADMIN_ROLES,
  GRANTABLE_ADMIN_TABS,
  getSuperAdminPermissions,
} = require('./adminPermissions');

const router = express.Router();
const videoThumbnailUploadDir = path.join(__dirname, 'uploads', 'video-thumbnails');
const bannerPosterUploadDir = path.join(__dirname, 'uploads', 'banners');
const blogImageUploadDir = path.join(__dirname, 'uploads', 'blog-images');
const socialMediaIconUploadDir = path.join(__dirname, 'uploads', 'social-media-icons');

const videoThumbnailUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(videoThumbnailUploadDir, { recursive: true });
      callback(null, videoThumbnailUploadDir);
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
      callback(new Error('Thumbnail must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

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

function getJwtSecret() {
  return process.env.ADMIN_JWT_SECRET;
}

function normalizePermissions(permissions = []) {
  return permissions
    .filter((permission) => GRANTABLE_ADMIN_TABS.includes(permission?.tab))
    .filter(
      (permission) =>
        permission.hasAccess === true ||
        permission.canRead === true ||
        permission.canCreate === true ||
        permission.canUpdate === true ||
        permission.canDelete === true
    )
    .map((permission) => ({
      tab: permission.tab,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      projectIds:
        permission.tab === 'channels' && Array.isArray(permission.projectIds)
          ? permission.projectIds.filter((projectId) =>
              mongoose.Types.ObjectId.isValid(projectId)
            )
          : [],
    }));
}

function sanitizeAdmin(admin) {
  return admin.toAuthJSON();
}

function buildToken(admin) {
  const authAdmin = sanitizeAdmin(admin);

  return jwt.sign(
    {
      adminId: authAdmin.id,
      role: authAdmin.role,
      permissions: authAdmin.permissions,
    },
    getJwtSecret(),
    {
      subject: authAdmin.id,
      expiresIn: '8h',
    }
  );
}

async function ensureBootstrapSuperAdmin() {
  const adminUserName = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.ADMIN_JWT_SECRET;

  if (!adminUserName || !adminPassword || !jwtSecret) {
    throw new Error('Admin auth environment variables are not configured.');
  }

  const normalizedUserName = adminUserName.toLowerCase();
  const existingAdmin = await Admin.findOne({ userName: normalizedUserName });

  if (existingAdmin) {
    if (
      existingAdmin.role !== ADMIN_ROLES.SUPER_ADMIN ||
      !existingAdmin.isActive
    ) {
      existingAdmin.role = ADMIN_ROLES.SUPER_ADMIN;
      existingAdmin.permissions = getSuperAdminPermissions();
      existingAdmin.isActive = true;
      await existingAdmin.save();
    }

    return existingAdmin;
  }

  return Admin.create({
    userName: normalizedUserName,
    name: adminUserName,
    passwordHash: await Admin.hashPassword(adminPassword),
    role: ADMIN_ROLES.SUPER_ADMIN,
    permissions: getSuperAdminPermissions(),
    isActive: true,
  });
}

async function authenticateAdmin(req, res, next) {
  const jwtSecret = getJwtSecret();
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!jwtSecret) {
    return res.status(500).json({
      message: 'Admin JWT secret is not configured.',
    });
  }

  if (!token) {
    return res.status(401).json({
      message: 'Admin authentication token is required.',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const admin = await Admin.findById(decoded.adminId || decoded.sub);

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        message: 'Admin account is inactive or no longer exists.',
      });
    }

    req.admin = admin;
    return next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired admin token.',
    });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== ADMIN_ROLES.SUPER_ADMIN) {
    return res.status(403).json({
      message: 'Super admin access is required.',
    });
  }

  return next();
}

function getAdminPermission(admin, tab) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return {
      tab,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      projectIds: [],
    };
  }

  return (admin?.permissions || []).find((permission) => permission.tab === tab);
}

function hasChannelProjectAccess(admin, projectId) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  const permission = getAdminPermission(admin, 'channels');
  const projectIds = permission?.projectIds || [];

  return projectIds.some((allowedProjectId) => allowedProjectId.toString() === projectId);
}

function requireChannelProjectAccess(req, res, next) {
  const { projectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({
      message: 'Invalid project id.',
    });
  }

  if (!hasChannelProjectAccess(req.admin, projectId)) {
    return res.status(403).json({
      message: 'Admin access is required for this channel project.',
    });
  }

  return next();
}

function uploadVideoThumbnail(req, res, next) {
  videoThumbnailUpload.single('thumbnail')(req, res, (error) => {
    if (!error) {
      return next();
    }

    return res.status(400).json({
      message: error.message,
    });
  });
}

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

function deleteUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  fs.unlink(file.path, () => {});
}

function deleteUploadedFiles(files) {
  if (!Array.isArray(files)) {
    return;
  }

  files.forEach((file) => {
    if (file?.path) {
      fs.unlink(file.path, () => {});
    }
  });
}

function deleteStoredUpload(uploadPath) {
  if (typeof uploadPath !== 'string' || !uploadPath.startsWith('/uploads/')) {
    return;
  }

  const normalizedRelativePath = uploadPath.replace(/^\/uploads\//, '');
  const absolutePath = path.join(__dirname, 'uploads', normalizedRelativePath);
  const uploadsRoot = path.join(__dirname, 'uploads');

  if (!absolutePath.startsWith(uploadsRoot)) {
    return;
  }

  fs.unlink(absolutePath, () => {});
}

function normalizeBlogImagePath(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return null;
  }

  const trimmedPath = imagePath.trim();
  if (trimmedPath.startsWith('/uploads/')) {
    return trimmedPath;
  }

  try {
    const parsedUrl = new URL(trimmedPath);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return parsedUrl.pathname;
    }
  } catch {
    return null;
  }

  return null;
}

async function getOrCreateSiteSettings() {
  const siteSettings = await SiteSettings.findOneAndUpdate(
    { singletonKey: 'main' },
    { $setOnInsert: { singletonKey: 'main' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return siteSettings;
}

const COMMENT_TARGET_MODELS = {
  video: Video,
  blog: Blog,
  breakdown: ProjectBreakDown,
};

function normalizeCommentTargetType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function commentTargetExists(targetType, targetId) {
  const model = COMMENT_TARGET_MODELS[targetType];
  if (!model) {
    return false;
  }

  const target = await model.findById(targetId).select('_id');
  return Boolean(target);
}

function hasPermission(admin, tab, action) {
  const permission = getAdminPermission(admin, tab);

  if (!permission) {
    return false;
  }

  return Boolean(permission[`can${action[0].toUpperCase()}${action.slice(1)}`]);
}

function requireTabPermission(tab, action) {
  return (req, res, next) => {
    if (!hasPermission(req.admin, tab, action)) {
      return res.status(403).json({
        message: `Admin ${action} access is required for ${tab}.`,
      });
    }

    return next();
  };
}

router.post('/login', async (req, res) => {
  try {
    await ensureBootstrapSuperAdmin();
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }

  const body = req.body || {};
  const userName = typeof body.userName === 'string' ? body.userName : body.username;
  const { password } = body;

  if (typeof userName !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      message: 'Username and password are required.',
    });
  }

  const admin = await Admin.findOne({
    userName: userName.toLowerCase(),
    isActive: true,
  });
  const isValid = admin ? await admin.comparePassword(password) : false;

  if (!isValid) {
    return res.status(401).json({
      message: 'Invalid username or password.',
    });
  }

  const authAdmin = sanitizeAdmin(admin);

  return res.status(200).json({
    token: buildToken(admin),
    ...authAdmin,
  });
});

router.get('/me', authenticateAdmin, (req, res) => {
  return res.status(200).json(sanitizeAdmin(req.admin));
});

router.get('/admins', authenticateAdmin, requireSuperAdmin, async (_req, res) => {
  const admins = await Admin.find({}, '-passwordHash').sort({ createdAt: -1 });

  return res.status(200).json({
    admins,
  });
});

router.post('/admins', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const {
    userName,
    username,
    name,
    password,
    role = ADMIN_ROLES.ADMIN,
    permissions = [],
    isActive = true,
  } = req.body || {};
  const adminUserName = typeof userName === 'string' ? userName : username;

  if (
    typeof adminUserName !== 'string' ||
    typeof name !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({
      message: 'Username, name, and password are required.',
    });
  }

  if (!Object.values(ADMIN_ROLES).includes(role)) {
    return res.status(400).json({
      message: 'Invalid admin role.',
    });
  }

  try {
    const admin = await Admin.create({
      userName: adminUserName.toLowerCase(),
      name,
      passwordHash: await Admin.hashPassword(password),
      role,
      permissions:
        role === ADMIN_ROLES.SUPER_ADMIN
          ? getSuperAdminPermissions()
          : normalizePermissions(permissions),
      isActive: Boolean(isActive),
      createdBy: req.admin._id,
    });

    return res.status(201).json({
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An admin with this username already exists.',
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }
});

router.patch('/admins/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: 'Invalid admin id.',
    });
  }

  const updates = {};
  const { userName, username, name, password, role, permissions, isActive } =
    req.body || {};
  const adminUserName = typeof userName === 'string' ? userName : username;

  if (typeof adminUserName === 'string') {
    updates.userName = adminUserName.toLowerCase();
  }

  if (typeof name === 'string') {
    updates.name = name;
  }

  if (typeof password === 'string' && password.length > 0) {
    updates.passwordHash = await Admin.hashPassword(password);
  }

  if (typeof role === 'string') {
    if (!Object.values(ADMIN_ROLES).includes(role)) {
      return res.status(400).json({
        message: 'Invalid admin role.',
      });
    }

    updates.role = role;
  }

  if (Array.isArray(permissions)) {
    updates.permissions = normalizePermissions(permissions);
  }

  if (typeof isActive === 'boolean') {
    updates.isActive = isActive;
  }

  if (updates.role === ADMIN_ROLES.SUPER_ADMIN) {
    updates.permissions = getSuperAdminPermissions();
  }

  try {
    const admin = await Admin.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!admin) {
      return res.status(404).json({
        message: 'Admin not found.',
      });
    }

    return res.status(200).json({
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An admin with this username already exists.',
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }
});

router.delete('/admins/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: 'Invalid admin id.',
    });
  }

  if (req.admin._id.equals(id)) {
    return res.status(400).json({
      message: 'A super admin cannot delete their own account.',
    });
  }

  const admin = await Admin.findByIdAndDelete(id);

  if (!admin) {
    return res.status(404).json({
      message: 'Admin not found.',
    });
  }

  return res.status(200).json({
    message: 'Admin deleted.',
  });
});

router.get(
  '/projects',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const projects = await Project.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      projects,
    });
  }
);

router.get(
  '/channels/projects',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  async (req, res) => {
    const permission = getAdminPermission(req.admin, 'channels');
    const projectIds = permission?.projectIds || [];
    const filter =
      req.admin.role === ADMIN_ROLES.SUPER_ADMIN
        ? {}
        : { _id: { $in: projectIds } };

    const projects = await Project.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      projects,
    });
  }
);

router.get(
  '/channels/projects/:projectId/videos',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId } = req.params;
    const videos = await Video.find({ projectId }).sort({
      season: 1,
      episode: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      videos,
    });
  }
);

router.post(
  '/channels/projects/:projectId/videos',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  requireChannelProjectAccess,
  uploadVideoThumbnail,
  async (req, res) => {
    const { projectId } = req.params;
    const { title, description, url, videoUrl, season, episode } = req.body || {};

    const videoUrlValue = typeof url === 'string' ? url : videoUrl;
    const parsedSeason = Number(season);
    const parsedEpisode = Number(episode);

    if (
      typeof title !== 'string' ||
      typeof description !== 'string' ||
      typeof videoUrlValue !== 'string' ||
      !req.file ||
      !title.trim() ||
      !description.trim() ||
      !videoUrlValue.trim() ||
      !Number.isInteger(parsedSeason) ||
      !Number.isInteger(parsedEpisode) ||
      parsedSeason < 1 ||
      parsedEpisode < 1
    ) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message:
          'Video title, description, URL, thumbnail, season, and episode are required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      deleteUploadedFile(req.file);

      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    const existingVideo = await Video.findOne({
      projectId,
      season: parsedSeason,
      episode: parsedEpisode,
    });

    if (existingVideo) {
      deleteUploadedFile(req.file);

      return res.status(409).json({
        message: `Season ${parsedSeason}, episode ${parsedEpisode} already exists for this project.`,
      });
    }

    try {
      const video = await Video.create({
        title,
        description,
        url: videoUrlValue,
        thumbnail: `/uploads/video-thumbnails/${req.file.filename}`,
        projectId,
        season: parsedSeason,
        episode: parsedEpisode,
      });

      return res.status(201).json({
        video,
      });
    } catch (error) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message:
          error.code === 11000
            ? `Season ${parsedSeason}, episode ${parsedEpisode} already exists for this project.`
            : error.message,
      });
    }
  }
);

router.patch(
  '/channels/projects/:projectId/videos/:videoId',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  uploadVideoThumbnail,
  async (req, res) => {
    const { projectId, videoId } = req.params;
    const { title, description, url, videoUrl, thumbnail, season, episode } =
      req.body || {};

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Invalid video id.',
      });
    }

    const videoUrlValue = typeof url === 'string' ? url : videoUrl;
    const parsedSeason = Number(season);
    const parsedEpisode = Number(episode);

    if (
      typeof title !== 'string' ||
      typeof description !== 'string' ||
      typeof videoUrlValue !== 'string' ||
      !title.trim() ||
      !description.trim() ||
      !videoUrlValue.trim() ||
      !Number.isInteger(parsedSeason) ||
      !Number.isInteger(parsedEpisode) ||
      parsedSeason < 1 ||
      parsedEpisode < 1
    ) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message: 'Video title, description, URL, season, and episode are required.',
      });
    }

    const video = await Video.findOne({ _id: videoId, projectId });

    if (!video) {
      deleteUploadedFile(req.file);

      return res.status(404).json({
        message: 'Video not found.',
      });
    }

    const existingVideo = await Video.findOne({
      _id: { $ne: videoId },
      projectId,
      season: parsedSeason,
      episode: parsedEpisode,
    });

    if (existingVideo) {
      deleteUploadedFile(req.file);

      return res.status(409).json({
        message: `Season ${parsedSeason}, episode ${parsedEpisode} already exists for this project.`,
      });
    }

    const nextThumbnail = req.file
      ? `/uploads/video-thumbnails/${req.file.filename}`
      : typeof thumbnail === 'string' && thumbnail.startsWith('/uploads/')
        ? thumbnail
        : video.thumbnail;

    try {
      const previousThumbnail = video.thumbnail;

      video.title = title;
      video.description = description;
      video.url = videoUrlValue;
      video.thumbnail = nextThumbnail;
      video.season = parsedSeason;
      video.episode = parsedEpisode;

      await video.save();
      if (req.file && previousThumbnail !== nextThumbnail) {
        deleteStoredUpload(previousThumbnail);
      }

      return res.status(200).json({
        video,
      });
    } catch (error) {
      deleteUploadedFile(req.file);

      return res.status(400).json({
        message:
          error.code === 11000
            ? `Season ${parsedSeason}, episode ${parsedEpisode} already exists for this project.`
            : error.message,
      });
    }
  }
);

router.delete(
  '/channels/projects/:projectId/videos/:videoId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId, videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({
        message: 'Invalid video id.',
      });
    }

    const video = await Video.findOneAndDelete({ _id: videoId, projectId });

    if (!video) {
      return res.status(404).json({
        message: 'Video not found.',
      });
    }

    deleteStoredUpload(video.thumbnail);

    return res.status(200).json({
      message: 'Video deleted.',
    });
  }
);

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

router.post(
  '/comments',
  authenticateAdmin,
  requireTabPermission('comments', 'create'),
  async (req, res) => {
    const { text, username, targetType, targetId, parentCommentId } = req.body || {};
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedTargetType = normalizeCommentTargetType(targetType);

    if (
      !normalizedText ||
      !normalizedUsername ||
      !mongoose.Types.ObjectId.isValid(targetId) ||
      !Object.hasOwn(COMMENT_TARGET_MODELS, normalizedTargetType)
    ) {
      return res.status(400).json({
        message: 'Text, username, target type, and target id are required.',
      });
    }

    if (!(await commentTargetExists(normalizedTargetType, targetId))) {
      return res.status(404).json({
        message: 'Comment target not found.',
      });
    }

    let normalizedParentCommentId = null;
    if (parentCommentId !== undefined && parentCommentId !== null && parentCommentId !== '') {
      if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
        return res.status(400).json({
          message: 'Invalid parent comment id.',
        });
      }

      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({
          message: 'Parent comment not found.',
        });
      }

      if (
        parentComment.targetType !== normalizedTargetType ||
        parentComment.targetId.toString() !== targetId
      ) {
        return res.status(400).json({
          message: 'Parent comment target does not match this comment target.',
        });
      }

      normalizedParentCommentId = parentComment._id;
    }

    try {
      const comment = await Comment.create({
        text: normalizedText,
        username: normalizedUsername,
        targetType: normalizedTargetType,
        targetId,
        parentCommentId: normalizedParentCommentId,
      });

      return res.status(201).json({
        comment,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get(
  '/comments',
  authenticateAdmin,
  requireTabPermission('comments', 'read'),
  async (req, res) => {
    const { targetType, username } = req.query || {};
    const filter = {};

    if (typeof targetType === 'string' && targetType.trim()) {
      const normalizedTargetType = normalizeCommentTargetType(targetType);
      if (!Object.hasOwn(COMMENT_TARGET_MODELS, normalizedTargetType)) {
        return res.status(400).json({
          message: 'Invalid target type filter.',
        });
      }

      filter.targetType = normalizedTargetType;
    }

    if (typeof username === 'string' && username.trim()) {
      filter.username = {
        $regex: username.trim(),
        $options: 'i',
      };
    }

    const comments = await Comment.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      comments,
    });
  }
);

router.put(
  '/comments/:id',
  authenticateAdmin,
  requireTabPermission('comments', 'update'),
  async (req, res) => {
    const { id } = req.params;
    const { text, username, targetType, targetId, parentCommentId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid comment id.',
      });
    }

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found.',
      });
    }

    const hasText = typeof text === 'string';
    const hasUsername = typeof username === 'string';
    const hasTargetType = typeof targetType === 'string';
    const hasTargetId = typeof targetId === 'string';
    const hasParentCommentId = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentCommentId');

    const nextText = hasText ? text.trim() : comment.text;
    const nextUsername = hasUsername ? username.trim() : comment.username;
    const nextTargetType = hasTargetType
      ? normalizeCommentTargetType(targetType)
      : comment.targetType;
    const nextTargetId = hasTargetId ? targetId : comment.targetId.toString();

    if (!nextText || !nextUsername) {
      return res.status(400).json({
        message: 'Text and username cannot be empty.',
      });
    }

    if (!Object.hasOwn(COMMENT_TARGET_MODELS, nextTargetType)) {
      return res.status(400).json({
        message: 'Invalid target type.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(nextTargetId)) {
      return res.status(400).json({
        message: 'Invalid target id.',
      });
    }

    if (!(await commentTargetExists(nextTargetType, nextTargetId))) {
      return res.status(404).json({
        message: 'Comment target not found.',
      });
    }

    let nextParentCommentId = comment.parentCommentId;
    if (hasParentCommentId) {
      const normalizedParentValue =
        parentCommentId === '' || parentCommentId === null ? null : parentCommentId;

      if (normalizedParentValue === null) {
        nextParentCommentId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(normalizedParentValue)) {
          return res.status(400).json({
            message: 'Invalid parent comment id.',
          });
        }

        if (normalizedParentValue === id) {
          return res.status(400).json({
            message: 'A comment cannot be its own parent.',
          });
        }

        const parentComment = await Comment.findById(normalizedParentValue);
        if (!parentComment) {
          return res.status(404).json({
            message: 'Parent comment not found.',
          });
        }

        if (
          parentComment.targetType !== nextTargetType ||
          parentComment.targetId.toString() !== nextTargetId
        ) {
          return res.status(400).json({
            message: 'Parent comment target does not match this comment target.',
          });
        }

        nextParentCommentId = parentComment._id;
      }
    } else if (
      comment.parentCommentId &&
      (hasTargetType || hasTargetId) &&
      (await Comment.findById(comment.parentCommentId).select('_id targetType targetId').then(
        (parentComment) =>
          parentComment &&
          (parentComment.targetType !== nextTargetType ||
            parentComment.targetId.toString() !== nextTargetId)
      ))
    ) {
      return res.status(400).json({
        message:
          'Changing target type or target id requires updating parent comment id as well.',
      });
    }

    try {
      comment.text = nextText;
      comment.username = nextUsername;
      comment.targetType = nextTargetType;
      comment.targetId = nextTargetId;
      comment.parentCommentId = nextParentCommentId;

      await comment.save();

      return res.status(200).json({
        comment,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/comments/:id',
  authenticateAdmin,
  requireTabPermission('comments', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid comment id.',
      });
    }

    const comment = await Comment.findByIdAndDelete(id);

    if (!comment) {
      return res.status(404).json({
        message: 'Comment not found.',
      });
    }

    await Comment.deleteMany({ parentCommentId: id });

    return res.status(200).json({
      message: 'Comment deleted.',
    });
  }
);

router.get(
  '/supporters',
  authenticateAdmin,
  requireTabPermission('users', 'read'),
  async (_req, res) => {
    const supporters = await Supporter.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      supporters,
    });
  }
);

router.post(
  '/supporters',
  authenticateAdmin,
  requireTabPermission('users', 'create'),
  async (req, res) => {
    const { name, email, message, phoneNumbers } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPhoneNumbers = Array.isArray(phoneNumbers)
      ? phoneNumbers
          .filter((phoneNumber) => typeof phoneNumber === 'string')
          .map((phoneNumber) => phoneNumber.trim())
          .filter(Boolean)
      : typeof phoneNumbers === 'string'
      ? phoneNumbers
          .split(',')
          .map((phoneNumber) => phoneNumber.trim())
          .filter(Boolean)
      : [];

    if (!normalizedName || !normalizedMessage) {
      return res.status(400).json({
        message: 'Name and message are required.',
      });
    }

    try {
      const supporter = await Supporter.create({
        name: normalizedName,
        message: normalizedMessage,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        phoneNumbers: normalizedPhoneNumbers,
      });

      return res.status(201).json({
        supporter,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/supporters/:id',
  authenticateAdmin,
  requireTabPermission('users', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid supporter id.',
      });
    }

    const supporter = await Supporter.findByIdAndDelete(id);

    if (!supporter) {
      return res.status(404).json({
        message: 'Supporter not found.',
      });
    }

    return res.status(200).json({
      message: 'Supporter deleted.',
    });
  }
);

router.post(
  '/breakdowns',
  authenticateAdmin,
  requireTabPermission('breakdowns', 'create'),
  async (req, res) => {
    const { projectId, title, content, videoUrl } = req.body || {};

    if (
      !mongoose.Types.ObjectId.isValid(projectId) ||
      typeof title !== 'string' ||
      typeof content !== 'string' ||
      !title.trim() ||
      !content.trim()
    ) {
      return res.status(400).json({
        message: 'Project, title, and content are required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    try {
      const breakdown = await ProjectBreakDown.create({
        projectId,
        title: title.trim(),
        content: content.trim(),
        ...(typeof videoUrl === 'string' && videoUrl.trim()
          ? { videoUrl: videoUrl.trim() }
          : {}),
      });

      return res.status(201).json({
        breakdown,
      });
    } catch (error) {
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
  async (req, res) => {
    const { id } = req.params;
    const { projectId, title, content, videoUrl } = req.body || {};

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(projectId) ||
      typeof title !== 'string' ||
      typeof content !== 'string' ||
      !title.trim() ||
      !content.trim()
    ) {
      return res.status(400).json({
        message: 'Breakdown id, project, title, and content are required.',
      });
    }

    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    try {
      const updateDocument = {
        $set: {
          projectId,
          title: title.trim(),
          content: content.trim(),
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
          new: true,
          runValidators: true,
        }
      );

      if (!breakdown) {
        return res.status(404).json({
          message: 'Breakdown not found.',
        });
      }

      return res.status(200).json({
        breakdown,
      });
    } catch (error) {
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

    return res.status(200).json({
      message: 'Breakdown deleted.',
    });
  }
);

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

router.post(
  '/projects',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const { name, thumbnail, description } = req.body || {};

    if (
      typeof name !== 'string' ||
      typeof thumbnail !== 'string' ||
      typeof description !== 'string'
    ) {
      return res.status(400).json({
        message: 'Project name, thumbnail, and description are required.',
      });
    }

    try {
      const project = await Project.create({
        name,
        thumbnail,
        description,
      });

      return res.status(201).json({
        project,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/projects/:id',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const updates = {};
    const { name, thumbnail, description } = req.body || {};

    if (typeof name === 'string') {
      updates.name = name;
    }

    if (typeof thumbnail === 'string') {
      updates.thumbnail = thumbnail;
    }

    if (typeof description === 'string') {
      updates.description = description;
    }

    try {
      const project = await Project.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });

      if (!project) {
        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      return res.status(200).json({
        project,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/projects/:id',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    const videos = await Video.find({ projectId: id });

    await Video.deleteMany({ projectId: id });
    await project.deleteOne();

    videos.forEach((video) => {
      deleteStoredUpload(video.thumbnail);
    });

    return res.status(200).json({
      message: 'Project and related videos deleted.',
    });
  }
);

module.exports = router;

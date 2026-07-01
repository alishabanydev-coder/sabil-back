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
const AboutUsPage = require('./models/aboutUsPage.model');
const Catalogue = require('./models/catalogue.model');
const AppCatalogueConfig = require('./models/appCatalogueConfig.model');
const DonationProject = require('./models/donationProject.model');
const User = require('./models/user.model');
const Donation = require('./models/donation.model');
const {
  createDonationProjectAdminRoutes,
} = require('./donationProjectAdminRoutes');
const { createUserAdminRoutes } = require('./userAdminRoutes');
const {
  ADMIN_ROLES,
  GRANTABLE_ADMIN_TABS,
  getSuperAdminPermissions,
} = require('./adminPermissions');

const router = express.Router();
const videoThumbnailUploadDir = path.join(__dirname, 'uploads', 'video-thumbnails');
const breakdownThumbnailUploadDir = path.join(__dirname, 'uploads', 'breakdown-thumbnails');
const projectThumbnailUploadDir = path.join(__dirname, 'uploads', 'project-thumbnails');
const bannerPosterUploadDir = path.join(__dirname, 'uploads', 'banners');
const blogImageUploadDir = path.join(__dirname, 'uploads', 'blog-images');
const socialMediaIconUploadDir = path.join(__dirname, 'uploads', 'social-media-icons');
const catalogueImageUploadDir = path.join(__dirname, 'uploads', 'catalogue-images');
const appCatalogueHomeUploadDir = path.join(__dirname, 'uploads', 'app-catalogue');

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

const projectThumbnailUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(projectThumbnailUploadDir, { recursive: true });
      callback(null, projectThumbnailUploadDir);
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
    files: 25,
  },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Project thumbnail must be an image file.'));
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

const catalogueImageUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(catalogueImageUploadDir, { recursive: true });
      callback(null, catalogueImageUploadDir);
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
      callback(new Error('Catalogue image must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

const appCatalogueHomeImageUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(appCatalogueHomeUploadDir, { recursive: true });
      callback(null, appCatalogueHomeUploadDir);
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
      callback(new Error('Home image must be an image file.'));
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
      expiresIn: '1h',
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

function getAllowedChannelProjectIds(admin) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return null;
  }

  const permission = getAdminPermission(admin, 'channels');
  const projectIds = Array.isArray(permission?.projectIds) ? permission.projectIds : [];

  return projectIds.map((projectId) => projectId.toString());
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

function uploadProjectThumbnail(req, res, next) {
  projectThumbnailUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'characterImages', maxCount: 24 },
  ])(req, res, (error) => {
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

function uploadCatalogueImage(req, res, next) {
  catalogueImageUpload.single('image')(req, res, (error) => {
    if (!error) {
      return next();
    }

    return res.status(400).json({
      message: error.message,
    });
  });
}

function uploadAppCatalogueHomeImage(req, res, next) {
  appCatalogueHomeImageUpload.single('image')(req, res, (error) => {
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
  if (trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith('/uploads/')) {
    return trimmedPath;
  }

  try {
    const parsedUrl = new URL(trimmedPath);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return parsedUrl.pathname;
    }

    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return trimmedPath;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeProjectThumbnailPath(thumbnailPath) {
  if (typeof thumbnailPath !== 'string' || !thumbnailPath.trim()) {
    return '';
  }

  const trimmedPath = thumbnailPath.trim();
  if (trimmedPath.startsWith('/uploads/')) {
    return trimmedPath;
  }

  try {
    const parsedUrl = new URL(trimmedPath);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return parsedUrl.pathname;
    }
  } catch {
    return '';
  }

  return '';
}

function normalizePublicProjectThumbnailPath(thumbnailPath) {
  if (typeof thumbnailPath !== 'string' || !thumbnailPath.trim()) {
    return '';
  }

  const trimmedPath = thumbnailPath.trim();
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath;
  }

  const uploadsPath = normalizeProjectThumbnailPath(trimmedPath);
  if (uploadsPath) {
    return uploadsPath;
  }

  if (trimmedPath.startsWith('/')) {
    return trimmedPath;
  }

  return '';
}

function normalizeProjectCharacterImagePath(imagePath) {
  return normalizeProjectThumbnailPath(imagePath);
}

function normalizeCatalogueImagePath(imagePath) {
  return normalizeBlogImagePath(imagePath);
}

function normalizeAppCatalogueHomeImagePath(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return '';
  }

  const trimmedPath = imagePath.trim();
  if (trimmedPath.startsWith('/')) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath;
  }

  return '';
}

function normalizeProjectCharacters(characters) {
  if (!Array.isArray(characters)) {
    return [];
  }

  return characters
    .map((item) => {
      const baseCharacter =
        item && typeof item === 'object' && !Array.isArray(item) ? item : {};

      return {
        ...baseCharacter,
        name: typeof item?.name === 'string' ? item.name.trim() : '',
        image: normalizeProjectCharacterImagePath(item?.image),
      };
    })
    .filter((item) => item.name && item.image);
}

function normalizeProjectAsset(project) {
  if (!project || typeof project !== 'object') {
    return project;
  }

  return {
    ...project,
    thumbnail: normalizeProjectThumbnailPath(project.thumbnail),
    characters: normalizeProjectCharacters(project.characters),
  };
}

function getUploadedFilesByField(req, fieldName) {
  if (req?.files && !Array.isArray(req.files)) {
    return Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
  }

  return [];
}

function parseProjectCharactersField(rawCharacters, uploadedCharacterFiles) {
  if (rawCharacters === undefined || rawCharacters === null || rawCharacters === '') {
    if (Array.isArray(uploadedCharacterFiles) && uploadedCharacterFiles.length > 0) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Characters payload is required when character images are uploaded.',
      };
    }

    return {
      ok: true,
      characters: [],
      usedImageFileIndices: [],
      message: '',
    };
  }

  let parsedCharacters;
  if (typeof rawCharacters === 'string') {
    try {
      parsedCharacters = JSON.parse(rawCharacters);
    } catch {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Invalid characters payload.',
      };
    }
  } else if (Array.isArray(rawCharacters)) {
    parsedCharacters = rawCharacters;
  } else {
    return {
      ok: false,
      characters: [],
      usedImageFileIndices: [],
      message: 'Invalid characters payload.',
    };
  }

  if (!Array.isArray(parsedCharacters)) {
    return {
      ok: false,
      characters: [],
      usedImageFileIndices: [],
      message: 'Characters must be an array.',
    };
  }

  const normalizedCharacters = [];
  const usedImageFileIndices = [];

  for (const item of parsedCharacters) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Each character must have a name.',
      };
    }

    let image = '';
    if (Number.isInteger(item?.imageFileIndex)) {
      const uploadedFile = uploadedCharacterFiles[item.imageFileIndex];
      if (uploadedFile?.filename) {
        image = `/uploads/project-thumbnails/${uploadedFile.filename}`;
        usedImageFileIndices.push(item.imageFileIndex);
      } else {
        return {
          ok: false,
          characters: [],
          usedImageFileIndices: [],
          message: `Character "${name}" image file index is invalid.`,
        };
      }
    }

    if (!image && typeof item?.image === 'string') {
      image = normalizeProjectCharacterImagePath(item.image);
    }

    if (!image) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: `Character "${name}" must have an image.`,
      };
    }

    normalizedCharacters.push({
      name,
      image,
    });
  }

  return {
    ok: true,
    characters: normalizedCharacters,
    usedImageFileIndices,
    message: '',
  };
}

async function getOrCreateSiteSettings() {
  const siteSettings = await SiteSettings.findOneAndUpdate(
    { singletonKey: 'main' },
    { $setOnInsert: { singletonKey: 'main' } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return siteSettings;
}

async function getOrCreateAppCatalogueConfig() {
  const config = await AppCatalogueConfig.findOneAndUpdate(
    { singletonKey: 'main' },
    { $setOnInsert: { singletonKey: 'main' } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return config;
}

function toObjectIdString(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return value._id?.toString?.() || value.id?.toString?.() || value.toString?.() || '';
  }

  return '';
}

function uniqueObjectIdStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalizedValue = toObjectIdString(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    result.push(normalizedValue);
  }
  return result;
}

function sortDocumentsByIdOrder(documents, orderedIds) {
  const indexById = new Map(orderedIds.map((id, index) => [id, index]));

  return [...documents].sort((firstItem, secondItem) => {
    const firstId = toObjectIdString(firstItem?._id);
    const secondId = toObjectIdString(secondItem?._id);
    const firstOrder = indexById.has(firstId)
      ? indexById.get(firstId)
      : Number.MAX_SAFE_INTEGER;
    const secondOrder = indexById.has(secondId)
      ? indexById.get(secondId)
      : Number.MAX_SAFE_INTEGER;

    return firstOrder - secondOrder;
  });
}

function shuffleArray(items) {
  const clonedItems = [...items];
  for (let index = clonedItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = clonedItems[index];
    clonedItems[index] = clonedItems[randomIndex];
    clonedItems[randomIndex] = temp;
  }

  return clonedItems;
}

function normalizeAppCatalogueVideo(video) {
  if (!video || typeof video !== 'object') {
    return null;
  }

  return {
    ...video,
    thumbnail: normalizeProjectThumbnailPath(video.thumbnail),
  };
}

function normalizeYoutubeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const normalizedHost = parsedUrl.hostname.toLowerCase();
    if (
      normalizedHost === 'youtube.com' ||
      normalizedHost === 'www.youtube.com' ||
      normalizedHost === 'm.youtube.com' ||
      normalizedHost === 'youtu.be' ||
      normalizedHost === 'www.youtu.be'
    ) {
      return normalizedValue;
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeAboutUsPayload(aboutUs) {
  if (!aboutUs) {
    return null;
  }

  return {
    videoUrl: aboutUs.videoUrl,
    title: aboutUs.title,
    message: aboutUs.message,
    isActive: aboutUs.isActive,
    updatedAt: aboutUs.updatedAt,
  };
}

async function getOrCreateAboutUsPage() {
  const aboutUsPage = await AboutUsPage.findOneAndUpdate(
    { singletonKey: 'main' },
    {
      $setOnInsert: {
        singletonKey: 'main',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'About Us',
        message: 'Update this message from the admin panel.',
        isActive: true,
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return aboutUsPage;
}

const COMMENT_TARGET_TYPES = [
  'video',
  'blog',
  'breakdown',
  'general',
  'project',
  'projectDonation',
];

const COMMENT_TARGET_MODELS = {
  video: Video,
  blog: Blog,
  breakdown: ProjectBreakDown,
  project: Project,
  projectDonation: DonationProject,
};

function normalizeCommentTargetType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidCommentTargetType(targetType) {
  return COMMENT_TARGET_TYPES.includes(targetType);
}

function commentTargetRequiresId(targetType) {
  return targetType !== 'general';
}

function normalizeCommentTargetId(targetType, targetId) {
  if (!commentTargetRequiresId(targetType)) {
    return null;
  }

  if (targetId === undefined || targetId === null || targetId === '') {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(targetId) ? targetId : null;
}

function commentTargetIdsMatch(firstTargetId, secondTargetId) {
  const first = firstTargetId ? firstTargetId.toString() : null;
  const second = secondTargetId ? secondTargetId.toString() : null;
  return first === second;
}

function commentTargetsMatch(firstTargetType, firstTargetId, secondTargetType, secondTargetId) {
  return (
    firstTargetType === secondTargetType &&
    commentTargetIdsMatch(firstTargetId, secondTargetId)
  );
}

async function commentTargetExists(targetType, targetId) {
  if (targetType === 'general') {
    return targetId === null || targetId === undefined;
  }

  if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
    return false;
  }

  const model = COMMENT_TARGET_MODELS[targetType];
  if (!model) {
    return false;
  }

  const target = await model.findById(targetId).select('_id');
  return Boolean(target);
}

async function canAdminAccessCommentTarget(admin, targetType, targetId) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  if (targetType === 'general' || targetType === 'blog') {
    return false;
  }

  const allowedProjectIds = getAllowedChannelProjectIds(admin);
  if (!Array.isArray(allowedProjectIds) || allowedProjectIds.length === 0) {
    return false;
  }

  if (targetType === 'project') {
    return Boolean(targetId && allowedProjectIds.includes(targetId.toString()));
  }

  if (targetType === 'video') {
    const video = await Video.findById(targetId).select('projectId');
    return Boolean(video?.projectId && allowedProjectIds.includes(video.projectId.toString()));
  }

  if (targetType === 'breakdown') {
    const breakdown = await ProjectBreakDown.findById(targetId).select('projectId');
    return Boolean(
      breakdown?.projectId && allowedProjectIds.includes(breakdown.projectId.toString())
    );
  }

  if (targetType === 'projectDonation') {
    return hasPermission(admin, 'donation', 'read');
  }

  return false;
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

function hasProjectScopedChannelAccessForAction(admin, action) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  const channelPermission = getAdminPermission(admin, 'channels');
  if (!channelPermission) {
    return false;
  }

  const canDoAction = Boolean(
    channelPermission[`can${action[0].toUpperCase()}${action.slice(1)}`]
  );
  const hasProjectScope =
    Array.isArray(channelPermission.projectIds) && channelPermission.projectIds.length > 0;

  return canDoAction && hasProjectScope;
}

function requireCommentAccess(action) {
  return (req, res, next) => {
    if (
      hasPermission(req.admin, 'comments', action) ||
      hasProjectScopedChannelAccessForAction(req.admin, action)
    ) {
      return next();
    }

    return res.status(403).json({
      message: `Admin ${action} access is required for comments.`,
    });
  };
}

const MAIN_PAGE_LAYOUT_SECTIONS = {
  banner: 'banner',
  projects: 'projects',
  catalogues: 'catalogues',
  breakdown: 'breakdown',
  video: 'video',
  comment: 'comment',
  blog: 'blog',
};

function normalizeMainPageLayoutSection(section) {
  return typeof section === 'string' ? section.trim().toLowerCase() : '';
}

function parseOptionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true') {
      return true;
    }
    if (normalizedValue === 'false') {
      return false;
    }
  }

  return undefined;
}

function parseOptionalHomepageOrder(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return undefined;
  }

  return parsedValue;
}

function parseOptionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return undefined;
  }

  return parsedValue;
}

function normalizeMainPageLayoutItem(section, item) {
  if (!item) {
    return null;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    return {
      ...item,
      name: item.title,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    return normalizeProjectAsset({
      ...item,
      title: item.name,
    });
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    return {
      ...item,
      showInHomepage: item.isActive === true,
      homepageOrder:
        Number.isInteger(item.order) && item.order > 0 ? item.order : null,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
    const directThumbnail = normalizeProjectThumbnailPath(item.thumbnail);
    const projectThumbnail =
      typeof item.projectId === 'object' &&
      item.projectId &&
      typeof item.projectId.thumbnail === 'string'
        ? normalizeProjectThumbnailPath(item.projectId.thumbnail)
        : '';

    return {
      ...item,
      thumbnail: directThumbnail || projectThumbnail,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    const firstImage =
      Array.isArray(item.image) && typeof item.image[0] === 'string'
        ? normalizeBlogImagePath(item.image[0]) || ''
        : '';

    return {
      ...item,
      images: firstImage,
      image: Array.isArray(item.image)
        ? item.image
            .map((imagePath) => normalizeBlogImagePath(imagePath))
            .filter(Boolean)
        : [],
    };
  }

  return item;
}

async function getMainPageLayoutItems(section) {
  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    const items = await Banner.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      updatedAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    const items = await Project.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    const items = await Catalogue.find({}).sort({
      isActive: -1,
      order: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
    const items = await ProjectBreakDown.find({})
      .populate('projectId', 'thumbnail')
      .sort({
        showInHomepage: -1,
        homepageOrder: 1,
        createdAt: -1,
      });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
    const items = await Video.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => item.toObject());
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.comment) {
    const items = await Comment.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => item.toObject());
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    const items = await Blog.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  return null;
}

function getMainPageLayoutModel(section) {
  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    return Banner;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    return Project;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    return Catalogue;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
    return ProjectBreakDown;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
    return Video;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.comment) {
    return Comment;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    return Blog;
  }

  return null;
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
      returnDocument: 'after',
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
      projects: projects.map((project) =>
        normalizeProjectAsset(project.toObject())
      ),
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
      projects: projects.map((project) =>
        normalizeProjectAsset(project.toObject())
      ),
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

router.get(
  '/channels/projects/:projectId/breakdowns',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId } = req.params;
    const breakdowns = await ProjectBreakDown.find({ projectId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      breakdowns,
    });
  }
);

router.get(
  '/channels/projects/:projectId/catalogues',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId } = req.params;
    const catalogues = await Catalogue.find({ projectId }).sort({
      order: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      catalogues,
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

router.post(
  '/channels/projects/:projectId/catalogues',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  requireChannelProjectAccess,
  uploadCatalogueImage,
  async (req, res) => {
    const { projectId } = req.params;
    const { image, header, body } = req.body || {};
    const normalizedImage = req.file
      ? `/uploads/catalogue-images/${req.file.filename}`
      : normalizeCatalogueImagePath(image);
    const normalizedHeader = typeof header === 'string' ? header.trim() : '';
    const normalizedBody = typeof body === 'string' ? body.trim() : '';

    if (!normalizedImage || !normalizedHeader || !normalizedBody) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'Image, header, and body are required.',
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
      const catalogue = await Catalogue.create({
        projectId,
        image: normalizedImage,
        header: normalizedHeader,
        body: normalizedBody,
      });

      return res.status(201).json({
        catalogue,
      });
    } catch (error) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: error.message,
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

router.patch(
  '/channels/projects/:projectId/catalogues/:catalogueId',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  uploadCatalogueImage,
  async (req, res) => {
    const { projectId, catalogueId } = req.params;
    const { image, header, body } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(catalogueId)) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'Invalid catalogue id.',
      });
    }

    const catalogue = await Catalogue.findOne({ _id: catalogueId, projectId });
    if (!catalogue) {
      deleteUploadedFile(req.file);
      return res.status(404).json({
        message: 'Catalogue not found.',
      });
    }

    const updates = {};
    if (req.file) {
      updates.image = `/uploads/catalogue-images/${req.file.filename}`;
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'image')) {
      const normalizedImage = normalizeCatalogueImagePath(image);
      if (!normalizedImage) {
        return res.status(400).json({
          message: 'image must be a valid URL, data URI, or /uploads path.',
        });
      }
      updates.image = normalizedImage;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'header')) {
      if (typeof header !== 'string' || !header.trim()) {
        deleteUploadedFile(req.file);
        return res.status(400).json({
          message: 'header cannot be empty.',
        });
      }
      updates.header = header.trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'body')) {
      if (typeof body !== 'string' || !body.trim()) {
        deleteUploadedFile(req.file);
        return res.status(400).json({
          message: 'body cannot be empty.',
        });
      }
      updates.body = body.trim();
    }

    if (Object.keys(updates).length === 0) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'Nothing to update.',
      });
    }

    try {
      const previousImage = catalogue.image;
      Object.assign(catalogue, updates);
      await catalogue.save();
      if (req.file && previousImage !== catalogue.image) {
        deleteStoredUpload(previousImage);
      }

      return res.status(200).json({
        catalogue,
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

router.delete(
  '/channels/projects/:projectId/catalogues/:catalogueId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId, catalogueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(catalogueId)) {
      return res.status(400).json({
        message: 'Invalid catalogue id.',
      });
    }

    const catalogue = await Catalogue.findOneAndDelete({ _id: catalogueId, projectId });

    if (!catalogue) {
      return res.status(404).json({
        message: 'Catalogue not found.',
      });
    }

    deleteStoredUpload(catalogue.image);

    return res.status(200).json({
      message: 'Catalogue deleted.',
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
  requireCommentAccess('create'),
  async (req, res) => {
    const { text, username, targetType, targetId, parentCommentId } = req.body || {};
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedTargetType = normalizeCommentTargetType(targetType);
    const normalizedTargetId = normalizeCommentTargetId(normalizedTargetType, targetId);

    if (!normalizedText || !normalizedUsername || !isValidCommentTargetType(normalizedTargetType)) {
      return res.status(400).json({
        message: 'Text, username, and a valid target type are required.',
      });
    }

    if (commentTargetRequiresId(normalizedTargetType) && !normalizedTargetId) {
      return res.status(400).json({
        message: 'Target id is required for this target type.',
      });
    }

    if (!(await commentTargetExists(normalizedTargetType, normalizedTargetId))) {
      return res.status(404).json({
        message: 'Comment target not found.',
      });
    }

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        normalizedTargetType,
        normalizedTargetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
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
        !commentTargetsMatch(
          parentComment.targetType,
          parentComment.targetId,
          normalizedTargetType,
          normalizedTargetId
        )
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
        targetId: normalizedTargetId,
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
  requireCommentAccess('read'),
  async (req, res) => {
    const { targetType, username } = req.query || {};
    const filter = {};

    if (typeof targetType === 'string' && targetType.trim()) {
      const normalizedTargetType = normalizeCommentTargetType(targetType);
      if (!isValidCommentTargetType(normalizedTargetType)) {
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

    if (req.admin?.role !== ADMIN_ROLES.SUPER_ADMIN) {
      const allowedProjectIds = getAllowedChannelProjectIds(req.admin);
      if (!Array.isArray(allowedProjectIds) || allowedProjectIds.length === 0) {
        return res.status(200).json({
          comments: [],
        });
      }

      const [videos, breakdowns] = await Promise.all([
        Video.find({ projectId: { $in: allowedProjectIds } }).select('_id'),
        ProjectBreakDown.find({ projectId: { $in: allowedProjectIds } }).select('_id'),
      ]);

      const allowedVideoIds = videos.map((item) => item._id.toString());
      const allowedBreakdownIds = breakdowns.map((item) => item._id.toString());

      if (filter.targetType === 'video') {
        filter.targetId = { $in: allowedVideoIds };
      } else if (filter.targetType === 'breakdown') {
        filter.targetId = { $in: allowedBreakdownIds };
      } else if (filter.targetType === 'project') {
        filter.targetId = { $in: allowedProjectIds };
      } else if (filter.targetType === 'blog' || filter.targetType === 'general') {
        return res.status(200).json({
          comments: [],
        });
      } else {
        filter.$or = [
          {
            targetType: 'video',
            targetId: { $in: allowedVideoIds },
          },
          {
            targetType: 'breakdown',
            targetId: { $in: allowedBreakdownIds },
          },
          {
            targetType: 'project',
            targetId: { $in: allowedProjectIds },
          },
        ];
      }
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
  requireCommentAccess('update'),
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

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        comment.targetType,
        comment.targetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
      });
    }

    const hasText = typeof text === 'string';
    const hasUsername = typeof username === 'string';
    const hasTargetType = typeof targetType === 'string';
    const hasTargetId = Object.prototype.hasOwnProperty.call(req.body || {}, 'targetId');
    const hasParentCommentId = Object.prototype.hasOwnProperty.call(req.body || {}, 'parentCommentId');

    const nextText = hasText ? text.trim() : comment.text;
    const nextUsername = hasUsername ? username.trim() : comment.username;
    const nextTargetType = hasTargetType
      ? normalizeCommentTargetType(targetType)
      : comment.targetType;
    const nextTargetId = hasTargetId
      ? normalizeCommentTargetId(nextTargetType, targetId)
      : comment.targetId;

    if (!nextText || !nextUsername) {
      return res.status(400).json({
        message: 'Text and username cannot be empty.',
      });
    }

    if (!isValidCommentTargetType(nextTargetType)) {
      return res.status(400).json({
        message: 'Invalid target type.',
      });
    }

    if (commentTargetRequiresId(nextTargetType) && !nextTargetId) {
      return res.status(400).json({
        message: 'Target id is required for this target type.',
      });
    }

    if (!(await commentTargetExists(nextTargetType, nextTargetId))) {
      return res.status(404).json({
        message: 'Comment target not found.',
      });
    }

    if (!(await canAdminAccessCommentTarget(req.admin, nextTargetType, nextTargetId))) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
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
          !commentTargetsMatch(
            parentComment.targetType,
            parentComment.targetId,
            nextTargetType,
            nextTargetId
          )
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
          !commentTargetsMatch(
            parentComment.targetType,
            parentComment.targetId,
            nextTargetType,
            nextTargetId
          )
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
  requireCommentAccess('delete'),
  async (req, res) => {
    const { id } = req.params;

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

    if (
      !(await canAdminAccessCommentTarget(
        req.admin,
        comment.targetType,
        comment.targetId
      ))
    ) {
      return res.status(403).json({
        message: 'You do not have access to this comment target project.',
      });
    }

    await comment.deleteOne();

    await Comment.updateMany(
      { parentCommentId: id },
      {
        $set: {
          parentCommentId: null,
        },
      }
    );

    return res.status(200).json({
      message: 'Comment deleted.',
    });
  }
);

router.get(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'read'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const items = await getMainPageLayoutItems(section);

    if (!items) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    return res.status(200).json(items);
  }
);

router.get(
  '/public/main-page-layout/:section',
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const items = await getMainPageLayoutItems(section);

    if (!items) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    const visibleItems = items
      .filter((item) => item && item.showInHomepage === true)
      .sort((firstItem, secondItem) => {
        const firstOrder =
          Number.isInteger(firstItem.homepageOrder) && firstItem.homepageOrder > 0
            ? firstItem.homepageOrder
            : Number.MAX_SAFE_INTEGER;
        const secondOrder =
          Number.isInteger(secondItem.homepageOrder) && secondItem.homepageOrder > 0
            ? secondItem.homepageOrder
            : Number.MAX_SAFE_INTEGER;
        return firstOrder - secondOrder;
      });

    if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
      const catalogueItems = await getMainPageLayoutItems(
        MAIN_PAGE_LAYOUT_SECTIONS.catalogues
      );
      const visibleCatalogues = Array.isArray(catalogueItems)
        ? catalogueItems
            .filter((item) => item && item.showInHomepage === true)
            .sort((firstItem, secondItem) => {
              const firstOrder =
                Number.isInteger(firstItem.homepageOrder) && firstItem.homepageOrder > 0
                  ? firstItem.homepageOrder
                  : Number.MAX_SAFE_INTEGER;
              const secondOrder =
                Number.isInteger(secondItem.homepageOrder) && secondItem.homepageOrder > 0
                  ? secondItem.homepageOrder
                  : Number.MAX_SAFE_INTEGER;
              return firstOrder - secondOrder;
            })
        : [];

      const cataloguesByProjectId = visibleCatalogues.reduce(
        (accumulator, catalogueItem) => {
          const projectId =
            typeof catalogueItem.projectId === 'string'
              ? catalogueItem.projectId
              : typeof catalogueItem.projectId === 'object' && catalogueItem.projectId
                ? catalogueItem.projectId._id || catalogueItem.projectId.id
                : '';

          if (!projectId) {
            return accumulator;
          }

          if (!Array.isArray(accumulator[projectId])) {
            accumulator[projectId] = [];
          }
          accumulator[projectId].push(catalogueItem);
          return accumulator;
        },
        {}
      );

      const projectsWithCatalogues = visibleItems.map((projectItem) => ({
        ...projectItem,
        catalogues: cataloguesByProjectId[projectItem._id] || [],
      }));

      return res.status(200).json(projectsWithCatalogues);
    }

    return res.status(200).json(visibleItems);
  }
);

router.get('/public/videos', async (req, res) => {
  const homepageOnly = parseOptionalBoolean(req.query?.showInHomepage) === true;
  const filter = homepageOnly ? { showInHomepage: true } : {};

  const videos = await Video.find(filter)
    .populate('projectId', 'name thumbnail')
    .sort({
      season: 1,
      episode: 1,
      createdAt: -1,
    });

  const normalizedVideos = videos.map((video) => {
    const videoObject = video.toObject();
    const projectObject =
      typeof videoObject.projectId === 'object' && videoObject.projectId
        ? videoObject.projectId
        : null;

    return {
      ...videoObject,
      thumbnail: normalizeProjectThumbnailPath(videoObject.thumbnail),
      projectId: projectObject
        ? projectObject._id.toString()
        : typeof videoObject.projectId === 'string'
          ? videoObject.projectId
          : videoObject.projectId?.toString?.() || '',
      projectTitle: projectObject?.name || '',
      projectThumbnail: projectObject
        ? normalizePublicProjectThumbnailPath(projectObject.thumbnail)
        : '',
    };
  });

  return res.status(200).json({
    videos: normalizedVideos,
  });
});

router.get('/public/videos/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({
      message: 'Invalid video id.',
    });
  }

  const video = await Video.findById(videoId).populate(
    'projectId',
    'name thumbnail description'
  );

  if (!video) {
    return res.status(404).json({
      message: 'Video not found.',
    });
  }

  const videoObject = video.toObject();
  const projectObject =
    typeof videoObject.projectId === 'object' && videoObject.projectId
      ? videoObject.projectId
      : null;
  const normalizedProject = projectObject
    ? normalizeProjectAsset({
        ...projectObject,
        title: projectObject.name,
      })
    : null;

  return res.status(200).json({
    video: {
      ...videoObject,
      thumbnail: normalizeProjectThumbnailPath(videoObject.thumbnail),
      projectId: projectObject ? projectObject._id.toString() : videoObject.projectId,
    },
    project: normalizedProject,
  });
});

router.get('/public/projects/:projectId/catalogues', async (req, res) => {
  const { projectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({
      message: 'Invalid project id.',
    });
  }

  const catalogues = await Catalogue.find({
    projectId,
    isActive: true,
  }).sort({
    order: 1,
    createdAt: -1,
  });

  return res.status(200).json({
    catalogues,
  });
});

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
  '/app-catalogue/navigation-buttons',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    try {
      const config = await getOrCreateAppCatalogueConfig();
      const selectedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);

      const [selectedProjectsRaw, availableProjectsRaw] = await Promise.all([
        selectedProjectIds.length > 0
          ? Project.find({ _id: { $in: selectedProjectIds } })
          : Promise.resolve([]),
        Project.find({}).sort({ createdAt: -1 }),
      ]);

      const selectedProjects = sortDocumentsByIdOrder(
        selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
        selectedProjectIds
      );
      const availableProjects = availableProjectsRaw.map((item) =>
        normalizeProjectAsset(item.toObject())
      );
      const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.png';

      return res.status(200).json({
        homeImage,
        selectedProjectIds,
        selectedProjects,
        availableProjects,
        navigationButtons: [
          {
            type: 'home',
            id: 'home',
            title: 'Home',
            image: homeImage,
          },
          ...selectedProjects.map((project) => ({
            type: 'project',
            id: project._id.toString(),
            projectId: project._id.toString(),
            title: project.name,
            image: project.thumbnail,
          })),
        ],
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.put(
  '/app-catalogue/navigation-buttons',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  uploadAppCatalogueHomeImage,
  async (req, res) => {
    const body = req.body || {};
    const rawProjectIds = body.projectIds;
    const parsedProjectIds =
      typeof rawProjectIds === 'string'
        ? (() => {
            try {
              const parsedValue = JSON.parse(rawProjectIds);
              return Array.isArray(parsedValue) ? parsedValue : null;
            } catch {
              return null;
            }
          })()
        : Array.isArray(rawProjectIds)
          ? rawProjectIds
          : [];

    if (!Array.isArray(parsedProjectIds)) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'projectIds must be an array of project ids.',
      });
    }

    const normalizedProjectIds = parsedProjectIds.map((projectId) =>
      typeof projectId === 'string' ? projectId.trim() : ''
    );
    const hasInvalidProjectId = normalizedProjectIds.some(
      (projectId) => !projectId || !mongoose.Types.ObjectId.isValid(projectId)
    );
    if (hasInvalidProjectId) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'projectIds must contain valid project ids.',
      });
    }

    const uniqueProjectIds = new Set(normalizedProjectIds);
    if (uniqueProjectIds.size !== normalizedProjectIds.length) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'projectIds must not contain duplicates.',
      });
    }

    const homeImageFromBody = Object.prototype.hasOwnProperty.call(body, 'homeImage')
      ? normalizeAppCatalogueHomeImagePath(body.homeImage)
      : '';
    if (
      Object.prototype.hasOwnProperty.call(body, 'homeImage') &&
      typeof body.homeImage !== 'undefined' &&
      body.homeImage !== null &&
      typeof body.homeImage !== 'string'
    ) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'homeImage must be a string.',
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, 'homeImage') && !homeImageFromBody) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: 'homeImage is invalid.',
      });
    }

    try {
      if (normalizedProjectIds.length > 0) {
        const existingProjectsCount = await Project.countDocuments({
          _id: { $in: normalizedProjectIds },
        });
        if (existingProjectsCount !== normalizedProjectIds.length) {
          deleteUploadedFile(req.file);
          return res.status(404).json({
            message: 'One or more projects were not found.',
          });
        }
      }

      const config = await getOrCreateAppCatalogueConfig();
      const previousHomeImage = normalizeAppCatalogueHomeImagePath(config.homeImage);
      const nextHomeImage = req.file?.filename
        ? `/uploads/app-catalogue/${req.file.filename}`
        : homeImageFromBody || previousHomeImage || '/home.png';

      config.navigationProjectIds = normalizedProjectIds;
      config.homeImage = nextHomeImage;
      await config.save();

      if (
        req.file?.filename &&
        previousHomeImage &&
        previousHomeImage !== nextHomeImage &&
        previousHomeImage.startsWith('/uploads/app-catalogue/')
      ) {
        deleteStoredUpload(previousHomeImage);
      }

      const selectedProjectsRaw =
        normalizedProjectIds.length > 0
          ? await Project.find({ _id: { $in: normalizedProjectIds } })
          : [];
      const selectedProjects = sortDocumentsByIdOrder(
        selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
        normalizedProjectIds
      );

      return res.status(200).json({
        homeImage: nextHomeImage,
        selectedProjectIds: normalizedProjectIds,
        selectedProjects,
        navigationButtons: [
          {
            type: 'home',
            id: 'home',
            title: 'Home',
            image: nextHomeImage,
          },
          ...selectedProjects.map((project) => ({
            type: 'project',
            id: project._id.toString(),
            projectId: project._id.toString(),
            title: project.name,
            image: project.thumbnail,
          })),
        ],
      });
    } catch (error) {
      deleteUploadedFile(req.file);
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get(
  '/app-catalogue/home-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    try {
      const config = await getOrCreateAppCatalogueConfig();
      const manualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
      const [availableVideosRaw, manualVideosRaw] = await Promise.all([
        Video.find({}).sort({ season: 1, episode: 1, createdAt: -1 }),
        manualVideoIds.length > 0 ? Video.find({ _id: { $in: manualVideoIds } }) : [],
      ]);

      const availableVideos = availableVideosRaw
        .map((item) => normalizeAppCatalogueVideo(item.toObject()))
        .filter(Boolean);
      const manualVideos = sortDocumentsByIdOrder(
        manualVideosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
        manualVideoIds
      ).filter(Boolean);

      return res.status(200).json({
        mode: config.homeVideosMode || 'random',
        manualVideoIds,
        manualVideos,
        availableVideos,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.put(
  '/app-catalogue/home-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const body = req.body || {};
    const hasMode = Object.prototype.hasOwnProperty.call(body, 'mode');
    const hasManualVideoIds = Object.prototype.hasOwnProperty.call(body, 'manualVideoIds');
    const normalizedMode =
      typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';

    if (hasMode && !['random', 'manual'].includes(normalizedMode)) {
      return res.status(400).json({
        message: 'mode must be either random or manual.',
      });
    }

    const parsedManualVideoIds = hasManualVideoIds
      ? typeof body.manualVideoIds === 'string'
        ? (() => {
            try {
              const parsedValue = JSON.parse(body.manualVideoIds);
              return Array.isArray(parsedValue) ? parsedValue : null;
            } catch {
              return null;
            }
          })()
        : Array.isArray(body.manualVideoIds)
          ? body.manualVideoIds
          : null
      : null;

    if (hasManualVideoIds && !Array.isArray(parsedManualVideoIds)) {
      return res.status(400).json({
        message: 'manualVideoIds must be an array of video ids.',
      });
    }

    const normalizedManualVideoIds = Array.isArray(parsedManualVideoIds)
      ? parsedManualVideoIds.map((videoId) =>
          typeof videoId === 'string' ? videoId.trim() : ''
        )
      : [];
    if (
      normalizedManualVideoIds.some(
        (videoId) => !videoId || !mongoose.Types.ObjectId.isValid(videoId)
      )
    ) {
      return res.status(400).json({
        message: 'manualVideoIds must contain valid video ids.',
      });
    }

    const uniqueManualVideoIds = new Set(normalizedManualVideoIds);
    if (uniqueManualVideoIds.size !== normalizedManualVideoIds.length) {
      return res.status(400).json({
        message: 'manualVideoIds must not contain duplicates.',
      });
    }

    try {
      if (normalizedManualVideoIds.length > 0) {
        const existingVideosCount = await Video.countDocuments({
          _id: { $in: normalizedManualVideoIds },
        });
        if (existingVideosCount !== normalizedManualVideoIds.length) {
          return res.status(404).json({
            message: 'One or more videos were not found.',
          });
        }
      }

      const config = await getOrCreateAppCatalogueConfig();
      if (hasMode) {
        config.homeVideosMode = normalizedMode;
      }
      if (hasManualVideoIds) {
        config.manualHomeVideoIds = normalizedManualVideoIds;
      }
      await config.save();

      const finalMode = config.homeVideosMode || 'random';
      const finalManualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
      const manualVideosRaw =
        finalManualVideoIds.length > 0
          ? await Video.find({ _id: { $in: finalManualVideoIds } })
          : [];
      const manualVideos = sortDocumentsByIdOrder(
        manualVideosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
        finalManualVideoIds
      ).filter(Boolean);

      return res.status(200).json({
        mode: finalMode,
        manualVideoIds: finalManualVideoIds,
        manualVideos,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get('/public/app-catalogue/navigation-buttons', async (_req, res) => {
  try {
    const config = await getOrCreateAppCatalogueConfig();
    const selectedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);
    const selectedProjectsRaw =
      selectedProjectIds.length > 0
        ? await Project.find({ _id: { $in: selectedProjectIds } })
        : [];
    const selectedProjects = sortDocumentsByIdOrder(
      selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
      selectedProjectIds
    );
    const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.png';

    return res.status(200).json({
      buttons: [
        {
          type: 'home',
          id: 'home',
          title: 'Home',
          image: homeImage,
        },
        ...selectedProjects.map((project) => ({
          type: 'project',
          id: project._id.toString(),
          projectId: project._id.toString(),
          title: project.name,
          image: project.thumbnail,
        })),
      ],
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.get('/public/app-catalogue/home-videos', async (_req, res) => {
  try {
    const config = await getOrCreateAppCatalogueConfig();
    const mode = config.homeVideosMode || 'random';
    const manualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
    const videosRaw =
      mode === 'manual'
        ? manualVideoIds.length > 0
          ? await Video.find({ _id: { $in: manualVideoIds } })
          : []
        : await Video.find({}).sort({ createdAt: -1 });

    const orderedVideos =
      mode === 'manual'
        ? sortDocumentsByIdOrder(videosRaw, manualVideoIds)
        : shuffleArray(videosRaw);
    const videos = orderedVideos
      .map((item) => normalizeAppCatalogueVideo(item.toObject()))
      .filter(Boolean);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      mode,
      videos,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.get(
  '/about-us',
  authenticateAdmin,
  requireTabPermission('aboutUs', 'read'),
  async (_req, res) => {
    try {
      const aboutUsPage = await getOrCreateAboutUsPage();

      return res.status(200).json({
        aboutUs: normalizeAboutUsPayload(aboutUsPage),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/about-us',
  authenticateAdmin,
  requireTabPermission('aboutUs', 'update'),
  async (req, res) => {
    const body = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, 'videoUrl')) {
      const normalizedVideoUrl = normalizeYoutubeUrl(body.videoUrl);
      if (!normalizedVideoUrl) {
        return res.status(400).json({
          message: 'videoUrl must be a valid YouTube URL (youtube.com or youtu.be).',
        });
      }
      updates.videoUrl = normalizedVideoUrl;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      const normalizedTitle = typeof body.title === 'string' ? body.title.trim() : '';
      if (!normalizedTitle) {
        return res.status(400).json({
          message: 'title is required and cannot be empty.',
        });
      }
      updates.title = normalizedTitle;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'message')) {
      const normalizedMessage = typeof body.message === 'string' ? body.message.trim() : '';
      if (!normalizedMessage) {
        return res.status(400).json({
          message: 'message is required and cannot be empty.',
        });
      }
      updates.message = normalizedMessage;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
      if (typeof body.isActive !== 'boolean') {
        return res.status(400).json({
          message: 'isActive must be a boolean.',
        });
      }
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Nothing to update.',
      });
    }

    try {
      await getOrCreateAboutUsPage();
      const aboutUsPage = await AboutUsPage.findOneAndUpdate(
        { singletonKey: 'main' },
        updates,
        { returnDocument: 'after', runValidators: true }
      );

      return res.status(200).json({
        aboutUs: normalizeAboutUsPayload(aboutUsPage),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get('/public/about-us', async (_req, res) => {
  const aboutUsPage = await AboutUsPage.findOne({
    singletonKey: 'main',
    isActive: true,
  }).select('videoUrl title message');

  return res.status(200).json({
    aboutUs: aboutUsPage
      ? {
          videoUrl: aboutUsPage.videoUrl,
          title: aboutUsPage.title,
          message: aboutUsPage.message,
        }
      : null,
  });
});

router.put(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
      const orderedIds = req.body?.orderedIds;
      const projectId = req.body?.projectId;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({
          message: 'orderedIds must be an array of item ids.',
        });
      }

      if (typeof projectId !== 'string' || !mongoose.Types.ObjectId.isValid(projectId)) {
        return res.status(400).json({
          message: 'projectId must be a valid project id.',
        });
      }

      const hasInvalidId = orderedIds.some(
        (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
      );
      if (hasInvalidId) {
        return res.status(400).json({
          message: 'orderedIds must contain valid item ids.',
        });
      }

      const uniqueIds = new Set(orderedIds);
      if (uniqueIds.size !== orderedIds.length) {
        return res.status(400).json({
          message: 'orderedIds must not contain duplicates.',
        });
      }

      try {
        if (orderedIds.length > 0) {
          const existingItemsCount = await Catalogue.countDocuments({
            projectId,
            _id: { $in: orderedIds },
          });

          if (existingItemsCount !== orderedIds.length) {
            return res.status(404).json({
              message: 'One or more items were not found.',
            });
          }
        }

        await Catalogue.updateMany(
          {
            projectId,
            isActive: true,
            _id: { $nin: orderedIds },
          },
          {
            $set: {
              isActive: false,
              order: 0,
            },
          }
        );

        if (orderedIds.length > 0) {
          await Catalogue.bulkWrite(
            orderedIds.map((id, index) => ({
              updateOne: {
                filter: { _id: id, projectId },
                update: {
                  $set: {
                    isActive: true,
                    order: index + 1,
                  },
                },
              },
            }))
          );
        }

        const items = await getMainPageLayoutItems(section);

        return res.status(200).json({
          items,
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }

    const model = getMainPageLayoutModel(section);

    if (!model) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    const orderedIds = req.body?.orderedIds;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({
        message: 'orderedIds must be an array of item ids.',
      });
    }

    const hasInvalidId = orderedIds.some(
      (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
    );
    if (hasInvalidId) {
      return res.status(400).json({
        message: 'orderedIds must contain valid item ids.',
      });
    }

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return res.status(400).json({
        message: 'orderedIds must not contain duplicates.',
      });
    }

    try {
      if (orderedIds.length > 0) {
        const existingItemsCount = await model.countDocuments({
          _id: { $in: orderedIds },
        });

        if (existingItemsCount !== orderedIds.length) {
          return res.status(404).json({
            message: 'One or more items were not found.',
          });
        }
      }

      await model.updateMany(
        {
          showInHomepage: true,
          _id: { $nin: orderedIds },
        },
        {
          $set: {
            showInHomepage: false,
            homepageOrder: null,
          },
        }
      );

      if (orderedIds.length > 0) {
        await model.bulkWrite(
          orderedIds.map((id, index) => ({
            updateOne: {
              filter: { _id: id },
              update: {
                $set: {
                  showInHomepage: true,
                  homepageOrder: index + 1,
                },
              },
            },
          }))
        );
      }

      const items = await getMainPageLayoutItems(section);

      return res.status(200).json({
        items,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/main-page-layout/:section/:id',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const { id } = req.params;
    if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid item id.',
        });
      }

      const { showInHomepage, homepageOrder } = req.body || {};
      const updates = {};

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'showInHomepage')) {
        const parsedShowInHomepage = parseOptionalBoolean(showInHomepage);
        if (parsedShowInHomepage === undefined) {
          return res.status(400).json({
            message: 'showInHomepage must be a boolean.',
          });
        }
        updates.showInHomepage = parsedShowInHomepage;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'homepageOrder')) {
        const parsedHomepageOrder = parseOptionalHomepageOrder(homepageOrder);
        if (parsedHomepageOrder === undefined) {
          return res.status(400).json({
            message: 'homepageOrder must be a positive integer or null.',
          });
        }
        updates.homepageOrder = parsedHomepageOrder;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: 'Nothing to update.',
        });
      }

      if (updates.showInHomepage === false) {
        updates.homepageOrder = null;
      }

      const catalogueUpdates = {};
      if (Object.prototype.hasOwnProperty.call(updates, 'showInHomepage')) {
        catalogueUpdates.isActive = updates.showInHomepage;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'homepageOrder')) {
        catalogueUpdates.order =
          updates.homepageOrder === null ? 0 : updates.homepageOrder;
      }

      try {
        const item = await Catalogue.findByIdAndUpdate(id, catalogueUpdates, {
          returnDocument: 'after',
          runValidators: true,
        });

        if (!item) {
          return res.status(404).json({
            message: 'Item not found.',
          });
        }

        return res.status(200).json({
          item: normalizeMainPageLayoutItem(section, item.toObject()),
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }

    const model = getMainPageLayoutModel(section);

    if (!model) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid item id.',
      });
    }

    const { showInHomepage, homepageOrder } = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'showInHomepage')) {
      const parsedShowInHomepage = parseOptionalBoolean(showInHomepage);
      if (parsedShowInHomepage === undefined) {
        return res.status(400).json({
          message: 'showInHomepage must be a boolean.',
        });
      }
      updates.showInHomepage = parsedShowInHomepage;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'homepageOrder')) {
      const parsedHomepageOrder = parseOptionalHomepageOrder(homepageOrder);
      if (parsedHomepageOrder === undefined) {
        return res.status(400).json({
          message: 'homepageOrder must be a positive integer or null.',
        });
      }
      updates.homepageOrder = parsedHomepageOrder;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Nothing to update.',
      });
    }

    if (updates.showInHomepage === false) {
      updates.homepageOrder = null;
    }

    try {
      const item = await model.findByIdAndUpdate(id, updates, {
        returnDocument: 'after',
        runValidators: true,
      });

      if (!item) {
        return res.status(404).json({
          message: 'Item not found.',
        });
      }

      let normalizedItem = item.toObject();
      if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
        const itemWithProject = await ProjectBreakDown.findById(item._id).populate(
          'projectId',
          'thumbnail'
        );
        normalizedItem = itemWithProject ? itemWithProject.toObject() : normalizedItem;
      }

      return res.status(200).json({
        item: normalizeMainPageLayoutItem(section, normalizedItem),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
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

router.post('/public/supporters', async (req, res) => {
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
});

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
  uploadProjectThumbnail,
  async (req, res) => {
    const { name, description, characters } = req.body || {};
    const thumbnailFile = getUploadedFilesByField(req, 'thumbnail')[0];
    const uploadedCharacterFiles = getUploadedFilesByField(req, 'characterImages');
    const uploadedProjectFiles = [thumbnailFile, ...uploadedCharacterFiles].filter(
      Boolean
    );
    const parsedCharacters = parseProjectCharactersField(
      characters,
      uploadedCharacterFiles
    );
    const unusedUploadedCharacterFiles = uploadedCharacterFiles.filter(
      (_file, index) => !parsedCharacters.usedImageFileIndices?.includes(index)
    );

    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      !name.trim() ||
      !description.trim() ||
      !thumbnailFile ||
      !parsedCharacters.ok
    ) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message:
          parsedCharacters.ok
            ? 'Project name, thumbnail, and description are required.'
            : parsedCharacters.message,
      });
    }

    const nextThumbnail = `/uploads/project-thumbnails/${thumbnailFile.filename}`;

    try {
      const project = await Project.create({
        name: name.trim(),
        thumbnail: nextThumbnail,
        description: description.trim(),
        characters: parsedCharacters.characters,
      });
      deleteUploadedFiles(unusedUploadedCharacterFiles);

      return res.status(201).json({
        project: normalizeProjectAsset(project.toObject()),
      });
    } catch (error) {
      deleteUploadedFiles(uploadedProjectFiles);

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
  uploadProjectThumbnail,
  async (req, res) => {
    const { id } = req.params;
    const thumbnailFile = getUploadedFilesByField(req, 'thumbnail')[0];
    const uploadedCharacterFiles = getUploadedFilesByField(req, 'characterImages');
    const uploadedProjectFiles = [thumbnailFile, ...uploadedCharacterFiles].filter(
      Boolean
    );

    if (!mongoose.Types.ObjectId.isValid(id)) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const updates = {};
    const { name, description, characters } = req.body || {};

    if (typeof name === 'string') {
      updates.name = name.trim();
    }

    if (typeof description === 'string') {
      updates.description = description.trim();
    }

    if (thumbnailFile) {
      updates.thumbnail = `/uploads/project-thumbnails/${thumbnailFile.filename}`;
    }

    if (characters !== undefined) {
      const parsedCharacters = parseProjectCharactersField(
        characters,
        uploadedCharacterFiles
      );
      const unusedUploadedCharacterFiles = uploadedCharacterFiles.filter(
        (_file, index) => !parsedCharacters.usedImageFileIndices?.includes(index)
      );
      if (!parsedCharacters.ok) {
        deleteUploadedFiles(uploadedProjectFiles);

        return res.status(400).json({
          message: parsedCharacters.message,
        });
      }

      updates.characters = parsedCharacters.characters;
      deleteUploadedFiles(unusedUploadedCharacterFiles);
    }

    try {
      const project = await Project.findById(id);

      if (!project) {
        deleteUploadedFiles(uploadedProjectFiles);

        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      const previousThumbnail = project.thumbnail;
      const previousCharacterImages = Array.isArray(project.characters)
        ? project.characters.map((item) => item.image)
        : [];
      Object.assign(project, updates);
      await project.save();

      if (thumbnailFile && previousThumbnail !== project.thumbnail) {
        deleteStoredUpload(previousThumbnail);
      }

      const nextCharacterImages = Array.isArray(project.characters)
        ? project.characters.map((item) => item.image)
        : [];

      previousCharacterImages.forEach((imagePath) => {
        if (!nextCharacterImages.includes(imagePath)) {
          deleteStoredUpload(imagePath);
        }
      });

      return res.status(200).json({
        project: normalizeProjectAsset(project.toObject()),
      });
    } catch (error) {
      deleteUploadedFiles(uploadedProjectFiles);

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

    const [videos, catalogues] = await Promise.all([
      Video.find({ projectId: id }),
      Catalogue.find({ projectId: id }),
    ]);

    await Promise.all([
      Video.deleteMany({ projectId: id }),
      Catalogue.deleteMany({ projectId: id }),
    ]);
    await project.deleteOne();

    videos.forEach((video) => {
      deleteStoredUpload(video.thumbnail);
    });
    catalogues.forEach((catalogue) => {
      deleteStoredUpload(catalogue.image);
    });
    deleteStoredUpload(project.thumbnail);
    if (Array.isArray(project.characters)) {
      project.characters.forEach((character) => {
        deleteStoredUpload(character.image);
      });
    }

    return res.status(200).json({
      message: 'Project and related content deleted.',
    });
  }
);

createDonationProjectAdminRoutes({
  router,
  mongoose,
  DonationProject,
  Blog,
  ProjectBreakDown,
  authenticateAdmin,
  requireTabPermission,
  deleteUploadedFiles,
  deleteUploadedFile,
  getUploadedFilesByField,
});

createUserAdminRoutes({
  router,
  mongoose,
  User,
  Donation,
  DonationProject,
  authenticateAdmin,
  requireTabPermission,
});

module.exports = router;

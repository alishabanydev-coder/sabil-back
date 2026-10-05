const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const AppCatalogueConfig = require('../../models/appCatalogueConfig.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteStoredUpload,
} = require('../../lib/uploads');
const {
  normalizeAppCatalogueHomeImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const {
  isVideoPublished,
  keepPublishedVideoIdsInOrder,
  publishedVideoQuery,
} = require('../../lib/videos');

const appCatalogueHomeUploadDir = path.join(__dirname, '..', '..', 'uploads', 'app-catalogue');

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

async function keepExistingIdsInOrder(model, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const existingDocs = await model.find({ _id: { $in: ids } }).select('_id');
  const existingIdSet = new Set(existingDocs.map((doc) => doc._id.toString()));

  return ids.filter((id) => existingIdSet.has(id));
}
function parseOrderedObjectIdArray(value, fieldName) {
  const parsedValue =
    typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : Array.isArray(value)
        ? value
        : null;

  if (!Array.isArray(parsedValue)) {
    return {
      ok: false,
      ids: [],
      message: `${fieldName} must be an array of ids.`,
    };
  }

  const ids = parsedValue.map((id) => (typeof id === 'string' ? id.trim() : ''));
  if (ids.some((id) => !id || !mongoose.Types.ObjectId.isValid(id))) {
    return {
      ok: false,
      ids: [],
      message: `${fieldName} must contain valid ids.`,
    };
  }

  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      ids: [],
      message: `${fieldName} must not contain duplicates.`,
    };
  }

  return {
    ok: true,
    ids,
    message: '',
  };
}

async function getOrderedNormalizedVideos(videoIds) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return [];
  }

  const videosRaw = await Video.find({ _id: { $in: videoIds } });
  return sortDocumentsByIdOrder(
    videosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
    videoIds
  ).filter(Boolean);
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
    isPublished: video.isPublished !== false,
  };
}
const router = express.Router();

router.get(
  '/app-catalogue/navigation-buttons',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    try {
      const config = await getOrCreateAppCatalogueConfig();
      const storedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);
      const selectedProjectIds = await keepExistingIdsInOrder(Project, storedProjectIds);

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
      const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.webp';

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
      const existingProjectIds = await keepExistingIdsInOrder(
        Project,
        normalizedProjectIds
      );

      const config = await getOrCreateAppCatalogueConfig();
      const previousHomeImage = normalizeAppCatalogueHomeImagePath(config.homeImage);
      const nextHomeImage = req.file?.filename
        ? `/uploads/app-catalogue/${req.file.filename}`
        : homeImageFromBody || previousHomeImage || '/home.webp';

      config.navigationProjectIds = existingProjectIds;
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
        existingProjectIds.length > 0
          ? await Project.find({ _id: { $in: existingProjectIds } })
          : [];
      const selectedProjects = sortDocumentsByIdOrder(
        selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
        existingProjectIds
      );

      return res.status(200).json({
        homeImage: nextHomeImage,
        selectedProjectIds: existingProjectIds,
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
      const storedManualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
      const manualVideoIds = await keepPublishedVideoIdsInOrder(storedManualVideoIds);
      const [availableVideosRaw, manualVideosRaw] = await Promise.all([
        Video.find({}).sort({ season: 1, episode: 1, createdAt: -1 }),
        manualVideoIds.length > 0
          ? Video.find(publishedVideoQuery({ _id: { $in: manualVideoIds } }))
          : [],
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
      const existingManualVideoIds = hasManualVideoIds
        ? await keepPublishedVideoIdsInOrder(normalizedManualVideoIds)
        : [];

      const config = await getOrCreateAppCatalogueConfig();
      if (hasMode) {
        config.homeVideosMode = normalizedMode;
      }
      if (hasManualVideoIds) {
        config.manualHomeVideoIds = existingManualVideoIds;
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

router.get(
  '/app-catalogue/suggested-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (_req, res) => {
    try {
      const config = await getOrCreateAppCatalogueConfig();
      const storedSuggestedVideoIds = uniqueObjectIdStrings(
        config.suggestedVideoIds || []
      );
      const videoIds = await keepPublishedVideoIdsInOrder(storedSuggestedVideoIds);
      const [availableVideosRaw, suggestedVideos] = await Promise.all([
        Video.find({}).sort({
          season: 1,
          episode: 1,
          createdAt: -1,
        }),
        getOrderedNormalizedVideos(videoIds),
      ]);

      return res.status(200).json({
        videoIds,
        videos: suggestedVideos,
        availableVideos: availableVideosRaw
          .map((item) => normalizeAppCatalogueVideo(item.toObject()))
          .filter(Boolean),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.put(
  '/app-catalogue/suggested-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const parsedVideoIds = parseOrderedObjectIdArray(
      req.body?.videoIds,
      'videoIds'
    );

    if (!parsedVideoIds.ok) {
      return res.status(400).json({
        message: parsedVideoIds.message,
      });
    }

    try {
      const videoIds = await keepPublishedVideoIdsInOrder(parsedVideoIds.ids);
      const config = await getOrCreateAppCatalogueConfig();
      config.suggestedVideoIds = videoIds;
      await config.save();

      return res.status(200).json({
        videoIds,
        videos: await getOrderedNormalizedVideos(videoIds),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get(
  '/app-catalogue/projects/:projectId/featured-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'read'),
  async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      const storedFeaturedVideoIds = uniqueObjectIdStrings(
        project.featuredVideoIds || []
      );
      const [channelVideosRaw, existingFeaturedIds] = await Promise.all([
        Video.find({ projectId }).sort({
          season: 1,
          episode: 1,
          createdAt: -1,
        }),
        keepPublishedVideoIdsInOrder(storedFeaturedVideoIds),
      ]);
      const availableVideos = channelVideosRaw
        .map((item) => normalizeAppCatalogueVideo(item.toObject()))
        .filter(Boolean);
      const availableIdSet = new Set(
        availableVideos.map((video) => String(video._id))
      );
      const videoIds = existingFeaturedIds.filter((id) => availableIdSet.has(id));

      return res.status(200).json({
        projectId,
        videoIds,
        videos: await getOrderedNormalizedVideos(videoIds),
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
  '/app-catalogue/projects/:projectId/featured-videos',
  authenticateAdmin,
  requireTabPermission('appManagement', 'update'),
  async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const parsedVideoIds = parseOrderedObjectIdArray(
      req.body?.videoIds,
      'videoIds'
    );

    if (!parsedVideoIds.ok) {
      return res.status(400).json({
        message: parsedVideoIds.message,
      });
    }

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      const channelVideos = await Video.find(
        publishedVideoQuery({
          _id: { $in: parsedVideoIds.ids },
          projectId,
        })
      ).select('_id');
      const allowedIdSet = new Set(
        channelVideos.map((video) => video._id.toString())
      );
      const videoIds = parsedVideoIds.ids.filter((id) => allowedIdSet.has(id));
      project.featuredVideoIds = videoIds;
      await project.save();

      return res.status(200).json({
        projectId,
        videoIds,
        videos: await getOrderedNormalizedVideos(videoIds),
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
    const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.webp';

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
          ? await Video.find(
              publishedVideoQuery({ _id: { $in: manualVideoIds } })
            )
          : []
        : await Video.find(publishedVideoQuery()).sort({ createdAt: -1 });

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

router.get('/public/app-catalogue/suggested-videos', async (_req, res) => {
  try {
    const config = await getOrCreateAppCatalogueConfig();
    const storedSuggestedVideoIds = uniqueObjectIdStrings(
      config.suggestedVideoIds || []
    );
    const videoIds = await keepExistingIdsInOrder(Video, storedSuggestedVideoIds);
    const videos = (await getOrderedNormalizedVideos(videoIds)).filter(
      (video) => isVideoPublished(video)
    );

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      videoIds: videos.map((video) => String(video._id)),
      videos,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.get('/public/app-catalogue/featured-videos', async (_req, res) => {
  try {
    const config = await getOrCreateAppCatalogueConfig();
    const selectedProjectIds = uniqueObjectIdStrings(
      config.navigationProjectIds || []
    );
    const projects =
      selectedProjectIds.length > 0
        ? await Project.find({ _id: { $in: selectedProjectIds } }).select(
            '_id featuredVideoIds'
          )
        : [];

    const featuredByProjectId = {};
    await Promise.all(
      projects.map(async (project) => {
        const projectId = project._id.toString();
        const storedFeaturedVideoIds = uniqueObjectIdStrings(
          project.featuredVideoIds || []
        );
        const existingIds = await keepExistingIdsInOrder(
          Video,
          storedFeaturedVideoIds
        );
        const videos = (await getOrderedNormalizedVideos(existingIds)).filter(
          (video) =>
            String(video.projectId) === projectId && isVideoPublished(video)
        );

        featuredByProjectId[projectId] = {
          videoIds: videos.map((video) => String(video._id)),
          videos,
        };
      })
    );

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      featuredByProjectId,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.get(
  '/public/app-catalogue/projects/:projectId/featured-videos',
  async (req, res) => {
    const { projectId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    try {
      const project = await Project.findById(projectId).select(
        '_id featuredVideoIds'
      );
      if (!project) {
        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      const storedFeaturedVideoIds = uniqueObjectIdStrings(
        project.featuredVideoIds || []
      );
      const existingIds = await keepExistingIdsInOrder(
        Video,
        storedFeaturedVideoIds
      );
      const videos = (await getOrderedNormalizedVideos(existingIds)).filter(
        (video) =>
          String(video.projectId) === projectId && isVideoPublished(video)
      );

      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        projectId,
        videoIds: videos.map((video) => String(video._id)),
        videos,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

module.exports = router;


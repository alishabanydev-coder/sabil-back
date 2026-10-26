const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const { ADMIN_ROLES } = require('../../adminPermissions');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const Catalogue = require('../../models/catalogue.model');
const YoutubeChannelToken = require('../../models/youtubeChannelToken.model');
const {
  authenticateAdmin,
  getAdminPermission,
  requireChannelProjectAccess,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteStoredUpload,
} = require('../../lib/uploads');
const {
  normalizeCatalogueImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
  normalizePublicProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const { parseOptionalBoolean } = require('../../lib/parse');
const {
  normalizeAdminChannelVideo,
  isVideoPublished,
  publishedVideoQuery,
} = require('../../lib/videos');
const {
  getGoogleOAuthConfig,
  buildGoogleAuthUrl,
  verifyOAuthStateToken,
  exchangeCodeForTokens,
  fetchMyYouTubeChannelProfile,
  extractYouTubeVideoId,
  fetchYouTubeVideoDetailsByUrlOrId,
} = require('../../lib/youtube');

function parseTagsInput(rawTags) {
  if (Array.isArray(rawTags)) {
    return Array.from(
      new Set(
        rawTags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean)
      )
    );
  }

  if (typeof rawTags === 'string') {
    const trimmed = rawTags.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseTagsInput(parsed);
      }
    } catch {
      // Fallback to comma-separated string
    }

    return Array.from(
      new Set(
        trimmed
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function renderOAuthPopupResultPage({ ok, title, message, channel }) {
  const safePayload = JSON.stringify({
    type: 'YOUTUBE_OAUTH_RESULT',
    ok: Boolean(ok),
    title: title || '',
    message: message || '',
    channel: channel || null,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${ok ? 'YouTube Connected' : 'YouTube Connection Failed'}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #121212;
      color: #ffffff;
    }
    .card {
      max-width: 420px;
      padding: 28px;
      border-radius: 12px;
      background: #1e1e1e;
      box-shadow: 0 12px 32px rgba(0,0,0,0.45);
      text-align: center;
    }
    h2 { margin-top: 0; color: ${ok ? '#4caf50' : '#f44336'}; }
    p { color: #cccccc; line-height: 1.5; }
    button {
      margin-top: 16px;
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      background: #1976d2;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>${ok ? 'YouTube Channel Connected!' : 'Connection Failed'}</h2>
    <p>${message || ''}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
  <script>
    (function() {
      var payload = ${safePayload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
        }
      } catch (e) {}
      if (payload.ok) {
        setTimeout(function() { window.close(); }, 1200);
      }
    })();
  </script>
</body>
</html>`;
}

const videoThumbnailUploadDir = path.join(__dirname, '..', '..', 'uploads', 'video-thumbnails');

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
const catalogueImageUploadDir = path.join(__dirname, '..', '..', 'uploads', 'catalogue-images');

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
const router = express.Router();

async function handleYouTubeOAuthCallback(req, res) {
  const { code, state, error: oauthError } = req.query || {};

  if (oauthError) {
    return res
      .status(400)
      .send(
        renderOAuthPopupResultPage({
          ok: false,
          message: `Google sign-in was cancelled or denied (${oauthError}).`,
        })
      );
  }

  const statePayload = verifyOAuthStateToken(state);
  if (!statePayload) {
    return res
      .status(400)
      .send(
        renderOAuthPopupResultPage({
          ok: false,
          message:
            'The OAuth state token is invalid or expired. Please click "Connect YouTube" again from the Admin panel.',
        })
      );
  }

  if (typeof code !== 'string' || !code.trim()) {
    return res
      .status(400)
      .send(
        renderOAuthPopupResultPage({
          ok: false,
          message: 'Missing authorization code from Google.',
        })
      );
  }

  try {
    const tokenResult = await exchangeCodeForTokens(req, code.trim());
    const channelProfile = await fetchMyYouTubeChannelProfile(tokenResult.accessToken);

    const existingChannel = await YoutubeChannelToken.findOne({
      youtubeChannelId: channelProfile.youtubeChannelId,
    }).select('+refreshToken');

    const refreshTokenToStore =
      tokenResult.refreshToken || existingChannel?.refreshToken || '';

    if (!refreshTokenToStore) {
      return res
        .status(400)
        .send(
          renderOAuthPopupResultPage({
            ok: false,
            message:
              'Google did not return a refresh token. Please try connecting again and ensure you click Allow.',
          })
        );
    }

    const updatedDoc = await YoutubeChannelToken.findOneAndUpdate(
      { youtubeChannelId: channelProfile.youtubeChannelId },
      {
        $set: {
          channelTitle: channelProfile.channelTitle,
          channelThumbnail: channelProfile.channelThumbnail,
          customUrl: channelProfile.customUrl,
          refreshToken: refreshTokenToStore,
          accessToken: tokenResult.accessToken,
          accessTokenExpiresAt: new Date(Date.now() + tokenResult.expiresIn * 1000),
          connectedByAdminId: mongoose.Types.ObjectId.isValid(statePayload.adminId)
            ? statePayload.adminId
            : null,
        },
      },
      { upsert: true, new: true }
    );

    return res.status(200).send(
      renderOAuthPopupResultPage({
        ok: true,
        title: updatedDoc.channelTitle,
        message: `Connected "${updatedDoc.channelTitle}" successfully. This window will close automatically.`,
        channel: {
          _id: updatedDoc._id.toString(),
          youtubeChannelId: updatedDoc.youtubeChannelId,
          channelTitle: updatedDoc.channelTitle,
          channelThumbnail: updatedDoc.channelThumbnail,
          customUrl: updatedDoc.customUrl,
          updatedAt: updatedDoc.updatedAt,
        },
      })
    );
  } catch (error) {
    return res
      .status(400)
      .send(
        renderOAuthPopupResultPage({
          ok: false,
          message: error.message || 'Failed to connect YouTube channel.',
        })
      );
  }
}

router.get(
  '/channels/youtube/channels',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  async (req, res) => {
    const config = getGoogleOAuthConfig(req);
    const channels = await YoutubeChannelToken.find({}).sort({
      channelTitle: 1,
      updatedAt: -1,
    });

    return res.status(200).json({
      oauthConfigured: config.isConfigured,
      redirectUri: config.redirectUri,
      channels: channels.map((doc) => ({
        _id: doc._id.toString(),
        youtubeChannelId: doc.youtubeChannelId,
        channelTitle: doc.channelTitle,
        channelThumbnail: doc.channelThumbnail || '',
        customUrl: doc.customUrl || '',
        updatedAt: doc.updatedAt,
      })),
    });
  }
);

router.get(
  '/channels/youtube/oauth/start',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  async (req, res) => {
    try {
      const authUrl = buildGoogleAuthUrl(req, req.admin?._id);
      return res.status(200).json({
        authUrl,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message || 'Failed to start YouTube OAuth.',
      });
    }
  }
);

router.get('/channels/youtube/oauth/callback', handleYouTubeOAuthCallback);

router.delete(
  '/channels/youtube/channels/:youtubeChannelId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  async (req, res) => {
    const { youtubeChannelId } = req.params;
    const deleted = await YoutubeChannelToken.findOneAndDelete({
      youtubeChannelId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: 'Connected YouTube channel not found.',
      });
    }

    return res.status(200).json({
      message: `Disconnected YouTube channel "${deleted.channelTitle}".`,
    });
  }
);

router.post(
  '/channels/youtube/fetch-video',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  async (req, res) => {
    const { url, videoUrl } = req.body || {};
    const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : videoUrl;

    if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
      return res.status(400).json({
        message: 'Please enter a YouTube video URL first.',
      });
    }

    try {
      const details = await fetchYouTubeVideoDetailsByUrlOrId(targetUrl.trim());
      return res.status(200).json({
        videoDetails: details,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message || 'Failed to fetch video details from YouTube.',
      });
    }
  }
);

router.post(
  '/channels/projects/:projectId/videos/sync-youtube',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  async (req, res) => {
    const { projectId } = req.params;
    const overwriteText = parseOptionalBoolean(req.body?.overwriteText) === true;

    const videos = await Video.find({ projectId }).sort({
      season: 1,
      episode: 1,
      createdAt: -1,
    });

    if (videos.length === 0) {
      return res.status(200).json({
        syncedCount: 0,
        failedCount: 0,
        videos: [],
        message: 'No videos found in this project to sync.',
      });
    }

    let syncedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const video of videos) {
      const videoId = extractYouTubeVideoId(video.url);
      if (!videoId) {
        failedCount += 1;
        errors.push(`"${video.title}": URL is not a recognizable YouTube link.`);
        continue;
      }

      try {
        const details = await fetchYouTubeVideoDetailsByUrlOrId(videoId);

        if (overwriteText && details.title) {
          video.title = details.title.slice(0, 180);
        }
        if (overwriteText && details.description) {
          video.description = details.description;
        }
        if (Array.isArray(details.tags) && details.tags.length > 0) {
          video.tags = details.tags;
        }
        video.viewCount = details.viewCount;
        video.likeCount = details.likeCount;
        video.commentCount = details.commentCount;
        video.youtubeVideoId = details.youtubeVideoId || videoId;
        if (details.youtubeChannelId) {
          video.youtubeChannelId = details.youtubeChannelId;
        }

        await video.save();
        syncedCount += 1;
      } catch (error) {
        failedCount += 1;
        errors.push(`"${video.title}": ${error.message}`);
      }
    }

    const updatedVideos = await Video.find({ projectId }).sort({
      season: 1,
      episode: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      syncedCount,
      failedCount,
      errors,
      videos: updatedVideos.map((v) => normalizeAdminChannelVideo(v)),
      message:
        failedCount === 0
          ? `Synced ${syncedCount} video(s) from YouTube.`
          : `Synced ${syncedCount} video(s), ${failedCount} skipped/failed.`,
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
      videos: videos.map((video) => normalizeAdminChannelVideo(video)),
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
    const { title, description, url, videoUrl, season, episode, isPublished } =
      req.body || {};

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
      const {
        tags,
        viewCount,
        likeCount,
        commentCount,
        youtubeVideoId,
        youtubeChannelId,
      } = req.body || {};

      const video = await Video.create({
        title,
        description,
        url: videoUrlValue,
        thumbnail: `/uploads/video-thumbnails/${req.file.filename}`,
        projectId,
        season: parsedSeason,
        episode: parsedEpisode,
        isPublished: parseOptionalBoolean(isPublished) !== false,
        tags: parseTagsInput(tags),
        viewCount: Math.max(0, Number(viewCount) || 0),
        likeCount: Math.max(0, Number(likeCount) || 0),
        commentCount: Math.max(0, Number(commentCount) || 0),
        youtubeVideoId:
          typeof youtubeVideoId === 'string' && youtubeVideoId.trim()
            ? youtubeVideoId.trim()
            : extractYouTubeVideoId(videoUrlValue) || '',
        youtubeChannelId:
          typeof youtubeChannelId === 'string' ? youtubeChannelId.trim() : '',
      });

      return res.status(201).json({
        video: normalizeAdminChannelVideo(video),
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
    const { title, description, url, videoUrl, thumbnail, season, episode, isPublished } =
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
      const {
        tags,
        viewCount,
        likeCount,
        commentCount,
        youtubeVideoId,
        youtubeChannelId,
      } = req.body || {};

      video.title = title;
      video.description = description;
      video.url = videoUrlValue;
      video.thumbnail = nextThumbnail;
      video.season = parsedSeason;
      video.episode = parsedEpisode;
      video.isPublished = parseOptionalBoolean(isPublished) !== false;

      if (tags !== undefined) {
        video.tags = parseTagsInput(tags);
      }
      if (viewCount !== undefined && viewCount !== '') {
        video.viewCount = Math.max(0, Number(viewCount) || 0);
      }
      if (likeCount !== undefined && likeCount !== '') {
        video.likeCount = Math.max(0, Number(likeCount) || 0);
      }
      if (commentCount !== undefined && commentCount !== '') {
        video.commentCount = Math.max(0, Number(commentCount) || 0);
      }
      if (typeof youtubeVideoId === 'string' && youtubeVideoId.trim()) {
        video.youtubeVideoId = youtubeVideoId.trim();
      } else {
        const extractedId = extractYouTubeVideoId(videoUrlValue);
        if (extractedId) {
          video.youtubeVideoId = extractedId;
        }
      }
      if (typeof youtubeChannelId === 'string' && youtubeChannelId.trim()) {
        video.youtubeChannelId = youtubeChannelId.trim();
      }

      await video.save();
      if (req.file && previousThumbnail !== nextThumbnail) {
        deleteStoredUpload(previousThumbnail);
      }

      return res.status(200).json({
        video: normalizeAdminChannelVideo(video),
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

router.get('/public/videos', async (req, res) => {
  const homepageOnly = parseOptionalBoolean(req.query?.showInHomepage) === true;
  const filter = publishedVideoQuery(
    homepageOnly ? { showInHomepage: true } : {}
  );

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

  if (!video || !isVideoPublished(video)) {
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

router.handleYouTubeOAuthCallback = handleYouTubeOAuthCallback;

module.exports = router;


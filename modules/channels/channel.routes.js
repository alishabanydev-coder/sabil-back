const express = require('express');
const { parseOptionalBoolean } = require('../../lib/parse');
const {
  authenticateAdmin,
  requireChannelProjectAccess,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const { createImageUpload, deleteUploadedFile } = require('../../lib/uploads');
const {
  parseCatalogueCreate,
  parseObjectId,
  parseVideoIdentity,
  parseYouTubeVideoRequest,
} = require('./channel.validation');
const {
  connectYouTubeChannel,
  createProjectCatalogue,
  createProjectVideo,
  deleteProjectCatalogue,
  deleteProjectVideo,
  disconnectYouTubeChannel,
  fetchYouTubeVideoDetails,
  getPublicVideo,
  listChannelProjects,
  listConnectedYouTubeChannels,
  listProjectBreakdowns,
  listProjectCatalogues,
  listProjectVideos,
  listPublicProjectCatalogues,
  listPublicVideos,
  startYouTubeOAuth,
  storeIncomingVideoPoster,
  syncProjectYouTubeVideos,
  updateProjectCatalogue,
  updateProjectVideo,
} = require('./channel.service');

const router = express.Router();

const uploadVideoThumbnail = createImageUpload({
  folder: 'video-thumbnails',
  field: 'thumbnail',
  invalidTypeMessage: 'Thumbnail must be an image file.',
});

const uploadCatalogueImage = createImageUpload({
  folder: 'catalogue-images',
  field: 'image',
  invalidTypeMessage: 'Catalogue image must be an image file.',
});

function reject(res, message) {
  return res.status(400).json({ message });
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

async function handleYouTubeOAuthCallback(req, res) {
  try {
    const connected = await connectYouTubeChannel(req, req.query);
    return res.status(200).send(
      renderOAuthPopupResultPage({
        ok: true,
        title: connected.title,
        message: connected.message,
        channel: connected.channel,
      })
    );
  } catch (error) {
    return res.status(error.statusCode || 400).send(
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
    return res.status(200).json(await listConnectedYouTubeChannels(req));
  }
);

router.get(
  '/channels/youtube/oauth/start',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  async (req, res) => {
    return res.status(200).json(await startYouTubeOAuth(req));
  }
);

router.get('/channels/youtube/oauth/callback', handleYouTubeOAuthCallback);

router.delete(
  '/channels/youtube/channels/:youtubeChannelId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  async (req, res) => {
    const message = await disconnectYouTubeChannel(req.params.youtubeChannelId);
    return res.status(200).json({ message });
  }
);

router.post(
  '/channels/youtube/fetch-video',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  async (req, res) => {
    const parsed = parseYouTubeVideoRequest(req.body);
    if (!parsed.ok) {
      return reject(res, parsed.message);
    }

    const videoDetails = await fetchYouTubeVideoDetails(
      parsed.value.targetUrl,
      parsed.value.previousPoster
    );
    return res.status(200).json({ videoDetails });
  }
);

router.post(
  '/channels/projects/:projectId/videos/sync-youtube',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  async (req, res) => {
    const overwriteText = parseOptionalBoolean(req.body?.overwriteText) === true;
    return res
      .status(200)
      .json(await syncProjectYouTubeVideos(req.params.projectId, overwriteText));
  }
);

router.get(
  '/channels/projects',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  async (req, res) => {
    return res.status(200).json({ projects: await listChannelProjects(req.admin) });
  }
);

router.get(
  '/channels/projects/:projectId/videos',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    return res.status(200).json({ videos: await listProjectVideos(req.params.projectId) });
  }
);

router.get(
  '/channels/projects/:projectId/breakdowns',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    return res.status(200).json({ breakdowns: await listProjectBreakdowns(req.params.projectId) });
  }
);

router.get(
  '/channels/projects/:projectId/catalogues',
  authenticateAdmin,
  requireTabPermission('channels', 'read'),
  requireChannelProjectAccess,
  async (req, res) => {
    return res.status(200).json({ catalogues: await listProjectCatalogues(req.params.projectId) });
  }
);

router.post(
  '/channels/projects/:projectId/videos',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  requireChannelProjectAccess,
  uploadVideoThumbnail,
  async (req, res, next) => {
    let storedThumbnail = '';
    try {
      storedThumbnail = await storeIncomingVideoPoster(req);
    } catch (error) {
      deleteUploadedFile(req.file);
      return reject(res, error.message || 'Failed to save the poster.');
    }

    const parsed = parseVideoIdentity(
      { ...req.body, storedThumbnail },
      { requireThumbnail: true }
    );
    if (!parsed.ok) {
      deleteUploadedFile(req.file);
      return reject(res, parsed.message);
    }

    try {
      const video = await createProjectVideo(req.params.projectId, parsed.value);
      return res.status(201).json({ video });
    } catch (error) {
      deleteUploadedFile(req.file);
      return next(error);
    }
  }
);

router.post(
  '/channels/projects/:projectId/catalogues',
  authenticateAdmin,
  requireTabPermission('channels', 'create'),
  requireChannelProjectAccess,
  uploadCatalogueImage,
  async (req, res, next) => {
    const parsed = parseCatalogueCreate(
      req.body,
      req.file ? `/uploads/catalogue-images/${req.file.filename}` : ''
    );

    try {
      const catalogue = await createProjectCatalogue(req.params.projectId, parsed);
      return res.status(201).json({ catalogue });
    } catch (error) {
      deleteUploadedFile(req.file);
      return next(error);
    }
  }
);

router.patch(
  '/channels/projects/:projectId/videos/:videoId',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  uploadVideoThumbnail,
  async (req, res, next) => {
    const parsedId = parseObjectId(req.params.videoId, 'Invalid video id.');
    if (!parsedId.ok) {
      deleteUploadedFile(req.file);
      return reject(res, parsedId.message);
    }

    const parsed = parseVideoIdentity(req.body, { requireThumbnail: false });
    if (!parsed.ok) {
      deleteUploadedFile(req.file);
      return reject(res, parsed.message);
    }

    let uploadedThumbnail = '';
    try {
      uploadedThumbnail = req.file ? await storeIncomingVideoPoster(req) : '';
    } catch (error) {
      deleteUploadedFile(req.file);
      return reject(res, error.message || 'Failed to save the poster.');
    }

    try {
      const video = await updateProjectVideo(
        req.params.projectId,
        parsedId.value,
        { ...parsed.value, thumbnail: req.body?.thumbnail },
        uploadedThumbnail
      );
      return res.status(200).json({ video });
    } catch (error) {
      deleteUploadedFile(req.file);
      return next(error);
    }
  }
);

router.patch(
  '/channels/projects/:projectId/catalogues/:catalogueId',
  authenticateAdmin,
  requireTabPermission('channels', 'update'),
  requireChannelProjectAccess,
  uploadCatalogueImage,
  async (req, res, next) => {
    const parsedId = parseObjectId(req.params.catalogueId, 'Invalid catalogue id.');
    if (!parsedId.ok) {
      deleteUploadedFile(req.file);
      return reject(res, parsedId.message);
    }

    try {
      const catalogue = await updateProjectCatalogue(
        req.params.projectId,
        parsedId.value,
        req.body || {},
        req.file ? `/uploads/catalogue-images/${req.file.filename}` : ''
      );
      return res.status(200).json({ catalogue });
    } catch (error) {
      deleteUploadedFile(req.file);
      return next(error);
    }
  }
);

router.delete(
  '/channels/projects/:projectId/videos/:videoId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  requireChannelProjectAccess,
  async (req, res) => {
    const parsedId = parseObjectId(req.params.videoId, 'Invalid video id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    await deleteProjectVideo(req.params.projectId, parsedId.value);
    return res.status(200).json({ message: 'Video deleted.' });
  }
);

router.delete(
  '/channels/projects/:projectId/catalogues/:catalogueId',
  authenticateAdmin,
  requireTabPermission('channels', 'delete'),
  requireChannelProjectAccess,
  async (req, res) => {
    const parsedId = parseObjectId(req.params.catalogueId, 'Invalid catalogue id.');
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    await deleteProjectCatalogue(req.params.projectId, parsedId.value);
    return res.status(200).json({ message: 'Catalogue deleted.' });
  }
);

router.get('/public/videos', async (req, res) => {
  const homepageOnly = parseOptionalBoolean(req.query?.showInHomepage) === true;
  return res.status(200).json({ videos: await listPublicVideos(homepageOnly) });
});

router.get('/public/videos/:videoId', async (req, res) => {
  const parsedId = parseObjectId(req.params.videoId, 'Invalid video id.');
  if (!parsedId.ok) {
    return reject(res, parsedId.message);
  }

  return res.status(200).json(await getPublicVideo(parsedId.value));
});

router.get('/public/projects/:projectId/catalogues', async (req, res) => {
  const parsedId = parseObjectId(req.params.projectId, 'Invalid project id.');
  if (!parsedId.ok) {
    return reject(res, parsedId.message);
  }

  return res.status(200).json({
    catalogues: await listPublicProjectCatalogues(parsedId.value),
  });
});

router.handleYouTubeOAuthCallback = handleYouTubeOAuthCallback;

module.exports = router;

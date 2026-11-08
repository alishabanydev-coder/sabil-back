const path = require('path');
const mongoose = require('mongoose');
const { ADMIN_ROLES } = require('../../adminPermissions');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const Catalogue = require('../../models/catalogue.model');
const YoutubeChannelToken = require('../../models/youtubeChannelToken.model');
const { getAdminPermission } = require('../../middleware/adminAuth');
const { deleteStoredUpload } = require('../../lib/uploads');
const {
  normalizeCatalogueImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
  normalizePublicProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const { isVideoPublished, publishedVideoQuery, normalizeAdminChannelVideo } = require('../../lib/videos');
const {
  getGoogleOAuthConfig,
  buildGoogleAuthUrl,
  verifyOAuthStateToken,
  exchangeCodeForTokens,
  fetchMyYouTubeChannelProfile,
  extractYouTubeVideoId,
  fetchYouTubeVideoDetailsByUrlOrId,
} = require('../../lib/youtube');
const {
  buildYouTubePosterFilename,
  convertUploadedPosterFile,
  resolveDeletableVideoThumbnail,
  resolveStoredVideoPoster,
  saveYouTubePosterAsWebp,
} = require('../../lib/posterImage');
const { fail } = require('../../lib/httpError');
const { parseTagsInput } = require('./channel.validation');

async function removePosterIfUnused(posterPath, keepPath = '') {
  const resolved = resolveDeletableVideoThumbnail(posterPath);
  const resolvedKeepPath = resolveDeletableVideoThumbnail(keepPath);
  if (!resolved || resolved === resolvedKeepPath) {
    return;
  }

  const inUse = await Video.exists({ thumbnail: resolved });
  if (!inUse) {
    deleteStoredUpload(resolved);
  }
}

async function storeIncomingVideoPoster(req) {
  if (req.file) {
    await convertUploadedPosterFile(req.file);
    return `/uploads/video-thumbnails/${req.file.filename}`;
  }

  return resolveStoredVideoPoster(req.body?.thumbnail);
}

function duplicateEpisodeMessage(season, episode) {
  return `Season ${season}, episode ${episode} already exists for this project.`;
}

async function listConnectedYouTubeChannels(req) {
  const config = getGoogleOAuthConfig(req);
  const channels = await YoutubeChannelToken.find({}).sort({
    channelTitle: 1,
    updatedAt: -1,
  });

  return {
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
  };
}

async function startYouTubeOAuth(req) {
  try {
    return { authUrl: buildGoogleAuthUrl(req, req.admin?._id) };
  } catch (error) {
    throw fail(400, error.message || 'Failed to start YouTube OAuth.');
  }
}

async function connectYouTubeChannel(req, query = {}) {
  const { code, state, error: oauthError } = query;

  if (oauthError) {
    throw fail(400, `Google sign-in was cancelled or denied (${oauthError}).`);
  }

  const statePayload = verifyOAuthStateToken(state);
  if (!statePayload) {
    throw fail(
      400,
      'The OAuth state token is invalid or expired. Please click "Connect YouTube" again from the Admin panel.'
    );
  }

  if (typeof code !== 'string' || !code.trim()) {
    throw fail(400, 'Missing authorization code from Google.');
  }

  try {
    const tokenResult = await exchangeCodeForTokens(req, code.trim());
    const channelProfile = await fetchMyYouTubeChannelProfile(tokenResult.accessToken);
    const existingChannel = await YoutubeChannelToken.findOne({
      youtubeChannelId: channelProfile.youtubeChannelId,
    }).select('+refreshToken');
    const refreshTokenToStore = tokenResult.refreshToken || existingChannel?.refreshToken || '';

    if (!refreshTokenToStore) {
      throw fail(
        400,
        'Google did not return a refresh token. Please try connecting again and ensure you click Allow.'
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

    return {
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
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw fail(400, error.message || 'Failed to connect YouTube channel.');
  }
}

async function disconnectYouTubeChannel(youtubeChannelId) {
  const deleted = await YoutubeChannelToken.findOneAndDelete({ youtubeChannelId });
  if (!deleted) {
    throw fail(404, 'Connected YouTube channel not found.');
  }

  return `Disconnected YouTube channel "${deleted.channelTitle}".`;
}

async function fetchYouTubeVideoDetails(targetUrl, previousPoster) {
  try {
    const details = await fetchYouTubeVideoDetailsByUrlOrId(targetUrl);
    let posterError = '';

    try {
      const storedPoster = await saveYouTubePosterAsWebp(
        details.thumbnailUrls,
        buildYouTubePosterFilename(details.youtubeVideoId)
      );
      details.thumbnail = storedPoster;
    } catch (error) {
      posterError = error.message || 'Failed to save the YouTube poster.';
    }

    if (details.thumbnail && path.basename(previousPoster).startsWith('yt-')) {
      await removePosterIfUnused(previousPoster, details.thumbnail);
    }

    delete details.thumbnailUrls;

    return {
      ...details,
      posterError,
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }
    throw fail(400, error.message || 'Failed to fetch video details from YouTube.');
  }
}

async function syncProjectYouTubeVideos(projectId, overwriteText) {
  const videos = await Video.find({ projectId }).sort({
    season: 1,
    episode: 1,
    createdAt: -1,
  });

  if (videos.length === 0) {
    return {
      syncedCount: 0,
      failedCount: 0,
      videos: [],
      message: 'No videos found in this project to sync.',
    };
  }

  let syncedCount = 0;
  let failedCount = 0;
  let posterSavedCount = 0;
  let posterFailedCount = 0;
  const errors = [];

  for (const video of videos) {
    const videoId = extractYouTubeVideoId(video.url);
    if (!videoId) {
      failedCount += 1;
      errors.push(`"${video.title}": URL is not a recognizable YouTube link.`);
      continue;
    }

    const previousThumbnail = video.thumbnail;
    let storedPoster = '';

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
      video.duration = Math.max(0, Math.round(Number(details.duration) || 0));
      video.youtubeVideoId = details.youtubeVideoId || videoId;
      if (details.youtubeChannelId) {
        video.youtubeChannelId = details.youtubeChannelId;
      }

      let posterWasSaved = false;
      if (Array.isArray(details.thumbnailUrls) && details.thumbnailUrls.length > 0) {
        try {
          storedPoster = await saveYouTubePosterAsWebp(
            details.thumbnailUrls,
            buildYouTubePosterFilename(videoId)
          );
          video.thumbnail = storedPoster;
          posterWasSaved = true;
        } catch (posterError) {
          posterFailedCount += 1;
          errors.push(
            `"${video.title}" poster: ${posterError.message || 'Failed to save the poster.'}`
          );
        }
      }

      await video.save();
      syncedCount += 1;
      if (posterWasSaved) {
        posterSavedCount += 1;
      }

      if (storedPoster && previousThumbnail !== storedPoster) {
        await removePosterIfUnused(previousThumbnail, storedPoster);
      }
    } catch (error) {
      if (storedPoster) {
        await removePosterIfUnused(storedPoster);
      }
      failedCount += 1;
      errors.push(`"${video.title}": ${error.message}`);
    }
  }

  const updatedVideos = await Video.find({ projectId }).sort({
    season: 1,
    episode: 1,
    createdAt: -1,
  });
  const messageParts = [
    failedCount === 0
      ? `Synced ${syncedCount} video(s) from YouTube.`
      : `Synced ${syncedCount} video(s), ${failedCount} skipped.`,
  ];
  if (posterSavedCount > 0) {
    messageParts.push(`Saved ${posterSavedCount} poster(s) as WebP.`);
  }
  if (posterFailedCount > 0) {
    messageParts.push(`${posterFailedCount} poster(s) could not be saved.`);
  }

  return {
    syncedCount,
    failedCount,
    posterSavedCount,
    posterFailedCount,
    errors,
    videos: updatedVideos.map((video) => normalizeAdminChannelVideo(video)),
    message: messageParts.join(' '),
  };
}

async function listChannelProjects(admin) {
  const permission = getAdminPermission(admin, 'channels');
  const projectIds = permission?.projectIds || [];
  const filter = admin.role === ADMIN_ROLES.SUPER_ADMIN ? {} : { _id: { $in: projectIds } };
  const projects = await Project.find(filter).sort({ createdAt: -1 });
  return projects.map((project) => normalizeProjectAsset(project.toObject()));
}

async function listProjectVideos(projectId) {
  const videos = await Video.find({ projectId }).sort({
    season: 1,
    episode: 1,
    createdAt: -1,
  });
  return videos.map((video) => normalizeAdminChannelVideo(video));
}

async function listProjectBreakdowns(projectId) {
  return ProjectBreakDown.find({ projectId }).sort({ createdAt: -1 });
}

async function listProjectCatalogues(projectId) {
  return Catalogue.find({ projectId }).sort({ order: 1, createdAt: -1 });
}

async function createProjectVideo(projectId, input) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw fail(404, 'Project not found.');
  }

  const existingVideo = await Video.findOne({
    projectId,
    season: input.season,
    episode: input.episode,
  });
  if (existingVideo) {
    throw fail(409, duplicateEpisodeMessage(input.season, input.episode));
  }

  try {
    const video = await Video.create({
      title: input.title,
      description: input.description,
      url: input.videoUrlValue,
      thumbnail: input.storedThumbnail,
      projectId,
      season: input.season,
      episode: input.episode,
      isPublished: input.isPublished,
      tags: parseTagsInput(input.tags),
      viewCount: Math.max(0, Number(input.viewCount) || 0),
      likeCount: Math.max(0, Number(input.likeCount) || 0),
      commentCount: Math.max(0, Number(input.commentCount) || 0),
      duration: Math.max(0, Math.round(Number(input.duration) || 0)),
      youtubeVideoId:
        typeof input.youtubeVideoId === 'string' && input.youtubeVideoId.trim()
          ? input.youtubeVideoId.trim()
          : extractYouTubeVideoId(input.videoUrlValue) || '',
      youtubeChannelId:
        typeof input.youtubeChannelId === 'string' ? input.youtubeChannelId.trim() : '',
    });
    return normalizeAdminChannelVideo(video);
  } catch (error) {
    if (error.code === 11000) {
      throw fail(409, duplicateEpisodeMessage(input.season, input.episode));
    }
    throw error;
  }
}

async function updateProjectVideo(projectId, videoId, input, uploadedThumbnail) {
  const video = await Video.findOne({ _id: videoId, projectId });
  if (!video) {
    throw fail(404, 'Video not found.');
  }

  const existingVideo = await Video.findOne({
    _id: { $ne: videoId },
    projectId,
    season: input.season,
    episode: input.episode,
  });
  if (existingVideo) {
    throw fail(409, duplicateEpisodeMessage(input.season, input.episode));
  }

  const providedThumbnail = uploadedThumbnail ? '' : resolveStoredVideoPoster(input.thumbnail);
  const nextThumbnail = uploadedThumbnail || providedThumbnail || video.thumbnail;
  const previousThumbnail = video.thumbnail;

  video.title = input.title;
  video.description = input.description;
  video.url = input.videoUrlValue;
  video.thumbnail = nextThumbnail;
  video.season = input.season;
  video.episode = input.episode;
  video.isPublished = input.isPublished;

  if (input.tags !== undefined) {
    video.tags = parseTagsInput(input.tags);
  }
  if (input.viewCount !== undefined && input.viewCount !== '') {
    video.viewCount = Math.max(0, Number(input.viewCount) || 0);
  }
  if (input.likeCount !== undefined && input.likeCount !== '') {
    video.likeCount = Math.max(0, Number(input.likeCount) || 0);
  }
  if (input.commentCount !== undefined && input.commentCount !== '') {
    video.commentCount = Math.max(0, Number(input.commentCount) || 0);
  }
  if (input.duration !== undefined && input.duration !== '') {
    video.duration = Math.max(0, Math.round(Number(input.duration) || 0));
  }
  if (typeof input.youtubeVideoId === 'string' && input.youtubeVideoId.trim()) {
    video.youtubeVideoId = input.youtubeVideoId.trim();
  } else {
    const extractedId = extractYouTubeVideoId(input.videoUrlValue);
    if (extractedId) {
      video.youtubeVideoId = extractedId;
    }
  }
  if (typeof input.youtubeChannelId === 'string' && input.youtubeChannelId.trim()) {
    video.youtubeChannelId = input.youtubeChannelId.trim();
  }

  try {
    await video.save();
  } catch (error) {
    if (error.code === 11000) {
      throw fail(409, duplicateEpisodeMessage(input.season, input.episode));
    }
    throw error;
  }

  if (previousThumbnail !== nextThumbnail) {
    await removePosterIfUnused(previousThumbnail, nextThumbnail);
  }

  return normalizeAdminChannelVideo(video);
}

async function createProjectCatalogue(projectId, input) {
  const normalizedImage = input.uploadedImagePath || normalizeCatalogueImagePath(input.image);
  if (!normalizedImage || !input.header || !input.body) {
    throw fail(400, 'Image, header, and body are required.');
  }

  const project = await Project.findById(projectId);
  if (!project) {
    throw fail(404, 'Project not found.');
  }

  const catalogue = await Catalogue.create({
    projectId,
    image: normalizedImage,
    header: input.header,
    body: input.body,
  });

  return catalogue;
}

async function updateProjectCatalogue(projectId, catalogueId, body, uploadedImagePath) {
  const catalogue = await Catalogue.findOne({ _id: catalogueId, projectId });
  if (!catalogue) {
    throw fail(404, 'Catalogue not found.');
  }

  const updates = {};
  if (uploadedImagePath) {
    updates.image = uploadedImagePath;
  } else if (Object.prototype.hasOwnProperty.call(body, 'image')) {
    const normalizedImage = normalizeCatalogueImagePath(body.image);
    if (!normalizedImage) {
      throw fail(400, 'image must be a valid URL, data URI, or /uploads path.');
    }
    updates.image = normalizedImage;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'header')) {
    if (typeof body.header !== 'string' || !body.header.trim()) {
      throw fail(400, 'header cannot be empty.');
    }
    updates.header = body.header.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'body')) {
    if (typeof body.body !== 'string' || !body.body.trim()) {
      throw fail(400, 'body cannot be empty.');
    }
    updates.body = body.body.trim();
  }

  if (Object.keys(updates).length === 0) {
    throw fail(400, 'Nothing to update.');
  }

  const previousImage = catalogue.image;
  Object.assign(catalogue, updates);
  await catalogue.save();
  if (uploadedImagePath && previousImage !== catalogue.image) {
    deleteStoredUpload(previousImage);
  }

  return catalogue;
}

async function deleteProjectVideo(projectId, videoId) {
  const video = await Video.findOneAndDelete({ _id: videoId, projectId });
  if (!video) {
    throw fail(404, 'Video not found.');
  }

  await removePosterIfUnused(video.thumbnail);
}

async function deleteProjectCatalogue(projectId, catalogueId) {
  const catalogue = await Catalogue.findOneAndDelete({ _id: catalogueId, projectId });
  if (!catalogue) {
    throw fail(404, 'Catalogue not found.');
  }

  deleteStoredUpload(catalogue.image);
}

async function listPublicVideos(showInHomepage) {
  const filter = publishedVideoQuery(showInHomepage ? { showInHomepage: true } : {});
  const videos = await Video.find(filter).populate('projectId', 'name thumbnail').sort({
    season: 1,
    episode: 1,
    createdAt: -1,
  });

  return videos.map((video) => {
    const videoObject = video.toObject();
    const projectObject =
      typeof videoObject.projectId === 'object' && videoObject.projectId ? videoObject.projectId : null;

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
}

async function getPublicVideo(videoId) {
  const video = await Video.findById(videoId).populate('projectId', 'name thumbnail description');
  if (!video || !isVideoPublished(video)) {
    throw fail(404, 'Video not found.');
  }

  const videoObject = video.toObject();
  const projectObject =
    typeof videoObject.projectId === 'object' && videoObject.projectId ? videoObject.projectId : null;
  const normalizedProject = projectObject
    ? normalizeProjectAsset({
        ...projectObject,
        title: projectObject.name,
      })
    : null;

  return {
    video: {
      ...videoObject,
      thumbnail: normalizeProjectThumbnailPath(videoObject.thumbnail),
      projectId: projectObject ? projectObject._id.toString() : videoObject.projectId,
    },
    project: normalizedProject,
  };
}

async function listPublicProjectCatalogues(projectId) {
  return Catalogue.find({
    projectId,
    isActive: true,
  }).sort({
    order: 1,
    createdAt: -1,
  });
}

module.exports = {
  storeIncomingVideoPoster,
  listConnectedYouTubeChannels,
  startYouTubeOAuth,
  connectYouTubeChannel,
  disconnectYouTubeChannel,
  fetchYouTubeVideoDetails,
  syncProjectYouTubeVideos,
  listChannelProjects,
  listProjectVideos,
  listProjectBreakdowns,
  listProjectCatalogues,
  createProjectVideo,
  updateProjectVideo,
  createProjectCatalogue,
  updateProjectCatalogue,
  deleteProjectVideo,
  deleteProjectCatalogue,
  listPublicVideos,
  getPublicVideo,
  listPublicProjectCatalogues,
};

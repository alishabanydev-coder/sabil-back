const mongoose = require('mongoose');
const { parseOptionalBoolean } = require('../../lib/parse');

function parseTagsInput(rawTags) {
  if (Array.isArray(rawTags)) {
    return Array.from(
      new Set(
        rawTags.map((tag) => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
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
      // Fallback to comma-separated string.
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

function parseVideoIdentity(body = {}, { requireThumbnail }) {
  const videoUrlValue = typeof body.url === 'string' ? body.url : body.videoUrl;
  const parsedSeason = Number(body.season);
  const parsedEpisode = Number(body.episode);
  const title = body.title;
  const description = body.description;
  const hasThumbnail = !requireThumbnail || Boolean(body.storedThumbnail);

  if (
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof videoUrlValue !== 'string' ||
    !hasThumbnail ||
    !title.trim() ||
    !description.trim() ||
    !videoUrlValue.trim() ||
    !Number.isInteger(parsedSeason) ||
    !Number.isInteger(parsedEpisode) ||
    parsedSeason < 1 ||
    parsedEpisode < 1
  ) {
    return {
      ok: false,
      message: requireThumbnail
        ? 'Video title, description, URL, thumbnail, season, and episode are required.'
        : 'Video title, description, URL, season, and episode are required.',
    };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      videoUrlValue,
      season: parsedSeason,
      episode: parsedEpisode,
      isPublished: parseOptionalBoolean(body.isPublished) !== false,
      tags: body.tags,
      viewCount: body.viewCount,
      likeCount: body.likeCount,
      commentCount: body.commentCount,
      duration: body.duration,
      youtubeVideoId: body.youtubeVideoId,
      youtubeChannelId: body.youtubeChannelId,
      storedThumbnail: body.storedThumbnail || '',
    },
  };
}

function parseYouTubeVideoRequest(body = {}) {
  const { url, videoUrl } = body;
  const targetUrl = typeof url === 'string' && url.trim() ? url.trim() : videoUrl;

  if (typeof targetUrl !== 'string' || !targetUrl.trim()) {
    return { ok: false, message: 'Please enter a YouTube video URL first.' };
  }

  return {
    ok: true,
    value: {
      targetUrl: targetUrl.trim(),
      previousPoster: typeof body.previousPoster === 'string' ? body.previousPoster : '',
    },
  };
}

function parseObjectId(id, message) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { ok: false, message };
  }

  return { ok: true, value: id };
}

function parseCatalogueCreate(body = {}, uploadedImagePath) {
  const normalizedHeader = typeof body.header === 'string' ? body.header.trim() : '';
  const normalizedBody = typeof body.body === 'string' ? body.body.trim() : '';

  return {
    header: normalizedHeader,
    body: normalizedBody,
    uploadedImagePath: uploadedImagePath || '',
    image: body.image,
  };
}

module.exports = {
  parseTagsInput,
  parseVideoIdentity,
  parseYouTubeVideoRequest,
  parseObjectId,
  parseCatalogueCreate,
};

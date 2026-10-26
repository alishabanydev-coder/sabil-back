const Video = require('../models/video.model');
const { normalizeProjectThumbnailPath } = require('./mediaPaths');

async function keepPublishedVideoIdsInOrder(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const existingDocs = await Video.find(
    publishedVideoQuery({ _id: { $in: ids } })
  ).select('_id');
  const existingIdSet = new Set(existingDocs.map((doc) => doc._id.toString()));

  return ids.filter((id) => existingIdSet.has(id));
}

function isVideoPublished(video) {
  return video?.isPublished !== false;
}

function publishedVideoQuery(extra = {}) {
  return {
    isPublished: { $ne: false },
    ...extra,
  };
}

function normalizeAdminChannelVideo(video) {
  const videoObject = video?.toObject ? video.toObject() : { ...video };

  return {
    ...videoObject,
    thumbnail: normalizeProjectThumbnailPath(videoObject.thumbnail),
    isPublished: videoObject.isPublished !== false,
    tags: Array.isArray(videoObject.tags) ? videoObject.tags : [],
    viewCount: Number(videoObject.viewCount) || 0,
    likeCount: Number(videoObject.likeCount) || 0,
    commentCount: Number(videoObject.commentCount) || 0,
    youtubeVideoId: videoObject.youtubeVideoId || '',
    youtubeChannelId: videoObject.youtubeChannelId || '',
  };
}

module.exports = {
  keepPublishedVideoIdsInOrder,
  isVideoPublished,
  publishedVideoQuery,
  normalizeAdminChannelVideo,
};

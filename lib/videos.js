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
  };
}

module.exports = {
  keepPublishedVideoIdsInOrder,
  isVideoPublished,
  publishedVideoQuery,
  normalizeAdminChannelVideo,
};

const express = require('express');
const mongoose = require('mongoose');
const Video = require('../../models/video.model');
const VideoReaction = require('../../models/videoReaction.model');
const { isVideoPublished } = require('../../lib/videos');
const {
  reactionIpRateLimit,
  reactionDeviceRateLimit,
} = require('../../rateLimits');

const router = express.Router();

const COUNTER_FIELD_BY_TYPE = {
  like: 'localLikeCount',
  save: 'saveCount',
};
const ACTIONS = ['add', 'remove'];
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DUPLICATE_KEY_ERROR = 11000;

router.post(
  '/public/videos/:videoId/reactions',
  reactionIpRateLimit,
  reactionDeviceRateLimit,
  async (req, res) => {
    try {
      const { videoId } = req.params;
      const deviceId =
        typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
      const type = req.body?.type;
      const action = req.body?.action;

      if (!mongoose.Types.ObjectId.isValid(videoId)) {
        return res.status(400).json({ message: 'Invalid video id.' });
      }

      if (!DEVICE_ID_PATTERN.test(deviceId)) {
        return res.status(400).json({ message: 'Invalid device id.' });
      }

      const counterField = COUNTER_FIELD_BY_TYPE[type];
      if (!counterField) {
        return res.status(400).json({ message: 'Invalid reaction type.' });
      }

      if (!ACTIONS.includes(action)) {
        return res.status(400).json({ message: 'Invalid reaction action.' });
      }

      const video = await Video.findById(videoId).select(
        `isPublished ${counterField} likeCount`
      );
      if (!video || !isVideoPublished(video)) {
        return res.status(404).json({ message: 'Video not found.' });
      }

      let changed = false;

      if (action === 'add') {
        try {
          await VideoReaction.create({ videoId, deviceId, type });
          changed = true;
        } catch (error) {
          if (error?.code !== DUPLICATE_KEY_ERROR) {
            throw error;
          }
        }
      } else {
        const result = await VideoReaction.deleteOne({ videoId, deviceId, type });
        changed = result.deletedCount === 1;
      }

      let updatedVideo = video;
      if (changed) {
        updatedVideo = await Video.findByIdAndUpdate(
          videoId,
          { $inc: { [counterField]: action === 'add' ? 1 : -1 } },
          { new: true, select: `${counterField} likeCount` }
        );
      }

      let localCount = Number(updatedVideo?.[counterField]) || 0;
      if (localCount < 0) {
        localCount = 0;
        await Video.updateOne({ _id: videoId }, { $set: { [counterField]: 0 } });
      }

      const youtubeLikes =
        type === 'like' ? Math.max(0, Number(updatedVideo?.likeCount) || 0) : 0;

      return res.status(200).json({
        active: action === 'add',
        count: type === 'like' ? localCount + youtubeLikes : localCount,
      });
    } catch (error) {
      return res.status(500).json({
        message: error.message || 'Failed to update reaction.',
      });
    }
  }
);

module.exports = router;

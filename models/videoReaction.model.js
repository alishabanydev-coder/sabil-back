const mongoose = require('mongoose');

const { Schema } = mongoose;

const REACTION_TYPES = ['like', 'save'];

const videoReactionSchema = new Schema(
  {
    videoId: {
      type: Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    type: {
      type: String,
      enum: REACTION_TYPES,
      required: true,
    },
  },
  { timestamps: true }
);

videoReactionSchema.index({ videoId: 1, deviceId: 1, type: 1 }, { unique: true });

const VideoReaction = mongoose.model('VideoReaction', videoReactionSchema);

module.exports = VideoReaction;
module.exports.REACTION_TYPES = REACTION_TYPES;

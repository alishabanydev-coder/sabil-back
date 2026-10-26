const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const youtubeChannelTokenSchema = new Schema(
  {
    youtubeChannelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    channelTitle: {
      type: String,
      required: true,
      trim: true,
    },
    channelThumbnail: {
      type: String,
      default: '',
      trim: true,
    },
    customUrl: {
      type: String,
      default: '',
      trim: true,
    },
    refreshToken: {
      type: String,
      required: true,
      select: false,
    },
    accessToken: {
      type: String,
      default: '',
      select: false,
    },
    accessTokenExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    connectedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  schemaOptions
);

module.exports = mongoose.model('YoutubeChannelToken', youtubeChannelTokenSchema);

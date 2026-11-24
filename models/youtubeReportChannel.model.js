const mongoose = require("mongoose");
const { Schema } = mongoose;

const youtubeReportChannelSchema = new Schema(
  {
    youtubeChannelId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    authorAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    channelTitle: { type: String, required: true, trim: true },
    customUrl: { type: String, default: "", trim: true },
    channelThumbnail: { type: String, default: "", trim: true },
    reachJobId: { type: String, default: "", trim: true },
    refreshToken: { type: String, required: true, select: false },
    accessToken: { type: String, default: "", select: false },
    accessTokenExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "YoutubeReportChannel",
  youtubeReportChannelSchema
);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const bannerSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    poster: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

bannerSchema.index({ isActive: 1, updatedAt: -1 });
bannerSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Banner', bannerSchema);

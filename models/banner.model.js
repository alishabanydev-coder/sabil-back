const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const bannerSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  schemaOptions
);

bannerSchema.index({ isActive: 1, updatedAt: -1 });
bannerSchema.index({ title: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const bannerSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    logo: {
      type: String,
      required: true,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  schemaOptions
);

bannerSchema.index({ isActive: 1, updatedAt: -1 });

module.exports = mongoose.model('Banner', bannerSchema);

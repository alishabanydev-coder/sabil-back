const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const videoSchema = new Schema(
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
    url: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    season: {
      type: Number,
      min: 1,
    },
    episode: {
      type: Number,
      min: 1,
    },
    showInHomepage: {
      type: Boolean,
      default: false,
      index: true,
    },
    homepageOrder: {
      type: Number,
      default: null,
      min: 1,
    },
  },
  schemaOptions
);

videoSchema.index({ projectId: 1, season: 1, episode: 1 }, { unique: true });
videoSchema.index({ title: 1 });
videoSchema.index({ showInHomepage: 1, homepageOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Video', videoSchema);

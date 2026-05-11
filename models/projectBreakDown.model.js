const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const projectBreakDownSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
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

projectBreakDownSchema.index({ projectId: 1, createdAt: -1 });
projectBreakDownSchema.index({ title: 1 });
projectBreakDownSchema.index({ showInHomepage: 1, homepageOrder: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectBreakDown', projectBreakDownSchema);

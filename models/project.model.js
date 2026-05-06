const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
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

projectSchema.index({ name: 1 });
projectSchema.index({ showInHomepage: 1, homepageOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const blogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    subHeader: {
      type: String,
      trim: true,
      maxlength: 260,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: [String],
      default: [],
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

blogSchema.index({ title: 1 });
blogSchema.index({ showInHomepage: 1, homepageOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);

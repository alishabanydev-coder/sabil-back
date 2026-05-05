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
  },
  schemaOptions
);

blogSchema.index({ title: 1 });

module.exports = mongoose.model('Blog', blogSchema);

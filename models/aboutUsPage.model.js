const mongoose = require('mongoose');

const { Schema } = mongoose;

const aboutUsPageSchema = new Schema(
  {
    singletonKey: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
    },
    videoUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
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

module.exports = mongoose.model('AboutUsPage', aboutUsPageSchema);

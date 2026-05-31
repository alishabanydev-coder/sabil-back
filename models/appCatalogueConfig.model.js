const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const appCatalogueConfigSchema = new Schema(
  {
    singletonKey: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
      index: true,
    },
    homeImage: {
      type: String,
      default: '/home.png',
      trim: true,
    },
    navigationProjectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
      default: [],
    },
    homeVideosMode: {
      type: String,
      enum: ['random', 'manual'],
      default: 'random',
      index: true,
    },
    manualHomeVideoIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
      default: [],
    },
  },
  schemaOptions
);

module.exports = mongoose.model('AppCatalogueConfig', appCatalogueConfigSchema);

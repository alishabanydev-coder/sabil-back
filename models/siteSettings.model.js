const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const contactLinkSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    link: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
  },
  { _id: false }
);

const siteSettingsSchema = new Schema(
  {
    singletonKey: {
      type: String,
      default: 'main',
      unique: true,
      immutable: true,
    },
    contactLinks: {
      type: [contactLinkSchema],
      default: [],
    },
  },
  schemaOptions
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
const mongoose = require('mongoose');

const { Schema } = mongoose;

const contactLinkSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const schemaOptions = {
  timestamps: true,
};

const siteSettingsSchema = new Schema(
  {
    contactLinks: {
      type: [contactLinkSchema],
      default: [],
    },
  },
  schemaOptions
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);

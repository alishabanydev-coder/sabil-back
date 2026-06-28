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

const socialMediaLinkSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  icon: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
});

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
    socialMediaLinks: {
      type: [socialMediaLinkSchema],
      default: [],
    },
  },
  schemaOptions
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);

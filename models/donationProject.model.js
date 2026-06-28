const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const DONATION_PROJECT_STATUSES = ['ongoing', 'finished', 'paused'];
const DONATION_CURRENCIES = ['USD', 'INR'];

const contentSectionSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    header: {
      type: String,
      default: null,
      trim: true,
      maxlength: 180,
    },
    text: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20000,
    },
    images: {
      type: [String],
      default: [],
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const faqItemSchema = new Schema(
  {
    header: {
      type: String,
      required: true,
      trim: true,
      maxlength: 260,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const updateRefSchema = new Schema(
  {
    refType: {
      type: String,
      enum: ['Blog', 'BreakDown'],
      required: true,
    },
    refId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const donationProjectSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    poster: {
      type: String,
      required: true,
      trim: true,
    },
    videoUrl: {
      type: String,
      default: null,
      trim: true,
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    goalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    raisedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    donorCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      enum: DONATION_CURRENCIES,
      required: true,
      default: 'USD',
    },
    sections: {
      type: [contentSectionSchema],
      default: [],
    },
    faq: {
      type: [faqItemSchema],
      default: [],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: DONATION_PROJECT_STATUSES,
      required: true,
      default: 'ongoing',
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    updateRefs: {
      type: [updateRefSchema],
      default: [],
    },
    showOnDonationPage: {
      type: Boolean,
      default: true,
      index: true,
    },
    listOrder: {
      type: Number,
      default: null,
      min: 1,
    },
  },
  schemaOptions
);

donationProjectSchema.index({ slug: 1 }, { unique: true });
donationProjectSchema.index({ status: 1, showOnDonationPage: 1, listOrder: 1 });
donationProjectSchema.index({ title: 1 });

module.exports = mongoose.model('DonationProject', donationProjectSchema);

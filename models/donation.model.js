const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const DONATION_CURRENCIES = ['USD', 'INR'];
const DONATION_SOURCES = ['manual', 'patreon', 'whatsapp'];

const donationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    donationProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'DonationProject',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: DONATION_CURRENCIES,
      required: true,
    },
    source: {
      type: String,
      enum: DONATION_SOURCES,
      default: 'manual',
    },
    externalDonorName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
  },
  schemaOptions
);

donationSchema.index({ donationProjectId: 1, createdAt: -1 });
donationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);

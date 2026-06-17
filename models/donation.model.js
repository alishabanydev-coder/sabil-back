const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const DONATION_CURRENCIES = ['USD', 'INR'];

const donationSchema = new Schema(
  {
    donorId: {
      type: Schema.Types.ObjectId,
      ref: 'Donor',
      required: true,
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
  },
  schemaOptions
);

donationSchema.index({ donationProjectId: 1, createdAt: -1 });
donationSchema.index({ donorId: 1, createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);

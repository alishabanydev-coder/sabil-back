const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const donorSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    image: {
      type: String,
      default: null,
      trim: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
      index: true,
    },
    donationsId: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Donation' }],
      default: [],
    },
  },
  schemaOptions
);

donorSchema.index({ name: 1 });
donorSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Donor', donorSchema);

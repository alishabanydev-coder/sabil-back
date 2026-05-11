const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const supporterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    phoneNumbers: {
      type: [String],
      required: true,
      default: [],
    },
  },
  schemaOptions
);

supporterSchema.index({ createdAt: -1 });
supporterSchema.index({ email: 1 });

module.exports = mongoose.model('Supporter', supporterSchema);

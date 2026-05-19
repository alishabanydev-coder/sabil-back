const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const catalogueSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    header: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      min: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      index: true,
    },
  },
  schemaOptions
);

catalogueSchema.index({ projectId: 1, order: 1, createdAt: -1 });
catalogueSchema.index({ projectId: 1, isActive: 1, order: 1, createdAt: -1 });
catalogueSchema.index({ header: 1 });

module.exports = mongoose.model('Catalogue', catalogueSchema);

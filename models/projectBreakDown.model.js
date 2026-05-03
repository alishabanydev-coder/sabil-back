const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const projectBreakDownSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
    },
  },
  schemaOptions
);

projectBreakDownSchema.index({ projectId: 1, createdAt: -1 });
projectBreakDownSchema.index({ title: 1 });

module.exports = mongoose.model('ProjectBreakDown', projectBreakDownSchema);

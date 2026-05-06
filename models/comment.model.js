const mongoose = require('mongoose');

const { Schema } = mongoose;

const VALID_TARGET_TYPES = ['video', 'blog', 'breakdown'];

const schemaOptions = {
  timestamps: true,
};

const commentSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    targetType: {
      type: String,
      enum: VALID_TARGET_TYPES,
      required: true,
      index: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true,
    },
    showInHomepage: {
      type: Boolean,
      default: false,
      index: true,
    },
    homepageOrder: {
      type: Number,
      default: null,
      min: 1,
    },
  },
  schemaOptions
);

commentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });
commentSchema.index({ username: 1 });
commentSchema.index({ showInHomepage: 1, homepageOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);

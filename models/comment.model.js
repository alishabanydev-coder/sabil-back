const mongoose = require('mongoose');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const commentSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    targetType: {
      type: String,
      required: true,
      enum: ['video', 'blog', 'breakdown'],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
  },
  schemaOptions
);

commentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });
commentSchema.index({ username: 1 });

module.exports = mongoose.model('Comment', commentSchema);
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
  },
  schemaOptions
);

commentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', commentSchema);

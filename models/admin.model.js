const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const {
  ADMIN_ROLES,
  ADMIN_TABS,
  getSuperAdminPermissions,
} = require('../adminPermissions');

const { Schema } = mongoose;

const schemaOptions = {
  timestamps: true,
};

const adminPermissionSchema = new Schema(
  {
    tab: {
      type: String,
      enum: ADMIN_TABS,
      required: true,
    },
    canRead: {
      type: Boolean,
      default: false,
    },
    canCreate: {
      type: Boolean,
      default: false,
    },
    canUpdate: {
      type: Boolean,
      default: false,
    },
    canDelete: {
      type: Boolean,
      default: false,
    },
    projectIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Project',
      },
    ],
  },
  { _id: false }
);

const adminSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 80,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(ADMIN_ROLES),
      default: ADMIN_ROLES.ADMIN,
      required: true,
    },
    permissions: {
      type: [adminPermissionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
    },
  },
  schemaOptions
);

adminSchema.index({ userName: 1 }, { unique: true });

adminSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

adminSchema.methods.toAuthJSON = function toAuthJSON() {
  const permissions =
    this.role === ADMIN_ROLES.SUPER_ADMIN
      ? getSuperAdminPermissions()
      : this.permissions;

  return {
    id: this._id.toString(),
    userName: this.userName,
    name: this.name,
    role: this.role,
    permissions,
  };
};

adminSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

module.exports = mongoose.model('Admin', adminSchema);

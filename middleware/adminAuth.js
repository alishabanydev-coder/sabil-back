const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../models/admin.model');
const {
  ADMIN_ROLES,
  GRANTABLE_ADMIN_TABS,
  getSuperAdminPermissions,
} = require('../adminPermissions');

function getJwtSecret() {
  return process.env.ADMIN_JWT_SECRET;
}

function normalizePermissions(permissions = []) {
  return permissions
    .filter((permission) => GRANTABLE_ADMIN_TABS.includes(permission?.tab))
    .filter(
      (permission) =>
        permission.hasAccess === true ||
        permission.canRead === true ||
        permission.canCreate === true ||
        permission.canUpdate === true ||
        permission.canDelete === true
    )
    .map((permission) => ({
      tab: permission.tab,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      projectIds:
        permission.tab === 'channels' && Array.isArray(permission.projectIds)
          ? permission.projectIds.filter((projectId) =>
              mongoose.Types.ObjectId.isValid(projectId)
            )
          : [],
    }));
}

function sanitizeAdmin(admin) {
  return admin.toAuthJSON();
}

function buildToken(admin) {
  const authAdmin = sanitizeAdmin(admin);

  return jwt.sign(
    {
      adminId: authAdmin.id,
      role: authAdmin.role,
      permissions: authAdmin.permissions,
    },
    getJwtSecret(),
    {
      subject: authAdmin.id,
      expiresIn: '1h',
    }
  );
}

async function ensureBootstrapSuperAdmin() {
  const adminUserName = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.ADMIN_JWT_SECRET;

  if (!adminUserName || !adminPassword || !jwtSecret) {
    throw new Error('Admin auth environment variables are not configured.');
  }

  const normalizedUserName = adminUserName.toLowerCase();
  const existingAdmin = await Admin.findOne({ userName: normalizedUserName });

  if (existingAdmin) {
    if (
      existingAdmin.role !== ADMIN_ROLES.SUPER_ADMIN ||
      !existingAdmin.isActive
    ) {
      existingAdmin.role = ADMIN_ROLES.SUPER_ADMIN;
      existingAdmin.permissions = getSuperAdminPermissions();
      existingAdmin.isActive = true;
      await existingAdmin.save();
    }

    return existingAdmin;
  }

  return Admin.create({
    userName: normalizedUserName,
    name: adminUserName,
    passwordHash: await Admin.hashPassword(adminPassword),
    role: ADMIN_ROLES.SUPER_ADMIN,
    permissions: getSuperAdminPermissions(),
    isActive: true,
  });
}

async function authenticateAdmin(req, res, next) {
  const jwtSecret = getJwtSecret();
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;

  if (!jwtSecret) {
    return res.status(500).json({
      message: 'Admin JWT secret is not configured.',
    });
  }

  if (!token) {
    return res.status(401).json({
      message: 'Admin authentication token is required.',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const admin = await Admin.findById(decoded.adminId || decoded.sub);

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        message: 'Admin account is inactive or no longer exists.',
      });
    }

    req.admin = admin;
    return next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired admin token.',
    });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== ADMIN_ROLES.SUPER_ADMIN) {
    return res.status(403).json({
      message: 'Super admin access is required.',
    });
  }

  return next();
}

function getAdminPermission(admin, tab) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return {
      tab,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      projectIds: [],
    };
  }

  return (admin?.permissions || []).find((permission) => permission.tab === tab);
}

function hasChannelProjectAccess(admin, projectId) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  const permission = getAdminPermission(admin, 'channels');
  const projectIds = permission?.projectIds || [];

  return projectIds.some((allowedProjectId) => allowedProjectId.toString() === projectId);
}

function getAllowedChannelProjectIds(admin) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return null;
  }

  const permission = getAdminPermission(admin, 'channels');
  const projectIds = Array.isArray(permission?.projectIds) ? permission.projectIds : [];

  return projectIds.map((projectId) => projectId.toString());
}

function requireChannelProjectAccess(req, res, next) {
  const { projectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({
      message: 'Invalid project id.',
    });
  }

  if (!hasChannelProjectAccess(req.admin, projectId)) {
    return res.status(403).json({
      message: 'Admin access is required for this channel project.',
    });
  }

  return next();
}

function hasPermission(admin, tab, action) {
  const permission = getAdminPermission(admin, tab);

  if (!permission) {
    return false;
  }

  return Boolean(permission[`can${action[0].toUpperCase()}${action.slice(1)}`]);
}

function requireTabPermission(tab, action) {
  return (req, res, next) => {
    if (!hasPermission(req.admin, tab, action)) {
      return res.status(403).json({
        message: `Admin ${action} access is required for ${tab}.`,
      });
    }

    return next();
  };
}

function hasProjectScopedChannelAccessForAction(admin, action) {
  if (admin?.role === ADMIN_ROLES.SUPER_ADMIN) {
    return true;
  }

  const channelPermission = getAdminPermission(admin, 'channels');
  if (!channelPermission) {
    return false;
  }

  const canDoAction = Boolean(
    channelPermission[`can${action[0].toUpperCase()}${action.slice(1)}`]
  );
  const hasProjectScope =
    Array.isArray(channelPermission.projectIds) && channelPermission.projectIds.length > 0;

  return canDoAction && hasProjectScope;
}

function requireCommentAccess(action) {
  return (req, res, next) => {
    if (
      hasPermission(req.admin, 'comments', action) ||
      hasProjectScopedChannelAccessForAction(req.admin, action)
    ) {
      return next();
    }

    return res.status(403).json({
      message: `Admin ${action} access is required for comments.`,
    });
  };
}

module.exports = {
  authenticateAdmin,
  requireSuperAdmin,
  getAdminPermission,
  getAllowedChannelProjectIds,
  requireChannelProjectAccess,
  hasPermission,
  requireTabPermission,
  requireCommentAccess,
  normalizePermissions,
  sanitizeAdmin,
  buildToken,
  ensureBootstrapSuperAdmin,
};

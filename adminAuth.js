const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('./models/admin.model');
const {
  ADMIN_ROLES,
  GRANTABLE_ADMIN_TABS,
  getSuperAdminPermissions,
} = require('./adminPermissions');

const router = express.Router();

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
        permission.tab === 'projects' && Array.isArray(permission.projectIds)
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
      expiresIn: '8h',
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

router.post('/login', async (req, res) => {
  try {
    await ensureBootstrapSuperAdmin();
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }

  const body = req.body || {};
  const userName = typeof body.userName === 'string' ? body.userName : body.username;
  const { password } = body;

  if (typeof userName !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      message: 'Username and password are required.',
    });
  }

  const admin = await Admin.findOne({
    userName: userName.toLowerCase(),
    isActive: true,
  });
  const isValid = admin ? await admin.comparePassword(password) : false;

  if (!isValid) {
    return res.status(401).json({
      message: 'Invalid username or password.',
    });
  }

  const authAdmin = sanitizeAdmin(admin);

  return res.status(200).json({
    token: buildToken(admin),
    ...authAdmin,
  });
});

router.get('/me', authenticateAdmin, (req, res) => {
  return res.status(200).json(sanitizeAdmin(req.admin));
});

router.get('/admins', authenticateAdmin, requireSuperAdmin, async (_req, res) => {
  const admins = await Admin.find({}, '-passwordHash').sort({ createdAt: -1 });

  return res.status(200).json({
    admins,
  });
});

router.post('/admins', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const {
    userName,
    username,
    name,
    password,
    role = ADMIN_ROLES.ADMIN,
    permissions = [],
    isActive = true,
  } = req.body || {};
  const adminUserName = typeof userName === 'string' ? userName : username;

  if (
    typeof adminUserName !== 'string' ||
    typeof name !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({
      message: 'Username, name, and password are required.',
    });
  }

  if (!Object.values(ADMIN_ROLES).includes(role)) {
    return res.status(400).json({
      message: 'Invalid admin role.',
    });
  }

  try {
    const admin = await Admin.create({
      userName: adminUserName.toLowerCase(),
      name,
      passwordHash: await Admin.hashPassword(password),
      role,
      permissions:
        role === ADMIN_ROLES.SUPER_ADMIN
          ? getSuperAdminPermissions()
          : normalizePermissions(permissions),
      isActive: Boolean(isActive),
      createdBy: req.admin._id,
    });

    return res.status(201).json({
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An admin with this username already exists.',
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }
});

router.patch('/admins/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: 'Invalid admin id.',
    });
  }

  const updates = {};
  const { userName, username, name, password, role, permissions, isActive } =
    req.body || {};
  const adminUserName = typeof userName === 'string' ? userName : username;

  if (typeof adminUserName === 'string') {
    updates.userName = adminUserName.toLowerCase();
  }

  if (typeof name === 'string') {
    updates.name = name;
  }

  if (typeof password === 'string' && password.length > 0) {
    updates.passwordHash = await Admin.hashPassword(password);
  }

  if (typeof role === 'string') {
    if (!Object.values(ADMIN_ROLES).includes(role)) {
      return res.status(400).json({
        message: 'Invalid admin role.',
      });
    }

    updates.role = role;
  }

  if (Array.isArray(permissions)) {
    updates.permissions = normalizePermissions(permissions);
  }

  if (typeof isActive === 'boolean') {
    updates.isActive = isActive;
  }

  if (updates.role === ADMIN_ROLES.SUPER_ADMIN) {
    updates.permissions = getSuperAdminPermissions();
  }

  try {
    const admin = await Admin.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!admin) {
      return res.status(404).json({
        message: 'Admin not found.',
      });
    }

    return res.status(200).json({
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'An admin with this username already exists.',
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }
});

router.delete('/admins/:id', authenticateAdmin, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: 'Invalid admin id.',
    });
  }

  if (req.admin._id.equals(id)) {
    return res.status(400).json({
      message: 'A super admin cannot delete their own account.',
    });
  }

  const admin = await Admin.findByIdAndDelete(id);

  if (!admin) {
    return res.status(404).json({
      message: 'Admin not found.',
    });
  }

  return res.status(200).json({
    message: 'Admin deleted.',
  });
});

module.exports = router;

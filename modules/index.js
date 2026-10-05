const express = require('express');
const mongoose = require('mongoose');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../middleware/adminAuth');
const {
  deleteUploadedFile,
  deleteUploadedFiles,
  getUploadedFilesByField,
} = require('../lib/uploads');
const DonationProject = require('../models/donationProject.model');
const Blog = require('../models/blog.model');
const ProjectBreakDown = require('../models/projectBreakDown.model');
const User = require('../models/user.model');
const Donation = require('../models/donation.model');
const { createDonationProjectAdminRoutes } = require('./donations/donation.routes');
const { createUserAdminRoutes } = require('./users/user.admin.routes');

const router = express.Router();

router.use(require('./admins/admin.routes'));
router.use(require('./projects/project.routes'));
router.use(require('./channels/channel.routes'));
router.use(require('./breakdowns/breakdown.routes'));
router.use(require('./blogs/blog.routes'));
router.use(require('./comments/comment.routes'));
router.use(require('./mainPageLayout/mainPageLayout.routes'));
router.use(require('./appCatalogue/appCatalogue.routes'));
router.use(require('./aboutUs/aboutUs.routes'));
router.use(require('./supporters/supporter.routes'));
router.use(require('./banners/banner.routes'));
router.use(require('./socialMedia/socialMedia.routes'));

createDonationProjectAdminRoutes({
  router,
  mongoose,
  DonationProject,
  Blog,
  ProjectBreakDown,
  authenticateAdmin,
  requireTabPermission,
  deleteUploadedFiles,
  deleteUploadedFile,
  getUploadedFilesByField,
});

createUserAdminRoutes({
  router,
  mongoose,
  User,
  Donation,
  DonationProject,
  authenticateAdmin,
  requireTabPermission,
});

module.exports = router;

const express = require('express');

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
router.use(require('./reactions/reaction.routes'));
router.use(require('./donations/donation.routes'));
router.use(require('./users/user.admin.routes'));

module.exports = router;

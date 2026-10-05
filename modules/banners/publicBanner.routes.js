const express = require('express');
const Banner = require('../../models/banner.model');

const router = express.Router();

router.get('/banner', async (_req, res) => {
  const banners = await Banner.find({ isActive: true }).sort({ updatedAt: -1 });

  return res.status(200).json({
    banners,
  });
});

module.exports = router;

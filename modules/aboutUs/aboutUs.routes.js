const express = require('express');
const AboutUsPage = require('../../models/aboutUsPage.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');

function normalizeYoutubeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const normalizedHost = parsedUrl.hostname.toLowerCase();
    if (
      normalizedHost === 'youtube.com' ||
      normalizedHost === 'www.youtube.com' ||
      normalizedHost === 'm.youtube.com' ||
      normalizedHost === 'youtu.be' ||
      normalizedHost === 'www.youtu.be'
    ) {
      return normalizedValue;
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeAboutUsPayload(aboutUs) {
  if (!aboutUs) {
    return null;
  }

  return {
    videoUrl: aboutUs.videoUrl,
    title: aboutUs.title,
    message: aboutUs.message,
    isActive: aboutUs.isActive,
    updatedAt: aboutUs.updatedAt,
  };
}

async function getOrCreateAboutUsPage() {
  const aboutUsPage = await AboutUsPage.findOneAndUpdate(
    { singletonKey: 'main' },
    {
      $setOnInsert: {
        singletonKey: 'main',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'About Us',
        message: 'Update this message from the admin panel.',
        isActive: true,
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return aboutUsPage;
}
const router = express.Router();

router.get(
  '/about-us',
  authenticateAdmin,
  requireTabPermission('aboutUs', 'read'),
  async (_req, res) => {
    try {
      const aboutUsPage = await getOrCreateAboutUsPage();

      return res.status(200).json({
        aboutUs: normalizeAboutUsPayload(aboutUsPage),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/about-us',
  authenticateAdmin,
  requireTabPermission('aboutUs', 'update'),
  async (req, res) => {
    const body = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(body, 'videoUrl')) {
      const normalizedVideoUrl = normalizeYoutubeUrl(body.videoUrl);
      if (!normalizedVideoUrl) {
        return res.status(400).json({
          message: 'videoUrl must be a valid YouTube URL (youtube.com or youtu.be).',
        });
      }
      updates.videoUrl = normalizedVideoUrl;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      const normalizedTitle = typeof body.title === 'string' ? body.title.trim() : '';
      if (!normalizedTitle) {
        return res.status(400).json({
          message: 'title is required and cannot be empty.',
        });
      }
      updates.title = normalizedTitle;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'message')) {
      const normalizedMessage = typeof body.message === 'string' ? body.message.trim() : '';
      if (!normalizedMessage) {
        return res.status(400).json({
          message: 'message is required and cannot be empty.',
        });
      }
      updates.message = normalizedMessage;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
      if (typeof body.isActive !== 'boolean') {
        return res.status(400).json({
          message: 'isActive must be a boolean.',
        });
      }
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Nothing to update.',
      });
    }

    try {
      await getOrCreateAboutUsPage();
      const aboutUsPage = await AboutUsPage.findOneAndUpdate(
        { singletonKey: 'main' },
        updates,
        { returnDocument: 'after', runValidators: true }
      );

      return res.status(200).json({
        aboutUs: normalizeAboutUsPayload(aboutUsPage),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.get('/public/about-us', async (_req, res) => {
  const aboutUsPage = await AboutUsPage.findOne({
    singletonKey: 'main',
    isActive: true,
  }).select('videoUrl title message');

  return res.status(200).json({
    aboutUs: aboutUsPage
      ? {
          videoUrl: aboutUsPage.videoUrl,
          title: aboutUsPage.title,
          message: aboutUsPage.message,
        }
      : null,
  });
});

module.exports = router;


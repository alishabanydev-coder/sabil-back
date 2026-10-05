const express = require('express');
const mongoose = require('mongoose');
const Supporter = require('../../models/supporter.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');

const router = express.Router();

router.get(
  '/supporters',
  authenticateAdmin,
  requireTabPermission('users', 'read'),
  async (_req, res) => {
    const supporters = await Supporter.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      supporters,
    });
  }
);

router.post(
  '/supporters',
  authenticateAdmin,
  requireTabPermission('users', 'create'),
  async (req, res) => {
    const { name, email, message, phoneNumbers } = req.body || {};
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPhoneNumbers = Array.isArray(phoneNumbers)
      ? phoneNumbers
          .filter((phoneNumber) => typeof phoneNumber === 'string')
          .map((phoneNumber) => phoneNumber.trim())
          .filter(Boolean)
      : typeof phoneNumbers === 'string'
      ? phoneNumbers
          .split(',')
          .map((phoneNumber) => phoneNumber.trim())
          .filter(Boolean)
      : [];

    if (!normalizedName || !normalizedMessage) {
      return res.status(400).json({
        message: 'Name and message are required.',
      });
    }

    try {
      const supporter = await Supporter.create({
        name: normalizedName,
        message: normalizedMessage,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        phoneNumbers: normalizedPhoneNumbers,
      });

      return res.status(201).json({
        supporter,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.post('/public/supporters', async (req, res) => {
  const { name, email, message, phoneNumbers } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPhoneNumbers = Array.isArray(phoneNumbers)
    ? phoneNumbers
        .filter((phoneNumber) => typeof phoneNumber === 'string')
        .map((phoneNumber) => phoneNumber.trim())
        .filter(Boolean)
    : typeof phoneNumbers === 'string'
    ? phoneNumbers
        .split(',')
        .map((phoneNumber) => phoneNumber.trim())
        .filter(Boolean)
    : [];

  if (!normalizedName || !normalizedMessage) {
    return res.status(400).json({
      message: 'Name and message are required.',
    });
  }

  try {
    const supporter = await Supporter.create({
      name: normalizedName,
      message: normalizedMessage,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      phoneNumbers: normalizedPhoneNumbers,
    });

    return res.status(201).json({
      supporter,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
});

router.delete(
  '/supporters/:id',
  authenticateAdmin,
  requireTabPermission('users', 'delete'),
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid supporter id.',
      });
    }

    const supporter = await Supporter.findByIdAndDelete(id);

    if (!supporter) {
      return res.status(404).json({
        message: 'Supporter not found.',
      });
    }

    return res.status(200).json({
      message: 'Supporter deleted.',
    });
  }
);

module.exports = router;


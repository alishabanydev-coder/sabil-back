const express = require('express');
const cors = require('cors');
const path = require('path');
const adminAuthRouter = require('./adminAuth');
const Banner = require('./models/banner.model');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/admin', adminAuthRouter);

app.get('/api/banner', async (_req, res) => {
  const banners = await Banner.find({ isActive: true }).sort({ updatedAt: -1 });

  return res.status(200).json({
    banners,
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;

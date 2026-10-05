const express = require('express');
const cors = require('cors');
const path = require('path');
const adminRouter = require('./modules');
const { userAuthRouter } = require('./modules/auth/auth.routes');
const publicBannerRouter = require('./modules/banners/publicBanner.routes');

const app = express();

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : true;

app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', userAuthRouter);
app.use('/api/admin', adminRouter);
app.use('/api', publicBannerRouter);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = app;

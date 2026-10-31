const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VIDEO_THUMBNAIL_DIR = path.join(__dirname, '..', 'uploads', 'video-thumbnails');
const PUBLIC_PREFIX = '/uploads/video-thumbnails/';
const STORED_POSTER_NAME = /^[a-zA-Z0-9_-]+\.webp$/;
const STORED_THUMBNAIL_NAME = /^[a-zA-Z0-9_-]+\.[a-z0-9]+$/;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const ALLOWED_POSTER_HOSTS = new Set([
  'i.ytimg.com',
  'i9.ytimg.com',
  'img.youtube.com',
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
]);

function isAllowedPosterUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === 'https:' && ALLOWED_POSTER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function resolveThumbnailFile(posterPath, filenamePattern) {
  if (typeof posterPath !== 'string' || !posterPath.trim()) {
    return '';
  }

  let pathname = posterPath.trim();
  if (!pathname.startsWith(PUBLIC_PREFIX)) {
    try {
      const parsed = new URL(pathname);
      pathname = parsed.pathname;
    } catch {
      return '';
    }
  }

  if (!pathname.startsWith(PUBLIC_PREFIX)) {
    return '';
  }

  const filename = pathname.slice(PUBLIC_PREFIX.length);
  if (!filenamePattern.test(filename)) {
    return '';
  }

  const absolutePath = path.resolve(VIDEO_THUMBNAIL_DIR, filename);
  const relativePath = path.relative(VIDEO_THUMBNAIL_DIR, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return '';
  }

  if (!fs.existsSync(absolutePath)) {
    return '';
  }

  return `${PUBLIC_PREFIX}${filename}`;
}

function resolveStoredVideoPoster(posterPath) {
  return resolveThumbnailFile(posterPath, STORED_POSTER_NAME);
}

function resolveDeletableVideoThumbnail(posterPath) {
  return resolveThumbnailFile(posterPath, STORED_THUMBNAIL_NAME);
}

async function encodePosterWebp(buffer) {
  const imageOptions = {
    failOn: 'none',
    animated: false,
    limitInputPixels: 25_000_000,
  };
  const metadata = await sharp(buffer, imageOptions).metadata();
  const format = metadata.format || '';

  if (!['jpeg', 'png', 'webp'].includes(format)) {
    throw new Error('Poster must be a JPG or PNG image.');
  }

  return sharp(buffer, imageOptions)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}

async function writePosterFile(webpBuffer, filenameBase) {
  const safeBase = String(filenameBase || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  const filename = `${safeBase || `poster-${Date.now()}`}.webp`;
  await fs.promises.mkdir(VIDEO_THUMBNAIL_DIR, { recursive: true });

  const finalPath = path.join(VIDEO_THUMBNAIL_DIR, filename);
  const tempPath = path.join(VIDEO_THUMBNAIL_DIR, `.${filename}.${process.pid}.tmp`);

  try {
    await fs.promises.writeFile(tempPath, webpBuffer);
    try {
      await fs.promises.rename(tempPath, finalPath);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
        throw error;
      }
      await fs.promises.rm(finalPath, { force: true });
      await fs.promises.rename(tempPath, finalPath);
    }
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }

  return `${PUBLIC_PREFIX}${filename}`;
}

async function downloadPosterBuffer(startUrl) {
  let currentUrl = startUrl;

  for (let hop = 0; hop < 3; hop += 1) {
    if (!isAllowedPosterUrl(currentUrl)) {
      throw new Error('Poster URL is not a YouTube image.');
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Failed to download the YouTube poster.');
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`YouTube poster download failed (${response.status}).`);
    }

    const advertisedLength = Number(response.headers.get('content-length') || 0);
    if (advertisedLength > MAX_POSTER_BYTES) {
      throw new Error('YouTube poster is too large to save.');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_POSTER_BYTES) {
      throw new Error('YouTube poster is too large to save.');
    }

    return bytes;
  }

  throw new Error('Failed to download the YouTube poster.');
}

async function saveYouTubePosterAsWebp(thumbnailUrls, filenameBase) {
  const urls = (Array.isArray(thumbnailUrls) ? thumbnailUrls : [thumbnailUrls]).filter(
    (url) => typeof url === 'string' && url.trim()
  );

  if (urls.length === 0) {
    throw new Error('YouTube did not return a poster.');
  }

  let lastError = null;

  for (const url of urls) {
    try {
      const buffer = await downloadPosterBuffer(url);
      const webpBuffer = await encodePosterWebp(buffer);
      return await writePosterFile(webpBuffer, filenameBase);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to save the YouTube poster.');
}

async function convertUploadedPosterFile(file) {
  if (!file?.path || !file.filename) {
    return;
  }

  const inputBuffer = await fs.promises.readFile(file.path);
  let format = '';
  try {
    const metadata = await sharp(inputBuffer, {
      failOn: 'none',
      animated: false,
      limitInputPixels: 25_000_000,
    }).metadata();
    format = metadata.format || '';
  } catch {
    return;
  }

  if (format !== 'jpeg' && format !== 'png') {
    return;
  }

  const webpBuffer = await encodePosterWebp(inputBuffer);
  const filenameBase = path.parse(file.filename).name;
  const storedPath = await writePosterFile(webpBuffer, filenameBase);
  const nextFilename = path.basename(storedPath);

  if (path.resolve(file.path) !== path.resolve(VIDEO_THUMBNAIL_DIR, nextFilename)) {
    await fs.promises.rm(file.path, { force: true });
  }

  file.filename = nextFilename;
  file.path = path.join(VIDEO_THUMBNAIL_DIR, nextFilename);
}

function buildYouTubePosterFilename(videoId) {
  const safeId = String(videoId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32);

  return `yt-${safeId || 'video'}-${Date.now()}`;
}

module.exports = {
  buildYouTubePosterFilename,
  convertUploadedPosterFile,
  resolveDeletableVideoThumbnail,
  resolveStoredVideoPoster,
  saveYouTubePosterAsWebp,
};

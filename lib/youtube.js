const jwt = require('jsonwebtoken');
const YoutubeChannelToken = require('../models/youtubeChannelToken.model');

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

function getGoogleOAuthConfig(req) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  let redirectUri = (process.env.GOOGLE_REDIRECT_URI || '').trim();

  if (!redirectUri && req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:5000';
    redirectUri = `${protocol}://${host}/api/channels/youtube/oauth/callback`;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

function createOAuthStateToken(adminId) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET is not configured.');
  }

  return jwt.sign(
    {
      purpose: 'youtube_oauth',
      adminId: adminId ? adminId.toString() : '',
    },
    secret,
    { expiresIn: '15m' }
  );
}

function verifyOAuthStateToken(stateToken) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || typeof stateToken !== 'string' || !stateToken.trim()) {
    return null;
  }

  try {
    const payload = jwt.verify(stateToken, secret);
    if (payload?.purpose !== 'youtube_oauth') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function buildGoogleAuthUrl(req, adminId) {
  const { clientId, redirectUri, isConfigured } = getGoogleOAuthConfig(req);
  if (!isConfigured) {
    throw new Error(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
    );
  }

  const state = createOAuthStateToken(adminId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_READONLY_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(req, code) {
  const { clientId, clientSecret, redirectUri, isConfigured } = getGoogleOAuthConfig(req);
  if (!isConfigured) {
    throw new Error('Google OAuth is not configured on the server.');
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description || data?.error || 'Failed to exchange Google authorization code.'
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresIn: Number(data.expires_in) || 3500,
  };
}

async function refreshAccessTokenForChannel(channelTokenDoc) {
  const { clientId, clientSecret, isConfigured } = getGoogleOAuthConfig();
  if (!isConfigured) {
    throw new Error(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env.'
    );
  }

  if (
    channelTokenDoc.accessToken &&
    channelTokenDoc.accessTokenExpiresAt &&
    new Date(channelTokenDoc.accessTokenExpiresAt).getTime() > Date.now() + 60 * 1000
  ) {
    return channelTokenDoc.accessToken;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: channelTokenDoc.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        `Failed to refresh token for YouTube channel "${channelTokenDoc.channelTitle}". Please reconnect this channel.`
    );
  }

  const expiresIn = Number(data.expires_in) || 3500;
  channelTokenDoc.accessToken = data.access_token;
  channelTokenDoc.accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  await channelTokenDoc.save();

  return data.access_token;
}

async function fetchMyYouTubeChannelProfile(accessToken) {
  const url = `${YOUTUBE_API_BASE_URL}/channels?part=snippet&mine=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message || 'Failed to read YouTube channel profile from Google.'
    );
  }

  const item = Array.isArray(data?.items) ? data.items[0] : null;
  if (!item?.id) {
    throw new Error('No YouTube channel was found on the selected Google account.');
  }

  const snippet = item.snippet || {};
  const thumbnail =
    snippet.thumbnails?.default?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.high?.url ||
    '';

  return {
    youtubeChannelId: item.id,
    channelTitle: snippet.title || 'YouTube Channel',
    customUrl: snippet.customUrl || '',
    channelThumbnail: thumbnail,
  };
}

function extractYouTubeVideoId(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (
        pathParts.length >= 2 &&
        ['embed', 'shorts', 'live', 'v'].includes(pathParts[0]) &&
        /^[a-zA-Z0-9_-]{11}$/.test(pathParts[1])
      ) {
        return pathParts[1];
      }
    }
  } catch {
    // Fall through to regex match
  }

  const regexMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return regexMatch ? regexMatch[1] : null;
}

async function getConnectedYouTubeAccessToken() {
  const connectedChannels = await YoutubeChannelToken.find({})
    .select('+refreshToken +accessToken +accessTokenExpiresAt')
    .sort({ updatedAt: -1 });

  if (connectedChannels.length === 0) {
    throw new Error(
      'No YouTube channel is connected yet. Click "Connect YouTube" in the Channels tab first.'
    );
  }

  let lastTokenError = null;
  for (const channelDoc of connectedChannels) {
    try {
      return await refreshAccessTokenForChannel(channelDoc);
    } catch (error) {
      lastTokenError = error;
    }
  }

  throw lastTokenError || new Error('Failed to authenticate with any connected YouTube channel.');
}

async function readYouTubeResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || 'YouTube Data API request failed.');
  }
  return data;
}

function getYouTubeApiKey() {
  const apiKey = (process.env.YOUTUBE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured in backend/.env.');
  }
  return apiKey;
}

function channelShortsPlaylistId(channelId) {
  if (typeof channelId !== 'string' || !channelId.startsWith('UC') || channelId.length < 3) {
    return '';
  }
  return `UUSH${channelId.slice(2)}`;
}

async function listPlaylistVideoIds(playlistId, { allowMissing = false } = {}) {
  const apiKey = getYouTubeApiKey();
  const videoIds = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      part: 'contentDetails',
      maxResults: '50',
      playlistId,
      key: apiKey,
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const pageResponse = await fetch(`${YOUTUBE_API_BASE_URL}/playlistItems?${params.toString()}`);
    const pageData = await pageResponse.json().catch(() => null);
    if (!pageResponse.ok) {
      const message = pageData?.error?.message || 'YouTube Data API request failed.';
      if (allowMissing && (pageResponse.status === 404 || /not found/i.test(message))) {
        return [];
      }
      throw new Error(message);
    }

    const items = Array.isArray(pageData?.items) ? pageData.items : [];
    items.forEach((item) => {
      const videoId = item?.contentDetails?.videoId;
      if (typeof videoId === 'string' && videoId.trim()) {
        videoIds.push(videoId.trim());
      }
    });

    pageToken = typeof pageData?.nextPageToken === 'string' ? pageData.nextPageToken : '';
  } while (pageToken);

  return videoIds;
}

async function listChannelUploadVideoIds(channelId) {
  const params = new URLSearchParams({
    part: 'contentDetails',
    id: channelId,
    key: getYouTubeApiKey(),
  });
  const channelResponse = await fetch(`${YOUTUBE_API_BASE_URL}/channels?${params.toString()}`);
  const channelData = await readYouTubeResponse(channelResponse);
  const uploadsPlaylistId =
    channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || '';

  if (!uploadsPlaylistId) {
    throw new Error('YouTube did not return an uploads playlist for this channel.');
  }

  return listPlaylistVideoIds(uploadsPlaylistId);
}

async function listChannelShortVideoIds(channelId) {
  const playlistId = channelShortsPlaylistId(channelId);
  if (!playlistId) {
    return [];
  }
  return listPlaylistVideoIds(playlistId, { allowMissing: true });
}

async function fetchYouTubeVideosByIds(videoIds) {
  const apiKey = getYouTubeApiKey();
  const uniqueIds = [...new Set(videoIds.filter((videoId) => typeof videoId === 'string' && videoId.trim()))];
  const details = [];

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      id: chunk.join(','),
      maxResults: '50',
      key: apiKey,
    });
    const response = await fetch(`${YOUTUBE_API_BASE_URL}/videos?${params.toString()}`);
    const data = await readYouTubeResponse(response);
    const items = Array.isArray(data?.items) ? data.items : [];
    items.forEach((item) => {
      if (item?.id) {
        details.push(formatYouTubeVideoItem(item, true));
      }
    });
  }

  return details;
}

async function callYouTubeVideosList(videoId) {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: videoId,
    key: getYouTubeApiKey(),
  });
  const response = await fetch(`${YOUTUBE_API_BASE_URL}/videos?${params.toString()}`);

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message || 'YouTube Data API request failed.'
    );
  }

  const item = Array.isArray(data?.items) ? data.items[0] : null;
  return item || null;
}

function collectYouTubeThumbnailUrls(thumbnails) {
  const orderedKeys = ['maxres', 'standard', 'high', 'medium', 'default'];
  const urls = [];

  orderedKeys.forEach((key) => {
    const url = thumbnails?.[key]?.url;
    if (typeof url === 'string' && url.startsWith('https://') && !urls.includes(url)) {
      urls.push(url);
    }
  });

  return urls;
}

function parseYouTubeDuration(value) {
  if (typeof value !== 'string') {
    return 0;
  }

  const match = value
    .trim()
    .match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);

  if (!match) {
    return 0;
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  return Math.max(0, Math.round(days * 86400 + hours * 3600 + minutes * 60 + seconds));
}

function formatYouTubeVideoItem(item, matchedOwnerChannel) {
  const snippet = item?.snippet || {};
  const statistics = item?.statistics || {};
  const thumbnails = snippet.thumbnails || {};
  const thumbnailUrls = collectYouTubeThumbnailUrls(thumbnails);
  const bestThumbnail = thumbnailUrls[0] || '';

  return {
    youtubeVideoId: item?.id || '',
    youtubeChannelId: snippet.channelId || '',
    youtubeChannelTitle: snippet.channelTitle || '',
    title: snippet.title || '',
    description: snippet.description || '',
    tags: Array.isArray(snippet.tags)
      ? snippet.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    viewCount: Math.max(0, Number(statistics.viewCount) || 0),
    likeCount: Math.max(0, Number(statistics.likeCount) || 0),
    commentCount: Math.max(0, Number(statistics.commentCount) || 0),
    duration: parseYouTubeDuration(item?.contentDetails?.duration),
    thumbnailUrl: bestThumbnail,
    thumbnailUrls,
    publishedAt: snippet.publishedAt || null,
    matchedOwnerChannel: Boolean(matchedOwnerChannel),
  };
}

async function fetchYouTubeVideoDetailsByUrlOrId(videoUrlOrId) {
  const videoId = extractYouTubeVideoId(videoUrlOrId);
  if (!videoId) {
    throw new Error('Could not extract a valid 11-character YouTube video ID from the URL.');
  }

  const item = await callYouTubeVideosList(videoId);
  if (!item) {
    throw new Error(
      'Video was not found on YouTube (or is set to Private).'
    );
  }

  return formatYouTubeVideoItem(item, true);
}

module.exports = {
  getGoogleOAuthConfig,
  buildGoogleAuthUrl,
  verifyOAuthStateToken,
  exchangeCodeForTokens,
  fetchMyYouTubeChannelProfile,
  extractYouTubeVideoId,
  fetchYouTubeVideoDetailsByUrlOrId,
  getConnectedYouTubeAccessToken,
  listChannelUploadVideoIds,
  listChannelShortVideoIds,
  fetchYouTubeVideosByIds,
};

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

async function callYouTubeVideosList(videoId, accessToken) {
  const url = `${YOUTUBE_API_BASE_URL}/videos?part=snippet,statistics&id=${encodeURIComponent(
    videoId
  )}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message || 'YouTube Data API request failed.'
    );
  }

  const item = Array.isArray(data?.items) ? data.items[0] : null;
  return item || null;
}

function formatYouTubeVideoItem(item, matchedOwnerChannel) {
  const snippet = item?.snippet || {};
  const statistics = item?.statistics || {};
  const thumbnails = snippet.thumbnails || {};
  const bestThumbnail =
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    '';

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
    thumbnailUrl: bestThumbnail,
    publishedAt: snippet.publishedAt || null,
    matchedOwnerChannel: Boolean(matchedOwnerChannel),
  };
}

/**
 * Way B: Automatically matches the video to the connected YouTube channel that owns it.
 * 1. Uses the first valid connected channel token to look up the video's snippet & channelId.
 * 2. If the video belongs to another connected channel in the database, re-fetches with
 *    that exact owner channel's token so owner-only `snippet.tags` are guaranteed to be returned.
 */
async function fetchYouTubeVideoDetailsByUrlOrId(videoUrlOrId) {
  const videoId = extractYouTubeVideoId(videoUrlOrId);
  if (!videoId) {
    throw new Error('Could not extract a valid 11-character YouTube video ID from the URL.');
  }

  const connectedChannels = await YoutubeChannelToken.find({})
    .select('+refreshToken +accessToken +accessTokenExpiresAt')
    .sort({ updatedAt: -1 });

  if (connectedChannels.length === 0) {
    throw new Error(
      'No YouTube channel is connected yet. Click "Connect YouTube" in the Channels tab first.'
    );
  }

  let initialItem = null;
  let initialChannelDoc = null;
  let lastTokenError = null;

  for (const channelDoc of connectedChannels) {
    try {
      const accessToken = await refreshAccessTokenForChannel(channelDoc);
      initialItem = await callYouTubeVideosList(videoId, accessToken);
      initialChannelDoc = channelDoc;
      break;
    } catch (error) {
      lastTokenError = error;
    }
  }

  if (!initialChannelDoc) {
    throw lastTokenError || new Error('Failed to authenticate with any connected YouTube channel.');
  }

  if (!initialItem) {
    throw new Error(
      'Video was not found on YouTube (or is private to a channel that is not connected).'
    );
  }

  const videoOwnerChannelId = initialItem?.snippet?.channelId || '';
  if (videoOwnerChannelId && initialChannelDoc.youtubeChannelId === videoOwnerChannelId) {
    return formatYouTubeVideoItem(initialItem, true);
  }

  const ownerChannelDoc = connectedChannels.find(
    (doc) => doc.youtubeChannelId === videoOwnerChannelId
  );

  if (ownerChannelDoc) {
    try {
      const ownerAccessToken = await refreshAccessTokenForChannel(ownerChannelDoc);
      const ownerItem = await callYouTubeVideosList(videoId, ownerAccessToken);
      if (ownerItem) {
        return formatYouTubeVideoItem(ownerItem, true);
      }
    } catch {
      // Fall back to initial item if owner token refresh failed
    }
  }

  return formatYouTubeVideoItem(initialItem, false);
}

module.exports = {
  getGoogleOAuthConfig,
  buildGoogleAuthUrl,
  verifyOAuthStateToken,
  exchangeCodeForTokens,
  fetchMyYouTubeChannelProfile,
  extractYouTubeVideoId,
  fetchYouTubeVideoDetailsByUrlOrId,
};

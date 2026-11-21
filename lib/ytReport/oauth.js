const jwt = require("jsonwebtoken");

const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_DATA_API_BASE = "https://www.googleapis.com/youtube/v3";

const YT_REPORT_SCOPES = [
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

function getYtReportOAuthConfig(req) {
  const clientId = (process.env.YT_REPORT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.YT_REPORT_CLIENT_SECRET || "").trim();
  let redirectUri = (process.env.YT_REPORT_REDIRECT_URI || "").trim();

  if (!redirectUri && req) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host =
      req.headers["x-forwarded-host"] || req.get("host") || "localhost:5000";
    redirectUri = `${protocol}://${host}/api/yt-reports/oauth/callback`;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

function createYtReportStateToken(adminId) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error("ADMIN_JWT_SECRET is not configured.");
  }

  return jwt.sign(
    {
      purpose: "yt_report_oauth",
      adminId: adminId ? adminId.toString() : "",
    },
    secret,
    { expiresIn: "15m" }
  );
}

function verifyYtReportStateToken(stateToken) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || typeof stateToken !== "string" || !stateToken.trim()) {
    return null;
  }

  try {
    const payload = jwt.verify(stateToken, secret);
    return payload?.purpose === "yt_report_oauth" ? payload : null;
  } catch {
    return null;
  }
}

function buildYtReportAuthUrl(req, adminId) {
  const { clientId, redirectUri, isConfigured } = getYtReportOAuthConfig(req);
  if (!isConfigured) {
    throw new Error(
      "YT Report OAuth is not configured. Set YT_REPORT_CLIENT_ID and YT_REPORT_CLIENT_SECRET in backend/.env."
    );
  }

  const state = createYtReportStateToken(adminId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YT_REPORT_SCOPES,
    access_type: "offline",
    prompt: "consent select_account",
    state,
  });

  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

async function exchangeYtReportCodeForTokens(req, code) {
  const { clientId, clientSecret, redirectUri, isConfigured } =
    getYtReportOAuthConfig(req);
  if (!isConfigured) {
    throw new Error("YT Report OAuth is not configured on the server.");
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Failed to exchange Google authorization code."
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresIn: Number(data.expires_in) || 3500,
  };
}

async function getValidAccessToken(channelDoc) {
  const { clientId, clientSecret, isConfigured } = getYtReportOAuthConfig();
  if (!isConfigured) {
    throw new Error(
      "YT_REPORT_CLIENT_ID / YT_REPORT_CLIENT_SECRET are missing."
    );
  }

  if (
    channelDoc.accessToken &&
    channelDoc.accessTokenExpiresAt &&
    new Date(channelDoc.accessTokenExpiresAt).getTime() > Date.now() + 60 * 1000
  ) {
    return channelDoc.accessToken;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: channelDoc.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        `Token refresh failed for "${channelDoc.channelTitle}". Please reconnect this channel.`
    );
  }

  const expiresIn = Number(data.expires_in) || 3500;
  channelDoc.accessToken = data.access_token;
  channelDoc.accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  await channelDoc.save();

  return data.access_token;
}

async function fetchOwnChannelProfile(accessToken) {
  const response = await fetch(
    `${YOUTUBE_DATA_API_BASE}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Failed to read YouTube channel profile."
    );
  }

  const item = Array.isArray(data?.items) ? data.items[0] : null;
  if (!item?.id) {
    throw new Error("No YouTube channel found on the selected Google account.");
  }

  const snippet = item.snippet || {};
  const thumbnail =
    snippet.thumbnails?.default?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.high?.url ||
    "";

  return {
    youtubeChannelId: item.id,
    channelTitle: snippet.title || "YouTube Channel",
    channelThumbnail: thumbnail,
  };
}

module.exports = {
  getYtReportOAuthConfig,
  buildYtReportAuthUrl,
  verifyYtReportStateToken,
  exchangeYtReportCodeForTokens,
  getValidAccessToken,
  fetchOwnChannelProfile,
};

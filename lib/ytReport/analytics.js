const { getValidAccessToken } = require("./oauth");
const { ensureReachJob, fetchReachMetricsForRange } = require("./reporting");

const YOUTUBE_DATA_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_ANALYTICS_API_BASE =
  "https://youtubeanalytics.googleapis.com/v2/reports";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatRangeLabels(startDate, endDate) {
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);

  // Accountant sheet expects a plain month name (e.g. "October"), not a date range.
  const monthLabel =
    sy === ey && sm === em
      ? MONTH_NAMES[sm - 1]
      : `${MONTH_NAMES[sm - 1]}-${MONTH_NAMES[em - 1]}`;

  return {
    year: sy,
    monthLabel,
    dateOfReport: new Date().toISOString().slice(0, 10),
  };
}

function nextDayString(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

// Rule 1: UULF (regular videos) & UUSH (Shorts) — 1 unit each, <=40 uploads fits in 1 page of 50
async function countPlaylistUploadsInRange(
  playlistId,
  accessToken,
  startDate,
  endDate
) {
  const params = new URLSearchParams({
    part: "snippet",
    playlistId,
    maxResults: "50",
  });

  const res = await fetch(
    `${YOUTUBE_DATA_API_BASE}/playlistItems?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (res.status === 404) {
    return 0; // Channel has 0 uploads of this type
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data?.items)) {
    return 0;
  }

  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T23:59:59.999Z`);

  let count = 0;
  for (const item of data.items) {
    const publishedMs = Date.parse(item?.snippet?.publishedAt || "");
    if (
      !Number.isNaN(publishedMs) &&
      publishedMs >= startMs &&
      publishedMs <= endMs
    ) {
      count += 1;
    }
  }
  return count;
}

async function queryAnalyticsRow(
  youtubeChannelId,
  accessToken,
  startDate,
  endDate,
  metricsList
) {
  const params = new URLSearchParams({
    ids: `channel==${youtubeChannelId}`,
    startDate,
    endDate,
    metrics: metricsList.join(","),
  });

  const res = await fetch(
    `${YOUTUBE_ANALYTICS_API_BASE}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function mapAnalyticsResult(data) {
  const headers = Array.isArray(data?.columnHeaders) ? data.columnHeaders : [];
  const firstRow =
    Array.isArray(data?.rows) && data.rows[0] ? data.rows[0] : [];
  const mapped = {};

  headers.forEach((header, index) => {
    mapped[header.name] = Number(firstRow[index]) || 0;
  });

  return mapped;
}

// Rule 2: Single packed Analytics call (auto-falls back if channel is not monetized)
async function fetchPackedChannelAnalytics(
  youtubeChannelId,
  accessToken,
  startDate,
  endDate
) {
  const baseMetrics = [
    "views",
    "estimatedMinutesWatched",
    "averageViewDuration",
    "comments",
    "subscribersGained",
    "subscribersLost",
  ];

  const withRevenue = [...baseMetrics, "estimatedRevenue"];
  let result = await queryAnalyticsRow(
    youtubeChannelId,
    accessToken,
    startDate,
    endDate,
    withRevenue
  );

  if (!result.ok && result.status === 403) {
    result = await queryAnalyticsRow(
      youtubeChannelId,
      accessToken,
      startDate,
      endDate,
      baseMetrics
    );
  }

  if (!result.ok) {
    const errMsg =
      result.data?.error?.message || "YouTube Analytics API query failed.";
    throw new Error(errMsg);
  }

  return mapAnalyticsResult(result.data);
}

// Rule 3: Live Subscriber End-of-Period & Growth Rate without storing historical DB rows
async function fetchLiveSubscriberStats(
  youtubeChannelId,
  accessToken,
  endDate,
  subscribersGainedInPeriod,
  subscribersLostInPeriod
) {
  const chRes = await fetch(
    `${YOUTUBE_DATA_API_BASE}/channels?part=statistics&id=${encodeURIComponent(youtubeChannelId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const chData = await chRes.json().catch(() => null);
  const currentSubs =
    Number(chData?.items?.[0]?.statistics?.subscriberCount) || 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  let netSubsAfterEnd = 0;

  if (endDate < todayStr) {
    const afterStart = nextDayString(endDate);
    if (afterStart <= todayStr) {
      const afterRes = await queryAnalyticsRow(
        youtubeChannelId,
        accessToken,
        afterStart,
        todayStr,
        ["subscribersGained", "subscribersLost"]
      );
      if (afterRes.ok) {
        const afterMap = mapAnalyticsResult(afterRes.data);
        netSubsAfterEnd =
          (afterMap.subscribersGained || 0) - (afterMap.subscribersLost || 0);
      }
    }
  }

  const subscribersLastOfMonth = Math.max(0, currentSubs - netSubsAfterEnd);
  const netSubsInPeriod = subscribersGainedInPeriod - subscribersLostInPeriod;
  const startingSubs = Math.max(0, subscribersLastOfMonth - netSubsInPeriod);

  const subscriberGrowthRate =
    startingSubs > 0
      ? Number(((netSubsInPeriod / startingSubs) * 100).toFixed(2))
      : 0;

  return {
    subscribersLastOfMonth,
    subscriberGrowthRate,
  };
}

async function buildChannelReportRow(channelDoc, startDate, endDate) {
  const accessToken = await getValidAccessToken(channelDoc);

  if (!channelDoc.reachJobId) {
    const jobId = await ensureReachJob(accessToken);
    if (jobId) {
      channelDoc.reachJobId = jobId;
      await channelDoc.save();
    }
  }

  const suffix = channelDoc.youtubeChannelId.startsWith("UC")
    ? channelDoc.youtubeChannelId.slice(2)
    : channelDoc.youtubeChannelId;

  const [noVideo, noShorts, analyticsMap, reach] = await Promise.all([
    countPlaylistUploadsInRange(
      `UULF${suffix}`,
      accessToken,
      startDate,
      endDate
    ),
    countPlaylistUploadsInRange(
      `UUSH${suffix}`,
      accessToken,
      startDate,
      endDate
    ),
    fetchPackedChannelAnalytics(
      channelDoc.youtubeChannelId,
      accessToken,
      startDate,
      endDate
    ),
    fetchReachMetricsForRange(
      accessToken,
      channelDoc.reachJobId,
      startDate,
      endDate
    ),
  ]);

  const subscribersGained = analyticsMap.subscribersGained || 0;
  const subscribersLost = analyticsMap.subscribersLost || 0;

  const { subscribersLastOfMonth, subscriberGrowthRate } =
    await fetchLiveSubscriberStats(
      channelDoc.youtubeChannelId,
      accessToken,
      endDate,
      subscribersGained,
      subscribersLost
    );

  const { year, monthLabel, dateOfReport } = formatRangeLabels(
    startDate,
    endDate
  );
  const adminName =
    channelDoc.authorAdminId?.name ||
    channelDoc.authorAdminId?.userName ||
    "Author";

  return {
    youtubeChannelId: channelDoc.youtubeChannelId,
    year,
    dateOfReport,
    adminName,
    channelName: channelDoc.channelTitle,
    month: monthLabel,
    subscribersGained,
    subscribersLastOfMonth,
    subscriberGrowthRate,
    totalViews: analyticsMap.views || 0,
    noVideo,
    noShorts,
    totalWatchTimeHours: Number(
      ((analyticsMap.estimatedMinutesWatched || 0) / 60).toFixed(2)
    ),
    numberOfComments: analyticsMap.comments || 0,
    revenue: Number((analyticsMap.estimatedRevenue || 0).toFixed(2)),
    impressions: reach.impressions,
    ctr: reach.ctr,
    averageViewDuration: Math.round(analyticsMap.averageViewDuration || 0),
  };
}

module.exports = {
  buildChannelReportRow,
};

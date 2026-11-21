const REPORTING_API_BASE = "https://youtubereporting.googleapis.com/v1";
const REACH_REPORT_TYPE_ID = "channel_reach_basic_a1";

function addOneDayIso(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString();
}

async function ensureReachJob(accessToken) {
  const listRes = await fetch(`${REPORTING_API_BASE}/jobs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json().catch(() => null);

  if (listRes.ok && Array.isArray(listData?.jobs)) {
    const existing = listData.jobs.find(
      (job) => job.reportTypeId === REACH_REPORT_TYPE_ID
    );
    if (existing?.id) {
      return existing.id;
    }
  }

  const createRes = await fetch(`${REPORTING_API_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reportTypeId: REACH_REPORT_TYPE_ID,
      name: "Sabeel Monthly Reach",
    }),
  });

  const createData = await createRes.json().catch(() => null);
  if (!createRes.ok) {
    // Non-fatal on connect if channel doesn't support reach job yet
    return "";
  }

  return createData?.id || "";
}

function parseCsvReachTotals(csvText) {
  if (!csvText || typeof csvText !== "string") {
    return { impressions: 0, weightedClicks: 0 };
  }

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { impressions: 0, weightedClicks: 0 };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const impIdx = headers.indexOf("video_thumbnail_impressions");
  const ctrIdx = headers.indexOf("video_thumbnail_impressions_ctr");

  if (impIdx === -1 || ctrIdx === -1) {
    return { impressions: 0, weightedClicks: 0 };
  }

  let impressions = 0;
  let weightedClicks = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = lines[i].split(",");
    const imp = Number(cols[impIdx]) || 0;
    const ctrFraction = Number(cols[ctrIdx]) || 0; // Reporting API stores 0.05 for 5%
    impressions += imp;
    weightedClicks += imp * ctrFraction;
  }

  return { impressions, weightedClicks };
}

async function fetchReachMetricsForRange(
  accessToken,
  reachJobId,
  startDate,
  endDate
) {
  if (!reachJobId) {
    return { impressions: 0, ctr: 0 };
  }

  const params = new URLSearchParams({
    startTimeAtOrAfter: `${startDate}T00:00:00Z`,
    startTimeBefore: addOneDayIso(endDate),
  });

  const res = await fetch(
    `${REPORTING_API_BASE}/jobs/${encodeURIComponent(reachJobId)}/reports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data?.reports) || data.reports.length === 0) {
    return { impressions: 0, ctr: 0 };
  }

  // Deduplicate corrected daily backfill files: keep newest createTime per startTime
  const latestByDay = new Map();
  for (const report of data.reports) {
    if (!report?.startTime || !report?.downloadUrl) continue;
    const prev = latestByDay.get(report.startTime);
    if (!prev || new Date(report.createTime) > new Date(prev.createTime)) {
      latestByDay.set(report.startTime, report);
    }
  }

  const reportsToDownload = Array.from(latestByDay.values());
  let totalImpressions = 0;
  let totalWeightedClicks = 0;

  const batchSize = 10;
  for (let i = 0; i < reportsToDownload.length; i += batchSize) {
    const batch = reportsToDownload.slice(i, i + batchSize);
    const csvList = await Promise.all(
      batch.map((r) =>
        fetch(r.downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((resp) => (resp.ok ? resp.text() : ""))
          .catch(() => "")
      )
    );

    for (const csvText of csvList) {
      const { impressions, weightedClicks } = parseCsvReachTotals(csvText);
      totalImpressions += impressions;
      totalWeightedClicks += weightedClicks;
    }
  }

  const ctr =
    totalImpressions > 0
      ? Number(((totalWeightedClicks / totalImpressions) * 100).toFixed(2))
      : 0;

  return {
    impressions: Math.round(totalImpressions),
    ctr,
  };
}

module.exports = {
  ensureReachJob,
  fetchReachMetricsForRange,
};

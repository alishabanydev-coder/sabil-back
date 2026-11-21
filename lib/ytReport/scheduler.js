const YoutubeReportChannel = require("../../models/youtubeReportChannel.model");
const { buildChannelReportRow } = require("./analytics");
const { upsertRowsToGoogleSheet } = require("./sheets");

let lastAutoSyncKey = "";
let schedulerTimer = null;

function getPreviousCalendarMonthRange() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

async function runScheduledMonthlySheetSync() {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();

  // Auto-fire on the 1st (initial fill) and 5th (finalized YouTube data refresh)
  if (dayOfMonth !== 1 && dayOfMonth !== 5) {
    return;
  }

  const syncKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-day${dayOfMonth}`;
  if (lastAutoSyncKey === syncKey) {
    return;
  }

  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.YT_REPORT_CLIENT_ID
  ) {
    return;
  }

  try {
    const channels = await YoutubeReportChannel.find({})
      .select("+refreshToken +accessToken +accessTokenExpiresAt")
      .populate("authorAdminId", "name userName");

    if (channels.length === 0) {
      lastAutoSyncKey = syncKey;
      return;
    }

    const { startDate, endDate } = getPreviousCalendarMonthRange();
    const rows = [];

    for (const channelDoc of channels) {
      try {
        const row = await buildChannelReportRow(channelDoc, startDate, endDate);
        rows.push(row);
      } catch (err) {
        console.error(
          `[ytReport scheduler] Failed channel "${channelDoc.channelTitle}":`,
          err.message
        );
      }
    }

    if (rows.length > 0) {
      await upsertRowsToGoogleSheet(rows);
      lastAutoSyncKey = syncKey;
      console.log(
        `[ytReport scheduler] Synced ${rows.length} channel(s) for ${startDate}..${endDate}`
      );
    }
  } catch (err) {
    console.error("[ytReport scheduler] Auto-sync error:", err.message);
  }
}

function startYtReportScheduler() {
  if (schedulerTimer) return;
  // Check 1 minute after boot, then every 6 hours
  setTimeout(runScheduledMonthlySheetSync, 60 * 1000);
  schedulerTimer = setInterval(
    runScheduledMonthlySheetSync,
    6 * 60 * 60 * 1000
  );
}

module.exports = {
  getPreviousCalendarMonthRange,
  startYtReportScheduler,
};

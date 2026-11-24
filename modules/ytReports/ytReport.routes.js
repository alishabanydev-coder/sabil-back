const express = require("express");
const { ADMIN_ROLES } = require("../../adminPermissions");
const {
  authenticateAdmin,
  requireRoles,
} = require("../../middleware/adminAuth");
const YoutubeReportChannel = require("../../models/youtubeReportChannel.model");
const {
  getYtReportOAuthConfig,
  buildYtReportAuthUrl,
  verifyYtReportStateToken,
  exchangeYtReportCodeForTokens,
  fetchOwnChannelProfile,
} = require("../../lib/ytReport/oauth");
const { ensureReachJob } = require("../../lib/ytReport/reporting");
const { buildChannelReportRow } = require("../../lib/ytReport/analytics");
const { buildReportExcelBuffer } = require("../../lib/ytReport/excel");
const { upsertRowsToGoogleSheet } = require("../../lib/ytReport/sheets");
const {
  getPreviousCalendarMonthRange,
} = require("../../lib/ytReport/scheduler");

const router = express.Router();

function isValidDateString(val) {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val);
}

function resolveDateRange(queryOrBody) {
  const { startDate, endDate } = queryOrBody || {};
  if (
    isValidDateString(startDate) &&
    isValidDateString(endDate) &&
    startDate <= endDate
  ) {
    return { startDate, endDate };
  }
  return getPreviousCalendarMonthRange();
}

function renderPopupHtml({ ok, title, message }) {
  const payload = JSON.stringify({
    type: "YT_REPORT_OAUTH_RESULT",
    ok,
    title,
    message,
  });
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
    <h2>${ok ? "Channel Connected!" : "Connection Failed"}</h2>
    <p>${message}</p>
    <script>
      if (window.opener) { window.opener.postMessage(${payload}, "*"); }
      setTimeout(() => window.close(), 1500);
    </script>
  </body></html>`;
}

async function handleYtReportOAuthCallback(req, res) {
  const { code, state, error } = req.query || {};
  if (error) {
    return res.status(400).send(
      renderPopupHtml({
        ok: false,
        title: "Cancelled",
        message: String(error),
      })
    );
  }

  const statePayload = verifyYtReportStateToken(String(state || ""));
  if (!statePayload?.adminId || typeof code !== "string") {
    return res.status(400).send(
      renderPopupHtml({
        ok: false,
        title: "Invalid State",
        message: "Expired OAuth session. Try again.",
      })
    );
  }

  try {
    const tokens = await exchangeYtReportCodeForTokens(req, code);
    const profile = await fetchOwnChannelProfile(tokens.accessToken);
    const reachJobId = await ensureReachJob(tokens.accessToken);

    const existing = await YoutubeReportChannel.findOne({
      youtubeChannelId: profile.youtubeChannelId,
    }).select("+refreshToken");

    const refreshToken = tokens.refreshToken || existing?.refreshToken || "";
    if (!refreshToken) {
      throw new Error(
        "Google did not return a refresh token. Please reconnect and approve consent."
      );
    }

    await YoutubeReportChannel.findOneAndUpdate(
      { youtubeChannelId: profile.youtubeChannelId },
      {
        $set: {
          authorAdminId: statePayload.adminId,
          channelTitle: profile.channelTitle,
          customUrl: profile.customUrl || "",
          channelThumbnail: profile.channelThumbnail,
          reachJobId: reachJobId || existing?.reachJobId || "",
          refreshToken,
          accessToken: tokens.accessToken,
          accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        },
      },
      { upsert: true, new: true }
    );

    const handleLabel = profile.customUrl
      ? ` (${profile.customUrl.startsWith("@") ? profile.customUrl : `@${profile.customUrl}`})`
      : "";

    return res.status(200).send(
      renderPopupHtml({
        ok: true,
        title: profile.channelTitle,
        message: `Connected "${profile.channelTitle}"${handleLabel} successfully. To connect another channel, click Connect again and pick a different Brand Account / channel on Google's screen.`,
      })
    );
  } catch (err) {
    return res.status(400).send(
      renderPopupHtml({
        ok: false,
        title: "Error",
        message: err.message || "Failed to connect channel.",
      })
    );
  }
}

async function fetchFreshReportForAdmin(admin, startDate, endDate) {
  const filter =
    admin.role === ADMIN_ROLES.AUTHOR ? { authorAdminId: admin._id } : {};

  const channels = await YoutubeReportChannel.find(filter)
    .select("+refreshToken +accessToken +accessTokenExpiresAt")
    .populate("authorAdminId", "name userName")
    .sort({ channelTitle: 1 });

  const rows = [];
  const errors = [];

  for (const ch of channels) {
    try {
      const row = await buildChannelReportRow(ch, startDate, endDate);
      rows.push(row);
    } catch (err) {
      errors.push({
        youtubeChannelId: ch.youtubeChannelId,
        channelTitle: ch.channelTitle,
        message: err.message,
      });
    }
  }

  return { rows, errors };
}

router.get(
  "/yt-reports/channels",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.AUTHOR, ADMIN_ROLES.ACCOUNTANT),
  async (req, res) => {
    const filter =
      req.admin.role === ADMIN_ROLES.AUTHOR
        ? { authorAdminId: req.admin._id }
        : {};
    const config = getYtReportOAuthConfig(req);
    const channels = await YoutubeReportChannel.find(filter)
      .populate("authorAdminId", "name userName")
      .sort({ channelTitle: 1 });

    return res.status(200).json({
      oauthConfigured: config.isConfigured,
      channels: channels.map((doc) => ({
        _id: doc._id.toString(),
        youtubeChannelId: doc.youtubeChannelId,
        channelTitle: doc.channelTitle,
        customUrl: doc.customUrl || "",
        channelThumbnail: doc.channelThumbnail,
        adminName: doc.authorAdminId?.name || doc.authorAdminId?.userName || "",
        updatedAt: doc.updatedAt,
      })),
    });
  }
);

router.get(
  "/yt-reports/oauth/start",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.AUTHOR),
  (req, res) => {
    try {
      const authUrl = buildYtReportAuthUrl(req, req.admin._id);
      return res.status(200).json({ authUrl });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }
);

router.delete(
  "/yt-reports/channels/:youtubeChannelId",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.AUTHOR),
  async (req, res) => {
    const deleted = await YoutubeReportChannel.findOneAndDelete({
      youtubeChannelId: req.params.youtubeChannelId,
      authorAdminId: req.admin._id,
    });

    if (!deleted) {
      return res
        .status(404)
        .json({ message: "Channel not found on your account." });
    }
    return res
      .status(200)
      .json({ message: `Disconnected "${deleted.channelTitle}".` });
  }
);

router.get(
  "/yt-reports/report",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.AUTHOR, ADMIN_ROLES.ACCOUNTANT),
  async (req, res) => {
    const { startDate, endDate } = resolveDateRange(req.query);
    const { rows, errors } = await fetchFreshReportForAdmin(
      req.admin,
      startDate,
      endDate
    );
    return res.status(200).json({ startDate, endDate, rows, errors });
  }
);

router.get(
  "/yt-reports/export-excel",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.AUTHOR, ADMIN_ROLES.ACCOUNTANT),
  async (req, res) => {
    const { startDate, endDate } = resolveDateRange(req.query);
    const { rows } = await fetchFreshReportForAdmin(
      req.admin,
      startDate,
      endDate
    );
    const buffer = await buildReportExcelBuffer(rows);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="yt-report-${startDate}-to-${endDate}.xlsx"`
    );
    return res.status(200).send(Buffer.from(buffer));
  }
);

router.post(
  "/yt-reports/sync-sheet",
  authenticateAdmin,
  requireRoles(ADMIN_ROLES.ACCOUNTANT),
  async (req, res) => {
    try {
      const { startDate, endDate } = resolveDateRange(req.body);
      const { rows, errors } = await fetchFreshReportForAdmin(
        req.admin,
        startDate,
        endDate
      );
      const sheetResult = await upsertRowsToGoogleSheet(rows);

      return res.status(200).json({
        message: `Synced ${rows.length} channel(s) to Google Sheet (${sheetResult.updatedCount} updated, ${sheetResult.appendedCount} added).`,
        startDate,
        endDate,
        rows,
        errors,
        ...sheetResult,
      });
    } catch (err) {
      return res
        .status(400)
        .json({ message: err.message || "Failed to sync Google Sheet." });
    }
  }
);

router.handleYtReportOAuthCallback = handleYtReportOAuthCallback;

module.exports = router;

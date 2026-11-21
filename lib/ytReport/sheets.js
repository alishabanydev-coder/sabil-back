const jwt = require("jsonwebtoken");

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

const SHEET_HEADERS = [
  "Year",
  "Date of Report",
  "Admin Name",
  "Channel Name",
  "Month",
  "Subscribers Gained in Month",
  "Subscribers Last of Month",
  "Subscriber Growth Rate",
  "Total Views",
  "No.Video",
  "No.Shorts",
  "Total Watch Time",
  "Number of Comments",
  "Revenu",
  "Impressions",
  "CTR",
  "Average View Duration",
];

function rowObjectToSheetValues(row) {
  return [
    row.year,
    row.dateOfReport,
    row.adminName,
    row.channelName,
    row.month,
    row.subscribersGained,
    row.subscribersLastOfMonth,
    `${row.subscriberGrowthRate}%`,
    row.totalViews,
    row.noVideo,
    row.noShorts,
    row.totalWatchTimeHours,
    row.numberOfComments,
    row.revenue,
    row.impressions,
    `${row.ctr}%`,
    row.averageViewDuration,
  ];
}

async function getServiceAccountAccessToken() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();

  if (!email || !privateKey) {
    throw new Error(
      "Google Service Account is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: "RS256" }
  );

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Failed to authenticate Service Account."
    );
  }

  return data.access_token;
}

async function resolveTabTitle(spreadsheetId, targetGid, accessToken) {
  const res = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await res.json().catch(() => null);

  if (!res.ok || !Array.isArray(data?.sheets)) {
    throw new Error(
      data?.error?.message || "Failed to read Google Sheet metadata."
    );
  }

  if (targetGid !== undefined && targetGid !== "") {
    const matched = data.sheets.find(
      (s) => Number(s?.properties?.sheetId) === Number(targetGid)
    );
    if (matched?.properties?.title) {
      return matched.properties.title;
    }
  }

  return data.sheets[0]?.properties?.title || "Sheet1";
}

async function upsertRowsToGoogleSheet(reportRows) {
  if (!Array.isArray(reportRows) || reportRows.length === 0) {
    return { updatedCount: 0, appendedCount: 0 };
  }

  const spreadsheetId = (
    process.env.YT_REPORT_SHEET_ID ||
    "12HH-PCrP5KV1he7bPzu81zV3op4gvGSelvQVaVIVCrY"
  ).trim();
  const targetGid = (process.env.YT_REPORT_SHEET_GID || "506485235").trim();

  const accessToken = await getServiceAccountAccessToken();
  const tabTitle = await resolveTabTitle(spreadsheetId, targetGid, accessToken);
  const safeTab = `'${tabTitle.replace(/'/g, "''")}'`;

  // Read existing A1:Q2000 to ensure header exists and match existing (Year + Channel Name + Month)
  const readRes = await fetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(`${safeTab}!A1:E2000`)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const readData = await readRes.json().catch(() => null);
  const existingValues = Array.isArray(readData?.values) ? readData.values : [];

  const updates = [];
  const toAppend = [];

  if (existingValues.length === 0) {
    updates.push({
      range: `${safeTab}!A1:Q1`,
      values: [SHEET_HEADERS],
    });
  }

  const rowIndexByKey = new Map();
  for (let i = 1; i < existingValues.length; i++) {
    const r = existingValues[i] || [];
    const key = `${String(r[0] || "").trim()}|${String(r[3] || "").trim()}|${String(r[4] || "").trim()}`;
    rowIndexByKey.set(key, i + 1); // 1-based sheet row number
  }

  for (const row of reportRows) {
    const key = `${row.year}|${row.channelName}|${row.month}`;
    const values = rowObjectToSheetValues(row);
    const existingRowNumber = rowIndexByKey.get(key);

    if (existingRowNumber) {
      updates.push({
        range: `${safeTab}!A${existingRowNumber}:Q${existingRowNumber}`,
        values: [values],
      });
    } else {
      toAppend.push(values);
    }
  }

  if (updates.length > 0) {
    const batchRes = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updates,
        }),
      }
    );

    if (!batchRes.ok) {
      const err = await batchRes.json().catch(() => null);
      throw new Error(
        err?.error?.message || "Failed to update existing rows in Google Sheet."
      );
    }
  }

  if (toAppend.length > 0) {
    const appendRange = encodeURIComponent(`${safeTab}!A:Q`);
    const appendRes = await fetch(
      `${SHEETS_API_BASE}/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: toAppend }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.json().catch(() => null);
      throw new Error(
        err?.error?.message || "Failed to append rows to Google Sheet."
      );
    }
  }

  return {
    updatedCount: updates.filter((u) => !u.range.endsWith("!A1:Q1")).length,
    appendedCount: toAppend.length,
  };
}

module.exports = {
  SHEET_HEADERS,
  upsertRowsToGoogleSheet,
};

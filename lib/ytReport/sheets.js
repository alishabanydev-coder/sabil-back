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

function normalizeChannelName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/official/gi, "")
    .replace(/channel/gi, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "")
    .trim();
}

function channelNameTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/official/gi, " ")
    .replace(/channel/gi, " ")
    .split(/[^a-z0-9\u0600-\u06ff]+/)
    .map((token) => token.trim())
    .filter((token) => token && token !== "sabeel" && token !== "sabeeltoons");
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function scoreChannelNameMatch(youtubeName, sheetName) {
  const a = normalizeChannelName(youtubeName);
  const b = normalizeChannelName(sheetName);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }

  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  const lengthRatio = shorter / longer;

  // Prefer suffix matches so "SabeelToons Story Book" → "Story Book"
  // over the brand-prefix token "Sabeel Toons".
  if (a.endsWith(b) || b.endsWith(a)) {
    return 0.93 + 0.06 * lengthRatio;
  }

  const youtubeTokens = channelNameTokens(youtubeName);
  const sheetTokens = channelNameTokens(sheetName);
  if (youtubeTokens.length > 0 && sheetTokens.length > 0) {
    const youtubeSet = new Set(youtubeTokens);
    const overlap = sheetTokens.filter((token) => youtubeSet.has(token));
    const tokenScore =
      overlap.length / Math.max(youtubeTokens.length, sheetTokens.length);

    // Distinct series tokens (story/book/kids) must beat bare "toons" brand matches.
    if (tokenScore > 0) {
      return 0.6 + 0.39 * tokenScore;
    }
  }

  // Brand-prefix only (e.g. Story Book title starting with "sabeeltoons") —
  // allow only when names are nearly the same length.
  if ((a.startsWith(b) || b.startsWith(a)) && lengthRatio >= 0.75) {
    return 0.8 + 0.1 * lengthRatio;
  }

  if ((a.includes(b) || b.includes(a)) && lengthRatio >= 0.7) {
    return 0.7 + 0.19 * lengthRatio;
  }

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) {
    return 0;
  }

  const distanceScore = 1 - levenshteinDistance(a, b) / maxLen;
  return distanceScore >= 0.75 ? distanceScore : 0;
}

/**
 * Map a YouTube channel title to the closest name already used
 * in the accountant's Sheet "Channel Name" column.
 */
function resolveSheetChannelName(youtubeName, knownSheetNames, minScore = 0.72) {
  const source = String(youtubeName || "").trim();
  if (!source || !Array.isArray(knownSheetNames) || knownSheetNames.length === 0) {
    return source;
  }

  let bestName = "";
  let bestScore = 0;

  for (const candidate of knownSheetNames) {
    const name = String(candidate || "").trim();
    if (!name) {
      continue;
    }
    const score = scoreChannelNameMatch(source, name);
    if (
      score > bestScore ||
      (score === bestScore &&
        score > 0 &&
        normalizeChannelName(name).length >
          normalizeChannelName(bestName).length)
    ) {
      bestScore = score;
      bestName = name;
    }
  }

  if (bestName && bestScore >= minScore) {
    return bestName;
  }

  return source;
}

function collectKnownChannelNames(existingValues) {
  const names = new Set();
  for (let i = 1; i < existingValues.length; i++) {
    const name = String(existingValues[i]?.[3] || "").trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names];
}

const MONTH_ALIASES = {
  january: ["january", "jan"],
  february: ["february", "feb"],
  march: ["march", "mar"],
  april: ["april", "apr"],
  may: ["may"],
  june: ["june", "jun"],
  july: ["july", "jul"],
  august: ["august", "aug"],
  september: ["september", "sep", "sept"],
  october: ["october", "oct"],
  november: ["november", "nov"],
  december: ["december", "dec"],
};

function normalizeMonthLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function monthAliasKey(value) {
  const normalized = normalizeMonthLabel(value);
  if (!normalized) {
    return "";
  }

  for (const [canonical, aliases] of Object.entries(MONTH_ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(alias))) {
      return canonical;
    }
  }

  return normalized;
}

/**
 * Map our month label onto the accountant's existing Month dropdown values
 * (e.g. "October" → "Oct" if that is what the Sheet list uses).
 */
function resolveSheetMonthName(monthLabel, knownMonthNames) {
  const source = String(monthLabel || "").trim();
  if (!source || !Array.isArray(knownMonthNames) || knownMonthNames.length === 0) {
    return source;
  }

  const sourceKey = monthAliasKey(source);
  if (!sourceKey) {
    return source;
  }

  let exact = "";
  let aliasMatch = "";

  for (const candidate of knownMonthNames) {
    const name = String(candidate || "").trim();
    if (!name) {
      continue;
    }
    if (name.toLowerCase() === source.toLowerCase()) {
      exact = name;
      break;
    }
    if (!aliasMatch && monthAliasKey(name) === sourceKey) {
      aliasMatch = name;
    }
  }

  return exact || aliasMatch || source;
}

function collectKnownMonthNames(existingValues) {
  const names = new Set();
  for (let i = 1; i < existingValues.length; i++) {
    const name = String(existingValues[i]?.[4] || "").trim();
    if (name) {
      names.add(name);
    }
  }
  return [...names];
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

  const knownChannelNames = collectKnownChannelNames(existingValues);
  const knownMonthNames = collectKnownMonthNames(existingValues);

  const rowIndexByKey = new Map();
  for (let i = 1; i < existingValues.length; i++) {
    const r = existingValues[i] || [];
    const key = `${String(r[0] || "").trim()}|${String(r[3] || "").trim()}|${String(r[4] || "").trim()}`;
    rowIndexByKey.set(key, i + 1); // 1-based sheet row number
  }

  for (const row of reportRows) {
    const sheetChannelName = resolveSheetChannelName(
      row.channelName,
      knownChannelNames
    );
    const sheetMonthName = resolveSheetMonthName(row.month, knownMonthNames);
    const mappedRow = {
      ...row,
      channelName: sheetChannelName,
      month: sheetMonthName,
    };
    const key = `${mappedRow.year}|${mappedRow.channelName}|${mappedRow.month}`;
    const values = rowObjectToSheetValues(mappedRow);
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
  resolveSheetChannelName,
  resolveSheetMonthName,
  normalizeChannelName,
  scoreChannelNameMatch,
};

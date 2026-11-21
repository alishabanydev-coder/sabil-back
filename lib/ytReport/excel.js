const ExcelJS = require("exceljs");

async function buildReportExcelBuffer(reportRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("YouTube Report");

  sheet.columns = [
    { header: "Year", key: "year", width: 10 },
    { header: "Date of Report", key: "dateOfReport", width: 15 },
    { header: "Admin Name", key: "adminName", width: 18 },
    { header: "Channel Name", key: "channelName", width: 26 },
    { header: "Month", key: "month", width: 16 },
    {
      header: "Subscribers Gained in Month",
      key: "subscribersGained",
      width: 26,
    },
    {
      header: "Subscribers Last of Month",
      key: "subscribersLastOfMonth",
      width: 25,
    },
    {
      header: "Subscriber Growth Rate (%)",
      key: "subscriberGrowthRate",
      width: 24,
    },
    { header: "Total Views", key: "totalViews", width: 16 },
    { header: "No.Video", key: "noVideo", width: 12 },
    { header: "No.Shorts", key: "noShorts", width: 12 },
    {
      header: "Total Watch Time (Hours)",
      key: "totalWatchTimeHours",
      width: 24,
    },
    { header: "Number of Comments", key: "numberOfComments", width: 20 },
    { header: "Revenu", key: "revenue", width: 14 },
    { header: "Impressions", key: "impressions", width: 16 },
    { header: "CTR (%)", key: "ctr", width: 12 },
    {
      header: "Average View Duration (sec)",
      key: "averageViewDuration",
      width: 26,
    },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of reportRows) {
    sheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  buildReportExcelBuffer,
};

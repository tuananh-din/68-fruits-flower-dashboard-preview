const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN");
const ratio = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let charts = [];

const valueLabelPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (!options.enabled) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = "600 11px 'Fira Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (options.datasetIndexes && !options.datasetIndexes.includes(datasetIndex)) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined || (!options.showZero && value === 0)) return;
        const point = element.tooltipPosition();
        ctx.fillStyle = dataset.borderColor || dataset.backgroundColor || "#1f2937";
        ctx.fillText(options.formatter(value, dataset, index), point.x, point.y - 8);
      });
    });
    ctx.restore();
  },
};

if (window.Chart) Chart.register(valueLabelPlugin);

document.getElementById("refresh").addEventListener("click", loadDashboard);
setDefaultYearToDate();
loadDashboard();

async function getJson(path) {
  return window.staticGetJson(path);
}

async function loadDashboard() {
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  const qs = new URLSearchParams();
  if (from) qs.set("date_from", from);
  if (to) qs.set("date_to", to);
  renderPeriodNote(from, to);
  const [summary, weekly, monthly, quarterly, product, accounts, campaigns, weekday, monthWeek, quality] = await Promise.all([
    getJson(`/api/summary?${qs}`),
    getJson(`/api/weekly-performance?${qs}`),
    getJson(`/api/monthly-performance?${qs}`),
    getJson(`/api/quarterly-performance?${qs}`),
    getJson(`/api/product-performance?${qs}`),
    getJson(`/api/account-performance?${qs}`),
    getJson(`/api/campaign-performance?${qs}`),
    getJson(`/api/weekday-performance?${qs}`),
    getJson(`/api/month-week-performance?${qs}`),
    getJson("/api/data-quality"),
  ]);
  renderKpis(summary);
  renderJoinNote(summary);
  renderCharts({ weekly, monthly, quarterly, product, weekday, monthWeek, summary, from, to });
  renderCalendarAnalysis(weekday, monthWeek);
  renderAccountTable(accounts);
  renderProductTable(product);
  renderCampaignTable(campaigns);
  renderQuality(quality);
}

function setDefaultYearToDate() {
  document.getElementById("date-from").value = window.STATIC_PREVIEW_DATES.date_from;
  document.getElementById("date-to").value = window.STATIC_PREVIEW_DATES.date_to;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderPeriodNote(from, to) {
  const label = from && to ? `${from} -> ${to}` : "Toàn bộ dữ liệu";
  document.getElementById("period-note").textContent = label;
}

function renderKpis(data) {
  const items = [
    ["Tổng chi tiêu", moneyOrMissing(data.spend), "Media spend"],
    ["Tổng tin nhắn", countOrMissing(data.messages), "Meta messages"],
    ["Cost/message", moneyOrMissing(data.cost_per_message), "Spend / messages"],
    ["Tổng doanh thu", moneyOrMissing(data.revenue), "Workbook revenue"],
    ["Tổng số đơn", countOrMissing(data.order_count), "Workbook orders"],
    ["ROAS", ratioOrMissing(data.roas), "Revenue / spend"],
    ["%CIR", percentOrMissing(data.ad_cost_ratio), "Spend / revenue"],
    ["Doanh thu/message", moneyOrMissing(data.revenue_per_message), "Revenue / messages"],
  ];
  document.getElementById("kpis").innerHTML = items
    .map(([label, value, hint]) => `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`)
    .join("");
}

function renderJoinNote(data) {
  const target = document.getElementById("join-note");
  if (data.revenue_join_status === "confirmed") {
    target.textContent = "Revenue join đã xác nhận: ROAS, CIR và revenue/message đang được tính.";
    target.className = "scope-note confirmed";
    return;
  }
  target.textContent = "ROAS, %CIR và doanh thu/message là số tổng kỳ đã chọn. Chưa tự phân bổ doanh thu xuống sản phẩm/campaign.";
  target.className = "scope-note";
}

function renderCharts({ weekly, monthly, quarterly, product, weekday, monthWeek, summary, from, to }) {
  destroyCharts();
  charts = [
    quarterlyComboChart(quarterly),
    monthlyCostChart(monthly),
    productEfficiencyChart(product),
    monthlyCirChart(monthly, Boolean(summary.ad_cost_ratio)),
    monthlyRevenueCostChart(monthly),
    weekdayChart(weekday),
    monthWeekChart(monthWeek),
  ];
  renderWeeklyReview(weekly, from, to);
}

function weekdayChart(rows) {
  return comboChart("weekday-chart", rows.map((row) => row.label), [
    barDataset("Doanh thu", rows.map((row) => row.revenue), "#f84545", "y"),
    lineDataset("%CIR", rows.map((row) => row.ad_cost_ratio), "#232a34", "y1"),
  ], {
    y: { formatter: shortMoney, title: "Doanh thu" },
    y1: { formatter: (value) => `${percent.format(value * 100)}%`, title: "%CIR" },
  }, { labels: true, labelFormatter: (value) => `${percent.format(value * 100)}%`, labelDataset: 1 });
}

function monthWeekChart(rows) {
  return comboChart("month-week-chart", rows.map((row) => `Tuần ${row.week_number}`), [
    barDataset("Doanh thu", rows.map((row) => row.revenue), "#f84545", "y"),
    lineDataset("%CIR", rows.map((row) => row.ad_cost_ratio), "#232a34", "y1"),
  ], {
    y: { formatter: shortMoney, title: "Doanh thu" },
    y1: { formatter: (value) => `${percent.format(value * 100)}%`, title: "%CIR" },
  }, { labels: true, labelFormatter: (value) => `${percent.format(value * 100)}%`, labelDataset: 1 });
}

function renderCalendarAnalysis(weekday, monthWeek) {
  const commonColumns = [
    ["Ngày QS", (row) => number.format(row.observed_days)],
    ["Chi phí", (row) => moneyOrMissing(row.spend)],
    ["Tin nhắn", (row) => countOrMissing(row.messages)],
    ["Cost/message", (row) => moneyOrMissing(row.cost_per_message)],
    ["Doanh thu", (row) => moneyOrMissing(row.revenue)],
    ["Đơn", (row) => countOrMissing(row.order_count)],
    ["ROAS*", (row) => ratioOrMissing(row.roas)],
    ["%CIR*", (row) => percentOrMissing(row.ad_cost_ratio)],
  ];
  renderTable("weekday-table", weekday, [["Thứ", (row) => row.label], ...commonColumns]);
  renderTable("month-week-table", monthWeek, [["Tuần", (row) => row.label], ["Tháng QS", (row) => number.format(row.observed_months)], ...commonColumns]);
}

function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}

function quarterlyComboChart(rows) {
  return comboChart("quarterly-combo-chart", rows.map((row) => row.quarter), [
    barDataset("Doanh thu S.I", rows.map((row) => row.revenue), "#f84545", "y"),
    lineDataset("Chi tiêu ads", rows.map((row) => row.spend), "#3f7cf7", "y1"),
  ], moneyScales(), { labels: true, labelFormatter: shortMoney });
}

function monthlyCostChart(rows) {
  return comboChart("monthly-cost-chart", rows.map((row) => row.month), [
    barDataset("Tin nhắn", rows.map((row) => row.messages), "#4f7df3", "y"),
    lineDataset("Cost/message", rows.map((row) => row.cost_per_message), "#ef4444", "y1"),
  ], {
    y: { formatter: (value) => number.format(value), title: "Tin nhắn" },
    y1: { formatter: shortMoney, title: "Cost/message" },
  });
}

function productEfficiencyChart(rows) {
  return comboChart("product-message-chart", rows.map((row) => productName(row.product_code)), [
    barDataset("Tin nhắn", rows.map((row) => row.messages), "#4f7df3", "y"),
    lineDataset("Cost/message", rows.map((row) => row.cost_per_message), "#f97316", "y1"),
  ], {
    y: { formatter: (value) => number.format(value), title: "Tin nhắn" },
    y1: { formatter: shortMoney, title: "Cost/message" },
  }, { labels: true, labelFormatter: (value) => number.format(value), labelDataset: 0 });
}

function monthlyCirChart(rows, canJoinRevenue) {
  const datasets = [barDataset("Doanh thu S.I", rows.map((row) => row.revenue), "#f84545", "y")];
  if (canJoinRevenue) {
    datasets.push(lineDataset("%CIR", rows.map((row) => row.ad_cost_ratio), "#232a34", "y1"));
  }
  return comboChart("monthly-cir-chart", rows.map((row) => row.month), datasets, {
    y: { formatter: shortMoney, title: "Doanh thu" },
    y1: { formatter: (value) => `${percent.format(value * 100)}%`, title: "%CIR" },
  }, { labels: canJoinRevenue, labelFormatter: (value) => `${percent.format(value * 100)}%`, labelDataset: 1 });
}

function monthlyRevenueCostChart(rows) {
  return comboChart("monthly-revenue-cost-chart", rows.map((row) => row.month), [
    barDataset("Doanh thu S.I", rows.map((row) => row.revenue), "#f84545", "y"),
    lineDataset("Cost/message", rows.map((row) => row.cost_per_message), "#3f7cf7", "y1"),
  ], {
    y: { formatter: shortMoney, title: "Doanh thu" },
    y1: { formatter: shortMoney, title: "Cost/message" },
  }, { labels: true, labelFormatter: shortMoney, labelDataset: 1 });
}

function renderWeeklyReview(rows, from, to) {
  const section = document.getElementById("weekly-section");
  const days = rangeDays(from, to);
  const shouldShow = days >= 45 && days <= 75 && rows.length > 1;
  section.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) {
    document.getElementById("weekly-table").innerHTML = "";
    return;
  }
  charts.push(weeklyReviewChart(rows));
  renderTable("weekly-table", rows, [
    ["Tuần", (row) => row.week_label],
    ["Chi phí", (row) => moneyOrMissing(row.spend)],
    ["Tin nhắn", (row) => countOrMissing(row.messages)],
    ["Cost/message", (row) => moneyOrMissing(row.cost_per_message)],
    ["Doanh thu", (row) => moneyOrMissing(row.revenue)],
    ["ROAS", (row) => ratioOrMissing(row.roas)],
    ["%CIR", (row) => percentOrMissing(row.ad_cost_ratio)],
  ]);
}

function weeklyReviewChart(rows) {
  return comboChart("weekly-review-chart", rows.map((row) => compactWeekLabel(row)), [
    barDataset("Tin nhắn", rows.map((row) => row.messages), "#4f7df3", "y"),
    lineDataset("Cost/message", rows.map((row) => row.cost_per_message), "#3f7cf7", "y1"),
  ], {
    y: { formatter: (value) => number.format(value), title: "Tin nhắn" },
    y1: { formatter: shortMoney, title: "Cost/message" },
  }, { labels: true, labelFormatter: shortMoney, labelDataset: 1 });
}

function comboChart(id, labels, datasets, scales, labelOptions = {}) {
  return new Chart(document.getElementById(id), {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { usePointStyle: true, boxWidth: 8, color: "#6b7280", font: { size: 12 } } },
        tooltip: { callbacks: { label: tooltipLabel } },
        valueLabels: {
          enabled: Boolean(labelOptions.labels),
          datasetIndexes: [labelOptions.labelDataset ?? 0],
          formatter: labelOptions.labelFormatter || shortMoney,
        },
      },
      scales: {
        x: axisStyle(),
        y: valueAxis(scales.y),
        y1: { ...valueAxis(scales.y1), position: "right", grid: { drawOnChartArea: false } },
      },
    },
  });
}

function barDataset(label, data, color, yAxisID) {
  return {
    type: "bar",
    label,
    data,
    backgroundColor: (context) => barGradient(context.chart, color),
    borderColor: color,
    borderWidth: 1,
    borderRadius: 7,
    maxBarThickness: 54,
    ...(yAxisID === "x" ? { xAxisID: "x" } : { yAxisID }),
  };
}

function lineDataset(label, data, color, yAxisID) {
  return {
    type: "line",
    label,
    data,
    yAxisID,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 3,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.38,
    spanGaps: true,
  };
}

function moneyScales() {
  return {
    y: { formatter: shortMoney, title: "Doanh thu" },
    y1: { formatter: shortMoney, title: "Chi tiêu" },
  };
}

function axisStyle(formatter) {
  const ticks = { color: "#9aa3b2" };
  if (formatter) ticks.callback = formatter;
  return {
    ticks,
    grid: { color: "rgba(148, 163, 184, 0.16)", drawBorder: false },
  };
}

function valueAxis(config = {}) {
  const ticks = { color: "#9aa3b2" };
  if (config.formatter) ticks.callback = config.formatter;
  return {
    beginAtZero: true,
    ticks,
    title: { display: Boolean(config.title), text: config.title, color: "#8a94a5" },
    grid: { color: "rgba(148, 163, 184, 0.16)", drawBorder: false },
  };
}

function tooltipLabel(context) {
  const value = context.parsed.y ?? context.parsed.x;
  if (context.dataset.label.includes("%CIR")) return `${context.dataset.label}: ${(value * 100).toFixed(2)}%`;
  if (context.dataset.label.includes("Tin nhắn")) return `${context.dataset.label}: ${number.format(value || 0)}`;
  return `${context.dataset.label}: ${currency.format(value || 0)}`;
}

function barGradient(chart, color) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return color;
  const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  gradient.addColorStop(0, `${color}24`);
  gradient.addColorStop(0.55, `${color}cc`);
  gradient.addColorStop(1, color);
  return gradient;
}

function renderAccountTable(rows) {
  renderTable("account-table", rows, [
    ["Tài khoản", (row) => row.account_name],
    ["Dòng", (row) => number.format(row.insight_rows || 0)],
    ["Từ ngày", (row) => row.date_from || "Chưa có dữ liệu"],
    ["Đến ngày", (row) => row.date_to || "Chưa có dữ liệu"],
    ["Chi tiêu", (row) => moneyOrMissing(row.spend)],
    ["Tin nhắn", (row) => countOrMissing(row.messages)],
    ["Cost/message", (row) => moneyOrMissing(row.cost_per_message)],
    ["Campaign", (row) => number.format(row.campaign_count || 0)],
  ]);
}

function renderProductTable(rows) {
  renderTable("product-table", rows, [
    ["Sản phẩm", (row) => productName(row.product_code)],
    ["Campaign", (row) => number.format(row.campaign_count || 0)],
    ["Chi tiêu", (row) => moneyOrMissing(row.spend)],
    ["Tỷ trọng chi", (row) => percentOrMissing(row.spend_contribution_pct)],
    ["Tin nhắn", (row) => countOrMissing(row.messages)],
    ["Tỷ trọng TN", (row) => percentOrMissing(row.message_contribution_pct)],
    ["Cost/message", (row) => moneyOrMissing(row.cost_per_message)],
  ]);
}

function renderCampaignTable(rows) {
  renderTable("campaign-table", rows, [
    ["Tài khoản", (row) => row.account_key],
    ["Campaign", (row) => row.campaign_name_raw],
    ["Sản phẩm", (row) => productName(row.product_code)],
    ["Từ ngày", (row) => row.date_from],
    ["Đến ngày", (row) => row.date_to],
    ["Chi tiêu", (row) => moneyOrMissing(row.spend)],
    ["Tin nhắn", (row) => countOrMissing(row.messages)],
    ["Cost/message", (row) => moneyOrMissing(row.cost_per_message)],
  ]);
}

function renderQuality(data) {
  const labels = {
    unclassified_campaigns: "Campaign chưa phân loại",
    spend_without_messages_days: "Ngày có chi nhưng không có tin nhắn",
    messages_without_spend_days: "Ngày có tin nhắn nhưng không có chi",
    revenue_status: "Doanh thu",
  };
  document.getElementById("quality").innerHTML = Object.entries(data)
    .map(([key, value]) => `<div><span>${labels[key] || key}</span><strong>${escapeHtml(String(value))}</strong></div>`)
    .join("");
}

function renderTable(targetId, rows, columns) {
  const header = columns.map(([label]) => `<th>${label}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => {
      const cells = columns.map(([, getter]) => `<td>${escapeHtml(String(getter(row) ?? ""))}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("")
    : `<tr><td colspan="${columns.length}">Chưa có dữ liệu</td></tr>`;
  document.getElementById(targetId).innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function productName(code) {
  return {
    fruit_basket: "Giỏ trái cây",
    flower_course: "Khóa học hoa",
    gift_basket_course: "Khóa học giỏ quà",
    unknown: "Chưa phân loại",
  }[code] || code || "Chưa có dữ liệu";
}

function moneyOrMissing(value) {
  return value === null || value === undefined ? "Chưa có dữ liệu" : currency.format(value);
}

function countOrMissing(value) {
  return value === null || value === undefined ? "Chưa có dữ liệu" : number.format(value);
}

function ratioOrMissing(value) {
  return value === null || value === undefined ? "Chưa có dữ liệu" : `${ratio.format(value)}x`;
}

function percentOrMissing(value) {
  return value === null || value === undefined ? "Chưa có dữ liệu" : `${percent.format(value * 100)}%`;
}

function rangeDays(from, to) {
  if (!from || !to) return 0;
  return Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
}

function compactWeekLabel(row) {
  return `${shortDate(row.week_start)} -> ${shortDate(row.week_end)}`;
}

function shortDate(value) {
  if (!value) return "";
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function shortMoney(value) {
  if (value === null || value === undefined) return "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} tỷ`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(0)} tr`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return currency.format(value);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

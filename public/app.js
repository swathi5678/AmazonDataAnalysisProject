const fileInput = document.querySelector("#csvFile");
const demoButton = document.querySelector("#demoButton");
const clearButton = document.querySelector("#clearButton");
const statusEl = document.querySelector("#status");
const dashboard = document.querySelector("#dashboard");

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-IN");

const colors = ["#f39b32", "#1e8a6a", "#246bcb", "#af3f64", "#6d5bd0"];
let latestData = null;

fileInput.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  setStatus(`Analyzing ${file.name}...`);
  const csv = await file.text();
  analyzeCsv(csv);
});

demoButton.addEventListener("click", async () => {
  setStatus("Loading demo dashboard...");
  try {
    const response = await fetch("/api/demo");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    renderDashboard(data);
    setStatus("Demo data loaded. Upload your CSV when you are ready.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

clearButton.addEventListener("click", () => {
  fileInput.value = "";
  dashboard.classList.add("hidden");
  setStatus("Ready for your dataset.");
});

async function analyzeCsv(csv) {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    renderDashboard(data);
    setStatus("Analysis complete.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderDashboard(data) {
  latestData = data;
  dashboard.classList.remove("hidden");
  text("#rowCount", `${number.format(data.rowCount)} rows`);
  text("#validRows", `${number.format(data.validRows)} valid orders`);
  text("#totalSales", currency.format(data.summary.totalSales));
  text("#salesTrend", trendLabel(data.summary.salesTrend, "sales"));
  text("#totalOrders", number.format(data.summary.totalOrders));
  text("#ordersTrend", trendLabel(data.summary.ordersTrend, "orders"));
  text("#averageOrderValue", currency.format(data.summary.averageOrderValue));
  text("#uniqueCustomers", `${number.format(data.summary.uniqueCustomers)} customers`);
  text("#topRegion", data.summary.bestRegion?.name || "-");
  text("#topRegionSales", currency.format(data.summary.bestRegion?.sales || 0));
  text("#bestMonth", data.summary.bestMonth ? `${data.summary.bestMonth.label} led sales` : "Best month");

  drawLineChart("monthlyChart", data.charts.monthlySales.map(item => item.label), data.charts.monthlySales.map(item => item.sales), {
    color: "#f39b32",
    fill: "rgba(243,155,50,0.14)",
    valuePrefix: "₹"
  });
  drawBarChart("quantityChart", data.charts.productsByQuantity.map(item => item.name), data.charts.productsByQuantity.map(item => item.quantity), {
    horizontal: true,
    color: "#246bcb"
  });
  drawLineChart("retentionChart", data.charts.retention.map(item => item.month), data.charts.retention.map(item => item.retentionRate), {
    color: "#1e8a6a",
    fill: "rgba(30,138,106,0.12)",
    valueSuffix: "%"
  });

  renderRanks("#productSales", data.charts.productsBySales, "sales");
  renderRanks("#regionSales", data.charts.regionsBySales, "sales");
  renderRanks("#customerSales", data.charts.customersBySales, "sales");
  renderForecast(data.charts.forecast);
  renderSegments(data.charts.customerSegments);
  renderInsights(data.insights);
}

function text(selector, value) {
  document.querySelector(selector).textContent = value;
}

function trendLabel(value, noun) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}% latest month ${noun}`;
}

function renderRanks(selector, items, field) {
  const root = document.querySelector(selector);
  const max = Math.max(...items.map(item => item[field] || 0), 1);
  root.innerHTML = items.map((item, index) => {
    const value = field === "sales" ? currency.format(item[field]) : number.format(item[field]);
    const width = Math.max(4, (item[field] / max) * 100);
    return `
      <div class="rank-row">
        <div class="rank-line">
          <strong title="${escapeHtml(item.name)}">${index + 1}. ${escapeHtml(item.name)}</strong>
          <span>${value}</span>
        </div>
        <div class="bar"><span style="width:${width}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderForecast(items) {
  const root = document.querySelector("#forecastList");
  root.innerHTML = items.map(item => `
    <div class="forecast-row">
      <span>${escapeHtml(item.label)}</span>
      <strong>${currency.format(item.sales)}</strong>
    </div>
  `).join("");
}

function renderSegments(items) {
  const root = document.querySelector("#segments");
  const groups = items.reduce((acc, item) => {
    acc[item.label] = acc[item.label] || { label: item.label, count: 0, sales: 0 };
    acc[item.label].count += 1;
    acc[item.label].sales += item.sales;
    return acc;
  }, {});

  root.innerHTML = Object.values(groups).map(group => `
    <div class="segment-card">
      <strong>${escapeHtml(group.label)}</strong>
      <span>${number.format(group.count)} customers</span>
      <span>${currency.format(group.sales)}</span>
    </div>
  `).join("");
}

function renderInsights(items) {
  const root = document.querySelector("#insights");
  root.innerHTML = items.map(item => `<div class="insight">${escapeHtml(item)}</div>`).join("");
}

function drawLineChart(canvasId, labels, values, options = {}) {
  const canvas = document.querySelector(`#${canvasId}`);
  const { context, width, height } = prepareCanvas(canvas);
  const padding = { top: 24, right: 20, bottom: 58, left: 68 };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  clearCanvas(context, width, height);
  drawAxes(context, padding, width, height);

  const points = values.map((value, index) => ({
    x: padding.left + (index / Math.max(labels.length - 1, 1)) * (width - padding.left - padding.right),
    y: padding.top + ((max - value) / range) * (height - padding.top - padding.bottom),
    value
  }));

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineTo(points[points.length - 1]?.x || padding.left, height - padding.bottom);
  context.lineTo(points[0]?.x || padding.left, height - padding.bottom);
  context.closePath();
  context.fillStyle = options.fill || "rgba(36,107,203,0.1)";
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineWidth = 3;
  context.strokeStyle = options.color || colors[0];
  context.stroke();

  points.forEach(point => {
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fillStyle = options.color || colors[0];
    context.fill();
  });

  drawLabels(context, labels, padding, width, height);
  drawYAxis(context, max, padding, height, options);
}

function drawBarChart(canvasId, labels, values, options = {}) {
  const canvas = document.querySelector(`#${canvasId}`);
  const { context, width, height } = prepareCanvas(canvas);
  const padding = { top: 20, right: 28, bottom: 34, left: 140 };
  const max = Math.max(...values, 1);
  const barHeight = (height - padding.top - padding.bottom) / Math.max(values.length, 1);

  clearCanvas(context, width, height);
  drawAxes(context, padding, width, height);

  labels.forEach((label, index) => {
    const y = padding.top + index * barHeight + barHeight * 0.22;
    const barWidth = ((values[index] || 0) / max) * (width - padding.left - padding.right);
    context.fillStyle = options.color || colors[index % colors.length];
    context.fillRect(padding.left, y, barWidth, Math.max(8, barHeight * 0.55));
    context.fillStyle = "#69717b";
    context.font = "12px Inter, system-ui, sans-serif";
    context.textAlign = "right";
    context.fillText(truncate(label, 17), padding.left - 10, y + Math.max(12, barHeight * 0.35));
    context.textAlign = "left";
    context.fillText(number.format(values[index] || 0), padding.left + barWidth + 6, y + Math.max(12, barHeight * 0.35));
  });
}

function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Number(canvas.getAttribute("height"));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  return { context, width, height };
}

function clearCanvas(context, width, height) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fffdf9";
  context.fillRect(0, 0, width, height);
}

function drawAxes(context, padding, width, height) {
  context.strokeStyle = "#e4ded4";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, height - padding.bottom);
  context.lineTo(width - padding.right, height - padding.bottom);
  context.stroke();
}

function drawLabels(context, labels, padding, width, height) {
  const step = Math.ceil(labels.length / 6);
  context.fillStyle = "#69717b";
  context.font = "12px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  labels.forEach((label, index) => {
    if (index % step !== 0 && index !== labels.length - 1) return;
    const x = padding.left + (index / Math.max(labels.length - 1, 1)) * (width - padding.left - padding.right);
    context.fillText(truncate(label, 12), x, height - 24);
  });
}

function drawYAxis(context, max, padding, height, options) {
  context.fillStyle = "#69717b";
  context.font = "12px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  for (let i = 0; i <= 4; i += 1) {
    const value = (max / 4) * i;
    const y = height - padding.bottom - ((height - padding.top - padding.bottom) / 4) * i;
    const label = `${options.valuePrefix || ""}${compact(value)}${options.valueSuffix || ""}`;
    context.fillText(label, padding.left - 10, y + 4);
  }
}

function compact(value) {
  if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value);
}

function truncate(value, length) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("resize", () => {
  if (latestData) renderDashboard(latestData);
}, { passive: true });

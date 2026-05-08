const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const aliases = {
  orderDate: ["order date", "date", "purchase date"],
  orderId: ["order id", "order no", "order number", "amazon order id"],
  customerName: ["customer name", "customer", "buyer name", "name"],
  address: ["address", "shipping address", "ship to address", "city/state"],
  products: ["products", "product", "item", "item name", "product name"],
  qty: ["qty", "quantity", "quantity sold", "units"],
  charges: [
    "total product charges",
    "total product charges (basic price)",
    "total product charges basic price",
    "amount",
    "sales",
    "total",
    "price"
  ]
};

const monthNames = [
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
  "December"
];

const stateMapping = {
  KA: "Karnataka",
  WB: "West Bengal",
  MH: "Maharashtra",
  "J&K": "Jammu & Kashmir",
  JK: "Jammu & Kashmir",
  TN: "Tamil Nadu",
  UP: "Uttar Pradesh",
  AP: "Andhra Pradesh",
  GJ: "Gujarat",
  DL: "Delhi",
  HR: "Haryana",
  BR: "Bihar",
  RJ: "Rajasthan",
  MP: "Madhya Pradesh",
  PB: "Punjab",
  KL: "Kerala",
  OR: "Odisha",
  TS: "Telangana",
  CH: "Chandigarh",
  BENGALURU: "Karnataka",
  BANGALORE: "Karnataka",
  KOLKATA: "West Bengal",
  MUMBAI: "Maharashtra",
  CHENNAI: "Tamil Nadu",
  HYDERABAD: "Telangana",
  DELHI: "Delhi",
  PUNE: "Maharashtra"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("File is too large. Please upload a CSV under 12 MB."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeHeader(header) {
  return String(header || "")
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .trim()
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some(cell => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(values => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function findColumn(headers, names) {
  const normalized = headers.map(header => ({ raw: header, value: normalizeHeader(header) }));
  for (const name of names) {
    const target = normalizeHeader(name);
    const exact = normalized.find(header => header.value === target);
    if (exact) return exact.raw;
  }
  for (const name of names) {
    const target = normalizeHeader(name);
    const partial = normalized.find(header => header.value.includes(target) || target.includes(header.value));
    if (partial) return partial.raw;
  }
  return null;
}

function toDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) {
    const [, first, second, yearPart] = match;
    const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
    const date = new Date(Number(year), Number(second) - 1, Number(first));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cleanProduct(product) {
  if (!product) return "Unknown product";
  return String(product)
    .toLowerCase()
    .replace(/\b\d+\s*(nos|pieces|piece|g|kg|ml|l|liters|units|set|no)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase()) || "Unknown product";
}

function extractRegion(address) {
  const text = String(address || "").trim();
  if (!text) return "Unknown";
  const upper = text.toUpperCase();

  for (const [key, region] of Object.entries(stateMapping)) {
    const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(upper)) return region;
  }

  const parts = text.split(",").map(part => part.trim()).filter(Boolean);
  return parts.length ? titleCase(parts[parts.length - 1]) : "Unknown";
}

function titleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addGroup(map, key, patch) {
  if (!map.has(key)) map.set(key, { name: key, sales: 0, orders: 0, quantity: 0 });
  const item = map.get(key);
  item.sales += patch.sales || 0;
  item.orders += patch.orders || 0;
  item.quantity += patch.quantity || 0;
  return item;
}

function topItems(map, limit = 10, field = "sales") {
  return [...map.values()]
    .sort((a, b) => b[field] - a[field])
    .slice(0, limit)
    .map(item => ({
      ...item,
      sales: round(item.sales),
      avgOrderValue: item.orders ? round(item.sales / item.orders) : 0
    }));
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getTrend(values) {
  if (values.length < 2) return 0;
  const current = values[values.length - 1] || 0;
  const previous = values[values.length - 2] || 0;
  if (!previous) return current ? 100 : 0;
  return round(((current - previous) / previous) * 100);
}

function movingForecast(monthlySales, steps = 6) {
  const values = monthlySales.map(item => item.sales);
  const lastDate = monthlySales.length ? new Date(`${monthlySales[monthlySales.length - 1].month}-01T00:00:00`) : new Date();
  const forecast = [];

  for (let i = 1; i <= steps; i += 1) {
    const window = values.slice(-Math.min(3, values.length || 1));
    const average = window.length ? window.reduce((sum, value) => sum + value, 0) / window.length : 0;
    const seasonal = values.length >= 12 ? values[values.length - 12] * 0.25 : 0;
    const projected = round((average * 0.75) + seasonal);
    values.push(projected);

    const date = new Date(lastDate);
    date.setMonth(lastDate.getMonth() + i);
    forecast.push({
      month: formatMonthKey(date),
      label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
      sales: projected
    });
  }

  return forecast;
}

function analyzeRows(rows) {
  if (!rows.length) {
    throw new Error("No rows found in the CSV.");
  }

  const headers = Object.keys(rows[0]);
  const columns = Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [key, findColumn(headers, names)])
  );

  const required = ["orderDate", "products", "charges"];
  const missing = required.filter(key => !columns[key]);
  if (missing.length) {
    throw new Error(`Missing required column(s): ${missing.join(", ")}. Please include order date, product and total charges columns.`);
  }

  const productMap = new Map();
  const customerMap = new Map();
  const regionMap = new Map();
  const dailyMap = new Map();
  const monthlyMap = new Map();
  const weekdayMap = new Map();
  const rawCustomersByMonth = new Map();
  const cleaned = [];

  for (const row of rows) {
    const date = toDate(row[columns.orderDate]);
    if (!date) continue;

    const sales = Math.max(0, parseLooseNumber(row[columns.charges]) || 0);
    const quantity = Math.max(0, parseLooseNumber(columns.qty ? row[columns.qty] : 1) || 1);
    const product = cleanProduct(row[columns.products]);
    const customer = titleCase(row[columns.customerName] || "Unknown customer");
    const region = extractRegion(row[columns.address]);
    const orderId = row[columns.orderId] || `${customer}-${formatDateKey(date)}-${product}`;
    const month = formatMonthKey(date);
    const day = formatDateKey(date);
    const weekday = monthNames[date.getMonth()];

    cleaned.push({ date, month, sales, quantity, product, customer, region, orderId });
    addGroup(productMap, product, { sales, orders: 1, quantity });
    addGroup(customerMap, customer, { sales, orders: 1, quantity });
    addGroup(regionMap, region, { sales, orders: 1, quantity });
    addGroup(dailyMap, day, { sales, orders: 1, quantity });
    addGroup(monthlyMap, month, { sales, orders: 1, quantity });
    addGroup(weekdayMap, weekday, { sales, orders: 1, quantity });

    if (!rawCustomersByMonth.has(month)) rawCustomersByMonth.set(month, new Set());
    rawCustomersByMonth.get(month).add(customer);
  }

  if (!cleaned.length) {
    throw new Error("No valid dated orders found after parsing the CSV.");
  }

  const uniqueOrders = new Set(cleaned.map(item => item.orderId));
  const uniqueCustomers = new Set(cleaned.map(item => item.customer));
  const totalSales = cleaned.reduce((sum, item) => sum + item.sales, 0);
  const totalQuantity = cleaned.reduce((sum, item) => sum + item.quantity, 0);
  const monthlySales = [...monthlyMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => ({
      month: item.name,
      label: `${monthNames[Number(item.name.slice(5, 7)) - 1]} ${item.name.slice(0, 4)}`,
      sales: round(item.sales),
      orders: item.orders,
      quantity: item.quantity
    }));

  const dailySales = [...dailyMap.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(item => ({ date: item.name, sales: round(item.sales), orders: item.orders }));

  const customerMonths = [...rawCustomersByMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const retention = [];
  for (let i = 0; i < customerMonths.length - 1; i += 1) {
    const [month, current] = customerMonths[i];
    const [, next] = customerMonths[i + 1];
    const retained = [...current].filter(customer => next.has(customer)).length;
    const churned = current.size - retained;
    retention.push({
      month: customerMonths[i + 1][0],
      fromMonth: month,
      retentionRate: current.size ? round((retained / current.size) * 100) : 0,
      churnRate: current.size ? round((churned / current.size) * 100) : 0
    });
  }

  const productsBySales = topItems(productMap, 10, "sales");
  const productsByQuantity = topItems(productMap, 10, "quantity");
  const customersBySales = topItems(customerMap, 10, "sales");
  const regionsBySales = topItems(regionMap, 12, "sales");
  const weekdaySales = [...weekdayMap.values()]
    .sort((a, b) => b.sales - a.sales)
    .map(item => ({ name: item.name, sales: round(item.sales), orders: item.orders }));

  const sortedCustomers = [...customerMap.values()].sort((a, b) => b.sales - a.sales);
  const customerSegments = sortedCustomers.map((customer, index) => {
    const percentile = (index + 1) / sortedCustomers.length;
    const label = percentile <= 0.2 ? "High value" : percentile <= 0.55 ? "Growth" : "Occasional";
    return { name: customer.name, sales: round(customer.sales), quantity: customer.quantity, orders: customer.orders, label };
  });

  const bestMonth = monthlySales.reduce((best, item) => (item.sales > best.sales ? item : best), monthlySales[0]);
  const bestProduct = productsBySales[0];
  const bestRegion = regionsBySales[0];
  const salesTrend = getTrend(monthlySales.map(item => item.sales));
  const ordersTrend = getTrend(monthlySales.map(item => item.orders));

  return {
    mode: "amazon",
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    validRows: cleaned.length,
    columns,
    summary: {
      totalSales: round(totalSales),
      totalOrders: uniqueOrders.size,
      totalQuantity,
      uniqueCustomers: uniqueCustomers.size,
      averageOrderValue: uniqueOrders.size ? round(totalSales / uniqueOrders.size) : 0,
      salesTrend,
      ordersTrend,
      bestMonth,
      bestProduct,
      bestRegion
    },
    charts: {
      monthlySales,
      dailySales,
      productsBySales,
      productsByQuantity,
      customersBySales,
      regionsBySales,
      weekdaySales,
      retention,
      forecast: movingForecast(monthlySales, 6),
      customerSegments: customerSegments.slice(0, 50)
    },
    insights: buildInsights({ totalSales, monthlySales, productsBySales, customersBySales, regionsBySales, retention })
  };
}

function parseLooseNumber(value) {
  const cleaned = String(value || "").replace(/[^\d.-]/g, "");
  if (!cleaned) return Number.NaN;
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : Number.NaN;
}

function buildInsights({ totalSales, monthlySales, productsBySales, customersBySales, regionsBySales, retention }) {
  const insights = [];
  const topProduct = productsBySales[0];
  const topCustomer = customersBySales[0];
  const topRegion = regionsBySales[0];
  const lastRetention = retention[retention.length - 1];

  if (topProduct) {
    insights.push(`${topProduct.name} leads product revenue with ${percent(topProduct.sales, totalSales)} of total sales.`);
  }
  if (topRegion) {
    insights.push(`${topRegion.name} is the strongest location by sales and should be prioritized for stock planning.`);
  }
  if (topCustomer) {
    insights.push(`${topCustomer.name} is the highest-value customer with an average order value of ${currency(topCustomer.avgOrderValue)}.`);
  }
  if (lastRetention) {
    insights.push(`Latest month retention is ${lastRetention.retentionRate}%, with churn at ${lastRetention.churnRate}%.`);
  }
  if (monthlySales.length > 1) {
    const first = monthlySales[0].sales;
    const last = monthlySales[monthlySales.length - 1].sales;
    insights.push(`Sales moved ${round(((last - first) / (first || 1)) * 100)}% from the first available month to the latest month.`);
  }

  return insights;
}

function percent(value, total) {
  return `${round(((value || 0) / (total || 1)) * 100)}%`;
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function savedAmazonRows() {
  const products = ["Gloss And Glow", "24mm Aerator", "Aquasoft 16", "Rapidclean", "Jade Bib Cock", "Floorclean ADF 5L", "Pluto Overhead Shower", "Casa Soft Close Seat Cover"];
  const customers = ["Aarav Industries", "Bluebird Homes", "Chennai Sanitary Stores", "Delta Interiors", "Evergreen Traders", "Fresh Bath Studio", "Golden Homes", "Hydro Works"];
  const regions = ["Chennai, Tamil Nadu", "Bengaluru, KA", "Hyderabad, TS", "Mumbai, MH", "Delhi, DL", "Kolkata, WB", "Pune, MH"];
  const rows = [];

  for (let i = 0; i < 180; i += 1) {
    const date = new Date(2024, i % 12, (i * 7) % 27 + 1);
    const product = products[i % products.length];
    const qty = (i % 5) + 1;
    const base = 420 + ((i * 137) % 1800);
    rows.push({
      "Order Date": date.toISOString().slice(0, 10),
      "Order ID": `AMZ-${String(i + 1).padStart(4, "0")}`,
      "Customer Name": customers[(i * 3) % customers.length],
      Address: regions[(i * 5) % regions.length],
      Products: product,
      Qty: String(qty),
      "Total Product Charges": String(base * qty)
    });
  }

  return rows;
}

async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const route = requestUrl.searchParams.get("route");
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && (pathname.startsWith("/api/amazon-analysis") || route === "amazon-analysis")) {
      sendJson(res, 200, analyzeRows(savedAmazonRows()));
      return;
    }

    if (req.method === "POST" && (pathname.startsWith("/api/analyze") || route === "analyze")) {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const rows = parseCsv(payload.csv || "");
      sendJson(res, 200, analyzeRows(rows));
      return;
    }

    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Unable to analyze the file." });
  }
}

const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Amazon analysis dashboard running at http://localhost:${PORT}`);
  });
}

module.exports = handler;
module.exports.analyzeRows = analyzeRows;
module.exports.savedAmazonRows = savedAmazonRows;
module.exports.parseCsv = parseCsv;

const api = require("../server");

const MAX_BODY_BYTES = 12 * 1024 * 1024;

module.exports = async function analyzeHandler(req, res) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const payload = await getPayload(req);
    const rows = api.parseCsv(payload.csv || "");
    sendJson(res, 200, api.analyzeRows(rows));
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Unable to analyze the file." });
  }
};

async function getPayload(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const body = await readBody(req);
  return JSON.parse(body || "{}");
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

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

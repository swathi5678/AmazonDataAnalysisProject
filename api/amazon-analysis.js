const api = require("../server");

module.exports = function amazonAnalysisHandler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    sendJson(res, 200, api.analyzeRows(api.savedAmazonRows()));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unable to load Amazon analysis." });
  }
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

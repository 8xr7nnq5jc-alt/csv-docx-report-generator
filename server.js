import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { generateReportDocx, parseCsv } from "./lib/reportGenerator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== ".csv") {
      callback(new Error("Only .csv files are accepted."));
      return;
    }
    callback(null, true);
  }
});

const PORT = process.env.PORT || 4175;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123";
const DATA_DIR = path.join(__dirname, "data");
const LOG_FILE = path.join(DATA_DIR, "activity-log.json");
const sessions = new Set();

app.disable("x-powered-by");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => {
        try {
          return [key, decodeURIComponent(value)];
        } catch {
          return [key, ""];
        }
      })
  );
}

function passwordsMatch(input, expected) {
  const inputBuffer = Buffer.from(String(input ?? ""));
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}

function requireLogin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  if (!sessions.has(cookies.session)) {
    res.status(401).json({ error: "Not logged in." });
    return;
  }
  next();
}

async function appendLog(entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let log = [];
  try {
    log = JSON.parse(await fs.readFile(LOG_FILE, "utf8"));
  } catch {
    log = [];
  }
  log.unshift(entry);
  await fs.writeFile(LOG_FILE, JSON.stringify(log.slice(0, 50), null, 2));
}

app.post("/api/login", (req, res) => {
  if (!passwordsMatch(req.body.password, DEMO_PASSWORD)) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.add(sessionId);
  res.cookie("session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  sessions.delete(cookies.session);
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/status", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  res.json({ loggedIn: sessions.has(cookies.session) });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "csv-docx-report-generator" });
});

app.get("/api/logs", requireLogin, async (_req, res) => {
  try {
    res.json(JSON.parse(await fs.readFile(LOG_FILE, "utf8")));
  } catch {
    res.json([]);
  }
});

app.post("/api/report", requireLogin, upload.single("csv"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a CSV file first." });
      return;
    }

    const reportType = req.body.reportType === "team" ? "team" : "individual";
    const rows = parseCsv(req.file.buffer.toString("utf8"));
    if (rows.length === 0) {
      res.status(400).json({ error: "The CSV must contain a header row and at least one data row." });
      return;
    }

    const docxBuffer = await generateReportDocx({
      rows,
      reportType,
      originalName: req.file.originalname
    });

    await appendLog({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      fileName: req.file.originalname,
      reportType,
      rows: rows.length
    });

    const safeType = reportType === "team" ? "team" : "individual";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeType}-report.docx"`);
    res.send(docxBuffer);
  } catch (error) {
    if (error?.message?.startsWith("CSV contains")) {
      res.status(400).json({ error: "The CSV could not be parsed. Check quoted fields and try again." });
      return;
    }
    console.error("Report generation failed:", error);
    res.status(500).json({ error: "The report could not be generated. Check the CSV and try again." });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "The CSV file is too large. The maximum size is 2 MB." });
    return;
  }
  if (error?.message === "Only .csv files are accepted.") {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Unexpected request error:", error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`CSV to DOCX report generator running at http://localhost:${PORT}`);
  console.log(`Demo password: ${DEMO_PASSWORD}`);
});


const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const DB = path.join(__dirname, "messages.json");
const WORDS = path.join(__dirname, "blocked-words.json");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD is not configured.");
}

const sessions = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: "غير مصرح" });
  }

  next();
}

// إرسال رسالة
app.post("/api/messages", (req, res) => {
  const text = String(req.body.message || "").trim();
  const anonymous = req.body.anonymous !== false;

  if (!text) {
    return res.status(400).json({ error: "الرسالة فارغة" });
  }

  if (text.length > 500) {
    return res.status(400).json({ error: "الرسالة طويلة جدًا" });
  }

  const blocked = readJson(WORDS, []);
  const lower = text.toLowerCase();

  const matched = blocked.filter(
    w => w && lower.includes(String(w).toLowerCase())
  );

  const messages = readJson(DB, []);

  const item = {
    id: crypto.randomUUID(),
    message: text,
    anonymous,
    status: matched.length ? "flagged" : "inbox",
    matchedCategories: matched.length ? ["blocked-word"] : [],
    createdAt: new Date().toISOString()
  };

  messages.push(item);
  saveJson(DB, messages);

  res.json({
    ok: true,
    status: item.status,
    message: matched.length
      ? "تم حجب الرسالة لمراجعتها بسبب محتوى مخالف."
      : "تم إرسال الرسالة."
  });
});

// تسجيل دخول الإدارة
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({
      error: "لم يتم إعداد كلمة مرور الإدارة في Railway."
    });
  }

  const password = String(req.body.password || "");

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "كلمة المرور غير صحيحة"
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, Date.now());

  res.json({
    ok: true,
    token
  });
});

// الرسائل — محمية
app.get("/api/admin/messages", requireAdmin, (req, res) => {
  res.json(readJson(DB, []));
});

// إجراءات الإدارة — محمية
app.post("/api/admin/messages/:id/action", requireAdmin, (req, res) => {
  const messages = readJson(DB, []);

  const item = messages.find(m => m.id === req.params.id);

  if (!item) {
    return res.status(404).json({
      error: "غير موجود"
    });
  }

  const action = req.body.action;

  if (!["keep", "delete", "block"].includes(action)) {
    return res.status(400).json({
      error: "إجراء غير صالح"
    });
  }

  item.status = action === "keep" ? "inbox" : action;

  saveJson(DB, messages);

  res.json({
    ok: true,
    item
  });
});

app.listen(PORT, () => {
  console.log(`Ask Eya running on port ${PORT}`);
});

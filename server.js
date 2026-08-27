const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "messages.json");
const WORDS = path.join(__dirname, "blocked-words.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

app.post("/api/messages", (req, res) => {
  const text = String(req.body.message || "").trim();
  const anonymous = req.body.anonymous !== false;

  if (!text) return res.status(400).json({error:"الرسالة فارغة"});
  if (text.length > 500) return res.status(400).json({error:"الرسالة طويلة جدًا"});

  const blocked = readJson(WORDS, []);
  const lower = text.toLowerCase();
  const matched = blocked.filter(w => w && lower.includes(String(w).toLowerCase()));

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

app.get("/api/admin/messages", (req, res) => {
  // Demo endpoint only. Before public deployment, protect this with real authentication.
  res.json(readJson(DB, []));
});

app.post("/api/admin/messages/:id/action", (req, res) => {
  const messages = readJson(DB, []);
  const item = messages.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({error:"غير موجود"});
  const action = req.body.action;
  if (!["keep","delete","block"].includes(action))
    return res.status(400).json({error:"إجراء غير صالح"});
  item.status = action === "keep" ? "inbox" : action;
  saveJson(DB, messages);
  res.json({ok:true, item});
});

app.listen(PORT, () => console.log(`Ask Eya running on http://localhost:${PORT}`));

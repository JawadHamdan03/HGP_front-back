// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5001;

// ======== CONFIG ========

// ESP32 base URL will be set dynamically when ESP32 calls /api/esp32/register
let ESP32_BASE_URL = null;

// MySQL config (عدّل الباسورد لو عندك)
const dbConfig = {
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "123456",          // لو عندك 123456 حطها هنا
  database: "smart_warehouse"
};

// ======== MIDDLEWARE ========
app.use(express.json());

// Serve frontend (index.html, app.js, styles.css)
app.use(express.static(path.join(__dirname, "")));

// Dummy auth
async function authMiddleware(req, res, next) {
  next();
}

// ======== DB HELPER ========
async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

// ======== HELPER: send command to ESP32 ========
async function sendCommandToESP32(cmd) {
  if (!ESP32_BASE_URL) {
    console.error("ESP32_BASE_URL is not set. ESP32 not registered yet.");
    return {
      ok: false,
      response: "ESP32 not registered. Call /api/esp32/register first."
    };
  }

  try {
    const url = `${ESP32_BASE_URL}/cmd?c=${encodeURIComponent(cmd)}`;
    console.log("Sending to ESP32:", url);
    const res = await fetch(url);
    const text = await res.text();
    return { ok: res.ok, response: text };
  } catch (err) {
    console.error("Error contacting ESP32:", err);
    return { ok: false, response: String(err) };
  }
}

// ======== ROUTES ========

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ESP32 register
// ESP32 calls: GET http://<PC_IP>:5001/api/esp32/register?ip=<ESP32_IP>
app.get("/api/esp32/register", (req, res) => {
  const ip = req.query.ip;
  if (!ip) {
    return res.status(400).json({ error: "Missing 'ip' query param" });
  }

  ESP32_BASE_URL = `http://${ip}`;
  console.log("ESP32 registered with IP:", ESP32_BASE_URL);

  res.json({ ok: true, esp32_base_url: ESP32_BASE_URL });
});

// -------- CELLS + PRODUCTS --------

// Get all cells with product info
app.get("/api/cells", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query(
      `SELECT c.id as cell_id, c.row_num, c.col_num, c.label,
              cp.quantity,
              p.id as product_id, p.name as product_name, p.sku, p.rfid_uid
       FROM cells c
       LEFT JOIN cell_products cp ON cp.cell_id = c.id
       LEFT JOIN products p ON cp.product_id = p.id
       ORDER BY c.row_num, c.col_num`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/cells error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Get all products
app.get("/api/products", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query("SELECT * FROM products ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Add product
app.post("/api/products", authMiddleware, async (req, res) => {
  const { name, sku, rfid_uid } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  let conn;
  try {
    conn = await getConnection();
    const [result] = await conn.query(
      "INSERT INTO products (name, sku, rfid_uid) VALUES (?, ?, ?)",
      [name, sku || null, rfid_uid || null]
    );
    res.json({ id: result.insertId, name, sku, rfid_uid });
  } catch (err) {
    console.error("POST /api/products error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Assign product to cell (manual)
app.post("/api/cells/:cellId/assign", authMiddleware, async (req, res) => {
  const { cellId } = req.params;
  const { product_id, quantity } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.query(
      `INSERT INTO cell_products (cell_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE product_id = VALUES(product_id),
                                 quantity = VALUES(quantity)`,
      [cellId, product_id, quantity || 1]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/cells/:cellId/assign error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Clear cell
app.post("/api/cells/:cellId/clear", authMiddleware, async (req, res) => {
  const { cellId } = req.params;
  let conn;
  try {
    conn = await getConnection();
    await conn.query("DELETE FROM cell_products WHERE cell_id = ?", [cellId]);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/cells/:cellId/clear error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// -------- LOADING ZONE --------

// Get all loading slots
app.get("/api/loading-slots", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query(
      `SELECT ls.id, ls.slot_num, ls.status, ls.quantity,
              p.id AS product_id, p.name AS product_name, p.sku, p.rfid_uid
       FROM loading_slots ls
       LEFT JOIN products p ON p.id = ls.product_id
       ORDER BY ls.slot_num`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/loading-slots error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Assign product directly to loading slot (manual)
app.post("/api/loading-slots/:slotId/assign", authMiddleware, async (req, res) => {
  const { slotId } = req.params;
  const { product_id, quantity } = req.body;

  if (!product_id) {
    return res.status(400).json({ error: "product_id is required" });
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.query(
      `UPDATE loading_slots
       SET product_id = ?, quantity = ?, status = 'READY'
       WHERE id = ?`,
      [product_id, quantity || 1, slotId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/loading-slots/:slotId/assign error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Clear loading slot
app.post("/api/loading-slots/:slotId/clear", authMiddleware, async (req, res) => {
  const { slotId } = req.params;
  let conn;
  try {
    conn = await getConnection();
    await conn.query(
      `UPDATE loading_slots
       SET product_id = NULL, quantity = 0, status = 'EMPTY'
       WHERE id = ?`,
      [slotId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/loading-slots/:slotId/clear error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Move from cell -> loading slot (manual + ESP32 cmd)
app.post("/api/loading-slots/:slotId/fill-from-cell", authMiddleware, async (req, res) => {
  const { slotId } = req.params;
  const { cell_id, quantity } = req.body;

  if (!cell_id) {
    return res.status(400).json({ error: "cell_id is required" });
  }

  let conn;
  try {
    conn = await getConnection();
    await conn.beginTransaction();

    // Read cell product
    const [cellRows] = await conn.query(
      `SELECT cp.product_id, cp.quantity, c.label
       FROM cell_products cp
       JOIN cells c ON c.id = cp.cell_id
       WHERE cp.cell_id = ?`,
      [cell_id]
    );

    if (cellRows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: "Cell is empty" });
    }

    const cellProduct = cellRows[0];
    const moveQty = quantity && quantity > 0 ? quantity : cellProduct.quantity;

    if (moveQty > cellProduct.quantity) {
      await conn.rollback();
      return res.status(400).json({ error: "Not enough quantity in cell" });
    }

    // Update cell quantity
    if (moveQty === cellProduct.quantity) {
      await conn.query(
        "DELETE FROM cell_products WHERE cell_id = ?",
        [cell_id]
      );
    } else {
      await conn.query(
        "UPDATE cell_products SET quantity = quantity - ? WHERE cell_id = ?",
        [moveQty, cell_id]
      );
    }

    // Update loading slot
    await conn.query(
      `UPDATE loading_slots
       SET product_id = ?, quantity = ?, status = 'READY'
       WHERE id = ?`,
      [cellProduct.product_id, moveQty, slotId]
    );

    // Create operation + send to ESP
    const cmd = `MOVE_TO_LOADING cell=${cell_id} slot=${slotId}`;
    const [opResult] = await conn.query(
      `INSERT INTO operations (op_type, product_id, cell_id, loading_slot_id, cmd, status)
       VALUES ('MOVE_TO_LOADING_ZONE', ?, ?, ?, ?, 'PENDING')`,
      [cellProduct.product_id, cell_id, slotId, cmd]
    );
    const opId = opResult.insertId;

    const { ok, response } = await sendCommandToESP32(cmd);

    if (ok) {
      await conn.query(
        "UPDATE operations SET status = 'DONE', completed_at = NOW() WHERE id = ?",
        [opId]
      );
    } else {
      await conn.query(
        "UPDATE operations SET status = 'ERROR', error_message = ? WHERE id = ?",
        [response, opId]
      );
    }

    await conn.commit();
    res.json({ success: true, id: opId, ok, response });
  } catch (err) {
    console.error("POST /api/loading-slots/:slotId/fill-from-cell error:", err);
    if (conn) await conn.rollback();
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// -------- OPERATIONS + MODE --------

// List operations
app.get("/api/operations", authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.query(
      `SELECT o.*, p.name AS product_name, c.label AS cell_label, ls.slot_num AS loading_slot_num
       FROM operations o
       LEFT JOIN products p ON o.product_id = p.id
       LEFT JOIN cells c ON o.cell_id = c.id
       LEFT JOIN loading_slots ls ON o.loading_slot_id = ls.id
       ORDER BY o.id DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/operations error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Generic manual operation
app.post("/api/operations", authMiddleware, async (req, res) => {
  const { op_type, product_id, cell_id, loading_slot_id, cmd } = req.body;

  if (!op_type || !cmd) {
    return res.status(400).json({ error: "op_type and cmd are required" });
  }

  let conn;
  try {
    conn = await getConnection();
    const [result] = await conn.query(
      "INSERT INTO operations (op_type, product_id, cell_id, loading_slot_id, cmd, status) VALUES (?, ?, ?, ?, ?, 'PENDING')",
      [op_type, product_id || null, cell_id || null, loading_slot_id || null, cmd]
    );
    const opId = result.insertId;

    const { ok, response } = await sendCommandToESP32(cmd);

    if (ok) {
      await conn.query(
        "UPDATE operations SET status = 'DONE', completed_at = NOW() WHERE id = ?",
        [opId]
      );
    } else {
      await conn.query(
        "UPDATE operations SET status = 'ERROR', error_message = ? WHERE id = ?",
        [response, opId]
      );
    }

    res.json({ id: opId, ok, response });
  } catch (err) {
    console.error("POST /api/operations error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Automatic mode: ESP32 handles loading
app.post("/api/auto/loading/start", authMiddleware, async (req, res) => {
  const cmd = "AUTO_LOADING";
  let conn;
  try {
    conn = await getConnection();
    const [result] = await conn.query(
      "INSERT INTO operations (op_type, cmd, status) VALUES ('AUTO_LOADING', ?, 'PENDING')",
      [cmd]
    );
    const opId = result.insertId;

    const { ok, response } = await sendCommandToESP32(cmd);

    if (ok) {
      await conn.query(
        "UPDATE operations SET status = 'DONE', completed_at = NOW() WHERE id = ?",
        [opId]
      );
    } else {
      await conn.query(
        "UPDATE operations SET status = 'ERROR', error_message = ? WHERE id = ?",
        [response, opId]
      );
    }

    res.json({ id: opId, ok, response });
  } catch (err) {
    console.error("POST /api/auto/loading/start error:", err);
    res.status(500).json({ error: "Server error", detail: err.message });
  } finally {
    if (conn) await conn.end();
  }
});

// Direct cmd test
app.get("/api/cmd", authMiddleware, async (req, res) => {
  const cmd = req.query.c;
  if (!cmd) return res.status(400).json({ error: "Missing 'c' query param" });
  const { ok, response } = await sendCommandToESP32(cmd);
  res.json({ ok, response });
});

// 404 APIs
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

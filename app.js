// app.js

const apiBase = ""; // same origin (http://localhost:5001)

let currentMode = "manual";
let cellsCache = [];
let productsCache = [];
let loadingSlotsCache = [];

// ========== API helpers ==========
async function apiGet(path) {
  const res = await fetch(apiBase + path);
  if (!res.ok) {
    throw new Error(`GET ${path} failed`);
  }
  return await res.json();
}

async function apiPost(path, body) {
  const res = await fetch(apiBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} failed: ${txt}`);
  }
  return await res.json();
}

// ========== Rendering ==========

function renderCells(cells) {
  const grid = document.getElementById("cells-grid");
  grid.innerHTML = "";

  cells.forEach(c => {
    const hasProduct = !!c.product_id;
    const div = document.createElement("div");
    div.className = "cell-card" + (hasProduct ? " has-product" : "");
    div.dataset.cellId = c.cell_id;

    const label = document.createElement("div");
    label.className = "cell-label";
    label.textContent = c.label || `R${c.row_num}C${c.col_num}`;

    const details = document.createElement("div");
    details.className = "cell-details";

    if (hasProduct) {
      details.innerHTML = `
        Product: ${c.product_name || "?"}<br/>
        Qty: ${c.quantity ?? 0}
      `;
    } else {
      details.textContent = "Empty cell";
    }

    div.appendChild(label);
    div.appendChild(details);

    div.addEventListener("click", () => {
      document.getElementById("cell-select").value = c.cell_id;
      document.getElementById("from-cell-select").value = c.cell_id;
    });

    grid.appendChild(div);
  });

  // Fill selects
  const cellSelect = document.getElementById("cell-select");
  const fromCellSelect = document.getElementById("from-cell-select");
  cellSelect.innerHTML = "";
  fromCellSelect.innerHTML = "";

  cells.forEach(c => {
    const label = c.label || `R${c.row_num}C${c.col_num}`;

    const opt1 = document.createElement("option");
    opt1.value = c.cell_id;
    opt1.textContent = label;
    cellSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = c.cell_id;
    opt2.textContent = label;
    fromCellSelect.appendChild(opt2);
  });
}

function renderProducts(products) {
  const sel = document.getElementById("product-select");
  sel.innerHTML = "";
  products.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

function renderLoadingSlots(slots) {
  const tbody = document.getElementById("loading-slots-body");
  tbody.innerHTML = "";
  const slotSelect = document.getElementById("slot-select");
  slotSelect.innerHTML = "";

  slots.forEach(s => {
    const tr = document.createElement("tr");

    const tdSlot = document.createElement("td");
    tdSlot.textContent = s.slot_num;

    const tdStatus = document.createElement("td");
    const span = document.createElement("span");
    span.className = "badge " +
      (s.status === "READY"
        ? "badge-ready"
        : s.status === "RESERVED"
          ? "badge-reserved"
          : "badge-empty");
    span.textContent = s.status;
    tdStatus.appendChild(span);

    const tdProduct = document.createElement("td");
    tdProduct.textContent = s.product_name || "-";

    const tdQty = document.createElement("td");
    tdQty.textContent = s.quantity || 0;

    const tdActions = document.createElement("td");
    const btnClear = document.createElement("button");
    btnClear.textContent = "Clear";
    btnClear.className = "btn btn-danger";
    btnClear.style.fontSize = "0.75rem";
    btnClear.addEventListener("click", async () => {
      try {
        await apiPost(`/api/loading-slots/${s.id}/clear`, {});
        await loadAll();
      } catch (e) {
        alert(e.message);
      }
    });

    tdActions.appendChild(btnClear);

    tr.appendChild(tdSlot);
    tr.appendChild(tdStatus);
    tr.appendChild(tdProduct);
    tr.appendChild(tdQty);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `Slot ${s.slot_num} (${s.status})`;
    slotSelect.appendChild(opt);
  });
}

function renderOperations(ops) {
  const tbody = document.getElementById("operations-body");
  tbody.innerHTML = "";

  ops.forEach(o => {
    const tr = document.createElement("tr");

    function td(text) {
      const t = document.createElement("td");
      t.textContent = text;
      return t;
    }

    tr.appendChild(td(o.id));
    tr.appendChild(td(o.op_type));
    tr.appendChild(td(o.cmd));
    tr.appendChild(td(o.status));
    tr.appendChild(td(o.cell_label || ""));
    tr.appendChild(td(o.loading_slot_num || ""));
    tr.appendChild(td(o.created_at || ""));

    tbody.appendChild(tr);
  });
}

// ========== Mode toggle ==========

function setMode(mode) {
  currentMode = mode;

  const btnManual = document.getElementById("mode-manual");
  const btnAuto = document.getElementById("mode-auto");
  const autoPanel = document.querySelector(".auto-only");

  btnManual.classList.toggle("active", mode === "manual");
  btnAuto.classList.toggle("active", mode === "auto");

  if (mode === "manual") {
    autoPanel.classList.add("disabled");
  } else {
    autoPanel.classList.remove("disabled");
  }
}

// ========== Event handlers ==========

async function onAssignCell() {
  const cellId = document.getElementById("cell-select").value;
  const productId = document.getElementById("product-select").value;
  const qty = parseInt(document.getElementById("cell-qty").value) || 1;

  try {
    await apiPost(`/api/cells/${cellId}/assign`, {
      product_id: Number(productId),
      quantity: qty
    });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function onClearCell() {
  const cellId = document.getElementById("cell-select").value;
  if (!cellId) return;
  if (!confirm("Clear this cell?")) return;
  try {
    await apiPost(`/api/cells/${cellId}/clear`, {});
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function onMoveToSlot() {
  const cellId = document.getElementById("from-cell-select").value;
  const slotId = document.getElementById("slot-select").value;
  const qty = parseInt(document.getElementById("slot-qty").value) || 1;

  try {
    await apiPost(`/api/loading-slots/${slotId}/fill-from-cell`, {
      cell_id: Number(cellId),
      quantity: qty
    });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

async function onStartAuto() {
  if (currentMode !== "auto") {
    alert("Switch to Automatic mode first.");
    return;
  }
  try {
    const res = await apiPost("/api/auto/loading/start", {});
    alert(`Auto loading started. Operation #${res.id}`);
    await loadOperations();
  } catch (e) {
    alert(e.message);
  }
}

// ========== Data loading ==========

async function loadCells() {
  cellsCache = await apiGet("/api/cells");
  renderCells(cellsCache);
}

async function loadProducts() {
  productsCache = await apiGet("/api/products");
  renderProducts(productsCache);
}

async function loadLoadingSlots() {
  loadingSlotsCache = await apiGet("/api/loading-slots");
  renderLoadingSlots(loadingSlotsCache);
}

async function loadOperations() {
  const ops = await apiGet("/api/operations");
  renderOperations(ops);
}

async function loadAll() {
  await Promise.all([
    loadCells(),
    loadProducts(),
    loadLoadingSlots(),
    loadOperations()
  ]);
}

// ========== Init ==========

async function init() {
  document.getElementById("mode-manual").addEventListener("click", () => setMode("manual"));
  document.getElementById("mode-auto").addEventListener("click", () => setMode("auto"));

  document.getElementById("btn-assign-cell").addEventListener("click", onAssignCell);
  document.getElementById("btn-clear-cell").addEventListener("click", onClearCell);
  document.getElementById("btn-move-to-slot").addEventListener("click", onMoveToSlot);
  document.getElementById("btn-start-auto").addEventListener("click", onStartAuto);

  setMode("manual");

  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    alert("Failed to load initial data: " + e.message);
  }

  setInterval(loadOperations, 5000);
}

document.addEventListener("DOMContentLoaded", init);

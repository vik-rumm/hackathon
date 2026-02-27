/* AI Money Coach — Dashboard logic (no build tools needed) */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const fmtINR = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  const fmtPct = (n) => `${(n * 100).toFixed(0)}%`;
  const nowStamp = () => new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const APP_KEY = "amc";
  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  // -----------------------------
  // Finance model
  // -----------------------------
  const CATEGORY_ORDER = ["Food", "Coffee", "Travel", "Shopping", "EMI", "Subscriptions", "Investments"];
  const CATEGORY_COLORS = {
    Food: "#2f8cff",
    Coffee: "#15e2ff",
    Travel: "#7c5cff",
    Shopping: "#ff4d7d",
    EMI: "#ffb648",
    Subscriptions: "#7ed8ff",
    Investments: "#2cf2a0",
  };

  const TX_CATEGORIES = ["Food", "Coffee", "Travel", "Shopping", "Rent", "Split", "EMI", "Subscriptions", "Utilities", "Investment", "Income"];
  const TX_COLORS = {
    Food: "#2f8cff",
    Coffee: "#15e2ff",
    Travel: "#7c5cff",
    Shopping: "#ff4d7d",
    Rent: "#ffb648",
    Split: "#7ed8ff",
    EMI: "#ffb648",
    Subscriptions: "#7ed8ff",
    Utilities: "#9aa7ff",
    Investment: "#2cf2a0",
    Income: "#2f8cff",
  };

  const isoDateDaysAgo = (daysAgo) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  const EMPTY_MODEL = () => ({
    month: new Date().toLocaleString(undefined, { month: "long", year: "numeric" }),
    currency: "INR",
    totalIncome: 0,
    budgetLimit: 0,
    expenses: {},
    totalInvestments: 0,
    subscriptions: [],
    transactions: [],
    trend: "No history yet",
  });

  /** @type {ReturnType<typeof EMPTY_MODEL>} */
  let model = EMPTY_MODEL();
  let currentSearch = "";

  // -----------------------------
  // Demo auth (localStorage)
  // -----------------------------
  const storage = {
    get(k) {
      try {
        return localStorage.getItem(`${APP_KEY}:${k}`);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`${APP_KEY}:${k}`, v);
      } catch {
        // ignore
      }
    },
    del(k) {
      try {
        localStorage.removeItem(`${APP_KEY}:${k}`);
      } catch {
        // ignore
      }
    },
  };

  function getUser() {
    const raw = storage.get("user");
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      if (!u || typeof u !== "object") return null;
      if (!u.email) return null;
      return u;
    } catch {
      return null;
    }
  }

  function setUser(user) {
    storage.set("user", JSON.stringify(user));
  }

  function clearUser() {
    storage.del("user");
  }

  function isAuthed() {
    return !!getUser();
  }

  function initialsFrom(nameOrEmail) {
    const s = String(nameOrEmail || "").trim();
    if (!s) return "MC";
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (s.includes("@")) return s[0].toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }

  // -----------------------------
  // Chart.js instances
  // -----------------------------
  /** @type {import("chart.js").Chart | null} */
  let pieChart = null;
  /** @type {import("chart.js").Chart | null} */
  let barChart = null;

  // -----------------------------
  // Derived metrics
  // -----------------------------
  function getTx(m) {
    return Array.isArray(m.transactions) ? m.transactions : [];
  }

  function sumTx(list, pred) {
    let s = 0;
    for (const t of list) if (pred(t)) s += Number(t.amount || 0) || 0;
    return s;
  }

  function deriveBreakdownFromTx(m) {
    const tx = getTx(m);
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of CATEGORY_ORDER) out[k] = 0;
    for (const t of tx) {
      const amt = Number(t.amount || 0) || 0;
      if (amt <= 0) continue;

      if (t.type === "expense") {
        if (t.category === "Food") out.Food += amt;
        else if (t.category === "Coffee") out.Coffee += amt;
        else if (t.category === "Travel") out.Travel += amt;
        else if (t.category === "Shopping") out.Shopping += amt;
        else if (t.category === "EMI") out.EMI += amt;
        else if (t.category === "Subscriptions") out.Subscriptions += amt;
        else if (t.category === "Rent") out.EMI += amt; // keep spec categories: treat rent under EMI bucket
        else if (t.category === "Utilities") out.EMI += amt * 0.0; // excluded from pie spec by default
        else out.Shopping += amt * 0.0;
      } else if (t.type === "investment" || t.category === "Investment") {
        out.Investments += amt;
      }
    }

    // If no tx data, fall back to model.expenses
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    if (total <= 0 && m.expenses) {
      for (const k of CATEGORY_ORDER) out[k] = Number(m.expenses[k] || 0) || 0;
    }
    return out;
  }

  function calcTotals(m) {
    const tx = getTx(m);
    const incomeTx = sumTx(tx, (t) => t.type === "income");
    const totalIncome = incomeTx > 0 ? incomeTx : Number(m.totalIncome || 0) || 0;

    const totalExpensesTx = sumTx(tx, (t) => t.type === "expense");
    const totalExpenses =
      totalExpensesTx > 0
        ? totalExpensesTx
        : m.expenses
          ? Object.values(m.expenses).reduce((a, b) => a + b, 0)
          : 0;

    const investTx = sumTx(tx, (t) => t.type === "investment" || t.category === "Investment");
    const invest = investTx > 0 ? investTx : Number(m.totalInvestments ?? m.expenses?.Investments ?? 0) || 0;

    const subsTotal = Array.isArray(m.subscriptions) ? m.subscriptions.reduce((a, s) => a + (Number(s.monthly || 0) || 0), 0) : 0;

    const budgetUsedPct = m.budgetLimit > 0 ? totalExpenses / m.budgetLimit : 0;
    const remaining = Math.max(0, (Number(m.budgetLimit || 0) || 0) - totalExpenses);
    return { totalIncome, totalExpenses, subsTotal, budgetUsedPct, remaining, invest };
  }

  function calcHealthScore(m) {
    const { totalExpenses, subsTotal, budgetUsedPct, invest } = calcTotals(m);
    const income = Math.max(1, calcTotals(m).totalIncome);

    // Balanced heuristic (hackathon-grade): punish overspending & subscription drag, reward investing & budget headroom.
    const expenseRatio = totalExpenses / income; // 0..(maybe >1)
    const subsRatio = subsTotal / income;
    const investRatio = invest / income;

    let score =
      100 -
      clamp(expenseRatio, 0, 1.25) * 50 -
      clamp(subsRatio, 0, 0.15) * 220 -
      clamp(budgetUsedPct, 0, 1.4) * 20 +
      clamp(investRatio, 0, 0.30) * 35;

    // Extra penalty if crossing 100% of budget.
    if (budgetUsedPct > 1) score -= (budgetUsedPct - 1) * 25;

    score = clamp(score, 0, 100);

    let label = "Stable";
    let risk = "Medium";
    let nextAction = "Trim subscriptions + cap shopping";
    if (score >= 80) {
      label = "Excellent";
      risk = "Low";
      nextAction = "Increase investments by 5%";
    } else if (score >= 60) {
      label = "Stable";
      risk = "Medium";
      nextAction = "Hold budget under 80%";
    } else if (score >= 40) {
      label = "Needs attention";
      risk = "Elevated";
      nextAction = "Reduce discretionary spending";
    } else {
      label = "Critical";
      risk = "High";
      nextAction = "Pause non-essential spend this week";
    }

    return { score: Math.round(score), label, risk, nextAction };
  }

  function genAISummary(m) {
    const { totalExpenses, subsTotal, budgetUsedPct, remaining, invest } = calcTotals(m);
    const income = Math.max(1, calcTotals(m).totalIncome);

    const breakdown = deriveBreakdownFromTx(m);
    const catPairs = Object.entries(breakdown)
      .filter(([k]) => k !== "Investments")
      .sort((a, b) => b[1] - a[1]);
    const top = catPairs[0] ? { k: catPairs[0][0], v: catPairs[0][1] } : { k: "—", v: 0 };
    const second = catPairs[1] ? { k: catPairs[1][0], v: catPairs[1][1] } : null;

    const spendRate = totalExpenses / income;
    const investRate = invest / income;
    const subsRate = subsTotal / income;

    const tone =
      budgetUsedPct >= 0.95
        ? "You’re very close to your budget limit — let’s tighten spend."
        : budgetUsedPct >= 0.8
          ? "You’re entering the caution zone — a few small tweaks will help."
          : "You’re tracking well — keep the habits consistent.";

    const suggestion1 =
      top.k === "Shopping" || top.k === "Travel"
        ? `Set a weekly cap for ${top.k.toLowerCase()} to cut ₹${Math.round(top.v * 0.12)} next month.`
        : `Try lowering ${top.k.toLowerCase()} by 10% (≈ ${fmtINR(top.v * 0.1)}) to boost savings.`;

    const suggestion2 =
      subsRate > 0.02
        ? `Subscriptions are costing ${fmtINR(subsTotal)}/mo — cancel 1–2 low-value plans.`
        : `Subscriptions look lean at ${fmtINR(subsTotal)}/mo — nice.`;

    const suggestion3 =
      investRate < 0.12
        ? `Consider increasing investments by ${fmtINR(income * 0.05)} to move toward a 15% investing rate.`
        : `Investing rate is solid (${fmtPct(investRate)}) — stay consistent.`;

    const highlight = second ? `Top spends: ${top.k} and ${second.k}.` : `Top spend: ${top.k}.`;

    const budgetLine =
      remaining <= 0
        ? "You’ve exhausted your budget this month — prioritize essentials only."
        : `You have ${fmtINR(remaining)} remaining in your monthly budget.`;

    return `${tone}\n\n${highlight} You spent ${fmtINR(totalExpenses)} out of ${fmtINR(m.budgetLimit)} (${fmtPct(clamp(budgetUsedPct, 0, 1.5))}). ${budgetLine}\n\nRecommendations:\n- ${suggestion1}\n- ${suggestion2}\n- ${suggestion3}`;
  }

  // -----------------------------
  // UI rendering
  // -----------------------------
  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function setAuthMode(on) {
    const app = document.querySelector(".app");
    if (!app) return;
    app.classList.toggle("is-auth", on);
  }

  function setRingProgress(score) {
    const circle = document.querySelector(".score__progress");
    if (!circle) return;
    const r = 48;
    const C = 2 * Math.PI * r; // 301.59...
    const pct = clamp(score / 100, 0, 1);
    circle.style.strokeDasharray = `${C}`;
    circle.style.strokeDashoffset = `${C * (1 - pct)}`;
  }

  function renderStats(m) {
    const { totalIncome, totalExpenses, invest } = calcTotals(m);
    setText("statIncome", fmtINR(totalIncome));
    setText("statExpenses", fmtINR(totalExpenses));
    setText("statInvestments", fmtINR(invest));

    const save = Math.max(0, totalIncome - totalExpenses - invest);
    const spendRate = totalExpenses / Math.max(1, totalIncome);
    const investRate = invest / Math.max(1, totalIncome);

    setText("statIncomeHint", `${m.month} • salary + side income`);
    setText("statExpenseHint", `Spend rate ${fmtPct(clamp(spendRate, 0, 1.99))} • keep under 65%`);
    setText("statInvestHint", `Invest rate ${fmtPct(clamp(investRate, 0, 1.99))} • est. savings ${fmtINR(save)}`);
  }

  function renderBudget(m) {
    const { totalExpenses, budgetUsedPct, remaining } = calcTotals(m);
    const pct = clamp(budgetUsedPct, 0, 1.5);

    setText("budgetUsed", `${fmtINR(totalExpenses)} / ${fmtINR(m.budgetLimit)} (${fmtPct(pct)})`);
    setText("budgetRemaining", fmtINR(remaining));

    const fill = $("budgetFill");
    const bar = document.querySelector(".budget__bar");
    if (fill) fill.style.width = `${clamp(pct, 0, 1) * 100}%`;
    if (bar) bar.setAttribute("aria-valuenow", String(Math.round(clamp(pct, 0, 1) * 100)));

    const alert = $("budgetAlert");
    if (alert) alert.classList.toggle("is-visible", budgetUsedPct >= 0.8);
  }

  function renderHealth(m) {
    const { score, label, risk, nextAction } = calcHealthScore(m);
    setText("healthScore", String(score));
    setText("scoreLabel", label);
    setText("trendText", m.trend ?? "—");
    setText("nextAction", nextAction);
    setRingProgress(score);

    // Tags
    const { subsTotal, budgetUsedPct } = calcTotals(m);
    setText("riskTag", `Risk: ${risk}`);
    setText("budgetTag", `Budget: ${Math.round(budgetUsedPct * 100)}% used`);
    setText("subsTag", `Subscriptions: ${fmtINR(subsTotal)}/mo`);
  }

  function renderSubscriptions(m) {
    const { subsTotal } = calcTotals(m);
    const list = $("subsList");
    if (list) {
      list.innerHTML = "";
      for (const sub of m.subscriptions) {
        const row = document.createElement("div");
        row.className = "subs__item";
        row.innerHTML = `
          <div class="subs__left">
            <div class="subs__logo"><i data-lucide="${sub.icon ?? "repeat"}"></i></div>
            <div class="subs__txt">
              <div class="subs__name" title="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</div>
              <div class="subs__meta">Detected recurring payment</div>
            </div>
          </div>
          <div class="subs__right">
            <div class="subs__price">${fmtINR(sub.monthly)}</div>
            <div class="subs__cycle">per month</div>
          </div>
        `;
        list.appendChild(row);
      }
    }
    setText("subsTotal", fmtINR(subsTotal));

    // Re-render icons inside dynamic list
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function renderAISummary(m) {
    setText("aiSummary", genAISummary(m));
  }

  function renderPie(m) {
    const ctx = $("pieExpenses");
    const legend = $("pieLegend");
    if (!ctx) return;

    const labels = CATEGORY_ORDER;
    const breakdown = deriveBreakdownFromTx(m);
    const values = labels.map((k) => breakdown[k] ?? 0);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = labels.map((k) => CATEGORY_COLORS[k] ?? "#999");

    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: "rgba(7,10,19,0.85)",
            borderWidth: 2,
            hoverOffset: 6,
            borderRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        cutout: "64%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.75)",
            borderColor: "rgba(255,255,255,0.10)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => {
                const v = item.raw ?? 0;
                const pct = v / total;
                return ` ${item.label}: ${fmtINR(v)} (${fmtPct(pct)})`;
              },
            },
          },
        },
      },
    });

    if (legend) {
      legend.innerHTML = "";
      labels.forEach((name, i) => {
        const v = values[i];
        const pct = v / total;
        const row = document.createElement("div");
        row.className = "legend__item";
        row.innerHTML = `
          <div class="legend__left">
            <span class="swatch" style="background:${colors[i]}"></span>
            <span class="legend__name">${escapeHtml(name)}</span>
          </div>
          <span class="legend__pct">${fmtPct(pct)}</span>
        `;
        legend.appendChild(row);
      });
    }
  }

  function renderBar(m) {
    const ctx = $("barCompare");
    if (!ctx) return;

    const { totalExpenses, invest } = calcTotals(m);

    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Expenses", "Investments"],
        datasets: [
          {
            label: "This month",
            data: [totalExpenses, invest],
            backgroundColor: ["rgba(255,77,125,0.72)", "rgba(44,242,160,0.72)"],
            borderColor: ["rgba(255,77,125,0.95)", "rgba(44,242,160,0.95)"],
            borderWidth: 1.2,
            borderRadius: 12,
            barThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.75)",
            borderColor: "rgba(255,255,255,0.10)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => ` ${fmtINR(item.raw ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "rgba(234,240,255,0.72)", font: { size: 12 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "rgba(234,240,255,0.55)",
              callback: (v) => (typeof v === "number" ? fmtINR(v).replace("₹", "₹") : v),
              maxTicksLimit: 5,
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      },
    });
  }

  function renderAll() {
    renderHealth(model);
    renderStats(model);
    renderAISummary(model);
    renderBudget(model);
    renderSubscriptions(model);
    renderPie(model);
    renderBar(model);
    setText("buildStamp", `Updated ${nowStamp()}`);
    saveModelForCurrentUser();
  }

  function renderProfile() {
    const u = getUser();
    if (!u) return;
    const name = u.name || u.email.split("@")[0];
    setText("profileName", name);
    setText("profileEmail", u.email);
    setText("profileInitials", initialsFrom(name));
    const pi = $("profileNameInput");
    const pe = $("profileEmailInput");
    if (pi) pi.value = name;
    if (pe) pe.value = u.email;
    setText("avatarInitials", initialsFrom(name));
  }

  // -----------------------------
  // Per-user model storage
  // -----------------------------
  function currentUserModelKey() {
    const u = getUser();
    if (!u || !u.email) return null;
    return `model:${u.email}`;
  }

  function loadModelForCurrentUser() {
    const key = currentUserModelKey();
    if (!key) {
      model = EMPTY_MODEL();
      return;
    }
    const raw = storage.get(key);
    if (!raw) {
      model = EMPTY_MODEL();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        model = {
          ...EMPTY_MODEL(),
          ...parsed,
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        };
      } else {
        model = EMPTY_MODEL();
      }
    } catch {
      model = EMPTY_MODEL();
    }
  }

  function saveModelForCurrentUser() {
    const key = currentUserModelKey();
    if (!key) return;
    try {
      storage.set(key, JSON.stringify(model));
    } catch {
      // ignore
    }
  }

  // -----------------------------
  // Upload simulation (no Gemini)
  // -----------------------------
  function setUploadStatus(kind, text) {
    const wrap = $("uploadStatus");
    const t = $("uploadStatusText");
    if (!wrap || !t) return;
    wrap.classList.remove("is-busy", "is-ok", "is-warn");
    if (kind) wrap.classList.add(kind);
    t.textContent = text;
  }

  async function simulateAnalysis(file) {
    if (!file) return;
    setUploadStatus("is-busy", `AI analyzing document… (${file.name})`);
    await sleep(900);
    setUploadStatus("is-busy", "Extracting transactions…");
    await sleep(900);
    setUploadStatus("is-busy", "Detecting subscriptions & anomalies…");
    await sleep(900);

    // Lightly adjust model to feel "AI-powered" (add a couple detected transactions)
    const bump = file.type === "application/pdf" ? 0.06 : 0.04;
    const pick = ["Food", "Travel", "Shopping", "Coffee", "Utilities"][Math.floor(Math.random() * 5)];
    const detected = Math.max(120, Math.round(900 + Math.random() * 1800));
    model.transactions = Array.isArray(model.transactions) ? model.transactions : [];
    model.transactions.unshift({
      id: uid(),
      date: isoDateDaysAgo(0),
      type: "expense",
      category: pick,
      merchant: "Statement detected",
      amount: Math.round(detected * (1 + bump)),
    });
    model.trend = "↑ Updated after document analysis";

    renderAll();
    setUploadStatus("is-ok", "Analysis complete. Dashboard updated with detected changes.");
  }

  // -----------------------------
  // Chat assistant (heuristic)
  // -----------------------------
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function addBubble(kind, text, meta) {
    const log = $("chatLog");
    if (!log) return;
    const b = document.createElement("div");
    b.className = `bubble ${kind === "user" ? "bubble--user" : "bubble--ai"}`;
    b.textContent = text;
    if (meta) {
      const m = document.createElement("div");
      m.className = "bubble__meta";
      m.textContent = meta;
      b.appendChild(m);
    }
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }

  function aiReply(prompt) {
    const p = String(prompt || "").toLowerCase();
    const { totalExpenses, subsTotal, budgetUsedPct, remaining, invest } = calcTotals(model);
    const income = Math.max(1, calcTotals(model).totalIncome);

    const sortedCats = Object.entries(deriveBreakdownFromTx(model))
      .filter(([k]) => k !== "Investments")
      .sort((a, b) => b[1] - a[1]);

    const top = sortedCats[0] ? { k: sortedCats[0][0], v: sortedCats[0][1] } : null;
    const second = sortedCats[1] ? { k: sortedCats[1][0], v: sortedCats[1][1] } : null;

    if (p.includes("overspend") || p.includes("overspending")) {
      const lines = [];
      lines.push(`You’re overspending most in:`);
      if (top) lines.push(`- ${top.k}: ${fmtINR(top.v)} (${fmtPct(top.v / Math.max(1, totalExpenses))})`);
      if (second) lines.push(`- ${second.k}: ${fmtINR(second.v)} (${fmtPct(second.v / Math.max(1, totalExpenses))})`);
      lines.push("");
      lines.push(`Quick wins:`);
      lines.push(`- Set a weekly cap for ${top ? top.k.toLowerCase() : "discretionary spending"} (cut 10–15%).`);
      lines.push(`- Review subscriptions (${fmtINR(subsTotal)}/mo) and cancel 1 low-use plan.`);
      return lines.join("\n");
    }

    if (p.includes("afford") && (p.includes("phone") || p.includes("iphone") || p.includes("mobile"))) {
      // If user included a price like 60000
      const nums = prompt.match(/(\d[\d,]{2,})/g);
      const price = nums && nums.length ? Number(nums[0].replaceAll(",", "")) : 60000;

      const freeCash = Math.max(0, income - totalExpenses - invest);
      const can = remaining > 0 && freeCash >= price * 0.35; // heuristic
      const lines = [];
      lines.push(`Estimated free cash this month: ${fmtINR(freeCash)}.`);
      lines.push(`Budget remaining: ${fmtINR(remaining)} (${Math.round(budgetUsedPct * 100)}% used).`);
      lines.push("");
      if (can) {
        lines.push(`You *can* afford a phone around ${fmtINR(price)}, but I’d recommend:`);
        lines.push(`- Keep it under ${fmtINR(freeCash * 0.7)} to avoid budget stress.`);
        lines.push(`- Avoid EMI unless your invest rate stays ≥ 12%.`);
      } else {
        lines.push(`I wouldn’t buy a ${fmtINR(price)} phone this month.`);
        lines.push(`Try this: cut ${fmtINR(Math.max(1500, subsTotal))} from recurring + reduce ${top ? top.k.toLowerCase() : "top category"} by 10%.`);
        lines.push(`Recheck next month when budget usage is under 80%.`);
      }
      return lines.join("\n");
    }

    if (p.includes("save") && (p.includes("10%") || p.includes("10 percent") || p.includes("10"))) {
      const target = income * 0.10;
      const lines = [];
      lines.push(`To save 10% more next month (~${fmtINR(target)}):`);
      if (top) lines.push(`- Reduce ${top.k} by 12%: save ~${fmtINR(top.v * 0.12)}.`);
      lines.push(`- Cap dining/coffee spends to weekends only (easy ₹1k–₹2k).`);
      lines.push(`- Cancel/rotate subscriptions: save ${fmtINR(Math.min(subsTotal, 300))}–${fmtINR(Math.min(subsTotal, 800))}/mo.`);
      lines.push("");
      lines.push(`If you want, tell me your goal (e.g. “save for travel / emergency fund”), and I’ll generate a plan.`);
      return lines.join("\n");
    }

    // Generic fallback with relevant numbers
    const { totalIncome } = calcTotals(model);
    return `Here’s your snapshot:\n- Income: ${fmtINR(totalIncome)}\n- Expenses: ${fmtINR(totalExpenses)}\n- Investments: ${fmtINR(invest)}\n- Subscriptions: ${fmtINR(subsTotal)}/mo\n\nAsk “Where am I overspending?” or “Can I afford a new phone for 55000?”`;
  }

  function bootChat() {
    const log = $("chatLog");
    if (log && !log.childElementCount) {
      addBubble("ai", "Hi — I’m your AI Money Coach. Ask me about overspending, budgets, or big purchases.", "AI Money Coach • online");
      addBubble("ai", "Try: “Where am I overspending?” or “Can I afford a new phone for 55,000?”");
    }
  }

  // -----------------------------
  // Theme + notifications + pages
  // -----------------------------
  function getTheme() {
    return storage.get("theme") || "dark";
  }

  function applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    storage.set("theme", t);
    document.body.classList.toggle("theme-light", t === "light");
    $("themeDark")?.setAttribute("aria-checked", String(t === "dark"));
    $("themeLight")?.setAttribute("aria-checked", String(t === "light"));
  }

  function getNotifs() {
    const raw = storage.get("notifs");
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveNotifs(list) {
    storage.set("notifs", JSON.stringify(list.slice(0, 40)));
  }

  function unreadCount(list) {
    return list.reduce((a, n) => a + (n && !n.read ? 1 : 0), 0);
  }

  function toast(title, body) {
    const root = $("toasts");
    if (!root) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `
      <div class="toast__main">
        <div class="toast__title">${escapeHtml(title)}</div>
        <div class="toast__body">${escapeHtml(body)}</div>
      </div>
      <button class="toast__close" type="button" aria-label="Dismiss">
        <i data-lucide="x"></i>
      </button>
    `;
    root.appendChild(el);
    el.querySelector(".toast__close")?.addEventListener("click", () => el.remove());
    setTimeout(() => el.remove(), 6500);
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function pushNotif(title, body, kind = "info") {
    const list = getNotifs();
    const item = { id: uid(), title, body, kind, ts: Date.now(), read: false };
    list.unshift(item);
    saveNotifs(list);
    renderNotifs();
    toast(title, body);
  }

  function renderNotifs() {
    const list = getNotifs();
    const dot = $("notifDot");
    const panel = $("notifPanel");
    const ul = $("notifList");
    const foot = $("notifFoot");
    const unread = unreadCount(list);
    if (dot) dot.style.display = unread > 0 ? "block" : "none";
    if (panel) panel.setAttribute("aria-hidden", panel.classList.contains("is-open") ? "false" : "true");
    if (ul) {
      ul.innerHTML = "";
      if (!list.length) {
        ul.innerHTML = `<div class="muted" style="padding:10px">No notifications yet.</div>`;
      } else {
        for (const n of list) {
          const item = document.createElement("div");
          item.className = `notif-item ${n.read ? "" : "is-unread"}`;
          item.innerHTML = `
            <div class="notif-item__title">${escapeHtml(n.title)}</div>
            <div class="notif-item__body">${escapeHtml(n.body)}</div>
            <div class="notif-item__meta">${new Date(n.ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
          `;
          ul.appendChild(item);
        }
      }
    }
    if (foot) foot.textContent = unread ? `${unread} unread` : "You’re all caught up.";
  }

  function markAllRead() {
    const list = getNotifs().map((n) => ({ ...n, read: true }));
    saveNotifs(list);
    renderNotifs();
  }

  function clearNotifs() {
    saveNotifs([]);
    renderNotifs();
  }

  function budgetBand(p) {
    if (p >= 1) return "over";
    if (p >= 0.8) return "warn";
    return "ok";
  }

  function tickBudgetNotifs() {
    const { budgetUsedPct, remaining } = calcTotals(model);
    const band = budgetBand(budgetUsedPct);
    const prev = storage.get("budgetBand") || "ok";
    if (band !== prev) {
      storage.set("budgetBand", band);
      if (band === "warn") pushNotif("Budget alert", `You’ve reached 80% of your monthly limit. Remaining ${fmtINR(remaining)}.`, "warn");
      if (band === "over") pushNotif("Budget exceeded", `You crossed your monthly budget. Remaining ${fmtINR(remaining)}.`, "danger");
    }
  }

  function fmtDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
  }

  function renderTransactionsPage() {
    const tx = getTx(model).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const typeSel = $("txType");
    const catSel = $("txCategory");
    const type = typeSel?.value || "all";
    const category = catSel?.value || "all";
    const dateFilter = $("txDateFilter")?.value || "";
    const q = (currentSearch || "").toLowerCase();

    const filtered = tx.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (category !== "all" && t.category !== category) return false;
      if (dateFilter && String(t.date) !== dateFilter) return false;
      if (q) {
        const hay = `${t.merchant || ""} ${t.category || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sumExpense = sumTx(filtered, (t) => t.type === "expense");
    const sumInvest = sumTx(filtered, (t) => t.type === "investment");
    const sumIncome = sumTx(filtered, (t) => t.type === "income");

    const summary = $("txSummary");
    if (summary) {
      summary.innerHTML = `
        <span class="pill2"><i data-lucide="list"></i> ${filtered.length} items</span>
        <span class="pill2"><i data-lucide="arrow-up-right"></i> Expenses ${fmtINR(sumExpense)}</span>
        <span class="pill2"><i data-lucide="trending-up"></i> Investments ${fmtINR(sumInvest)}</span>
        <span class="pill2"><i data-lucide="arrow-down-left"></i> Income ${fmtINR(sumIncome)}</span>
      `;
    }

    // Category totals
    /** @type {Record<string, {amount:number, count:number}>} */
    const byCat = {};
    for (const t of filtered) {
      const k = t.category || "Other";
      if (!byCat[k]) byCat[k] = { amount: 0, count: 0 };
      byCat[k].amount += Number(t.amount || 0) || 0;
      byCat[k].count += 1;
    }
    const catRows = Object.entries(byCat).sort((a, b) => b[1].amount - a[1].amount);
    const catsEl = $("txCats");
    if (catsEl) {
      catsEl.innerHTML = "";
      if (!catRows.length) catsEl.innerHTML = `<div class="muted">No transactions match your filters.</div>`;
      for (const [k, v] of catRows) {
        const row = document.createElement("div");
        row.className = "tx-cat";
        row.innerHTML = `
          <div class="tx-cat__left">
            <span class="tx-cat__dot" style="background:${TX_COLORS[k] || "rgba(255,255,255,.45)"}"></span>
            <div class="tx-cat__txt">
              <div class="tx-cat__name">${escapeHtml(k)}</div>
              <div class="tx-cat__count">${v.count} transactions</div>
            </div>
          </div>
          <div class="tx-cat__amt">${fmtINR(v.amount)}</div>
        `;
        catsEl.appendChild(row);
      }
    }

    // Date-wise history
    /** @type {Record<string, any[]>} */
    const byDate = {};
    for (const t of filtered) {
      const d = t.date || "—";
      byDate[d] = byDate[d] || [];
      byDate[d].push(t);
    }
    const dates = Object.keys(byDate).sort((a, b) => String(b).localeCompare(String(a)));
    const hist = $("txHistory");
    if (hist) {
      hist.innerHTML = "";
      for (const d of dates) {
        const list = byDate[d].slice().sort((a, b) => (b.type || "").localeCompare(a.type || ""));
        const dayExpense = sumTx(list, (t) => t.type === "expense");
        const dayInvest = sumTx(list, (t) => t.type === "investment");
        const dayIncome = sumTx(list, (t) => t.type === "income");
        const day = document.createElement("div");
        day.className = "tx-day";
        day.innerHTML = `
          <div class="tx-day__head">
            <div class="tx-day__date">${escapeHtml(fmtDay(d))}</div>
            <div class="tx-day__sum">- ${fmtINR(dayExpense)} • +${fmtINR(dayIncome)} • ↑ ${fmtINR(dayInvest)}</div>
          </div>
        `;
        for (const t of list) {
          const amtClass =
            t.type === "expense" ? "tx-amt--expense" : t.type === "investment" ? "tx-amt--invest" : "tx-amt--income";
          const row = document.createElement("div");
          row.className = "tx-row";
          row.innerHTML = `
            <div class="tx-row__left">
              <div class="tx-row__title">${escapeHtml(t.merchant || "Transaction")}</div>
              <div class="tx-row__meta">${escapeHtml(t.category || "—")} • ${escapeHtml(t.type || "—")}</div>
            </div>
            <div class="tx-amt ${amtClass}">${fmtINR(Number(t.amount || 0) || 0)}</div>
          `;
          day.appendChild(row);
        }
        hist.appendChild(day);
      }
    }

    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function renderSubscriptionsPage() {
    const list = Array.isArray(model.subscriptions) ? model.subscriptions : [];
    const total = list.reduce((a, s) => a + (Number(s.monthly || 0) || 0), 0);
    setText("subsPageTotal", fmtINR(total));
    setText("subsPageAnnual", `Estimated yearly: ${fmtINR(total * 12)}`);

    const wrap = $("subsPageList");
    if (wrap) {
      wrap.innerHTML = "";
      const sorted = list.slice().sort((a, b) => (Number(b.monthly || 0) || 0) - (Number(a.monthly || 0) || 0));
      for (const s of sorted) {
        const row = document.createElement("div");
        row.className = "subs-page__item";
        row.innerHTML = `
          <div class="subs-page__left">
            <div class="subs-page__logo"><i data-lucide="${s.icon || "repeat"}"></i></div>
            <div class="subs-page__txt">
              <div class="subs-page__name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
              <div class="subs-page__meta">Renews monthly • active</div>
            </div>
          </div>
          <div class="subs-page__price">${fmtINR(Number(s.monthly || 0) || 0)}</div>
        `;
        wrap.appendChild(row);
      }
    }

    const insights = $("subsInsights");
    if (insights) {
      const sorted = list.slice().sort((a, b) => (Number(b.monthly || 0) || 0) - (Number(a.monthly || 0) || 0));
      const top = sorted.slice(0, 3);
      insights.innerHTML = `
        <div class="insight"><strong>Highest cost:</strong> ${top.map((x) => `${escapeHtml(x.name)} (${fmtINR(x.monthly)})`).join(", ")}.</div>
        <div class="insight"><strong>Quick win:</strong> cancel 1 low-use app to save ${fmtINR(Math.min(299, total))}/month.</div>
        <div class="insight"><strong>AI tip:</strong> rotate entertainment subscriptions monthly instead of stacking them all.</div>
      `;
    }

    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  // -----------------------------
  // Investments page
  // -----------------------------
  function getInvestmentTx(m) {
    return getTx(m).filter((t) => t.type === "investment" || t.category === "Investment");
  }

  function calcInvestTotals(m) {
    const list = getInvestmentTx(m);
    const allTime = sumTx(list, () => true);
    const todayIso = isoDateDaysAgo(0);
    const monthPrefix = todayIso.slice(0, 7);
    let thisMonth = 0;
    for (const t of list) {
      const d = String(t.date || "");
      if (d.startsWith(monthPrefix)) thisMonth += Number(t.amount || 0) || 0;
    }
    return { allTime, thisMonth };
  }

  function buildInvestBuckets(m) {
    /** @type {Record<string, {amount:number, count:number}>} */
    const buckets = {};
    for (const t of getInvestmentTx(m)) {
      const name = t.merchant || "Investment";
      if (!buckets[name]) buckets[name] = { amount: 0, count: 0 };
      buckets[name].amount += Number(t.amount || 0) || 0;
      buckets[name].count += 1;
    }
    return buckets;
  }

  function renderInvestmentsPage() {
    const { allTime, thisMonth } = calcInvestTotals(model);
    setText("investTotalAllTime", fmtINR(allTime));
    setText("investTotalThisMonth", fmtINR(thisMonth));

    const buckets = buildInvestBuckets(model);
    const entries = Object.entries(buckets).sort((a, b) => b[1].amount - a[1].amount);

    const note =
      entries.length === 0
        ? "No investments captured yet. Add your SIPs or stock purchases manually from the dashboard."
        : "Based on your investment-type transactions. Add more from manual entry on the dashboard.";
    setText("investSummaryNote", note);

    const listEl = $("investList");
    if (listEl) {
      listEl.innerHTML = "";
      if (!entries.length) {
        listEl.innerHTML = `<div class="muted">No investment entries yet. Start by logging one from the dashboard manual entry form.</div>`;
      } else {
        const tx = getInvestmentTx(model).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        for (const t of tx) {
          const row = document.createElement("div");
          row.className = "invest-row";
          row.innerHTML = `
            <div class="invest-row__main">
              <div class="invest-row__name">${escapeHtml(t.merchant || "Investment")}</div>
              <div class="invest-row__meta">${escapeHtml(t.category || "Investment")} • ${t.type === "investment" ? "Investment" : "Expense"}</div>
            </div>
            <div class="invest-row__amt">${fmtINR(Number(t.amount || 0) || 0)}</div>
            <div class="invest-row__date">${escapeHtml(t.date || "—")}</div>
          `;
          listEl.appendChild(row);
        }
      }
    }

    const pieEl = $("investPie");
    if (pieEl) {
      const labels = entries.map(([name]) => name);
      const values = entries.map(([, v]) => v.amount);
      const total = values.reduce((a, b) => a + b, 0) || 1;
      const colors = labels.map((_, i) => {
        const palette = ["#2cf2a0", "#2f8cff", "#7c5cff", "#15e2ff", "#ffb648", "#ff4d7d"];
        return palette[i % palette.length];
      });
      if (pieChart) pieChart.destroy();
      pieChart = new Chart(pieEl, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderColor: "rgba(7,10,19,0.85)",
              borderWidth: 2,
              hoverOffset: 6,
              borderRadius: 8,
            },
          ],
        },
        options: {
          responsive: true,
          cutout: "64%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(0,0,0,0.75)",
              borderColor: "rgba(255,255,255,0.10)",
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: (item) => {
                  const v = item.raw ?? 0;
                  const pct = v / total;
                  return ` ${item.label}: ${fmtINR(v)} (${fmtPct(pct)})`;
                },
              },
            },
          },
        },
      });
    }

    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function bootTransactionsFilters() {
    const tx = getTx(model);
    const catSel = $("txCategory");
    if (catSel && catSel.childElementCount <= 1) {
      const cats = Array.from(new Set(tx.map((t) => t.category).filter(Boolean))).sort();
      for (const c of cats) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        catSel.appendChild(opt);
      }
    }

    const dateInput = $("txDateFilter");
    const maxDate = tx.reduce((max, t) => (t.date && String(t.date) > max ? String(t.date) : max), "");
    if (dateInput && maxDate) dateInput.max = maxDate;
  }

  function bootFeedback() {
    const stars = $("feedbackStars");
    const ratingEl = $("feedbackRating");
    const textEl = $("feedbackText");
    const hint = $("feedbackHint");

    const raw = storage.get("feedback");
    if (raw) {
      try {
        const v = JSON.parse(raw);
        if (ratingEl) ratingEl.value = String(v.rating || 0);
        if (textEl) textEl.value = String(v.text || "");
      } catch {
        // ignore
      }
    }

    const setStars = (n) => {
      if (ratingEl) ratingEl.value = String(n);
      stars?.querySelectorAll(".star").forEach((b) => {
        const k = Number(b.getAttribute("data-star") || "0");
        b.classList.toggle("is-on", k > 0 && k <= n);
      });
    };

    stars?.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-star]");
      if (!btn) return;
      setStars(Number(btn.getAttribute("data-star") || "0"));
    });

    const rating0 = Number(ratingEl?.value || 0);
    if (rating0) setStars(rating0);

    $("feedbackForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const rating = Number(ratingEl?.value || 0);
      const text = textEl?.value?.trim() || "";
      storage.set("feedback", JSON.stringify({ rating, text, ts: Date.now() }));
      if (hint) hint.textContent = "Thanks! Feedback saved (demo).";
      pushNotif("Feedback received", `Thanks for rating ${rating || 0}/5.`, "info");
    });

    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  // -----------------------------
  // Routing + animations
  // -----------------------------
  function setRoute(route) {
    // Auth gate
    const protectedRoutes = new Set(["dashboard", "transactions", "subscriptions", "investments", "settings", "profile"]);
    if (!isAuthed() && protectedRoutes.has(route)) route = "login";
    if (isAuthed() && route === "login") route = "dashboard";

    setAuthMode(route === "login");

    const title = $("pageTitle");
    if (title) title.textContent = route[0].toUpperCase() + route.slice(1);

    document.querySelectorAll(".nav__item").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-route") === route);
    });
    document.querySelectorAll(".route").forEach((r) => {
      r.classList.toggle("is-active", r.getAttribute("data-route") === route);
    });

    // Trigger reveal for newly active route
    requestAnimationFrame(() => {
      document.querySelectorAll(".route.is-active .reveal").forEach((el) => el.classList.add("is-in"));
    });

    if (route === "profile") renderProfile();
    if (route === "transactions") {
      bootTransactionsFilters();
      renderTransactionsPage();
    }
    if (route === "subscriptions") renderSubscriptionsPage();
    if (route === "investments") renderInvestmentsPage();
    if (route === "settings") {
      applyTheme(getTheme());
      bootFeedback();
    }
  }

  function bootRevealObserver() {
    const els = Array.from(document.querySelectorAll(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-in");
        });
      },
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
  }

  // -----------------------------
  // Demo refresh actions
  // -----------------------------
  function jitter(n, pct) {
    const j = 1 + (Math.random() * 2 - 1) * pct;
    return Math.max(0, Math.round(n * j));
  }

  function refreshAI() {
    // Keep income stable, nudge spend/invest a bit
    const next = structuredClone(model);
    if (Array.isArray(next.transactions)) {
      next.transactions = next.transactions.map((t) => {
        if (t.type === "income") return t;
        const pct = t.type === "investment" ? 0.06 : 0.08;
        return { ...t, amount: jitter(Number(t.amount || 0) || 0, pct) };
      });
    }
    next.totalInvestments = jitter(next.totalInvestments, 0.06);
    next.trend = Math.random() < 0.5 ? "↑ +3 pts vs last week" : "→ steady vs last week";
    model = next;
    renderAll();
  }

  function loadDemoData() {
    model = EMPTY_MODEL();
    renderAll();
    setUploadStatus("", "Cleared demo data. Ready to track real history.");
  }

  // -----------------------------
  // Utilities
  // -----------------------------
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    // Icons
    if (window.lucide?.createIcons) window.lucide.createIcons();

    // Theme
    applyTheme(getTheme());

    // Date stamp
    const d = new Date();
    setText("todayDate", d.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" }));

    // Navigation
    document.querySelectorAll(".nav__item").forEach((b) => {
      b.addEventListener("click", () => setRoute(b.getAttribute("data-route") || "dashboard"));
    });

    // Avatar -> Profile
    $("avatarBtn")?.addEventListener("click", () => setRoute("profile"));

    // Notifications panel
    renderNotifs();
    const panel = $("notifPanel");
    $("btnNotif")?.addEventListener("click", () => {
      if (!panel) return;
      panel.classList.toggle("is-open");
      if (panel.classList.contains("is-open")) markAllRead();
      renderNotifs();
    });
    $("btnNotifClear")?.addEventListener("click", () => clearNotifs());
    document.addEventListener("click", (e) => {
      const btn = $("btnNotif");
      if (!panel || !btn) return;
      if (!panel.classList.contains("is-open")) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.classList.remove("is-open");
      renderNotifs();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!panel) return;
      panel.classList.remove("is-open");
      renderNotifs();
    });

    // Chips
    $("chipRefresh")?.addEventListener("click", () => refreshAI());
    $("btnRegenerateSummary")?.addEventListener("click", () => renderAISummary(model));

    // Login (simple email + password)
    const loginError = $("loginError");
    const showLoginError = (msg) => {
      if (!loginError) return;
      loginError.textContent = msg;
      loginError.classList.toggle("is-visible", !!msg);
    };

    $("loginForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = $("loginEmail")?.value?.trim() || "";
      const pw = $("loginPassword")?.value?.trim() || "";
      if (!email || !pw) {
        showLoginError("Please enter email and password.");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        showLoginError("Please enter a valid email address.");
        return;
      }
      showLoginError("");
      setUser({ email, name: email.split("@")[0] });
      loadModelForCurrentUser();
      renderProfile();
      setUploadStatus("", "Signed in. Welcome back.");
      setRoute("dashboard");
    });

    $("btnForgot")?.addEventListener("click", () => {
      showLoginError("Demo app: password reset isn’t enabled. Please log in again.");
    });

    $("btnSignup")?.addEventListener("click", () => {
      showLoginError("Demo app: sign up isn’t enabled. Use your email + any password to create a local profile.");
    });

    // Profile save + logout
    $("profileForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("profileNameInput")?.value?.trim() || "";
      const email = $("profileEmailInput")?.value?.trim() || "";
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;
      setUser({ email, name: name || email.split("@")[0] });
      renderProfile();
      const hint = $("profileSavedHint");
      if (hint) hint.textContent = "Saved. Updated locally.";
      setTimeout(() => {
        const h = $("profileSavedHint");
        if (h) h.textContent = "Changes save to this browser only.";
      }, 1200);
    });

    $("btnLogout")?.addEventListener("click", () => {
      clearUser();
      setUploadStatus("", "Signed out.");
      setRoute("login");
    });

    $("btnToggleProfileEdit")?.addEventListener("click", () => {
      const form = document.getElementById("profileForm");
      if (!form) return;
      form.classList.toggle("is-hidden");
    });

    // Transactions filters
    $("txType")?.addEventListener("change", () => renderTransactionsPage());
    $("txCategory")?.addEventListener("change", () => renderTransactionsPage());
    $("txDateFilter")?.addEventListener("change", () => renderTransactionsPage());
    $("txDateClear")?.addEventListener("click", () => {
      const d = $("txDateFilter");
      if (d) d.value = "";
      renderTransactionsPage();
    });

    // Settings: theme toggles
    $("themeDark")?.addEventListener("click", () => applyTheme("dark"));
    $("themeLight")?.addEventListener("click", () => applyTheme("light"));

    // Upload buttons
    $("btnUploadPdf")?.addEventListener("click", () => $("filePdf")?.click());
    $("btnUploadImg")?.addEventListener("click", () => $("fileImg")?.click());
    $("filePdf")?.addEventListener("change", (e) => simulateAnalysis(e.target.files?.[0] ?? null));
    $("fileImg")?.addEventListener("change", (e) => simulateAnalysis(e.target.files?.[0] ?? null));

    // Manual entry (no bill available)
    $("manualEntryForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const typeSel = $("manualType");
      const catSel = $("manualCategory");
      const nameInput = $("manualName");
      const amtInput = $("manualAmount");
      const dateInput = $("manualDate");
      const hint = $("manualEntryHint");

      const type = typeSel?.value === "investment" ? "investment" : "expense";
      const categoryRaw = catSel?.value || (type === "investment" ? "Investment" : "Shopping");
      const category = type === "investment" ? "Investment" : categoryRaw;
      const merchant = nameInput?.value?.trim() || (type === "investment" ? "Manual investment" : "Manual expense");
      const amount = Number(amtInput?.value || 0) || 0;
      const date = dateInput?.value || isoDateDaysAgo(0);

      if (!merchant || !amount || amount <= 0) return;

      model.transactions = Array.isArray(model.transactions) ? model.transactions : [];
      model.transactions.unshift({
        id: uid(),
        date,
        type,
        category,
        merchant,
        amount: Math.round(amount),
      });

      renderAll();
      if (isAuthed()) {
        tickBudgetNotifs();
      }
      if (hint) {
        hint.textContent = "Added. Dashboard and investments updated.";
        setTimeout(() => {
          const h = $("manualEntryHint");
          if (h) h.textContent = "This will immediately update your dashboard, charts, and health score.";
        }, 1600);
      }
      if (nameInput) nameInput.value = "";
      if (amtInput) amtInput.value = "";
    });

    // Chat
    bootChat();
    document.querySelectorAll("[data-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.getAttribute("data-prompt") || "";
        sendChat(prompt);
      });
    });
    $("chatForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("chatInput");
      const text = input?.value?.trim() || "";
      if (!text) return;
      input.value = "";
      sendChat(text);
    });

    // Search (light UX: if it matches a subscription, focus that section)
    $("searchBox")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = e.target.value.trim().toLowerCase();
      if (!q) return;
      currentSearch = q;
      setRoute("transactions");
      $("txType") && (($("txType").value = "all"));
      $("txCategory") && (($("txCategory").value = "all"));
      $("txDateFilter") && (($("txDateFilter").value = ""));
      renderTransactionsPage();
      pushNotif("Search applied", `Filtered transactions by “${e.target.value.trim()}”.`, "info");
    });

    bootRevealObserver();

    // Initial render
    if (isAuthed()) {
      loadModelForCurrentUser();
      renderProfile();
      renderAll();
      tickBudgetNotifs();
      setInterval(() => {
        if (!isAuthed()) return;
        tickBudgetNotifs();
      }, 45000);
      setRoute("dashboard");
    } else {
      model = EMPTY_MODEL();
      renderAll();
      setRoute("login");
    }
  }

  async function sendChat(text) {
    setRoute("dashboard");
    addBubble("user", text, `You • ${new Date().toLocaleTimeString(undefined, { timeStyle: "short" })}`);

    // Typing indicator effect
    await sleep(350);
    const reply = aiReply(text);
    addBubble("ai", reply, `AI • ${new Date().toLocaleTimeString(undefined, { timeStyle: "short" })}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


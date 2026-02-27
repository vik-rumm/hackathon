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

  // -----------------------------
  // Demo finance model
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

  const DEFAULT_DATA = () => ({
    month: new Date().toLocaleString(undefined, { month: "long", year: "numeric" }),
    currency: "INR",
    totalIncome: 120000,
    budgetLimit: 65000,
    // Expenses by category (this month)
    expenses: {
      Food: 14600,
      Coffee: 2400,
      Travel: 9100,
      Shopping: 11800,
      EMI: 16800,
      Subscriptions: 1499,
      Investments: 18500, // included in breakdown per spec
    },
    // Investments total (can be different from "Investments" category if you want to track separately)
    totalInvestments: 18500,
    subscriptions: [
      { name: "Netflix", monthly: 649, icon: "tv" },
      { name: "Spotify", monthly: 119, icon: "music" },
      { name: "Amazon Prime", monthly: 299, icon: "package" },
      { name: "iCloud+", monthly: 149, icon: "cloud" },
      { name: "YouTube Premium", monthly: 129, icon: "play" },
      { name: "Notion AI", monthly: 154, icon: "sparkles" },
    ],
    trend: "↑ +6 pts vs last month",
  });

  /** @type {ReturnType<typeof DEFAULT_DATA>} */
  let model = DEFAULT_DATA();

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
  function calcTotals(m) {
    const totalExpenses = Object.values(m.expenses).reduce((a, b) => a + b, 0);
    const subsTotal = m.subscriptions.reduce((a, s) => a + s.monthly, 0);
    const budgetUsedPct = m.budgetLimit > 0 ? totalExpenses / m.budgetLimit : 0;
    const remaining = Math.max(0, m.budgetLimit - totalExpenses);
    const invest = m.totalInvestments ?? m.expenses.Investments ?? 0;
    return { totalExpenses, subsTotal, budgetUsedPct, remaining, invest };
  }

  function calcHealthScore(m) {
    const { totalExpenses, subsTotal, budgetUsedPct, invest } = calcTotals(m);
    const income = Math.max(1, m.totalIncome);

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
    const income = Math.max(1, m.totalIncome);

    const catPairs = Object.entries(m.expenses)
      .filter(([k]) => k !== "Investments") // treat investments separately in narrative
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
    const { totalExpenses, invest } = calcTotals(m);
    setText("statIncome", fmtINR(m.totalIncome));
    setText("statExpenses", fmtINR(totalExpenses));
    setText("statInvestments", fmtINR(invest));

    const save = Math.max(0, m.totalIncome - totalExpenses - invest);
    const spendRate = totalExpenses / Math.max(1, m.totalIncome);
    const investRate = invest / Math.max(1, m.totalIncome);

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
    const values = labels.map((k) => m.expenses[k] ?? 0);
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
  }

  // -----------------------------
  // Upload simulation
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

    // Lightly adjust model to feel "AI-powered"
    const bump = file.type === "application/pdf" ? 0.06 : 0.04;
    const cats = Object.keys(model.expenses);
    const pick = cats[Math.floor(Math.random() * cats.length)];
    model.expenses[pick] = Math.max(0, Math.round(model.expenses[pick] * (1 + bump)));
    model.trend = "↑ Updated after document analysis";

    // Randomly "detect" an extra subscription sometimes
    if (Math.random() < 0.33) {
      model.subscriptions = [
        ...model.subscriptions,
        { name: "Adobe", monthly: 399, icon: "pen-tool" },
      ];
    }

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
    const income = Math.max(1, model.totalIncome);

    const sortedCats = Object.entries(model.expenses)
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
    return `Here’s your snapshot:\n- Income: ${fmtINR(model.totalIncome)}\n- Expenses: ${fmtINR(totalExpenses)}\n- Investments: ${fmtINR(invest)}\n- Subscriptions: ${fmtINR(subsTotal)}/mo\n\nAsk “Where am I overspending?” or “Can I afford a new phone for 55000?”`;
  }

  function bootChat() {
    const log = $("chatLog");
    if (log && !log.childElementCount) {
      addBubble("ai", "Hi — I’m your AI Money Coach. Ask me about overspending, budgets, or big purchases.", "AI Money Coach • online");
      addBubble("ai", "Try: “Where am I overspending?” or “Can I afford a new phone for 55,000?”");
    }
  }

  // -----------------------------
  // Routing + animations
  // -----------------------------
  function setRoute(route) {
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
    for (const k of Object.keys(next.expenses)) next.expenses[k] = jitter(next.expenses[k], 0.08);
    next.totalInvestments = jitter(next.totalInvestments, 0.06);
    next.trend = Math.random() < 0.5 ? "↑ +3 pts vs last week" : "→ steady vs last week";
    model = next;
    renderAll();
  }

  function loadDemoData() {
    model = DEFAULT_DATA();
    renderAll();
    setUploadStatus("", "Demo data loaded. Ready for upload.");
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

    // Date stamp
    const d = new Date();
    setText("todayDate", d.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" }));

    // Navigation
    document.querySelectorAll(".nav__item").forEach((b) => {
      b.addEventListener("click", () => setRoute(b.getAttribute("data-route") || "dashboard"));
    });

    // Chips
    $("chipRefresh")?.addEventListener("click", () => refreshAI());
    $("btnRegenerateSummary")?.addEventListener("click", () => renderAISummary(model));
    $("chipDemo")?.addEventListener("click", () => loadDemoData());

    // Upload buttons
    $("btnUploadPdf")?.addEventListener("click", () => $("filePdf")?.click());
    $("btnUploadImg")?.addEventListener("click", () => $("fileImg")?.click());
    $("filePdf")?.addEventListener("change", (e) => simulateAnalysis(e.target.files?.[0] ?? null));
    $("fileImg")?.addEventListener("change", (e) => simulateAnalysis(e.target.files?.[0] ?? null));

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
      const hit = model.subscriptions.find((s) => s.name.toLowerCase().includes(q));
      if (hit) {
        setRoute("dashboard");
        setUploadStatus("is-warn", `Search hit: "${hit.name}" in subscriptions.`);
      } else {
        setUploadStatus("is-warn", "No results found (demo search).");
      }
    });

    bootRevealObserver();

    // Initial render
    renderAll();
    setRoute("dashboard");
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


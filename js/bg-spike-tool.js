/* global Chart */
(function () {
  "use strict";

  const BASE = window.BG_SPIKE_MODEL;
  const LS_KEY = "usdaFdcApiKey";

  function getModelForPreset(presetKey) {
    const presets = window.BG_SPIKE_COHORT_PRESETS || {};
    const extra = presets[presetKey] || {};
    return Object.assign({}, BASE, extra);
  }

  function getModel() {
    return getModelForPreset("default");
  }

  function setPanelHint(msg) {
    const el = document.getElementById("panelHint");
    if (el) el.textContent = msg || "";
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /** USDA FDC often returns 429 on DEMO_KEY; retry with backoff. */
  async function fetchWith429Retry(urlString, maxTries) {
    let res;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      if (attempt > 0) await sleep(2600 * attempt);
      res = await fetch(urlString);
      if (res.status !== 429) return res;
    }
    return res;
  }
  /** USDA documents DEMO_KEY for exploration; low rate limits — users can paste their own key. */
  const USDA_DEMO_KEY = "DEMO_KEY";

  function effectiveFdcApiKey() {
    const k = getApiKey();
    return k || USDA_DEMO_KEY;
  }

  /** Minutes from midnight 0..1439 for each half-hour */
  const MAX_PORTION = 6;

  function getPortion() {
    const sel = document.getElementById("portion");
    const v = sel ? parseInt(sel.value, 10) : 1;
    if (!Number.isFinite(v) || v < 1) return 1;
    return Math.min(v, MAX_PORTION);
  }

  function formatPortionLabel(portion) {
    return portion + "x";
  }

  function formatEventLabel(ev) {
    const portionLabel = ev.portion > 1 ? " · " + formatPortionLabel(ev.portion) : "";
    return ev.name + portionLabel + " @ " + formatAmPm(ev.mealMinutes);
  }

  function renderEventLog() {
    const ul = document.getElementById("eventLog");
    if (!ul) return;
    ul.innerHTML = "";
    events.forEach((ev, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "meal-remove-btn";
      btn.textContent = "(-)";
      btn.setAttribute("aria-label", "Remove " + ev.name);
      btn.dataset.index = String(i);
      const label = document.createElement("span");
      label.textContent = formatEventLabel(ev);
      li.appendChild(btn);
      li.appendChild(label);
      ul.appendChild(li);
    });
  }

  function removeMeal(index) {
    if (index < 0 || index >= events.length) return;
    events.splice(index, 1);
    renderEventLog();
    renderChart();
  }

  function buildMealTimeOptions(selectEl) {
    selectEl.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select meal time…";
    selectEl.appendChild(opt0);
    for (let i = 0; i < 48; i++) {
      const minutes = i * 30;
      const opt = document.createElement("option");
      opt.value = String(minutes);
      opt.textContent = formatAmPm(minutes);
      selectEl.appendChild(opt);
    }
  }

  function formatAmPm(totalMinutes) {
    let h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const am = h < 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = m === 0 ? "00" : "30";
    return `${h12}:${mm} ${am ? "AM" : "PM"}`;
  }

  /** Minutes from midnight → e.g. 6:00 AM (any minute value). */
  function formatWallClock(minutesFromMidnight) {
    let m = Math.round(minutesFromMidnight);
    m = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const minPart = m % 60;
    const am = h < 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = minPart < 10 ? "0" + minPart : String(minPart);
    return h12 + ":" + mm + " " + (am ? "AM" : "PM");
  }

  function getApiKey() {
    const fromLs = localStorage.getItem(LS_KEY);
    if (fromLs && fromLs.trim()) return fromLs.trim();
    return "";
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function parseNutrients(food) {
    const out = { carbs: 0, fiber: 0, sugars: 0 };
    const list = food.foodNutrients || [];
    for (const n of list) {
      const id = n.nutrientId || (n.nutrient && n.nutrient.id);
      const amt = Number(n.value ?? n.amount ?? n.nutrient?.amount ?? 0);
      if (id === BASE.NUTRIENT_CARB) out.carbs = amt;
      if (id === BASE.NUTRIENT_FIBER) out.fiber = amt;
      if (id === BASE.NUTRIENT_SUGARS) out.sugars = amt;
    }
    return out;
  }

  /** Per 100g reference; scale by serving if present — use per 100g for simplicity */
  function glycemicProxy(n, P) {
    const net = Math.max(0, n.carbs - P.FIBER_DAMPEN * n.fiber);
    return Math.max(0, net * P.CARB_SCALE + n.sugars * 0.15);
  }

  function eventGlycemicProxy(ev, P) {
    return glycemicProxy(
      { carbs: ev.carbs, fiber: ev.fiber, sugars: ev.sugars != null ? ev.sugars : 0 },
      P
    );
  }

  /** Single-meal bump at offset minutes t, meal centered at t0 */
  function mealBump(t, t0, ev, P) {
    const proxy = eventGlycemicProxy(ev, P);
    const peak = Math.min(P.MAX_BUMP, proxy);
    if (peak <= 0) return 0;
    const u = t - t0;
    if (u < -20) return 0;
    if (u < P.RISE_TAU) {
      const rise = (u + 20) / (P.RISE_TAU + 20);
      return peak * Math.max(0, Math.min(1, rise * rise));
    }
    const decay = u - P.RISE_TAU;
    return peak * Math.exp(-decay / P.DECAY_TAU);
  }

  function offsetFromPivot(mealMinutes, pivotMinutes) {
    let d = mealMinutes - pivotMinutes;
    while (d > 720) d -= 1440;
    while (d < -720) d += 1440;
    return d;
  }

  /** Composite illustrative BG (mg/dL) at chart minute t from all events. */
  function predictBgAtMinute(events, pivot, t, P) {
    let y = P.BASELINE_MGDL;
    for (const ev of events) {
      const t0 = offsetFromPivot(ev.mealMinutes, pivot);
      y += mealBump(t, t0, ev, P);
    }
    return Math.max(P.Y_MIN, Math.min(P.Y_MAX, y));
  }

  /** Points on the plotted curve at each meal time (USDA-driven model runs entirely in-browser). */
  function mealEventScatterData(events, pivot, P) {
    return events
      .map((ev) => {
        const x = offsetFromPivot(ev.mealMinutes, pivot);
        if (x < BASE.X_MIN || x > BASE.X_MAX) return null;
        const y = predictBgAtMinute(events, pivot, x, P);
        return { x, y, name: ev.name };
      })
      .filter(Boolean);
  }

  function computeCurveWithP(events, P) {
    if (!events.length) return { xs: [], ys: [] };
    const pivot = events[0].mealMinutes;
    const xs = [];
    const ys = [];
    for (let t = BASE.X_MIN; t <= BASE.X_MAX; t += BASE.X_STEP) {
      const y = predictBgAtMinute(events, pivot, t, P);
      xs.push(t);
      ys.push(y);
    }
    return { xs, ys, pivot };
  }

  function computeCurve(events) {
    return computeCurveWithP(events, getModel());
  }

  async function searchFdc(query, apiKey) {
    if (!apiKey) throw new Error("no_key");
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "8");
    const res = await fetchWith429Retry(url.toString(), 4);
    if (!res.ok) throw new Error("fdc_http_" + res.status);
    const data = await res.json();
    return data.foods || [];
  }

  function isLocalFoodRecord(f) {
    const id = f && f.fdcId;
    return typeof id === "number" && id < 0;
  }

  /** Match built-in foods when USDA is slow or offline (token AND across words). */
  function searchLocalFoods(query) {
    const raw = (window.BG_SPIKE_LOCAL_FOODS || []).slice();
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const matched = raw.filter(function (item) {
      const hay = ((item.searchText || "") + " " + (item.description || "")).toLowerCase();
      return tokens.every(function (t) {
        return hay.indexOf(t) >= 0;
      });
    });
    return matched.slice(0, 12);
  }

  function normalizeFoodDedupeKey(f) {
    const d = f.description || f.lowercaseDescription || "";
    return String(d)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Offline matches first, then USDA; drop duplicate labels. */
  function mergeFoodResults(localFoods, usdaFoods) {
    const seen = {};
    const out = [];
    function pushUnique(f) {
      const key = normalizeFoodDedupeKey(f);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(f);
    }
    localFoods.forEach(pushUnique);
    (usdaFoods || []).forEach(pushUnique);
    return out.slice(0, 16);
  }

  /** Full food record (richer `foodNutrients`) for modeling when a meal is added. */
  async function fetchFoodDetail(fdcId, apiKey) {
    if (!apiKey) throw new Error("no_key");
    const url = new URL("https://api.nal.usda.gov/fdc/v1/food/" + encodeURIComponent(String(fdcId)));
    url.searchParams.set("api_key", apiKey);
    const res = await fetchWith429Retry(url.toString(), 4);
    if (!res.ok) throw new Error("fdc_food_" + res.status);
    return res.json();
  }

  let chart;
  let events = [];
  let selectedFood = null;

  /** Ink blue for meal name chips (matches site “band blue” family, darker for contrast). */
  const INK_BLUE_BG = "#0c2d6b";
  const INK_BLUE_LABEL = "#ffffff";

  /** Meal scatter: filled circles on the glucose curve. */
  const MEAL_DOT_RADIUS = 6;
  const MEAL_DOT_HOVER = MEAL_DOT_RADIUS + 2;
  const MEAL_DOT_FILL = "#f97316";
  const MEAL_DOT_STROKE = "#ffffff";
  const MEAL_DOT_STROKE_WIDTH = 1.25;

  /** Pixels: shift meal name label down from curve point so it sits under the dot. */
  const MEAL_LABEL_Y_OFFSET_PX = 18;

  /** Vertical dashed lines at meal times (no text — names use label annotations at curve points). */
  function mealVerticalLineAnnotations(pivot) {
    const out = {};
    events.forEach((ev, i) => {
      const x = offsetFromPivot(ev.mealMinutes, pivot);
      if (x < BASE.X_MIN || x > BASE.X_MAX) return;
      out["mealLine" + i] = {
        type: "line",
        xMin: x,
        xMax: x,
        yMin: BASE.Y_MIN,
        yMax: BASE.Y_MAX,
        borderColor: "rgba(249, 115, 22, 0.85)",
        borderWidth: 2,
        borderDash: [5, 5],
      };
    });
    return out;
  }

  /** Food names at (meal time, BG on curve), offset downward in pixels so they sit below the dot. */
  function mealNameLabelAnnotations(pivot) {
    const out = {};
    const PLabel = getModel();
    events.forEach((ev, i) => {
      const x = offsetFromPivot(ev.mealMinutes, pivot);
      if (x < BASE.X_MIN || x > BASE.X_MAX) return;
      const yAtMeal = predictBgAtMinute(events, pivot, x, PLabel);
      const yClamped = Math.max(BASE.Y_MIN + 2, Math.min(BASE.Y_MAX - 2, yAtMeal));
      out["mealLabel" + i] = {
        type: "label",
        xScaleID: "x",
        yScaleID: "y",
        xValue: x,
        yValue: yClamped,
        position: "center",
        xAdjust: 0,
        yAdjust: MEAL_LABEL_Y_OFFSET_PX,
        content: ev.name.slice(0, 34),
        color: INK_BLUE_LABEL,
        backgroundColor: INK_BLUE_BG,
        borderWidth: 0,
        borderRadius: 6,
        padding: { top: 4, bottom: 4, left: 7, right: 7 },
        font: { size: 10, weight: "700" },
        textAlign: "center",
      };
    });
    return out;
  }

  function renderChart() {
    const P = getModel();
    const pivot = events.length ? events[0].mealMinutes : 0;
    /** For x-axis clock labels when no meals yet, assume 6:00 AM sample window. */
    const wallClockPivot = events.length ? events[0].mealMinutes : 6 * 60;
    let lineData;
    let datasetLabel;
    let borderDash = [];
    const datasets = [];

    if (!events.length) {
      datasetLabel = "Add a meal to plot";
      borderDash = [8, 6];
      lineData = [];
      for (let t = BASE.X_MIN; t <= BASE.X_MAX; t += BASE.X_STEP * 5) {
        lineData.push({ x: t, y: P.BASELINE_MGDL });
      }
      datasets.push({
        type: "line",
        label: datasetLabel,
        data: lineData,
        borderColor: "#9ca3af",
        backgroundColor: "rgba(156, 163, 175, 0.06)",
        fill: true,
        tension: 0,
        pointRadius: 0,
        borderWidth: 2,
        borderDash,
        order: 0,
      });
    } else {
      const { xs, ys } = computeCurve(events);
      datasetLabel = "BG (USDA nutrients + cohort preset)";
      lineData = xs.map((x, i) => ({ x, y: ys[i] }));
      datasets.push({
        type: "line",
        label: datasetLabel,
        data: lineData,
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29, 78, 216, 0.08)",
        fill: true,
        tension: 0.38,
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [],
        order: 0,
      });
      datasets.push({
        type: "scatter",
        label: "Meals (dots)",
        data: mealEventScatterData(events, pivot, getModel()),
        pointStyle: "circle",
        pointRadius: MEAL_DOT_RADIUS,
        pointHoverRadius: MEAL_DOT_HOVER,
        pointBackgroundColor: MEAL_DOT_FILL,
        pointBorderColor: MEAL_DOT_STROKE,
        pointBorderWidth: MEAL_DOT_STROKE_WIDTH,
        order: 1,
      });
    }

    const ann = {
      ref70: {
        type: "line",
        yMin: BASE.REF_LOW,
        yMax: BASE.REF_LOW,
        xMin: BASE.X_MIN,
        xMax: BASE.X_MAX,
        borderColor: "rgba(59, 130, 246, 0.55)",
        borderWidth: 2,
        borderDash: [6, 6],
      },
      ref140: {
        type: "line",
        yMin: BASE.REF_HIGH,
        yMax: BASE.REF_HIGH,
        xMin: BASE.X_MIN,
        xMax: BASE.X_MAX,
        borderColor: "rgba(59, 130, 246, 0.55)",
        borderWidth: 2,
        borderDash: [6, 6],
      },
      ...mealVerticalLineAnnotations(pivot),
      ...mealNameLabelAnnotations(pivot),
    };

    const cfg = {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { bottom: 0 },
        },
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: {
            type: "linear",
            min: BASE.X_MIN,
            max: BASE.X_MAX,
            title: {
              display: true,
              text: events.length
                ? "Time of day (first meal " + formatWallClock(wallClockPivot) + "; 2 h earlier at left)"
                : "Time of day (example: first meal 6:00 AM; 2 h earlier at left)",
            },
            ticks: {
              maxTicksLimit: 13,
              callback(v) {
                return formatWallClock(wallClockPivot + v);
              },
            },
          },
          y: {
            min: BASE.Y_MIN,
            max: BASE.Y_MAX,
            title: {
              display: true,
              text: "Blood glucose (mg/dL)",
            },
          },
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            callbacks: {
              title(items) {
                const x = items[0].parsed.x;
                return formatWallClock(wallClockPivot + x);
              },
              label(ctx) {
                if (ctx.dataset.type === "scatter" && ctx.raw && ctx.raw.name) {
                  return (
                    ctx.dataset.label +
                    ": " +
                    ctx.raw.name +
                    " @ " +
                    ctx.parsed.y.toFixed(0) +
                    " mg/dL"
                  );
                }
                const y = ctx.parsed.y;
                return y != null ? ctx.dataset.label + ": ≈ " + y.toFixed(0) + " mg/dL" : "";
              },
            },
          },
          annotation: { annotations: ann },
          zoom: {
            limits: {
              x: {
                min: BASE.X_MIN,
                max: BASE.X_MAX,
                minRange: BASE.X_MIN_ZOOM_RANGE_MIN,
              },
              y: { min: BASE.Y_MIN, max: BASE.Y_MAX },
            },
            pan: {
              enabled: true,
              mode: "x",
              modifierKey: null,
              threshold: 6,
            },
            zoom: {
              wheel: { enabled: true, speed: 0.35 },
              pinch: { enabled: true },
              mode: "x",
            },
          },
        },
      },
    };

    const hint = document.getElementById("chartEmptyHint");
    if (hint) hint.style.display = events.length ? "none" : "block";

    const ctx = document.getElementById("bgSpikeChart").getContext("2d");
    if (chart) chart.destroy();
    chart = new Chart(ctx, cfg);
  }

  function syncList(foods) {
    const ul = document.getElementById("foodResults");
    ul.innerHTML = "";
    foods.forEach((f) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      const base = f.description || f.lowercaseDescription || "Food";
      li.textContent = isLocalFoodRecord(f) ? "Offline · " + base : base;
      li.dataset.fdc = String(f.fdcId);
      li.tabIndex = -1;
      li.addEventListener("click", () => selectFood(f));
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectFood(f);
        }
      });
      ul.appendChild(li);
    });
    const items = ul.querySelectorAll("li");
    if (items.length) {
      items[0].tabIndex = 0;
      ul.tabIndex = 0;
      ul.setAttribute("role", "listbox");
    } else {
      ul.removeAttribute("role");
      ul.tabIndex = -1;
    }
  }

  function foodResultsKeynav(e) {
    const ul = document.getElementById("foodResults");
    if (e.target !== ul && !ul.contains(e.target)) return;
    const items = Array.from(ul.querySelectorAll("li"));
    if (!items.length) return;
    const ix = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(items.length - 1, Math.max(0, ix < 0 ? 0 : ix + 1));
      items.forEach((el, i) => {
        el.tabIndex = i === next ? 0 : -1;
      });
      items[next].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, ix < 0 ? 0 : ix - 1);
      items.forEach((el, i) => {
        el.tabIndex = i === next ? 0 : -1;
      });
      items[next].focus();
    }
  }

  function scaledNutrients(n, portion) {
    return {
      carbs: n.carbs * portion,
      fiber: n.fiber * portion,
      sugars: n.sugars * portion,
    };
  }

  function refreshFoodMeta() {
    const meta = document.getElementById("foodMeta");
    if (!meta) return;
    if (!selectedFood) {
      meta.textContent = "";
      return;
    }
    const portion = getPortion();
    const scaled = scaledNutrients(parseNutrients(selectedFood), portion);
    const P = getModel();
    const g = glycemicProxy(scaled, P);
    const portionNote =
      portion > 1 ? " · " + formatPortionLabel(portion) + " (per 100 g each)" : " (per 100 g)";
    meta.textContent =
      "Carbs " +
      scaled.carbs.toFixed(1) +
      " g / Fiber " +
      scaled.fiber.toFixed(1) +
      " g" +
      portionNote +
      " · model index " +
      g.toFixed(1);
  }

  function selectFood(f) {
    selectedFood = f;
    document.getElementById("foodSearch").value = f.description || "";
    const ul = document.getElementById("foodResults");
    ul.innerHTML = "";
    ul.removeAttribute("role");
    ul.tabIndex = -1;
    refreshFoodMeta();
    setPanelHint("");
  }

  const debouncedSearch = debounce(async () => {
    const q = document.getElementById("foodSearch").value.trim();
    if (q.length < 2) {
      const ul = document.getElementById("foodResults");
      ul.innerHTML = "";
      ul.removeAttribute("role");
      ul.tabIndex = -1;
      setPanelHint("");
      return;
    }
    const localFoods = searchLocalFoods(q);
    const key = effectiveFdcApiKey();
    setPanelHint("Searching…");
    let usdaFoods = [];
    let usdaFailed = false;
    let usdaStatus = "";
    try {
      usdaFoods = await searchFdc(q, key);
    } catch (e) {
      usdaFailed = true;
      const m = String(e && e.message ? e.message : e);
      if (m.indexOf("fdc_http_429") >= 0 || m.indexOf("429") >= 0) usdaStatus = "429";
    }
    const merged = mergeFoodResults(localFoods, usdaFoods);
    syncList(merged);

    if (!merged.length) {
      setPanelHint(
        usdaFailed
          ? "USDA search failed and nothing matched the offline list — try rice, banana, milk, yogurt…"
          : "No results for that search."
      );
      return;
    }

    if (usdaFailed) {
      setPanelHint(
        usdaStatus === "429" && localFoods.length
          ? "USDA is rate-limited — offline foods below. Click a row to select."
          : localFoods.length
            ? "USDA unavailable — showing offline matches. Click a row to select."
            : "USDA unavailable — pick an offline food from the list."
      );
      return;
    }

    if (usdaFoods.length === 0 && localFoods.length > 0) {
      setPanelHint("No USDA hits — showing offline matches. Click a row to select.");
    } else if (localFoods.length && usdaFoods.length) {
      setPanelHint("Pick a food below (offline + USDA). Click a row to select.");
    } else if (localFoods.length) {
      setPanelHint("Pick a food below (offline matches). Click a row to select.");
    } else {
      setPanelHint("Pick a food from the list below, then click it.");
    }
  }, 520);

  async function addMeal() {
    const timeSel = document.getElementById("mealTime");
    const minutes = timeSel.value;
    const addBtn = document.getElementById("addMealBtn");
    if (minutes === "") {
      setPanelHint("Choose a meal time from the dropdown.");
      return;
    }
    if (!selectedFood) {
      setPanelHint(
        "Select a food from the list: type at least 2 letters, wait for results, then click one row."
      );
      return;
    }
    const key = effectiveFdcApiKey();
    const mealMinutes = Number(minutes);
    let foodForModel = selectedFood;
    if (addBtn) addBtn.disabled = true;
    try {
      if (isLocalFoodRecord(selectedFood)) {
        foodForModel = selectedFood;
        setPanelHint("");
      } else {
        setPanelHint("Loading nutrition details…");
        try {
          const detail = await fetchFoodDetail(selectedFood.fdcId, key);
          foodForModel = Object.assign({}, selectedFood, detail);
          if (!detail.foodNutrients || !detail.foodNutrients.length) {
            foodForModel.foodNutrients = selectedFood.foodNutrients || [];
          }
        } catch (err) {
          setPanelHint("Detail request failed; using search-result nutrients.");
          foodForModel = selectedFood;
        }
      }
      const portion = getPortion();
      const scaled = scaledNutrients(parseNutrients(foodForModel), portion);
      events.push({
        fdcId: selectedFood.fdcId,
        name: selectedFood.description || foodForModel.description || "Meal",
        mealMinutes,
        portion,
        carbs: scaled.carbs,
        fiber: scaled.fiber,
        sugars: scaled.sugars,
      });
      renderEventLog();
      renderChart();
      setPanelHint("");
    } finally {
      if (addBtn) addBtn.disabled = false;
    }
  }

  function resetAll() {
    events = [];
    selectedFood = null;
    renderEventLog();
    document.getElementById("foodMeta").textContent = "";
    setPanelHint("");
    renderChart();
  }

  function init() {
    buildMealTimeOptions(document.getElementById("mealTime"));
    const portionSel = document.getElementById("portion");
    if (portionSel) {
      portionSel.addEventListener("change", refreshFoodMeta);
    }
    document.getElementById("foodResults").addEventListener("keydown", foodResultsKeynav);
    document.getElementById("foodSearch").addEventListener("input", debouncedSearch);
    document.getElementById("addMealBtn").addEventListener("click", addMeal);
    document.getElementById("resetBtn").addEventListener("click", resetAll);
    const eventLogEl = document.getElementById("eventLog");
    if (eventLogEl) {
      eventLogEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".meal-remove-btn");
        if (!btn) return;
        removeMeal(Number(btn.dataset.index));
      });
    }
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    if (resetZoomBtn) {
      resetZoomBtn.addEventListener("click", () => {
        if (chart && typeof chart.resetZoom === "function") chart.resetZoom();
      });
    }

    renderChart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

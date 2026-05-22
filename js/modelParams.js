/**
 * BG spike model parameters (educational / illustrative only — not medical advice).
 *
 * Time axis (12h window): X is minutes relative to the PIVOT meal, range [-120, +600] (2h before through 10h after).
 * - Pivot = wall-clock time (minutes from midnight) of the FIRST logged meal in the session.
 * - Each additional meal is placed at its offset from pivot (wrapping within ±12h when crossing midnight).
 * - The plotted line superposes smooth post-meal bumps from all events in this window.
 *
 * Curve shape: simplified post-prandial rise + decay informed by common CGM literature patterns
 * (e.g. typical peak ~45–90 min, decay over several hours) — coefficients are tunable placeholders.
 * Inputs are USDA nutrient fields only; the curve is computed in this page (no external journal or graph API).
 *
 * Context: [Awesome-CGM](https://github.com/IrinaStatsLab/Awesome-CGM) is a curated index of **public CGM datasets**
 * (not an API). Cohort presets below name study populations **listed there** and apply small heuristic parameter
 * shifts so the same USDA meal proxy behaves differently by context — they are **not** statistical fits to those
 * datasets. See Zenodo v2.0.0 citation on that repo for the collection.
 *
 * This page does **not** load or plot raw traces from Awesome-CGM downloads — those require separate access and R tooling from that project.
 */
window.BG_SPIKE_MODEL = {
  /** Minutes: left edge = 2 hours before pivot meal */
  X_MIN: -120,
  /** Minutes: right edge = 10 hours after pivot (12h window total) */
  X_MAX: 600,
  /** Minimum visible time span when zooming in (minutes); 30 = ½ hour */
  X_MIN_ZOOM_RANGE_MIN: 30,
  /** Sample step for plotting (minutes); smaller = smoother polyline before curve smoothing */
  X_STEP: 1,
  /** Baseline BG (mg/dL) before meal effects */
  BASELINE_MGDL: 100,
  /** Y axis hard limits */
  Y_MIN: 0,
  Y_MAX: 400,
  /** Reference lines (mg/dL), parallel to time axis */
  REF_LOW: 70,
  REF_HIGH: 140,
  /** FDC nutrient IDs (FoodData Central) */
  NUTRIENT_CARB: 1005,
  NUTRIENT_FIBER: 1079,
  NUTRIENT_SUGARS: 2000,
  /** Bump model: peak scales with estimated glycemic load proxy */
  CARB_SCALE: 0.55,
  FIBER_DAMPEN: 2.2,
  MAX_BUMP: 95,
  /** Kernel: rise phase length (minutes), decay time constant (minutes) */
  RISE_TAU: 38,
  DECAY_TAU: 140,
};

/**
 * Partial overrides merged into BG_SPIKE_MODEL for `getModel()` in bg-spike-tool.js.
 * Keys match the cohort `select` (`#cgProfile`) option values in tested-plot-your-spikes.html.
 */
window.BG_SPIKE_COHORT_PRESETS = {
  default: {},
  /** Hall 2018 / Shah 2019–style healthy-adult CGM cohorts in Awesome-CGM (standardized-meal / reference-range work). */
  healthy: {
    BASELINE_MGDL: 92,
    CARB_SCALE: 0.48,
    RISE_TAU: 40,
    DECAY_TAU: 118,
    MAX_BUMP: 72,
  },
  /** Broll 2021 (T2 on Dexcom G4), Awesome-CGM Type 2 section — slightly higher baseline, slower decay heuristic. */
  type2: {
    BASELINE_MGDL: 115,
    CARB_SCALE: 0.62,
    FIBER_DAMPEN: 2.0,
    RISE_TAU: 44,
    DECAY_TAU: 168,
    MAX_BUMP: 88,
  },
  /** Brown 2019 / Lynch 2022–style T1 CGM cohorts in Awesome-CGM — slightly sharper rise, higher bump cap heuristic. */
  type1: {
    BASELINE_MGDL: 100,
    CARB_SCALE: 0.58,
    RISE_TAU: 34,
    DECAY_TAU: 128,
    MAX_BUMP: 98,
  },
};

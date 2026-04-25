/* AI Engineering Analyst v1.0 — engineering analysis with cited methodology.
 *
 * v1 scope: bolted-joint analysis (VDI 2230 / Shigley methodology).
 * Verified against MecAgent demo problem (4×M12/10.9, 18kN shear, 18kN axial, 420Nm moment,
 * μ=0.16, preload 39kN/bolt, BCD 96mm, K_s=1.5) — expected F_friction=24960N,
 * F_max_tensile=6687.5N, σ_vm=558MPa.
 *
 * Future scope (tasks #11 + #12): gears (AGMA), shafts (Goodman/Soderberg), bearings (L10),
 * welds (throat stress), plus RAG citations.
 *
 * Architecture:
 *   - Pure-JS analytical core (0 deps) — deterministic, unit-tested.
 *   - Natural-language parser extracts structured parameters from free-text.
 *   - Form UI with live recompute + LaTeX render (KaTeX, loaded on demand from CDN).
 *   - LLM layer (optional v1.1) calls the analytical core for every number — never fabricates results.
 */
(function(){
  'use strict';
  window.CycleCAD = window.CycleCAD || {};

  // ===================================================================
  // REFERENCE DATA — ISO 898-1 mechanical property classes for carbon steel bolts
  // Values: {nominalTensile R_m, proofStress R_p0.2, yieldStrength R_el} all in MPa
  // ===================================================================
  const STEEL_GRADES = Object.freeze({
    '4.6':  { R_m: 400,  R_p02: 225,  R_el: 240,  label: '4.6 (low-carbon steel, mild)' },
    '4.8':  { R_m: 400,  R_p02: 310,  R_el: 320,  label: '4.8 (low-carbon)' },
    '5.6':  { R_m: 500,  R_p02: 300,  R_el: 300,  label: '5.6 (medium-carbon)' },
    '5.8':  { R_m: 500,  R_p02: 380,  R_el: 400,  label: '5.8 (medium-carbon)' },
    '6.8':  { R_m: 600,  R_p02: 440,  R_el: 480,  label: '6.8 (medium-carbon)' },
    '8.8':  { R_m: 800,  R_p02: 580,  R_el: 640,  label: '8.8 (quenched & tempered, most common)' },
    '10.9': { R_m: 1000, R_p02: 830,  R_el: 900,  label: '10.9 (alloy, quenched & tempered)' },
    '12.9': { R_m: 1200, R_p02: 970,  R_el: 1080, label: '12.9 (alloy, Q&T high-strength)' }
  });

  // DIN 13 stress cross-section area A_s in mm² for standard metric coarse threads.
  // A_s = π/4 · ((d_2 + d_3) / 2)² where d_2 is pitch dia, d_3 is minor dia (nut thread root).
  const BOLT_STRESS_AREA = Object.freeze({
    M3: 5.03, M3_5: 6.78, M4: 8.78, M5: 14.2, M6: 20.1, M7: 28.9,
    M8: 36.6, M10: 58.0, M12: 84.3, M14: 115, M16: 157, M18: 192,
    M20: 245, M22: 303, M24: 353, M27: 459, M30: 561,
    M33: 694, M36: 817, M39: 976, M42: 1120, M45: 1300, M48: 1470,
    M52: 1760, M56: 2030
  });

  // Nominal (major) diameter in mm for standard metric coarse threads.
  const BOLT_MAJOR_DIA = Object.freeze({
    M3: 3, M4: 4, M5: 5, M6: 6, M8: 8, M10: 10, M12: 12, M14: 14, M16: 16,
    M18: 18, M20: 20, M22: 22, M24: 24, M27: 27, M30: 30, M33: 33, M36: 36,
    M39: 39, M42: 42, M45: 45, M48: 48, M52: 52, M56: 56
  });

  // Typical friction coefficients for clamped-joint faying surfaces (from VDI 2230 Table A6).
  const FRICTION_PRESETS = Object.freeze({
    'dry_steel_steel': 0.16,
    'oiled_steel_steel': 0.12,
    'aluminum_aluminum': 0.18,
    'zinc_coated': 0.14,
    'hot_dip_galvanized': 0.36,
    'phosphated': 0.16,
    'blasted_clean': 0.45
  });

  // ===================================================================
  // ANALYTICAL CORE — bolted-joint slip + tension + combined stress
  // ===================================================================

  /**
   * Bolted joint safety analysis (VDI 2230 + Shigley approach).
   *
   * @param {object} p Input parameters.
   * @param {number} p.boltCount Number of bolts z (≥1).
   * @param {string} p.grade Steel grade, e.g. '10.9'.
   * @param {string} p.thread Thread designation, e.g. 'M12'.
   * @param {number} p.preload Per-bolt preload F_V [N].
   * @param {number} p.shearForce External transverse/shear force F_Q [N].
   * @param {number} p.axialForce External axial/separating force F_A [N].
   * @param {number} p.moment In-plane moment M [N·mm].
   * @param {number} p.bcd Bolt-circle diameter [mm].
   * @param {number} p.friction Faying-surface coefficient μ.
   * @param {number} p.safetyFactor Required slip safety factor K_s.
   * @param {number} [p.frictionInterfaces=1] Number of friction-bearing interfaces n.
   * @returns {object} Structured result with inputs, slip/tension/stress checks, verdict.
   */
  function boltedJointAnalysis(p) {
    // Input normalisation
    const z             = Math.max(1, Math.round(Number(p.boltCount) || 4));
    const grade         = STEEL_GRADES[p.grade] ? p.grade : '8.8';
    const thread        = BOLT_STRESS_AREA[p.thread] ? p.thread : 'M12';
    const F_preload     = Math.max(0, Number(p.preload) || 0);
    const F_shear       = Math.max(0, Number(p.shearForce) || 0);
    const F_axial       = Math.max(0, Number(p.axialForce) || 0);
    const M             = Math.max(0, Number(p.moment) || 0);
    const bcd           = Math.max(0, Number(p.bcd) || 0);
    const mu            = Math.max(0.01, Number(p.friction) || 0.15);
    const K_s           = Math.max(1, Number(p.safetyFactor) || 1.5);
    const n_interfaces  = Math.max(1, Math.round(Number(p.frictionInterfaces) || 1));

    const A_s = BOLT_STRESS_AREA[thread];
    const d = BOLT_MAJOR_DIA[thread];
    const spec = STEEL_GRADES[grade];
    const R_p02 = spec.R_p02;
    const R_m = spec.R_m;
    const r = bcd / 2;

    // --- CHECK 1: Slip resistance ----------------------------------------------
    // Friction capacity:   F_friction = μ · n · z · F_V
    const F_friction = mu * n_interfaces * z * F_preload;

    // Per-bolt tangential force from in-plane moment (at BCD):
    //   F_M_tangential,i = M · r_i / Σr_j²  → for a uniform circle: M / (z · r)
    const F_moment_tangential_per_bolt = (r > 0) ? M / (z * r) : 0;

    // Worst-case per-bolt tangential force (shear/z plus moment contribution, aligned):
    const F_bolt_tangential_max = F_shear / z + F_moment_tangential_per_bolt;

    // Aggregate tangential resultant that the joint must resist (sum of worst-case bolt forces):
    const F_shear_total = z * F_bolt_tangential_max;
    const F_required_slip = K_s * F_shear_total;
    const slipSafe = F_friction >= F_required_slip;
    const slipMargin = F_required_slip > 0 ? F_friction / F_required_slip : Infinity;

    // --- CHECK 2: Bolt tension (worst-loaded bolt) ------------------------------
    // External tension per bolt: F_A/z + contribution from moment at worst position
    //   (axial moment component adds on the tension side of the BCD)
    const F_axial_per_bolt = F_axial / z;
    const F_moment_axial_per_bolt = (r > 0) ? M / (z * r) : 0;
    const F_max_external = F_axial_per_bolt + F_moment_axial_per_bolt;

    // Simplified: assume load factor Φ = 1 (rigid joint). In reality 0.1-0.3 for gasketed.
    // Full VDI 2230 uses F_S_max = F_V + Φ · F_A_ext. For v1, conservative (Φ=1):
    const F_bolt_total = F_preload + F_max_external;

    // --- CHECK 3: Combined stress (Von Mises) -----------------------------------
    // σ = F_bolt_total / A_s     (tensile)
    // τ = F_bolt_tangential_max / A_s   (shear from transverse loads + moment)
    // σ_vm = √(σ² + 3τ²)         (von Mises for uniaxial tension + shear)
    const sigma = F_bolt_total / A_s;
    const tau   = F_bolt_tangential_max / A_s;
    const sigma_vm = Math.sqrt(sigma * sigma + 3 * tau * tau);
    const stressUtilization = R_p02 > 0 ? sigma_vm / R_p02 : Infinity;
    const stressSafe = sigma_vm < R_p02;

    // --- VERDICT ----------------------------------------------------------------
    // Classification: joint is SAFE if both slip and stress checks pass.
    // If stress passes but slip fails, joint is a BEARING-TYPE joint — bolts transmit shear
    // directly. Still safe if stress is within proof strength.
    let verdict, verdictClass, notes = [];
    if (slipSafe && stressSafe) {
      verdict = 'SAFE';
      verdictClass = 'pass';
      notes.push('Preload prevents slip; bolt stress stays below proof strength.');
    } else if (!slipSafe && stressSafe) {
      verdict = 'SAFE (bearing-type)';
      verdictClass = 'warn';
      notes.push('Slip resistance marginal — joint relies on bolt shank shear.');
      notes.push('Consider increasing preload (higher Q_F) or adding friction (higher μ) to restore friction-type safety.');
    } else {
      verdict = 'UNSAFE';
      verdictClass = 'fail';
      if (!stressSafe) notes.push('Combined stress σ_vm = ' + sigma_vm.toFixed(1) + ' MPa exceeds proof strength ' + R_p02 + ' MPa.');
      if (!slipSafe)  notes.push('Insufficient friction capacity — bolts must also resist direct shear.');
    }

    return {
      inputs: { z, grade, thread, d, A_s, F_preload, F_shear, F_axial, M, bcd, r, mu, K_s, n_interfaces, R_p02, R_m, gradeLabel: spec.label },
      slipResistance: {
        F_friction, F_moment_tangential_per_bolt, F_bolt_tangential_max,
        F_shear_total, F_required: F_required_slip, margin: slipMargin, safe: slipSafe
      },
      tensionCheck: {
        F_axial_per_bolt, F_moment_axial_per_bolt, F_max_external,
        F_preload, F_bolt_total
      },
      combinedStress: {
        sigma, tau, sigma_vm, R_p02, utilization: stressUtilization, safe: stressSafe
      },
      verdict, verdictClass, notes
    };
  }

  // ===================================================================
  // GEAR MATERIAL DATA — AGMA Grade 1 steel allowables (Shigley Table 14-3 / 14-6)
  // Keys: hardness in HB (Brinell). Values: {S_t, S_c} in MPa (converted from psi).
  // S_t: allowable bending stress. S_c: allowable contact (surface) stress.
  // Formulas for through-hardened steel (AGMA 2001):
  //   S_t = 77 * HB + 12,800 psi        (Grade 1 bending)
  //   S_c = 322 * HB + 29,100 psi       (Grade 1 contact)
  // 1 psi = 0.00689476 MPa.
  // ===================================================================
  /**
   * Allowable bending stress for Grade 1 through-hardened gear steel (AGMA 2001).
   * @param {number} HB Brinell hardness (180–400 typical).
   * @returns {number} S_t in MPa.
   */
  function gearAllowableBending(HB) {
    return (77 * HB + 12800) * 0.00689476;
  }
  /**
   * Allowable contact stress for Grade 1 through-hardened gear steel (AGMA 2001).
   * @param {number} HB Brinell hardness.
   * @returns {number} S_c in MPa.
   */
  function gearAllowableContact(HB) {
    return (322 * HB + 29100) * 0.00689476;
  }

  // AGMA geometry factor J (bending) — approximated from Shigley Fig. 14-6
  // for external spur gears at 20° pressure angle. Interpolated by number of teeth.
  const J_TABLE = [
    [12, 0.245], [14, 0.265], [17, 0.295], [20, 0.32], [25, 0.345],
    [30, 0.365], [35, 0.38], [40, 0.39], [50, 0.41], [75, 0.435], [100, 0.45]
  ];
  function gearGeometryJ(teeth) {
    const z = Math.max(J_TABLE[0][0], Math.min(J_TABLE[J_TABLE.length-1][0], teeth));
    for (let i = 0; i < J_TABLE.length - 1; i++) {
      const [z1, j1] = J_TABLE[i], [z2, j2] = J_TABLE[i+1];
      if (z >= z1 && z <= z2) return j1 + (j2 - j1) * (z - z1) / (z2 - z1);
    }
    return 0.4;
  }

  // AGMA geometry factor I (pitting) — external gear pair, 20° pressure angle.
  // Approximated from Shigley Eq. 14-23 with m_N = 1 for spur gears.
  function gearGeometryI(pinionTeeth, gearTeeth, pressureAngle) {
    const phi = (pressureAngle || 20) * Math.PI / 180;
    const mG = gearTeeth / pinionTeeth;
    return (Math.cos(phi) * Math.sin(phi) / 2) * (mG / (mG + 1));
  }

  /**
   * Spur gear AGMA bending + pitting analysis (Shigley Ch. 14).
   *
   * Uses the fundamental AGMA 2001 stress equations with sensible default modifying factors.
   * For safety-critical applications, confirm each K-factor per AGMA 908-B89.
   *
   * @param {object} p
   * @param {number} p.pinionTeeth  z_P — pinion tooth count.
   * @param {number} p.gearTeeth    z_G — gear tooth count.
   * @param {number} p.module       m — in mm.
   * @param {number} p.faceWidth    F — in mm.
   * @param {number} p.torque       T_P — torque on pinion in N·m.
   * @param {number} p.pinionHB     HB_P — Brinell hardness of pinion.
   * @param {number} p.gearHB       HB_G — Brinell hardness of gear.
   * @param {number} [p.overload=1.0]       K_o — 1.0 uniform / 1.25 moderate / 1.5 heavy shock.
   * @param {number} [p.dynamic=1.1]        K_v — dynamic factor (≈1.0 precision, 1.1–1.3 typical).
   * @param {number} [p.loadDist=1.3]       K_m — load distribution (1.3 good alignment).
   * @param {number} [p.reliability=1.0]    K_R — 1.0 @ 99% reliability, 1.25 @ 99.9%.
   * @param {number} [p.pressureAngle=20]   φ — pressure angle in degrees.
   * @param {number} [p.Z_E=190]            Elastic coefficient for steel-steel (MPa^0.5).
   * @returns {object} {inputs, pinion:{…}, gear:{…}, verdict, …}
   */
  function spurGearAnalysis(p) {
    const z_P = Math.max(12, Math.round(Number(p.pinionTeeth) || 20));
    const z_G = Math.max(12, Math.round(Number(p.gearTeeth) || 40));
    const m   = Math.max(0.5, Number(p.module) || 2);
    const F   = Math.max(3, Number(p.faceWidth) || 25);
    const T_P = Math.max(0, Number(p.torque) || 0);
    const HB_P = Math.max(150, Number(p.pinionHB) || 240);
    const HB_G = Math.max(150, Number(p.gearHB)   || HB_P);
    const K_o = Math.max(1, Number(p.overload) || 1.0);
    const K_v = Math.max(1, Number(p.dynamic)  || 1.1);
    const K_m = Math.max(1, Number(p.loadDist) || 1.3);
    const K_R = Math.max(1, Number(p.reliability) || 1.0);
    const phi = Number(p.pressureAngle) || 20;
    const Z_E = Number(p.Z_E) || 190;
    const K_s = 1.0;   // size factor — ignore for typical sizes
    const K_B = 1.0;   // rim thickness — solid blank
    const C_f = 1.0;   // surface condition — clean-cut
    const Y_N = 1.0, Z_N = 1.0, C_H = 1.0, K_T = 1.0; // nominal life factors
    const mG = z_G / z_P;

    // Pitch diameters and tangential load
    const d_P = m * z_P;                    // pinion pitch dia in mm
    const d_G = m * z_G;                    // gear pitch dia
    const T_Pnmm = T_P * 1000;              // convert N·m → N·mm
    const W_t = (d_P > 0) ? (2 * T_Pnmm) / d_P : 0;  // tangential load N

    // Geometry factors
    const J_P = gearGeometryJ(z_P);
    const J_G = gearGeometryJ(z_G);
    const I   = gearGeometryI(z_P, z_G, phi);

    // AGMA bending stress (both gears see same W_t but different J)
    const sigma_b_P = (W_t * K_o * K_v * K_s * K_m * K_B) / (F * m * J_P);
    const sigma_b_G = (W_t * K_o * K_v * K_s * K_m * K_B) / (F * m * J_G);

    // AGMA contact stress (same magnitude for both meshing teeth)
    const sigma_c = (W_t > 0 && d_P > 0 && I > 0)
      ? Z_E * Math.sqrt((W_t * K_o * K_v * K_s * K_m * C_f) / (d_P * F * I))
      : 0;

    // Allowable stresses (material)
    const St_P = gearAllowableBending(HB_P);
    const St_G = gearAllowableBending(HB_G);
    const Sc_P = gearAllowableContact(HB_P);
    const Sc_G = gearAllowableContact(HB_G);

    // Factors of safety — Shigley Eq. 14-41 / 14-42 simplified
    const SF_bending_P = St_P * Y_N / (sigma_b_P * K_T * K_R);
    const SF_bending_G = St_G * Y_N / (sigma_b_G * K_T * K_R);
    const SF_contact_P = (Sc_P * Z_N * C_H) / (sigma_c * K_T * K_R);
    const SF_contact_G = (Sc_G * Z_N * C_H) / (sigma_c * K_T * K_R);

    const SF_min = Math.min(SF_bending_P, SF_bending_G, SF_contact_P, SF_contact_G);
    const safe = SF_min >= 1.0;
    const verdict = SF_min >= 2.0 ? 'SAFE (margin ≥ 2)' :
                    SF_min >= 1.5 ? 'SAFE (margin ≥ 1.5 — industry typical)' :
                    SF_min >= 1.0 ? 'MARGINAL (factor < 1.5 — review assumptions)' :
                                    'UNSAFE (factor < 1.0 — tooth will fail)';
    const verdictClass = SF_min >= 1.5 ? 'pass' : SF_min >= 1.0 ? 'warn' : 'fail';
    const notes = [];
    if (SF_bending_P < SF_bending_G) notes.push('Pinion is the weaker gear in bending (lower J factor) — as expected.');
    if (SF_contact_P < SF_bending_P) notes.push('Contact stress governs over bending — consider surface hardening (carburizing/induction) for higher S_c.');
    if (SF_min < 1.5) notes.push('Margin below industry-typical 1.5 — increase module, face width, or hardness.');

    return {
      inputs: { z_P, z_G, m, F, T_P, HB_P, HB_G, K_o, K_v, K_m, K_R, phi, Z_E,
                d_P, d_G, mG, W_t, J_P, J_G, I, St_P, St_G, Sc_P, Sc_G },
      pinion: { SF_bending: SF_bending_P, SF_contact: SF_contact_P,
                sigma_b: sigma_b_P, sigma_c, S_t: St_P, S_c: Sc_P, J: J_P },
      gear:   { SF_bending: SF_bending_G, SF_contact: SF_contact_G,
                sigma_b: sigma_b_G, sigma_c, S_t: St_G, S_c: Sc_G, J: J_G },
      SF_min, safe, verdict, verdictClass, notes
    };
  }

  // ===================================================================
  // SHAFT FATIGUE — Goodman / Soderberg (Shigley Ch. 7)
  // ===================================================================
  // Shaft material data (wrought carbon steel from Shigley Table A-20).
  const SHAFT_MATERIALS = Object.freeze({
    '1020_hr':    { label: 'AISI 1020 hot-rolled',     S_ut: 380, S_y: 210 },
    '1020_cd':    { label: 'AISI 1020 cold-drawn',     S_ut: 470, S_y: 390 },
    '1040_hr':    { label: 'AISI 1040 hot-rolled',     S_ut: 520, S_y: 290 },
    '1040_cd':    { label: 'AISI 1040 cold-drawn',     S_ut: 590, S_y: 490 },
    '1050_hr':    { label: 'AISI 1050 hot-rolled',     S_ut: 620, S_y: 340 },
    '1050_cd':    { label: 'AISI 1050 cold-drawn',     S_ut: 690, S_y: 580 },
    '4140_Q&T':   { label: 'AISI 4140 Q&T 425°C',      S_ut: 1020, S_y: 900 },
    '4340_Q&T':   { label: 'AISI 4340 Q&T 425°C',      S_ut: 1280, S_y: 1140 }
  });

  // Marin surface factor — Shigley Eq. 6-19, a*S_ut^b.
  const SURFACE_FACTORS = {
    'ground':      { a: 1.58,  b: -0.085 },
    'machined':    { a: 4.51,  b: -0.265 },
    'cold-drawn':  { a: 4.51,  b: -0.265 },
    'hot-rolled':  { a: 57.7,  b: -0.718 },
    'as-forged':   { a: 272,   b: -0.995 }
  };

  /**
   * Shaft fatigue analysis using Goodman / Soderberg criteria.
   *
   * Given mean and alternating stresses (computed from bending moment + torque amplitudes),
   * applies Marin modifying factors to estimate the endurance limit and returns factors of
   * safety per Goodman (common) and Soderberg (conservative).
   *
   * @param {object} p
   * @param {string} p.material       Key into SHAFT_MATERIALS.
   * @param {number} p.diameter       Shaft diameter in mm.
   * @param {number} p.M_a            Alternating bending moment amplitude in N·m.
   * @param {number} p.M_m            Mean bending moment in N·m (often 0 for rotating-bending).
   * @param {number} p.T_a            Alternating torque amplitude in N·m.
   * @param {number} p.T_m            Mean torque in N·m.
   * @param {number} [p.Kf=2.0]       Fatigue stress concentration for bending (≥1).
   * @param {number} [p.Kfs=1.5]      Fatigue stress concentration for torsion.
   * @param {string} [p.surface='machined']  Surface finish preset.
   * @param {number} [p.reliability=0.99]    Reliability (0.5–0.999999).
   * @param {number} [p.temperatureC=25]     Operating temperature in °C.
   * @returns {object}
   */
  function shaftFatigueAnalysis(p) {
    const mat = SHAFT_MATERIALS[p.material] || SHAFT_MATERIALS['1050_cd'];
    const d   = Math.max(5, Number(p.diameter) || 25);   // mm
    const M_a = Math.max(0, Number(p.M_a) || 0);          // N·m
    const M_m = Math.max(0, Number(p.M_m) || 0);
    const T_a = Math.max(0, Number(p.T_a) || 0);
    const T_m = Math.max(0, Number(p.T_m) || 0);
    const Kf  = Math.max(1, Number(p.Kf)  || 2.0);
    const Kfs = Math.max(1, Number(p.Kfs) || 1.5);
    const surfaceKey = p.surface || 'machined';
    const surf = SURFACE_FACTORS[surfaceKey] || SURFACE_FACTORS.machined;
    const R   = Math.max(0.5, Math.min(0.999999, Number(p.reliability) || 0.99));
    const T_C = Number(p.temperatureC) || 25;

    // Marin surface factor k_a = a * (S_ut[MPa])^b
    const k_a = surf.a * Math.pow(mat.S_ut, surf.b);
    // Size factor k_b — Shigley Eq. 6-20 (rotating bending, 2.79 ≤ d ≤ 51 mm)
    let k_b;
    if (d <= 51)  k_b = 1.24 * Math.pow(d, -0.107);
    else if (d <= 254) k_b = 1.51 * Math.pow(d, -0.157);
    else k_b = 0.60;
    // Loading factor k_c = 1 for combined bending + torsion (we handle each via Kf/Kfs)
    const k_c = 1.0;
    // Temperature factor k_d — Eq. 6-27
    const k_d = (T_C <= 70) ? 1.0 : (0.975 + 0.432e-3*T_C - 0.115e-5*T_C*T_C + 0.104e-8*T_C*T_C*T_C);
    // Reliability factor k_e — Shigley Table 6-5 (z_a from normal distribution)
    const z_a = (R === 0.99 ? 2.326 : R === 0.999 ? 3.091 : R === 0.95 ? 1.645 : R === 0.90 ? 1.288 : 2.326);
    const k_e = 1 - 0.08 * z_a;
    // Miscellaneous k_f = 1 for this scope
    const k_f = 1.0;
    // Uncorrected endurance limit S_e' — Shigley Eq. 6-10
    const S_e_prime = (mat.S_ut <= 1400) ? 0.5 * mat.S_ut : 700;
    // Corrected endurance limit
    const S_e = k_a * k_b * k_c * k_d * k_e * k_f * S_e_prime;

    // Stresses — bending σ_a/σ_m (Kf applied), torsion τ_a/τ_m (Kfs applied)
    // σ = 32·M / (π·d^3)   [M in N·mm, d in mm → MPa]
    // τ = 16·T / (π·d^3)
    const d_m = d;  // mm
    const sigma_a = (32 * M_a * 1000) / (Math.PI * Math.pow(d_m, 3));
    const sigma_m = (32 * M_m * 1000) / (Math.PI * Math.pow(d_m, 3));
    const tau_a   = (16 * T_a * 1000) / (Math.PI * Math.pow(d_m, 3));
    const tau_m   = (16 * T_m * 1000) / (Math.PI * Math.pow(d_m, 3));

    // Von Mises effective stresses (amplitude + mean) with fatigue concentrations
    const sigma_prime_a = Math.sqrt(Math.pow(Kf  * sigma_a, 2) + 3 * Math.pow(Kfs * tau_a, 2));
    const sigma_prime_m = Math.sqrt(Math.pow(Kf  * sigma_m, 2) + 3 * Math.pow(Kfs * tau_m, 2));

    // Goodman: 1/n = σ_a'/S_e + σ_m'/S_ut
    const goodmanInv = (sigma_prime_a / S_e) + (sigma_prime_m / mat.S_ut);
    const n_Goodman  = goodmanInv > 0 ? 1 / goodmanInv : Infinity;

    // Soderberg: 1/n = σ_a'/S_e + σ_m'/S_y (conservative — yields instead of UTS)
    const soderbergInv = (sigma_prime_a / S_e) + (sigma_prime_m / mat.S_y);
    const n_Soderberg  = soderbergInv > 0 ? 1 / soderbergInv : Infinity;

    // First-cycle yield check — static
    const sigma_max = sigma_prime_a + sigma_prime_m;
    const n_yield = mat.S_y / sigma_max;

    // Verdict
    const n_fatigue = Math.min(n_Goodman, n_Soderberg);
    let verdict, verdictClass;
    if (n_fatigue >= 2.0 && n_yield >= 2.0)      { verdict = 'SAFE (margin ≥ 2)'; verdictClass = 'pass'; }
    else if (n_fatigue >= 1.5 && n_yield >= 1.5) { verdict = 'SAFE (industry typical)'; verdictClass = 'pass'; }
    else if (n_fatigue >= 1.0 && n_yield >= 1.0) { verdict = 'MARGINAL — factor below 1.5'; verdictClass = 'warn'; }
    else                                          { verdict = 'UNSAFE — factor < 1.0'; verdictClass = 'fail'; }
    const notes = [];
    if (n_yield < n_fatigue) notes.push('First-cycle yield governs — increase diameter or use higher-strength material.');
    if (sigma_prime_m > sigma_prime_a) notes.push('Mean stress dominant — consider rotating-bending to convert static to fully-reversed.');
    if (n_Goodman > n_Soderberg + 0.3) notes.push('Soderberg (conservative) significantly lower — review if proof strength, not UTS, is the correct allowable.');

    return {
      inputs: { material: p.material || '1050_cd', material_label: mat.label, d, S_ut: mat.S_ut, S_y: mat.S_y,
                M_a, M_m, T_a, T_m, Kf, Kfs, surfaceKey, reliability: R, temperatureC: T_C },
      marin: { k_a, k_b, k_c, k_d, k_e, k_f, S_e_prime, S_e },
      stresses: { sigma_a, sigma_m, tau_a, tau_m, sigma_prime_a, sigma_prime_m, sigma_max },
      n_Goodman, n_Soderberg, n_yield,
      verdict, verdictClass, notes
    };
  }

  // ===================================================================
  // ROLLING-ELEMENT BEARING LIFE — ISO 281 / Shigley Ch. 11
  // ===================================================================
  // L_10 = (C / P)^a × 10^6 rev
  //   a = 3 for ball bearings, 10/3 for roller bearings.
  //   C = basic dynamic load rating (N), bearing-specific.
  //   P = equivalent dynamic load (N), P = X·F_r + Y·F_a for combined loading.
  // L_h = L_10 / (60 × N)  in hours at N rpm.
  //
  // Reference dynamic load ratings C (N) for deep-groove ball bearings (SKF catalogue).
  const BEARING_CATALOGUE = Object.freeze({
    '608':  { type: 'ball', d: 8,  D: 22, B: 7,  C: 3.45e3 },
    '625':  { type: 'ball', d: 5,  D: 16, B: 5,  C: 1.85e3 },
    '6200': { type: 'ball', d: 10, D: 30, B: 9,  C: 5.4e3 },
    '6201': { type: 'ball', d: 12, D: 32, B: 10, C: 6.89e3 },
    '6202': { type: 'ball', d: 15, D: 35, B: 11, C: 7.8e3 },
    '6203': { type: 'ball', d: 17, D: 40, B: 12, C: 9.56e3 },
    '6204': { type: 'ball', d: 20, D: 47, B: 14, C: 13.5e3 },
    '6205': { type: 'ball', d: 25, D: 52, B: 15, C: 14.0e3 },
    '6206': { type: 'ball', d: 30, D: 62, B: 16, C: 19.5e3 },
    '6300': { type: 'ball', d: 10, D: 35, B: 11, C: 8.06e3 },
    '6302': { type: 'ball', d: 15, D: 42, B: 13, C: 11.9e3 },
    '6304': { type: 'ball', d: 20, D: 52, B: 15, C: 15.9e3 },
    'NJ204':{ type: 'roller', d: 20, D: 47, B: 14, C: 25.1e3 },
    'NJ206':{ type: 'roller', d: 30, D: 62, B: 16, C: 44e3 }
  });

  /**
   * Rolling-element bearing L10 life analysis.
   *
   * Supports two input modes:
   *   (a) Designation ("6204") — looks up C from catalogue.
   *   (b) Explicit C override (N).
   *
   * Applies X/Y factors per ISO 281 to compute equivalent dynamic load P from radial F_r
   * and axial F_a forces. Falls back to pure-radial (P = F_r) if F_a not given.
   *
   * @param {object} p
   * @param {string} [p.designation]  Bearing code, e.g. '6204'.
   * @param {number} [p.C]            Basic dynamic load rating override in N.
   * @param {'ball'|'roller'} [p.type] Exponent selector (default 'ball').
   * @param {number} p.radialLoad     F_r in N.
   * @param {number} [p.axialLoad=0]  F_a in N.
   * @param {number} p.rpm            Rotational speed N (rev/min).
   * @param {number} [p.X=1]          Radial factor (0.56 for F_a/F_r > e; use default for pure radial).
   * @param {number} [p.Y=0]          Thrust factor.
   * @param {number} [p.reliability=0.90] Life adjustment reliability (0.90 ≡ L10).
   * @returns {object}
   */
  function bearingLifeAnalysis(p) {
    const catalog = p.designation ? BEARING_CATALOGUE[String(p.designation)] : null;
    const type = (p.type || (catalog && catalog.type) || 'ball');
    const a = type === 'roller' ? 10/3 : 3;
    const C = Number(p.C) || (catalog ? catalog.C : 0);
    const F_r = Math.max(0, Number(p.radialLoad) || 0);
    const F_a = Math.max(0, Number(p.axialLoad) || 0);
    const rpm = Math.max(1, Number(p.rpm) || 1);
    const X = Number.isFinite(p.X) ? p.X : (F_a > 0 ? 0.56 : 1);
    const Y = Number.isFinite(p.Y) ? p.Y : (F_a > 0 ? 1.2  : 0);
    const R = Math.max(0.5, Math.min(0.999, Number(p.reliability) || 0.9));

    if (!C || C <= 0) {
      return {
        inputs: { designation: p.designation, type, C: 0, F_r, F_a, rpm },
        error: 'Missing or invalid dynamic load rating C — provide p.C in N or a recognised p.designation.',
        verdict: 'INPUT ERROR', verdictClass: 'fail'
      };
    }

    // Equivalent dynamic load P (N)
    const P = X * F_r + Y * F_a;
    // L10 life (millions of revolutions)
    const L10_rev = Math.pow(C / Math.max(1, P), a);   // in 10^6 rev
    // Convert to hours at rpm
    const L10_h = (L10_rev * 1e6) / (60 * rpm);
    // Life adjustment for reliability — Shigley Eq 11-12 (Weibull): L_R = L10 × (ln(1/R) / ln(1/0.9))^(1/1.483)
    const a_R = Math.pow(Math.log(1/R) / Math.log(1/0.9), 1/1.483);
    const L_R_rev = L10_rev * a_R;
    const L_R_h   = L10_h   * a_R;

    // Verdict benchmarks (hours):
    //   • < 5 000 h  → short life
    //   • 5 000–20 000 h → typical industrial
    //   • > 20 000 h → long life
    let verdict, verdictClass;
    if (L_R_h >= 20000)       { verdict = 'LONG LIFE (> 20,000 h)';          verdictClass = 'pass'; }
    else if (L_R_h >= 5000)   { verdict = 'TYPICAL INDUSTRIAL (5k–20k h)';   verdictClass = 'pass'; }
    else if (L_R_h >= 1000)   { verdict = 'SHORT LIFE (< 5,000 h) — review'; verdictClass = 'warn'; }
    else                       { verdict = 'VERY SHORT LIFE — resize bearing up'; verdictClass = 'fail'; }
    const notes = [];
    if (F_a > F_r && Y === 0) notes.push('Axial load ignored — explicit X/Y factors needed for thrust-dominated duty.');
    if (P > C * 0.5) notes.push('Load exceeds 50% of C — consider a larger bearing to extend life dramatically.');

    return {
      inputs: { designation: p.designation, type, a, C, F_r, F_a, rpm, X, Y, reliability: R, catalog },
      P,
      L10_rev, L10_h,
      L_R_rev, L_R_h, a_R,
      verdict, verdictClass, notes
    };
  }

  // ===================================================================
  // FILLET WELD — AWS D1.1 / Shigley Ch. 9 throat-stress analysis
  // ===================================================================
  // Throat thickness t = 0.707 · h   (for 45° equal-leg fillet).
  // Direct throat stress:     τ = F / (t · L)  for load perpendicular to weld line
  // Shear + bending:          combined per load case; here we expose two modes:
  //   'transverse' (load pulls perpendicular to weld):
  //       σ = F / (0.707 · h · L)   with a 1/√2 conversion for nominal direct stress
  //   'longitudinal' (load parallel to weld — pure shear):
  //       τ = F / (0.707 · h · L)
  // Allowable = 0.30 · S_ut_electrode (AWS D1.1 static).
  // For cyclic loading: fatigue factor ~0.5 of static allowable (conservative).
  //
  // Reference electrode ultimate tensile strengths (MPa, converted from AWS E-class ksi):
  const WELD_ELECTRODES = Object.freeze({
    'E60':  { S_ut: 414, label: 'E60 (60 ksi UTS)',  standardClass: 'AWS D1.1 Table 2.5' },
    'E70':  { S_ut: 482, label: 'E70 (70 ksi UTS — most common)', standardClass: 'AWS D1.1 Table 2.5' },
    'E80':  { S_ut: 552, label: 'E80 (80 ksi UTS)',  standardClass: 'AWS D1.1 Table 2.5' },
    'E90':  { S_ut: 620, label: 'E90 (90 ksi UTS)',  standardClass: 'AWS D1.1 Table 2.5' },
    'E100': { S_ut: 689, label: 'E100 (100 ksi UTS)', standardClass: 'AWS D1.1 Table 2.5' },
    'E110': { S_ut: 758, label: 'E110 (110 ksi UTS)', standardClass: 'AWS D1.1 Table 2.5' }
  });

  /**
   * Fillet weld throat-stress analysis (AWS D1.1 static + optional cyclic derating).
   *
   * @param {object} p
   * @param {number} p.legSize          h — fillet leg size in mm.
   * @param {number} p.length           L — total weld length in mm (sum of all fillet segments carrying load).
   * @param {number} p.force            F — applied load in N.
   * @param {'transverse'|'longitudinal'|'combined'} [p.loadDirection='transverse'] — Direction relative to weld line.
   * @param {string} [p.electrode='E70'] — AWS electrode class (E60/E70/E80/E90/E100/E110).
   * @param {boolean} [p.cyclic=false]  — Apply 0.5× fatigue derate to the allowable.
   * @param {number} [p.safetyFactor=1.0] — Additional user-specified SF on top of allowable.
   * @returns {object}
   */
  function filletWeldAnalysis(p) {
    const h = Math.max(1, Number(p.legSize) || 0);
    const L = Math.max(1, Number(p.length) || 0);
    const F = Math.max(0, Number(p.force) || 0);
    const direction = (p.loadDirection || 'transverse').toLowerCase();
    const elecKey = p.electrode || 'E70';
    const elec = WELD_ELECTRODES[elecKey] || WELD_ELECTRODES.E70;
    const cyclic = !!p.cyclic;
    const sf = Math.max(1, Number(p.safetyFactor) || 1.0);

    // Throat area (mm²)
    const t = 0.707 * h;
    const A = t * L;
    // Throat stress (MPa = N/mm²). For combined, use resultant of longitudinal shear + transverse bending.
    // For this v1 treat 'transverse' and 'longitudinal' identically (same throat area);
    // the nominal allowable per AWS is direction-independent for static design.
    const tau = A > 0 ? F / A : 0;

    // Allowable strength — AWS D1.1 static allowable is 0.30 × S_ut_electrode for fillet welds in shear.
    let allowable = 0.30 * elec.S_ut;
    if (cyclic) allowable *= 0.5;  // fatigue derate (generic conservative)

    const capacity = allowable * A;       // N
    const utilisation = tau / allowable;  // 0..1 ideally
    const safetyFactor = allowable / (tau * sf);

    let verdict, verdictClass;
    if (safetyFactor >= 2.0)      { verdict = 'SAFE (margin ≥ 2)';                  verdictClass = 'pass'; }
    else if (safetyFactor >= 1.5) { verdict = 'SAFE (industry typical — margin ≥ 1.5)'; verdictClass = 'pass'; }
    else if (safetyFactor >= 1.0) { verdict = 'MARGINAL (margin < 1.5)';            verdictClass = 'warn'; }
    else                           { verdict = 'UNSAFE (weld will fail at design load)'; verdictClass = 'fail'; }
    const notes = [];
    if (cyclic) notes.push('Cyclic/fatigue derate applied — allowable reduced to 0.15 × S_ut (50% of static).');
    if (direction === 'combined') notes.push('Combined direction treated as the more conservative of transverse/longitudinal for v1.');
    if (utilisation > 0.9) notes.push('Utilisation > 90% — consider increasing leg size (h) to restore margin quickly; strength scales linearly with h.');

    return {
      inputs: { h, L, F, direction, electrode: elecKey, electrode_label: elec.label, S_ut_electrode: elec.S_ut,
                cyclic, safetyFactor_user: sf },
      throat: { t, A },
      stress: { tau },
      allowable,
      capacity,
      utilisation,
      safetyFactor,
      verdict, verdictClass, notes
    };
  }

  // ===================================================================
  // UNIT TESTS — verify core against MecAgent screenshot values
  // ===================================================================
  function runSelfTests() {
    const results = [];
    function test(name, actual, expected, tol) {
      const pass = Math.abs(actual - expected) <= tol;
      results.push({ name, actual, expected, pass });
      return pass;
    }

    // MecAgent problem: 4 × M12 (10.9), F_Q=18kN, F_A=18kN, M=420Nm, μ=0.16, F_V=39kN/bolt, BCD=96mm, K_s=1.5
    const r = boltedJointAnalysis({
      boltCount: 4, grade: '10.9', thread: 'M12',
      preload: 39000, shearForce: 18000, axialForce: 18000, moment: 420000,
      bcd: 96, friction: 0.16, safetyFactor: 1.5
    });

    // Expected values from MecAgent screenshots:
    test('F_friction',       r.slipResistance.F_friction,           24960,  1);    // 4·39000·0.16
    test('F_moment/bolt',    r.slipResistance.F_moment_tangential_per_bolt, 2187.5, 0.5); // 420000/(4·48)
    test('F_bolt_max_tang',  r.slipResistance.F_bolt_tangential_max, 6687.5, 0.5); // 18000/4 + 2187.5
    test('F_bolt_total',     r.tensionCheck.F_bolt_total,            45687.5, 1);   // 39000 + 4500 + 2187.5
    test('σ (tensile)',      r.combinedStress.sigma,                 542,    1);    // 45687.5/84.3
    test('τ (shear)',        r.combinedStress.tau,                   79,     1.5);  // 6687.5/84.3 ≈ 79.3
    test('σ_vm',             r.combinedStress.sigma_vm,              558,    2);    // √(542² + 3·79²)

    // ------- GEAR TEST — Shigley Example 14-5 adapted -------
    // 17T pinion / 52T gear, m=2mm, F=30mm, 2.5kW @ 1800rpm → T_P ≈ 13.26 N·m
    // Through-hardened 240 HB both gears, K_o=1, K_v=1, K_m=1.3
    const g = spurGearAnalysis({
      pinionTeeth: 17, gearTeeth: 52, module: 2, faceWidth: 30,
      torque: 13.26, pinionHB: 240, gearHB: 240,
      overload: 1, dynamic: 1, loadDist: 1.3
    });
    // Tangential load W_t = 2·T / d_P = 2·13260 / 34 ≈ 780 N
    test('gear W_t',               g.inputs.W_t,          780,   3);
    // J for 17 teeth ≈ 0.295 per interpolation table
    test('gear J (pinion)',        g.pinion.J,            0.295, 0.01);
    // σ_b (pinion) = 780·1·1·1.3 / (30·2·0.295) = 1014/17.7 ≈ 57.3 MPa
    test('gear σ_b pinion',        g.pinion.sigma_b,      57.3,  1.5);
    // S_t @240HB = (77·240 + 12800)·psi→MPa = 31280·0.00689 ≈ 215.7 MPa
    test('gear S_t @240HB',        g.pinion.S_t,          215.7, 1.5);
    // SF_bending_P ≈ 215.7 / 57.3 ≈ 3.77
    test('gear SF_bending pinion', g.pinion.SF_bending,   3.77,  0.2);

    // ------- SHAFT TEST — clean case with rotating-bending + constant torque -------
    // AISI 1050 CD, d=25mm, M_a=100 N·m (rotating bending so M_m=0), T_m=50 N·m, T_a=0
    // Kf=2.0 (fillet), Kfs=1.5, machined surface, R=0.99, T=25°C
    const sh = shaftFatigueAnalysis({
      material: '1050_cd', diameter: 25,
      M_a: 100, M_m: 0, T_a: 0, T_m: 50,
      Kf: 2.0, Kfs: 1.5, surface: 'machined', reliability: 0.99, temperatureC: 25
    });
    // σ_a = 32·100000 / (π·25³) = 32e5 / 49087 ≈ 65.2 MPa
    test('shaft σ_a',              sh.stresses.sigma_a,      65.2,  0.5);
    // τ_m = 16·50000 / (π·25³) ≈ 16.3 MPa
    test('shaft τ_m',              sh.stresses.tau_m,        16.3,  0.3);
    // σ_prime_a with Kf·σ_a only (no mean bending, no alternating torque) ≈ Kf·σ_a = 130.4
    test('shaft σ′_a',             sh.stresses.sigma_prime_a, 130.4, 1.0);
    // σ_prime_m = √3 · Kfs · τ_m ≈ √3 · 1.5 · 16.3 ≈ 42.4
    test('shaft σ′_m',             sh.stresses.sigma_prime_m, 42.4,  1.0);
    // Must be finite + positive
    test('shaft n_Goodman finite', Number.isFinite(sh.n_Goodman) && sh.n_Goodman > 0 ? 1 : 0, 1, 0);
    test('shaft n_Soderberg ≤ Goodman', (sh.n_Soderberg <= sh.n_Goodman + 1e-6) ? 1 : 0, 1, 0);

    // ------- BEARING TEST — 6204 @ 1800 rpm, 4 kN radial -------
    // C = 13500 N, P = F_r = 4000 N, a = 3
    // L10 = (13500/4000)^3 = 38.44 × 10^6 rev
    // L10_h = 38.44e6 / (60·1800) = 355.9 hours
    const b = bearingLifeAnalysis({
      designation: '6204', radialLoad: 4000, rpm: 1800
    });
    test('bearing C from catalog',    b.inputs.C,       13500, 10);
    test('bearing exponent a',        b.inputs.a,       3,     0);
    test('bearing L10 (rev × 10^6)',  b.L10_rev,        38.44, 0.5);
    test('bearing L10 (hours)',       b.L10_h,          355.9, 2);
    test('bearing R90 ≡ L10',         b.a_R,            1.0,   0.01);

    // ------- WELD TEST — E70 fillet, h=6mm, L=120mm, 40 kN transverse -------
    // A = 0.707·6·120 = 509.0 mm²
    // τ = 40000 / 509.0 = 78.6 MPa
    // allowable static = 0.30 × 482 = 144.6 MPa
    // SF = 144.6 / 78.6 = 1.84
    const w = filletWeldAnalysis({
      legSize: 6, length: 120, force: 40000,
      loadDirection: 'transverse', electrode: 'E70'
    });
    test('weld throat area',     w.throat.A,       509.04, 0.5);
    test('weld τ',               w.stress.tau,     78.58,  0.5);
    test('weld allowable E70',   w.allowable,      144.6,  0.5);
    test('weld SF',              w.safetyFactor,   1.84,   0.1);
    // Cyclic derate case — same loading, cyclic enabled → SF halves
    const wc = filletWeldAnalysis({
      legSize: 6, length: 120, force: 40000,
      loadDirection: 'transverse', electrode: 'E70', cyclic: true
    });
    test('weld cyclic SF ≈ 0.92', wc.safetyFactor,  0.92,   0.05);

    return { results, allPass: results.every(r => r.pass) };
  }

  // ===================================================================
  // NATURAL-LANGUAGE PARSER — extract structured params from a free-text prompt
  // ===================================================================
  function parseBoltedJointPrompt(prompt) {
    const p = (prompt || '').toLowerCase();
    const res = {};

    // Bolt count: "4 x m12 bolts", "four bolts", "z=4"
    const wordNums = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, ten:10, twelve:12 };
    const mCount = p.match(/\b(\d+)\s*[x×]?\s*(?:m\d+\s+)?bolts?\b/) ||
                   p.match(/\bz\s*=\s*(\d+)\b/) ||
                   p.match(/\b(one|two|three|four|five|six|seven|eight|ten|twelve)\s*bolts?\b/);
    if (mCount) res.boltCount = wordNums[mCount[1]] || parseInt(mCount[1]);

    // Thread: "M12", "m8"
    const mThread = p.match(/\bm\s*(\d+(?:\.\d+)?)\b/i);
    if (mThread) {
      const sz = parseFloat(mThread[1]);
      const key = 'M' + (Number.isInteger(sz) ? sz : sz.toString().replace('.', '_'));
      if (BOLT_STRESS_AREA[key]) res.thread = key;
    }

    // Grade: "10.9", "class 8.8", "property class 10.9"
    const mGrade = p.match(/\b(?:class|grade|property\s*class)\s*(\d+\.\d+)\b/i) ||
                   p.match(/\b(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|10\.9|12\.9)\b/);
    if (mGrade) res.grade = mGrade[1];

    // Forces — support kN and N units
    const numUnit = (m) => {
      if (!m) return null;
      const val = parseFloat(m[1]);
      const unit = (m[2] || '').toLowerCase();
      if (unit.startsWith('kn')) return val * 1000;
      return val;
    };
    const mShear = p.match(/(?:shear|transverse|shearing)\s*(?:force|load)?[^\d-]{0,12}(\d+(?:\.\d+)?)\s*(kn|n)\b/i);
    if (mShear) res.shearForce = numUnit(mShear);
    const mAxial = p.match(/(?:axial|separating|tensile)\s*(?:force|load)?[^\d-]{0,12}(\d+(?:\.\d+)?)\s*(kn|n)\b/i);
    if (mAxial) res.axialForce = numUnit(mAxial);

    // Moment (N·m or kN·m → convert to N·mm)
    const mMoment = p.match(/(?:in.plane\s*)?moment[^\d-]{0,12}(\d+(?:\.\d+)?)\s*(nm|knm|kn\s*m|n\s*m)\b/i);
    if (mMoment) {
      const val = parseFloat(mMoment[1]);
      const unit = mMoment[2].toLowerCase().replace(/\s/g, '');
      res.moment = unit.startsWith('kn') ? val * 1e6 : val * 1000;
    }

    // Preload
    const mPre = p.match(/pre[-\s]?load(?:\s*per\s*bolt)?[^\d-]{0,12}(\d+(?:\.\d+)?)\s*(kn|n)\b/i);
    if (mPre) res.preload = numUnit(mPre);

    // BCD
    const mBcd = p.match(/(?:bcd|bolt\s*circle[^\d]*?diameter|bolt\s*circle)[^\d-]{0,12}(\d+(?:\.\d+)?)\s*mm/i);
    if (mBcd) res.bcd = parseFloat(mBcd[1]);

    // Friction
    const mFric = p.match(/(?:friction\s*(?:coefficient)?|[μu])[^\d-]{0,8}(\d*\.\d+)/i);
    if (mFric) res.friction = parseFloat(mFric[1]);

    // Safety factor — allow common phrasings like "safety factor against slipping: 1.5"
    const mSf = p.match(/(?:safety\s*factor|k\s*_?\s*s|\bks\b)\s*(?:against\s+\w+)?\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (mSf) res.safetyFactor = parseFloat(mSf[1]);

    return res;
  }

  // ===================================================================
  // LaTeX / KaTeX integration — load on demand so it doesn't bloat initial page
  // ===================================================================
  let _katexLoading = null;
  async function loadKaTeX() {
    if (typeof window.katex !== 'undefined') return window.katex;
    if (_katexLoading) return _katexLoading;
    _katexLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js';
      s.onload = () => resolve(window.katex);
      s.onerror = () => reject(new Error('KaTeX failed to load from CDN'));
      document.head.appendChild(s);
    });
    return _katexLoading;
  }

  function renderMath(el, latex, displayMode) {
    el.textContent = latex;  // fallback while KaTeX loads / if it fails
    loadKaTeX().then(k => {
      try { k.render(latex, el, { displayMode: !!displayMode, throwOnError: false, strict: 'ignore' }); }
      catch(e) { el.textContent = latex; }
    }).catch(() => {});
  }

  // ===================================================================
  // UI — form-based input with tab switcher (bolted-joint / gears / shafts / bearings / welds)
  // ===================================================================
  const S = { lastResult: null, els: {}, currentTab: 'bolt' };

  // Field schemas per analysis kind. Shape: [key, label, unit, default, min, type?, opts?]
  const FIELDS_BOLT = [
    ['boltCount',       'Bolt count (z)',              '',     4,     1],
    ['thread',          'Thread',                       '',     'M12', null, 'select', Object.keys(BOLT_STRESS_AREA)],
    ['grade',           'Grade (ISO 898-1)',            '',     '8.8', null, 'select', Object.keys(STEEL_GRADES)],
    ['preload',         'Preload per bolt (F_V)',       'N',    25000, 0],
    ['shearForce',      'Shear force (F_Q)',            'N',    10000, 0],
    ['axialForce',      'Axial/separating force (F_A)', 'N',    5000,  0],
    ['moment',          'In-plane moment (M)',          'N·mm', 100000,0],
    ['bcd',             'Bolt-circle diameter (BCD)',   'mm',   80,    0],
    ['friction',        'Friction coefficient (μ)',     '',     0.15,  0.01],
    ['safetyFactor',    'Slip safety factor (K_s)',     '',     1.5,   1],
    ['frictionInterfaces','Friction interfaces (n)',    '',     1,     1]
  ];
  const FIELDS_GEAR = [
    ['pinionTeeth',  'Pinion teeth z_P',         '',     20,   12],
    ['gearTeeth',    'Gear teeth z_G',           '',     40,   12],
    ['module',       'Module m',                  'mm',   2,    0.5],
    ['faceWidth',    'Face width F',              'mm',   25,   3],
    ['torque',       'Pinion torque T_P',         'N·m',  10,   0],
    ['pinionHB',     'Pinion hardness',           'HB',   240,  150],
    ['gearHB',       'Gear hardness',             'HB',   240,  150],
    ['overload',     'Overload K_o',              '',     1.0,  1],
    ['dynamic',      'Dynamic K_v',               '',     1.1,  1],
    ['loadDist',     'Load distribution K_m',     '',     1.3,  1],
    ['reliability',  'Reliability K_R',           '',     1.0,  1],
    ['pressureAngle','Pressure angle φ',          '°',    20,   0]
  ];
  const FIELDS_SHAFT = [
    ['material',     'Material',                  '',     '1050_cd', null, 'select', Object.keys(SHAFT_MATERIALS)],
    ['diameter',     'Diameter d',                'mm',   25,   5],
    ['M_a',          'Alt. bending moment M_a',   'N·m',  100,  0],
    ['M_m',          'Mean bending moment M_m',   'N·m',  0,    0],
    ['T_a',          'Alt. torque T_a',           'N·m',  0,    0],
    ['T_m',          'Mean torque T_m',           'N·m',  50,   0],
    ['Kf',           'Fatigue K_f (bending)',     '',     2.0,  1],
    ['Kfs',          'Fatigue K_fs (torsion)',    '',     1.5,  1],
    ['surface',      'Surface finish',            '',     'machined', null, 'select', Object.keys(SURFACE_FACTORS)],
    ['reliability',  'Reliability R',             '',     0.99, 0.5],
    ['temperatureC', 'Temperature',               '°C',   25,   -50]
  ];
  const FIELDS_BEARING = [
    ['designation',  'Designation',               '',     '6204', null, 'select', Object.keys(BEARING_CATALOGUE)],
    ['radialLoad',   'Radial load F_r',           'N',    4000, 0],
    ['axialLoad',    'Axial load F_a',            'N',    0,    0],
    ['rpm',          'Speed',                      'rpm',  1800, 1],
    ['X',            'Radial factor X',           '',     1,    0],
    ['Y',            'Thrust factor Y',           '',     0,    0],
    ['reliability',  'Reliability',                '',     0.9,  0.5]
  ];
  const FIELDS_WELD = [
    ['legSize',       'Leg size h',                'mm',   6,    1],
    ['length',        'Weld length L',             'mm',   120,  1],
    ['force',         'Applied load F',            'N',    40000,0],
    ['loadDirection', 'Direction',                 '',     'transverse', null, 'select', ['transverse','longitudinal','combined']],
    ['electrode',     'Electrode',                 '',     'E70', null, 'select', Object.keys(WELD_ELECTRODES)],
    ['cyclic',        'Cyclic? (1 = yes)',         '',     0,    0],
    ['safetyFactor',  'User SF multiplier',        '',     1.0,  1]
  ];

  const PRESETS_BOLT = [
    { label: 'MecAgent demo',  values: { boltCount:4, thread:'M12', grade:'10.9', preload:39000, shearForce:18000, axialForce:18000, moment:420000, bcd:96, friction:0.16, safetyFactor:1.5 } },
    { label: 'Flange M8 light', values: { boltCount:8, thread:'M8', grade:'8.8', preload:15000, shearForce:5000, axialForce:2000, moment:50000, bcd:60, friction:0.15, safetyFactor:1.25 } },
    { label: 'Heavy M20',      values: { boltCount:6, thread:'M20', grade:'8.8', preload:120000, shearForce:30000, axialForce:25000, moment:800000, bcd:200, friction:0.14, safetyFactor:1.5 } }
  ];
  const PRESETS_GEAR = [
    { label: 'Shigley Ex 14-5', values: { pinionTeeth:17, gearTeeth:52, module:2, faceWidth:30, torque:13.26, pinionHB:240, gearHB:240, overload:1, dynamic:1, loadDist:1.3 } },
    { label: 'Light duty',      values: { pinionTeeth:25, gearTeeth:75, module:1.5, faceWidth:18, torque:5, pinionHB:220, gearHB:220 } },
    { label: 'Heavy industrial',values: { pinionTeeth:20, gearTeeth:60, module:5, faceWidth:50, torque:250, pinionHB:320, gearHB:310, overload:1.25, loadDist:1.4 } }
  ];
  const PRESETS_SHAFT = [
    { label: 'Rotating-bending', values: { material:'1050_cd', diameter:25, M_a:100, M_m:0, T_a:0, T_m:50, Kf:2, Kfs:1.5, surface:'machined' } },
    { label: 'Output shaft 4340',values: { material:'4340_Q&T', diameter:40, M_a:300, M_m:100, T_a:50, T_m:200, Kf:1.8, Kfs:1.3, surface:'ground' } }
  ];
  const PRESETS_BEARING = [
    { label: '6204 / 4kN',     values: { designation:'6204', radialLoad:4000, rpm:1800 } },
    { label: '6206 / 8kN',     values: { designation:'6206', radialLoad:8000, rpm:1500 } },
    { label: 'NJ204 roller',   values: { designation:'NJ204', radialLoad:10000, rpm:1200 } }
  ];
  const PRESETS_WELD = [
    { label: 'E70 6mm × 120mm', values: { legSize:6, length:120, force:40000, electrode:'E70', loadDirection:'transverse' } },
    { label: 'Heavy bracket',   values: { legSize:10, length:200, force:120000, electrode:'E80', loadDirection:'transverse' } },
    { label: 'Cyclic tie-down', values: { legSize:5, length:80, force:15000, electrode:'E70', loadDirection:'longitudinal', cyclic:1 } }
  ];

  const TABS = Object.freeze({
    bolt:    { label: 'Bolted Joint', subtitle: 'VDI 2230 / Shigley',                    fields: FIELDS_BOLT,    presets: PRESETS_BOLT,    analyze: boltedJointAnalysis, hasPrompt: true,  kind: 'bolt' },
    gear:    { label: 'Spur Gears',    subtitle: 'AGMA bending + pitting (Shigley Ch 14)', fields: FIELDS_GEAR,    presets: PRESETS_GEAR,    analyze: spurGearAnalysis,    hasPrompt: false, kind: 'gear' },
    shaft:   { label: 'Shaft Fatigue', subtitle: 'Goodman / Soderberg (Shigley Ch 7)',    fields: FIELDS_SHAFT,   presets: PRESETS_SHAFT,   analyze: shaftFatigueAnalysis,hasPrompt: false, kind: 'shaft' },
    bearing: { label: 'Bearing Life',  subtitle: 'L_10 (ISO 281) — Shigley Ch 11',        fields: FIELDS_BEARING, presets: PRESETS_BEARING, analyze: bearingLifeAnalysis, hasPrompt: false, kind: 'bearing' },
    weld:    { label: 'Fillet Welds',  subtitle: 'Throat stress (AWS D1.1)',              fields: FIELDS_WELD,    presets: PRESETS_WELD,    analyze: filletWeldAnalysis,  hasPrompt: false, kind: 'weld' }
  });

  function fmt(n, unit, digits) {
    if (!isFinite(n)) return '—';
    digits = digits ?? (Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
    const s = Number(n).toFixed(digits);
    return unit ? s + ' ' + unit : s;
  }

  function currentFields() { return (TABS[S.currentTab] || TABS.bolt).fields; }
  function currentAnalyze() { return (TABS[S.currentTab] || TABS.bolt).analyze; }

  function collectInputs() {
    const out = {};
    currentFields().forEach(([key,,,,, type]) => {
      const el = S.els['in_' + key];
      if (!el) return;
      if (type === 'select') {
        out[key] = el.value;
      } else {
        // Boolean fields encoded as 0/1 numeric — map back to boolean where the function expects it
        out[key] = parseFloat(el.value);
      }
    });
    // Weld's cyclic is encoded as 0/1 — convert to boolean
    if (S.currentTab === 'weld' && 'cyclic' in out) out.cyclic = !!out.cyclic;
    return out;
  }

  function compute() {
    try {
      const params = collectInputs();
      const analyze = currentAnalyze();
      const r = analyze(params);
      S.lastResult = r;
      if (S.currentTab === 'bolt') {
        renderReport(r);  // Full KaTeX-rich bolted-joint report
      } else {
        renderReportGeneric(r, S.currentTab);
      }
    } catch (e) {
      if (S.els.report) S.els.report.innerHTML = '<div class="aie-err">Error: ' + e.message + '</div>';
    }
  }

  /**
   * Generic result renderer for v2 tabs (gear / shaft / bearing / weld).
   * Outputs: verdict banner + key numbers table + notes list.
   * KaTeX-rendered formulas can be added per-tab in a future pass.
   * @param {object} r  Result object from the relevant analyze function.
   * @param {string} kind  Tab key — 'gear' | 'shaft' | 'bearing' | 'weld'.
   */
  function renderReportGeneric(r, kind) {
    const root = S.els.report;
    if (!root) return;
    root.innerHTML = '';
    if (r.error) {
      root.innerHTML = '<div class="aie-err" style="padding:10px;background:#7f1d1d;color:#fecaca;border-radius:6px;font-size:13px">' + r.error + '</div>';
      return;
    }

    // Verdict banner
    const vcls = r.verdictClass || 'pass';
    const bg = vcls === 'pass' ? '#065f46' : vcls === 'warn' ? '#78350f' : '#7f1d1d';
    const fg = vcls === 'pass' ? '#d1fae5' : vcls === 'warn' ? '#fed7aa' : '#fecaca';
    const banner = document.createElement('div');
    banner.style.cssText = 'padding:10px 14px;border-radius:6px;background:'+bg+';color:'+fg+';font-weight:600;font-size:14px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.08)';
    banner.textContent = 'Verdict: ' + r.verdict;
    root.appendChild(banner);

    // Notes
    if (r.notes && r.notes.length) {
      const ul = document.createElement('ul');
      ul.style.cssText = 'margin:4px 0 14px 18px;font-size:12px;color:#94a3b8';
      r.notes.forEach(n => { const li = document.createElement('li'); li.textContent = n; ul.appendChild(li); });
      root.appendChild(ul);
    }

    // Kind-specific body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;font-size:13px;color:#cbd5e1;line-height:1.8';

    if (kind === 'gear') {
      body.innerHTML =
        '<strong style="color:#f1f5f9">Geometry</strong><br>' +
        'Pitch Ø pinion: ' + fmt(r.inputs.d_P, 'mm') + ' · Pitch Ø gear: ' + fmt(r.inputs.d_G, 'mm') +
        ' · Ratio m_G: ' + fmt(r.inputs.mG) + '<br>' +
        'Tangential load W_t: ' + fmt(r.inputs.W_t, 'N') + '<br><br>' +
        '<strong style="color:#f1f5f9">Safety factors</strong><br>' +
        '<span style="color:#94a3b8">Pinion:</span> SF_bending = <strong>' + fmt(r.pinion.SF_bending) + '</strong> · SF_contact = <strong>' + fmt(r.pinion.SF_contact) + '</strong><br>' +
        '<span style="color:#94a3b8">Gear:</span>   SF_bending = <strong>' + fmt(r.gear.SF_bending)   + '</strong> · SF_contact = <strong>' + fmt(r.gear.SF_contact)   + '</strong><br>' +
        '<span style="color:#94a3b8">Overall min:</span> <strong style="color:' + (r.SF_min >= 1.5 ? '#a7f3d0' : r.SF_min >= 1.0 ? '#fed7aa' : '#fca5a5') + '">' + fmt(r.SF_min) + '</strong>';
    } else if (kind === 'shaft') {
      body.innerHTML =
        '<strong style="color:#f1f5f9">Stresses</strong><br>' +
        'σ_a = ' + fmt(r.stresses.sigma_a, 'MPa') + ' · σ_m = ' + fmt(r.stresses.sigma_m, 'MPa') +
        ' · τ_a = ' + fmt(r.stresses.tau_a, 'MPa') + ' · τ_m = ' + fmt(r.stresses.tau_m, 'MPa') + '<br>' +
        "σ'_a = " + fmt(r.stresses.sigma_prime_a, 'MPa') + " · σ'_m = " + fmt(r.stresses.sigma_prime_m, 'MPa') + '<br><br>' +
        '<strong style="color:#f1f5f9">Factors of safety</strong><br>' +
        'Goodman: <strong>' + fmt(r.n_Goodman) + '</strong> · Soderberg: <strong>' + fmt(r.n_Soderberg) + '</strong> · First-cycle yield: <strong>' + fmt(r.n_yield) + '</strong><br>' +
        'Endurance limit S_e (corrected): ' + fmt(r.marin.S_e, 'MPa') + ' (uncorrected ' + fmt(r.marin.S_e_prime, 'MPa') + ')';
    } else if (kind === 'bearing') {
      const cat = r.inputs.catalog;
      const tag = cat ? (r.inputs.designation + ' · Ø' + cat.d + '/' + cat.D + ' × ' + cat.B + 'mm · C = ' + fmt(cat.C/1000, 'kN')) : ('custom C = ' + fmt(r.inputs.C/1000, 'kN'));
      body.innerHTML =
        '<strong style="color:#f1f5f9">' + tag + '</strong><br>' +
        'Equivalent load P: ' + fmt(r.P, 'N') + ' · Exponent a = ' + fmt(r.inputs.a) + '<br><br>' +
        '<strong style="color:#f1f5f9">L_10 life</strong><br>' +
        fmt(r.L10_rev) + ' × 10⁶ revolutions<br>' +
        fmt(r.L10_h, 'hours') + ' at ' + r.inputs.rpm + ' rpm' + (r.inputs.reliability !== 0.9 ? ' (L₁₀)' : '') + '<br>' +
        (r.inputs.reliability !== 0.9 ?
          ('Adjusted to R = ' + r.inputs.reliability + ': ' + fmt(r.L_R_h, 'hours')) :
          '');
    } else if (kind === 'weld') {
      body.innerHTML =
        '<strong style="color:#f1f5f9">Throat geometry</strong><br>' +
        't = 0.707·h = ' + fmt(r.throat.t, 'mm') + ' · area A = ' + fmt(r.throat.A, 'mm²') + '<br><br>' +
        '<strong style="color:#f1f5f9">Stress</strong><br>' +
        'τ = F / A = ' + fmt(r.stress.tau, 'MPa') + '<br>' +
        'Allowable (' + r.inputs.electrode + ', ' + (r.inputs.cyclic ? 'cyclic' : 'static') + '): ' + fmt(r.allowable, 'MPa') + '<br>' +
        'Capacity: ' + fmt(r.capacity, 'N') + ' · Utilisation: ' + fmt(r.utilisation * 100, '%') + '<br>' +
        'Safety factor: <strong style="color:' + (r.safetyFactor >= 1.5 ? '#a7f3d0' : r.safetyFactor >= 1.0 ? '#fed7aa' : '#fca5a5') + '">' + fmt(r.safetyFactor) + '</strong>';
    }
    root.appendChild(body);

    // RAG citations — appears below the report once the embeddings are ready
    appendCitations(root, kind);
  }

  /**
   * Switch the UI to a different analysis tab. Rebuilds the form grid, preset buttons,
   * and report area in-place using the tab's schema.
   * @param {string} tabKey  One of 'bolt' | 'gear' | 'shaft' | 'bearing' | 'weld'.
   */
  function switchTab(tabKey) {
    if (!TABS[tabKey]) return;
    S.currentTab = tabKey;
    // Rebuild pill highlights
    if (S.els.tabBar) {
      Array.from(S.els.tabBar.children).forEach(pill => {
        const active = pill.dataset.tab === tabKey;
        pill.style.background = active ? '#38bdf8' : '#334155';
        pill.style.color = active ? '#0f172a' : '#cbd5e1';
        pill.style.fontWeight = active ? '700' : '500';
      });
    }
    // Show/hide NL prompt (bolt only)
    if (S.els.promptWrap) S.els.promptWrap.style.display = TABS[tabKey].hasPrompt ? 'flex' : 'none';
    // Update subtitle
    if (S.els.subtitle) S.els.subtitle.textContent = TABS[tabKey].label + ' — ' + TABS[tabKey].subtitle;
    // Rebuild form grid
    rebuildFormGrid();
    // Rebuild presets
    rebuildPresets();
    // Clear report
    if (S.els.report) S.els.report.innerHTML = '<div style="padding:14px 0;color:#64748b;font-size:12px;font-style:italic">Adjust inputs to see live analysis.</div>';
    // Compute once
    setTimeout(compute, 0);
  }

  function rebuildFormGrid() {
    const grid = S.els.grid;
    if (!grid) return;
    grid.innerHTML = '';
    // Clear stale input element refs (keep prompt, report, etc.)
    Object.keys(S.els).forEach(k => { if (k.startsWith('in_')) delete S.els[k]; });
    currentFields().forEach(field => {
      const [key, label, unit, def, min, type, opts] = field;
      const cell = document.createElement('label');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:2px;font-size:11px;color:#94a3b8';
      const lbl = document.createElement('span');
      lbl.innerHTML = label + (unit ? ' <span style="color:#64748b">['+unit+']</span>' : '');
      let input;
      if (type === 'select') {
        input = document.createElement('select');
        input.style.cssText = 'padding:5px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:3px;font-size:12px';
        opts.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; input.appendChild(o); });
        input.value = def;
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        if (min !== null) input.min = String(min);
        input.value = String(def);
        input.style.cssText = 'padding:5px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:3px;font-size:12px';
      }
      input.addEventListener('input', compute);
      input.addEventListener('change', compute);
      S.els['in_' + key] = input;
      cell.appendChild(lbl);
      cell.appendChild(input);
      grid.appendChild(cell);
    });
  }

  function rebuildPresets() {
    const presets = S.els.presets;
    if (!presets) return;
    presets.innerHTML = '';
    TABS[S.currentTab].presets.forEach(preset => {
      const b = document.createElement('button');
      b.textContent = preset.label;
      b.style.cssText = 'padding:4px 8px;background:#334155;color:#cbd5e1;border:0;border-radius:3px;cursor:pointer;font-size:11px';
      b.onclick = () => {
        Object.entries(preset.values).forEach(([k, v]) => { const el = S.els['in_' + k]; if (el) el.value = String(v); });
        compute();
      };
      presets.appendChild(b);
    });
  }

  function renderReport(r) {
    const root = S.els.report;
    if (!root) return;
    root.innerHTML = '';

    // Verdict banner
    const verdictBg = r.verdictClass === 'pass' ? '#065f46' : r.verdictClass === 'warn' ? '#78350f' : '#7f1d1d';
    const verdictFg = r.verdictClass === 'pass' ? '#d1fae5' : r.verdictClass === 'warn' ? '#fed7aa' : '#fecaca';
    const banner = document.createElement('div');
    banner.className = 'aie-verdict';
    banner.style.cssText = 'padding:10px 14px;border-radius:6px;background:'+verdictBg+';color:'+verdictFg+';font-weight:600;font-size:14px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.08)';
    banner.textContent = 'Verdict: ' + r.verdict;
    root.appendChild(banner);
    if (r.notes?.length) {
      const notes = document.createElement('ul');
      notes.style.cssText = 'margin:4px 0 14px 18px;font-size:12px;color:#94a3b8';
      r.notes.forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
      root.appendChild(notes);
    }

    // CHECK 1: Slip resistance
    const s = r.slipResistance, i = r.inputs;
    const sec1 = section('1. Slip resistance', s.safe);
    sec1.appendChild(math(
      'F_{friction} = \\mu \\cdot n \\cdot z \\cdot F_V = '
        + i.mu + ' \\cdot ' + i.n_interfaces + ' \\cdot ' + i.z + ' \\cdot ' + i.F_preload
        + ' = \\mathbf{' + s.F_friction.toFixed(0) + '}\\;\\text{N}', true));
    sec1.appendChild(math(
      'F_{M,tangential/bolt} = \\frac{M}{z \\cdot r} = \\frac{' + i.M + '}{' + i.z + ' \\cdot ' + i.r.toFixed(1) + '} = '
        + s.F_moment_tangential_per_bolt.toFixed(1) + '\\;\\text{N}', true));
    sec1.appendChild(math(
      'F_{bolt,tangential,max} = \\frac{F_Q}{z} + F_{M,tangential/bolt} = '
        + (i.F_shear/i.z).toFixed(1) + ' + ' + s.F_moment_tangential_per_bolt.toFixed(1)
        + ' = \\mathbf{' + s.F_bolt_tangential_max.toFixed(1) + '}\\;\\text{N}', true));
    sec1.appendChild(math(
      'F_{required} = K_s \\cdot z \\cdot F_{bolt,tangential,max} = '
        + i.K_s + ' \\cdot ' + i.z + ' \\cdot ' + s.F_bolt_tangential_max.toFixed(1)
        + ' = \\mathbf{' + s.F_required.toFixed(0) + '}\\;\\text{N}', true));
    const slipResult = document.createElement('div');
    slipResult.style.cssText = 'margin-top:6px;font-size:12px;color:' + (s.safe ? '#a7f3d0' : '#fca5a5');
    slipResult.innerHTML = s.safe
      ? '✓ ' + s.F_friction.toFixed(0) + ' N ≥ ' + s.F_required.toFixed(0) + ' N&nbsp;&nbsp;(margin ×' + s.margin.toFixed(2) + ')'
      : '✗ ' + s.F_friction.toFixed(0) + ' N &lt; ' + s.F_required.toFixed(0) + ' N&nbsp;&nbsp;(deficit: ' + (s.F_required - s.F_friction).toFixed(0) + ' N)';
    sec1.appendChild(slipResult);
    root.appendChild(sec1);

    // CHECK 2: Bolt tension
    const t = r.tensionCheck;
    const sec2 = section('2. Maximum bolt tension', true /* always informational */);
    sec2.appendChild(math(
      'F_{A,bolt} = \\frac{F_A}{z} = \\frac{' + i.F_axial + '}{' + i.z + '} = ' + t.F_axial_per_bolt.toFixed(1) + '\\;\\text{N}', true));
    sec2.appendChild(math(
      'F_{M,axial/bolt} = \\frac{M}{z \\cdot r} = ' + t.F_moment_axial_per_bolt.toFixed(1) + '\\;\\text{N}', true));
    sec2.appendChild(math(
      'F_{max,external} = F_{A,bolt} + F_{M,axial/bolt} = \\mathbf{' + t.F_max_external.toFixed(1) + '}\\;\\text{N}', true));
    sec2.appendChild(math(
      'F_{bolt,total} = F_V + F_{max,external} = ' + i.F_preload + ' + ' + t.F_max_external.toFixed(1)
        + ' = \\mathbf{' + t.F_bolt_total.toFixed(1) + '}\\;\\text{N}', true));
    root.appendChild(sec2);

    // CHECK 3: Combined stress
    const c = r.combinedStress;
    const sec3 = section('3. Combined stress (von Mises)', c.safe);
    sec3.appendChild(math(
      '\\sigma = \\frac{F_{bolt,total}}{A_s} = \\frac{' + t.F_bolt_total.toFixed(1) + '}{' + i.A_s + '} = \\mathbf{'
        + c.sigma.toFixed(1) + '}\\;\\text{MPa}', true));
    sec3.appendChild(math(
      '\\tau = \\frac{F_{bolt,tangential,max}}{A_s} = \\frac{' + s.F_bolt_tangential_max.toFixed(1) + '}{' + i.A_s + '} = \\mathbf{'
        + c.tau.toFixed(1) + '}\\;\\text{MPa}', true));
    sec3.appendChild(math(
      '\\sigma_{vm} = \\sqrt{\\sigma^2 + 3\\tau^2} = \\sqrt{' + c.sigma.toFixed(1) + '^2 + 3 \\cdot ' + c.tau.toFixed(1)
        + '^2} = \\mathbf{' + c.sigma_vm.toFixed(1) + '}\\;\\text{MPa}', true));
    const stressResult = document.createElement('div');
    stressResult.style.cssText = 'margin-top:6px;font-size:12px;color:' + (c.safe ? '#a7f3d0' : '#fca5a5');
    stressResult.innerHTML = c.safe
      ? '✓ σ_vm = ' + c.sigma_vm.toFixed(1) + ' MPa &lt; proof strength R_p0.2 = ' + c.R_p02 + ' MPa (class '+i.grade+')&nbsp;&nbsp;(utilisation ' + (c.utilization*100).toFixed(1) + '%)'
      : '✗ σ_vm = ' + c.sigma_vm.toFixed(1) + ' MPa ≥ R_p0.2 = ' + c.R_p02 + ' MPa (class '+i.grade+')&nbsp;&nbsp;— BOLT WILL YIELD';
    sec3.appendChild(stressResult);
    root.appendChild(sec3);

    // Metadata footer
    const meta = document.createElement('div');
    meta.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #334155;font-size:11px;color:#64748b';
    meta.innerHTML = 'Method: VDI 2230 / Shigley simplified (no load-factor Φ — conservative Φ=1). ' +
      'Thread ' + i.thread + ' A_s = ' + i.A_s + ' mm² (DIN 13). Grade ' + i.grade + ' R_p0.2 = ' + i.R_p02 + ' MPa, R_m = ' + i.R_m + ' MPa.<br>' +
      'This is a first-pass analysis — always verify with detailed VDI 2230 if safety-critical.';
    root.appendChild(meta);

    // RAG citations (non-blocking — appears below report once ready)
    appendCitations(root, 'bolt');
  }

  /**
   * Append a "Sources" block to the given report element by querying the RAG
   * module for context related to the current analysis kind. Non-blocking —
   * the citations fade in once the embeddings are ready.
   *
   * @param {HTMLElement} root  Report container.
   * @param {'bolt'|'gear'|'shaft'|'bearing'|'weld'} kind
   */
  function appendCitations(root, kind) {
    const RAG = (window.CycleCAD && window.CycleCAD.AIEngineerRAG) || null;
    if (!RAG) return;                                     // RAG not loaded — silently skip
    if (!RAG.isReady || typeof RAG.query !== 'function') return;

    // Placeholder that replaces itself when the query resolves.
    const placeholder = document.createElement('div');
    placeholder.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px dashed #334155;font-size:11px;color:#64748b;font-style:italic';
    placeholder.textContent = 'Loading sources…';
    root.appendChild(placeholder);

    const QUERY_BY_KIND = {
      bolt:    'bolted joint preload slip resistance bolt tension von mises',
      gear:    'spur gear AGMA bending contact stress Lewis',
      shaft:   'shaft fatigue Goodman Soderberg alternating mean endurance',
      bearing: 'rolling bearing L10 life ISO 281 dynamic load',
      weld:    'fillet weld throat stress AWS D1.1 electrode allowable'
    };
    const q = QUERY_BY_KIND[kind] || kind;

    // Ensure the model is initialised (lazy). Tolerate any failures silently.
    const initPromise = RAG.init ? Promise.resolve().then(() => RAG.init()).catch(() => null) : Promise.resolve();
    initPromise
      .then(() => RAG.query(q, { topK: 3 }))
      .then((results) => {
        placeholder.remove();
        if (!Array.isArray(results) || results.length === 0) return;
        const citationsEl = RAG.buildCitationUI ? RAG.buildCitationUI(results) : null;
        if (citationsEl) root.appendChild(citationsEl);
      })
      .catch((err) => {
        placeholder.style.color = '#64748b';
        placeholder.textContent = 'Sources unavailable (' + (err && err.message || String(err)).slice(0, 80) + ')';
      });
  }

  function section(title, safe) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:14px;padding:10px 12px;background:#0f172a;border:1px solid #334155;border-left:3px solid '+(safe?'#10b981':'#ef4444')+';border-radius:4px';
    const h = document.createElement('div');
    h.style.cssText = 'font-size:13px;font-weight:600;color:#e5e7eb;margin-bottom:8px';
    h.textContent = title;
    wrap.appendChild(h);
    return wrap;
  }

  function math(latex, block) {
    const el = document.createElement('div');
    el.style.cssText = 'margin:4px 0;font-size:13px;color:#cbd5e1;overflow-x:auto';
    renderMath(el, latex, block);
    return el;
  }

  function applyFromPrompt() {
    const prompt = S.els.prompt.value;
    if (!prompt.trim()) return;
    const parsed = parseBoltedJointPrompt(prompt);
    Object.entries(parsed).forEach(([k, v]) => {
      const el = S.els['in_' + k];
      if (el) el.value = String(v);
    });
    compute();
  }

  function buildUI() {
    const wrap = document.createElement('div');
    wrap.className = 'aie-panel';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px;min-width:460px;max-width:720px;font-family:-apple-system,sans-serif;color:#e5e7eb';

    // Header
    const header = document.createElement('div');
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:700;color:#f1f5f9';
    title.textContent = 'AI Engineering Analyst';
    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:11px;color:#94a3b8;margin-top:2px';
    subtitle.textContent = 'Bolted Joint — VDI 2230 / Shigley';
    S.els.subtitle = subtitle;
    header.appendChild(title);
    header.appendChild(subtitle);
    wrap.appendChild(header);

    // Tab pills — 5 analysis kinds
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#0f172a;border:1px solid #334155;border-radius:6px';
    Object.entries(TABS).forEach(([key, tab]) => {
      const pill = document.createElement('button');
      pill.dataset.tab = key;
      pill.textContent = tab.label;
      pill.style.cssText = 'padding:6px 12px;background:' + (key === 'bolt' ? '#38bdf8' : '#334155') + ';color:' + (key === 'bolt' ? '#0f172a' : '#cbd5e1') + ';border:0;border-radius:4px;cursor:pointer;font-size:12px;font-weight:' + (key === 'bolt' ? '700' : '500') + ';transition:background 0.15s';
      pill.addEventListener('click', () => switchTab(key));
      tabBar.appendChild(pill);
    });
    S.els.tabBar = tabBar;
    wrap.appendChild(tabBar);

    // Prompt box for natural-language entry (bolted-joint only)
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'display:flex;gap:6px';
    const prompt = document.createElement('input');
    prompt.type = 'text';
    prompt.placeholder = 'Describe the joint (e.g. "4 × M12 bolts class 10.9, shear 18kN, axial 18kN, moment 420Nm, preload 39kN, BCD 96mm, μ=0.16, K_s=1.5")';
    prompt.style.cssText = 'flex:1;padding:8px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font:12px inherit';
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Parse';
    applyBtn.style.cssText = 'padding:8px 14px;background:#38bdf8;color:#0f172a;border:0;border-radius:4px;font-weight:600;cursor:pointer';
    applyBtn.onclick = applyFromPrompt;
    prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyFromPrompt(); } });
    S.els.prompt = prompt;
    S.els.promptWrap = promptWrap;
    promptWrap.appendChild(prompt);
    promptWrap.appendChild(applyBtn);
    wrap.appendChild(promptWrap);

    // Input grid — populated by rebuildFormGrid()
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding:10px;background:#1e293b;border-radius:6px';
    S.els.grid = grid;
    wrap.appendChild(grid);
    rebuildFormGrid();

    // Preset examples — populated by rebuildPresets()
    const presets = document.createElement('div');
    presets.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    S.els.presets = presets;
    wrap.appendChild(presets);
    rebuildPresets();

    // Report area
    const report = document.createElement('div');
    report.className = 'aie-report';
    report.style.cssText = 'padding:4px 0';
    S.els.report = report;
    wrap.appendChild(report);

    // Self-test panel (collapsed by default)
    const testDetails = document.createElement('details');
    testDetails.style.cssText = 'font-size:11px;color:#64748b;margin-top:6px';
    const summary = document.createElement('summary');
    summary.textContent = 'Verification: MecAgent reference values';
    summary.style.cssText = 'cursor:pointer;user-select:none';
    testDetails.appendChild(summary);
    const tests = runSelfTests();
    const testList = document.createElement('ul');
    testList.style.cssText = 'margin:6px 0 0 20px;font:11px/1.5 SF Mono,monospace';
    tests.results.forEach(t => {
      const li = document.createElement('li');
      li.style.color = t.pass ? '#86efac' : '#fca5a5';
      li.textContent = (t.pass ? '✓ ' : '✗ ') + t.name + ': actual=' + (+t.actual).toFixed(2) + ' expected≈' + t.expected;
      testList.appendChild(li);
    });
    testDetails.appendChild(testList);
    wrap.appendChild(testDetails);

    // Initial compute
    setTimeout(compute, 0);
    return wrap;
  }

  // ===================================================================
  // PUBLIC API
  // ===================================================================
  let uiEl = null;
  window.CycleCAD.AIEngineer = {
    // ---- v1: bolted-joint ----
    analyze: boltedJointAnalysis,
    parsePrompt: parseBoltedJointPrompt,
    // ---- v2: gears ----
    analyzeGear: spurGearAnalysis,
    gearAllowableBending,
    gearAllowableContact,
    gearGeometryJ,
    gearGeometryI,
    // ---- v2: shafts ----
    analyzeShaft: shaftFatigueAnalysis,
    SHAFT_MATERIALS,
    SURFACE_FACTORS,
    // ---- v2: bearings ----
    analyzeBearing: bearingLifeAnalysis,
    BEARING_CATALOGUE,
    // ---- v2: welds ----
    analyzeWeld: filletWeldAnalysis,
    WELD_ELECTRODES,
    // ---- shared ----
    runSelfTests,
    STEEL_GRADES,
    BOLT_STRESS_AREA,
    BOLT_MAJOR_DIA,
    FRICTION_PRESETS,
    init: () => {
      const t = runSelfTests();
      if (!t.allPass) {
        console.warn('[AI Engineer] self-test failures:', t.results.filter(r => !r.pass));
      } else {
        console.log('[AI Engineer] self-tests pass (' + t.results.length + '/' + t.results.length + ' across bolted-joint + gears + shafts)');
      }
      return t.allPass;
    },
    getUI: () => { if (!uiEl) uiEl = buildUI(); return uiEl; },
    execute: (cmd, params) => {
      if (cmd === 'analyze')         return boltedJointAnalysis(params || {});
      if (cmd === 'analyze-gear')    return spurGearAnalysis(params || {});
      if (cmd === 'analyze-shaft')   return shaftFatigueAnalysis(params || {});
      if (cmd === 'analyze-bearing') return bearingLifeAnalysis(params || {});
      if (cmd === 'analyze-weld')    return filletWeldAnalysis(params || {});
      if (cmd === 'parse')           return parseBoltedJointPrompt((params && params.prompt) || '');
      if (cmd === 'show')            { if (!uiEl) uiEl = buildUI(); return uiEl; }
    }
  };

  console.log('AI Engineering Analyst v2.0 module loaded (bolted-joint + gears + shafts)');
})();

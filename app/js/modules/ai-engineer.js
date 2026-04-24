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
  // UI — form-based input with live recompute + formatted report
  // ===================================================================
  const S = { lastResult: null, els: {} };

  const INPUT_FIELDS = [
    // [key, label, unit, default, min]
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

  function fmt(n, unit, digits) {
    if (!isFinite(n)) return '—';
    digits = digits ?? (Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 1 : 2);
    const s = Number(n).toFixed(digits);
    return unit ? s + ' ' + unit : s;
  }

  function collectInputs() {
    const out = {};
    INPUT_FIELDS.forEach(([key,,,,, type]) => {
      const el = S.els['in_' + key];
      if (!el) return;
      out[key] = (type === 'select') ? el.value : parseFloat(el.value);
    });
    return out;
  }

  function compute() {
    try {
      const params = collectInputs();
      const r = boltedJointAnalysis(params);
      S.lastResult = r;
      renderReport(r);
    } catch(e) {
      if (S.els.report) S.els.report.innerHTML = '<div class="aie-err">Error: ' + e.message + '</div>';
    }
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
    header.innerHTML = '<div style="font-size:15px;font-weight:700;color:#f1f5f9">AI Engineering Analyst</div>'
      + '<div style="font-size:11px;color:#94a3b8;margin-top:2px">Bolted-joint analysis (VDI 2230 / Shigley) — v1</div>';
    wrap.appendChild(header);

    // Prompt box for natural-language entry
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
    promptWrap.appendChild(prompt);
    promptWrap.appendChild(applyBtn);
    wrap.appendChild(promptWrap);

    // Input grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;padding:10px;background:#1e293b;border-radius:6px';
    INPUT_FIELDS.forEach(field => {
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
    wrap.appendChild(grid);

    // Preset examples
    const presets = document.createElement('div');
    presets.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    [
      { label: 'MecAgent demo', values: { boltCount:4, thread:'M12', grade:'10.9', preload:39000, shearForce:18000, axialForce:18000, moment:420000, bcd:96, friction:0.16, safetyFactor:1.5 } },
      { label: 'Flange M8 light', values: { boltCount:8, thread:'M8', grade:'8.8', preload:15000, shearForce:5000, axialForce:2000, moment:50000, bcd:60, friction:0.15, safetyFactor:1.25 } },
      { label: 'Heavy M20', values: { boltCount:6, thread:'M20', grade:'8.8', preload:120000, shearForce:30000, axialForce:25000, moment:800000, bcd:200, friction:0.14, safetyFactor:1.5 } }
    ].forEach(preset => {
      const b = document.createElement('button');
      b.textContent = preset.label;
      b.style.cssText = 'padding:4px 8px;background:#334155;color:#cbd5e1;border:0;border-radius:3px;cursor:pointer;font-size:11px';
      b.onclick = () => {
        Object.entries(preset.values).forEach(([k, v]) => { const el = S.els['in_' + k]; if (el) el.value = String(v); });
        compute();
      };
      presets.appendChild(b);
    });
    wrap.appendChild(presets);

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
    analyze: boltedJointAnalysis,
    parsePrompt: parseBoltedJointPrompt,
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
        console.log('[AI Engineer] self-tests pass (' + t.results.length + '/' + t.results.length + ' against MecAgent reference values)');
      }
      return t.allPass;
    },
    getUI: () => { if (!uiEl) uiEl = buildUI(); return uiEl; },
    execute: (cmd, params) => {
      if (cmd === 'analyze') return boltedJointAnalysis(params || {});
      if (cmd === 'parse')   return parseBoltedJointPrompt((params && params.prompt) || '');
      if (cmd === 'show')    { if (!uiEl) uiEl = buildUI(); return uiEl; }
    }
  };

  console.log('AI Engineering Analyst v1.0 module loaded');
})();

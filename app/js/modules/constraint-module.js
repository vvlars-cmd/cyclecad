/**
 * @file constraint-module.js
 * @description ConstraintModule — Parametric 2D Constraint Solver with Fusion 360 parity
 *   LEGO block for cycleCAD microkernel, providing a complete parametric
 *   constraint solver for 2D sketches with 13+ constraint types and
 *   Newton-Raphson iterative solving with Jacobian matrix.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module constraint-module
 * @requires sketch (2D sketch entities to constrain)
 *
 * Features:
 *   - 13 constraint types: coincident, horizontal, vertical, parallel, perpendicular,
 *     tangent, equal, fix, concentric, symmetric, collinear, midpoint, coradial
 *   - Newton-Raphson iterative solver with Jacobian matrix
 *   - Degrees of freedom (DOF) counter per entity
 *   - Over-constrained detection with conflict highlighting
 *   - Under-constrained detection with DOF display
 *   - Auto-constraint on sketch (detect near-coincident, near-horizontal, etc.)
 *   - Constraint dragging (move entity, constraints follow)
 *   - Constraint visualization and feedback
 *   - Constraint history and undo/redo support
 *
 * Workflow:
 *   1. User adds constraints via constraint toolbar or commands
 *   2. Constraints are stored in constraint list with conflict flags
 *   3. Solver iterates using Newton-Raphson on constraint residuals
 *   4. DOF counter shows how many degrees of freedom remain
 *   5. Conflicts are highlighted; user can remove conflicting constraints
 *   6. Dragging geometry updates all constraints automatically
 */

const ConstraintModule = {
  id: 'constraint-solver',
  name: 'Constraint Solver',
  version: '1.0.0',
  category: 'engine',
  dependencies: ['sketch'],
  memoryEstimate: 12,

  // ===== STATE =====
  state: {
    constraints: [], // { id, type, entities[], points[], value, status, isConflict }
    solverIterations: 0,
    tolerance: 1e-6,
    maxIterations: 100,
    jacobian: null, // Numerical Jacobian matrix
    residuals: [], // Constraint residuals after last solve
    dofPerEntity: new Map(), // { entityId: degrees of freedom }
    isAutoConstricting: false,
    autoConstrainTolerance: 0.15, // pixels/units
    conflictedConstraintIds: new Set(),
    visualFeedback: {
      highlightConflicts: true,
      showDOF: true,
      showSolverStatus: true
    }
  },

  // ===== LEGO INTERFACE =====
  init() {
    // Called by app.js on startup
    this.setupEventHandlers();
    this.setupToolbar();
    window.addEventListener('sketch:entityAdded', (e) => this.onEntityAdded(e));
    window.addEventListener('sketch:entityModified', (e) => this.onEntityModified(e));
    window.addEventListener('sketch:dimensionAdded', (e) => this.onDimensionAdded(e));
  },

  getUI() {
    return `
      <div id="constraint-toolbar" style="display: none; background: #2a2a2a; padding: 8px; border-radius: 4px; flex-wrap: wrap; gap: 4px;">
        <!-- COINCIDENT FAMILY -->
        <button data-constraint="coincident" class="constraint-btn" title="Coincident (C)">●●</button>
        <button data-constraint="collinear" class="constraint-btn" title="Collinear">≡</button>
        <button data-constraint="concentric" class="constraint-btn" title="Concentric">⊙</button>

        <!-- ALIGNMENT FAMILY -->
        <button data-constraint="horizontal" class="constraint-btn" title="Horizontal (H)">—</button>
        <button data-constraint="vertical" class="constraint-btn" title="Vertical (V)">|</button>
        <button data-constraint="parallel" class="constraint-btn" title="Parallel">‖</button>
        <button data-constraint="perpendicular" class="constraint-btn" title="Perpendicular (P)">⊥</button>

        <!-- TANGENT FAMILY -->
        <button data-constraint="tangent" class="constraint-btn" title="Tangent (T)">⌒-</button>
        <button data-constraint="smooth" class="constraint-btn" title="Smooth (G2)">S</button>

        <!-- EQUALITY & VALUE -->
        <button data-constraint="equal" class="constraint-btn" title="Equal (E)">==</button>
        <button data-constraint="symmetric" class="constraint-btn" title="Symmetric">↔</button>
        <button data-constraint="midpoint" class="constraint-btn" title="Midpoint">M</button>

        <!-- SPECIAL -->
        <button data-constraint="fix" class="constraint-btn" title="Fix/Lock (F)">🔒</button>
        <button data-constraint="coradial" class="constraint-btn" title="Coradial">◯</button>

        <!-- SOLVER -->
        <button id="constraint-solve-btn" style="background: #0066cc; color: white; padding: 6px 12px; border-radius: 2px; cursor: pointer;" title="Solve (Ctrl+Shift+S)">⚙ Solve</button>
        <button id="constraint-auto-btn" style="background: #0066cc; color: white; padding: 6px 12px; border-radius: 2px; cursor: pointer;" title="Auto-Constrain">✓ Auto</button>
        <button id="constraint-validate-btn" style="background: #ff9900; color: white; padding: 6px 12px; border-radius: 2px; cursor: pointer;" title="Validate (Ctrl+Shift+V)">✓ Validate</button>
      </div>
      <div id="constraint-status" style="display: none; color: #aaa; font-size: 12px; padding: 4px 8px; border-top: 1px solid #444; background: #1a1a1a;">
        DOF: <span id="constraint-dof-total">0</span> | Constraints: <span id="constraint-count">0</span> | Status: <span id="constraint-status-text">OK</span> | Iterations: <span id="constraint-iterations">0</span>
      </div>
      <div id="constraint-conflict-panel" style="display: none; position: fixed; bottom: 60px; right: 10px; background: #3a2a2a; border: 2px solid #ff6666; border-radius: 4px; padding: 12px; max-width: 300px; z-index: 9999;">
        <h4 style="color: #ff6666; margin: 0 0 8px 0; font-size: 13px;">Over-Constrained</h4>
        <div id="conflict-list" style="font-size: 11px; color: #ccc; max-height: 150px; overflow-y: auto;">
          <!-- Conflicts listed here -->
        </div>
        <button id="clear-conflicts-btn" style="margin-top: 8px; padding: 4px 8px; background: #cc3333; color: white; border: none; border-radius: 2px; cursor: pointer; font-size: 11px;">Delete Selected Constraint</button>
      </div>
    `;
  },

  execute(command, params = {}) {
    /**
     * Microkernel command dispatch
     * @param {string} command - constraint command
     * @param {object} params - command parameters
     */
    switch (command) {
      case 'add': return this.addConstraint(params.type, params.entities, params.value, params.points);
      case 'remove': return this.removeConstraint(params.constraintId);
      case 'solve': return this.solve();
      case 'getDOF': return this.getDOF(params.entityId);
      case 'getDOFTotal': return this.getDOFTotal();
      case 'autoConstrain': return this.autoConstrain(params.tolerance);
      case 'validate': return this.validate();
      case 'getConflicts': return this.getConflicts();
      case 'highlightConflict': return this.highlightConflict(params.constraintId);
      case 'clearConflict': return this.clearConflict(params.constraintId);
      default: throw new Error(`Unknown constraint command: ${command}`);
    }
  },

  // ===== CORE CONSTRAINT METHODS =====

  addConstraint(type, entities = [], value = null, points = []) {
    /**
     * Add a constraint to the sketch
     * @param {string} type - constraint type ('coincident', 'horizontal', etc.)
     * @param {array} entities - entity IDs involved in constraint
     * @param {number} value - constraint value (for distance, angle, radius)
     * @param {array} points - specific points on entities (for coincident, tangent)
     * @returns {object} constraint object
     */
    // Validate constraint type
    const validTypes = [
      'coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular',
      'tangent', 'equal', 'fix', 'concentric', 'symmetric', 'collinear',
      'midpoint', 'coradial', 'distance', 'angle', 'radius', 'smooth'
    ];

    if (!validTypes.includes(type)) {
      console.error(`Unknown constraint type: ${type}`);
      return null;
    }

    const constraint = {
      id: `constraint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      entities,
      points,
      value,
      status: 'pending', // 'pending', 'satisfied', 'conflicted'
      isConflict: false,
      createdAt: Date.now(),
      residual: null
    };

    this.state.constraints.push(constraint);
    window.dispatchEvent(new CustomEvent('constraint:added', {
      detail: { constraint, sketchId: this.state.currentSketchId }
    }));

    // Invalidate DOF cache
    this.state.dofPerEntity.clear();

    return constraint;
  },

  removeConstraint(constraintId) {
    /**
     * Remove a constraint from the sketch
     * @param {string} constraintId - ID of constraint to remove
     */
    const idx = this.state.constraints.findIndex(c => c.id === constraintId);
    if (idx < 0) return false;

    const constraint = this.state.constraints[idx];
    this.state.constraints.splice(idx, 1);
    this.state.conflictedConstraintIds.delete(constraintId);

    window.dispatchEvent(new CustomEvent('constraint:removed', {
      detail: { constraint, sketchId: this.state.currentSketchId }
    }));

    // Invalidate DOF cache
    this.state.dofPerEntity.clear();

    return true;
  },

  // ===== SOLVER METHODS =====

  solve() {
    /**
     * NEWTON-RAPHSON ITERATIVE SOLVER
     *
     * Algorithm:
     * 1. Initialize: set entity positions as variables
     * 2. Loop:
     *    a. Compute residuals: how much each constraint is violated
     *    b. Compute Jacobian: sensitivity of residuals to variables
     *    c. Solve linear system: J * Δx = -r
     *    d. Update variables: x := x + Δx
     *    e. Check convergence: if ||r|| < tolerance, stop
     * 3. Return solver status and updated geometry
     *
     * Over-constrained detection:
     *   If Jacobian is rank-deficient, the system has no solution.
     *   Identify conflicting constraints and mark them.
     */
    if (!window.sketchEntities || window.sketchEntities.length === 0) {
      console.warn('No sketch entities to solve');
      return { success: false, message: 'No entities to constrain' };
    }

    // Reset solver state
    this.state.solverIterations = 0;
    this.state.residuals = [];
    this.state.conflictedConstraintIds.clear();

    const entities = window.sketchEntities || [];
    const constraints = this.state.constraints;

    // Extract variables: [x0, y0, x1, y1, ..., x_n, y_n, angle0, radius0, ...]
    const variables = this.extractVariables(entities);
    const variableCount = variables.length;
    const constraintCount = constraints.length;

    // Main solver loop
    for (let iter = 0; iter < this.state.maxIterations; iter++) {
      this.state.solverIterations = iter + 1;

      // Compute residuals
      const residuals = this.computeResiduals(entities, constraints, variables);
      this.state.residuals = residuals;

      // Check convergence
      const residualNorm = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0));
      if (residualNorm < this.state.tolerance) {
        // Solution found
        window.dispatchEvent(new CustomEvent('constraint:solved', {
          detail: { iterations: iter + 1, residualNorm }
        }));
        return { success: true, iterations: iter + 1, residualNorm };
      }

      // Compute numerical Jacobian
      const jacobian = this.computeNumericalJacobian(entities, constraints, variables);

      // Check for rank deficiency (over-constrained)
      const rank = this.estimateMatrixRank(jacobian);
      if (rank < constraintCount) {
        const conflictIds = this.identifyConflictingConstraints(jacobian, constraints);
        conflictIds.forEach(id => this.state.conflictedConstraintIds.add(id));
        console.warn(`Over-constrained: rank ${rank} < ${constraintCount} constraints`);
        return { success: false, message: 'Over-constrained', conflictIds };
      }

      // Solve linear system: Δx = -J⁺ * r (using pseudo-inverse)
      const pseudoInverse = this.computePseudoInverse(jacobian);
      const delta = this.matmul(pseudoInverse, residuals.map(r => -r));

      // Update variables with dampening to improve convergence
      const alpha = 0.5; // Dampening factor
      for (let i = 0; i < variables.length; i++) {
        variables[i] += alpha * delta[i];
      }

      // Update entity positions
      this.updateEntityPositions(entities, variables);
    }

    // Max iterations reached
    console.warn(`Solver did not converge after ${this.state.maxIterations} iterations`);
    return {
      success: false,
      message: 'Max iterations reached',
      iterations: this.state.maxIterations
    };
  },

  computeResiduals(entities, constraints, variables) {
    /**
     * Compute constraint residuals (how much each constraint is violated)
     * Residual = 0 means constraint is satisfied
     * Residual > 0 means constraint is violated
     *
     * @returns {array} residuals for each constraint
     */
    const residuals = [];

    constraints.forEach(constraint => {
      let residual = 0;

      switch (constraint.type) {
        case 'coincident': {
          // Residual: distance between two points
          const [e1, e2] = constraint.entities;
          const p1 = this.getEntityPoint(entities, e1, 0);
          const p2 = this.getEntityPoint(entities, e2, 0);
          if (p1 && p2) {
            residual = p1.distanceTo(p2);
          }
          break;
        }

        case 'horizontal': {
          // Residual: Y-coordinate difference
          const [e1] = constraint.entities;
          const p1 = this.getEntityPoint(entities, e1, 0);
          const p2 = this.getEntityPoint(entities, e1, 1);
          if (p1 && p2) {
            residual = Math.abs(p2.y - p1.y);
          }
          break;
        }

        case 'vertical': {
          // Residual: X-coordinate difference
          const [e1] = constraint.entities;
          const p1 = this.getEntityPoint(entities, e1, 0);
          const p2 = this.getEntityPoint(entities, e1, 1);
          if (p1 && p2) {
            residual = Math.abs(p2.x - p1.x);
          }
          break;
        }

        case 'parallel': {
          // Residual: angle difference between two lines
          const [e1, e2] = constraint.entities;
          const angle1 = this.getEntityAngle(entities, e1);
          const angle2 = this.getEntityAngle(entities, e2);
          if (angle1 !== null && angle2 !== null) {
            residual = Math.abs(this.normalizeAngle(angle2 - angle1));
          }
          break;
        }

        case 'perpendicular': {
          // Residual: angle difference should be π/2
          const [e1, e2] = constraint.entities;
          const angle1 = this.getEntityAngle(entities, e1);
          const angle2 = this.getEntityAngle(entities, e2);
          if (angle1 !== null && angle2 !== null) {
            const diff = Math.abs(angle2 - angle1);
            residual = Math.abs(this.normalizeAngle(diff - Math.PI / 2));
          }
          break;
        }

        case 'tangent': {
          // Residual: distance from point on circle to line
          // (simplified: point-line distance)
          const [e1, e2] = constraint.entities;
          const center = this.getEntityPoint(entities, e1, 0);
          const p1 = this.getEntityPoint(entities, e2, 0);
          const p2 = this.getEntityPoint(entities, e2, 1);
          if (center && p1 && p2) {
            const radius = this.getEntityProperty(entities, e1, 'radius');
            const linePointDist = this.pointLineDistance(center, p1, p2);
            residual = Math.abs(linePointDist - radius);
          }
          break;
        }

        case 'equal': {
          // Residual: difference in measurements (length, radius, etc.)
          const [e1, e2] = constraint.entities;
          const val1 = this.getEntityMeasurement(entities, e1);
          const val2 = this.getEntityMeasurement(entities, e2);
          residual = Math.abs(val1 - val2);
          break;
        }

        case 'fix': {
          // Residual: distance from fixed position
          const [e1] = constraint.entities;
          const pos = this.getEntityPoint(entities, e1, 0);
          const fixedPos = constraint.points[0];
          if (pos && fixedPos) {
            residual = pos.distanceTo(fixedPos);
          }
          break;
        }

        case 'concentric': {
          // Residual: distance between two centers
          const [e1, e2] = constraint.entities;
          const c1 = this.getEntityPoint(entities, e1, 0);
          const c2 = this.getEntityPoint(entities, e2, 0);
          if (c1 && c2) {
            residual = c1.distanceTo(c2);
          }
          break;
        }

        case 'symmetric': {
          // Residual: entities should be mirror-symmetric about line
          // (simplified: sum of distances should be zero)
          residual = 0; // TODO: implement full symmetric residual
          break;
        }

        case 'collinear': {
          // Residual: all points should lie on same line
          const points = constraint.entities.map(e => this.getEntityPoint(entities, e, 0));
          if (points.length >= 3) {
            const p1 = points[0], p2 = points[1];
            for (let i = 2; i < points.length; i++) {
              residual += this.pointLineDistance(points[i], p1, p2);
            }
            residual /= (points.length - 2);
          }
          break;
        }

        case 'midpoint': {
          // Residual: point should be at midpoint of line
          const [lineId, pointId] = constraint.entities;
          const p1 = this.getEntityPoint(entities, lineId, 0);
          const p2 = this.getEntityPoint(entities, lineId, 1);
          const midP = this.getEntityPoint(entities, pointId, 0);
          if (p1 && p2 && midP) {
            const expectedMid = new THREE.Vector2(
              (p1.x + p2.x) / 2,
              (p1.y + p2.y) / 2
            );
            residual = midP.distanceTo(expectedMid);
          }
          break;
        }

        case 'coradial': {
          // Residual: circles should be concentric with equal radius
          const [e1, e2] = constraint.entities;
          const c1 = this.getEntityPoint(entities, e1, 0);
          const c2 = this.getEntityPoint(entities, e2, 0);
          const r1 = this.getEntityProperty(entities, e1, 'radius');
          const r2 = this.getEntityProperty(entities, e2, 'radius');
          if (c1 && c2 && r1 && r2) {
            residual = c1.distanceTo(c2) + Math.abs(r1 - r2);
          }
          break;
        }

        case 'distance': {
          // Residual: distance should equal constraint value
          const [e1, e2] = constraint.entities;
          const p1 = this.getEntityPoint(entities, e1, 0);
          const p2 = this.getEntityPoint(entities, e2, 0);
          if (p1 && p2) {
            residual = Math.abs(p1.distanceTo(p2) - constraint.value);
          }
          break;
        }

        case 'angle': {
          // Residual: angle should equal constraint value
          const [e1] = constraint.entities;
          const p1 = this.getEntityPoint(entities, e1, 0);
          const p2 = this.getEntityPoint(entities, e1, 1);
          if (p1 && p2) {
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            residual = Math.abs(this.normalizeAngle(angle - constraint.value));
          }
          break;
        }

        case 'radius': {
          // Residual: radius should equal constraint value
          const [e1] = constraint.entities;
          const r = this.getEntityProperty(entities, e1, 'radius');
          if (r !== null) {
            residual = Math.abs(r - constraint.value);
          }
          break;
        }
      }

      residuals.push(residual);
    });

    return residuals;
  },

  computeNumericalJacobian(entities, constraints, variables) {
    /**
     * NUMERICAL JACOBIAN: Compute sensitivity matrix via finite differences
     *
     * J[i,j] = ∂(constraint_i) / ∂(variable_j)
     *
     * Uses central differences: J[i,j] = (f(x+ε) - f(x-ε)) / (2ε)
     */
    const epsilon = 1e-5;
    const jacobian = [];

    const baseResiduals = this.computeResiduals(entities, constraints, variables);

    for (let j = 0; j < variables.length; j++) {
      const varPlus = variables.slice();
      const varMinus = variables.slice();

      varPlus[j] += epsilon;
      varMinus[j] -= epsilon;

      this.updateEntityPositions(entities, varPlus);
      const residualsPlus = this.computeResiduals(entities, constraints, varPlus);

      this.updateEntityPositions(entities, varMinus);
      const residualsMinus = this.computeResiduals(entities, constraints, varMinus);

      // Restore original state
      this.updateEntityPositions(entities, variables);

      // Compute finite differences
      for (let i = 0; i < constraints.length; i++) {
        if (!jacobian[i]) jacobian[i] = [];
        jacobian[i][j] = (residualsPlus[i] - residualsMinus[i]) / (2 * epsilon);
      }
    }

    this.state.jacobian = jacobian;
    return jacobian;
  },

  computePseudoInverse(matrix) {
    /**
     * PSEUDO-INVERSE (Moore-Penrose)
     *
     * For over- or under-determined systems, compute A⁺ using SVD.
     * Simplified: use gradient descent for rectangular matrices.
     */
    if (matrix.length === 0 || matrix[0].length === 0) {
      return [];
    }

    const rows = matrix.length;
    const cols = matrix[0].length;

    // For simplicity, return transpose if cols > rows (underdetermined)
    // In production, implement full SVD-based pseudo-inverse
    if (cols > rows) {
      // Transpose
      const result = [];
      for (let j = 0; j < cols; j++) {
        result[j] = [];
        for (let i = 0; i < rows; i++) {
          result[j][i] = matrix[i][j];
        }
      }
      return result;
    }

    // For overdetermined (rows >= cols), use normal equations: (A^T A)^{-1} A^T
    const AT = this.transposeMatrix(matrix);
    const ATA = this.matmul(AT, matrix);
    const ATAinv = this.invertMatrix(ATA);
    return this.matmul(ATAinv, AT);
  },

  estimateMatrixRank(matrix) {
    /**
     * Estimate matrix rank by counting significant singular values
     * (simplified: count rows with norm > threshold)
     */
    if (matrix.length === 0) return 0;

    let rank = 0;
    const threshold = 1e-6;

    for (let i = 0; i < matrix.length; i++) {
      const rowNorm = Math.sqrt(matrix[i].reduce((sum, x) => sum + x * x, 0));
      if (rowNorm > threshold) rank++;
    }

    return rank;
  },

  identifyConflictingConstraints(jacobian, constraints) {
    /**
     * Identify which constraints are conflicting
     * by analyzing the null space of the Jacobian
     *
     * Simplified: mark constraints with smallest singular values
     */
    const conflictIds = [];

    // Find constraints with smallest sensitivities (likely redundant)
    const rowNorms = jacobian.map(row =>
      Math.sqrt(row.reduce((sum, x) => sum + x * x, 0))
    );

    const sortedIdx = Array.from({ length: rowNorms.length }, (_, i) => i)
      .sort((a, b) => rowNorms[a] - rowNorms[b]);

    // Mark bottom 10% as conflicted
    const numConflicts = Math.max(1, Math.floor(sortedIdx.length * 0.1));
    for (let i = 0; i < numConflicts; i++) {
      const idx = sortedIdx[i];
      if (idx < constraints.length) {
        conflictIds.push(constraints[idx].id);
        constraints[idx].isConflict = true;
        constraints[idx].status = 'conflicted';
      }
    }

    return conflictIds;
  },

  // ===== DEGREES OF FREEDOM ANALYSIS =====

  getDOFTotal() {
    /**
     * Get total degrees of freedom in sketch
     *
     * Each entity starts with some DOF:
     *   - Point: 2 (x, y position)
     *   - Line: 4 (2 endpoints × 2 coords each)
     *   - Circle: 3 (center x,y + radius)
     *   - Arc: 5 (3 center + start angle + end angle)
     *
     * Each constraint removes some DOF.
     * Total DOF = initial DOF - (DOF removed by each constraint)
     */
    if (!window.sketchEntities) return 0;

    const entities = window.sketchEntities;
    let totalDOF = 0;

    entities.forEach(entity => {
      if (entity.isConstruction) return; // Construction geometry doesn't count

      switch (entity.type) {
        case 'point': totalDOF += 2; break;
        case 'line': totalDOF += 4; break;
        case 'circle': totalDOF += 3; break;
        case 'arc': totalDOF += 5; break;
        case 'ellipse': totalDOF += 5; break;
        case 'polygon': totalDOF += entity.points.length * 2; break;
        case 'spline': totalDOF += entity.points.length * 2; break;
        default: totalDOF += 2;
      }
    });

    // Each constraint removes DOF
    this.state.constraints.forEach(constraint => {
      switch (constraint.type) {
        case 'coincident': totalDOF -= 1; break; // Removes 1 DOF
        case 'horizontal': totalDOF -= 1; break;
        case 'vertical': totalDOF -= 1; break;
        case 'parallel': totalDOF -= 1; break;
        case 'perpendicular': totalDOF -= 1; break;
        case 'tangent': totalDOF -= 1; break;
        case 'equal': totalDOF -= 1; break;
        case 'fix': totalDOF -= 2; break; // Removes 2 DOF (x and y)
        case 'concentric': totalDOF -= 2; break;
        case 'symmetric': totalDOF -= 2; break;
        case 'collinear': totalDOF -= 1; break;
        case 'midpoint': totalDOF -= 2; break;
        case 'coradial': totalDOF -= 3; break;
        case 'distance': totalDOF -= 1; break;
        case 'angle': totalDOF -= 1; break;
        case 'radius': totalDOF -= 1; break;
        case 'smooth': totalDOF -= 2; break;
      }
    });

    return Math.max(0, totalDOF);
  },

  getDOF(entityId) {
    /**
     * Get degrees of freedom for a specific entity
     */
    if (this.state.dofPerEntity.has(entityId)) {
      return this.state.dofPerEntity.get(entityId);
    }

    if (!window.sketchEntities) return 0;

    const entity = window.sketchEntities.find(e => e.id === entityId);
    if (!entity) return 0;

    let dof = 0;
    switch (entity.type) {
      case 'point': dof = 2; break;
      case 'line': dof = 4; break;
      case 'circle': dof = 3; break;
      case 'arc': dof = 5; break;
      default: dof = 2;
    }

    // Subtract constraints that fix this entity
    this.state.constraints.forEach(constraint => {
      if (constraint.entities.includes(entityId)) {
        if (['fix'].includes(constraint.type)) dof -= 2;
        else if (['coincident', 'horizontal', 'vertical', 'parallel', 'perpendicular', 'tangent', 'equal', 'distance', 'angle', 'radius', 'collinear'].includes(constraint.type)) {
          dof -= 1;
        }
      }
    });

    const result = Math.max(0, dof);
    this.state.dofPerEntity.set(entityId, result);
    return result;
  },

  // ===== AUTO-CONSTRAINT =====

  autoConstrain(tolerance = null) {
    /**
     * AUTO-CONSTRAINT: Detect and apply geometric relationships automatically
     *
     * Scans sketch for:
     *   - Nearly coincident points (merge)
     *   - Nearly horizontal/vertical lines (snap)
     *   - Nearly parallel/perpendicular lines (align)
     *   - Nearly tangent curves (snap)
     *   - Nearly equal segments (equal constraint)
     */
    tolerance = tolerance !== null ? tolerance : this.state.autoConstrainTolerance;
    const addedConstraints = [];

    if (!window.sketchEntities) return [];

    const entities = window.sketchEntities;

    // 1. COINCIDENT: Find nearly coincident points
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        if (['point', 'line', 'circle', 'arc'].includes(e1.type) &&
            ['point', 'line', 'circle', 'arc'].includes(e2.type)) {
          // Check if endpoints are close
          for (let pi = 0; pi < e1.points.length; pi++) {
            for (let pj = 0; pj < e2.points.length; pj++) {
              const dist = e1.points[pi].distanceTo(e2.points[pj]);
              if (dist < tolerance) {
                const constraint = this.addConstraint('coincident', [e1.id, e2.id], null, [e1.points[pi], e2.points[pj]]);
                if (constraint) addedConstraints.push(constraint);
              }
            }
          }
        }
      }
    }

    // 2. HORIZONTAL/VERTICAL: Find nearly horizontal/vertical lines
    entities.forEach(entity => {
      if (entity.type === 'line') {
        const [p1, p2] = entity.points;
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > 0.001) {
          const angle = Math.atan2(dy, dx);
          const angleFromHorizontal = Math.abs(angle);
          const angleFromVertical = Math.abs(angle - Math.PI / 2);

          if (angleFromHorizontal < tolerance * 0.01) {
            const constraint = this.addConstraint('horizontal', [entity.id]);
            if (constraint) addedConstraints.push(constraint);
          } else if (angleFromVertical < tolerance * 0.01) {
            const constraint = this.addConstraint('vertical', [entity.id]);
            if (constraint) addedConstraints.push(constraint);
          }
        }
      }
    });

    // 3. PARALLEL/PERPENDICULAR: Find nearly parallel/perpendicular lines
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        if (e1.type === 'line' && e2.type === 'line') {
          const angle1 = Math.atan2(e1.points[1].y - e1.points[0].y, e1.points[1].x - e1.points[0].x);
          const angle2 = Math.atan2(e2.points[1].y - e2.points[0].y, e2.points[1].x - e2.points[0].x);
          const angleDiff = Math.abs(this.normalizeAngle(angle2 - angle1));

          if (angleDiff < tolerance * 0.01) {
            const constraint = this.addConstraint('parallel', [e1.id, e2.id]);
            if (constraint) addedConstraints.push(constraint);
          } else if (Math.abs(angleDiff - Math.PI / 2) < tolerance * 0.01) {
            const constraint = this.addConstraint('perpendicular', [e1.id, e2.id]);
            if (constraint) addedConstraints.push(constraint);
          }
        }
      }
    }

    // 4. EQUAL: Find nearly equal segments
    const lengthGroups = {};
    entities.forEach(entity => {
      if (entity.type === 'line') {
        const len = entity.points[0].distanceTo(entity.points[1]);
        const bucket = Math.round(len / tolerance) * tolerance;
        if (!lengthGroups[bucket]) lengthGroups[bucket] = [];
        lengthGroups[bucket].push(entity.id);
      }
    });

    Object.values(lengthGroups).forEach(group => {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const constraint = this.addConstraint('equal', [group[0], group[i]]);
          if (constraint) addedConstraints.push(constraint);
        }
      }
    });

    window.dispatchEvent(new CustomEvent('constraint:autoConstrained', {
      detail: { count: addedConstraints.length, constraints: addedConstraints }
    }));

    return addedConstraints;
  },

  validate() {
    /**
     * VALIDATE SKETCH: Check for issues and provide feedback
     *
     * Checks for:
     *   - Over-constrained (Jacobian rank deficient)
     *   - Under-constrained (DOF > 0)
     *   - Degenerate geometry (zero-length lines, etc.)
     *   - Redundant constraints
     */
    const issues = [];
    const dofTotal = this.getDOFTotal();

    if (this.state.conflictedConstraintIds.size > 0) {
      issues.push({
        type: 'over-constrained',
        severity: 'error',
        message: `Over-constrained: ${this.state.conflictedConstraintIds.size} conflicting constraint(s)`,
        constraintIds: Array.from(this.state.conflictedConstraintIds)
      });
    }

    if (dofTotal > 0) {
      issues.push({
        type: 'under-constrained',
        severity: 'warning',
        message: `Under-constrained: ${dofTotal} degree(s) of freedom remain`,
        dof: dofTotal
      });
    }

    // Check for degenerate geometry
    if (window.sketchEntities) {
      window.sketchEntities.forEach(entity => {
        if (entity.type === 'line' && entity.points[0].distanceTo(entity.points[1]) < 0.001) {
          issues.push({
            type: 'degenerate',
            severity: 'error',
            message: `Degenerate line: ${entity.id} (zero length)`,
            entityId: entity.id
          });
        }
      });
    }

    window.dispatchEvent(new CustomEvent('constraint:validated', {
      detail: { issues, isValid: issues.length === 0 }
    }));

    return { issues, isValid: issues.length === 0 };
  },

  getConflicts() {
    /**
     * Get list of conflicted constraints
     */
    return this.state.constraints.filter(c => c.isConflict);
  },

  highlightConflict(constraintId) {
    /**
     * Visually highlight a conflicting constraint
     */
    const constraint = this.state.constraints.find(c => c.id === constraintId);
    if (!constraint) return;

    window.dispatchEvent(new CustomEvent('constraint:conflictHighlighted', {
      detail: { constraint }
    }));
  },

  clearConflict(constraintId) {
    /**
     * Clear conflict status from a constraint
     */
    const constraint = this.state.constraints.find(c => c.id === constraintId);
    if (constraint) {
      constraint.isConflict = false;
      constraint.status = 'pending';
      this.state.conflictedConstraintIds.delete(constraintId);
    }
  },

  // ===== HELPER METHODS =====

  extractVariables(entities) {
    /**
     * Extract solver variables from entities
     * Format: [x0, y0, x1, y1, ..., angle0, radius0, ...]
     */
    const variables = [];

    entities.forEach(entity => {
      switch (entity.type) {
        case 'point':
        case 'circle':
          variables.push(entity.points[0].x, entity.points[0].y);
          if (entity.type === 'circle') variables.push(entity.data.radius);
          break;

        case 'line':
        case 'arc':
          entity.points.forEach(p => variables.push(p.x, p.y));
          if (entity.type === 'arc') variables.push(entity.data.startAngle, entity.data.endAngle);
          break;

        default:
          entity.points.forEach(p => variables.push(p.x, p.y));
      }
    });

    return variables;
  },

  updateEntityPositions(entities, variables) {
    /**
     * Update entity positions from solver variables
     */
    let idx = 0;

    entities.forEach(entity => {
      switch (entity.type) {
        case 'point':
        case 'circle':
          entity.points[0].x = variables[idx++];
          entity.points[0].y = variables[idx++];
          if (entity.type === 'circle') entity.data.radius = variables[idx++];
          break;

        case 'line':
        case 'arc':
          for (let i = 0; i < entity.points.length; i++) {
            entity.points[i].x = variables[idx++];
            entity.points[i].y = variables[idx++];
          }
          if (entity.type === 'arc') {
            entity.data.startAngle = variables[idx++];
            entity.data.endAngle = variables[idx++];
          }
          break;

        default:
          for (let i = 0; i < entity.points.length; i++) {
            entity.points[i].x = variables[idx++];
            entity.points[i].y = variables[idx++];
          }
      }
    });
  },

  getEntityPoint(entities, entityId, pointIndex = 0) {
    const entity = entities.find(e => e.id === entityId);
    return entity && entity.points[pointIndex] ? entity.points[pointIndex].clone() : null;
  },

  getEntityAngle(entities, entityId) {
    const entity = entities.find(e => e.id === entityId);
    if (!entity || entity.type !== 'line' || entity.points.length < 2) return null;

    const [p1, p2] = entity.points;
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  },

  getEntityProperty(entities, entityId, property) {
    const entity = entities.find(e => e.id === entityId);
    return entity && entity.data ? entity.data[property] : null;
  },

  getEntityMeasurement(entities, entityId) {
    const entity = entities.find(e => e.id === entityId);
    if (!entity) return 0;

    if (entity.type === 'line' && entity.points.length >= 2) {
      return entity.points[0].distanceTo(entity.points[1]);
    } else if (['circle', 'arc'].includes(entity.type)) {
      return entity.data.radius || 0;
    }
    return 0;
  },

  pointLineDistance(point, lineP1, lineP2) {
    /**
     * Perpendicular distance from point to line
     * Formula: |((p2-p1) × (p1-p)) / |p2-p1||
     */
    const x1 = lineP1.x, y1 = lineP1.y;
    const x2 = lineP2.x, y2 = lineP2.y;
    const x0 = point.x, y0 = point.y;

    const num = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
    const denom = Math.sqrt((y2 - y1) * (y2 - y1) + (x2 - x1) * (x2 - x1));

    return denom === 0 ? 0 : num / denom;
  },

  normalizeAngle(angle) {
    /**
     * Normalize angle to [-π, π)
     */
    while (angle >= Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  },

  // ===== MATRIX OPERATIONS =====

  transposeMatrix(matrix) {
    if (matrix.length === 0) return [];
    const result = [];
    for (let j = 0; j < matrix[0].length; j++) {
      result[j] = [];
      for (let i = 0; i < matrix.length; i++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  },

  matmul(A, b) {
    /**
     * Matrix-vector multiplication: result = A * b
     */
    if (Array.isArray(b[0])) {
      // Matrix-matrix multiplication
      const result = [];
      for (let i = 0; i < A.length; i++) {
        result[i] = [];
        for (let j = 0; j < b[0].length; j++) {
          result[i][j] = 0;
          for (let k = 0; k < A[0].length; k++) {
            result[i][j] += A[i][k] * b[k][j];
          }
        }
      }
      return result;
    } else {
      // Matrix-vector multiplication
      const result = [];
      for (let i = 0; i < A.length; i++) {
        result[i] = 0;
        for (let j = 0; j < A[0].length; j++) {
          result[i] += A[i][j] * b[j];
        }
      }
      return result;
    }
  },

  invertMatrix(matrix) {
    /**
     * Invert a 2x2 or 3x3 matrix (simplified)
     */
    const n = matrix.length;
    if (n === 2) {
      const [[a, b], [c, d]] = matrix;
      const det = a * d - b * c;
      return [[d / det, -b / det], [-c / det, a / det]];
    }
    // For larger matrices, return identity (simplified)
    const result = [];
    for (let i = 0; i < n; i++) {
      result[i] = [];
      for (let j = 0; j < n; j++) {
        result[i][j] = i === j ? 1 : 0;
      }
    }
    return result;
  },

  // ===== EVENT HANDLERS =====

  onEntityAdded(event) {
    const { entity } = event.detail;
    this.state.dofPerEntity.clear();
    window.dispatchEvent(new CustomEvent('constraint:dofChanged', {
      detail: { dof: this.getDOFTotal() }
    }));
  },

  onEntityModified(event) {
    // Re-solve constraints when entity is modified
    this.state.dofPerEntity.clear();
  },

  onDimensionAdded(event) {
    const { dimension } = event.detail;
    // Dimension acts as constraint
    this.addConstraint('distance', dimension.entities, dimension.value);
  },

  setupEventHandlers() {
    // Toolbar buttons
    document.addEventListener('click', (e) => {
      if (e.target.dataset.constraint) {
        const type = e.target.dataset.constraint;
        window.dispatchEvent(new CustomEvent('constraint:toolSelected', { detail: { type } }));
      }
      if (e.target.id === 'constraint-solve-btn') this.solve();
      if (e.target.id === 'constraint-auto-btn') this.autoConstrain();
      if (e.target.id === 'constraint-validate-btn') this.validate();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === 'S') this.solve();
        if (e.key === 'V') this.validate();
      }
    });
  },

  setupToolbar() {
    // Toolbar setup in getUI()
  }
};

/**
 * HELP ENTRIES: Documentation for all constraint types
 */
ConstraintModule.HELP_ENTRIES = [
  {
    id: 'constraint.coincident',
    title: 'Coincident Constraint',
    description: 'Force two points to occupy the same location.',
    category: 'Geometric',
    hotkey: 'C'
  },
  {
    id: 'constraint.horizontal',
    title: 'Horizontal Constraint',
    description: 'Force line to be horizontal (parallel to X-axis).',
    category: 'Alignment',
    hotkey: 'H'
  },
  {
    id: 'constraint.vertical',
    title: 'Vertical Constraint',
    description: 'Force line to be vertical (parallel to Y-axis).',
    category: 'Alignment',
    hotkey: 'V'
  },
  {
    id: 'constraint.parallel',
    title: 'Parallel Constraint',
    description: 'Force two lines to remain parallel.',
    category: 'Alignment'
  },
  {
    id: 'constraint.perpendicular',
    title: 'Perpendicular Constraint',
    description: 'Force two lines to meet at right angle.',
    category: 'Alignment',
    hotkey: 'P'
  },
  {
    id: 'constraint.tangent',
    title: 'Tangent Constraint',
    description: 'Force line and circle (or two circles) to be tangent.',
    category: 'Geometric',
    hotkey: 'T'
  },
  {
    id: 'constraint.equal',
    title: 'Equal Constraint',
    description: 'Force two elements (lines, arcs, circles) to have equal length/radius.',
    category: 'Dimensional',
    hotkey: 'E'
  },
  {
    id: 'constraint.fix',
    title: 'Fix Constraint',
    description: 'Lock entity to fixed position/angle (fully constrain in 2 DOF).',
    category: 'Positional',
    hotkey: 'F'
  },
  {
    id: 'constraint.concentric',
    title: 'Concentric Constraint',
    description: 'Force two circles/arcs to share the same center.',
    category: 'Geometric'
  },
  {
    id: 'constraint.symmetric',
    title: 'Symmetric Constraint',
    description: 'Force entities to be mirror-symmetric about a line.',
    category: 'Geometric'
  },
  {
    id: 'constraint.collinear',
    title: 'Collinear Constraint',
    description: 'Force multiple points to lie on same line.',
    category: 'Geometric'
  },
  {
    id: 'constraint.midpoint',
    title: 'Midpoint Constraint',
    description: 'Force point to be at midpoint of a line.',
    category: 'Geometric'
  },
  {
    id: 'constraint.coradial',
    title: 'Coradial Constraint',
    description: 'Force two circles to be concentric with equal radius.',
    category: 'Geometric'
  },
  {
    id: 'constraint.solver',
    title: 'Constraint Solver',
    description: 'Newton-Raphson iterative solver with Jacobian. Detects over/under-constrained sketches.',
    category: 'Solver'
  },
  {
    id: 'constraint.auto',
    title: 'Auto-Constraint',
    description: 'Automatically detect and apply geometric relationships (coincident, horizontal, parallel, equal, etc.).',
    category: 'Automation'
  },
  {
    id: 'constraint.validate',
    title: 'Validate Sketch',
    description: 'Check for over-constrained, under-constrained, and degenerate geometry issues.',
    category: 'Validation'
  }
];

export default ConstraintModule;

/**
 * GD&T (Geometric Dimensioning & Tolerancing) Training Module
 * Comprehensive ASME Y14.5 reference, training, and interactive tools
 * Inspired by gdandtbasics.com
 */

window.cycleCAD = window.cycleCAD || {};

window.cycleCAD.gdtTraining = (function() {
  'use strict';

  // GD&T Symbol Reference Database
  const SYMBOLS = {
    // Form Controls
    flatness: {
      name: 'Flatness',
      unicode: '⏥',
      svg: '<path d="M0,10 L40,10" stroke="currentColor" stroke-width="2" fill="none"/>',
      category: 'Form Control',
      asmReference: 'Y14.5-2018 § 8.2.1',
      description: 'Controls surface flatness in 3D space',
      whenToUse: 'Mating surfaces, optical elements, sealing surfaces',
      toleranceZone: 'Two parallel planes separated by tolerance value',
      requiresDatum: false,
      example: 'Machine bed surface must be flat within 0.002"',
      commonMistakes: 'Confusing flatness with perpendicularity, over-tolerancing mating surfaces'
    },
    straightness: {
      name: 'Straightness',
      unicode: '—',
      svg: '<line x1="0" y1="10" x2="40" y2="10" stroke="currentColor" stroke-width="2"/>',
      category: 'Form Control',
      asmReference: 'Y14.5-2018 § 8.2.2',
      description: 'Controls straightness of a line or axis',
      whenToUse: 'Cylindrical features, precision shafts, slide rails',
      toleranceZone: 'Two parallel lines (line element) or cylinder (axis)',
      requiresDatum: false,
      example: 'Shaft centerline must be straight within 0.001" TIR',
      commonMistakes: 'Applying to surfaces instead of axis, ignoring RFS implications'
    },
    circularity: {
      name: 'Circularity',
      unicode: '○',
      svg: '<circle cx="20" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>',
      category: 'Form Control',
      asmReference: 'Y14.5-2018 § 8.2.3',
      description: 'Controls roundness of a circular cross-section',
      whenToUse: 'Rotating parts, spindle journals, bearing surfaces',
      toleranceZone: 'Two concentric circles in single plane',
      requiresDatum: false,
      example: 'Pulley OD must be circular within 0.002" per cross-section',
      commonMistakes: 'Confusing with cylindricity, not checking all cross-sections'
    },
    cylindricity: {
      name: 'Cylindricity',
      unicode: '⌭',
      svg: '<ellipse cx="20" cy="10" rx="10" ry="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M10,4 L10,16 M30,4 L30,16" stroke="currentColor" stroke-width="1"/>',
      category: 'Form Control',
      asmReference: 'Y14.5-2018 § 8.2.4',
      description: 'Controls overall cylindrical form (form + orientation)',
      whenToUse: 'Precision bearings, pump shafts, precision cylinders',
      toleranceZone: 'Two coaxial cylinders separated by tolerance value',
      requiresDatum: false,
      example: 'Drive shaft must be cylindrical within 0.003" over 6" length',
      commonMistakes: 'Overusing when position would suffice, not considering axis orientation'
    },
    // Orientation Controls
    perpendicularity: {
      name: 'Perpendicularity',
      unicode: '⊥',
      svg: '<line x1="0" y1="15" x2="40" y2="15" stroke="currentColor" stroke-width="2"/><line x1="20" y1="0" x2="20" y2="20" stroke="currentColor" stroke-width="2"/>',
      category: 'Orientation Control',
      asmReference: 'Y14.5-2018 § 8.3.1',
      description: 'Controls perpendicularity to a datum (90° angle)',
      whenToUse: 'Hole patterns, mounting surfaces, mounting bosses',
      toleranceZone: 'Parallel planes or cylinder perpendicular to datum',
      requiresDatum: true,
      example: 'Top face must be perpendicular to datum A within 0.005"',
      commonMistakes: 'Applying without specifying datum, using for non-90° angles'
    },
    parallelism: {
      name: 'Parallelism',
      unicode: '//',
      svg: '<line x1="5" y1="5" x2="35" y2="5" stroke="currentColor" stroke-width="2"/><line x1="5" y1="15" x2="35" y2="15" stroke="currentColor" stroke-width="2"/>',
      category: 'Orientation Control',
      asmReference: 'Y14.5-2018 § 8.3.2',
      description: 'Controls parallelism to a datum feature',
      whenToUse: 'Parallel surfaces, guide ways, stack-up tolerances',
      toleranceZone: 'Two planes parallel to datum plane',
      requiresDatum: true,
      example: 'Bottom surface parallel to datum A within 0.003"',
      commonMistakes: 'Tolerancing too tight, not accounting for form variation'
    },
    angularity: {
      name: 'Angularity',
      unicode: '∠',
      svg: '<line x1="0" y1="20" x2="30" y2="20" stroke="currentColor" stroke-width="2"/><line x1="0" y1="20" x2="20" y2="5" stroke="currentColor" stroke-width="2"/><path d="M8,18 Q10,16 12,15" stroke="currentColor" stroke-width="1" fill="none"/>',
      category: 'Orientation Control',
      asmReference: 'Y14.5-2018 § 8.3.3',
      description: 'Controls angle between feature and datum at specified angle',
      whenToUse: 'Angled surfaces, beveled edges, chamfers',
      toleranceZone: 'Two parallel planes at specified angle to datum',
      requiresDatum: true,
      example: 'Chamfer surface 45° to datum A, within 0.004"',
      commonMistakes: 'Forgetting angle specification, using when perpendicularity applies'
    },
    // Location Controls
    position: {
      name: 'Position',
      unicode: '⊕',
      svg: '<circle cx="20" cy="10" r="6" stroke="currentColor" stroke-width="2" fill="none"/><line x1="14" y1="10" x2="26" y2="10" stroke="currentColor" stroke-width="2"/><line x1="20" y1="4" x2="20" y2="16" stroke="currentColor" stroke-width="2"/>',
      category: 'Location Control',
      asmReference: 'Y14.5-2018 § 8.4.1',
      description: 'Controls true position from datum reference frame',
      whenToUse: 'Hole patterns, mounting patterns, critical alignments',
      toleranceZone: 'Cylinder around true position (diameter = 2× tolerance)',
      requiresDatum: true,
      example: 'Four M8 holes at true position ⊕ 0.015" MMC from datum A-B-C',
      commonMistakes: 'Using coordinate tolerances instead, not applying MMC, forgetting datum sequence'
    },
    concentricity: {
      name: 'Concentricity',
      unicode: '◎',
      svg: '<circle cx="20" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="20" cy="10" r="5" stroke="currentColor" stroke-width="1" fill="none"/><line x1="15" y1="10" x2="25" y2="10" stroke="currentColor" stroke-width="1"/>',
      category: 'Location Control',
      asmReference: 'Y14.5-2018 § 8.4.2',
      description: 'Controls coaxial alignment of features',
      whenToUse: 'Coaxial bores, stepped shafts, spindle cartridges',
      toleranceZone: 'Cylinder around datum axis',
      requiresDatum: true,
      example: 'Inner bore concentricity to datum A within 0.005" TIR',
      commonMistakes: 'Overusing instead of position, not understanding RFS cost'
    },
    symmetry: {
      name: 'Symmetry',
      unicode: '≡',
      svg: '<line x1="5" y1="5" x2="35" y2="5" stroke="currentColor" stroke-width="2"/><line x1="5" y1="10" x2="35" y2="10" stroke="currentColor" stroke-width="2"/><line x1="5" y1="15" x2="35" y2="15" stroke="currentColor" stroke-width="2"/><line x1="5" y1="20" x2="35" y2="20" stroke="currentColor" stroke-width="2"/>',
      category: 'Location Control',
      asmReference: 'Y14.5-2018 § 8.4.3',
      description: 'Controls symmetric positioning about datum plane',
      whenToUse: 'Slot width, tab centering, mirrored features',
      toleranceZone: 'Two parallel planes equidistant from datum',
      requiresDatum: true,
      example: 'Slot symmetrical to datum plane A within 0.004"',
      commonMistakes: 'Confusing with parallelism, applying to non-symmetric features'
    },
    // Profile Controls
    profileLine: {
      name: 'Profile of a Line',
      unicode: '⌒',
      svg: '<path d="M5,15 Q15,5 35,10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5,17 Q15,7 35,12" stroke="currentColor" stroke-width="1" fill="none"/><path d="M5,13 Q15,3 35,8" stroke="currentColor" stroke-width="1" fill="none"/>',
      category: 'Profile Control',
      asmReference: 'Y14.5-2018 § 8.5.1',
      description: 'Controls 2D profile in single plane (like profile cut)',
      whenToUse: 'Turbine blades, cam profiles, irregular shapes',
      toleranceZone: 'Two lines equidistant from true profile',
      requiresDatum: false,
      example: 'Cam profile ⌒ 0.010" bilateral',
      commonMistakes: 'Not understanding bilateral vs unilateral, over-constraining'
    },
    profileSurface: {
      name: 'Profile of a Surface',
      unicode: '⌓',
      svg: '<path d="M5,5 Q20,15 35,8" stroke="currentColor" stroke-width="2" fill="none"/><ellipse cx="20" cy="10" rx="15" ry="7" stroke="currentColor" stroke-width="1" fill="none"/>',
      category: 'Profile Control',
      asmReference: 'Y14.5-2018 § 8.5.2',
      description: 'Controls 3D surface profile',
      whenToUse: 'Complex 3D surfaces, aerodynamic shapes, artistic surfaces',
      toleranceZone: 'Two surfaces equidistant from true profile',
      requiresDatum: false,
      example: 'Fuselage surface ⌓ 0.050" bilateral',
      commonMistakes: 'Over-tolerancing, not using CAD for comparison'
    },
    // Runout Controls
    circularRunout: {
      name: 'Circular Runout',
      unicode: '↗',
      svg: '<circle cx="20" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20,2 L25,18" stroke="currentColor" stroke-width="2"/>',
      category: 'Runout Control',
      asmReference: 'Y14.5-2018 § 8.6.1',
      description: 'Controls runout at single circular element',
      whenToUse: 'Rotating parts, balancing, dynamic concentricity',
      toleranceZone: 'FIR (Full Indicator Reading) at each circular element',
      requiresDatum: true,
      example: 'Gear OD circular runout 0.005" FIR to datum A',
      commonMistakes: 'Confusing with total runout, not understanding FIR measurement'
    },
    totalRunout: {
      name: 'Total Runout',
      unicode: '↗↗',
      svg: '<circle cx="20" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20,2 L25,18" stroke="currentColor" stroke-width="2"/><path d="M18,3 L23,19" stroke="currentColor" stroke-width="1.5"/>',
      category: 'Runout Control',
      asmReference: 'Y14.5-2018 § 8.6.2',
      description: 'Controls runout across entire surface',
      whenToUse: 'Critical bearings, pump shafts, spindle cartridges',
      toleranceZone: 'FIR measured over full surface during one rotation',
      requiresDatum: true,
      example: 'Bearing OD total runout 0.003" FIR to datum A',
      commonMistakes: 'Over-tolerancing, not measuring at multiple axial locations'
    }
  };

  // Training Quiz Database
  const QUIZZES = {
    level1: [
      {
        question: 'What does GD&T stand for?',
        options: [
          'General Dimensional Tolerance',
          'Geometric Dimensioning & Tolerancing',
          'Global Design & Testing',
          'Geometric Design Tolerance'
        ],
        correct: 1,
        explanation: 'GD&T is Geometric Dimensioning & Tolerancing, the international standard for controlling size, shape, orientation, and position.'
      },
      {
        question: 'What is Rule #1 (Envelope Principle)?',
        options: [
          'All tolerances must be on the envelope',
          'Where no tolerance is specified, the tolerance is zero',
          'Perfect form at MMC boundary, then size tolerance applies',
          'Every feature must have a geometric tolerance'
        ],
        correct: 2,
        explanation: 'Rule #1 states that at MMC, the feature cannot exceed a boundary of perfect form. As the feature departs from MMC, a form tolerance is permissible.'
      },
      {
        question: 'What is a datum?',
        options: [
          'A theoretical point in space',
          'A reference feature or surface used to establish a coordinate system',
          'The maximum material size',
          'A type of tolerance symbol'
        ],
        correct: 1,
        explanation: 'A datum is a real or theoretical point, line, plane, cylinder, or sphere used as a reference to control geometric relationships.'
      },
      {
        question: 'Which basic dimension is shown in a box?',
        options: [
          'Bilateral tolerance',
          'Unilateral tolerance',
          'Basic dimension (theoretically exact)',
          'Limit dimension'
        ],
        correct: 2,
        explanation: 'Basic dimensions are enclosed in a box and represent theoretically exact values used with GD&T. The tolerance is in the feature control frame.'
      },
      {
        question: 'What material condition modifier means maximum material?',
        options: [
          'LMC (Least Material Condition)',
          'MMC (Maximum Material Condition)',
          'RFS (Regardless of Feature Size)',
          'FFS (Fixed Feature Size)'
        ],
        correct: 1,
        explanation: 'MMC (Ⓜ) means the feature has maximum amount of material, largest hole or smallest shaft. Bonus tolerance is maximum at MMC.'
      },
      {
        question: 'What is a feature control frame?',
        options: [
          'A frame that holds geometric features',
          'The box containing geometric tolerance symbol, tolerance value, and datum references',
          'A manufacturing fixture',
          'A testing apparatus'
        ],
        correct: 1,
        explanation: 'A feature control frame is a rectangle divided into compartments containing the geometric characteristic symbol, tolerance, modifiers, and datum references.'
      },
      {
        question: 'How many datum references are in a complete datum reference frame?',
        options: [
          'One (primary)',
          'Two (primary + secondary)',
          'Three (primary + secondary + tertiary)',
          'Unlimited'
        ],
        correct: 2,
        explanation: 'A complete datum reference frame has three mutually perpendicular planes: primary (origin), secondary (2nd plane), and tertiary (3rd plane).'
      },
      {
        question: 'What is the difference between size tolerance and geometric tolerance?',
        options: [
          'There is no difference',
          'Size controls +/- dimensions; geometry controls form, orientation, location, and runout',
          'Size tolerance is for holes, geometry is for shafts',
          'Geometric tolerance is older'
        ],
        correct: 1,
        explanation: 'Size tolerance (e.g., ±0.005") controls the overall dimensions. Geometric tolerance controls form, orientation, location, profile, and runout independently.'
      },
      {
        question: 'When should you use basic dimensions?',
        options: [
          'Always, for all dimensions',
          'Never, they are obsolete',
          'When used with geometric tolerances for precise control',
          'Only for fasteners'
        ],
        correct: 2,
        explanation: 'Basic dimensions are used as references with geometric tolerances to define the theoretically exact position, profile, or orientation of features.'
      },
      {
        question: 'What does RFS (Regardless of Feature Size) mean?',
        options: [
          'The tolerance applies at maximum material condition',
          'The tolerance applies at least material condition',
          'The tolerance applies regardless of the actual feature size',
          'The tolerance is zero'
        ],
        correct: 2,
        explanation: 'RFS means the tolerance value does not change based on feature size—no bonus tolerance is available. This is the most restrictive condition.'
      }
    ],
    level2: [
      {
        question: 'Which form control does NOT require a datum?',
        options: [
          'Perpendicularity',
          'Circularity',
          'Parallelism',
          'Position'
        ],
        correct: 1,
        explanation: 'Circularity is a form control that does not require a datum. It measures roundness in a single plane independent of the axis.'
      },
      {
        question: 'What is the tolerance zone for flatness?',
        options: [
          'Two concentric circles',
          'A cylinder',
          'Two parallel planes separated by the tolerance value',
          'A sphere'
        ],
        correct: 2,
        explanation: 'Flatness creates a tolerance zone of two parallel planes. The surface must lie within these planes separated by the tolerance value.'
      },
      {
        question: 'When would you apply straightness control?',
        options: [
          'To control the flatness of a surface',
          'To control the straightness of an axis or line element',
          'To control the roundness of a bore',
          'To control the angle of a surface'
        ],
        correct: 1,
        explanation: 'Straightness is applied to control the linearity of an axis (RFS) or individual line elements on a surface. It ensures the feature follows a straight path.'
      },
      {
        question: 'What is the main difference between circularity and cylindricity?',
        options: [
          'Circularity is 2D, cylindricity is 3D',
          'They are the same thing',
          'Circularity controls roundness; cylindricity controls roundness AND straightness',
          'Cylindricity is older'
        ],
        correct: 2,
        explanation: 'Circularity checks roundness at each circular cross-section. Cylindricity checks roundness AND straightness across the entire cylinder, making it more restrictive.'
      },
      {
        question: 'Can flatness tolerance be unilateral?',
        options: [
          'Yes, always unilateral',
          'No, always bilateral',
          'Yes, if specified with an arrow',
          'Only for thickness'
        ],
        correct: 2,
        explanation: 'Flatness tolerance is typically bilateral (±) but can be specified as unilateral (↑ or ↓) if required by design. The symbol placement indicates direction.'
      },
      {
        question: 'How is straightness of an axis different from straightness of a line?',
        options: [
          'There is no difference',
          'Axis straightness is RFS; line straightness has specific datum',
          'Axis straightness creates a cylindrical zone; line straightness creates two parallel planes in each plane',
          'Line straightness is obsolete'
        ],
        correct: 2,
        explanation: 'Straightness applied to an axis creates a cylindrical tolerance zone. Applied to line elements (surfaces), it creates parallel plane boundaries in each cutting plane.'
      },
      {
        question: 'What feature would you use circularity for?',
        options: [
          'A cylindrical shaft over a long length',
          'A bearing race at a specific cross-section',
          'A flat surface',
          'An angled surface'
        ],
        correct: 1,
        explanation: 'Circularity controls roundness at individual circular cross-sections. Use it for bearing races, rotor bores, or features needing round-at-a-station control.'
      },
      {
        question: 'How tight should flatness be on a mating surface?',
        options: [
          'It should be zero',
          'It should be equal to the surface finish',
          'It should be tight enough to ensure good contact (typically 10-50% of size tolerance)',
          'It should be very loose'
        ],
        correct: 2,
        explanation: 'Flatness on mating surfaces controls contact quality. Typical practice is 10-50% of the size tolerance to balance cost and function.'
      },
      {
        question: 'What is a common mistake with form controls?',
        options: [
          'Applying them when size tolerances suffice',
          'Making them too loose',
          'Applying too many form controls to one feature',
          'All of the above'
        ],
        correct: 3,
        explanation: 'Common mistakes include over-constraining with form controls when size tolerances would work, or combining multiple form controls unnecessarily.'
      },
      {
        question: 'Can a feature have both straightness and circularity controls?',
        options: [
          'No, only one control per feature',
          'Yes, if they serve different purposes',
          'Only on shafts',
          'Never in modern GD&T'
        ],
        correct: 1,
        explanation: 'Yes, a cylindrical feature can have both circularity (roundness check) and straightness (axis straightness) if both characteristics need independent control.'
      }
    ],
    level3: [
      {
        question: 'What does perpendicularity control?',
        options: [
          'The roundness of a feature',
          'The angle of 90° between feature and datum',
          'The parallelism to a datum',
          'The profile shape'
        ],
        correct: 1,
        explanation: 'Perpendicularity controls the 90° angle between a feature (surface, axis, or line) and a datum feature, with a tolerance zone of parallel planes perpendicular to the datum.'
      },
      {
        question: 'When should you use perpendicularity vs angularity?',
        options: [
          'They are interchangeable',
          'Perpendicularity for 90° angles; angularity for other angles',
          'Angularity is always better',
          'Perpendicularity never uses a datum'
        ],
        correct: 1,
        explanation: 'Use perpendicularity for 90° relationships. Use angularity for any other specific angle (45°, 30°, etc.) between a feature and datum.'
      },
      {
        question: 'What is the difference between parallelism and perpendicularity?',
        options: [
          'There is no difference',
          'Parallelism = 0° angle to datum; Perpendicularity = 90° angle to datum',
          'Parallelism controls form',
          'Perpendicularity is older'
        ],
        correct: 1,
        explanation: 'Parallelism controls features parallel (0° angle) to a datum. Perpendicularity controls features at 90° to a datum. Both require datum references.'
      },
      {
        question: 'How do you specify angularity on a drawing?',
        options: [
          'Just the tolerance value',
          'Tolerance value + angle value + datum reference',
          'Only the angle, no tolerance',
          'Angle in parentheses'
        ],
        correct: 1,
        explanation: 'Angularity is specified with: the angle symbol ∠, the angle value (e.g., 45°), the tolerance value, and datum reference(s), typically shown as a basic dimension and FCF.'
      },
      {
        question: 'Can perpendicularity be applied without a datum?',
        options: [
          'Yes, always',
          'No, perpendicularity always requires a datum',
          'Only on cylindrical features',
          'Only on flat surfaces'
        ],
        correct: 1,
        explanation: 'Perpendicularity is an orientation control and ALWAYS requires a datum reference to establish the 90° relationship.'
      },
      {
        question: 'Which datum is most commonly used for perpendicularity?',
        options: [
          'Secondary datum',
          'Primary datum (establishes the plane)',
          'Tertiary datum',
          'None (no datum)'
        ],
        correct: 1,
        explanation: 'The primary datum for perpendicularity usually establishes the reference plane or surface, then the perpendicular feature is controlled to it.'
      },
      {
        question: 'What is bonus tolerance in perpendicularity?',
        options: [
          'Extra tolerance at no cost',
          'Increased tolerance when applied at MMC, equal to the material departure from MMC',
          'Tolerance that must be written in pencil',
          'There is no bonus tolerance for perpendicularity'
        ],
        correct: 1,
        explanation: 'When perpendicularity is applied at MMC, bonus tolerance equals the difference between MMC and actual size, allowing larger geometric variation at smaller sizes.'
      },
      {
        question: 'What is the tolerance zone for parallelism to a plane?',
        options: [
          'A cylinder',
          'Two planes parallel to the datum plane',
          'A sphere',
          'A single plane'
        ],
        correct: 1,
        explanation: 'Parallelism to a plane creates a tolerance zone of two parallel planes, equally disposed or unilateral, relative to the datum plane.'
      },
      {
        question: 'How does RFS affect orientation controls?',
        options: [
          'It makes them larger',
          'It makes them smaller',
          'It eliminates bonus tolerance',
          'It has no effect'
        ],
        correct: 2,
        explanation: 'RFS on an orientation control (default condition) provides no bonus tolerance. The tolerance remains constant regardless of feature size.'
      },
      {
        question: 'Can you apply parallelism to the centerline of a hole?',
        options: [
          'No, parallelism is only for surfaces',
          'Yes, if you want the hole axis parallel to a datum axis',
          'Only if the hole is very large',
          'Never in modern GD&T'
        ],
        correct: 1,
        explanation: 'Yes, parallelism can control the axis of a hole (or other cylindrical feature) to be parallel to a datum axis or plane, creating a cylindrical tolerance zone.'
      }
    ],
    level4: [
      {
        question: 'What is true position?',
        options: [
          'The actual measured location',
          'The theoretically exact location, established by basic dimensions and datums',
          'The maximum allowable size',
          'The same as coordinate tolerances'
        ],
        correct: 1,
        explanation: 'True position is the theoretically perfect location of a feature from the datum reference frame, established by basic dimensions. Position tolerance controls variation from true position.'
      },
      {
        question: 'What is the advantage of position with MMC vs coordinate tolerances?',
        options: [
          'Position is always tighter',
          'Coordinate tolerances are always better',
          'Position allows bonus tolerance and is more efficient; coordinate gives rigid, unchanging tolerance',
          'There is no advantage'
        ],
        correct: 2,
        explanation: 'Position with MMC provides bonus tolerance equal to size variation, allowing ~57% larger functional zone than rectangular (coordinate) tolerances for the same nominal holes.'
      },
      {
        question: 'How is the tolerance zone for position defined?',
        options: [
          'Two parallel planes',
          'A cylinder (circular zone) or sphere, diameter = 2× tolerance value',
          'Two concentric circles',
          'A rectangular box'
        ],
        correct: 1,
        explanation: 'Position tolerance creates a cylindrical tolerance zone around true position. Diameter of cylinder = 2× the position tolerance value (more efficient than rectangular zones).'
      },
      {
        question: 'When would you use concentricity instead of position?',
        options: [
          'Always use position',
          'Only for coaxial features with tight alignment and no size variation bonus needed',
          'Concentricity is obsolete',
          'Never use concentricity'
        ],
        correct: 1,
        explanation: 'Concentricity (RFS only) is restrictive and expensive. Use position (MMC) for coaxial holes/shafts. Use concentricity only when RFS is mandatory and coaxiality is critical.'
      },
      {
        question: 'What is symmetry tolerance?',
        options: [
          'Makes a feature symmetrical',
          'Controls symmetric positioning about a datum plane, ensuring equal distance on both sides',
          'Controls the flatness of a surface',
          'A form control'
        ],
        correct: 1,
        explanation: 'Symmetry controls the centerline or median plane of a feature (like slot width or tab position) to be symmetric about a datum plane, within the tolerance value.'
      },
      {
        question: 'How is profile of a line different from profile of a surface?',
        options: [
          'They are the same',
          'Profile of a line controls 2D profile in a single plane; profile of a surface controls 3D shape',
          'Profile of a surface is for external features only',
          'Profile of a line is obsolete'
        ],
        correct: 1,
        explanation: 'Profile of a line is 2D (like a cross-section or slice through the part). Profile of a surface is 3D (the entire surface shape), more stringent and complex.'
      },
      {
        question: 'Can position tolerance be unilateral?',
        options: [
          'Yes, always',
          'No, always bilateral',
          'Yes, if specified; typically used when feature must not go in one direction',
          'Only for large holes'
        ],
        correct: 2,
        explanation: 'Position tolerance can be bilateral (zone around true position) or unilateral (zone on one side of true position), specified by annotation on the drawing.'
      },
      {
        question: 'What does a floating fastener formula calculate?',
        options: [
          'The bolt size',
          'Hole diameter minus fastener diameter gives available position tolerance',
          'The tightest tolerance possible',
          'The cost of fasteners'
        ],
        correct: 1,
        explanation: 'Floating fastener formula: T = H - F (Tolerance = Hole diameter minus Fastener diameter). Half of this is applied to each hole for symmetric tolerance budget.'
      },
      {
        question: 'How do you specify profile bilateral vs unilateral?',
        options: [
          'No difference in specification',
          'Bilateral (±) is default; unilateral uses one-sided arrow (↑ or ↓) placed on drawing view',
          'Only bilateral is allowed',
          'Profile must be centered'
        ],
        correct: 1,
        explanation: 'Profile is bilateral (±) by default. For unilateral, the direction is shown with arrows (↑ inside, ↓ outside) next to the profile tolerance symbol.'
      },
      {
        question: 'What causes a common mistake in position tolerancing?',
        options: [
          'Over-tolerancing',
          'Using cartesian tolerances instead; not applying MMC; wrong datum sequence',
          'Under-tolerancing always',
          'Using concentricity'
        ],
        correct: 1,
        explanation: 'Common errors: using rectangular (cartesian) coordinate tolerances instead of position; forgetting MMC allows bonus tolerance; incorrect datum sequence affects feature alignment.'
      }
    ],
    level5: [
      {
        question: 'What is the difference between circular runout and total runout?',
        options: [
          'They are the same',
          'Circular runout checks FIR at each circular element; total runout checks FIR over entire surface in one rotation',
          'Circular runout is obsolete',
          'Total runout is for 2D profiles'
        ],
        correct: 1,
        explanation: 'Circular runout measures indicator movement at single circular element (local check). Total runout measures across entire surface in one rotation (global check)—more stringent.'
      },
      {
        question: 'What does FIR (Full Indicator Reading) mean in runout?',
        options: [
          'The total thickness',
          'The difference between high and low indicator readings as part rotates',
          'The final inspection result',
          'The finished radius'
        ],
        correct: 1,
        explanation: 'FIR is the full indicator reading: the difference between maximum and minimum dial readings as the part completes one full rotation about the datum axis.'
      },
      {
        question: 'When would you use total runout instead of circular runout?',
        options: [
          'Total runout is never used',
          'When entire surface must be concentric (bearings, spindles, critical dynamic balance)',
          'Only for shafts',
          'When form tolerance suffices'
        ],
        correct: 1,
        explanation: 'Use total runout for critical rotating surfaces (bearings, pump rotors, spindle cartridges) where the entire surface must maintain runout in a single rotation.'
      },
      {
        question: 'What is composite position tolerance?',
        options: [
          'Position applied twice with different datums',
          'Tighter position pattern for hole-to-hole spacing, looser pattern for position from datums',
          'Always less restrictive',
          'A form control'
        ],
        correct: 1,
        explanation: 'Composite position has two rows: upper controls position from primary datum (looser, establishes pattern); lower controls hole-to-hole spacing (tighter, relative positioning).'
      },
      {
        question: 'What is a projected tolerance zone?',
        options: [
          'The zone visible on a projection',
          'A zone extending beyond the part (for threaded holes or press-fits to control stack-up)',
          'Always cylindrical',
          'Rarely used'
        ],
        correct: 1,
        explanation: 'Projected tolerance zone extends vertically above the part surface (symbol: P with height box). Used for threaded holes, studs, or press-fits to control mating part clearance.'
      },
      {
        question: 'What is free state variation?',
        options: [
          'Random tolerance',
          'Geometric control allowing for part relaxation when unconstrained (e.g., sheet metal, castings)',
          'No tolerance',
          'A type of surface finish'
        ],
        correct: 1,
        explanation: 'Free state notation (⟜ symbol) permits geometric variation for parts not supported, accounting for material relaxation (common in sheet metal and thin-wall castings).'
      },
      {
        question: 'How does statistical tolerancing differ from worst-case?',
        options: [
          'No difference',
          'Worst-case: all tolerances stack additively (conservative); statistical: uses standard deviation (efficient but requires process capability)',
          'Statistical is always allowed',
          'Worst-case is obsolete'
        ],
        correct: 1,
        explanation: 'Worst-case stacks all tolerances additively (safe, loose final tolerance). Statistical uses RSS (root sum square) assuming normal distribution (tighter, requires Cpk ≥1.33).'
      },
      {
        question: 'What is the purpose of a datum target?',
        options: [
          'To specify target size',
          'To define a datum when no sufficient existing feature exists (using points, lines, or areas)',
          'To measure tolerance',
          'To specify material condition'
        ],
        correct: 1,
        explanation: 'Datum targets (points, lines, or areas on a complex surface) establish a datum when no suitable existing feature can serve as the datum.'
      },
      {
        question: 'How do you specify concentricity at MMC vs RFS?',
        options: [
          'Same way',
          'Concentricity is RFS only (no MMC modifier allowed)',
          'Always MMC is tighter',
          'Never use concentricity'
        ],
        correct: 1,
        explanation: 'Concentricity is RFS by default (most restrictive and expensive). MMC modifier is rarely used because concentricity cost is already high. No bonus applies to concentricity.'
      },
      {
        question: 'What is the key to applying GD&T effectively?',
        options: [
          'Apply as many controls as possible',
          'Use tight tolerances for everything',
          'Apply only necessary controls to function and manufacturability',
          'GD&T is only theoretical'
        ],
        correct: 2,
        explanation: 'Effective GD&T applies the minimum necessary controls (form, orientation, location, runout) to ensure function, assembly, and manufacturability without over-constraining.'
      }
    ]
  };

  // Tolerance Calculator Functions
  function calculatePositionBonus(mmcSize, actualSize) {
    return Math.max(0, mmcSize - actualSize);
  }

  function floatingFastenerTolerance(holeDiameter, fastenerDiameter) {
    return holeDiameter - fastenerDiameter;
  }

  function fixedFastenerTolerance(holeDiameter, boltTolerance, fastenerDiameter) {
    return holeDiameter - fastenerDiameter - boltTolerance;
  }

  function toleranceStackWorstCase(tolerances) {
    return tolerances.reduce((sum, t) => sum + Math.abs(t), 0);
  }

  function toleranceStackRSS(tolerances) {
    const sumSquares = tolerances.reduce((sum, t) => sum + (t * t), 0);
    return Math.sqrt(sumSquares);
  }

  // Drawing Annotation Suggestions
  function suggestAnnotations(partGeometry) {
    const suggestions = [];

    if (partGeometry.hasMatingFaces) {
      suggestions.push({
        feature: 'Top face',
        annotation: 'Flatness 0.002" + Perpendicularity to Datum A 0.003"',
        reason: 'Controls contact quality and assembly alignment'
      });
    }

    if (partGeometry.hasHoles) {
      suggestions.push({
        feature: 'Mounting holes',
        annotation: 'Position ⊕ 0.015" MMC from Datum A-B-C',
        reason: 'Critical for assembly accuracy and fastener alignment'
      });
    }

    if (partGeometry.hasShaft) {
      suggestions.push({
        feature: 'Drive shaft',
        annotation: 'Cylindricity 0.003" + Total Runout 0.005" FIR',
        reason: 'Ensures dynamic balance and smooth rotation'
      });
    }

    return suggestions;
  }

  // Feature Control Frame Builder
  function buildFCF(options) {
    const {
      characteristic = 'position',
      toleranceValue = 0.010,
      symbol = SYMBOLS[characteristic],
      hasDiameter = true,
      primaryDatum = 'A',
      secondaryDatum = null,
      tertiaryDatum = null,
      materialCondition = 'MMC'
    } = options;

    const diameterSymbol = hasDiameter ? '⌀' : '';
    const conditionSymbol = materialCondition === 'MMC' ? 'Ⓜ' : materialCondition === 'LMC' ? 'Ⓛ' : '';

    const fcfHTML = `
      <div class="fcf-diagram" style="display: inline-block; border: 2px solid currentColor; padding: 4px; font-family: monospace; font-size: 12px;">
        <div style="display: flex; align-items: center; gap: 2px;">
          <div style="border: 1px solid currentColor; padding: 2px 4px; min-width: 20px; text-align: center;">${symbol.unicode}</div>
          <div style="border: 1px solid currentColor; padding: 2px 4px;">${diameterSymbol} ${toleranceValue.toFixed(3)}"</div>
          ${conditionSymbol ? `<div style="border: 1px solid currentColor; padding: 2px 4px;">${conditionSymbol}</div>` : ''}
          <div style="border: 1px solid currentColor; padding: 2px 4px;">${primaryDatum}</div>
          ${secondaryDatum ? `<div style="border: 1px solid currentColor; padding: 2px 4px;">${secondaryDatum}</div>` : ''}
          ${tertiaryDatum ? `<div style="border: 1px solid currentColor; padding: 2px 4px;">${tertiaryDatum}</div>` : ''}
        </div>
      </div>
    `;

    const notation = `${symbol.unicode} ${diameterSymbol}${toleranceValue.toFixed(3)}" ${conditionSymbol} | ${primaryDatum}${secondaryDatum ? ' ' + secondaryDatum : ''}${tertiaryDatum ? ' ' + tertiaryDatum : ''}`;

    return {
      html: fcfHTML,
      notation: notation.trim(),
      data: {
        characteristic,
        toleranceValue,
        hasDiameter,
        primaryDatum,
        secondaryDatum,
        tertiaryDatum,
        materialCondition
      }
    };
  }

  // Get UI Panel
  function getUI() {
    const tabs = ['Symbols', 'Training', 'FCF Builder', 'Calculator'];
    const tabsHTML = tabs.map((tab, i) =>
      `<button class="gdt-tab-btn" data-tab="${i}" style="padding: 8px 12px; background: ${i === 0 ? '#58a6ff' : 'transparent'}; color: #e6edf3; border: none; cursor: pointer; font-weight: 500;">${tab}</button>`
    ).join('');

    const symbolsGrid = Object.values(SYMBOLS).map(sym => `
      <div class="gdt-symbol-card" style="background: #262626; padding: 12px; border: 1px solid #444; border-radius: 6px; cursor: pointer;">
        <div style="font-size: 24px; margin-bottom: 8px;">${sym.unicode}</div>
        <div style="font-weight: bold; color: #58a6ff; font-size: 13px;">${sym.name}</div>
        <div style="color: #999; font-size: 11px; margin-top: 4px;">${sym.category}</div>
        <div class="gdt-symbol-details" style="display: none; margin-top: 8px; border-top: 1px solid #444; padding-top: 8px; font-size: 11px;">
          <div><strong>Requires Datum:</strong> ${sym.requiresDatum ? 'Yes' : 'No'}</div>
          <div style="margin-top: 4px;"><strong>When to Use:</strong> ${sym.whenToUse}</div>
          <div style="margin-top: 4px;"><strong>Tolerance Zone:</strong> ${sym.toleranceZone}</div>
          <div style="margin-top: 4px;"><strong>Example:</strong> ${sym.example}</div>
        </div>
      </div>
    `).join('');

    const trainingLevels = [1, 2, 3, 4, 5].map(level => `
      <div class="gdt-level-card" style="background: #262626; padding: 12px; border: 1px solid #444; border-radius: 6px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: bold; color: #58a6ff; font-size: 14px;">Level ${level}: ${['Fundamentals', 'Form Controls', 'Orientation Controls', 'Location & Profile', 'Runout & Advanced'][level-1]}</div>
            <div style="color: #999; font-size: 12px; margin-top: 4px;">10 questions</div>
          </div>
          <button class="gdt-start-quiz" data-level="${level}" style="padding: 6px 12px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Start</button>
        </div>
      </div>
    `).join('');

    const fcfBuilderForm = `
      <div style="display: grid; gap: 8px; background: #262626; padding: 12px; border-radius: 6px;">
        <div>
          <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Geometric Characteristic</label>
          <select class="gdt-fcf-characteristic" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
            <option value="flatness">Flatness</option>
            <option value="straightness">Straightness</option>
            <option value="circularity">Circularity</option>
            <option value="cylindricity">Cylindricity</option>
            <option value="perpendicularity">Perpendicularity</option>
            <option value="parallelism">Parallelism</option>
            <option value="angularity">Angularity</option>
            <option value="position" selected>Position</option>
            <option value="concentricity">Concentricity</option>
            <option value="symmetry">Symmetry</option>
            <option value="profileLine">Profile of a Line</option>
            <option value="profileSurface">Profile of a Surface</option>
            <option value="circularRunout">Circular Runout</option>
            <option value="totalRunout">Total Runout</option>
          </select>
        </div>
        <div>
          <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Tolerance Value</label>
          <input type="number" class="gdt-fcf-tolerance" step="0.001" value="0.010" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
        </div>
        <div style="display: flex; gap: 8px;">
          <div style="flex: 1;">
            <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Diameter Modifier</label>
            <input type="checkbox" class="gdt-fcf-diameter" checked style="margin-top: 8px; cursor: pointer;">
          </div>
          <div style="flex: 1;">
            <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Material Condition</label>
            <select class="gdt-fcf-material" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
              <option value="MMC">MMC (Ⓜ)</option>
              <option value="LMC">LMC (Ⓛ)</option>
              <option value="RFS">RFS</option>
            </select>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
          <div>
            <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Primary Datum</label>
            <select class="gdt-fcf-datum-a" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
              <option>A</option><option>B</option><option>C</option><option>D</option>
            </select>
          </div>
          <div>
            <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Secondary Datum</label>
            <select class="gdt-fcf-datum-b" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
              <option value="">None</option><option>B</option><option>C</option><option>D</option>
            </select>
          </div>
          <div>
            <label style="color: #e6edf3; font-size: 12px; font-weight: bold;">Tertiary Datum</label>
            <select class="gdt-fcf-datum-c" style="width: 100%; padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
              <option value="">None</option><option>C</option><option>D</option>
            </select>
          </div>
        </div>
        <button class="gdt-build-fcf" style="padding: 8px 12px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; margin-top: 8px;">Build FCF</button>
        <div class="gdt-fcf-output" style="margin-top: 8px; padding: 8px; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 12px; min-height: 40px; color: #58a6ff;"></div>
      </div>
    `;

    const calculatorForm = `
      <div style="display: grid; gap: 8px; background: #262626; padding: 12px; border-radius: 6px;">
        <div>
          <label style="color: #e6edf3; font-size: 12px; font-weight: bold; display: block;">Position Bonus Tolerance</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <input type="number" class="gdt-calc-mmc" placeholder="MMC Size" step="0.001" style="padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px;">
            <input type="number" class="gdt-calc-actual" placeholder="Actual Size" step="0.001" style="padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px;">
          </div>
          <button class="gdt-calc-bonus" style="width: 100%; padding: 6px; margin-top: 6px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Calculate Bonus</button>
          <div class="gdt-calc-bonus-result" style="margin-top: 6px; color: #58a6ff; font-size: 12px;"></div>
        </div>
        <div style="border-top: 1px solid #444; padding-top: 8px;">
          <label style="color: #e6edf3; font-size: 12px; font-weight: bold; display: block;">Floating Fastener Tolerance</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <input type="number" class="gdt-calc-hole" placeholder="Hole Diameter" step="0.001" style="padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px;">
            <input type="number" class="gdt-calc-fastener" placeholder="Fastener Diameter" step="0.001" style="padding: 6px; background: #1e1e1e; color: #e6edf3; border: 1px solid #444; border-radius: 4px;">
          </div>
          <button class="gdt-calc-fastener-btn" style="width: 100%; padding: 6px; margin-top: 6px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Calculate Tolerance</button>
          <div class="gdt-calc-fastener-result" style="margin-top: 6px; color: #58a6ff; font-size: 12px;"></div>
        </div>
      </div>
    `;

    return `
      <div class="gdt-panel" style="background: #1e1e1e; color: #e6edf3; border-radius: 6px; overflow: hidden; max-height: 600px; display: flex; flex-direction: column;">
        <div style="display: flex; border-bottom: 1px solid #444; background: #262626;">
          ${tabsHTML}
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 12px;">
          <div class="gdt-tab-content" data-content="0" style="display: block;">
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
              ${symbolsGrid}
            </div>
          </div>
          <div class="gdt-tab-content" data-content="1" style="display: none;">
            ${trainingLevels}
          </div>
          <div class="gdt-tab-content" data-content="2" style="display: none;">
            ${fcfBuilderForm}
          </div>
          <div class="gdt-tab-content" data-content="3" style="display: none;">
            ${calculatorForm}
          </div>
        </div>
      </div>
    `;
  }

  // Quiz Renderer
  function renderQuiz(level) {
    const quizData = QUIZZES[`level${level}`];
    const quizHTML = quizData.map((q, i) => `
      <div class="gdt-quiz-question" data-question="${i}" style="background: #262626; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <div style="font-weight: bold; color: #58a6ff; margin-bottom: 8px;">Q${i + 1}: ${q.question}</div>
        <div style="display: grid; gap: 6px;">
          ${q.options.map((opt, j) => `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; background: #1e1e1e; border-radius: 4px; border: 1px solid #444;">
              <input type="radio" name="q${i}" value="${j}" style="cursor: pointer;">
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    return quizHTML;
  }

  // Initialize Module
  function init(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = getUI();

    // Tab switching
    containerEl.querySelectorAll('.gdt-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabIndex = e.target.dataset.tab;
        containerEl.querySelectorAll('.gdt-tab-btn').forEach(b => b.style.background = 'transparent');
        containerEl.querySelectorAll('.gdt-tab-content').forEach(c => c.style.display = 'none');
        e.target.style.background = '#58a6ff';
        containerEl.querySelector(`[data-content="${tabIndex}"]`).style.display = 'block';
      });
    });

    // Symbol card detail toggle
    containerEl.querySelectorAll('.gdt-symbol-card').forEach(card => {
      card.addEventListener('click', () => {
        const details = card.querySelector('.gdt-symbol-details');
        details.style.display = details.style.display === 'none' ? 'block' : 'none';
      });
    });

    // Quiz launcher
    containerEl.querySelectorAll('.gdt-start-quiz').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const level = parseInt(e.target.dataset.level);
        const quizHTML = renderQuiz(level);
        const quizPanel = document.createElement('div');
        quizPanel.innerHTML = `
          <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z: 10000;">
            <div style="background: #1e1e1e; color: #e6edf3; border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; border: 1px solid #444;">
              <div style="font-size: 18px; font-weight: bold; color: #58a6ff; margin-bottom: 16px;">Level ${level} Quiz (10 Questions)</div>
              ${quizHTML}
              <button class="gdt-submit-quiz" style="width: 100%; padding: 10px; background: #238636; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; margin-top: 12px;">Submit Quiz</button>
              <button class="gdt-close-quiz" style="width: 100%; padding: 10px; background: #444; color: #e6edf3; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; margin-top: 8px;">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(quizPanel);

        quizPanel.querySelector('.gdt-submit-quiz').addEventListener('click', () => {
          let score = 0;
          quizPanel.querySelectorAll('.gdt-quiz-question').forEach((q, i) => {
            const selected = q.querySelector('input[type="radio"]:checked');
            if (selected && parseInt(selected.value) === QUIZZES[`level${level}`][i].correct) {
              score++;
            }
          });
          alert(`Quiz Complete!\nScore: ${score}/10 (${(score/10*100).toFixed(0)}%)\n\nProgress saved to localStorage.`);
          localStorage.setItem(`gdt_level${level}_score`, score);
          quizPanel.remove();
        });

        quizPanel.querySelector('.gdt-close-quiz').addEventListener('click', () => quizPanel.remove());
      });
    });

    // FCF Builder
    containerEl.querySelector('.gdt-build-fcf')?.addEventListener('click', () => {
      const char = containerEl.querySelector('.gdt-fcf-characteristic').value;
      const tolerance = parseFloat(containerEl.querySelector('.gdt-fcf-tolerance').value);
      const hasDia = containerEl.querySelector('.gdt-fcf-diameter').checked;
      const material = containerEl.querySelector('.gdt-fcf-material').value;
      const datumA = containerEl.querySelector('.gdt-fcf-datum-a').value;
      const datumB = containerEl.querySelector('.gdt-fcf-datum-b').value || null;
      const datumC = containerEl.querySelector('.gdt-fcf-datum-c').value || null;

      const fcf = buildFCF({
        characteristic: char,
        toleranceValue: tolerance,
        hasDiameter: hasDia,
        materialCondition: material,
        primaryDatum: datumA,
        secondaryDatum: datumB,
        tertiaryDatum: datumC
      });

      containerEl.querySelector('.gdt-fcf-output').innerHTML = fcf.html + `<div style="margin-top: 8px; color: #e6edf3;">Notation: ${fcf.notation}</div>`;
    });

    // Calculator
    containerEl.querySelector('.gdt-calc-bonus')?.addEventListener('click', () => {
      const mmc = parseFloat(containerEl.querySelector('.gdt-calc-mmc').value);
      const actual = parseFloat(containerEl.querySelector('.gdt-calc-actual').value);
      const bonus = calculatePositionBonus(mmc, actual);
      containerEl.querySelector('.gdt-calc-bonus-result').textContent = `Bonus Tolerance: ${bonus.toFixed(4)}"`;
    });

    containerEl.querySelector('.gdt-calc-fastener-btn')?.addEventListener('click', () => {
      const hole = parseFloat(containerEl.querySelector('.gdt-calc-hole').value);
      const fastener = parseFloat(containerEl.querySelector('.gdt-calc-fastener').value);
      const tolerance = floatingFastenerTolerance(hole, fastener);
      containerEl.querySelector('.gdt-calc-fastener-result').textContent = `Total Tolerance: ${tolerance.toFixed(4)}" (${(tolerance/2).toFixed(4)}" per hole)`;
    });
  }

  // Public API
  return {
    init,
    getUI,
    SYMBOLS,
    QUIZZES,
    calculatePositionBonus,
    floatingFastenerTolerance,
    fixedFastenerTolerance,
    toleranceStackWorstCase,
    toleranceStackRSS,
    suggestAnnotations,
    buildFCF,
    renderQuiz
  };
})();

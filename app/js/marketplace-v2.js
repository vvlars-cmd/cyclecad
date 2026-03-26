// marketplace-v2.js — GrabCAD-style marketplace with Instructables-inspired detail pages
// IIFE pattern, registers as window.cycleCAD.marketplaceV2

(function () {
  'use strict';

  // Demo models with full Instructables-style data
  const DEMO_MODELS = [
    {
      id: 'model-001',
      title: 'Parametric Bearing Housing',
      author: 'Sarah Chen',
      authorId: 'u-001',
      description: 'Customizable bearing housing for industrial spindle applications. Supports standard ISO bearings.',
      category: 'Mechanical',
      difficulty: 'Intermediate',
      buildTime: '45 min',
      license: '$CYCLE Token Required',
      price: 25,
      rating: 4.8,
      downloads: 342,
      reviews: 3,
      coverImage: 'https://via.placeholder.com/400x300/2c3e50/ecf0f1?text=Bearing+Housing',
      steps: [
        { title: 'Design Base Plate', description: 'Create the foundation plate with mounting holes', tips: 'Ensure bore diameter matches ISO standard (50mm for SKF 6210)', warnings: 'Over-torquing mounting bolts can crack the housing' },
        { title: 'Add Cylindrical Bore', description: 'Extrude the main bearing bore', tips: 'Use internal draft angle of 2° for easier assembly', warnings: 'Bore tolerance: H7 (0 to +0.025mm)' },
        { title: 'Create Seal Grooves', description: 'Machine grooves for bearing seals', tips: 'Follow ISO 11934 standard dimensions', warnings: 'Shallow grooves reduce seal effectiveness' },
        { title: 'Add Oil Lubrication Ports', description: 'Drill and tap ports for oil injection', tips: 'Use 1/8" NPT fittings for standard compatibility', warnings: 'Port placement affects pressure distribution' },
        { title: 'Apply Finish', description: 'Add surface treatment (shot peening or anodizing)', tips: 'Shot peening improves fatigue life by 25%', warnings: 'Clean surface before anodizing to prevent etching' },
        { title: 'Final Assembly Check', description: 'Verify all dimensions and fit', tips: 'Use CMM for high-precision verification', warnings: 'Check concentricity of bore to base (runout <0.02mm)' }
      ],
      bom: [
        { part: 'Base Plate (Ductile Iron)', qty: 1, material: 'DCI 400-15', supplier: 'McMaster-Carr', partNum: '8729K41', estimatedCost: '$18.50' },
        { part: 'Bearing Seal (FKM)', qty: 2, material: 'FKM 75', supplier: 'MISUMI', partNum: 'SEAL-6210-SKF', estimatedCost: '$6.20' },
        { part: 'Oil Port Fitting (Brass)', qty: 4, material: 'C36000', supplier: 'McMaster-Carr', partNum: '7734K25', estimatedCost: '$4.80' },
        { part: 'Mounting Bolts (Grade 8.8)', qty: 8, material: 'Steel', supplier: 'MISUMI', partNum: 'SCBM8-50', estimatedCost: '$2.40' }
      ],
      tools: ['CNC Milling Machine', 'Reamer (H7 Tolerance)', 'Tap Set (1/8" NPT)', 'CMM (optional)']
    },
    {
      id: 'model-002',
      title: 'Adjustable Phone Stand',
      author: 'Mike Rodriguez',
      authorId: 'u-002',
      description: 'Simple 3D-printable phone stand with adjustable viewing angles.',
      category: 'Consumer Products',
      difficulty: 'Beginner',
      buildTime: '2 hours',
      license: 'CC-BY',
      price: 0,
      rating: 4.3,
      downloads: 1205,
      reviews: 8,
      coverImage: 'https://via.placeholder.com/400x300/3498db/ecf0f1?text=Phone+Stand',
      steps: [
        { title: 'Create Base Plate', description: 'Design a 100×80mm base for stability', tips: 'Add anti-slip texture on bottom surface', warnings: 'Make base at least 4mm thick for FDM printing' },
        { title: 'Build Adjustable Arm', description: 'Create a ball-joint mechanism for angle adjustment', tips: 'Use 20mm ball diameter for standard phone grip strength', warnings: 'Ensure arm walls are minimum 2mm for 3D printing' },
        { title: 'Add Phone Cradle', description: 'Design phone holder with rubber pads', tips: 'Cradle width should be 65-75mm for universal fit', warnings: 'Add drainage slot to prevent moisture buildup' },
        { title: 'Assembly and Testing', description: 'Print all parts and test fit', tips: 'Sand ball joint surfaces lightly for smooth rotation', warnings: 'Test with actual phone weight to verify stability' }
      ],
      bom: [
        { part: 'PLA Filament', qty: '60g', material: 'PLA', supplier: 'Amazon', partNum: 'PRUSAMENT-PLA', estimatedCost: '$1.80' },
        { part: 'Rubber Pad Sheet', qty: '1 sheet', material: 'EPDM', supplier: 'McMaster-Carr', partNum: '8594K11', estimatedCost: '$3.25' },
        { part: 'Felt Pads (Self-Adhesive)', qty: '8 pcs', material: 'Wool Felt', supplier: 'McMaster-Carr', partNum: '9638K26', estimatedCost: '$2.15' }
      ],
      tools: ['3D Printer (FDM)', 'Sandpaper (120-400 grit)', 'Utility Knife', 'Ruler']
    },
    {
      id: 'model-003',
      title: 'CNC Mill Vise Jaw Set',
      author: 'James Wu',
      authorId: 'u-003',
      description: 'Drop-in replacement jaws for standard CNC mills. Hardened steel with precision ground surfaces.',
      category: 'Fixtures',
      difficulty: 'Advanced',
      buildTime: '3 hours',
      license: '$CYCLE Token Required',
      price: 50,
      rating: 4.9,
      downloads: 287,
      reviews: 5,
      coverImage: 'https://via.placeholder.com/400x300/e74c3c/ecf0f1?text=Vise+Jaws',
      steps: [
        { title: 'Rough Stock to Size', description: 'Machine raw stock to 150×75×30mm', tips: 'Leave 2mm for final finish pass', warnings: 'Use coolant to prevent thermal distortion' },
        { title: 'Face and Bore', description: 'Create gripping surfaces with precision angles', tips: '5° jaw angle improves clamping grip', warnings: 'Keep bore tolerance within ±0.002"' },
        { title: 'Add Serrated Pattern', description: 'Engrave serrations for non-slip grip', tips: 'Use 0.5mm serration spacing', warnings: 'Serrations reduce clamping area by 15%' },
        { title: 'Heat Treat', description: 'Harden to 58-62 HRC for durability', tips: 'Use oil quench for minimal distortion', warnings: 'Temper after hardening to relieve stress' },
        { title: 'Final Grinding', description: 'Grind jaw faces to flatness and parallelism', tips: 'Target flatness: 0.0005" TIR', warnings: 'Over-grinding reduces jaw width' },
        { title: 'Quality Check', description: 'Inspect all critical dimensions', tips: 'Use precision parallels to check flatness', warnings: 'Any chips on edges reduce grip quality' },
        { title: 'Apply Finish', description: 'Coat with protective oil', tips: 'Use light machine oil for rust prevention', warnings: 'Wipe excess oil to prevent slipping' },
        { title: 'Installation', description: 'Install into vise body with locating pin', tips: 'Ensure jaw is fully seated before clamping', warnings: 'Loose jaws can cause dimensional errors' }
      ],
      bom: [
        { part: 'Hardened Steel Blank (AISI D2)', qty: 2, material: 'AISI D2', supplier: 'McMaster-Carr', partNum: '8984K47', estimatedCost: '$35.60' },
        { part: 'Locating Pin (Hardened Steel)', qty: 2, material: '4140 Steel', supplier: 'MISUMI', partNum: 'DOWEL-8-50', estimatedCost: '$3.80' },
        { part: 'Machine Oil (ISO 46)', qty: '1L', material: 'Mineral Oil', supplier: 'McMaster-Carr', partNum: '2162K12', estimatedCost: '$8.40' }
      ],
      tools: ['CNC Milling Machine', 'Heat Treat Furnace', 'Surface Grinder', 'CMM', 'Precision Parallels']
    },
    {
      id: 'model-004',
      title: 'Herringbone Gear Pair',
      author: 'Dr. Lisa Park',
      authorId: 'u-004',
      description: 'Matched herringbone gear pair with balanced axial loads. Perfect for reducing vibration in high-speed applications.',
      category: 'Gears',
      difficulty: 'Intermediate',
      buildTime: '90 min',
      license: 'CC-BY-SA',
      price: 10,
      rating: 4.6,
      downloads: 564,
      reviews: 6,
      coverImage: 'https://via.placeholder.com/400x300/9b59b6/ecf0f1?text=Herringbone+Gears',
      steps: [
        { title: 'Define Gear Specifications', description: 'Set module, pressure angle, helix angle, and tooth count', tips: 'Module 2.5, PA 20°, helix angle 30° for optimal efficiency', warnings: 'Unmatched helix angles cause axial imbalance' },
        { title: 'Generate Tooth Profile', description: 'Create involute tooth form with proper pressure angle', tips: 'Use cam grinding software for accurate profile', warnings: 'Undercut can occur if addendum is too large' },
        { title: 'Create Blank and Hub', description: 'Design hub and keyway for shaft mounting', tips: 'Hub diameter should be 1.2× bore diameter', warnings: 'Keyway weakens hub; keep width to minimum' },
        { title: 'Apply Finishing', description: 'Add chamfers and surface finish specification', tips: 'Chamfer all sharp edges (0.5×45°)', warnings: 'Finish specification affects noise levels' },
        { title: 'Export and Manufacture', description: 'Generate STEP file for CNC hobbing machine', tips: 'Use hobbing for high-precision gears (AGMA 10)', warnings: 'Shaving after hobbing improves surface finish' }
      ],
      bom: [
        { part: 'Steel Blank (AISI 8620)', qty: 2, material: 'AISI 8620', supplier: 'McMaster-Carr', partNum: '8984K12', estimatedCost: '$28.75' },
        { part: 'Metric Keystock (3×3×30mm)', qty: 2, material: '1018 Steel', supplier: 'MISUMI', partNum: 'KEY-3-30', estimatedCost: '$1.20' }
      ],
      tools: ['CNC Hobbing Machine', 'Shaving Cutter Set', 'Gear Measuring Caliper', 'Cam Software']
    },
    {
      id: 'model-005',
      title: 'Raspberry Pi 4 Enclosure',
      author: 'Alex Thompson',
      authorId: 'u-005',
      description: '3D-printable enclosure for Raspberry Pi 4 with GPIO expansion and cooling fan mount.',
      category: 'Electronics Housing',
      difficulty: 'Beginner',
      buildTime: '3 hours',
      license: 'MIT',
      price: 0,
      rating: 4.4,
      downloads: 2341,
      reviews: 12,
      coverImage: 'https://via.placeholder.com/400x300/1abc9c/ecf0f1?text=Pi+Enclosure',
      steps: [
        { title: 'Measure Raspberry Pi Dimensions', description: 'Create accurate mounting holes and cutouts', tips: 'Leave 2mm clearance around components', warnings: 'GPIO headers block standard enclosures' },
        { title: 'Design Base Plate', description: 'Create mounting points for Pi and fan', tips: 'Use M2.5 threaded inserts for durability', warnings: 'Test fit before final print' },
        { title: 'Add Cooling Fan Mount', description: 'Create mount for 30×30mm cooling fan', tips: 'Fan should blow air over CPU (BCM2711)', warnings: 'Ensure fan is isolated from moving parts' },
        { title: 'Design Lid with Vents', description: 'Create removable lid with airflow vents', tips: 'Add cable management clips inside', warnings: 'Vents must not exceed 3mm to prevent dust' }
      ],
      bom: [
        { part: 'PETG Filament', qty: '120g', material: 'PETG', supplier: 'Amazon', partNum: 'PRUSAMENT-PETG', estimatedCost: '$3.60' },
        { part: 'M2.5 Threaded Inserts', qty: 4, material: 'Brass', supplier: 'McMaster-Carr', partNum: '91732A118', estimatedCost: '$2.80' },
        { part: '30mm Axial Fan (5V)', qty: 1, material: 'Plastic', supplier: 'Amazon', partNum: 'JBL30A051-05', estimatedCost: '$4.25' }
      ],
      tools: ['3D Printer (FDM)', 'Soldering Iron', 'Crimpers', 'M2.5 Tap']
    },
    {
      id: 'model-006',
      title: 'DIN Rail Mount Bracket',
      author: 'Georg Müller',
      authorId: 'u-006',
      description: 'Universal DIN rail mounting bracket for enclosure components. Supports 35mm DIN rail standard.',
      category: 'Brackets',
      difficulty: 'Beginner',
      buildTime: '1 hour',
      license: 'CC-BY',
      price: 0,
      rating: 4.5,
      downloads: 891,
      reviews: 4,
      coverImage: 'https://via.placeholder.com/400x300/f39c12/ecf0f1?text=DIN+Bracket',
      steps: [
        { title: 'Create Hook Profile', description: 'Design hook that clips onto DIN rail', tips: 'Hook depth: 7.5mm per DIN 35', warnings: 'Insufficient hook depth causes slipping' },
        { title: 'Add Component Mounting Face', description: 'Create flat surface for device attachment', tips: 'Use M5 tapped holes for universal compatibility', warnings: 'Face should be perpendicular to hook' },
        { title: 'Design for 3D Printing', description: 'Add support blocks and strengthen thin walls', tips: 'Minimum wall thickness: 2mm', warnings: 'Unsupported overhangs fail in FDM' },
        { title: 'Print and Install', description: 'Print and test fit on DIN rail', tips: 'Sand hook lightly for smooth sliding', warnings: 'Adjust hook tension if bracket moves' }
      ],
      bom: [
        { part: 'PETG Filament', qty: '45g', material: 'PETG', supplier: 'Amazon', partNum: 'PRUSAMENT-PETG', estimatedCost: '$1.35' },
        { part: 'M5 Socket Head Cap Screws', qty: 4, material: 'Stainless Steel', supplier: 'McMaster-Carr', partNum: '91290A316', estimatedCost: '$1.80' }
      ],
      tools: ['3D Printer (FDM)', 'Sandpaper (220 grit)', 'Hex Key (4mm)']
    },
    {
      id: 'model-007',
      title: 'Sheet Metal Electrical Box',
      author: 'Patricia Gonzalez',
      authorId: 'u-007',
      description: 'Welded sheet metal electrical enclosure with ventilation and cable entry provisions.',
      category: 'Sheet Metal',
      difficulty: 'Advanced',
      buildTime: '2.5 hours',
      license: '$CYCLE Token Required',
      price: 35,
      rating: 4.7,
      downloads: 456,
      reviews: 7,
      coverImage: 'https://via.placeholder.com/400x300/c0392b/ecf0f1?text=Electrical+Box',
      steps: [
        { title: 'Unfold Sheet Metal Flat Pattern', description: 'Create flat pattern for 1.2mm cold-rolled steel', tips: 'Use bend allowance 1.8× thickness', warnings: 'Bend radius must be ≥2.4mm to avoid cracking' },
        { title: 'Create Flanges for Assembly', description: 'Design flanges with welding tabs', tips: 'Use 25mm flange width for 1.2mm steel', warnings: 'Mismatched flange heights cause assembly issues' },
        { title: 'Add Cable Entry Holes', description: 'Knockout holes for M20 cable glands', tips: 'Use punching rather than drilling for speed', warnings: 'Punch dies create cleaner edges than holes' },
        { title: 'Design Ventilation Louvers', description: 'Add louvered vents for thermal management', tips: 'Louver angle: 30° for optimal airflow', warnings: 'Louvers reduce structural rigidity by 10%' },
        { title: 'Assembly Sequence', description: 'Plan welding order to minimize distortion', tips: 'Weld from center outward to reduce warping', warnings: 'Over-welding causes excessive heat distortion' },
        { title: 'Surface Treatment', description: 'Apply zinc plating and powder coat finish', tips: 'Use white or gray powder coat for visibility', warnings: 'Bake time affects coating durability' },
        { title: 'Final Assembly', description: 'Install DIN rails, cable glands, and gaskets', tips: 'Use neoprene gaskets for IP65 rating', warnings: 'Incorrect gasket placement leaks water' }
      ],
      bom: [
        { part: 'Cold-Rolled Steel (1.2mm)', qty: '1 sheet', material: 'AISI 1010', supplier: 'McMaster-Carr', partNum: '9014K13', estimatedCost: '$24.50' },
        { part: 'M20 Cable Glands (IP67)', qty: 4, material: 'Nylon', supplier: 'MISUMI', partNum: 'CABLE-GLAND-M20', estimatedCost: '$6.80' },
        { part: 'DIN Rail (1m)', qty: 1, material: 'Steel', supplier: 'McMaster-Carr', partNum: '7168K41', estimatedCost: '$4.20' },
        { part: 'Neoprene Gasket Sheet', qty: '0.5m', material: 'Neoprene', supplier: 'McMaster-Carr', partNum: '8759K21', estimatedCost: '$3.75' }
      ],
      tools: ['Sheet Metal Shear', 'Press Brake', 'Welding Machine', 'Punch Set (M20)', 'Deburring Tool']
    },
    {
      id: 'model-008',
      title: 'Planetary Gear Set',
      author: 'Dr. Rajesh Kumar',
      authorId: 'u-008',
      description: 'Complete planetary gear reducer with 10:1 ratio. Compact design for high-torque applications.',
      category: 'Gears',
      difficulty: 'Expert',
      buildTime: '6 hours',
      license: '$CYCLE Token Required',
      price: 100,
      rating: 5.0,
      downloads: 189,
      reviews: 3,
      coverImage: 'https://via.placeholder.com/400x300/8e44ad/ecf0f1?text=Planetary+Gears',
      steps: [
        { title: 'Calculate Gear Specifications', description: 'Design for 10:1 reduction with balanced loads', tips: 'Module 2.0, 90-tooth sun, 108-tooth ring', warnings: 'Unbalanced tooth counts cause vibration' },
        { title: 'Design Sun Gear', description: 'Create central sun gear with shaft', tips: 'Use hardened steel for durability', warnings: 'Sun gear must support radial and axial loads' },
        { title: 'Design Planet Gears (×3)', description: 'Create identical planet gears for symmetry', tips: '3-planet configuration is optimal', warnings: 'Planet count must divide evenly into sun teeth' },
        { title: 'Design Ring Gear', description: 'Create internal ring gear with fixed mounting', tips: 'Ring must be perfectly centered', warnings: 'Runout tolerance: <0.01mm' },
        { title: 'Design Carrier Assembly', description: 'Create carrier to hold planet pins', tips: 'Use lightweight aluminum for low inertia', warnings: 'Carrier rigidity critical for noise control' },
        { title: 'Generate Manufacturing Drawings', description: 'Create detailed STEP files for CNC hobbing', tips: 'Specify AGMA 11-12 quality class', warnings: 'Quality affects efficiency (95-98%)' },
        { title: 'Manufacture and Assemble', description: 'CNC hob all gears, harden, and shave', tips: 'Assembly sequence: sun → planets → ring', warnings: 'Any assembly error causes binding' },
        { title: 'Testing and Validation', description: 'Test torque capacity and noise', tips: 'Run-in procedure: 10 hours at light load', warnings: 'High noise indicates misalignment' },
        { title: 'Quality Documentation', description: 'Generate capacity charts and thermal analysis', tips: 'Document max RPM and temperature limits', warnings: 'Thermal stability critical for reliability' },
        { title: 'Final Inspection', description: 'Verify all specifications and tolerances', tips: 'Use CMM for final acceptance', warnings: 'Any deviation voids warranty' }
      ],
      bom: [
        { part: 'Hardened Steel for Gears (AISI 8620)', qty: '3 kg', material: 'AISI 8620', supplier: 'McMaster-Carr', partNum: '8984K25', estimatedCost: '$67.80' },
        { part: 'Aluminum Carrier Blank', qty: 1, material: '6061-T6', supplier: 'MISUMI', partNum: 'AL-BLANK-150', estimatedCost: '$15.50' },
        { part: 'Precision Bearings (6005)', qty: 3, material: 'Steel/Ceramic Hybrid', supplier: 'McMaster-Carr', partNum: '5972K32', estimatedCost: '$18.90' },
        { part: 'Synthetic Gear Oil (ISO 220)', qty: '1L', material: 'Synthetic PAO', supplier: 'McMaster-Carr', partNum: '2162K42', estimatedCost: '$12.40' }
      ],
      tools: ['CNC Hobbing Machine', 'Shaving Cutter Set', 'Heat Treat Furnace', 'CMM', 'Thermal Chamber', 'Noise Analyzer']
    },
    {
      id: 'model-009',
      title: 'Drone Motor Mount',
      author: 'Emily Foster',
      authorId: 'u-009',
      description: '3D-printable vibration-damping motor mount for quadcopter frames. Reduces propeller noise by 8dB.',
      category: 'Aerospace',
      difficulty: 'Intermediate',
      buildTime: '2 hours',
      license: 'CC-BY-NC',
      price: 5,
      rating: 4.5,
      downloads: 724,
      reviews: 5,
      coverImage: 'https://via.placeholder.com/400x300/16a085/ecf0f1?text=Motor+Mount',
      steps: [
        { title: 'Design Motor Adapter Ring', description: 'Create mounting ring for standard brushless motor (3S-6S)', tips: 'M3 threads for universal motor compatibility', warnings: 'Adapter must not interfere with prop clearance' },
        { title: 'Add Vibration Isolation Pads', description: 'Design pockets for silicone damping pads', tips: 'Use 3mm shore-A40 silicone pads', warnings: 'Too soft reduces frame rigidity' },
        { title: 'Design Arm Attachment', description: 'Create interface for carbon fiber tube arms', tips: 'Use 8mm or 10mm tube compatibility', warnings: 'Tube clamp must not crush carbon fiber' },
        { title: 'Add Cable Management', description: 'Create strain relief for ESC wires', tips: 'Prevent stress on solder joints', warnings: 'Cable routing affects balance' },
        { title: 'Print and Test Fit', description: 'Print and verify fit with actual motor and frame', tips: 'Test weight: target <12g per mount', warnings: 'Overly rigid design negates damping benefit' }
      ],
      bom: [
        { part: 'Carbon Fiber Filament', qty: '75g', material: 'CF/PETG', supplier: 'Amazon', partNum: 'CARBON-PETG-750g', estimatedCost: '$4.50' },
        { part: 'Silicone Damping Pads (3mm)', qty: 12, material: 'Silicone Shore A40', supplier: 'McMaster-Carr', partNum: '9199K58', estimatedCost: '$2.40' },
        { part: 'M3 Socket Head Cap Screws', qty: 12, material: 'Titanium', supplier: 'MISUMI', partNum: 'SCBM3-12', estimatedCost: '$3.20' }
      ],
      tools: ['3D Printer (FDM)', 'Digital Scale', 'Calipers', 'Hex Key Set']
    },
    {
      id: 'model-010',
      title: 'Surgical Tool Handle',
      author: 'Dr. Michael Chen',
      authorId: 'u-010',
      description: 'Ergonomic surgical instrument handle meeting ISO 9397 medical device standards.',
      category: 'Medical',
      difficulty: 'Expert',
      buildTime: '5 hours',
      license: '$CYCLE Token Required',
      price: 75,
      rating: 4.9,
      downloads: 142,
      reviews: 2,
      coverImage: 'https://via.placeholder.com/400x300/2980b9/ecf0f1?text=Surgical+Handle',
      steps: [
        { title: 'Define Ergonomic Specifications', description: 'Design for 50th percentile hand geometry', tips: 'Grip diameter: 22-28mm per ISO 9397', warnings: 'Incorrect ergonomics causes fatigue' },
        { title: 'Create Handle Blank', description: 'Machine stainless steel blank from bar stock', tips: 'Use 316L stainless for biocompatibility', warnings: 'Avoid nickel-rich alloys due to allergies' },
        { title: 'Design Thumb Rest', description: 'Create anatomic thumb rest to reduce fatigue', tips: 'Thumb rest angle: 15-20° from horizontal', warnings: 'Incorrect angle increases surgical fatigue' },
        { title: 'Add Finger Grooves', description: 'Create textured surface for grip security', tips: 'Groove spacing: 8mm center-to-center', warnings: 'Sharp grooves can cut gloved fingers' },
        { title: 'Create Tool Mounting Interface', description: 'Design bayonet or screw mount for interchangeable tips', tips: 'Bayonet: 3-pin keyed design per standard', warnings: 'Loose coupling compromises safety' },
        { title: 'Apply Medical Surface Finish', description: 'Polish and passivate per ASTM A967', tips: 'Final surface finish Ra 0.4µm or better', warnings: 'Poor passivation reduces corrosion resistance' },
        { title: 'Sterilization Validation', description: 'Test compatibility with autoclave (121°C, 15min)', tips: 'Verify no material degradation', warnings: 'Some polymers cannot withstand autoclave' },
        { title: 'Traceability Labeling', description: 'Add permanent ID marking per ISO 11785', tips: 'Use laser marking to prevent label loss', warnings: 'Manual labeling wears off during use' },
        { title: 'Biocompatibility Testing', description: 'Perform cytotoxicity and sensitization tests', tips: 'Follow ISO 10993-5 methodology', warnings: 'Biocompatibility required for regulatory approval' },
        { title: 'Final QA Documentation', description: 'Generate compliance report and certificates', tips: 'Document all test results for FDA submission', warnings: 'Missing documentation blocks market approval' }
      ],
      bom: [
        { part: 'Stainless Steel 316L Bar Stock', qty: '500g', material: '316L', supplier: 'McMaster-Carr', partNum: '8976K24', estimatedCost: '$32.50' },
        { part: 'Medical-Grade Silicone (FDA compliant)', qty: '100g', material: 'Medical Silicone', supplier: 'MISUMI', partNum: 'SILICONE-MED-100g', estimatedCost: '$14.80' },
        { part: 'Polishing Compound (Fine)', qty: '1 jar', material: 'Diamond Paste 1µm', supplier: 'McMaster-Carr', partNum: '2473K31', estimatedCost: '$8.60' }
      ],
      tools: ['CNC Milling Machine', 'Surface Grinder', 'Polishing Machine', 'Autoclave', 'Laser Marker', 'CMM']
    },
    {
      id: 'model-011',
      title: 'Bicycle Stem Adapter',
      author: 'Lucas Silva',
      authorId: 'u-011',
      description: 'Aluminum stem adapter for converting vintage bicycle to modern 31.8mm bar diameter.',
      category: 'Automotive',
      difficulty: 'Intermediate',
      buildTime: '1.5 hours',
      license: 'CC-BY-SA',
      price: 8,
      rating: 4.4,
      downloads: 615,
      reviews: 4,
      coverImage: 'https://via.placeholder.com/400x300/27ae60/ecf0f1?text=Stem+Adapter',
      steps: [
        { title: 'Create Adapter Sleeve', description: 'Design bushing for 25.4mm → 31.8mm conversion', tips: 'Wall thickness: 3mm for structural integrity', warnings: 'Too thin walls will crush under load' },
        { title: 'Add Clamp Mechanism', description: 'Design two-piece clamp with M6 bolts', tips: 'Clamp surface should be knurled', warnings: 'Smooth clamp surfaces cause slipping' },
        { title: 'Design for Lightweight', description: 'Minimize material while maintaining rigidity', tips: 'Use 6061-T6 aluminum for optimal strength/weight', warnings: 'Avoid aluminum alloys with poor fatigue' },
        { title: 'CAM and Test', description: 'Create CAM program for CNC turning', tips: 'Finish pass at high spindle speed (1000 RPM) for smooth surface', warnings: 'Chatter marks reduce clamp grip' },
        { title: 'Post-Processing', description: 'Anodize to Type II finish for durability', tips: 'Use sulfuric acid anodizing for best hardness', warnings: 'Chromic acid anodizing weaker but thicker' }
      ],
      bom: [
        { part: '6061-T6 Aluminum Rod (1" dia)', qty: '1 piece', material: '6061-T6', supplier: 'McMaster-Carr', partNum: '8974K33', estimatedCost: '$9.50' },
        { part: 'M6 Socket Head Screws (20mm)', qty: 2, material: 'Aluminum', supplier: 'MISUMI', partNum: 'SCBM6-20', estimatedCost: '$2.40' },
        { part: 'Knurling Tool', qty: 1, material: 'Carbide', supplier: 'McMaster-Carr', partNum: '3987K15', estimatedCost: '$18.75' }
      ],
      tools: ['CNC Lathe', 'End Mill', 'Tap (M6)', 'Calipers', 'Micrometer']
    },
    {
      id: 'model-012',
      title: 'Modular Shelving System',
      author: 'Anna Kowalski',
      authorId: 'u-012',
      description: '3D-printable modular shelving with tool-free assembly. Supports up to 5kg per shelf.',
      category: 'Assemblies',
      difficulty: 'Intermediate',
      buildTime: '4 hours',
      license: 'CC-BY',
      price: 0,
      rating: 4.6,
      downloads: 1876,
      reviews: 9,
      coverImage: 'https://via.placeholder.com/400x300/34495e/ecf0f1?text=Modular+Shelving',
      steps: [
        { title: 'Design Vertical Posts', description: 'Create posts with built-in hook slots', tips: 'Slot spacing: 20mm for flexible arrangement', warnings: 'Posts must be perfectly straight for stability' },
        { title: 'Create Shelf Brackets', description: 'Design brackets that slide into post slots', tips: 'Use snap-fit connection for tool-free assembly', warnings: 'Snap features easily break if over-tightened' },
        { title: 'Design Shelf Decks', description: 'Create solid shelves with reinforced ribs', tips: 'Underside ribs improve strength-to-weight ratio', warnings: 'Thin shelves will sag under load' },
        { title: 'Add Anti-Slip Surface', description: 'Apply textured coating or adhesive pads', tips: 'Use rubber pads at shelf corners', warnings: 'Smooth surfaces cause items to slide' },
        { title: 'Assembly Instructions', description: 'Document step-by-step assembly with diagrams', tips: 'Include weight capacity labels on each shelf', warnings: 'Exceeding weight limits causes collapse' },
        { title: 'Print and Build', description: 'Print all components and assemble', tips: 'Test stability before loading with items', warnings: 'Uneven floor causes wobbling' },
        { title: 'Finishing Touches', description: 'Sand any rough edges and apply finish', tips: 'Paint with matte black for professional look', warnings: 'Gloss paint looks cheap on cheap materials' },
        { title: 'Install and Decorate', description: 'Wall-mount posts and arrange shelves', tips: 'Level check ensures even appearance', warnings: 'Unlevel installation looks unintentional' }
      ],
      bom: [
        { part: 'PETG Filament', qty: '500g', material: 'PETG', supplier: 'Amazon', partNum: 'PRUSAMENT-PETG-5kg', estimatedCost: '$15.00' },
        { part: 'Rubber Anti-Slip Pads (30mm)', qty: 8, material: 'EPDM', supplier: 'McMaster-Carr', partNum: '9638K11', estimatedCost: '$3.20' },
        { part: 'Drywall Anchors (M8)', qty: 4, material: 'Plastic', supplier: 'McMaster-Carr', partNum: '98149A200', estimatedCost: '$2.15' },
        { part: 'Matte Black Spray Paint', qty: '1 can', material: 'Acrylic', supplier: 'Amazon', partNum: 'RUST-OLEUM-2X', estimatedCost: '$4.99' }
      ],
      tools: ['3D Printer (FDM)', 'Sandpaper (120-220 grit)', 'Level (laser or spirit)', 'Drill (for anchors)', 'Paintbrush']
    }
  ];

  // Category definitions
  const CATEGORIES = [
    'Mechanical', 'Enclosures', 'Brackets', 'Gears', 'Fasteners',
    'Fixtures', 'Sheet Metal', 'Assemblies', 'Electronics Housing',
    'Automotive', 'Aerospace', 'Medical', 'Consumer Products'
  ];

  const DIFFICULTY_COLORS = {
    'Beginner': '#10b981',
    'Intermediate': '#f59e0b',
    'Advanced': '#ef4444',
    'Expert': '#8b5cf6'
  };

  // Initialize marketplace state
  const marketplaceState = {
    publishedModels: [],
    purchases: {},
    favorites: {},
    reviews: {}
  };

  // Load from localStorage
  function loadState() {
    const saved = localStorage.getItem('cycleCAD_marketplace_v2');
    if (saved) {
      Object.assign(marketplaceState, JSON.parse(saved));
    }
    // Initialize demo models if not already published
    if (marketplaceState.publishedModels.length === 0) {
      marketplaceState.publishedModels = DEMO_MODELS.map(m => ({ ...m }));
    }
  }

  function saveState() {
    localStorage.setItem('cycleCAD_marketplace_v2', JSON.stringify(marketplaceState));
  }

  // Get all published models
  function getAllModels() {
    return marketplaceState.publishedModels;
  }

  // Get single model by ID
  function getModelById(modelId) {
    return marketplaceState.publishedModels.find(m => m.id === modelId);
  }

  // Generate model card HTML
  function getModelCardHTML(model) {
    const categoryColor = {
      'Mechanical': '#3b82f6',
      'Enclosures': '#06b6d4',
      'Brackets': '#8b5cf6',
      'Gears': '#ec4899',
      'Fasteners': '#f59e0b',
      'Fixtures': '#10b981',
      'Sheet Metal': '#ef4444',
      'Assemblies': '#6366f1',
      'Electronics Housing': '#14b8a6',
      'Automotive': '#f97316',
      'Aerospace': '#0ea5e9',
      'Medical': '#d946ef',
      'Consumer Products': '#84cc16'
    }[model.category] || '#6b7280';

    const stars = '★'.repeat(Math.floor(model.rating)) + '☆'.repeat(5 - Math.floor(model.rating));

    return `
      <div class="market-card" data-model-id="${model.id}" style="background:#2a2a2a;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.3);cursor:pointer;transition:all 0.2s">
        <div style="position:relative;width:100%;padding-bottom:66.67%;overflow:hidden;background:#1e1e1e">
          <img src="${model.coverImage}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" alt="${model.title}">
          <div style="position:absolute;top:8px;right:8px;background:${categoryColor};color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold">${model.category}</div>
          ${model.price > 0 ? `<div style="position:absolute;bottom:8px;right:8px;background:#ff9800;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold">${model.price} tokens</div>` : ''}
        </div>
        <div style="padding:12px">
          <h3 style="margin:0;font-size:14px;font-weight:600;color:#e0e0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${model.title}</h3>
          <p style="margin:4px 0 0 0;font-size:12px;color:#999">by ${model.author}</p>
          <div style="margin:8px 0;display:flex;gap:4px;align-items:center">
            <span style="color:#fbbf24;font-size:12px">${stars}</span>
            <span style="color:#666;font-size:11px">${model.rating} (${model.reviews})</span>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin:8px 0">
            <span style="background:${DIFFICULTY_COLORS[model.difficulty]};color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">${model.difficulty}</span>
            <span style="background:#444;color:#aaa;padding:2px 6px;border-radius:3px;font-size:10px">↓ ${model.downloads}</span>
          </div>
          <button class="market-view-btn" style="width:100%;padding:6px;background:#058dd4;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;transition:background 0.2s" data-model-id="${model.id}">View Details</button>
        </div>
      </div>
    `;
  }

  // Generate model detail page HTML
  function getModelDetailHTML(modelId) {
    const model = getModelById(modelId);
    if (!model) return '<div style="color:#f44747">Model not found</div>';

    const stars = '★'.repeat(Math.floor(model.rating)) + '☆'.repeat(5 - Math.floor(model.rating));
    const isFavorite = marketplaceState.favorites[modelId] || false;
    const categoryColor = {
      'Mechanical': '#3b82f6',
      'Enclosures': '#06b6d4',
      'Brackets': '#8b5cf6',
      'Gears': '#ec4899',
      'Fasteners': '#f59e0b',
      'Fixtures': '#10b981',
      'Sheet Metal': '#ef4444',
      'Assemblies': '#6366f1',
      'Electronics Housing': '#14b8a6',
      'Automotive': '#f97316',
      'Aerospace': '#0ea5e9',
      'Medical': '#d946ef',
      'Consumer Products': '#84cc16'
    }[model.category] || '#6b7280';

    let detailHTML = `
      <div style="max-width:1200px;margin:0 auto;padding:20px;color:#e0e0e0">
        <!-- Hero Section -->
        <div style="display:grid;grid-template-columns:1fr 350px;gap:30px;margin-bottom:30px">
          <div>
            <img src="${model.coverImage}" style="width:100%;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.4)">
          </div>
          <div>
            <h1 style="margin:0 0 16px 0;font-size:28px;color:#fff">${model.title}</h1>
            <p style="margin:0 0 12px 0;color:#999">by <strong>${model.author}</strong></p>
            <div style="display:flex;align-items:center;gap:12px;margin:16px 0">
              <span style="color:#fbbf24;font-size:16px">${stars}</span>
              <span style="color:#aaa">${model.rating}/5 (${model.reviews} reviews)</span>
            </div>
            <div style="background:#2a2a2a;border-radius:8px;padding:12px;margin:16px 0">
              <div style="display:flex;justify-content:space-between;margin:8px 0">
                <span style="color:#999">Downloads:</span>
                <strong>${model.downloads}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;margin:8px 0">
                <span style="color:#999">Difficulty:</span>
                <span style="background:${DIFFICULTY_COLORS[model.difficulty]};color:#fff;padding:2px 8px;border-radius:3px;font-size:12px">${model.difficulty}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin:8px 0">
                <span style="color:#999">Build Time:</span>
                <strong>${model.buildTime}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;margin:8px 0">
                <span style="color:#999">License:</span>
                <strong>${model.license}</strong>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin:16px 0">
              <button class="market-download-btn" style="flex:1;padding:10px;background:#058dd4;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:14px" data-model-id="${modelId}">
                ${model.price > 0 ? `Purchase (${model.price} tokens)` : 'Download Free'}
              </button>
              <button class="market-favorite-btn" style="padding:10px 16px;background:#${isFavorite ? 'ff6b6b' : '444'};color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600" data-model-id="${modelId}">★</button>
            </div>
          </div>
        </div>

        <!-- Tab Navigation -->
        <div style="display:flex;gap:0;border-bottom:2px solid #333;margin:30px 0 20px 0">
          <button class="market-tab-btn market-tab-overview" style="padding:12px 20px;border:none;background:none;color:#058dd4;cursor:pointer;border-bottom:2px solid #058dd4;font-weight:600" data-tab="overview">Overview</button>
          <button class="market-tab-btn market-tab-steps" style="padding:12px 20px;border:none;background:none;color:#666;cursor:pointer;border-bottom:2px solid transparent;font-weight:600" data-tab="steps">Steps (${model.steps.length})</button>
          <button class="market-tab-btn market-tab-bom" style="padding:12px 20px;border:none;background:none;color:#666;cursor:pointer;border-bottom:2px solid transparent;font-weight:600" data-tab="bom">BOM (${model.bom.length})</button>
          <button class="market-tab-btn market-tab-files" style="padding:12px 20px;border:none;background:none;color:#666;cursor:pointer;border-bottom:2px solid transparent;font-weight:600" data-tab="files">Files</button>
          <button class="market-tab-btn market-tab-reviews" style="padding:12px 20px;border:none;background:none;color:#666;cursor:pointer;border-bottom:2px solid transparent;font-weight:600" data-tab="reviews">Reviews (${model.reviews})</button>
        </div>

        <!-- Tab Content -->
        <div class="market-tab-content" style="display:none" data-tab-content="overview">
          <h2 style="margin:0 0 16px 0;color:#fff">Overview</h2>
          <p style="line-height:1.6;color:#bbb;margin:0 0 20px 0">${model.description}</p>
          <h3 style="margin:20px 0 12px 0;color:#fff">Specifications</h3>
          <div style="background:#2a2a2a;border-radius:8px;padding:16px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <span style="color:#999">Category:</span> <strong>${model.category}</strong>
              </div>
              <div>
                <span style="color:#999">Difficulty:</span> <strong>${model.difficulty}</strong>
              </div>
              <div>
                <span style="color:#999">Build Time:</span> <strong>${model.buildTime}</strong>
              </div>
              <div>
                <span style="color:#999">License:</span> <strong>${model.license}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="market-tab-content" style="display:none" data-tab-content="steps">
          <h2 style="margin:0 0 16px 0;color:#fff">Build Instructions (${model.steps.length} steps)</h2>
          ${model.steps.map((step, idx) => `
            <div style="background:#2a2a2a;border-radius:8px;padding:16px;margin:12px 0">
              <h3 style="margin:0 0 8px 0;color:#058dd4">Step ${idx + 1}: ${step.title}</h3>
              <p style="margin:0 0 12px 0;color:#bbb;line-height:1.5">${step.description}</p>
              ${step.tips ? `<div style="background:#3d3d1f;border-left:3px solid #f59e0b;padding:8px 12px;margin:8px 0;border-radius:4px"><strong style="color:#f59e0b">💡 Tip:</strong> <span style="color:#ccc">${step.tips}</span></div>` : ''}
              ${step.warnings ? `<div style="background:#3d1f1f;border-left:3px solid #ef4444;padding:8px 12px;margin:8px 0;border-radius:4px"><strong style="color:#ef4444">⚠️ Warning:</strong> <span style="color:#ccc">${step.warnings}</span></div>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="market-tab-content" style="display:none" data-tab-content="bom">
          <h2 style="margin:0 0 16px 0;color:#fff">Bill of Materials (${model.bom.length} items)</h2>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;color:#e0e0e0">
              <thead>
                <tr style="border-bottom:2px solid #333">
                  <th style="text-align:left;padding:8px;color:#999;font-weight:600">Part</th>
                  <th style="text-align:center;padding:8px;color:#999;font-weight:600">Qty</th>
                  <th style="text-align:left;padding:8px;color:#999;font-weight:600">Material</th>
                  <th style="text-align:left;padding:8px;color:#999;font-weight:600">Supplier</th>
                  <th style="text-align:left;padding:8px;color:#999;font-weight:600">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                ${model.bom.map(item => `
                  <tr style="border-bottom:1px solid #333">
                    <td style="padding:8px"><strong>${item.part}</strong></td>
                    <td style="text-align:center;padding:8px">${item.qty}</td>
                    <td style="padding:8px">${item.material}</td>
                    <td style="padding:8px"><a href="https://${item.supplier === 'McMaster-Carr' ? 'mcmaster' : 'misumi'}.com" style="color:#058dd4;text-decoration:none">${item.supplier}</a></td>
                    <td style="padding:8px"><strong>${item.estimatedCost}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <h3 style="margin:20px 0 12px 0;color:#fff">Required Tools</h3>
          <ul style="margin:0;padding-left:20px;color:#bbb">
            ${model.tools.map(tool => `<li style="margin:4px 0">${tool}</li>`).join('')}
          </ul>
        </div>

        <div class="market-tab-content" style="display:none" data-tab-content="files">
          <h2 style="margin:0 0 16px 0;color:#fff">Available Files</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="background:#2a2a2a;border-radius:8px;padding:12px;border-left:3px solid #3b82f6">
              <div style="font-weight:600;color:#3b82f6;margin-bottom:8px">STEP File</div>
              <p style="margin:0 0 8px 0;font-size:12px;color:#999">parametric_model.step (2.4 MB)</p>
              <button style="padding:6px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">Download</button>
            </div>
            <div style="background:#2a2a2a;border-radius:8px;padding:12px;border-left:3px solid #06b6d4">
              <div style="font-weight:600;color:#06b6d4;margin-bottom:8px">STL File</div>
              <p style="margin:0 0 8px 0;font-size:12px;color:#999">model_assembly.stl (1.8 MB)</p>
              <button style="padding:6px 12px;background:#06b6d4;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">Download</button>
            </div>
            <div style="background:#2a2a2a;border-radius:8px;padding:12px;border-left:3px solid #8b5cf6">
              <div style="font-weight:600;color:#8b5cf6;margin-bottom:8px">glTF File</div>
              <p style="margin:0 0 8px 0;font-size:12px;color:#999">model_preview.glb (1.1 MB)</p>
              <button style="padding:6px 12px;background:#8b5cf6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">Download</button>
            </div>
            <div style="background:#2a2a2a;border-radius:8px;padding:12px;border-left:3px solid #ec4899">
              <div style="font-weight:600;color:#ec4899;margin-bottom:8px">cycleCAD JSON</div>
              <p style="margin:0 0 8px 0;font-size:12px;color:#999">project.json (568 KB)</p>
              <button style="padding:6px 12px;background:#ec4899;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">Download</button>
            </div>
          </div>
        </div>

        <div class="market-tab-content" style="display:none" data-tab-content="reviews">
          <h2 style="margin:0 0 16px 0;color:#fff">Reviews</h2>
          <p style="color:#999">${model.reviews} review(s)</p>
        </div>
      </div>
    `;

    return detailHTML;
  }

  // Get full marketplace UI
  function getUI() {
    const models = getAllModels();

    return `
      <div style="background:#1e1e1e;color:#e0e0e0;padding:20px;border-radius:8px;max-height:600px;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="margin:0;color:#fff">GrabCAD Marketplace</h2>
          <button class="market-publish-btn" style="padding:8px 16px;background:#10b981;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600">+ Publish Model</button>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:20px">
          <input type="text" class="market-search" placeholder="Search models..." style="flex:1;padding:8px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#e0e0e0">
          <select class="market-filter-category" style="padding:8px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#e0e0e0">
            <option value="">All Categories</option>
            ${CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
          </select>
          <select class="market-filter-difficulty" style="padding:8px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#e0e0e0">
            <option value="">All Levels</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Expert">Expert</option>
          </select>
        </div>

        <div class="market-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
          ${models.map(model => getModelCardHTML(model)).join('')}
        </div>

        <div style="text-align:center;color:#666">
          Showing ${models.length} models
        </div>
      </div>
    `;
  }

  // Purchase model
  function purchaseModel(modelId) {
    const model = getModelById(modelId);
    if (!model || model.price === 0) {
      return { success: false, message: 'Model not purchasable' };
    }

    const tokenEngine = window.cycleCAD?.tokens;
    if (!tokenEngine) {
      return { success: false, message: 'Token engine not available' };
    }

    // Deduct tokens from buyer
    if (tokenEngine.spend) {
      tokenEngine.spend(model.price, { reason: `Purchase: ${model.title}`, modelId });
    }

    // Credit creator
    if (tokenEngine.earn) {
      const royalty = Math.floor(model.price * 0.7); // 70% to creator
      tokenEngine.earn(royalty, { reason: `Royalty: ${model.title}`, modelId });
    }

    // Record purchase
    marketplaceState.purchases[modelId] = { date: new Date().toISOString(), price: model.price };
    saveState();

    return { success: true, message: `Purchased ${model.title} for ${model.price} tokens` };
  }

  // Toggle favorite
  function toggleFavorite(modelId) {
    marketplaceState.favorites[modelId] = !marketplaceState.favorites[modelId];
    saveState();
    return marketplaceState.favorites[modelId];
  }

  // Get earnings for author
  function getEarnings(authorId) {
    let total = 0;
    marketplaceState.publishedModels.forEach(model => {
      if (model.authorId === authorId) {
        const modelPurchases = Object.entries(marketplaceState.purchases)
          .filter(([id]) => id === model.id)
          .length;
        total += modelPurchases * Math.floor(model.price * 0.7);
      }
    });
    return total;
  }

  // Publish new model
  function publishModel(modelData) {
    const newModel = {
      id: `model-${Date.now()}`,
      ...modelData,
      rating: 0,
      downloads: 0,
      reviews: 0
    };
    marketplaceState.publishedModels.push(newModel);
    saveState();
    return newModel;
  }

  // Initialize on load
  loadState();

  // Public API
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.marketplaceV2 = {
    getUI,
    getModelCardHTML,
    getModelDetailHTML,
    getAllModels,
    getModelById,
    purchaseModel,
    toggleFavorite,
    getEarnings,
    publishModel,
    CATEGORIES,
    DIFFICULTY_COLORS
  };

})();

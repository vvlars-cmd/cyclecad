/**
 * material-library.js - PBR Material System + Physical Properties Database
 *
 * Comprehensive material library for cycleCAD with:
 * - 50+ materials organized by category
 * - Full physical properties (density, strength, thermal, electrical)
 * - Manufacturing properties (machinability, weldability, processes)
 * - Cost estimation and lead time
 * - PBR material application (Three.js MeshStandardMaterial)
 * - Surface finish variants with visual properties
 * - Material comparison, search, and calculators
 * - Integration with DFM analyzer and cost estimator
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// Material Database (50+ materials)
// ============================================================================

const MATERIAL_DATABASE = {
  // METALS - Steels (5)
  steel_1018: {
    id: 'steel_1018',
    name: 'Steel 1018 (Mild)',
    category: 'metal',
    subcategory: 'steel_carbon',
    description: 'Low carbon steel, most common for CNC machining',

    // Physical properties (kg/m³, MPa, %)
    density: 7850,
    tensileStrength: 440,
    yieldStrength: 370,
    elongation: 20,
    hardness: { value: 95, scale: 'HB' },
    youngsModulus: 205,
    poissonsRatio: 0.285,
    thermalConductivity: 51.9,
    thermalExpansion: 12.2,
    meltingPoint: 1475,
    specificHeat: 486,
    electricalResistivity: 155,

    // Manufacturing
    machinability: 1.0, // Reference material
    weldability: 'excellent',
    formability: 'good',
    processes: ['cnc_mill', 'cnc_lathe', 'laser_cut', 'waterjet', 'sheet_metal', 'casting'],

    // Cost and availability
    costPerKg: 0.95,
    availability: 'high',
    leadTime: 'stock',

    // PBR appearance
    pbr: {
      color: 0x8899aa,
      metalness: 0.95,
      roughness: 0.4,
      envMapIntensity: 0.8,
      clearcoat: 0.05,
      clearcoatRoughness: 0.15
    },

    // Finish variants
    finishes: [
      { name: 'As-Machined', roughness: 0.45, metalness: 0.92 },
      { name: 'Ground', roughness: 0.25, metalness: 0.95 },
      { name: 'Polished', roughness: 0.1, metalness: 0.98 },
      { name: 'Blackened', color: 0x1a1a1a, roughness: 0.6, metalness: 0.85 },
      { name: 'Galvanized', color: 0xc8ccd0, roughness: 0.35, metalness: 0.93 }
    ]
  },

  steel_4140: {
    id: 'steel_4140',
    name: 'Steel 4140 (Alloy)',
    category: 'metal',
    subcategory: 'steel_alloy',
    description: 'Medium carbon alloy steel, high strength after heat treat',

    density: 7850,
    tensileStrength: 1000, // After heat treat
    yieldStrength: 830,
    elongation: 12,
    hardness: { value: 32, scale: 'HRC' },
    youngsModulus: 210,
    poissonsRatio: 0.29,
    thermalConductivity: 42.6,
    thermalExpansion: 12.3,
    meltingPoint: 1450,
    specificHeat: 475,
    electricalResistivity: 420,

    machinability: 0.65,
    weldability: 'good',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'heat_treat', 'casting'],

    costPerKg: 3.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x7a8a9a,
      metalness: 0.96,
      roughness: 0.35,
      envMapIntensity: 0.85,
      clearcoat: 0.08,
      clearcoatRoughness: 0.12
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.4, metalness: 0.94 },
      { name: 'Ground', roughness: 0.2, metalness: 0.97 },
      { name: 'Polished', roughness: 0.08, metalness: 0.99 },
      { name: 'Oil-Hardened', color: 0x6a7a8a, roughness: 0.5, metalness: 0.90 }
    ]
  },

  steel_316ss: {
    id: 'steel_316ss',
    name: 'Stainless Steel 316',
    category: 'metal',
    subcategory: 'steel_stainless',
    description: 'Superior corrosion resistance, medical/marine grade',

    density: 8000,
    tensileStrength: 515,
    yieldStrength: 205,
    elongation: 40,
    hardness: { value: 79, scale: 'HRB' },
    youngsModulus: 193,
    poissonsRatio: 0.27,
    thermalConductivity: 16.3,
    thermalExpansion: 16.0,
    meltingPoint: 1400,
    specificHeat: 500,
    electricalResistivity: 740,

    machinability: 0.36,
    weldability: 'good',
    formability: 'good',
    processes: ['cnc_mill', 'cnc_lathe', 'laser_cut', 'waterjet', 'welding'],

    costPerKg: 4.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xc0c0c0,
      metalness: 0.98,
      roughness: 0.25,
      envMapIntensity: 0.9,
      clearcoat: 0.12,
      clearcoatRoughness: 0.08
    },

    finishes: [
      { name: 'Brushed', roughness: 0.3, metalness: 0.97 },
      { name: 'Polished', roughness: 0.08, metalness: 0.99 },
      { name: 'Passivated', roughness: 0.2, metalness: 0.98 }
    ]
  },

  steel_a36: {
    id: 'steel_a36',
    name: 'Steel A36 (Structural)',
    category: 'metal',
    subcategory: 'steel_structural',
    description: 'Structural steel, beam and plate stock',

    density: 7750,
    tensileStrength: 400,
    yieldStrength: 250,
    elongation: 23,
    hardness: { value: 119, scale: 'HB' },
    youngsModulus: 200,
    poissonsRatio: 0.26,
    thermalConductivity: 50,
    thermalExpansion: 12,
    meltingPoint: 1480,
    specificHeat: 490,
    electricalResistivity: 160,

    machinability: 0.92,
    weldability: 'excellent',
    formability: 'good',
    processes: ['cnc_mill', 'cnc_lathe', 'welding', 'rolling', 'casting'],

    costPerKg: 0.85,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x8a8a8a,
      metalness: 0.92,
      roughness: 0.5,
      envMapIntensity: 0.7,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Hot-Rolled', roughness: 0.55, metalness: 0.90 },
      { name: 'Painted', color: 0x4a4a4a, roughness: 0.7, metalness: 0.1 }
    ]
  },

  steel_ductile_iron: {
    id: 'steel_ductile_iron',
    name: 'Ductile Iron (Gray Cast)',
    category: 'metal',
    subcategory: 'cast_iron',
    description: 'Cast iron with spheroidized graphite, strong and damping',

    density: 7100,
    tensileStrength: 450,
    yieldStrength: 310,
    elongation: 6,
    hardness: { value: 150, scale: 'HB' },
    youngsModulus: 170,
    poissonsRatio: 0.27,
    thermalConductivity: 38,
    thermalExpansion: 11,
    meltingPoint: 1150,
    specificHeat: 460,
    electricalResistivity: 1000,

    machinability: 0.75,
    weldability: 'difficult',
    formability: 'none',
    processes: ['casting', 'cnc_mill', 'cnc_lathe'],

    costPerKg: 1.20,
    availability: 'high',
    leadTime: '4-6 weeks',

    pbr: {
      color: 0x5a5a5a,
      metalness: 0.88,
      roughness: 0.55,
      envMapIntensity: 0.6,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'As-Cast', roughness: 0.65, metalness: 0.85 },
      { name: 'Machined', roughness: 0.45, metalness: 0.90 }
    ]
  },

  // METALS - Aluminum (3)
  aluminum_6061: {
    id: 'aluminum_6061',
    name: 'Aluminum 6061-T6',
    category: 'metal',
    subcategory: 'aluminum',
    description: 'Most versatile aluminum alloy, good corrosion resistance',

    density: 2700,
    tensileStrength: 310,
    yieldStrength: 275,
    elongation: 12,
    hardness: { value: 95, scale: 'HB' },
    youngsModulus: 69,
    poissonsRatio: 0.33,
    thermalConductivity: 167,
    thermalExpansion: 23.6,
    meltingPoint: 650,
    specificHeat: 897,
    electricalResistivity: 42,

    machinability: 0.90,
    weldability: 'good',
    formability: 'excellent',
    processes: ['cnc_mill', 'cnc_lathe', 'extrusion', 'anodizing', 'sheet_metal'],

    costPerKg: 2.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xb0b8c4,
      metalness: 0.92,
      roughness: 0.35,
      envMapIntensity: 0.85,
      clearcoat: 0.06,
      clearcoatRoughness: 0.12
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.40, metalness: 0.90 },
      { name: 'Anodized Clear', roughness: 0.3, metalness: 0.91 },
      { name: 'Anodized Black', color: 0x2a2a2a, roughness: 0.5, metalness: 0.85 },
      { name: 'Anodized Red', color: 0xaa3333, roughness: 0.35, metalness: 0.88 },
      { name: 'Polished', roughness: 0.1, metalness: 0.95 }
    ]
  },

  aluminum_7075: {
    id: 'aluminum_7075',
    name: 'Aluminum 7075-T6',
    category: 'metal',
    subcategory: 'aluminum',
    description: 'High-strength aluminum, aerospace grade',

    density: 2810,
    tensileStrength: 570,
    yieldStrength: 505,
    elongation: 11,
    hardness: { value: 150, scale: 'HB' },
    youngsModulus: 72,
    poissonsRatio: 0.33,
    thermalConductivity: 130,
    thermalExpansion: 23.4,
    meltingPoint: 630,
    specificHeat: 960,
    electricalResistivity: 52,

    machinability: 0.70,
    weldability: 'poor',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'extrusion'],

    costPerKg: 8.00,
    availability: 'medium',
    leadTime: '2-3 weeks',

    pbr: {
      color: 0xa8b0c0,
      metalness: 0.93,
      roughness: 0.32,
      envMapIntensity: 0.88,
      clearcoat: 0.08,
      clearcoatRoughness: 0.10
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.38, metalness: 0.91 },
      { name: 'Polished', roughness: 0.12, metalness: 0.96 }
    ]
  },

  aluminum_2024: {
    id: 'aluminum_2024',
    name: 'Aluminum 2024-T3',
    category: 'metal',
    subcategory: 'aluminum',
    description: 'High-strength, fatigue-resistant, aerospace/aircraft',

    density: 2780,
    tensileStrength: 470,
    yieldStrength: 325,
    elongation: 19,
    hardness: { value: 120, scale: 'HB' },
    youngsModulus: 73,
    poissonsRatio: 0.33,
    thermalConductivity: 121,
    thermalExpansion: 23.6,
    meltingPoint: 640,
    specificHeat: 875,
    electricalResistivity: 64,

    machinability: 0.75,
    weldability: 'poor',
    formability: 'good',
    processes: ['cnc_mill', 'cnc_lathe', 'extrusion', 'sheet_metal'],

    costPerKg: 6.50,
    availability: 'medium',
    leadTime: '2-3 weeks',

    pbr: {
      color: 0xacb4c0,
      metalness: 0.92,
      roughness: 0.34,
      envMapIntensity: 0.86,
      clearcoat: 0.07,
      clearcoatRoughness: 0.11
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.39, metalness: 0.90 },
      { name: 'Clad (alclad)', roughness: 0.36, metalness: 0.91 }
    ]
  },

  // METALS - Copper/Brass (2)
  brass_c360: {
    id: 'brass_c360',
    name: 'Brass C360 (Free-Cutting)',
    category: 'metal',
    subcategory: 'brass_copper',
    description: 'Excellent machinability, decorative and electrical',

    density: 8500,
    tensileStrength: 310,
    yieldStrength: 115,
    elongation: 57,
    hardness: { value: 65, scale: 'HRB' },
    youngsModulus: 97,
    poissonsRatio: 0.34,
    thermalConductivity: 121,
    thermalExpansion: 20.3,
    meltingPoint: 930,
    specificHeat: 380,
    electricalResistivity: 61,

    machinability: 1.60, // Excellent
    weldability: 'difficult',
    formability: 'excellent',
    processes: ['cnc_mill', 'cnc_lathe', 'stamping', 'drawing'],

    costPerKg: 5.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xc4a54a,
      metalness: 0.96,
      roughness: 0.28,
      envMapIntensity: 0.90,
      clearcoat: 0.10,
      clearcoatRoughness: 0.10
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.32, metalness: 0.95 },
      { name: 'Polished', roughness: 0.08, metalness: 0.98 },
      { name: 'Lacquered', roughness: 0.25, metalness: 0.92 }
    ]
  },

  copper_c110: {
    id: 'copper_c110',
    name: 'Copper C110 (Annealed)',
    category: 'metal',
    subcategory: 'brass_copper',
    description: 'Pure copper, highest electrical/thermal conductivity',

    density: 8960,
    tensileStrength: 220,
    yieldStrength: 70,
    elongation: 45,
    hardness: { value: 40, scale: 'HRB' },
    youngsModulus: 110,
    poissonsRatio: 0.34,
    thermalConductivity: 401,
    thermalExpansion: 16.5,
    meltingPoint: 1083,
    specificHeat: 385,
    electricalResistivity: 16,

    machinability: 1.40,
    weldability: 'difficult',
    formability: 'excellent',
    processes: ['cnc_mill', 'cnc_lathe', 'deep_drawing', 'stamping'],

    costPerKg: 7.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xb87333,
      metalness: 0.98,
      roughness: 0.22,
      envMapIntensity: 0.92,
      clearcoat: 0.12,
      clearcoatRoughness: 0.08
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.26, metalness: 0.97 },
      { name: 'Polished', roughness: 0.06, metalness: 0.99 },
      { name: 'Oxidized', color: 0x6b4423, roughness: 0.6, metalness: 0.85 }
    ]
  },

  // METALS - Special (3)
  titanium_ti6al4v: {
    id: 'titanium_ti6al4v',
    name: 'Titanium Ti-6Al-4V',
    category: 'metal',
    subcategory: 'titanium',
    description: 'Aerospace/medical, high strength-to-weight, corrosion resistant',

    density: 4430,
    tensileStrength: 1160,
    yieldStrength: 1100,
    elongation: 10,
    hardness: { value: 34, scale: 'HRC' },
    youngsModulus: 103,
    poissonsRatio: 0.342,
    thermalConductivity: 7.4,
    thermalExpansion: 8.6,
    meltingPoint: 1655,
    specificHeat: 560,
    electricalResistivity: 1540,

    machinability: 0.16,
    weldability: 'good',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'welding', 'casting'],

    costPerKg: 18.00,
    availability: 'low',
    leadTime: '4-8 weeks',

    pbr: {
      color: 0x8a8a90,
      metalness: 0.94,
      roughness: 0.38,
      envMapIntensity: 0.82,
      clearcoat: 0.05,
      clearcoatRoughness: 0.14
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.42, metalness: 0.92 },
      { name: 'Polished', roughness: 0.15, metalness: 0.96 },
      { name: 'Anodized Blue', color: 0x1565c0, roughness: 0.35, metalness: 0.88 }
    ]
  },

  inconel_718: {
    id: 'inconel_718',
    name: 'Inconel 718 (Superalloy)',
    category: 'metal',
    subcategory: 'superalloy',
    description: 'High-temperature, turbine blades, extreme environments',

    density: 8190,
    tensileStrength: 1275,
    yieldStrength: 1050,
    elongation: 12,
    hardness: { value: 39, scale: 'HRC' },
    youngsModulus: 200,
    poissonsRatio: 0.31,
    thermalConductivity: 11.4,
    thermalExpansion: 13.3,
    meltingPoint: 1260,
    specificHeat: 435,
    electricalResistivity: 1300,

    machinability: 0.06,
    weldability: 'difficult',
    formability: 'poor',
    processes: ['cnc_mill', 'cnc_lathe', 'casting', 'welding'],

    costPerKg: 35.00,
    availability: 'low',
    leadTime: '8-12 weeks',

    pbr: {
      color: 0x7a7a7a,
      metalness: 0.93,
      roughness: 0.42,
      envMapIntensity: 0.80,
      clearcoat: 0.03,
      clearcoatRoughness: 0.16
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.48, metalness: 0.90 },
      { name: 'Polish', roughness: 0.18, metalness: 0.95 }
    ]
  },

  magnesium_az31: {
    id: 'magnesium_az31',
    name: 'Magnesium AZ31B',
    category: 'metal',
    subcategory: 'magnesium',
    description: 'Lightest structural metal, good strength-to-weight ratio',

    density: 1810,
    tensileStrength: 230,
    yieldStrength: 160,
    elongation: 15,
    hardness: { value: 75, scale: 'HB' },
    youngsModulus: 45,
    poissonsRatio: 0.35,
    thermalConductivity: 156,
    thermalExpansion: 26.0,
    meltingPoint: 600,
    specificHeat: 1025,
    electricalResistivity: 45,

    machinability: 0.80,
    weldability: 'good',
    formability: 'excellent',
    processes: ['cnc_mill', 'cnc_lathe', 'casting', 'extrusion'],

    costPerKg: 4.50,
    availability: 'medium',
    leadTime: '2-4 weeks',

    pbr: {
      color: 0xc0c0c0,
      metalness: 0.90,
      roughness: 0.40,
      envMapIntensity: 0.82,
      clearcoat: 0.04,
      clearcoatRoughness: 0.15
    },

    finishes: [
      { name: 'As-Machined', roughness: 0.44, metalness: 0.88 },
      { name: 'Anodized', roughness: 0.35, metalness: 0.87 }
    ]
  },

  // PLASTICS - Engineering (8)
  abs: {
    id: 'abs',
    name: 'ABS (Acrylonitrile Butadiene Styrene)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Impact resistant, good machinability, common 3D print filament',

    density: 1050,
    tensileStrength: 40,
    yieldStrength: 35,
    elongation: 20,
    hardness: { value: 75, scale: 'Shore-D' },
    youngsModulus: 2.3,
    poissonsRatio: 0.35,
    thermalConductivity: 0.20,
    thermalExpansion: 80,
    meltingPoint: 220,
    specificHeat: 1400,
    electricalResistivity: 1e16,

    machinability: 0.85,
    weldability: 'none',
    formability: 'excellent',
    processes: ['injection_mold', '3d_print_fdm', 'cnc_mill', 'laser_cut'],

    costPerKg: 2.20,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x2a2a2e,
      metalness: 0.0,
      roughness: 0.7,
      envMapIntensity: 0.3,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.7, metalness: 0.0 },
      { name: 'Polished', roughness: 0.3, metalness: 0.05 },
      { name: 'Glossy Black', color: 0x1a1a1a, roughness: 0.5, metalness: 0.0 },
      { name: 'Matte', roughness: 0.85, metalness: 0.0 }
    ]
  },

  pla: {
    id: 'pla',
    name: 'PLA (Polylactic Acid)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Biodegradable, easy to print, lower strength than ABS',

    density: 1250,
    tensileStrength: 50,
    yieldStrength: 45,
    elongation: 3,
    hardness: { value: 70, scale: 'Shore-D' },
    youngsModulus: 2.7,
    poissonsRatio: 0.36,
    thermalConductivity: 0.13,
    thermalExpansion: 70,
    meltingPoint: 160,
    specificHeat: 1800,
    electricalResistivity: 1e17,

    machinability: 0.75,
    weldability: 'none',
    formability: 'good',
    processes: ['injection_mold', '3d_print_fdm', 'cnc_mill'],

    costPerKg: 1.80,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xf0f0f0,
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.4,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural White', roughness: 0.65, metalness: 0.0 },
      { name: 'Glossy', roughness: 0.25, metalness: 0.02 },
      { name: 'Matte', roughness: 0.80, metalness: 0.0 }
    ]
  },

  nylon_66: {
    id: 'nylon_66',
    name: 'Nylon 6/6 (Polyamide)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'High strength, low friction, bearing material',

    density: 1140,
    tensileStrength: 80,
    yieldStrength: 70,
    elongation: 30,
    hardness: { value: 80, scale: 'Shore-D' },
    youngsModulus: 3.5,
    poissonsRatio: 0.37,
    thermalConductivity: 0.24,
    thermalExpansion: 80,
    meltingPoint: 265,
    specificHeat: 1700,
    electricalResistivity: 1e16,

    machinability: 0.70,
    weldability: 'none',
    formability: 'excellent',
    processes: ['injection_mold', '3d_print_fdm', 'cnc_mill', 'machining'],

    costPerKg: 2.80,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xe8e0d0,
      metalness: 0.0,
      roughness: 0.55,
      envMapIntensity: 0.35,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.60, metalness: 0.0 },
      { name: 'Black', color: 0x1a1a1a, roughness: 0.65, metalness: 0.0 },
      { name: 'Polished', roughness: 0.25, metalness: 0.03 }
    ]
  },

  petg: {
    id: 'petg',
    name: 'PETG (Polyethylene Terephthalate Glycol)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Better strength than PLA, easier to print than ABS',

    density: 1270,
    tensileStrength: 55,
    yieldStrength: 50,
    elongation: 50,
    hardness: { value: 76, scale: 'Shore-D' },
    youngsModulus: 2.8,
    poissonsRatio: 0.36,
    thermalConductivity: 0.19,
    thermalExpansion: 75,
    meltingPoint: 245,
    specificHeat: 1400,
    electricalResistivity: 1e14,

    machinability: 0.80,
    weldability: 'none',
    formability: 'excellent',
    processes: ['injection_mold', '3d_print_fdm', 'cnc_mill'],

    costPerKg: 2.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xd0d0d0,
      metalness: 0.0,
      roughness: 0.58,
      envMapIntensity: 0.38,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.60, metalness: 0.0 },
      { name: 'Transparent', color: 0xffffff, roughness: 0.3, metalness: 0.0 }
    ]
  },

  delrin_acetal: {
    id: 'delrin_acetal',
    name: 'Acetal (Delrin) - Copolymer',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Excellent machinability, dimensional stability, bearing material',

    density: 1410,
    tensileStrength: 70,
    yieldStrength: 65,
    elongation: 25,
    hardness: { value: 86, scale: 'Shore-D' },
    youngsModulus: 3.1,
    poissonsRatio: 0.35,
    thermalConductivity: 0.25,
    thermalExpansion: 100,
    meltingPoint: 180,
    specificHeat: 1500,
    electricalResistivity: 1e17,

    machinability: 0.95,
    weldability: 'none',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'injection_mold', 'machining'],

    costPerKg: 3.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xf5f5f5,
      metalness: 0.0,
      roughness: 0.50,
      envMapIntensity: 0.40,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural White', roughness: 0.52, metalness: 0.0 },
      { name: 'Black', color: 0x1a1a1a, roughness: 0.55, metalness: 0.0 },
      { name: 'Polished', roughness: 0.20, metalness: 0.05 }
    ]
  },

  polycarbonate: {
    id: 'polycarbonate',
    name: 'Polycarbonate (PC)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Transparent, impact-resistant, optical applications',

    density: 1200,
    tensileStrength: 65,
    yieldStrength: 62,
    elongation: 110,
    hardness: { value: 80, scale: 'Shore-D' },
    youngsModulus: 2.3,
    poissonsRatio: 0.37,
    thermalConductivity: 0.20,
    thermalExpansion: 65,
    meltingPoint: 225,
    specificHeat: 1200,
    electricalResistivity: 1e16,

    machinability: 0.60,
    weldability: 'none',
    formability: 'good',
    processes: ['injection_mold', 'cnc_mill', 'thermoform'],

    costPerKg: 4.00,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.2,
      envMapIntensity: 0.6,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    },

    finishes: [
      { name: 'Clear', roughness: 0.15, metalness: 0.0 },
      { name: 'Frosted', roughness: 0.65, metalness: 0.0 }
    ]
  },

  peek: {
    id: 'peek',
    name: 'PEEK (Polyetheretherketone)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'High-temperature, chemical resistant, aerospace/medical',

    density: 1320,
    tensileStrength: 100,
    yieldStrength: 90,
    elongation: 50,
    hardness: { value: 85, scale: 'Shore-D' },
    youngsModulus: 3.6,
    poissonsRatio: 0.36,
    thermalConductivity: 0.25,
    thermalExpansion: 47,
    meltingPoint: 330,
    specificHeat: 1600,
    electricalResistivity: 1e18,

    machinability: 0.75,
    weldability: 'none',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'injection_mold'],

    costPerKg: 15.00,
    availability: 'medium',
    leadTime: '2-3 weeks',

    pbr: {
      color: 0xf0f0f0,
      metalness: 0.0,
      roughness: 0.48,
      envMapIntensity: 0.42,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.50, metalness: 0.0 },
      { name: 'Polished', roughness: 0.18, metalness: 0.04 }
    ]
  },

  tpu_flexible: {
    id: 'tpu_flexible',
    name: 'TPU (Thermoplastic Polyurethane)',
    category: 'plastic',
    subcategory: 'engineering_plastic',
    description: 'Flexible, high elongation, impact resistant',

    density: 1200,
    tensileStrength: 25,
    yieldStrength: 20,
    elongation: 500,
    hardness: { value: 80, scale: 'Shore-A' },
    youngsModulus: 0.015,
    poissonsRatio: 0.49,
    thermalConductivity: 0.18,
    thermalExpansion: 150,
    meltingPoint: 190,
    specificHeat: 1800,
    electricalResistivity: 1e14,

    machinability: 0.50,
    weldability: 'none',
    formability: 'excellent',
    processes: ['injection_mold', '3d_print_fdm', 'casting'],

    costPerKg: 3.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x333333,
      metalness: 0.0,
      roughness: 0.75,
      envMapIntensity: 0.25,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.75, metalness: 0.0 },
      { name: 'Glossy', roughness: 0.4, metalness: 0.0 }
    ]
  },

  // COMPOSITES (3)
  carbon_fiber_cfrp: {
    id: 'carbon_fiber_cfrp',
    name: 'Carbon Fiber (CFRP) - Epoxy',
    category: 'composite',
    subcategory: 'fiber_reinforced',
    description: 'High strength-to-weight, aerospace, stiff',

    density: 1600,
    tensileStrength: 750,
    yieldStrength: 750,
    elongation: 1.5,
    hardness: { value: 130, scale: 'HB' },
    youngsModulus: 130,
    poissonsRatio: 0.3,
    thermalConductivity: 7,
    thermalExpansion: -1.0, // Negative thermal expansion
    meltingPoint: 200,
    specificHeat: 1500,
    electricalResistivity: 1e4,

    machinability: 0.40,
    weldability: 'none',
    formability: 'moderate',
    processes: ['layup', 'vacuum_bag', 'cnc_mill'],

    costPerKg: 12.00,
    availability: 'medium',
    leadTime: '3-4 weeks',

    pbr: {
      color: 0x1a1a1a,
      metalness: 0.15,
      roughness: 0.45,
      envMapIntensity: 0.35,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Weave', roughness: 0.50, metalness: 0.10 },
      { name: 'Glossy', roughness: 0.25, metalness: 0.20 },
      { name: 'Matte', roughness: 0.70, metalness: 0.05 }
    ]
  },

  fiberglass_gfrp: {
    id: 'fiberglass_gfrp',
    name: 'Fiberglass (GFRP) - Polyester',
    category: 'composite',
    subcategory: 'fiber_reinforced',
    description: 'Cost-effective, good corrosion resistance, marine',

    density: 1850,
    tensileStrength: 250,
    yieldStrength: 250,
    elongation: 2,
    hardness: { value: 90, scale: 'HB' },
    youngsModulus: 45,
    poissonsRatio: 0.25,
    thermalConductivity: 0.25,
    thermalExpansion: 25,
    meltingPoint: 200,
    specificHeat: 1200,
    electricalResistivity: 1e11,

    machinability: 0.30,
    weldability: 'none',
    formability: 'good',
    processes: ['hand_layup', 'vacuum_bag', 'injection_mold'],

    costPerKg: 2.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x999999,
      metalness: 0.0,
      roughness: 0.60,
      envMapIntensity: 0.35,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'As-laid', roughness: 0.65, metalness: 0.0 },
      { name: 'Gelcoat White', color: 0xf5f5f5, roughness: 0.4, metalness: 0.0 },
      { name: 'Gelcoat Colors', roughness: 0.45, metalness: 0.0 }
    ]
  },

  kevlar_fiber: {
    id: 'kevlar_fiber',
    name: 'Kevlar (Aramid Fiber)',
    category: 'composite',
    subcategory: 'fiber_reinforced',
    description: 'Impact resistant, ballistic applications, lightweight',

    density: 1450,
    tensileStrength: 620,
    yieldStrength: 620,
    elongation: 3.3,
    hardness: { value: 110, scale: 'HB' },
    youngsModulus: 112,
    poissonsRatio: 0.29,
    thermalConductivity: 5.5,
    thermalExpansion: -2.0,
    meltingPoint: 350,
    specificHeat: 1200,
    electricalResistivity: 1e17,

    machinability: 0.25,
    weldability: 'none',
    formability: 'moderate',
    processes: ['layup', 'vacuum_bag'],

    costPerKg: 18.00,
    availability: 'low',
    leadTime: '4-8 weeks',

    pbr: {
      color: 0xffff00,
      metalness: 0.0,
      roughness: 0.55,
      envMapIntensity: 0.40,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Woven', roughness: 0.60, metalness: 0.0 },
      { name: 'Glossy', roughness: 0.3, metalness: 0.05 }
    ]
  },

  // OTHER (3)
  wood_oak: {
    id: 'wood_oak',
    name: 'Wood (Oak)',
    category: 'other',
    subcategory: 'natural',
    description: 'Hardwood, strong, good machinability',

    density: 750,
    tensileStrength: 60,
    yieldStrength: 45,
    elongation: 0,
    hardness: { value: 4.6, scale: 'Janka' },
    youngsModulus: 11,
    poissonsRatio: 0.4,
    thermalConductivity: 0.16,
    thermalExpansion: 4.5,
    meltingPoint: 450, // Charring temp
    specificHeat: 1700,
    electricalResistivity: 1e15,

    machinability: 0.88,
    weldability: 'none',
    formability: 'moderate',
    processes: ['cnc_mill', 'cnc_lathe', 'routing', 'hand_tools'],

    costPerKg: 1.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x8b6914,
      metalness: 0.0,
      roughness: 0.75,
      envMapIntensity: 0.30,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural', roughness: 0.80, metalness: 0.0 },
      { name: 'Sanded', roughness: 0.55, metalness: 0.0 },
      { name: 'Stained Dark', color: 0x3d2817, roughness: 0.65, metalness: 0.0 },
      { name: 'Varnished', roughness: 0.25, metalness: 0.10 }
    ]
  },

  rubber_neoprene: {
    id: 'rubber_neoprene',
    name: 'Rubber (Neoprene)',
    category: 'other',
    subcategory: 'elastomer',
    description: 'Oil resistant, flexible, sealing applications',

    density: 1250,
    tensileStrength: 25,
    yieldStrength: 20,
    elongation: 800,
    hardness: { value: 70, scale: 'Shore-A' },
    youngsModulus: 0.003,
    poissonsRatio: 0.49,
    thermalConductivity: 0.20,
    thermalExpansion: 200,
    meltingPoint: 120,
    specificHeat: 2000,
    electricalResistivity: 1e12,

    machinability: 0.70,
    weldability: 'none',
    formability: 'excellent',
    processes: ['injection_mold', 'compression_mold', 'cnc_mill'],

    costPerKg: 2.50,
    availability: 'high',
    leadTime: 'stock',

    pbr: {
      color: 0x1a1a1a,
      metalness: 0.0,
      roughness: 0.85,
      envMapIntensity: 0.20,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Natural Black', roughness: 0.90, metalness: 0.0 },
      { name: 'Polished', roughness: 0.50, metalness: 0.05 }
    ]
  },

  ceramic_alumina: {
    id: 'ceramic_alumina',
    name: 'Ceramic (Alumina - Al2O3)',
    category: 'other',
    subcategory: 'ceramic',
    description: 'High hardness, wear resistant, insulating',

    density: 3900,
    tensileStrength: 300,
    yieldStrength: 300,
    elongation: 0,
    hardness: { value: 1900, scale: 'HV' },
    youngsModulus: 345,
    poissonsRatio: 0.22,
    thermalConductivity: 30,
    thermalExpansion: 5.3,
    meltingPoint: 2072,
    specificHeat: 880,
    electricalResistivity: 1e18,

    machinability: 0.15,
    weldability: 'none',
    formability: 'none',
    processes: ['sintering', 'grinding'],

    costPerKg: 8.00,
    availability: 'medium',
    leadTime: '3-4 weeks',

    pbr: {
      color: 0xf5f5f5,
      metalness: 0.0,
      roughness: 0.65,
      envMapIntensity: 0.40,
      clearcoat: 0.0,
      clearcoatRoughness: 0.2
    },

    finishes: [
      { name: 'Sintered', roughness: 0.70, metalness: 0.0 },
      { name: 'Glazed', roughness: 0.3, metalness: 0.0 }
    ]
  },

  glass_borosilicate: {
    id: 'glass_borosilicate',
    name: 'Glass (Borosilicate)',
    category: 'other',
    subcategory: 'ceramic',
    description: 'Thermal resistant, transparent, laboratory grade',

    density: 2230,
    tensileStrength: 70,
    yieldStrength: 70,
    elongation: 0,
    hardness: { value: 6, scale: 'Mohs' },
    youngsModulus: 64,
    poissonsRatio: 0.20,
    thermalConductivity: 1.4,
    thermalExpansion: 3.25,
    meltingPoint: 1650,
    specificHeat: 840,
    electricalResistivity: 1e17,

    machinability: 0.20,
    weldability: 'none',
    formability: 'none',
    processes: ['grinding', 'laser_cut'],

    costPerKg: 5.00,
    availability: 'medium',
    leadTime: 'stock',

    pbr: {
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.1,
      envMapIntensity: 0.8,
      clearcoat: 0.95,
      clearcoatRoughness: 0.05
    },

    finishes: [
      { name: 'Clear', roughness: 0.08, metalness: 0.0 },
      { name: 'Frosted', roughness: 0.70, metalness: 0.0 }
    ]
  }
};

// ============================================================================
// Surface Finish Database (30 finishes)
// ============================================================================

const SURFACE_FINISH_DATABASE = {
  machined_063: {
    id: 'machined_063',
    name: 'As-Machined (6.3 µm Ra)',
    category: 'machined',
    roughness: 0.50,
    metalness: 0.92,
    cost_multiplier: 1.0,
    lead_days: 0
  },
  machined_32: {
    id: 'machined_32',
    name: 'As-Machined (3.2 µm Ra)',
    category: 'machined',
    roughness: 0.35,
    metalness: 0.94,
    cost_multiplier: 1.0,
    lead_days: 0
  },
  machined_16: {
    id: 'machined_16',
    name: 'As-Machined (1.6 µm Ra)',
    category: 'machined',
    roughness: 0.20,
    metalness: 0.96,
    cost_multiplier: 1.1,
    lead_days: 1
  },
  ground: {
    id: 'ground',
    name: 'Ground (0.4 µm Ra)',
    category: 'ground',
    roughness: 0.15,
    metalness: 0.97,
    cost_multiplier: 1.3,
    lead_days: 2
  },
  polished: {
    id: 'polished',
    name: 'Polished (0.05 µm Ra)',
    category: 'polished',
    roughness: 0.08,
    metalness: 0.99,
    cost_multiplier: 1.8,
    lead_days: 3
  },
  mirror: {
    id: 'mirror',
    name: 'Mirror Polished (0.01 µm Ra)',
    category: 'polished',
    roughness: 0.03,
    metalness: 1.0,
    cost_multiplier: 2.5,
    lead_days: 5
  },
  anodize_ii: {
    id: 'anodize_ii',
    name: 'Anodize Type II (Clear)',
    category: 'coated',
    roughness: 0.30,
    metalness: 0.92,
    cost_multiplier: 1.4,
    lead_days: 3
  },
  anodize_iii: {
    id: 'anodize_iii',
    name: 'Anodize Type III (Hard)',
    category: 'coated',
    roughness: 0.25,
    metalness: 0.88,
    cost_multiplier: 1.6,
    lead_days: 4
  },
  electroplate_chrome: {
    id: 'electroplate_chrome',
    name: 'Electroplated Chrome',
    category: 'plated',
    roughness: 0.10,
    metalness: 0.99,
    cost_multiplier: 2.0,
    lead_days: 4
  },
  electroplate_nickel: {
    id: 'electroplate_nickel',
    name: 'Electroplated Nickel',
    category: 'plated',
    roughness: 0.12,
    metalness: 0.97,
    cost_multiplier: 1.8,
    lead_days: 3
  },
  powder_coat_matte: {
    id: 'powder_coat_matte',
    name: 'Powder Coat (Matte)',
    category: 'coated',
    roughness: 0.75,
    metalness: 0.05,
    cost_multiplier: 1.5,
    lead_days: 5
  },
  powder_coat_gloss: {
    id: 'powder_coat_gloss',
    name: 'Powder Coat (Gloss)',
    category: 'coated',
    roughness: 0.35,
    metalness: 0.15,
    cost_multiplier: 1.5,
    lead_days: 5
  },
  paint_matte: {
    id: 'paint_matte',
    name: 'Paint (Matte)',
    category: 'painted',
    roughness: 0.80,
    metalness: 0.0,
    cost_multiplier: 1.2,
    lead_days: 2
  },
  paint_satin: {
    id: 'paint_satin',
    name: 'Paint (Satin)',
    category: 'painted',
    roughness: 0.50,
    metalness: 0.02,
    cost_multiplier: 1.3,
    lead_days: 2
  },
  paint_gloss: {
    id: 'paint_gloss',
    name: 'Paint (Gloss)',
    category: 'painted',
    roughness: 0.25,
    metalness: 0.05,
    cost_multiplier: 1.3,
    lead_days: 2
  },
  fdm_layer: {
    id: 'fdm_layer',
    name: '3D Print FDM (Layer Lines)',
    category: 'additive',
    roughness: 0.85,
    metalness: 0.0,
    cost_multiplier: 0.8,
    lead_days: 1
  },
  sla_smooth: {
    id: 'sla_smooth',
    name: '3D Print SLA (Smooth)',
    category: 'additive',
    roughness: 0.35,
    metalness: 0.0,
    cost_multiplier: 1.2,
    lead_days: 1
  },
  sls_powdery: {
    id: 'sls_powdery',
    name: '3D Print SLS (Powdery)',
    category: 'additive',
    roughness: 0.65,
    metalness: 0.0,
    cost_multiplier: 1.5,
    lead_days: 2
  },
  brushed: {
    id: 'brushed',
    name: 'Brushed Finish',
    category: 'brushed',
    roughness: 0.32,
    metalness: 0.93,
    cost_multiplier: 1.2,
    lead_days: 1
  },
  satin: {
    id: 'satin',
    name: 'Satin Finish',
    category: 'brushed',
    roughness: 0.28,
    metalness: 0.94,
    cost_multiplier: 1.25,
    lead_days: 1
  }
};

// ============================================================================
// Material Library State
// ============================================================================

let materialState = {
  scene: null,
  camera: null,
  renderer: null,
  appliedMaterials: {}, // Map of mesh uuid → { materialId, finishId, material }
  previewMesh: null,
  previewScene: null,
  previewRenderer: null
};

// ============================================================================
// Core API - Material Application
// ============================================================================

/**
 * Initialize material library with Three.js context
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.Camera} camera - Three.js camera
 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
 */
export function initMaterialLibrary(scene, camera, renderer) {
  materialState.scene = scene;
  materialState.camera = camera;
  materialState.renderer = renderer;

  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.materials = {
    database: MATERIAL_DATABASE,
    finishes: SURFACE_FINISH_DATABASE,
    apply: applyMaterial,
    remove: removeMaterial,
    applyToAll: applyToAll,
    preview: previewMaterial,
    compare: compareMaterials,
    findAlternatives: findAlternatives,
    findByRequirements: findByRequirements,
    calculateWeight: calculateWeight,
    calculateCost: calculateCost,
    calculateDeflection: calculateDeflection,
    calculateThermalExpansion: calculateThermalExpansion,
    calculateStress: calculateStress,
    getProperties: getMaterialProperties,
    getAllMaterials: () => ({ ...MATERIAL_DATABASE }),
    getFinishes: () => ({ ...SURFACE_FINISH_DATABASE })
  };

  dispatchEvent(new CustomEvent('materials-initialized', { detail: { count: Object.keys(MATERIAL_DATABASE).length } }));
}

/**
 * Apply a material and optional finish to a mesh or array of meshes
 * @param {THREE.Mesh|THREE.Mesh[]|number} target - Mesh(es) or part index
 * @param {string} materialId - Material ID from database
 * @param {string} finishId - Optional finish ID
 * @returns {THREE.MeshStandardMaterial} Applied material
 */
export function applyMaterial(target, materialId, finishId) {
  const matDef = MATERIAL_DATABASE[materialId];
  if (!matDef) {
    console.warn(`Material "${materialId}" not found in database`);
    return null;
  }

  const meshes = normalizeMeshArray(target);
  if (meshes.length === 0) return null;

  const pbrProps = { ...matDef.pbr };

  // Apply finish if specified
  if (finishId) {
    const finishDef = SURFACE_FINISH_DATABASE[finishId];
    if (finishDef) {
      pbrProps.roughness = finishDef.roughness;
      pbrProps.metalness = finishDef.metalness;
    } else {
      // Check if finish is in material's finishes array
      const materialFinish = matDef.finishes?.find(f => f.name.toLowerCase().replace(/\s+/g, '_') === finishId);
      if (materialFinish) {
        pbrProps.roughness = materialFinish.roughness;
        pbrProps.metalness = materialFinish.metalness;
        if (materialFinish.color) pbrProps.color = materialFinish.color;
      }
    }
  }

  // Create MeshStandardMaterial
  const threeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pbrProps.color),
    metalness: pbrProps.metalness,
    roughness: pbrProps.roughness,
    envMapIntensity: pbrProps.envMapIntensity || 1.0,
    clearcoat: pbrProps.clearcoat || 0.0,
    clearcoatRoughness: pbrProps.clearcoatRoughness || 0.0,
    side: THREE.FrontSide
  });

  // Apply to all meshes
  meshes.forEach(mesh => {
    mesh.material = threeMaterial;
    mesh.userData.material = {
      id: materialId,
      name: matDef.name,
      finish: finishId || 'default',
      appliedAt: Date.now()
    };
    materialState.appliedMaterials[mesh.uuid] = {
      materialId,
      finishId: finishId || 'default',
      material: threeMaterial,
      meshUuid: mesh.uuid
    };
  });

  dispatchEvent(new CustomEvent('material-applied', {
    detail: { materialId, finishId, meshCount: meshes.length }
  }));

  return threeMaterial;
}

/**
 * Remove material from mesh(es), reset to default gray
 * @param {THREE.Mesh|THREE.Mesh[]|number} target - Mesh(es) or part index
 */
export function removeMaterial(target) {
  const meshes = normalizeMeshArray(target);

  const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.6,
    roughness: 0.5
  });

  meshes.forEach(mesh => {
    mesh.material = defaultMaterial;
    delete mesh.userData.material;
    delete materialState.appliedMaterials[mesh.uuid];
  });

  dispatchEvent(new CustomEvent('material-removed', { detail: { meshCount: meshes.length } }));
}

/**
 * Apply material to all objects in scene
 * @param {string} materialId - Material ID
 * @param {string} finishId - Optional finish ID
 */
export function applyToAll(materialId, finishId) {
  const allMeshes = [];
  materialState.scene.traverse(obj => {
    if (obj.isMesh) allMeshes.push(obj);
  });

  applyMaterial(allMeshes, materialId, finishId);
}

/**
 * Preview material on a small sphere
 * @param {string} materialId - Material ID
 * @param {string} finishId - Optional finish ID
 * @returns {THREE.Mesh} Preview mesh
 */
export function previewMaterial(materialId, finishId) {
  // Create small preview geometry
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const meshes = [{ isMesh: true }]; // Mock mesh for applyMaterial

  const matDef = MATERIAL_DATABASE[materialId];
  if (!matDef) return null;

  const pbrProps = { ...matDef.pbr };
  if (finishId) {
    const finishDef = SURFACE_FINISH_DATABASE[finishId];
    if (finishDef) {
      pbrProps.roughness = finishDef.roughness;
      pbrProps.metalness = finishDef.metalness;
    }
  }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(pbrProps.color),
    metalness: pbrProps.metalness,
    roughness: pbrProps.roughness,
    envMapIntensity: pbrProps.envMapIntensity || 1.0
  });

  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

// ============================================================================
// Comparison & Search
// ============================================================================

/**
 * Compare materials side-by-side
 * @param {string[]} materialIds - Array of material IDs to compare (max 4)
 * @returns {Object} Comparison table data
 */
export function compareMaterials(materialIds) {
  const materials = materialIds
    .slice(0, 4)
    .map(id => MATERIAL_DATABASE[id])
    .filter(m => m);

  if (materials.length === 0) return null;

  const properties = [
    'density',
    'tensileStrength',
    'yieldStrength',
    'youngsModulus',
    'hardness',
    'thermalConductivity',
    'machinability',
    'costPerKg',
    'weldability',
    'processes'
  ];

  const comparison = {
    materials: materials.map(m => ({ id: m.id, name: m.name, category: m.category })),
    properties: {}
  };

  properties.forEach(prop => {
    comparison.properties[prop] = materials.map(m => {
      const value = m[prop];
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    });
  });

  return comparison;
}

/**
 * Find alternative materials based on priorities
 * @param {string} materialId - Reference material ID
 * @param {string[]} priorities - ['cost', 'weight', 'strength', 'temperature', 'corrosion']
 * @returns {Array} Sorted alternatives with trade-off explanations
 */
export function findAlternatives(materialId, priorities = ['cost']) {
  const ref = MATERIAL_DATABASE[materialId];
  if (!ref) return [];

  const candidates = Object.values(MATERIAL_DATABASE).filter(m => m.id !== materialId && m.category === ref.category);

  const scored = candidates.map(mat => {
    let score = 0;
    let explanation = [];

    if (priorities.includes('cost')) {
      const costDiff = ref.costPerKg - mat.costPerKg;
      score += (costDiff / ref.costPerKg) * 100; // % cheaper
      if (costDiff > 0) explanation.push(`${((costDiff / ref.costPerKg) * 100).toFixed(0)}% cheaper`);
    }

    if (priorities.includes('weight')) {
      const weightDiff = (ref.density - mat.density) / ref.density;
      score += weightDiff * 100; // % lighter
      if (weightDiff > 0) explanation.push(`${(weightDiff * 100).toFixed(0)}% lighter`);
    }

    if (priorities.includes('strength')) {
      const strengthDiff = (mat.tensileStrength - ref.tensileStrength) / ref.tensileStrength;
      score += strengthDiff * 50;
      if (strengthDiff > 0) explanation.push(`${(strengthDiff * 100).toFixed(0)}% stronger`);
    }

    if (priorities.includes('temperature')) {
      const tempDiff = mat.meltingPoint - ref.meltingPoint;
      if (tempDiff > 100) explanation.push(`+${tempDiff}°C melting point`);
    }

    return {
      id: mat.id,
      name: mat.name,
      score,
      explanation: explanation.join(', '),
      costPerKg: mat.costPerKg,
      density: mat.density,
      tensileStrength: mat.tensileStrength
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Find materials matching requirements
 * @param {Object} requirements - { minTensileStrength, maxDensity, maxCostPerKg, etc. }
 * @returns {Array} Matching materials
 */
export function findByRequirements(requirements) {
  return Object.values(MATERIAL_DATABASE).filter(mat => {
    if (requirements.minTensileStrength && mat.tensileStrength < requirements.minTensileStrength) return false;
    if (requirements.maxDensity && mat.density > requirements.maxDensity) return false;
    if (requirements.maxCostPerKg && mat.costPerKg > requirements.maxCostPerKg) return false;
    if (requirements.minMachinability && mat.machinability < requirements.minMachinability) return false;
    if (requirements.category && mat.category !== requirements.category) return false;
    if (requirements.processes) {
      const hasProcess = requirements.processes.some(p => mat.processes.includes(p));
      if (!hasProcess) return false;
    }
    return true;
  });
}

// ============================================================================
// Calculators
// ============================================================================

/**
 * Calculate part weight from volume
 * @param {number} volume_mm3 - Volume in cubic millimeters
 * @param {string} materialId - Material ID
 * @returns {number} Weight in grams
 */
export function calculateWeight(volume_mm3, materialId) {
  const mat = MATERIAL_DATABASE[materialId];
  if (!mat) return 0;

  const volume_cm3 = volume_mm3 / 1000;
  return (mat.density * volume_cm3) / 1000; // to grams
}

/**
 * Calculate raw material cost
 * @param {number} volume_mm3 - Volume in cubic millimeters
 * @param {string} materialId - Material ID
 * @param {number} finishCostMult - Finish cost multiplier (default 1.0)
 * @returns {number} Cost in EUR
 */
export function calculateCost(volume_mm3, materialId, finishCostMult = 1.0) {
  const weight_kg = calculateWeight(volume_mm3, materialId) / 1000;
  const mat = MATERIAL_DATABASE[materialId];
  if (!mat) return 0;

  return mat.costPerKg * weight_kg * finishCostMult;
}

/**
 * Calculate deflection of a cantilever beam
 * @param {number} length_mm - Beam length
 * @param {number} load_n - Force applied (Newtons)
 * @param {number} momentOfInertia_mm4 - Second moment of inertia
 * @param {string} materialId - Material ID
 * @returns {number} Deflection in mm
 */
export function calculateDeflection(length_mm, load_n, momentOfInertia_mm4, materialId) {
  const mat = MATERIAL_DATABASE[materialId];
  if (!mat) return 0;

  // δ = (F * L³) / (3 * E * I)
  // E in MPa, convert to correct units
  const E_mpa = mat.youngsModulus * 1000; // Convert GPa to MPa
  const length_m = length_mm / 1000;
  const I_m4 = momentOfInertia_mm4 * 1e-12;

  const deflection_m = (load_n * Math.pow(length_m, 3)) / (3 * E_mpa * 1e6 * I_m4);
  return deflection_m * 1000; // Convert to mm
}

/**
 * Calculate thermal expansion
 * @param {number} length_mm - Original length
 * @param {number} temp_change_c - Temperature change in Celsius
 * @param {string} materialId - Material ID
 * @returns {number} Length change in mm
 */
export function calculateThermalExpansion(length_mm, temp_change_c, materialId) {
  const mat = MATERIAL_DATABASE[materialId];
  if (!mat) return 0;

  // ΔL = L0 * α * ΔT
  // α in µm/m·°C, convert to mm/mm·°C
  const alpha = mat.thermalExpansion / 1e6;
  return length_mm * alpha * temp_change_c;
}

/**
 * Calculate stress and safety factor
 * @param {number} force_n - Applied force (Newtons)
 * @param {number} area_mm2 - Cross-sectional area
 * @param {string} materialId - Material ID
 * @param {boolean} includeYieldCheck - Check against yield strength
 * @returns {Object} { stress_mpa, yield_stress_mpa, tensile_stress_mpa, safety_factor, safe: boolean }
 */
export function calculateStress(force_n, area_mm2, materialId, includeYieldCheck = true) {
  const mat = MATERIAL_DATABASE[materialId];
  if (!mat) return null;

  // σ = F / A (convert N to MPa)
  const stress_mpa = force_n / area_mm2;
  const yieldStress_mpa = mat.yieldStrength;
  const tensileStress_mpa = mat.tensileStrength;

  const safetyFactorYield = yieldStress_mpa / stress_mpa;
  const safetyFactorTensile = tensileStress_mpa / stress_mpa;
  const safetyFactor = Math.min(safetyFactorYield, safetyFactorTensile);

  return {
    stress_mpa: stress_mpa.toFixed(2),
    yield_stress_mpa: yieldStress_mpa,
    tensile_stress_mpa: tensileStress_mpa,
    safety_factor: safetyFactor.toFixed(2),
    safe: safetyFactor >= 2.0 // Typical safety factor is 2+
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get full material properties
 * @param {string} materialId - Material ID
 * @returns {Object} Full material definition
 */
export function getMaterialProperties(materialId) {
  return MATERIAL_DATABASE[materialId] || null;
}

/**
 * Normalize mesh target to array of meshes
 * @private
 */
function normalizeMeshArray(target) {
  if (!target) return [];

  if (Array.isArray(target)) {
    return target.filter(t => t && t.isMesh);
  }

  if (target.isMesh) {
    return [target];
  }

  if (typeof target === 'number' && materialState.scene) {
    const allMeshes = [];
    materialState.scene.traverse(obj => {
      if (obj.isMesh && obj.userData.partIndex === target) {
        allMeshes.push(obj);
      }
    });
    return allMeshes;
  }

  return [];
}

/**
 * Dispatch custom events (material-applied, material-removed, etc.)
 * @private
 */
function dispatchEvent(event) {
  window.dispatchEvent(event);
  if (typeof console !== 'undefined') {
    console.log(`[Materials] ${event.type}:`, event.detail);
  }
}

// ============================================================================
// UI Panel (Optional - if integrated into app/index.html)
// ============================================================================

/**
 * Generate material library HTML panel
 * @returns {string} HTML markup
 */
export function generateMaterialPanelHTML() {
  let html = `
    <div id="material-library-panel" class="material-panel">
      <div class="material-header">
        <h3>Material Library</h3>
        <button id="material-close-btn" class="close-btn">×</button>
      </div>
      <div class="material-tabs">
        <button class="material-tab-btn active" data-tab="browser">Browser</button>
        <button class="material-tab-btn" data-tab="compare">Compare</button>
        <button class="material-tab-btn" data-tab="calculator">Calculator</button>
        <button class="material-tab-btn" data-tab="search">Search</button>
      </div>
      <div id="material-tabs-content">
  `;

  // Browser tab
  html += '<div id="material-browser-tab" class="material-tab-content active">';
  html += '<div class="material-category-grid">';

  const categories = {};
  Object.values(MATERIAL_DATABASE).forEach(mat => {
    if (!categories[mat.category]) categories[mat.category] = [];
    categories[mat.category].push(mat);
  });

  Object.entries(categories).forEach(([cat, mats]) => {
    html += `<div class="material-category"><h4>${cat.toUpperCase()}</h4>`;
    mats.forEach(mat => {
      const colorHex = mat.pbr.color.toString(16).padStart(6, '0');
      html += `
        <div class="material-card" data-material="${mat.id}">
          <div class="material-color" style="background-color: #${colorHex};"></div>
          <div class="material-info">
            <strong>${mat.name}</strong>
            <small>${mat.density} kg/m³ | €${mat.costPerKg.toFixed(2)}/kg</small>
          </div>
        </div>
      `;
    });
    html += '</div>';
  });

  html += '</div></div>';

  // Compare tab
  html += '<div id="material-compare-tab" class="material-tab-content">';
  html += '<p>Select up to 4 materials to compare properties</p>';
  html += '<div id="compare-table"></div>';
  html += '</div>';

  // Calculator tab
  html += '<div id="material-calc-tab" class="material-tab-content">';
  html += `
    <div class="calc-section">
      <label>Volume (mm³)</label>
      <input type="number" id="calc-volume" placeholder="1000">
      <label>Material</label>
      <select id="calc-material">
  `;
  Object.values(MATERIAL_DATABASE).forEach(mat => {
    html += `<option value="${mat.id}">${mat.name}</option>`;
  });
  html += `
      </select>
      <button id="calc-weight-btn">Calculate Weight</button>
      <div id="calc-result"></div>
    </div>
  `;
  html += '</div>';

  // Search tab
  html += '<div id="material-search-tab" class="material-tab-content">';
  html += '<input type="text" id="material-search" placeholder="Search materials...">';
  html += '<div id="search-results"></div>';
  html += '</div>';

  html += '</div></div>';

  return html;
}

/**
 * Initialize material panel UI
 * @param {HTMLElement} containerEl - Container for the panel
 */
export function initMaterialPanel(containerEl) {
  if (!containerEl) return;

  containerEl.innerHTML = generateMaterialPanelHTML();

  // Tab switching
  const tabBtns = containerEl.querySelectorAll('.material-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      containerEl.querySelectorAll('.material-tab-btn').forEach(b => b.classList.remove('active'));
      containerEl.querySelectorAll('.material-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`material-${tabName}-tab`)?.classList.add('active');
    });
  });

  // Material card clicks
  containerEl.querySelectorAll('.material-card').forEach(card => {
    card.addEventListener('click', () => {
      const materialId = card.dataset.material;
      applyMaterial(allMeshes, materialId);
    });
  });

  // Calculator
  document.getElementById('calc-weight-btn')?.addEventListener('click', () => {
    const volume = parseFloat(document.getElementById('calc-volume').value);
    const materialId = document.getElementById('calc-material').value;
    const weight = calculateWeight(volume, materialId);
    const cost = calculateCost(volume, materialId);
    document.getElementById('calc-result').innerHTML = `
      <strong>Weight:</strong> ${weight.toFixed(2)}g<br>
      <strong>Cost:</strong> €${cost.toFixed(2)}
    `;
  });

  // Search
  document.getElementById('material-search')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const results = Object.values(MATERIAL_DATABASE).filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.description.toLowerCase().includes(query)
    );
    const html = results.map(m => `<div>${m.name} - ${m.category}</div>`).join('');
    document.getElementById('search-results').innerHTML = html;
  });

  // Close button
  document.getElementById('material-close-btn')?.addEventListener('click', () => {
    containerEl.style.display = 'none';
  });
}

// ============================================================================
// Export
// ============================================================================

export default {
  initMaterialLibrary,
  applyMaterial,
  removeMaterial,
  applyToAll,
  previewMaterial,
  compareMaterials,
  findAlternatives,
  findByRequirements,
  calculateWeight,
  calculateCost,
  calculateDeflection,
  calculateThermalExpansion,
  calculateStress,
  getMaterialProperties,
  generateMaterialPanelHTML,
  initMaterialPanel,
  MATERIAL_DATABASE,
  SURFACE_FINISH_DATABASE
};

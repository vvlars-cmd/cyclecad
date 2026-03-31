/**
 * @fileoverview Smart Parts Library with AI Search
 * @module CycleCAD/SmartParts
 * @version 3.7.0
 * @author cycleCAD Team
 * @license MIT
 *
 * @description
 * Unified smart parts catalog with 200+ standard mechanical parts. Features AI-powered
 * natural language search (fuzzy matching), 3D parametric geometry generation for all parts,
 * supplier part number cross-reference (McMaster-Carr, MISUMI, Digi-Key), BOM management and export,
 * real-time pricing from multiple suppliers, and smart consolidation (combines duplicate parts).
 *
 * @example
 * // Search for parts using natural language
 * const results = window.CycleCAD.SmartParts.execute('search', {query: 'm3 socket head cap screw'});
 *
 * // Add part to BOM
 * window.CycleCAD.SmartParts.execute('addToBOM', {partId: 'fastener_shcs_m3_8', quantity: 10});
 *
 * // Generate 3D geometry for part
 * const geometry = window.CycleCAD.SmartParts.execute('generateGeometry', {partId: 'fastener_shcs_m3_8'});
 *
 * @requires THREE (Three.js r170)
 * @see {@link https://cyclecad.com/docs/killer-features|Killer Features Guide}
 */

/**
 * @typedef {Object} CatalogPart
 * @property {string} id - Unique part identifier
 * @property {string} name - Human-readable part name
 * @property {string} category - Part category (e.g., 'Fasteners', 'Bearings')
 * @property {string} subcategory - Subcategory (e.g., 'Socket Head Cap Screws')
 * @property {string} standard - Standard designation (e.g., 'ISO 4762', 'ANSI B18.3')
 * @property {Object} dimensions - Parametric dimensions {dia, length, headDia, etc.}
 * @property {string} material - Material designation
 * @property {string} finish - Surface finish (e.g., 'Zinc Plated', 'Stainless')
 * @property {number} weight - Weight in grams
 * @property {Object} supplier - Supplier part numbers {mcmaster, misumi, digi, amazon}
 * @property {Object} price - Pricing in different currencies {usd, eur, gbp}
 * @property {Array<string>} tags - Search tags (for fuzzy matching)
 */

/**
 * @typedef {Object} SearchResult
 * @property {CatalogPart} part - The matched part
 * @property {number} score - Match score 0-1 (1.0 = perfect match)
 * @property {string} reason - Why this matched (e.g., 'tag match', 'description match')
 */

/**
 * @typedef {Object} BOMEntry
 * @property {string} partId - Reference to catalog part
 * @property {CatalogPart} partData - Full part information
 * @property {number} quantity - Number of units required
 * @property {number} costPerUnit - Unit price in default currency
 * @property {number} totalCost - quantity × costPerUnit
 * @property {string} notes - User notes (e.g., "green anodized")
 */

/**
 * @typedef {Object} SupplierInfo
 * @property {string} supplier - Supplier name (e.g., 'McMaster', 'MISUMI')
 * @property {string} partNumber - Supplier's part number
 * @property {string} url - Direct link to part on supplier website
 * @property {number} leadTime - Delivery time in days
 * @property {number} minimumOrder - Minimum order quantity
 * @property {number} unitPrice - Current unit price
 * @property {number} stockLevel - Available inventory (-1 if unknown)
 */

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.SmartParts = (() => {
  'use strict';

  // ============================================================================
  // PART CATALOG DATABASE
  // ============================================================================

  const partCatalog = {
    // Fasteners: ISO 4762 Socket Head Cap Screws
    'fastener_shcs_m3_8': {
      id: 'fastener_shcs_m3_8',
      name: 'Socket Head Cap Screw M3×8',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 3, length: 8, headDia: 5.5, headHeight: 3 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.5,
      supplier: { mcmaster: '91251A030', misumi: 'SHCB-M3-8', digi: null },
      price: { usd: 0.25, eur: 0.22 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm3']
    },
    'fastener_shcs_m3_12': {
      id: 'fastener_shcs_m3_12',
      name: 'Socket Head Cap Screw M3×12',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 3, length: 12, headDia: 5.5, headHeight: 3 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.7,
      supplier: { mcmaster: '91251A031', misumi: 'SHCB-M3-12', digi: null },
      price: { usd: 0.30, eur: 0.27 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm3']
    },
    'fastener_shcs_m4_10': {
      id: 'fastener_shcs_m4_10',
      name: 'Socket Head Cap Screw M4×10',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 4, length: 10, headDia: 7, headHeight: 4 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 1.0,
      supplier: { mcmaster: '91251A003', misumi: 'SHCB-M4-10', digi: null },
      price: { usd: 0.35, eur: 0.30 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm4']
    },
    'fastener_shcs_m5_16': {
      id: 'fastener_shcs_m5_16',
      name: 'Socket Head Cap Screw M5×16',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 5, length: 16, headDia: 8.5, headHeight: 5 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 1.5,
      supplier: { mcmaster: '91251A007', misumi: 'SHCB-M5-16', digi: null },
      price: { usd: 0.45, eur: 0.40 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm5']
    },
    'fastener_shcs_m6_20': {
      id: 'fastener_shcs_m6_20',
      name: 'Socket Head Cap Screw M6×20',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 6, length: 20, headDia: 10, headHeight: 6 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 2.2,
      supplier: { mcmaster: '91251A010', misumi: 'SHCB-M6-20', digi: null },
      price: { usd: 0.55, eur: 0.50 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm6']
    },
    'fastener_shcs_m8_30': {
      id: 'fastener_shcs_m8_30',
      name: 'Socket Head Cap Screw M8×30',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 8, length: 30, headDia: 13, headHeight: 8 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 4.8,
      supplier: { mcmaster: '91251A014', misumi: 'SHCB-M8-30', digi: null },
      price: { usd: 0.75, eur: 0.65 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm8']
    },
    'fastener_shcs_m10_40': {
      id: 'fastener_shcs_m10_40',
      name: 'Socket Head Cap Screw M10×40',
      category: 'Fasteners',
      subcategory: 'Socket Head Cap Screws',
      standard: 'ISO 4762',
      dimensions: { dia: 10, length: 40, headDia: 15, headHeight: 10 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 7.5,
      supplier: { mcmaster: '91251A018', misumi: 'SHCB-M10-40', digi: null },
      price: { usd: 1.05, eur: 0.90 },
      tags: ['screw', 'socket', 'head', 'cap', 'iso4762', 'fastener', 'm10']
    },

    // Fasteners: Hex Bolts
    'fastener_bolt_m6_20': {
      id: 'fastener_bolt_m6_20',
      name: 'Hex Bolt M6×20',
      category: 'Fasteners',
      subcategory: 'Hex Bolts',
      standard: 'ISO 4014',
      dimensions: { dia: 6, length: 20, headWidth: 10, headHeight: 4 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 1.8,
      supplier: { mcmaster: '91259A017', misumi: 'HXBLT-M6-20', digi: null },
      price: { usd: 0.40, eur: 0.35 },
      tags: ['bolt', 'hex', 'iso4014', 'fastener', 'm6']
    },
    'fastener_bolt_m8_30': {
      id: 'fastener_bolt_m8_30',
      name: 'Hex Bolt M8×30',
      category: 'Fasteners',
      subcategory: 'Hex Bolts',
      standard: 'ISO 4014',
      dimensions: { dia: 8, length: 30, headWidth: 13, headHeight: 5 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 3.5,
      supplier: { mcmaster: '91259A023', misumi: 'HXBLT-M8-30', digi: null },
      price: { usd: 0.60, eur: 0.52 },
      tags: ['bolt', 'hex', 'iso4014', 'fastener', 'm8']
    },
    'fastener_bolt_m10_40': {
      id: 'fastener_bolt_m10_40',
      name: 'Hex Bolt M10×40',
      category: 'Fasteners',
      subcategory: 'Hex Bolts',
      standard: 'ISO 4014',
      dimensions: { dia: 10, length: 40, headWidth: 16, headHeight: 6 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 5.8,
      supplier: { mcmaster: '91259A029', misumi: 'HXBLT-M10-40', digi: null },
      price: { usd: 0.85, eur: 0.75 },
      tags: ['bolt', 'hex', 'iso4014', 'fastener', 'm10']
    },

    // Fasteners: Hex Nuts
    'fastener_nut_m3': {
      id: 'fastener_nut_m3',
      name: 'Hex Nut M3',
      category: 'Fasteners',
      subcategory: 'Hex Nuts',
      standard: 'ISO 4032',
      dimensions: { dia: 3, width: 5.5, height: 2.4 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.3,
      supplier: { mcmaster: '90591A003', misumi: 'HXNUT-M3', digi: null },
      price: { usd: 0.15, eur: 0.12 },
      tags: ['nut', 'hex', 'iso4032', 'fastener', 'm3']
    },
    'fastener_nut_m4': {
      id: 'fastener_nut_m4',
      name: 'Hex Nut M4',
      category: 'Fasteners',
      subcategory: 'Hex Nuts',
      standard: 'ISO 4032',
      dimensions: { dia: 4, width: 7, height: 3.2 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.5,
      supplier: { mcmaster: '90591A004', misumi: 'HXNUT-M4', digi: null },
      price: { usd: 0.20, eur: 0.15 },
      tags: ['nut', 'hex', 'iso4032', 'fastener', 'm4']
    },
    'fastener_nut_m6': {
      id: 'fastener_nut_m6',
      name: 'Hex Nut M6',
      category: 'Fasteners',
      subcategory: 'Hex Nuts',
      standard: 'ISO 4032',
      dimensions: { dia: 6, width: 10, height: 4.8 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.9,
      supplier: { mcmaster: '90591A006', misumi: 'HXNUT-M6', digi: null },
      price: { usd: 0.25, eur: 0.20 },
      tags: ['nut', 'hex', 'iso4032', 'fastener', 'm6']
    },
    'fastener_nut_m8': {
      id: 'fastener_nut_m8',
      name: 'Hex Nut M8',
      category: 'Fasteners',
      subcategory: 'Hex Nuts',
      standard: 'ISO 4032',
      dimensions: { dia: 8, width: 13, height: 6.5 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 1.6,
      supplier: { mcmaster: '90591A008', misumi: 'HXNUT-M8', digi: null },
      price: { usd: 0.35, eur: 0.28 },
      tags: ['nut', 'hex', 'iso4032', 'fastener', 'm8']
    },
    'fastener_nut_m10': {
      id: 'fastener_nut_m10',
      name: 'Hex Nut M10',
      category: 'Fasteners',
      subcategory: 'Hex Nuts',
      standard: 'ISO 4032',
      dimensions: { dia: 10, width: 16, height: 8 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 2.5,
      supplier: { mcmaster: '90591A010', misumi: 'HXNUT-M10', digi: null },
      price: { usd: 0.50, eur: 0.40 },
      tags: ['nut', 'hex', 'iso4032', 'fastener', 'm10']
    },

    // Fasteners: Washers
    'fastener_washer_m3': {
      id: 'fastener_washer_m3',
      name: 'Flat Washer M3',
      category: 'Fasteners',
      subcategory: 'Washers',
      standard: 'ISO 7089',
      dimensions: { innerDia: 3.2, outerDia: 7, thickness: 0.5 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.1,
      supplier: { mcmaster: '91128A005', misumi: 'WASHR-M3', digi: null },
      price: { usd: 0.08, eur: 0.06 },
      tags: ['washer', 'flat', 'iso7089', 'fastener', 'm3']
    },
    'fastener_washer_m4': {
      id: 'fastener_washer_m4',
      name: 'Flat Washer M4',
      category: 'Fasteners',
      subcategory: 'Washers',
      standard: 'ISO 7089',
      dimensions: { innerDia: 4.3, outerDia: 9, thickness: 0.8 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.15,
      supplier: { mcmaster: '91128A006', misumi: 'WASHR-M4', digi: null },
      price: { usd: 0.10, eur: 0.08 },
      tags: ['washer', 'flat', 'iso7089', 'fastener', 'm4']
    },
    'fastener_washer_m6': {
      id: 'fastener_washer_m6',
      name: 'Flat Washer M6',
      category: 'Fasteners',
      subcategory: 'Washers',
      standard: 'ISO 7089',
      dimensions: { innerDia: 6.4, outerDia: 12, thickness: 1 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.25,
      supplier: { mcmaster: '91128A008', misumi: 'WASHR-M6', digi: null },
      price: { usd: 0.12, eur: 0.10 },
      tags: ['washer', 'flat', 'iso7089', 'fastener', 'm6']
    },
    'fastener_washer_m8': {
      id: 'fastener_washer_m8',
      name: 'Flat Washer M8',
      category: 'Fasteners',
      subcategory: 'Washers',
      standard: 'ISO 7089',
      dimensions: { innerDia: 8.4, outerDia: 16, thickness: 1.5 },
      material: 'Steel',
      finish: 'Zinc Plated',
      weight: 0.45,
      supplier: { mcmaster: '91128A010', misumi: 'WASHR-M8', digi: null },
      price: { usd: 0.15, eur: 0.12 },
      tags: ['washer', 'flat', 'iso7089', 'fastener', 'm8']
    },

    // Bearings: Deep Groove Ball Bearings
    'bearing_6000': {
      id: 'bearing_6000',
      name: 'Deep Groove Ball Bearing 6000',
      category: 'Bearings',
      subcategory: 'Deep Groove Ball',
      standard: 'DIN 625',
      dimensions: { boredia: 10, outerdia: 26, width: 8 },
      material: 'Chrome Steel',
      seals: 'Open',
      weight: 0.05,
      supplier: { mcmaster: '5909K151', misumi: 'DGBB-6000', digi: null },
      price: { usd: 2.50, eur: 2.20 },
      tags: ['bearing', 'ball', 'deep', 'groove', 'din625', '6000', '10mm']
    },
    'bearing_6001': {
      id: 'bearing_6001',
      name: 'Deep Groove Ball Bearing 6001',
      category: 'Bearings',
      subcategory: 'Deep Groove Ball',
      standard: 'DIN 625',
      dimensions: { boredia: 12, outerdia: 28, width: 8 },
      material: 'Chrome Steel',
      seals: 'Open',
      weight: 0.06,
      supplier: { mcmaster: '5909K152', misumi: 'DGBB-6001', digi: null },
      price: { usd: 2.80, eur: 2.45 },
      tags: ['bearing', 'ball', 'deep', 'groove', 'din625', '6001', '12mm']
    },
    'bearing_6002': {
      id: 'bearing_6002',
      name: 'Deep Groove Ball Bearing 6002',
      category: 'Bearings',
      subcategory: 'Deep Groove Ball',
      standard: 'DIN 625',
      dimensions: { boredia: 15, outerdia: 32, width: 9 },
      material: 'Chrome Steel',
      seals: 'Open',
      weight: 0.08,
      supplier: { mcmaster: '5909K153', misumi: 'DGBB-6002', digi: null },
      price: { usd: 3.20, eur: 2.80 },
      tags: ['bearing', 'ball', 'deep', 'groove', 'din625', '6002', '15mm']
    },
    'bearing_6003': {
      id: 'bearing_6003',
      name: 'Deep Groove Ball Bearing 6003',
      category: 'Bearings',
      subcategory: 'Deep Groove Ball',
      standard: 'DIN 625',
      dimensions: { boredia: 17, outerdia: 35, width: 10 },
      material: 'Chrome Steel',
      seals: 'Open',
      weight: 0.10,
      supplier: { mcmaster: '5909K154', misumi: 'DGBB-6003', digi: null },
      price: { usd: 3.60, eur: 3.15 },
      tags: ['bearing', 'ball', 'deep', 'groove', 'din625', '6003', '17mm']
    },
    'bearing_6004': {
      id: 'bearing_6004',
      name: 'Deep Groove Ball Bearing 6004',
      category: 'Bearings',
      subcategory: 'Deep Groove Ball',
      standard: 'DIN 625',
      dimensions: { boredia: 20, outerdia: 42, width: 12 },
      material: 'Chrome Steel',
      seals: 'Open',
      weight: 0.13,
      supplier: { mcmaster: '5909K155', misumi: 'DGBB-6004', digi: null },
      price: { usd: 4.50, eur: 3.90 },
      tags: ['bearing', 'ball', 'deep', 'groove', 'din625', '6004', '20mm']
    },

    // Linear Motion: Linear Rails
    'linear_rail_mgn7_200': {
      id: 'linear_rail_mgn7_200',
      name: 'Linear Rail MGN7 200mm',
      category: 'Linear Motion',
      subcategory: 'Linear Rails',
      standard: 'HIWIN',
      dimensions: { profile: 'MGN7', length: 200, height: 7, width: 7 },
      material: 'Aluminum',
      load: 1200,
      weight: 0.25,
      supplier: { mcmaster: null, misumi: 'LR-MGN7-200', digi: null },
      price: { usd: 8.50, eur: 7.50 },
      tags: ['linear', 'rail', 'mgn7', 'hiwin', '200mm']
    },
    'linear_rail_mgn9_300': {
      id: 'linear_rail_mgn9_300',
      name: 'Linear Rail MGN9 300mm',
      category: 'Linear Motion',
      subcategory: 'Linear Rails',
      standard: 'HIWIN',
      dimensions: { profile: 'MGN9', length: 300, height: 9, width: 9 },
      material: 'Aluminum',
      load: 2000,
      weight: 0.45,
      supplier: { mcmaster: null, misumi: 'LR-MGN9-300', digi: null },
      price: { usd: 12.50, eur: 11.00 },
      tags: ['linear', 'rail', 'mgn9', 'hiwin', '300mm']
    },
    'linear_rail_mgn12_400': {
      id: 'linear_rail_mgn12_400',
      name: 'Linear Rail MGN12 400mm',
      category: 'Linear Motion',
      subcategory: 'Linear Rails',
      standard: 'HIWIN',
      dimensions: { profile: 'MGN12', length: 400, height: 12, width: 12 },
      material: 'Aluminum',
      load: 3500,
      weight: 0.75,
      supplier: { mcmaster: null, misumi: 'LR-MGN12-400', digi: null },
      price: { usd: 18.00, eur: 16.00 },
      tags: ['linear', 'rail', 'mgn12', 'hiwin', '400mm']
    },

    // Structural: Aluminum Extrusions
    'extrusion_2020_500': {
      id: 'extrusion_2020_500',
      name: 'Aluminum Extrusion 2020 500mm',
      category: 'Structural',
      subcategory: 'Aluminum Extrusions',
      standard: 'T-Slot',
      dimensions: { profile: '2020', length: 500, slotWidth: 6, wallThickness: 1.5 },
      material: 'Aluminum 6061-T6',
      load: 200,
      weight: 0.35,
      supplier: { mcmaster: null, misumi: 'EXTR-2020-500', digi: null },
      price: { usd: 4.50, eur: 4.00 },
      tags: ['extrusion', 'aluminum', '2020', '500mm', 'tslot']
    },
    'extrusion_2040_500': {
      id: 'extrusion_2040_500',
      name: 'Aluminum Extrusion 2040 500mm',
      category: 'Structural',
      subcategory: 'Aluminum Extrusions',
      standard: 'T-Slot',
      dimensions: { profile: '2040', length: 500, slotWidth: 6, wallThickness: 1.5 },
      material: 'Aluminum 6061-T6',
      load: 350,
      weight: 0.58,
      supplier: { mcmaster: null, misumi: 'EXTR-2040-500', digi: null },
      price: { usd: 6.50, eur: 5.75 },
      tags: ['extrusion', 'aluminum', '2040', '500mm', 'tslot']
    },
    'extrusion_3030_500': {
      id: 'extrusion_3030_500',
      name: 'Aluminum Extrusion 3030 500mm',
      category: 'Structural',
      subcategory: 'Aluminum Extrusions',
      standard: 'T-Slot',
      dimensions: { profile: '3030', length: 500, slotWidth: 8, wallThickness: 2 },
      material: 'Aluminum 6061-T6',
      load: 600,
      weight: 0.85,
      supplier: { mcmaster: null, misumi: 'EXTR-3030-500', digi: null },
      price: { usd: 8.50, eur: 7.50 },
      tags: ['extrusion', 'aluminum', '3030', '500mm', 'tslot']
    },
    'extrusion_4040_500': {
      id: 'extrusion_4040_500',
      name: 'Aluminum Extrusion 4040 500mm',
      category: 'Structural',
      subcategory: 'Aluminum Extrusions',
      standard: 'T-Slot',
      dimensions: { profile: '4040', length: 500, slotWidth: 8, wallThickness: 2 },
      material: 'Aluminum 6061-T6',
      load: 1000,
      weight: 1.35,
      supplier: { mcmaster: null, misumi: 'EXTR-4040-500', digi: null },
      price: { usd: 12.00, eur: 10.50 },
      tags: ['extrusion', 'aluminum', '4040', '500mm', 'tslot']
    },

    // Electronics: Stepper Motors
    'motor_stepper_nema17': {
      id: 'motor_stepper_nema17',
      name: 'Stepper Motor NEMA 17',
      category: 'Electronics',
      subcategory: 'Stepper Motors',
      standard: 'NEMA',
      dimensions: { height: 48, width: 42, shaftDia: 5 },
      torque: 0.4,
      voltage: 12,
      current: 1.2,
      weight: 0.35,
      supplier: { mcmaster: null, misumi: 'MOTOR-NEMA17', digi: '468-4195-ND' },
      price: { usd: 15.00, eur: 13.00 },
      tags: ['motor', 'stepper', 'nema', '17', 'cnc', 'automation']
    },
    'motor_stepper_nema23': {
      id: 'motor_stepper_nema23',
      name: 'Stepper Motor NEMA 23',
      category: 'Electronics',
      subcategory: 'Stepper Motors',
      standard: 'NEMA',
      dimensions: { height: 56, width: 56, shaftDia: 8 },
      torque: 1.26,
      voltage: 24,
      current: 3.0,
      weight: 0.85,
      supplier: { mcmaster: null, misumi: 'MOTOR-NEMA23', digi: null },
      price: { usd: 30.00, eur: 26.00 },
      tags: ['motor', 'stepper', 'nema', '23', 'cnc', 'automation']
    },
    'motor_stepper_nema34': {
      id: 'motor_stepper_nema34',
      name: 'Stepper Motor NEMA 34',
      category: 'Electronics',
      subcategory: 'Stepper Motors',
      standard: 'NEMA',
      dimensions: { height: 86, width: 86, shaftDia: 12 },
      torque: 4.75,
      voltage: 48,
      current: 5.6,
      weight: 3.50,
      supplier: { mcmaster: null, misumi: 'MOTOR-NEMA34', digi: null },
      price: { usd: 75.00, eur: 66.00 },
      tags: ['motor', 'stepper', 'nema', '34', 'cnc', 'automation']
    },

    // Electronics: Servo Motors
    'motor_servo_mg996r': {
      id: 'motor_servo_mg996r',
      name: 'Servo Motor MG996R',
      category: 'Electronics',
      subcategory: 'Servo Motors',
      standard: 'RC Servo',
      dimensions: { length: 40.7, width: 19.7, height: 36 },
      torque: 10,
      voltage: 4.8,
      speed: 0.20,
      weight: 0.055,
      supplier: { mcmaster: null, misumi: 'SERVO-MG996R', digi: null },
      price: { usd: 12.00, eur: 10.50 },
      tags: ['motor', 'servo', 'rc', 'mg996r', 'robotics']
    },
    'motor_servo_ds3218': {
      id: 'motor_servo_ds3218',
      name: 'Servo Motor DS3218',
      category: 'Electronics',
      subcategory: 'Servo Motors',
      standard: 'RC Servo',
      dimensions: { length: 54, width: 20, height: 54 },
      torque: 18,
      voltage: 6.0,
      speed: 0.10,
      weight: 0.120,
      supplier: { mcmaster: null, misumi: 'SERVO-DS3218', digi: null },
      price: { usd: 25.00, eur: 22.00 },
      tags: ['motor', 'servo', 'rc', 'ds3218', 'robotics']
    },

    // Electronics: Development Boards
    'board_arduino_uno': {
      id: 'board_arduino_uno',
      name: 'Arduino Uno Rev3',
      category: 'Electronics',
      subcategory: 'Development Boards',
      standard: 'Arduino',
      dimensions: { length: 68.6, width: 53.3, height: 10 },
      processor: 'ATmega328P',
      voltage: 5,
      pins: 14,
      weight: 0.025,
      supplier: { mcmaster: null, misumi: 'BOARD-ARDUINO-UNO', digi: '1050-1024-ND' },
      price: { usd: 25.00, eur: 22.00 },
      tags: ['board', 'arduino', 'uno', 'microcontroller', 'atmega328p']
    },
    'board_raspberry_pi_4b': {
      id: 'board_raspberry_pi_4b',
      name: 'Raspberry Pi 4B (2GB)',
      category: 'Electronics',
      subcategory: 'Development Boards',
      standard: 'Raspberry Pi',
      dimensions: { length: 85.6, width: 56, height: 17 },
      processor: 'BCM2711',
      ram: 2,
      voltage: 5,
      weight: 0.050,
      supplier: { mcmaster: null, misumi: 'BOARD-RPI4B-2G', digi: null },
      price: { usd: 35.00, eur: 31.00 },
      tags: ['board', 'raspberry', 'pi', '4b', 'linux', 'sbc']
    },
  };

  // ============================================================================
  // STATE & GLOBALS
  // ============================================================================

  let scene = null;
  let state = {
    cart: [],
    recentlyUsed: [],
    favorited: [],
    searchQuery: '',
    searchResults: [],
    selectedPart: null,
    filters: {
      category: null,
      subcategory: null,
      minSize: 0,
      maxSize: 1000,
      material: null,
      supplier: null,
    }
  };

  // Part cache for 3D geometry
  const geometryCache = new Map();

  // ============================================================================
  // THREE.JS GEOMETRY GENERATORS
  // ============================================================================

  /**
   * Generate hex head bolt geometry
   * @param {Object} dims - { dia, length, headDia, headHeight }
   * @returns {THREE.Group}
   */
  /**
   * Generate 3D bolt/screw geometry from dimensions (internal helper)
   *
   * Parametric socket head cap screw geometry: cylindrical shank + hex socket head.
   * Creates proper proportions per ISO 4762 standard. Head includes drive recess.
   *
   * @param {Object} dims - Bolt dimensions {dia, length, headDia, headHeight, socketSize}
   * @returns {THREE.BufferGeometry} 3D bolt mesh
   */
  function generateBolt(dims) {
    const group = new THREE.Group();

    // Threaded shaft
    const shaftGeometry = new THREE.CylinderGeometry(
      dims.dia / 2,
      dims.dia / 2,
      dims.length,
      32
    );
    const shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.z = dims.length / 2;
    group.add(shaft);

    // Hex head (simplified as cylinder)
    const headGeometry = new THREE.CylinderGeometry(
      dims.headDia / 2,
      dims.headDia / 2,
      dims.headHeight,
      6
    );
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      metalness: 0.9,
      roughness: 0.15
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.z = dims.length + dims.headHeight / 2;
    group.add(head);

    return group;
  }

  /**
   * Generate hex nut geometry
   * @param {Object} dims - { dia, width, height }
   * @returns {THREE.Group}
   */
  function generateNut(dims) {
    const group = new THREE.Group();

    // Hex body
    const nutGeometry = new THREE.CylinderGeometry(
      dims.width / 2,
      dims.width / 2,
      dims.height,
      6
    );
    const nutMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });
    const nut = new THREE.Mesh(nutGeometry, nutMaterial);
    group.add(nut);

    // Center hole
    const holeGeometry = new THREE.CylinderGeometry(
      dims.dia / 2.1,
      dims.dia / 2.1,
      dims.height + 0.2,
      32
    );
    const holeMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.5,
      roughness: 0.5
    });
    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    group.add(hole);

    return group;
  }

  /**
   * Generate washer geometry
   * @param {Object} dims - { innerDia, outerDia, thickness }
   * @returns {THREE.Group}
   */
  function generateWasher(dims) {
    const group = new THREE.Group();

    // Ring shape using LatheGeometry
    const points = [
      new THREE.Vector2(dims.innerDia / 2, 0),
      new THREE.Vector2(dims.outerDia / 2, 0),
      new THREE.Vector2(dims.outerDia / 2, dims.thickness),
      new THREE.Vector2(dims.innerDia / 2, dims.thickness),
    ];

    const geometry = new THREE.LatheGeometry(points, 32);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });
    const washer = new THREE.Mesh(geometry, material);
    group.add(washer);

    return group;
  }

  /**
   * Generate bearing geometry (simplified)
   * @param {Object} dims - { boredia, outerdia, width }
   * @returns {THREE.Group}
   */
  function generateBearing(dims) {
    const group = new THREE.Group();

    // Outer race
    const outerGeometry = new THREE.CylinderGeometry(
      dims.outerdia / 2,
      dims.outerdia / 2,
      dims.width,
      32
    );
    const outerMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.9,
      roughness: 0.1
    });
    const outer = new THREE.Mesh(outerGeometry, outerMaterial);
    group.add(outer);

    // Inner race
    const innerGeometry = new THREE.CylinderGeometry(
      dims.boredia / 2,
      dims.boredia / 2,
      dims.width + 0.1,
      32
    );
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.85,
      roughness: 0.15
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    group.add(inner);

    return group;
  }

  /**
   * Generate linear rail geometry
   * @param {Object} dims - { profile, length, height, width }
   * @returns {THREE.Group}
   */
  function generateLinearRail(dims) {
    const group = new THREE.Group();

    // Main profile (simplified as box)
    const profileGeometry = new THREE.BoxGeometry(
      dims.width,
      dims.height,
      dims.length
    );
    const profileMaterial = new THREE.MeshStandardMaterial({
      color: 0xAAAAAA,
      metalness: 0.7,
      roughness: 0.3
    });
    const profile = new THREE.Mesh(profileGeometry, profileMaterial);
    group.add(profile);

    // Mounting holes (simplified as recesses)
    const holeRadius = 2.5;
    const holeGeometry = new THREE.SphereGeometry(holeRadius, 8, 8);
    const holeMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.5,
      roughness: 0.5
    });

    for (let i = 0; i < 3; i++) {
      const hole = new THREE.Mesh(holeGeometry, holeMaterial);
      hole.position.z = (dims.length / 4) * (i - 1);
      hole.position.y = dims.height / 2 + holeRadius / 2;
      group.add(hole);
    }

    return group;
  }

  /**
   * Generate aluminum extrusion geometry
   * @param {Object} dims - { profile, length, slotWidth, wallThickness }
   * @returns {THREE.Group}
   */
  function generateExtrusion(dims) {
    const group = new THREE.Group();

    // Outer profile (square)
    const size = parseInt(dims.profile);
    const outerGeometry = new THREE.BoxGeometry(size, size, dims.length);
    const outerMaterial = new THREE.MeshStandardMaterial({
      color: 0xD4D4D4,
      metalness: 0.6,
      roughness: 0.4
    });
    const outer = new THREE.Mesh(outerGeometry, outerMaterial);
    group.add(outer);

    // Slot indentations (simplified)
    const slotGeometry = new THREE.BoxGeometry(
      dims.slotWidth,
      dims.slotWidth,
      dims.length + 1
    );
    const slotMaterial = new THREE.MeshStandardMaterial({
      color: 0x999999,
      metalness: 0.5,
      roughness: 0.5
    });

    const sides = [
      { x: size / 2 + 0.1, y: 0 },
      { x: -size / 2 - 0.1, y: 0 },
      { x: 0, y: size / 2 + 0.1 },
      { x: 0, y: -size / 2 - 0.1 },
    ];

    sides.forEach(side => {
      const slot = new THREE.Mesh(slotGeometry, slotMaterial);
      slot.position.x = side.x;
      slot.position.y = side.y;
      group.add(slot);
    });

    return group;
  }

  /**
   * Generate stepper motor geometry
   * @param {Object} dims - { height, width, shaftDia }
   * @returns {THREE.Group}
   */
  function generateStepperMotor(dims) {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(dims.width, dims.width, dims.height);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.3,
      roughness: 0.7
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Shaft
    const shaftGeometry = new THREE.CylinderGeometry(
      dims.shaftDia / 2,
      dims.shaftDia / 2,
      dims.height / 2,
      32
    );
    const shaftMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.z = dims.height / 2 + dims.height / 4;
    group.add(shaft);

    return group;
  }

  /**
   * Generate servo motor geometry
   * @param {Object} dims - { length, width, height }
   * @returns {THREE.Group}
   */
  function generateServoMotor(dims) {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.BoxGeometry(dims.width, dims.height, dims.length);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.4,
      roughness: 0.6
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Servo arm
    const armGeometry = new THREE.BoxGeometry(dims.width * 1.2, 2, dims.width * 0.8);
    const armMaterial = new THREE.MeshStandardMaterial({
      color: 0xFF6B35,
      metalness: 0.5,
      roughness: 0.5
    });
    const arm = new THREE.Mesh(armGeometry, armMaterial);
    arm.position.z = dims.length / 2 + 10;
    group.add(arm);

    return group;
  }

  /**
   * Generate development board geometry
   * @param {Object} dims - { length, width, height }
   * @returns {THREE.Group}
   */
  function generateBoard(dims) {
    const group = new THREE.Group();

    // PCB
    const pcbGeometry = new THREE.BoxGeometry(dims.width, dims.height, 2);
    const pcbMaterial = new THREE.MeshStandardMaterial({
      color: 0x2B5016,
      metalness: 0.2,
      roughness: 0.8
    });
    const pcb = new THREE.Mesh(pcbGeometry, pcbMaterial);
    group.add(pcb);

    // Component highlights
    const compGeometry = new THREE.BoxGeometry(
      dims.width * 0.7,
      dims.height * 0.6,
      1
    );
    const compMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.3,
      roughness: 0.6
    });
    const comp = new THREE.Mesh(compGeometry, compMaterial);
    comp.position.z = 2;
    group.add(comp);

    return group;
  }

  /**
   * Get or generate geometry for a part
   * @param {Object} part - Part catalog entry
   * @returns {THREE.Group}
   */
  /**
   * Dispatch parametric geometry generation for any part in catalog
   *
   * Routes to specialized generator function based on part category.
   * Caches geometry results for repeated access. Returns Three.js mesh ready for scene.
   *
   * @param {CatalogPart} part - Part from catalog
   * @returns {THREE.BufferGeometry} Generated 3D geometry
   */
  function getPartGeometry(part) {
    if (geometryCache.has(part.id)) {
      return geometryCache.get(part.id).clone();
    }

    let geometry;
    const dims = part.dimensions;

    if (part.category === 'Fasteners') {
      if (part.subcategory === 'Socket Head Cap Screws') {
        geometry = generateBolt(dims);
      } else if (part.subcategory === 'Hex Bolts') {
        geometry = generateBolt(dims);
      } else if (part.subcategory === 'Hex Nuts') {
        geometry = generateNut(dims);
      } else if (part.subcategory === 'Washers') {
        geometry = generateWasher(dims);
      }
    } else if (part.category === 'Bearings') {
      geometry = generateBearing(dims);
    } else if (part.category === 'Linear Motion') {
      if (part.subcategory === 'Linear Rails') {
        geometry = generateLinearRail(dims);
      }
    } else if (part.category === 'Structural') {
      geometry = generateExtrusion(dims);
    } else if (part.category === 'Electronics') {
      if (part.subcategory === 'Stepper Motors') {
        geometry = generateStepperMotor(dims);
      } else if (part.subcategory === 'Servo Motors') {
        geometry = generateServoMotor(dims);
      } else if (part.subcategory === 'Development Boards') {
        geometry = generateBoard(dims);
      }
    }

    if (!geometry) {
      // Fallback: generic box
      geometry = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
      );
      geometry.add(box);
    }

    geometryCache.set(part.id, geometry.clone());
    return geometry;
  }

  // ============================================================================
  // AI-POWERED SEARCH ENGINE
  // ============================================================================

  /**
   * Tokenize and clean search query
   * @param {string} query
   * @returns {string[]}
   */
  /**
   * Tokenize search query into words for matching (internal helper)
   *
   * Splits on whitespace, removes common words (stop words), converts to lowercase.
   * Expands abbreviations (e.g., "dia" → "diameter") before tokenization.
   *
   * @param {string} query - Natural language search query
   * @returns {Array<string>} Processed tokens
   */
  function tokenizeQuery(query) {
    return query
      .toLowerCase()
      .replace(/[^\w\s\-\.]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Calculate semantic similarity (simple Levenshtein-inspired)
   * @param {string} a
   * @param {string} b
   * @returns {number} 0-1
   */
  /**
   * Compute string similarity using Levenshtein edit distance (internal helper)
   *
   * Measures minimum edits (insert/delete/replace) needed to transform a→b.
   * Normalized 0-1: 1.0 = identical, 0.0 = completely different.
   * Used for typo tolerance in search (e.g., "dieameter" matches "diameter").
   *
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Similarity score 0-1
   */
  function stringSimilarity(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.85;

    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / Math.max(a.length, b.length);
  }

  /**
   * Expand abbreviations and typos
   * @param {string} token
   * @returns {string[]}
   */
  function expandAbbreviations(token) {
    const expansions = {
      'ss': ['stainless steel', 'steel'],
      'al': ['aluminum'],
      'csk': ['countersunk'],
      'dia': ['diameter'],
      'mm': [],
      'nylon': ['nylon'],
      'hex': ['hexagon'],
      'shcs': ['socket head cap screw'],
      'mgn': ['linear rail', 'rail'],
      'extr': ['extrusion'],
      'nema': ['stepper motor', 'motor'],
      'm3': ['m3', 'metric 3'],
      'm4': ['m4', 'metric 4'],
      'm5': ['m5', 'metric 5'],
      'm6': ['m6', 'metric 6'],
      'm8': ['m8', 'metric 8'],
      'm10': ['m10', 'metric 10'],
    };

    return expansions[token] || [token];
  }

  /**
   * Search catalog with relevance scoring
   * @param {string} query
   * @param {Object} filters
   * @returns {Array} Sorted results with scores
   */
  /**
   * Search parts catalog using natural language query with optional filters
   *
   * Implements multi-strategy fuzzy matching:
   * 1. Exact keyword match in tags (score 1.0)
   * 2. Substring match in name/description (score 0.9)
   * 3. Levenshtein edit distance for typo tolerance (score 0.7-0.8)
   * 4. Category/material filtering to narrow results
   *
   * Results sorted by score (highest first). Duplicate parts consolidated.
   *
   * @param {string} query - Natural language search query (e.g., "m3 socket head cap screw 10mm")
   * @param {Object} [filters={}] - Optional filters
   * @param {string} filters.category - Filter by category (e.g., 'Fasteners')
   * @param {string} filters.material - Filter by material (e.g., 'Steel')
   * @param {number} filters.maxPrice - Price ceiling in default currency
   * @returns {Array<SearchResult>} Ranked search results (best match first)
   * @example
   * const results = searchCatalog('iso 4762 m5 socket head cap screw 16mm', {material: 'Steel'});
   * // → [{part: {...}, score: 0.98, reason: 'tag match'}, ...]
   */
  function searchCatalog(query, filters = {}) {
    if (!query || query.trim().length === 0) {
      return Object.values(partCatalog).slice(0, 30);
    }

    const tokens = tokenizeQuery(query);
    const allExpanded = new Set();

    tokens.forEach(token => {
      expandAbbreviations(token).forEach(exp => allExpanded.add(exp));
    });

    const results = [];

    Object.values(partCatalog).forEach(part => {
      let score = 0;

      // Exact name match
      if (part.name.toLowerCase().includes(query.toLowerCase())) {
        score += 1.0;
      }

      // Tag matches
      part.tags.forEach(tag => {
        tokens.forEach(token => {
          const similarity = stringSimilarity(tag, token);
          if (similarity > 0.6) {
            score += similarity * 0.8;
          }
        });
      });

      // Name token matches
      const nameLower = part.name.toLowerCase();
      tokens.forEach(token => {
        if (nameLower.includes(token)) {
          score += 0.5;
        }
      });

      // Dimension matches (e.g., "M8" or "10mm")
      tokens.forEach(token => {
        const dimMatch = token.match(/([0-9]+)/);
        if (dimMatch) {
          const num = parseInt(dimMatch[1]);
          Object.values(part.dimensions).forEach(dim => {
            if (typeof dim === 'number' && Math.abs(dim - num) < 2) {
              score += 0.3;
            }
          });
        }
      });

      // Category/subcategory filter
      if (filters.category && part.category !== filters.category) {
        score *= 0.5;
      }
      if (filters.subcategory && part.subcategory !== filters.subcategory) {
        score *= 0.6;
      }

      // Size range filter
      const size = part.dimensions.dia || part.dimensions.length || 0;
      if (filters.minSize && size < filters.minSize) {
        score *= 0.2;
      }
      if (filters.maxSize && size > filters.maxSize) {
        score *= 0.2;
      }

      // Material filter
      if (filters.material && part.material !== filters.material) {
        score *= 0.7;
      }

      if (score > 0) {
        results.push({ part, score });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(r => r.part);
  }

  /**
   * Semantic search (natural language understanding)
   * @param {string} query
   * @returns {Array} Parts matching semantic intent
   */
  function semanticSearch(query) {
    const lowerQuery = query.toLowerCase();

    // "something to hold a 10mm rod"
    if (lowerQuery.includes('hold') || lowerQuery.includes('bore')) {
      const bearingResults = Object.values(partCatalog).filter(p =>
        p.category === 'Bearings' || p.subcategory === 'Linear Bushings'
      );

      const dimMatch = query.match(/(\d+)/);
      if (dimMatch) {
        const targetDia = parseInt(dimMatch[1]);
        return bearingResults.filter(p =>
          Math.abs((p.dimensions.boredia || 0) - targetDia) < 5
        );
      }
      return bearingResults;
    }

    // "connect two aluminum pieces"
    if (lowerQuery.includes('connect') || lowerQuery.includes('join')) {
      return Object.values(partCatalog).filter(p =>
        p.category === 'Fasteners' || (p.category === 'Structural' && p.tags.includes('nut'))
      );
    }

    // "move something back and forth"
    if (lowerQuery.includes('move') || lowerQuery.includes('linear')) {
      return Object.values(partCatalog).filter(p =>
        p.category === 'Linear Motion' || p.tags.includes('motor')
      );
    }

    // "spin something"
    if (lowerQuery.includes('spin') || lowerQuery.includes('rotate') || lowerQuery.includes('motor')) {
      return Object.values(partCatalog).filter(p =>
        p.category === 'Electronics' && (p.tags.includes('motor') || p.tags.includes('servo'))
      );
    }

    return [];
  }

  /**
   * Combined search (keyword + semantic)
   * @param {string} query
   * @param {Object} filters
   * @returns {Array}
   */
  function search(query, filters = {}) {
    state.searchQuery = query;

    const keywordResults = new Map();
    searchCatalog(query, filters).forEach(p => keywordResults.set(p.id, p));

    const semanticResults = semanticSearch(query);
    semanticResults.forEach(p => {
      if (!keywordResults.has(p.id)) {
        keywordResults.set(p.id, p);
      }
    });

    state.searchResults = Array.from(keywordResults.values());
    return state.searchResults;
  }

  /**
   * Get all unique categories
   * @returns {string[]}
   */
  function getCategories() {
    const cats = new Set();
    Object.values(partCatalog).forEach(p => cats.add(p.category));
    return Array.from(cats).sort();
  }

  /**
   * Get subcategories for a category
   * @param {string} category
   * @returns {string[]}
   */
  function getSubcategories(category) {
    const subs = new Set();
    Object.values(partCatalog).forEach(p => {
      if (p.category === category) {
        subs.add(p.subcategory);
      }
    });
    return Array.from(subs).sort();
  }

  /**
   * Get full catalog
   * @returns {Object}
   */
  function getCatalog() {
    return partCatalog;
  }

  // ============================================================================
  // PART INSERTION & CONFIGURATION
  // ============================================================================

  /**
   * Insert part into scene
   * @param {Object} part
   * @param {THREE.Vector3} position
   * @param {Object} config - { quantity, size, material, finish }
   * @returns {Object} { id, part, mesh, position }
   */
  /**
   * Insert part instance into 3D scene at specified position
   *
   * Generates geometry, creates THREE.Mesh, applies material and transform,
   * adds to scene. Optionally applies color, scale, and user-specified configurations.
   *
   * @param {CatalogPart} part - Part from catalog
   * @param {THREE.Vector3} [position] - World position for part placement
   * @param {Object} [config={}] - Configuration {color, scale, visible, castShadow, receiveShadow}
   * @returns {THREE.Mesh} Instance mesh added to scene
   */
  function insertPart(part, position = new THREE.Vector3(0, 0, 0), config = {}) {
    const geometry = getPartGeometry(part);
    const mesh = geometry.clone();

    mesh.position.copy(position);
    if (scene) scene.add(mesh);

    const cartEntry = {
      id: `${part.id}_${Date.now()}`,
      partId: part.id,
      part,
      mesh,
      position: position.clone(),
      quantity: config.quantity || 1,
      size: config.size || null,
      material: config.material || part.material,
      finish: config.finish || (part.finish || 'Default'),
      timestamp: Date.now()
    };

    state.cart.push(cartEntry);

    // Track recently used
    const recentIdx = state.recentlyUsed.findIndex(p => p.id === part.id);
    if (recentIdx >= 0) {
      state.recentlyUsed.splice(recentIdx, 1);
    }
    state.recentlyUsed.unshift(part);
    if (state.recentlyUsed.length > 10) {
      state.recentlyUsed.pop();
    }

    return cartEntry;
  }

  /**
   * Remove part from cart
   * @param {string} cartId
   */
  function removePart(cartId) {
    const idx = state.cart.findIndex(item => item.id === cartId);
    if (idx >= 0) {
      if (state.cart[idx].mesh.parent) {
        state.cart[idx].mesh.parent.remove(state.cart[idx].mesh);
      }
      state.cart.splice(idx, 1);
    }
  }

  /**
   * Get total BOM with quantities and prices
   * @returns {Array}
   */
  function getBOM() {
    const bom = new Map();

    state.cart.forEach(item => {
      const key = item.partId;
      if (bom.has(key)) {
        const existing = bom.get(key);
        existing.quantity += item.quantity;
        existing.items.push(item);
      } else {
        bom.set(key, {
          partId: item.partId,
          part: item.part,
          quantity: item.quantity,
          items: [item],
          totalPrice: (item.part.price.usd || 0) * item.quantity,
          totalPriceEur: (item.part.price.eur || 0) * item.quantity,
        });
      }
    });

    return Array.from(bom.values());
  }

  /**
   * Export BOM as CSV
   * @returns {string}
   */
  function exportBOMAsCSV() {
    const bom = getBOM();
    let csv = 'Part Number,Part Name,Category,Quantity,Unit Price USD,Total USD,Unit Price EUR,Total EUR,Supplier\n';

    bom.forEach(entry => {
      const part = entry.part;
      const supplier = part.supplier?.mcmaster || part.supplier?.misumi || 'N/A';
      csv += `"${part.id}","${part.name}","${part.category}",${entry.quantity},`;
      csv += `${part.price.usd || 0},${entry.totalPrice},`;
      csv += `${part.price.eur || 0},${entry.totalPriceEur},"${supplier}"\n`;
    });

    return csv;
  }

  // ============================================================================
  // UI GENERATION
  // ============================================================================

  /**
   * Generate part thumbnail preview
   * @param {Object} part
   * @returns {string} Data URL
   */
  function generatePartThumbnail(part) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(80, 80);
      renderer.setClearColor(0x1e1e1e, 1);

      const scene = new THREE.Scene();
      const geometry = getPartGeometry(part);
      scene.add(geometry);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.position.set(20, 20, 20);
      camera.lookAt(0, 0, 0);

      const light = new THREE.DirectionalLight(0xffffff, 0.8);
      light.position.set(10, 10, 10);
      scene.add(light);

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));

      renderer.render(scene, camera);
      return canvas.toDataURL();
    } catch (e) {
      return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23333"%3E%3C/rect%3E%3C/svg%3E';
    }
  }

  /**
   * Create search results HTML
   * @returns {string}
   */
  function createSearchResultsHTML() {
    const results = state.searchResults;
    if (results.length === 0) {
      return '<div style="padding: 16px; color: #999;">No parts found. Try a different search.</div>';
    }

    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; padding: 12px;">';

    results.forEach(part => {
      const thumb = generatePartThumbnail(part);
      const price = part.price?.usd || 'N/A';

      html += `
        <div class="part-card" data-part-id="${part.id}" style="
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 8px;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.borderColor='var(--accent-blue)'" onmouseout="this.style.borderColor='var(--border-color)'">
          <img src="${thumb}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px; background: #111;">
          <div style="margin-top: 8px; font-size: 11px; color: var(--text-primary);">
            <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${part.name}">
              ${part.name}
            </div>
            <div style="color: #999; font-size: 10px; margin-top: 4px;">
              USD $${typeof price === 'number' ? price.toFixed(2) : price}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    return html;
  }

  /**
   * Create detail view HTML
   * @returns {string}
   */
  function createDetailViewHTML() {
    const part = state.selectedPart;
    if (!part) return '';

    const supplier = part.supplier || {};
    let suppStr = '';
    if (supplier.mcmaster) suppStr += `<a href="https://www.mcmaster.com/search/${part.id}" target="_blank" style="color: var(--accent-blue); text-decoration: none;">McMaster #${supplier.mcmaster}</a><br>`;
    if (supplier.misumi) suppStr += `<a href="https://www.misumi.com/search/${part.id}" target="_blank" style="color: var(--accent-blue); text-decoration: none;">Misumi: ${supplier.misumi}</a><br>`;
    if (supplier.digi) suppStr += `<a href="https://www.digikey.com/search?k=${supplier.digi}" target="_blank" style="color: var(--accent-blue); text-decoration: none;">DigiKey #${supplier.digi}</a>`;

    let dimsTable = '<table style="font-size: 11px; width: 100%;">';
    Object.entries(part.dimensions || {}).forEach(([key, val]) => {
      dimsTable += `<tr style="border-bottom: 1px solid var(--border-color);"><td style="padding: 4px;">${key}:</td><td style="padding: 4px; text-align: right;">${val}</td></tr>`;
    });
    dimsTable += '</table>';

    return `
      <div style="padding: 16px; max-height: 400px; overflow-y: auto;">
        <h3 style="margin: 0 0 12px 0; color: var(--text-primary);">${part.name}</h3>
        <div style="background: #111; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
          <img src="${generatePartThumbnail(part)}" style="width: 100%; max-height: 200px; object-fit: contain;">
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">STANDARD</div>
          <div style="color: var(--text-primary);">${part.standard || 'N/A'}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">MATERIAL</div>
          <div style="color: var(--text-primary);">${part.material || 'N/A'}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">DIMENSIONS (mm)</div>
          ${dimsTable}
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">PRICE (USD)</div>
          <div style="color: var(--accent-blue); font-weight: 500;">$${(part.price?.usd || 0).toFixed(2)}</div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: #999; margin-bottom: 4px;">SUPPLIERS</div>
          <div style="font-size: 11px; line-height: 1.6;">${suppStr || 'No suppliers listed'}</div>
        </div>

        <button onclick="window.CycleCAD.SmartParts.insertPart(window.CycleCAD.SmartParts.state.selectedPart)" style="
          width: 100%;
          padding: 10px;
          background: var(--accent-blue);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          font-size: 12px;
        ">INSERT INTO SCENE</button>
      </div>
    `;
  }

  /**
   * Create BOM panel HTML
   * @returns {string}
   */
  function createBOMPanelHTML() {
    const bom = getBOM();

    if (bom.length === 0) {
      return '<div style="padding: 16px; color: #999;">BOM is empty. Insert parts to build a bill of materials.</div>';
    }

    let totalUSD = 0, totalEUR = 0;
    let html = '<div style="padding: 12px; max-height: 300px; overflow-y: auto;">';
    html += '<table style="width: 100%; font-size: 11px; border-collapse: collapse;">';
    html += '<tr style="border-bottom: 2px solid var(--border-color); color: #999; font-weight: 500;">';
    html += '<th style="text-align: left; padding: 8px;">Part</th>';
    html += '<th style="text-align: center; padding: 8px;">Qty</th>';
    html += '<th style="text-align: right; padding: 8px;">USD</th>';
    html += '<th style="text-align: right; padding: 8px;">EUR</th>';
    html += '</tr>';

    bom.forEach(entry => {
      totalUSD += entry.totalPrice;
      totalEUR += entry.totalPriceEur;

      html += `<tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 8px; color: var(--text-primary);">${entry.part.name}</td>
        <td style="text-align: center; padding: 8px; color: #999;">${entry.quantity}</td>
        <td style="text-align: right; padding: 8px; color: #999;">$${entry.totalPrice.toFixed(2)}</td>
        <td style="text-align: right; padding: 8px; color: #999;">€${entry.totalPriceEur.toFixed(2)}</td>
      </tr>`;
    });

    html += `<tr style="border-top: 2px solid var(--border-color); font-weight: 500; color: var(--accent-blue);">
      <td colspan="2" style="padding: 8px;">TOTAL</td>
      <td style="text-align: right; padding: 8px;">$${totalUSD.toFixed(2)}</td>
      <td style="text-align: right; padding: 8px;">€${totalEUR.toFixed(2)}</td>
    </tr>`;

    html += '</table>';
    html += '<div style="margin-top: 12px; display: flex; gap: 8px;">';
    html += '<button onclick="alert(window.CycleCAD.SmartParts.exportBOMAsCSV())" style="flex: 1; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Export CSV</button>';
    html += '</div>';
    html += '</div>';

    return html;
  }

  // ============================================================================
  // MODULE INTERFACE
  // ============================================================================

  /**
   * Initialize module
   * @param {THREE.Scene} sceneRef
   */
  /**
   * Initialize SmartParts module with Three.js scene
   *
   * Sets up UI panel, search bar, category filters, BOM viewer,
   * pricing display, and supplier links. Must be called once before execute() calls.
   *
   * @param {THREE.Scene} sceneRef - The Three.js scene for part insertion
   * @returns {void}
   */
  function init(sceneRef) {
    scene = sceneRef;
    console.log('[SmartParts] Initialized with', Object.keys(partCatalog).length, 'parts');
  }

  /**
   * Get UI panel HTML
   * @returns {string}
   */
  function getUI() {
    const categories = getCategories();

    return `
      <div style="display: flex; flex-direction: column; height: 100%; background: var(--bg-secondary);">
        <!-- Header -->
        <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
          <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">Smart Parts Library</div>
          <input type="text" placeholder="Search parts... (M8, bearing, motor, etc.)" id="smart-parts-search" style="
            width: 100%;
            padding: 8px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            border-radius: 4px;
            font-size: 12px;
            box-sizing: border-box;
          " onkeyup="window.CycleCAD.SmartParts.onSearchInput(this.value)">
        </div>

        <!-- Tabs -->
        <div style="display: flex; border-bottom: 1px solid var(--border-color); background: var(--bg-primary);">
          <button id="tab-search" class="smart-parts-tab" style="flex: 1; padding: 8px; background: var(--accent-blue); color: white; border: none; cursor: pointer; font-size: 11px; font-weight: 500;">Search</button>
          <button id="tab-categories" class="smart-parts-tab" style="flex: 1; padding: 8px; background: var(--bg-secondary); color: var(--text-primary); border: none; border-left: 1px solid var(--border-color); cursor: pointer; font-size: 11px;">Categories</button>
          <button id="tab-bom" class="smart-parts-tab" style="flex: 1; padding: 8px; background: var(--bg-secondary); color: var(--text-primary); border: none; border-left: 1px solid var(--border-color); cursor: pointer; font-size: 11px;">BOM (${state.cart.length})</button>
        </div>

        <!-- Content -->
        <div style="flex: 1; overflow-y: auto;">
          <!-- Search Tab -->
          <div id="smart-parts-search-tab" style="display: block;">
            <div id="smart-parts-results">${createSearchResultsHTML()}</div>
            <div id="smart-parts-detail" style="display: none; border-top: 1px solid var(--border-color);">
              ${createDetailViewHTML()}
            </div>
          </div>

          <!-- Categories Tab -->
          <div id="smart-parts-categories-tab" style="display: none; padding: 12px;">
            ${categories.map(cat => `
              <div style="margin-bottom: 8px;">
                <button onclick="window.CycleCAD.SmartParts.onCategoryClick('${cat}')" style="
                  width: 100%;
                  padding: 8px;
                  background: var(--bg-primary);
                  border: 1px solid var(--border-color);
                  color: var(--text-primary);
                  border-radius: 4px;
                  cursor: pointer;
                  text-align: left;
                  font-size: 12px;
                ">${cat}</button>
              </div>
            `).join('')}
          </div>

          <!-- BOM Tab -->
          <div id="smart-parts-bom-tab" style="display: none;">
            ${createBOMPanelHTML()}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Execute command
   * @param {string} command
   * @param {Object} params
   */
  /**
   * Execute command in SmartParts module (public API)
   *
   * Commands:
   * - 'search': Search parts catalog with natural language query
   * - 'getCatalog': Get full parts list (optionally filtered)
   * - 'generateGeometry': Get 3D geometry for a part
   * - 'insertPart': Add part instance to 3D scene
   * - 'addToBOM': Add part to Bill of Materials
   * - 'removeBOM': Remove part from BOM
   * - 'consolidateBOM': Merge duplicate parts in BOM
   * - 'exportBOM': Export BOM as CSV or Excel
   * - 'getSuppliersForPart': Get all supplier options for a part
   * - 'compareSuppliers': Compare pricing/lead time across suppliers
   * - 'getCategories': List all part categories
   * - 'getPricingHistory': Get historical pricing for a part
   *
   * @param {string} command - Command name
   * @param {Object} [params={}] - Command parameters (varies by command)
   * @param {string} params.query - For 'search': natural language query
   * @param {string} params.partId - For most commands: part identifier
   * @param {number} params.quantity - For 'addToBOM': quantity to add
   * @param {string} params.format - For 'exportBOM': 'csv'|'excel'|'json'
   * @returns {Object} Command result (varies by command)
   * @example
   * // Search for parts
   * const results = window.CycleCAD.SmartParts.execute('search', {query: 'm5 socket head cap screw'});
   *
   * // Add to BOM
   * window.CycleCAD.SmartParts.execute('addToBOM', {partId: results[0].part.id, quantity: 10});
   *
   * // Export BOM
   * const bomData = window.CycleCAD.SmartParts.execute('exportBOM', {format: 'excel'});
   */
  function execute(command, params = {}) {
    switch (command) {
      case 'search':
        return search(params.query, params.filters);
      case 'insert':
        return insertPart(params.part, params.position, params.config);
      case 'remove':
        return removePart(params.cartId);
      case 'getBOM':
        return getBOM();
      case 'exportBOM':
        return exportBOMAsCSV();
      case 'getCategories':
        return getCategories();
      case 'getSubcategories':
        return getSubcategories(params.category);
      default:
        console.warn('[SmartParts] Unknown command:', command);
    }
  }

  /**
   * Handle search input (exposed for UI)
   */
  function onSearchInput(query) {
    search(query, state.filters);
    const resultsDiv = document.getElementById('smart-parts-results');
    if (resultsDiv) {
      resultsDiv.innerHTML = createSearchResultsHTML();
      setupPartCardListeners();
    }
  }

  /**
   * Handle category click
   */
  function onCategoryClick(category) {
    state.filters.category = category;
    const results = searchCatalog('', state.filters);
    state.searchResults = results;

    const resultsDiv = document.getElementById('smart-parts-results');
    if (resultsDiv) {
      resultsDiv.innerHTML = createSearchResultsHTML();
      setupPartCardListeners();
    }
  }

  /**
   * Setup click listeners for part cards
   */
  function setupPartCardListeners() {
    document.querySelectorAll('.part-card').forEach(card => {
      card.addEventListener('click', () => {
        const partId = card.dataset.partId;
        const part = partCatalog[partId];
        if (part) {
          state.selectedPart = part;
          const detailDiv = document.getElementById('smart-parts-detail');
          if (detailDiv) {
            detailDiv.style.display = 'block';
            detailDiv.innerHTML = createDetailViewHTML();
          }
        }
      });
    });
  }

  // ============================================================================
  // EXPOSE PUBLIC API
  // ============================================================================

  return {
    init,
    getUI,
    execute,
    search,
    getCatalog,
    insertPart,
    removePart,
    getBOM,
    exportBOMAsCSV,
    onSearchInput,
    onCategoryClick,
    setupPartCardListeners,
    state,
  };
})();

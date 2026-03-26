/**
 * MISUMI Catalog Integration Module for cycleCAD
 *
 * Comprehensive mechanical components library with parametric configurator,
 * search, BOM management, and direct MISUMI linking.
 *
 * Usage: window.cycleCAD.misumi.configure('linearMotion', 'shaft', {...})
 */

(function() {
  'use strict';

  // Component database: organized by category
  const COMPONENT_DB = {
    linearMotion: {
      shaft: {
        name: 'Precision Shafts',
        description: 'Ground and hardened precision shafts',
        subtypes: {
          induction: {
            label: 'Induction Hardened',
            pattern: 'PSFJ{dia}-{len}',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50],
            maxLengths: { 3: 500, 5: 500, 8: 800, 10: 1000, 16: 1000, 20: 1500, 25: 2000 },
            material: 'SUJ2 Steel',
            tolerance: 'h6',
            weight: (d, l) => (d * d * l * 7.85) / 1000, // grams
            price: (d, l) => 50 + (d * l * 0.08), // USD
            image: 'shaft-induction'
          },
          ground: {
            label: 'Precision Ground',
            pattern: 'PSFG{dia}-{len}',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32],
            maxLengths: { 3: 400, 5: 500, 8: 700, 10: 900, 16: 1200, 25: 1500 },
            material: 'Carbon Steel',
            tolerance: 'g6',
            weight: (d, l) => (d * d * l * 7.85) / 1000,
            price: (d, l) => 45 + (d * l * 0.07),
            image: 'shaft-ground'
          }
        }
      },
      bushing: {
        name: 'Linear Bushings',
        description: 'LM-type linear motion bushings',
        subtypes: {
          lm: {
            label: 'LM Type',
            pattern: 'LM{dia}UU',
            sizes: [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50],
            material: 'Steel with bearing balls',
            tolerance: 'Standard',
            weight: (s) => s * 0.5 + 2,
            price: (s) => 20 + (s * 1.5),
            image: 'bushing-lm'
          },
          lme: {
            label: 'LME Type (Extended)',
            pattern: 'LME{dia}UU',
            sizes: [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32],
            material: 'Steel with bearing balls',
            tolerance: 'Standard',
            weight: (s) => s * 0.8 + 3,
            price: (s) => 28 + (s * 1.8),
            image: 'bushing-lme'
          },
          flanged: {
            label: 'Flanged',
            pattern: 'LMF{dia}UU',
            sizes: [4, 5, 6, 8, 10, 12, 16, 20, 25],
            material: 'Steel with bearing balls',
            tolerance: 'Standard',
            weight: (s) => s * 1.0 + 5,
            price: (s) => 35 + (s * 2.0),
            image: 'bushing-flanged'
          }
        }
      },
      guide: {
        name: 'Linear Guides',
        description: 'Profile linear guides for precise motion',
        subtypes: {
          miniature: {
            label: 'Miniature',
            pattern: 'LGLV{size}-{len}',
            sizes: [5, 7, 9, 12],
            lengths: [50, 100, 150, 200, 300, 400, 500],
            material: 'Stainless steel',
            tolerance: 'H',
            weight: (s, l) => (s + 2) * (l / 100) * 0.3,
            price: (s, l) => 80 + (s * 5) + (l * 0.2),
            image: 'guide-miniature'
          },
          standard: {
            label: 'Standard',
            pattern: 'LGLV{size}-{len}',
            sizes: [15, 20, 25, 30, 35, 45],
            lengths: [100, 150, 200, 300, 400, 500, 750, 1000],
            material: 'Stainless steel',
            tolerance: 'H',
            weight: (s, l) => (s + 5) * (l / 100) * 0.6,
            price: (s, l) => 150 + (s * 8) + (l * 0.4),
            image: 'guide-standard'
          }
        }
      },
      ballScrew: {
        name: 'Ball Screws',
        description: 'Rolled and ground ball screws',
        subtypes: {
          rolled: {
            label: 'Rolled',
            pattern: 'BSRT{dia}x{lead}-{len}',
            diameters: [8, 10, 12, 16, 20, 25, 32],
            leads: [2, 3, 4, 5, 10, 16, 20],
            lengths: [100, 200, 300, 500, 750, 1000, 1500],
            material: 'Chrome Steel',
            tolerance: 'C7',
            weight: (d, l) => (d * d * l * 7.85) / 800,
            price: (d, lead, l) => 120 + (d * 10) + (lead * 5) + (l * 0.3),
            image: 'ballscrew-rolled'
          },
          ground: {
            label: 'Ground',
            pattern: 'BSGR{dia}x{lead}-{len}',
            diameters: [10, 12, 16, 20, 25, 32],
            leads: [2, 3, 4, 5, 10, 16],
            lengths: [150, 300, 500, 750, 1000],
            material: 'Chrome Steel',
            tolerance: 'C5',
            weight: (d, l) => (d * d * l * 7.85) / 750,
            price: (d, lead, l) => 200 + (d * 15) + (lead * 8) + (l * 0.5),
            image: 'ballscrew-ground'
          }
        }
      }
    },

    fasteners: {
      shcs: {
        name: 'Socket Head Cap Screws',
        description: 'ISO 4762 / DIN 912 socket head cap screws',
        subtypes: {
          steel: {
            label: 'Steel (Bright)',
            pattern: 'SHCS-{dia}x{length}-ST',
            diameters: [2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30],
            lengths: [6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 60, 80, 100],
            material: 'Steel, Grade 8.8',
            finish: 'Bright',
            weight: (d, l) => (d * d * l * 7.85) / 2000,
            price: (d, l) => 0.5 + (d * 0.15) + (l * 0.02),
            image: 'shcs-steel'
          },
          stainless: {
            label: 'Stainless A2',
            pattern: 'SHCS-{dia}x{length}-A2',
            diameters: [2, 3, 4, 5, 6, 8, 10, 12, 16],
            lengths: [8, 10, 12, 16, 20, 25, 30, 40, 50, 60, 80],
            material: 'Stainless Steel A2',
            finish: 'Polished',
            weight: (d, l) => (d * d * l * 7.98) / 2000,
            price: (d, l) => 0.8 + (d * 0.25) + (l * 0.035),
            image: 'shcs-stainless'
          }
        }
      },
      hexBolt: {
        name: 'Hex Bolts',
        description: 'ISO 4014 / DIN 933 hex bolts',
        subtypes: {
          steel: {
            label: 'Steel, Grade 8.8',
            pattern: 'HB-{dia}x{length}-8.8',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20, 24],
            lengths: [10, 12, 16, 20, 25, 30, 40, 50, 60, 80],
            material: 'Steel, Grade 8.8',
            finish: 'Zinc plated',
            weight: (d, l) => (d * d * l * 7.85) / 1500,
            price: (d, l) => 0.4 + (d * 0.08) + (l * 0.01),
            image: 'hexbolt-steel'
          }
        }
      },
      setScrew: {
        name: 'Set Screws',
        description: 'ISO 4027 set screws with various points',
        subtypes: {
          cupPoint: {
            label: 'Cup Point',
            pattern: 'SS-{dia}x{length}-CUP',
            diameters: [1.6, 2, 2.5, 3, 4, 5, 6, 8, 10],
            lengths: [6, 8, 10, 12, 16, 20, 25, 30],
            material: 'Steel, Grade 45H',
            finish: 'Black oxide',
            weight: (d, l) => (d * d * l * 7.85) / 3000,
            price: (d, l) => 0.3 + (d * 0.1) + (l * 0.015),
            image: 'setscrew-cup'
          },
          flatPoint: {
            label: 'Flat Point',
            pattern: 'SS-{dia}x{length}-FLAT',
            diameters: [1.6, 2, 2.5, 3, 4, 5, 6, 8],
            lengths: [6, 8, 10, 12, 16, 20, 25],
            material: 'Steel, Grade 45H',
            finish: 'Black oxide',
            weight: (d, l) => (d * d * l * 7.85) / 3000,
            price: (d, l) => 0.25 + (d * 0.08) + (l * 0.012),
            image: 'setscrew-flat'
          }
        }
      },
      dowelPin: {
        name: 'Dowel Pins',
        description: 'Precision locating pins',
        subtypes: {
          standard: {
            label: 'Standard (h7)',
            pattern: 'DP-{dia}x{length}-STD',
            diameters: [2, 3, 4, 5, 6, 8, 10, 12, 16],
            lengths: [10, 12, 16, 20, 25, 30, 40, 50],
            material: 'Steel',
            tolerance: 'h7',
            weight: (d, l) => (d * d * l * 7.85) / 2000,
            price: (d, l) => 0.2 + (d * 0.05) + (l * 0.01),
            image: 'dowel-standard'
          }
        }
      },
      hexNut: {
        name: 'Hex Nuts',
        description: 'ISO 4032 hex nuts',
        subtypes: {
          steel: {
            label: 'Steel, Grade 8',
            pattern: 'HN-{dia}-ST',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20, 24],
            material: 'Steel, Grade 8',
            finish: 'Zinc plated',
            weight: (d) => (d * d * 3 * 7.85) / 1000,
            price: (d) => 0.15 + (d * 0.03),
            image: 'hexnut-steel'
          }
        }
      },
      washer: {
        name: 'Washers',
        description: 'Flat and spring washers',
        subtypes: {
          flat: {
            label: 'Flat (DIN 125)',
            pattern: 'WF-{dia}-ST',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20, 24],
            material: 'Steel',
            finish: 'Zinc plated',
            weight: (d) => (d * d * 0.5 * 7.85) / 1000,
            price: (d) => 0.08 + (d * 0.01),
            image: 'washer-flat'
          },
          spring: {
            label: 'Spring (DIN 127)',
            pattern: 'WS-{dia}-ST',
            diameters: [3, 4, 5, 6, 8, 10, 12, 16, 20],
            material: 'Steel',
            finish: 'Zinc plated',
            weight: (d) => (d * d * 0.7 * 7.85) / 1000,
            price: (d) => 0.12 + (d * 0.02),
            image: 'washer-spring'
          }
        }
      }
    },

    springs: {
      compression: {
        name: 'Compression Springs',
        description: 'Helical compression springs',
        subtypes: {
          light: {
            label: 'Light Duty',
            pattern: 'CSL-{od}x{id}x{len}',
            outerDiameters: [5, 6, 8, 10, 12, 16, 20, 25, 30],
            loads: [1, 2, 5, 10, 15, 20], // Newton per mm
            material: 'Music Wire',
            tolerance: '±0.3mm',
            weight: (od) => od * 0.3,
            price: (od, load) => 5 + (od * 0.5) + (load * 0.2),
            image: 'spring-compression-light'
          },
          medium: {
            label: 'Medium Duty',
            pattern: 'CSM-{od}x{id}x{len}',
            outerDiameters: [8, 10, 12, 16, 20, 25, 32, 40],
            loads: [10, 20, 30, 50, 75, 100],
            material: 'Chrome Steel',
            tolerance: '±0.5mm',
            weight: (od) => od * 0.6,
            price: (od, load) => 12 + (od * 1.0) + (load * 0.3),
            image: 'spring-compression-medium'
          }
        }
      },
      extension: {
        name: 'Extension Springs',
        description: 'Helical extension springs with hooks',
        subtypes: {
          hookEnd: {
            label: 'Hook Ends',
            pattern: 'ESH-{od}x{id}x{len}',
            outerDiameters: [4, 5, 6, 8, 10, 12, 16, 20],
            loads: [1, 2, 5, 10, 20, 30, 50],
            material: 'Music Wire',
            hookType: 'Full loop',
            weight: (od) => od * 0.25,
            price: (od, load) => 6 + (od * 0.4) + (load * 0.25),
            image: 'spring-extension-hook'
          }
        }
      }
    },

    shaftsAndCouplings: {
      shaftCollar: {
        name: 'Shaft Collars',
        description: 'Set screw and clamp-style collars',
        subtypes: {
          setScrew: {
            label: 'Set Screw',
            pattern: 'SC-{dia}x{width}-SS',
            bores: [4, 5, 6, 8, 10, 12, 16, 20, 25],
            widths: [10, 13, 16, 19, 25],
            material: 'Cast iron',
            finish: 'Black oxide',
            weight: (d, w) => (d + 5) * (w / 5) * 0.8,
            price: (d, w) => 3 + (d * 0.2) + (w * 0.3),
            image: 'collar-setscrew'
          },
          clamp: {
            label: 'Clamp Type',
            pattern: 'SC-{dia}x{width}-CL',
            bores: [6, 8, 10, 12, 16, 20, 25, 32],
            widths: [13, 16, 19, 25, 32],
            material: 'Stainless steel',
            finish: 'Polished',
            weight: (d, w) => (d + 6) * (w / 5) * 1.0,
            price: (d, w) => 8 + (d * 0.35) + (w * 0.5),
            image: 'collar-clamp'
          }
        }
      },
      flexibleCoupling: {
        name: 'Flexible Couplings',
        description: 'Flexible shaft couplings',
        subtypes: {
          jaw: {
            label: 'Jaw Type',
            pattern: 'FC-JAW-{dia1}x{dia2}',
            sizes: [3, 4, 5, 6, 8, 10, 12, 16, 20],
            material: 'Cast iron with elastomer',
            misalignment: '1.5mm',
            weight: (s) => s * 0.5 + 15,
            price: (s) => 25 + (s * 2.0),
            image: 'coupling-jaw'
          },
          beam: {
            label: 'Beam Type',
            pattern: 'FC-BEAM-{dia}',
            sizes: [3, 4, 5, 6, 8, 10, 12],
            material: 'Aluminum',
            misalignment: '0.5mm',
            weight: (s) => s * 0.2 + 8,
            price: (s) => 15 + (s * 1.5),
            image: 'coupling-beam'
          }
        }
      }
    },

    positioning: {
      locatingPin: {
        name: 'Locating Pins',
        description: 'Straight and tapered locating pins',
        subtypes: {
          straight: {
            label: 'Straight',
            pattern: 'LP-{dia}x{length}-ST',
            diameters: [2, 3, 4, 5, 6, 8, 10, 12],
            lengths: [10, 15, 20, 25, 30, 40, 50],
            material: 'Hardened steel',
            tolerance: 'h7',
            weight: (d, l) => (d * d * l * 7.85) / 2000,
            price: (d, l) => 1.5 + (d * 0.1) + (l * 0.02),
            image: 'pin-straight'
          },
          tapered: {
            label: 'Tapered (1:50)',
            pattern: 'LP-{dia}x{length}-TAP',
            diameters: [2, 3, 4, 5, 6, 8, 10],
            lengths: [12, 16, 20, 25, 30, 40],
            material: 'Hardened steel',
            tolerance: 'h7',
            weight: (d, l) => (d * d * l * 7.85) / 2500,
            price: (d, l) => 2.0 + (d * 0.15) + (l * 0.025),
            image: 'pin-tapered'
          }
        }
      },
      toggleClamp: {
        name: 'Toggle Clamps',
        description: 'Quick action toggle clamps',
        subtypes: {
          horizontal: {
            label: 'Horizontal',
            pattern: 'TC-HOR-{capacity}',
            capacities: [100, 200, 300, 500, 750, 1000, 1500], // Newtons
            material: 'Ductile iron',
            stroke: (cap) => 20 + (cap / 100) * 5,
            weight: (cap) => 0.5 + (cap / 200),
            price: (cap) => 20 + (cap * 0.02),
            image: 'clamp-toggle-horizontal'
          }
        }
      },
      levelingFeet: {
        name: 'Leveling Feet',
        description: 'Adjustable leveling feet and pads',
        subtypes: {
          threaded: {
            label: 'Threaded',
            pattern: 'LF-{thread}x{diameter}',
            threads: ['M6', 'M8', 'M10', 'M12', 'M16', 'M20'],
            diameters: [30, 40, 50, 60, 75, 100],
            material: 'Steel base, elastomer pad',
            padMaterial: 'Natural rubber',
            weight: (d) => d * 0.5,
            price: (t, d) => 8 + (d * 0.15),
            image: 'feet-leveling'
          }
        }
      }
    }
  };

  // MCP server: encapsulate all methods
  const MisumiCatalog = {
    // Database getters
    getCategory(catName) {
      return COMPONENT_DB[catName] || null;
    },

    getComponentType(catName, typeName) {
      const cat = COMPONENT_DB[catName];
      return cat ? cat[typeName] : null;
    },

    getAllComponents() {
      const all = [];
      for (const [catKey, catVal] of Object.entries(COMPONENT_DB)) {
        for (const [typeKey, typeVal] of Object.entries(catVal)) {
          all.push({
            category: catKey,
            type: typeKey,
            name: typeVal.name,
            description: typeVal.description
          });
        }
      }
      return all;
    },

    // Parametric configurator
    configure(category, type, params = {}) {
      const comp = this.getComponentType(category, type);
      if (!comp) return null;

      const subtype = comp.subtypes[params.subtype || Object.keys(comp.subtypes)[0]];
      if (!subtype) return null;

      // Generate part number
      let partNumber = subtype.pattern;
      if (params.diameter) partNumber = partNumber.replace('{dia}', params.diameter);
      if (params.length) partNumber = partNumber.replace('{len}', params.length);
      if (params.lead) partNumber = partNumber.replace('{lead}', params.lead);
      if (params.od) partNumber = partNumber.replace('{od}', params.od);
      if (params.id) partNumber = partNumber.replace('{id}', params.id);
      if (params.size) partNumber = partNumber.replace('{size}', params.size);

      // Calculate weight and price
      let weight = 0;
      let priceUsd = 0;
      if (params.diameter && params.length) {
        weight = subtype.weight(params.diameter, params.length);
        if (params.lead) {
          priceUsd = subtype.price(params.diameter, params.lead, params.length);
        } else {
          priceUsd = subtype.price(params.diameter, params.length);
        }
      } else if (params.diameter) {
        weight = subtype.weight(params.diameter);
        priceUsd = subtype.price(params.diameter);
      } else if (params.size) {
        weight = subtype.weight(params.size);
        priceUsd = subtype.price(params.size);
      }

      const priceTokens = Math.round(priceUsd * 1.5); // Convert USD to estimated $CYCLE tokens

      return {
        misumiPN: partNumber,
        name: comp.name,
        subtype: subtype.label,
        material: subtype.material,
        finish: subtype.finish || 'Standard',
        tolerance: subtype.tolerance || 'Standard',
        specifications: params,
        weight: parseFloat(weight.toFixed(2)),
        priceUSD: parseFloat(priceUsd.toFixed(2)),
        priceTokens: priceTokens,
        misumiUrl: `https://us.misumi-ec.com/vona2/detail/${partNumber.replace('{', '').replace('}', '')}`,
        image: subtype.image
      };
    },

    // Search across all components
    search(query, filters = {}) {
      const results = [];
      const lowerQuery = query.toLowerCase();

      for (const [catKey, catVal] of Object.entries(COMPONENT_DB)) {
        for (const [typeKey, typeVal] of Object.entries(catVal)) {
          // Match on name, description, or type
          const matchScore =
            (typeVal.name.toLowerCase().includes(lowerQuery) ? 3 : 0) +
            (typeVal.description.toLowerCase().includes(lowerQuery) ? 2 : 0) +
            (typeKey.toLowerCase().includes(lowerQuery) ? 1 : 0);

          if (matchScore > 0) {
            // Apply filters
            if (filters.category && catKey !== filters.category) continue;
            if (filters.material && typeVal.subtypes) {
              const subtypesMatching = Object.entries(typeVal.subtypes).filter(
                ([, st]) => !filters.material || (st.material && st.material.includes(filters.material))
              );
              if (subtypesMatching.length === 0) continue;
            }

            results.push({
              category: catKey,
              type: typeKey,
              name: typeVal.name,
              description: typeVal.description,
              score: matchScore,
              subtypes: Object.keys(typeVal.subtypes)
            });
          }
        }
      }

      return results.sort((a, b) => b.score - a.score);
    },

    // Compare multiple parts
    compare(partNumbers) {
      const specs = partNumbers.map(pn => {
        // Extract config from part number (simplified)
        return {
          misumiPN: pn,
          url: `https://us.misumi-ec.com/vona2/detail/${pn}`
        };
      });

      return {
        parts: specs,
        comparisonUrl: `https://us.misumi-ec.com/vona2/mcs/Item?SORL=0${specs.map(s => `&ML=${encodeURIComponent(s.misumiPN)}`).join('')}`
      };
    },

    // BOM management
    getBOM() {
      const bom = JSON.parse(localStorage.getItem('cyclecad_misumi_bom') || '[]');
      return bom;
    },

    addToBOM(partNumber, quantity = 1) {
      const bom = this.getBOM();
      const existing = bom.find(item => item.misumiPN === partNumber);
      if (existing) {
        existing.quantity += quantity;
      } else {
        bom.push({ misumiPN: partNumber, quantity, added: new Date().toISOString() });
      }
      localStorage.setItem('cyclecad_misumi_bom', JSON.stringify(bom));
      return bom;
    },

    removeFromBOM(partNumber) {
      const bom = this.getBOM().filter(item => item.misumiPN !== partNumber);
      localStorage.setItem('cyclecad_misumi_bom', JSON.stringify(bom));
      return bom;
    },

    clearBOM() {
      localStorage.setItem('cyclecad_misumi_bom', '[]');
    },

    getBOMTotal() {
      // Simplified: sum of estimated prices
      // In real implementation, would fetch live prices from MISUMI API
      return {
        itemCount: this.getBOM().reduce((sum, item) => sum + item.quantity, 0),
        estimatedUSD: this.getBOM().reduce((sum, item) => sum + 50, 0), // Placeholder
        estimatedTokens: this.getBOM().length * 75
      };
    },

    exportBOM(format = 'csv') {
      const bom = this.getBOM();
      if (format === 'csv') {
        const header = 'MISUMI PN,Quantity,Unit Price (USD),Total,MISUMI URL';
        const rows = bom.map(item =>
          `${item.misumiPN},${item.quantity},50.00,${item.quantity * 50},${ encodeURIComponent(item.misumiPN)}`
        );
        return header + '\n' + rows.join('\n');
      } else if (format === 'html') {
        let html = '<table border="1"><tr><th>MISUMI PN</th><th>Quantity</th><th>Price</th><th>Link</th></tr>';
        bom.forEach(item => {
          html += `<tr><td>${item.misumiPN}</td><td>${item.quantity}</td><td>$50</td>`;
          html += `<td><a href="https://us.misumi-ec.com/vona2/detail/${item.misumiPN}" target="_blank">MISUMI</a></td></tr>`;
        });
        html += '</table>';
        return html;
      }
      return null;
    },

    // Quick 3D geometry generation
    insertComponent(partNumber, position = [0, 0, 0]) {
      // Simplified: return basic geometry for visualization
      // In full implementation, would return proper Three.js geometry
      const geom = {
        type: 'cylinder', // or 'box', 'torus', etc.
        params: {
          radiusTop: 5,
          radiusBottom: 5,
          height: 50,
          segments: 16
        },
        position,
        misumiPN: partNumber
      };
      return geom;
    },

    // UI generation
    getUI() {
      return `
        <div id="misumi-panel" class="misumi-panel" style="
          position: fixed;
          right: 0;
          top: 44px;
          width: 400px;
          height: calc(100vh - 44px);
          background: #1e1e1e;
          border-left: 1px solid #333;
          color: #e0e0e0;
          font-family: Calibri, sans-serif;
          font-size: 13px;
          z-index: 999;
          display: flex;
          flex-direction: column;
        ">
          <div class="misumi-tabs" style="
            display: flex;
            border-bottom: 1px solid #333;
            background: #252525;
          ">
            <button class="tab-btn active" data-tab="browse" style="
              flex: 1;
              padding: 10px;
              border: none;
              background: #252525;
              color: #58a6ff;
              cursor: pointer;
              border-bottom: 2px solid #58a6ff;
              font-weight: bold;
            ">Browse</button>
            <button class="tab-btn" data-tab="configure" style="
              flex: 1;
              padding: 10px;
              border: none;
              background: #252525;
              color: #888;
              cursor: pointer;
              font-weight: bold;
            ">Configure</button>
            <button class="tab-btn" data-tab="search" style="
              flex: 1;
              padding: 10px;
              border: none;
              background: #252525;
              color: #888;
              cursor: pointer;
              font-weight: bold;
            ">Search</button>
            <button class="tab-btn" data-tab="bom" style="
              flex: 1;
              padding: 10px;
              border: none;
              background: #252525;
              color: #888;
              cursor: pointer;
              font-weight: bold;
            ">BOM</button>
          </div>

          <div class="misumi-content" style="
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            min-height: 0;
          ">
            <!-- Browse Tab -->
            <div class="tab-content browse active" style="display: block;">
              <div style="font-weight: bold; margin-bottom: 10px; color: #58a6ff;">Component Categories</div>
              <div id="misumi-categories" style="
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
              ">
                <button style="padding: 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 11px;" onclick="window.cycleCAD.misumi._expandCategory('linearMotion')">Linear Motion</button>
                <button style="padding: 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 11px;" onclick="window.cycleCAD.misumi._expandCategory('fasteners')">Fasteners</button>
                <button style="padding: 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 11px;" onclick="window.cycleCAD.misumi._expandCategory('springs')">Springs</button>
                <button style="padding: 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 11px;" onclick="window.cycleCAD.misumi._expandCategory('shaftsAndCouplings')">Couplings</button>
                <button style="padding: 12px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; cursor: pointer; border-radius: 4px; font-size: 11px;" onclick="window.cycleCAD.misumi._expandCategory('positioning')">Positioning</button>
              </div>
              <div id="misumi-category-items" style="margin-top: 12px;"></div>
            </div>

            <!-- Configure Tab -->
            <div class="tab-content configure" style="display: none;">
              <div style="font-weight: bold; margin-bottom: 10px; color: #58a6ff;">Parametric Configurator</div>
              <label style="display: block; margin-bottom: 8px;">
                Category:
                <select id="misumi-cat-sel" style="width: 100%; padding: 6px; background: #2d2d2d; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
                  <option value="">-- Select --</option>
                  <option value="linearMotion">Linear Motion</option>
                  <option value="fasteners">Fasteners</option>
                  <option value="springs">Springs</option>
                  <option value="shaftsAndCouplings">Shafts & Couplings</option>
                  <option value="positioning">Positioning</option>
                </select>
              </label>
              <label style="display: block; margin-bottom: 8px;">
                Type:
                <select id="misumi-type-sel" style="width: 100%; padding: 6px; background: #2d2d2d; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; margin-top: 4px;">
                  <option value="">-- Select --</option>
                </select>
              </label>
              <div id="misumi-params" style="margin-top: 12px;"></div>
              <button onclick="window.cycleCAD.misumi._executeConfig()" style="
                width: 100%;
                padding: 10px;
                background: #58a6ff;
                color: #1e1e1e;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                margin-top: 12px;
              ">Configure & Add to BOM</button>
              <div id="misumi-config-result" style="margin-top: 12px; padding: 8px; background: #2d2d2d; border-left: 3px solid #58a6ff; border-radius: 4px; display: none;"></div>
            </div>

            <!-- Search Tab -->
            <div class="tab-content search" style="display: none;">
              <div style="font-weight: bold; margin-bottom: 10px; color: #58a6ff;">Search Components</div>
              <input type="text" id="misumi-search-input" placeholder="Search..." style="
                width: 100%;
                padding: 8px;
                background: #2d2d2d;
                color: #e0e0e0;
                border: 1px solid #444;
                border-radius: 4px;
                margin-bottom: 10px;
              ">
              <div id="misumi-search-results" style="margin-top: 8px;"></div>
            </div>

            <!-- BOM Tab -->
            <div class="tab-content bom" style="display: none;">
              <div style="font-weight: bold; margin-bottom: 10px; color: #58a6ff;">Bill of Materials</div>
              <div id="misumi-bom-items" style="margin-bottom: 12px;"></div>
              <div style="background: #2d2d2d; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                <div>Items: <span id="misumi-bom-count">0</span></div>
                <div>Est. Cost: <span id="misumi-bom-total">$0</span></div>
              </div>
              <button onclick="window.cycleCAD.misumi._exportBOM('csv')" style="
                width: 100%;
                padding: 8px;
                background: #444;
                color: #e0e0e0;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                margin-bottom: 6px;
              ">Export CSV</button>
              <button onclick="window.cycleCAD.misumi._clearBOM()" style="
                width: 100%;
                padding: 8px;
                background: #333;
                color: #e0e0e0;
                border: none;
                border-radius: 4px;
                cursor: pointer;
              ">Clear BOM</button>
            </div>
          </div>
        </div>
      `;
    },

    // Internal UI helpers
    _expandCategory(catName) {
      const cat = COMPONENT_DB[catName];
      if (!cat) return;
      const container = document.getElementById('misumi-category-items');
      container.innerHTML = '';
      for (const [typeKey, typeVal] of Object.entries(cat)) {
        const card = document.createElement('div');
        card.style.cssText = 'padding: 10px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px; margin-bottom: 8px; cursor: pointer;';
        card.innerHTML = `
          <div style="font-weight: bold; color: #58a6ff;">${typeVal.name}</div>
          <div style="font-size: 11px; color: #888; margin-top: 4px;">${typeVal.description}</div>
        `;
        card.onclick = () => alert(`${typeVal.name}: ${typeVal.description}\n\nSubtypes: ${Object.keys(typeVal.subtypes).join(', ')}`);
        container.appendChild(card);
      }
    },

    _executeConfig() {
      const cat = document.getElementById('misumi-cat-sel')?.value;
      const type = document.getElementById('misumi-type-sel')?.value;
      if (!cat || !type) return alert('Please select category and type');

      const result = this.configure(cat, type, { diameter: 10, length: 100, subtype: Object.keys(COMPONENT_DB[cat]?.[type]?.subtypes || {})[0] });
      if (result) {
        this.addToBOM(result.misumiPN, 1);
        const resultDiv = document.getElementById('misumi-config-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `<strong>${result.misumiPN}</strong><br>$${result.priceUSD} (${result.priceTokens} tokens)<br><a href="${result.misumiUrl}" target="_blank" style="color: #58a6ff; text-decoration: none;">View on MISUMI</a>`;
      }
    },

    _exportBOM(format) {
      const csv = this.exportBOM(format);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cyclecad-bom-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
    },

    _clearBOM() {
      if (confirm('Clear entire BOM?')) {
        this.clearBOM();
        this._updateBOMUI();
      }
    },

    _updateBOMUI() {
      const bom = this.getBOM();
      const total = this.getBOMTotal();
      document.getElementById('misumi-bom-count').textContent = total.itemCount;
      document.getElementById('misumi-bom-total').textContent = `$${total.estimatedUSD}`;

      const itemsDiv = document.getElementById('misumi-bom-items');
      itemsDiv.innerHTML = bom.map(item => `
        <div style="padding: 8px; background: #2d2d2d; border-radius: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: bold;">${item.misumiPN}</div>
            <div style="font-size: 11px; color: #888;">Qty: ${item.quantity}</div>
          </div>
          <button onclick="window.cycleCAD.misumi.removeFromBOM('${item.misumiPN}'); window.cycleCAD.misumi._updateBOMUI();" style="
            padding: 4px 8px;
            background: #444;
            color: #e0e0e0;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
          ">Remove</button>
        </div>
      `).join('');
    }
  };

  // Register as window.cycleCAD.misumi
  if (!window.cycleCAD) window.cycleCAD = {};
  window.cycleCAD.misumi = MisumiCatalog;

  console.log('[MISUMI Catalog] Loaded. Use window.cycleCAD.misumi.configure(...) to get started.');
})();

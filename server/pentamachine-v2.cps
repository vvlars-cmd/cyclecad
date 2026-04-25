/**
 * pentamachine-v2.cps — Fusion 360 / HSMWorks post-processor for Pentamachine V2.
 *
 * DRAFT. Matches the Pentacad browser post-processor dialect by construction.
 *
 * Install: Fusion 360 → Manage → Post Library → Import Post.
 * Select this .cps file. It appears as "Pentamachine V2" under the vendor list.
 *
 * Dialect (matches Matt's sample .ngc files):
 *   - G20 imperial default (G21 metric via unit switcher in Fusion)
 *   - G17 XY workplane, G90 absolute, G54 WCS default
 *   - G94 feed-per-minute, G93 inverse-time ONLY when A or B moves
 *   - A-axis tilt, B-axis continuous rotary
 *   - Spindle M3/M4/M5, coolant M7/M8/M9
 *   - Tool change Tn M6 followed by M3 S<rpm> M7/M8
 *
 * License: AGPL-3.0 (same as Pentacad).
 *
 * @version 1.0.0-draft
 * @vendor  Penta Machine Company (unofficial, Pentacad-generated)
 */

/* globals describe, setFormat, createFormat, createOutputVariable, createWriter, ... */

description   = "Pentamachine V2";
vendor        = "Penta Machine Company";
vendorUrl     = "https://www.pentamachine.com";
legal         = "Copyright (C) Pentacad contributors — AGPL-3.0";
certificationLevel = 2;
minimumRevision = 45845;

longDescription = "5-axis CAM post for Pentamachine V2 family (V2-10, V2-50CHB, V2-50CHK). A-tilt + B-rotary table kinematics. Matches Matt's sample .ngc dialect: G20 inch, G93 inverse-time for 5-axis, G54 WCS, 40k RPM spindle.";

extension = "ngc";
programNameIsInteger = false;
setCodePage("ascii");

capabilities = CAPABILITY_MILLING;
tolerance = 0.002;

minimumChordLength    = spatial(0.01, MM);
minimumCircularRadius = spatial(0.01, MM);
maximumCircularRadius = spatial(1000, MM);
minimumCircularSweep  = toRad(0.01);
maximumCircularSweep  = toRad(180);
allowHelicalMoves = true;
allowedCircularPlanes = 1 << PLANE_XY;

// User-editable properties (exposed in Fusion's post dialog).
properties = {
  writeMachine: true,
  writeTools: true,
  useG28: false,
  useSmoothing: false,
  useCoolant: true,
  showSequenceNumbers: true,
  sequenceNumberStart: 10,
  sequenceNumberIncrement: 5,
  useInverseTime: true,         // G93 on 5-axis moves
  optionalStop: true,
  separateWordsWithSpace: true
};

var numberOfSections = 0;

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------
var gFormat = createFormat({ prefix: "G", decimals: 0 });
var mFormat = createFormat({ prefix: "M", decimals: 0 });
var hFormat = createFormat({ prefix: "H", decimals: 0 });
var dFormat = createFormat({ prefix: "D", decimals: 0 });
var tFormat = createFormat({ prefix: "T", decimals: 0 });
var sFormat = createFormat({ prefix: "S", decimals: 0, scale: 1.0 });
var pFormat = createFormat({ prefix: "P", decimals: 3 });
var rpmFormat = createFormat({ decimals: 0 });
var xyzFormat = createFormat({ decimals: 4, forceDecimal: true });
var abcFormat = createFormat({ decimals: 3, forceDecimal: true, scale: DEG });
var feedFormat = createFormat({ decimals: 1, forceDecimal: true });
var invTimeFormat = createFormat({ decimals: 3, forceDecimal: true });

var xOutput = createOutputVariable({ prefix: "X" }, xyzFormat);
var yOutput = createOutputVariable({ prefix: "Y" }, xyzFormat);
var zOutput = createOutputVariable({ prefix: "Z" }, xyzFormat);
var aOutput = createOutputVariable({ prefix: "A" }, abcFormat);
var bOutput = createOutputVariable({ prefix: "B" }, abcFormat);
var feedOutput = createOutputVariable({ prefix: "F" }, feedFormat);
var sOutput = createOutputVariable({ prefix: "S", control: CONTROL_FORCE }, sFormat);
var tOutput = createOutputVariable({ prefix: "T", control: CONTROL_FORCE }, tFormat);

// ---------------------------------------------------------------------------
// Program header
// ---------------------------------------------------------------------------
function onOpen() {
  if (properties.showSequenceNumbers) {
    setWriter(writer);
    writer.setSequenceNumberOffset(properties.sequenceNumberStart);
    writer.setSequenceNumberIncrement(properties.sequenceNumberIncrement);
  }

  writeln("%");
  writeComment("AXIS,stop");
  if (programName) writeComment("PROGRAM: " + programName);
  writeComment("PENTACAD / PENTAMACHINE V2 POST — " + description);
  writeComment("CREATED: " + new Date().toISOString());
  writeComment("FUSION 360 REV: " + getGlobalParameter("revision", "unknown"));

  // Units — G20 inch default
  writeBlock(gFormat.format(unit === IN ? 20 : 21));
  writeBlock(gFormat.format(17), gFormat.format(90), gFormat.format(40), gFormat.format(54));
  writeBlock(gFormat.format(94));   // feed per minute default

  if (properties.writeTools && hasToolList) {
    var tools = getToolTable();
    if (tools.getNumberOfTools() > 0) {
      for (var i = 0; i < tools.getNumberOfTools(); i++) {
        var t = tools.getTool(i);
        writeComment(
          "T" + t.number + ": " +
          getToolTypeName(t.type) + " Ø" + xyzFormat.format(t.diameter) +
          " × " + xyzFormat.format(t.fluteLength) + " " + (unit === IN ? "in" : "mm") +
          (t.numberOfFlutes ? " (" + t.numberOfFlutes + " flutes)" : "")
        );
      }
    }
  }
}

function onComment(text) {
  writeComment(text);
}

// ---------------------------------------------------------------------------
// Per-section setup
// ---------------------------------------------------------------------------
function onSection() {
  numberOfSections += 1;

  var insertToolCall = isFirstSection() ||
    currentSection.getForceToolChange && currentSection.getForceToolChange() ||
    (tool.number !== getPreviousSection().getTool().number);

  if (insertToolCall) {
    writeComment("OP " + numberOfSections + ": " + (currentSection.hasParameter("operation-comment") ? currentSection.getParameter("operation-comment") : ""));
    writeBlock(tOutput.format(tool.number), mFormat.format(6));
    writeBlock(mFormat.format(tool.clockwise ? 3 : 4), sOutput.format(tool.spindleRPM));
    if (properties.useCoolant) {
      if (tool.coolant === COOLANT_FLOOD) writeBlock(mFormat.format(8));
      else if (tool.coolant === COOLANT_MIST) writeBlock(mFormat.format(7));
    }
  }

  // WCS
  var wcs = currentSection.workOffset;
  if (wcs) writeBlock(gFormat.format(wcs));

  // Initial position
  var initial = getFramePosition(currentSection.getInitialPosition());
  writeBlock(gFormat.format(0), xOutput.format(initial.x), yOutput.format(initial.y), zOutput.format(initial.z));
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------
function onLinear(x, y, z, feed) {
  writeBlock(gFormat.format(1),
    xOutput.format(x), yOutput.format(y), zOutput.format(z),
    feedOutput.format(feed));
}

function onRapid(x, y, z) {
  writeBlock(gFormat.format(0),
    xOutput.format(x), yOutput.format(y), zOutput.format(z));
}

function onLinear5D(x, y, z, a, b, c, feed) {
  if (properties.useInverseTime) {
    // Inverse time feed: 1/t where t is move duration in minutes. Fusion provides this.
    var inv = currentSection.getInverseTimeFeed();
    writeBlock(gFormat.format(93));
    writeBlock(gFormat.format(1),
      xOutput.format(x), yOutput.format(y), zOutput.format(z),
      aOutput.format(a), bOutput.format(b),
      createOutputVariable({ prefix: "F", control: CONTROL_FORCE }, invTimeFormat).format(inv));
    writeBlock(gFormat.format(94));   // back to per-minute
  } else {
    writeBlock(gFormat.format(1),
      xOutput.format(x), yOutput.format(y), zOutput.format(z),
      aOutput.format(a), bOutput.format(b),
      feedOutput.format(feed));
  }
}

function onCircular(clockwise, cx, cy, cz, x, y, z, feed) {
  var start = getCurrentPosition();
  writeBlock(
    gFormat.format(clockwise ? 2 : 3),
    xOutput.format(x), yOutput.format(y), zOutput.format(z),
    createOutputVariable({ prefix: "I" }, xyzFormat).format(cx - start.x),
    createOutputVariable({ prefix: "J" }, xyzFormat).format(cy - start.y),
    feedOutput.format(feed)
  );
}

// ---------------------------------------------------------------------------
// Dwell / spindle / coolant
// ---------------------------------------------------------------------------
function onDwell(seconds) {
  writeBlock(gFormat.format(4), pFormat.format(seconds));
}

function onSpindleSpeed(rpm) {
  writeBlock(sOutput.format(rpm));
}

function onCoolant(on) {
  if (!properties.useCoolant) return;
  if (on === COOLANT_FLOOD) writeBlock(mFormat.format(8));
  else if (on === COOLANT_MIST) writeBlock(mFormat.format(7));
  else writeBlock(mFormat.format(9));
}

// ---------------------------------------------------------------------------
// End program
// ---------------------------------------------------------------------------
function onClose() {
  writeBlock(gFormat.format(94));   // ensure per-minute before end
  writeBlock(mFormat.format(9));    // coolant off
  writeBlock(mFormat.format(5));    // spindle off
  if (properties.useG28) writeBlock(gFormat.format(28));
  writeBlock(mFormat.format(30));
  writeln("%");
}

// Low-level helpers (usually provided by the Autodesk post engine; shown here for clarity)
function writeComment(text) { writeln("(" + String(text).replace(/[()]/g, "") + ")"); }
function writeBlock() {
  var args = Array.prototype.slice.call(arguments).filter(function(a){ return a != null && a !== ""; });
  if (args.length === 0) return;
  var sep = properties.separateWordsWithSpace ? " " : "";
  writeln(args.join(sep));
}
function isFirstSection() { return numberOfSections === 1; }
function getPreviousSection() { return getSection(numberOfSections - 2); }

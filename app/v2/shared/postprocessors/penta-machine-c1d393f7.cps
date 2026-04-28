/**
  Copyright (C) 2012-2026 by Autodesk, Inc.
  All rights reserved.

  Penta Machine post processor configuration.

  $Revision: 44221 b726d042f4ff491778a5644fb3dc3d931aa51946 $
  $Date: 2026-04-09 06:41:28 $

  FORKID {AE92A0B9-5738-4278-A190-CC7AAD422574}
*/

description = "Penta Machine";
vendor = "Penta Machine";
vendorUrl = "https://www.pentamachine.com/";
legal = "Copyright (C) 2012-2026 by Autodesk, Inc.";
certificationLevel = 2;
minimumRevision = 45917;

longDescription = "Post processor for all Penta Machine milling machines. Supports the following models:" + EOL + EOL +
  "Solo, Pocket NC V2-50, Pocket NC V2-10, Pocket NC V2-8L, Pocket NC V1" + EOL + EOL +
  "You must select your machine configuration to post process your G code for the appropriate machine. " +
  "Pocket NC V2-8L and Pocket NC V1 machines default to no TCPC support. " +
  "If your V2-8L has the advanced software upgrade or your V1 has been upgraded to Kinetic Control, you must edit your " +
  "Machine Configuration and under Kinematics select each of the rotary axes and check the TCP checkbox in order to use TCPC.";

extension = "ngc";
setCodePage("ascii");

capabilities = CAPABILITY_MILLING | CAPABILITY_MACHINE_SIMULATION;
tolerance = spatial(0.002, MM);
if (typeof revision == "number" && typeof supportedFeatures != "undefined") {
  supportedFeatures |= revision >= 50328 ? FEATURE_MACHINE_ROTARY_ANGLES : 0;
}

minimumChordLength = spatial(0.25, MM);
minimumCircularRadius = spatial(0.01, MM);
maximumCircularRadius = spatial(1000, MM);
minimumCircularSweep = toRad(0.01);
maximumCircularSweep = toRad(180);
allowHelicalMoves = true;
allowedCircularPlanes = undefined; // allow any circular motion
highFeedMapping = HIGH_FEED_MAP_ANY;
highFeedrate = (unit == MM) ? 10000 : 500;

// user-defined properties
properties = {
  showSequenceNumbers: {
    title      : "Use sequence numbers",
    description: "'Yes' outputs sequence numbers on each block, 'Only on tool change' outputs sequence numbers on tool change blocks only, and 'No' disables the output of sequence numbers.",
    group      : "formats",
    type       : "enum",
    values     : [
      {title:"Yes", id:"true"},
      {title:"No", id:"false"},
      {title:"Only on tool change", id:"toolChange"}
    ],
    value: "false",
    scope: "post"
  },
  sequenceNumberStart: {
    title      : "Start sequence number",
    description: "The number at which to start the sequence numbers.",
    group      : "formats",
    type       : "integer",
    value      : 10,
    scope      : "post"
  },
  sequenceNumberIncrement: {
    title      : "Sequence number increment",
    description: "The amount by which the sequence number is incremented by in each block.",
    group      : "formats",
    type       : "integer",
    value      : 5,
    scope      : "post"
  },
  optionalStop: {
    title      : "Optional stop",
    description: "Outputs optional stop code during when necessary in the code.",
    group      : "preferences",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  separateWordsWithSpace: {
    title      : "Separate words with space",
    description: "Adds spaces between words if 'yes' is selected.",
    group      : "formats",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  useRadius: {
    title      : "Radius arcs",
    description: "If yes is selected, arcs are outputted using radius values rather than IJK.",
    group      : "preferences",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  showNotes: {
    title      : "Show notes",
    description: "Writes operation notes as comments in the outputted code.",
    group      : "formats",
    type       : "boolean",
    value      : false,
    scope      : "post"
  },
  smoothingTolerance: {
    title      : "Smoothing tolerance",
    description: "Smoothing tolerance (-1 for disabled).",
    group      : "preferences",
    type       : "number",
    value      : -1,
    scope      : "post"
  },
  useParkPositionOperation: {
    title      : "Go home between operations",
    description: "Make sure the machine goes home between operations if the A axis changes more than the Maximum A axis change property. If disabled, make sure that the part wont collide with the tool.",
    group      : "homePositions",
    type       : "boolean",
    value      : true,
    scope      : "post"
  },
  maximumAAxisChange: {
    title      : "Maximum A axis change",
    description: "The maximum A axis change that is allowed before the machine will be forced home.",
    group      : "multiAxis",
    type       : "number",
    value      : 20,
    scope      : "post"
  },
  safePositionMethod: {
    title      : "Safe Retracts",
    description: "Select your desired retract option. 'Clearance Height' retracts to the operation clearance height.",
    group      : "homePositions",
    type       : "enum",
    values     : [
      {title:"G28", id:"G28"},
      {title:"G53", id:"G53"},
      {title:"Clearance Height", id:"clearanceHeight"}
    ],
    value: "G53",
    scope: "post"
  },
  useTiltedWorkplane: {
    title      : "Rotated Work Offsets WCS",
    description: "Which work coordinate system to use when rotated work offsets are used. This must be different than any active work coordinate systems to avoid overwriting them.",
    group      : "multiAxis",
    type       : "enum",
    values     : [
      {title:"Disabled", id:"disabled"},
      {title:"1 (G54)", id:"1"},
      {title:"2 (G55)", id:"2"},
      {title:"3 (G56)", id:"3"},
      {title:"4 (G57)", id:"4"},
      {title:"5 (G58)", id:"5"},
      {title:"6 (G59)", id:"6"},
      {title:"7 (G59.1)", id:"7"},
      {title:"8 (G59.2)", id:"8"},
      {title:"9 (G59.3)", id:"9"}
    ],
    value: "9",
    scope: "post"
  },
  showToolNumberPopup: {
    title      : "Show Tool Number Popup",
    description: "Adds an M700 Txx prior to a tool change which displays a popup dialog on the Kinetic Control (requires v5.1.0 or higher).",
    group      : "formats",
    type       : "boolean",
    value      : false,
    scope      : "post"
  }
};

// wcs definiton
wcsDefinitions = {
  useZeroOffset: false,
  wcs          : [
    {name:"Standard", format:"G", range:[54, 59]},
    {name:"Extended", format:"G59.", range:[1, 3]}
  ]
};

var gFormat = createFormat({prefix:"G", decimals:1});
var mFormat = createFormat({prefix:"M", decimals:1});
var hFormat = createFormat({prefix:"H", decimals:1});
var diameterOffsetFormat = createFormat({prefix:"D", decimals:1});

var xyzFormat = createFormat({decimals:(unit == MM ? 3 : 4), type:FORMAT_REAL});
var rFormat = xyzFormat; // radius
var abcFormat = createFormat({decimals:3, type:FORMAT_REAL, scale:DEG});
var feedFormat = createFormat({decimals:(unit == MM ? 2 : 3), type:FORMAT_REAL});
var inverseTimeFormat = createFormat({decimals:4, type:FORMAT_REAL});
var pitchFormat = createFormat({decimals:(unit == MM ? 3 : 4), type:FORMAT_REAL});
var toolFormat = createFormat({decimals:0});
var rpmFormat = createFormat({decimals:0});
var secFormat = createFormat({decimals:3, type:FORMAT_REAL}); // seconds - range 0.001-99999.999
var taperFormat = createFormat({decimals:1, scale:DEG});

var xOutput = createOutputVariable({onchange:function () {state.retractedX = false;}, prefix:"X"}, xyzFormat);
var yOutput = createOutputVariable({onchange:function () {state.retractedY = false;}, prefix:"Y"}, xyzFormat);
var zOutput = createOutputVariable({onchange:function () {state.retractedZ = false;}, prefix:"Z"}, xyzFormat);
var aOutput = createOutputVariable({prefix:"A"}, abcFormat);
var bOutput = createOutputVariable({prefix:"B"}, abcFormat);
var cOutput = createOutputVariable({prefix:"C"}, abcFormat);
var feedOutput = createOutputVariable({prefix:"F"}, feedFormat);
var inverseTimeOutput = createOutputVariable({prefix:"F", control:CONTROL_FORCE}, inverseTimeFormat);
var sOutput = createOutputVariable({prefix:"S", control:CONTROL_FORCE}, rpmFormat);

// circular output
var iOutput = createOutputVariable({prefix:"I", control:CONTROL_FORCE}, xyzFormat);
var jOutput = createOutputVariable({prefix:"J", control:CONTROL_FORCE}, xyzFormat);
var kOutput = createOutputVariable({prefix:"K", control:CONTROL_FORCE}, xyzFormat);

var gMotionModal = createOutputVariable({onchange:function() {if (skipBlocks) {forceModals(gMotionModal);}}}, gFormat); // modal group 1 // G0-G3, ...
var gPlaneModal = createOutputVariable({onchange:function() {if (skipBlocks) {forceModals(gPlaneModal);} forceModals(gMotionModal);}}, gFormat); // modal group 2 // G17-19
var gAbsIncModal = createOutputVariable({onchange:function() {if (skipBlocks) {forceModals(gAbsIncModal);}}}, gFormat); // modal group 3 // G90-91
var gFeedModeModal = createOutputVariable({}, gFormat); // modal group 5 // G93-94
var gUnitModal = createOutputVariable({}, gFormat); // modal group 6 // G20-21
var gCycleModal = createOutputVariable({}, gFormat); // modal group 9 // G81, ...
var gRetractModal = createOutputVariable({}, gFormat); // modal group 10 // G98-99

var mTCPModal = createOutputVariable({}, mFormat); // M428, M429
var toolLengthCompOutput = createOutputVariable({control : CONTROL_FORCE,
  onchange: function() {
    state.lengthCompensationActive = toolLengthCompOutput.getCurrent() != 49;
  }
}, gFormat);
var fourthAxisClamp = createOutputVariable({}, mFormat);
var fifthAxisClamp = createOutputVariable({}, mFormat);

var settings = {
  coolant: {
    // samples:
    // {id: COOLANT_THROUGH_TOOL, on: 88, off: 89}
    // {id: COOLANT_THROUGH_TOOL, on: [8, 88], off: [9, 89]}
    // {id: COOLANT_THROUGH_TOOL, on: "M88 P3 (myComment)", off: "M89"}
    coolants: [
      {id:COOLANT_FLOOD, on:8},
      {id:COOLANT_MIST, on:7},
      {id:COOLANT_THROUGH_TOOL},
      {id:COOLANT_AIR, on:"M64 P60 ; air blast on", off:"M65 P60 ; air blast off"},
      {id:COOLANT_AIR_THROUGH_TOOL},
      {id:COOLANT_SUCTION},
      {id:COOLANT_FLOOD_MIST},
      {id:COOLANT_FLOOD_THROUGH_TOOL},
      {id:COOLANT_OFF, off:9}
    ],
    singleLineCoolant: false, // specifies to output multiple coolant codes in one line rather than in separate lines
  },
  retract: {
    cancelRotationOnRetracting: false, // specifies that rotations (G68) need to be canceled prior to retracting
    methodXY                  : "G53", // special condition, overwrite retract behavior per axis
    methodZ                   : undefined, // special condition, overwrite retract behavior per axis
    useZeroValues             : ["G28", "G30"], // enter property value id(s) for using "0" value instead of machineConfiguration axes home position values (ie G30 Z0)
    homeXY                    : {onIndexing:false, onToolChange:false, onProgramEnd:{axes:[X, Y]}} // Specifies when the machine should be homed in X/Y. Sample: onIndexing:{axes:[X, Y], singleLine:false}
  },
  parametricFeeds: {
    firstFeedParameter    : 100, // specifies the initial parameter number to be used for parametric feedrate output
    feedAssignmentVariable: "#", // specifies the syntax to define a parameter
    feedOutputVariable    : "F#" // specifies the syntax to output the feedrate as parameter
  },
  unwind: {
    method        : 2, // 1 (move to closest 0 (G28)) or 2 (table does not move (G92))
    codes         : [mFormat.format(999)], // formatted code(s) that will (virtually) unwind axis (G90 G28), (G92), etc.
    workOffsetCode: "", // prefix for workoffset number if it is required to be output
    useAngle      : "prefix", // 'true' outputs angle with standard output variable, 'prefix' uses 'anglePrefix', 'false' does not output angle
    anglePrefix   : ["", "P", "P"], // optional prefixes for output angles specified as ["", "", "C"], use blank string if axis does not unwind
    resetG90      : false // set to 'true' if G90 needs to be output after the unwind block
  },
  machineAngles: { // refer to https://cam.autodesk.com/posts/reference/classMachineConfiguration.html#a14bcc7550639c482492b4ad05b1580c8
    controllingAxis: ABC,
    type           : PREFER_PREFERENCE,
    options        : ENABLE_ALL
  },
  workPlaneMethod: {
    useTiltedWorkplane    : false, // specifies that tilted workplanes should be used (ie. G68.2, G254, PLANE SPATIAL, CYCLE800), can be overwritten by property
    eulerConvention       : undefined, // specifies the euler convention (ie EULER_XYZ_R), set to undefined to use machine angles for TWP commands ('undefined' requires machine configuration)
    eulerCalculationMethod: "standard", // ('standard' / 'machine') 'machine' adjusts euler angles to match the machines ABC orientation, machine configuration required
    cancelTiltFirst       : false, // cancel tilted workplane prior to WCS (G54-G59) blocks
    forceMultiAxisIndexing: false, // force multi-axis indexing for 3D programs
    optimizeType          : OPTIMIZE_AXIS // can be set to OPTIMIZE_NONE, OPTIMIZE_BOTH, OPTIMIZE_TABLES, OPTIMIZE_HEADS, OPTIMIZE_AXIS. 'undefined' uses legacy rotations
  },
  comments: {
    permittedCommentChars: " abcdefghijklmnopqrstuvwxyz0123456789.,=_-", // letters are not case sensitive, use option 'outputFormat' below. Set to 'undefined' to allow any character
    prefix               : "(", // specifies the prefix for the comment
    suffix               : ")", // specifies the suffix for the comment
    outputFormat         : "upperCase", // can be set to "upperCase", "lowerCase" and "ignoreCase". Set to "ignoreCase" to write comments without upper/lower case formatting
    maximumLineLength    : 80 // the maximum number of characters allowed in a line, set to 0 to disable comment output
  },
  probing: {
    macroCall              : undefined, // specifies the command to call a macro
    probeAngleMethod       : "OFF", // supported options are: OFF, AXIS_ROT, G68, G54.4
    allowIndexingWCSProbing: true // specifies that probe WCS with tool orientation is supported
  },
  maximumSequenceNumber: 99999, // the maximum sequence number (Nxxx), use 'undefined' for unlimited
  polarCycleExpandMode : 1 // 0=EXPAND_NONE: Does not expand any cycles. 1=EXPAND_TCP: Expands drilling cycles, when TCP is on. 2=EXPAND_NON_TCP: Expands drilling cycles, when TCP is off. 3=EXPAND_ALL: Expands all drilling cycles
};

function defineMachine() {
  if (!receivedMachineConfiguration) {
    error(localize("This post processor requires a Machine Definition.  Assign the proper Penta Machine from the Fusion Machine Library to the Setup."));
  }

  if (true) { // set to false to disable the warning message below
    var axes = [machineConfiguration.getAxisU(), machineConfiguration.getAxisV(), machineConfiguration.getAxisW()];
    for (var i in axes) {
      if (machineConfiguration.isTableConfiguration() && axes[i].isEnabled() && axes[i].getOffset().isNonZero() && !axes[i].isTCPEnabled()) {
        warning(localize("A rotary axis offset is defined in the machine configuration on a non-TCP machine which will influence the NC output." + EOL +
        "The setup origin should be defined appropriately, probably at the table center, and not at the center of the rotary axes."));
        break;
      }
    }
  }
}

function onOpen() {
  // define and enable machine configuration
  receivedMachineConfiguration = machineConfiguration.isReceived();
  if (typeof defineMachine == "function") {
    defineMachine(); // hardcoded machine configuration
  }
  activateMachine(); // enable the machine optimizations and settings
  settings.workPlaneMethod.useTiltedWorkplane = settings.workPlaneMethod.useTiltedWorkplane != "disabled";

  // disable M999
  if (!machineConfiguration.getAxisV().isEnabled() || machineConfiguration.getAxisV().getReset() == 0) { // disable M999
    settings.unwind = undefined;
  }

  if (getProperty("useRadius")) {
    maximumCircularSweep = toRad(90); // avoid potential center calculation errors for CNC
  }
  mTCPModal.format(429); // default to TCP off

  if (!getProperty("separateWordsWithSpace")) {
    setWordSeparator("");
  }

  writeln("%");
  writeln("(AXIS,stop)"); // disable LinuxCNC visualization
  writeComment(programName);
  writeComment(programComment);
  writeProgramHeader();

  // absolute coordinates, feed per min, and incremental arc center mode
  writeBlock(gUnitModal.format(unit == MM ? 21 : 20));
  writeBlock(gAbsIncModal.format(90), gFeedModeModal.format(94), gFormat.format(40), gPlaneModal.format(17), gFormat.format(91.1));
  validateCommonParameters();
}

function getOffsetCode() {
  if (!getSetting("outputToolLengthCompensation", true) && toolLengthCompOutput.isEnabled()) {
    state.lengthCompensationActive = true; // always assume that length compensation is active
    toolLengthCompOutput.disable();
  }
  var offsetCode = 43;
  return toolLengthCompOutput.format(offsetCode);
}

/** Disables length compensation if currently active or if forced. */
function disableLengthCompensation(force) {
  if (state.lengthCompensationActive || force) {
    if (force) {
      toolLengthCompOutput.reset();
    }
    writeBlock(toolLengthCompOutput.format(49));
  }
}

function setTCP(_tcp) {
  if (tcp.isSupportedByOperation) {
    if (_tcp) {
      validate(state.lengthCompensationActive, "Length compensation must be active when enabling TCP.");
      writeBlock(mTCPModal.format(428));
    } else {
      writeBlock(mTCPModal.format(429));
    }
    state.tcpIsActive = _tcp;
    machineSimulation({}); // update machine simulation TCP state
  }
}

var currentWorkPlaneABC = undefined;
function forceWorkPlane() {
  currentWorkPlaneABC = undefined;
}

function cancelWorkPlane() {
}

function setWorkPlane(abc) {
  if (!machineConfiguration.isMultiAxisConfiguration()) {
    return; // ignore
  }

  if (!((currentWorkPlaneABC == undefined) ||
        abcFormat.areDifferent(abc.x, currentWorkPlaneABC.x) ||
        abcFormat.areDifferent(abc.y, currentWorkPlaneABC.y) ||
        abcFormat.areDifferent(abc.z, currentWorkPlaneABC.z) ||
        (settings.workPlaneMethod.useTiltedWorkplane && (abc.isNonZero() || state.twpIsActive))
  )) {
    return; // no change
  }

  if (state.twpIsActive) {
    if (currentWorkOffset != undefined) {
      writeBlock(getWCSCode(currentWorkOffset));
      state.twpIsActive = false;
      machineSimulation({}); // update machine simulation TWP state
    }
  }

  if (getProperty("useParkPositionOperation") && (getCurrentSectionId() >= 0)) { // only if we are between operations
    var aDelta = Math.abs(abc.x - (currentWorkPlaneABC ? currentWorkPlaneABC.x : 0));
    if (aDelta > toRad(getProperty("maximumAAxisChange"))) {
      setTCP(false);
      writeRetract(X, Y);
    }
  }

  positionABC(abc, true);

  if (abc.isNonZero()) {
    if (settings.workPlaneMethod.useTiltedWorkplane) {
      writeBlock(mFormat.format(254), "P" + getProperty("useTiltedWorkplane"));
      var dwcs = parseInt(getProperty("useTiltedWorkplane"), 10);
      writeBlock(getWCSCode(dwcs));
      state.twpIsActive = true;
      machineSimulation({}); // update machine simulation TWP state
    }
  } else if (state.twpIsActive && (currentWorkOffset != undefined)) {
    writeBlock(getWCSCode(currentWorkOffset)); // G54->G59
    state.twpIsActive = false;
    machineSimulation({}); // update machine simulation TWP state
  }

  onCommand(COMMAND_LOCK_MULTI_AXIS);

  currentWorkPlaneABC = abc;
}

function getWCSCode(workOffset) {
  var wcsCode = "";
  var workOffset = workOffset == 0 ? 1 : workOffset;
  var maximumWCSNumber = 9;
  validate(workOffset <= maximumWCSNumber, subst("Work offset %1 is out of range, maximum value is %2.", workOffset, maximumWCSNumber));
  if (workOffset > 6) {
    var p = workOffset - 6; // 1->...
    gMotionModal.reset();
    wcsCode = formatWords(gFormat.format(59 + (p / 10)), gMotionModal.format(0)); // G59.1->G59.3
  } else {
    gMotionModal.reset();
    wcsCode = formatWords(gFormat.format(53 + workOffset), gMotionModal.format(0)); // G54->G59
  }
  return wcsCode;
}

function writeWCS(section) {
  var workOffset = section.workOffset == 0 ? 1 : section.workOffset;
  currentWorkOffset = undefined; // force work offset
  if (workOffset > 0 && workOffset != currentWorkOffset) {
    if (settings.workPlaneMethod.useTiltedWorkplane && (workOffset == parseInt(getProperty("useTiltedWorkplane"), 10))) {
      error(localize("You cannot use the same WCS as the 'Rotated Work Offsets WCS.'"));
    }
    writeBlock(getWCSCode(workOffset));
    currentWorkOffset = workOffset;
    state.twpIsActive = false;
    machineSimulation({}); // update machine simulation TWP state
  }
}

function writeInitialPositioning(position, isRequired, codes1, codes2) {
  var motionCode = {single:0, multi:0};
  switch (highFeedMapping) {
  case HIGH_FEED_MAP_ANY:
    motionCode = {single:1, multi:1}; // map all rapid traversals to high feed
    break;
  case HIGH_FEED_MAP_MULTI:
    motionCode = {single:0, multi:1}; // map rapid traversal along more than one axis to high feed
    break;
  }
  var feed = (highFeedMapping != HIGH_FEED_NO_MAPPING) ? getFeed(highFeedrate) : "";
  var hOffset = getSetting("outputToolLengthOffset", true) ? hFormat.format(tool.lengthOffset) : "";
  var additionalCodes = [formatWords(codes1), formatWords(codes2)];

  // tool length compensation needs to be enabled prior to enabling TCP
  if (!state.lengthCompensationActive) {
    writeBlock(getOffsetCode(), hOffset);
  }

  forceModals(gMotionModal);
  writeStartBlocks(isRequired, function() {
    var modalCodes = formatWords(gAbsIncModal.format(90), gPlaneModal.format(17));
    // multi axis prepositioning
    if (currentSection.isMultiAxis() && tcp.isSupportedByOperation) {
      var words = formatWords(
        gFormat.format(6.2),
        "X" + xyzFormat.format(position.x),
        "Y" + xyzFormat.format(position.y),
        "Z" + xyzFormat.format(position.z)
      );
      var W = machineConfiguration.isMultiAxisConfiguration() ? machineConfiguration.getOrientation(getCurrentDirection()) :
        Matrix.getOrientationFromDirection(getCurrentDirection());
      var prePosition = W.getTransposed().multiply(position);

      // machineSimulation({mode:TWPON}); // G6.2 acts like an active TWP
      if (!state.retractedZ) {
        writeBlock(words, "I0", "J0", "K1", "P" + motionCode.single, feed);
        machineSimulation({z:prePosition.z, mode:TWPON});
      }
      writeBlock(words, "I1", "J1", "K0", "P" + motionCode.multi, feed, additionalCodes);
      machineSimulation({x:prePosition.x, y:prePosition.y, mode:TWPON});
      if (state.retractedZ) {
        writeBlock(words, "I0", "J0", "K1", "P" + motionCode.single, feed);
        machineSimulation({z:prePosition.z, mode:TWPON});
      }
      machineSimulation({});
    } else {
      if (machineConfiguration.isHeadConfiguration()) {
        writeBlock(modalCodes, gMotionModal.format(motionCode.multi),
          xOutput.format(position.x), yOutput.format(position.y), zOutput.format(position.z),
          feed, additionalCodes
        );
        machineSimulation({x:position.x, y:position.y, z:position.z});
      } else {
        writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(position.x), yOutput.format(position.y), feed, additionalCodes[0]);
        machineSimulation({x:position.x, y:position.y});
        writeBlock(gMotionModal.format(motionCode.single), zOutput.format(position.z), additionalCodes[1]);
        machineSimulation(tcp.isSupportedByOperation ? {x:position.x, y:position.y, z:position.z} : {z:position.z});
      }
    }
    forceModals(gMotionModal);
    if (isRequired) {
      additionalCodes = []; // clear additionalCodes buffer
    }
  });

  validate(!validateLengthCompensation || state.lengthCompensationActive, "Tool length compensation is not active."); // make sure that lenght compensation is enabled
  if (!isRequired) { // simple positioning
    var modalCodes = formatWords(gAbsIncModal.format(90), gPlaneModal.format(17));
    forceXYZ();
    if (!state.retractedZ && xyzFormat.getResultingValue(getCurrentPosition().z) < xyzFormat.getResultingValue(position.z)) {
      writeBlock(modalCodes, gMotionModal.format(motionCode.single), zOutput.format(position.z), feed);
      machineSimulation({z:position.z});
    }
    writeBlock(modalCodes, gMotionModal.format(motionCode.multi), xOutput.format(position.x), yOutput.format(position.y), feed, additionalCodes);
    machineSimulation({x:position.x, y:position.y});
  }
  if (tcp.isSupportedByOperation) {
    setTCP(true);
  }
}

function onSection() {
  var forceSectionRestart = optionalSection && !currentSection.isOptional();
  optionalSection = currentSection.isOptional();
  var insertToolCall = isToolChangeNeeded("number") || forceSectionRestart;
  var newWorkOffset = isNewWorkOffset() || forceSectionRestart;
  var newWorkPlane = isNewWorkPlane() || forceSectionRestart || (typeof defineWorkPlane == "function" &&
    Vector.diff(defineWorkPlane(getPreviousSection(), false), defineWorkPlane(currentSection, false)).length > 1e-4);

  if (insertToolCall || newWorkOffset || newWorkPlane) {
    // stop spindle before retract during tool change
    if (insertToolCall && !isFirstSection()) {
      onCommand(COMMAND_STOP_SPINDLE);
    }
    // retract to safe plane
    setTCP(false);
    writeRetract(Z);
  }

  writeComment(getParameter("operation-comment", ""));

  if (getProperty("showNotes")) {
    writeSectionNotes();
  }

  // tool change
  writeToolCall(tool, insertToolCall);
  if (spindleSpeed < machineConfiguration.getMinimumSpindleSpeed() && tool.type != TOOL_PROBE) {
    warning(subst(localize("Spindle speed is less than minimum value of %1."), machineConfiguration.getMinimumSpindleSpeed()));
  }
  startSpindle(tool, insertToolCall);

  // write parametric feedrate table
  if (typeof initializeParametricFeeds == "function") {
    initializeParametricFeeds(insertToolCall);
  }
  // Output modal commands here
  writeBlock(gPlaneModal.format(17), gAbsIncModal.format(90), gFeedModeModal.format(94));

  // wcs
  if (insertToolCall) { // force work offset when changing tool
    currentWorkOffset = undefined;
  }
  writeWCS(currentSection);

  forceXYZ();

  var abc = defineWorkPlane(currentSection, true);

  // set coolant after we have positioned at Z
  setCoolant(tool.coolant);

  forceAny();
  gMotionModal.reset();

  // prepositioning
  var initialPosition = getFramePosition(currentSection.getInitialPosition());
  var isRequired = insertToolCall || state.retractedZ || !state.lengthCompensationActive || (!isFirstSection() && getPreviousSection().isMultiAxis());
  writeInitialPositioning(initialPosition, isRequired);

  if (getProperty("smoothingTolerance") > 0) {
    if (!isDrillingCycle()) {
      writeBlock(gFormat.format(64), "P" + xyzFormat.format(getProperty("smoothingTolerance")));
    }
  }

  if (isProbeOperation()) {
    writeBlock("o<probe-on> call");
  }
}

function onDwell(seconds) {
  var maxValue = 99999.999;
  if (seconds > maxValue) {
    warning(subst(localize("Dwelling time of '%1' exceeds the maximum value of '%2' in operation '%3'"), seconds, maxValue, getParameter("operation-comment", "")));
  }
  var saveFeedMode = gFeedModeModal.getCurrent();
  writeBlock(gFeedModeModal.format(94), gFormat.format(4), "P" + secFormat.format(seconds));
  writeBlock(gFeedModeModal.format(saveFeedMode));
}

function onSpindleSpeed(spindleSpeed) {
  writeBlock(sOutput.format(spindleSpeed));
}

function onCycle() {
  writeBlock(gPlaneModal.format(17));
}

function getCommonCycle(x, y, z, r) {
  forceXYZ(); // force xyz on first drill hole of any cycle
  if ((currentSection.getPolarMode && currentSection.getPolarMode() != POLAR_MODE_OFF) && currentSection.isMultiAxis()) {
    var polarPosition = getPolarPosition(x, y, z);
    return [xOutput.format(polarPosition.first.x), yOutput.format(polarPosition.first.y), zOutput.format(polarPosition.first.z),
      aOutput.format(polarPosition.second.x), bOutput.format(polarPosition.second.y), cOutput.format(polarPosition.second.z),
      "R" + xyzFormat.format(r)];
  } else {
    return [xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + xyzFormat.format(r)];
  }
}

function onCyclePoint(x, y, z) {
  if (isProbeOperation()) {
    writeProbeCycle(cycle, x, y, z);
  } else {
    writeDrillCycle(cycle, x, y, z);
  }
}

function writeDrillCycle(cycle, x, y, z) {
  if (!isSameDirection(machineConfiguration.getSpindleAxis(), getForwardDirection(currentSection))) {
    expandCyclePoint(x, y, z);
    return;
  }

  switch (cycleType) {
  case "tapping":
  case "left-tapping":
  case "right-tapping":
    cycleExpanded = true;
    repositionToCycleClearance(cycle, x, y, z);
    writeBlock(
      gAbsIncModal.format(90), gMotionModal.format((highFeedMapping != HIGH_FEED_NO_MAPPING) ? 1 : 0),
      gPlaneModal.getCurrent() == 17 ? zOutput.format(cycle.retract) : "",
      gPlaneModal.getCurrent() == 18 ? yOutput.format(cycle.retract) : "",
      gPlaneModal.getCurrent() == 19 ? xOutput.format(cycle.retract) : "",
      highFeedMapping != HIGH_FEED_NO_MAPPING ? getFeed(highFeedrate) : ""
    );
    writeBlock(
      gAbsIncModal.format(90), gFormat.format(33.1),
      gPlaneModal.getCurrent() == 17 ? zOutput.format(z) : "",
      gPlaneModal.getCurrent() == 18 ? yOutput.format(y) : "",
      gPlaneModal.getCurrent() == 19 ? xOutput.format(x) : "",
      "K" + pitchFormat.format(tool.threadPitch)
    );
    gMotionModal.reset();
    writeBlock(
      gAbsIncModal.format(90), gMotionModal.format((highFeedMapping != HIGH_FEED_NO_MAPPING) ? 1 : 0),
      gPlaneModal.getCurrent() == 17 ? zOutput.format(cycle.clearance) : "",
      gPlaneModal.getCurrent() == 18 ? yOutput.format(cycle.clearance) : "",
      gPlaneModal.getCurrent() == 19 ? xOutput.format(cycle.clearance) : "",
      highFeedMapping != HIGH_FEED_NO_MAPPING ? getFeed(highFeedrate) : ""
    );
    return;
  }

  if (isFirstCyclePoint()) {
    // return to initial Z which is clearance plane and set absolute mode
    repositionToCycleClearance(cycle, x, y, z);

    writeBlock(gFeedModeModal.format(94));
    var F = cycle.feedrate;
    var P = !cycle.dwell ? 0 : clamp(0.001, cycle.dwell, 99999999); // in seconds

    switch (cycleType) {
    case "drilling":
      writeBlock(
        gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(81),
        getCommonCycle(x, y, z, cycle.retract),
        feedOutput.format(F)
      );
      break;
    case "counter-boring":
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(82),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          feedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(81),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F)
        );
      }
      break;
    case "chip-breaking":
      expandCyclePoint(x, y, z);
      break;
    case "deep-drilling":
      if (P > 0) {
        expandCyclePoint(x, y, z);
      } else {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(83),
          getCommonCycle(x, y, z, cycle.retract),
          "Q" + xyzFormat.format(cycle.incrementalDepth),
          feedOutput.format(F)
        );
      }
      break;
    case "fine-boring":
      expandCyclePoint(x, y, z);
      break;
    case "reaming":
      if (feedFormat.getResultingValue(cycle.feedrate) != feedFormat.getResultingValue(cycle.retractFeedrate)) {
        expandCyclePoint(x, y, z);
        break;
      }
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(89),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P),
          feedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(85),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F)
        );
      }
      break;
    case "stop-boring":
      writeBlock(
        gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(86),
        getCommonCycle(x, y, z, cycle.retract),
        P > 0 ? "P" + secFormat.format(P) : "",
        feedOutput.format(F)
      );
      break;
    case "manual-boring":
      writeBlock(
        gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(88),
        getCommonCycle(x, y, z, cycle.retract),
        "P" + secFormat.format(P), // not optional
        feedOutput.format(F)
      );
      break;
    case "boring":
      if (feedFormat.getResultingValue(cycle.feedrate) != feedFormat.getResultingValue(cycle.retractFeedrate)) {
        expandCyclePoint(x, y, z);
        break;
      }
      if (P > 0) {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(89),
          getCommonCycle(x, y, z, cycle.retract),
          "P" + secFormat.format(P), // not optional
          feedOutput.format(F)
        );
      } else {
        writeBlock(
          gRetractModal.format(98), gAbsIncModal.format(90), gCycleModal.format(85),
          getCommonCycle(x, y, z, cycle.retract),
          feedOutput.format(F)
        );
      }
      break;
    default:
      expandCyclePoint(x, y, z);
    }
  } else {
    if (cycleExpanded) {
      expandCyclePoint(x, y, z);
    } else {
      if (!xyzFormat.areDifferent(x, xOutput.getCurrent()) &&
          !xyzFormat.areDifferent(y, yOutput.getCurrent()) &&
          !xyzFormat.areDifferent(z, zOutput.getCurrent())) {
        switch (gPlaneModal.getCurrent()) {
        case 17: // XY
          xOutput.reset(); // at least one axis is required
          break;
        case 18: // ZX
          zOutput.reset(); // at least one axis is required
          break;
        case 19: // YZ
          yOutput.reset(); // at least one axis is required
          break;
        }
      }
      if ((currentSection.getPolarMode && currentSection.getPolarMode() != POLAR_MODE_OFF) && currentSection.isMultiAxis()) {
        var polarPosition = getPolarPosition(x, y, z);
        setCurrentPositionAndDirection(polarPosition);
        writeBlock(xOutput.format(polarPosition.first.x), yOutput.format(polarPosition.first.y), zOutput.format(polarPosition.first.z),
          aOutput.format(polarPosition.second.x), bOutput.format(polarPosition.second.y), cOutput.format(polarPosition.second.z));
      } else {
        writeBlock(xOutput.format(x), yOutput.format(y), zOutput.format(z));
      }
    }
  }
}

function writeProbeCycle(cycle, x, y, z) {
  if (!isSameDirection(currentSection.workPlane.forward, machineConfiguration.getSpindleAxis())) {
    if (!settings.probing.allowIndexingWCSProbing && currentSection.strategy == "probe") {
      error(localize("Updating WCS / work offset using probing is only supported by the CNC in the WCS frame."));
    }
  }
  var isMirrored = currentSection.getInternalPatternId && currentSection.getInternalPatternId() != currentSection.getPatternId();
  validate(!isMirrored, "Mirror pattern is not supported for Probing toolpaths.");
  if (currentSection.isPatterned && currentSection.isPatterned()) {
    // probe cycles that cannot be used with patterns
    var unsupportedCycleTypes = ["probing-x", "probing-y", "probing-xy-inner-corner", "probing-xy-outer-corner", "probing-x-plane-angle", "probing-y-plane-angle"];
    if (unsupportedCycleTypes.indexOf(cycleType) > -1 && (!Matrix.diff(new Matrix(), currentSection.workPlane).isZero())) {
      error(subst("Rotary type patterns are not supported for the Probing cycle type '%1'.", cycleType));
    }
  }
  if (cycle.updateToolWear) {
    error(localize("Tool wear not currently supported on probing operations."));
  }
  z += tool.cornerRadius; // probe is controlled at center of probe
  protectedProbeMove(cycle, x, y, z);
  switch (cycleType) {
  case "probing-x":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-x> call",
      "[" + xyzFormat.format(x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-y":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-y> call",
      "[" + xyzFormat.format(y + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2)) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      getProbingArguments(cycle));

    break;
  case "probing-z":
    protectedProbeMove(cycle, x, y, Math.min(z - cycle.depth + cycle.probeClearance, cycle.retract));
    writeBlock("o<probing-z> call",
      "[" + xyzFormat.format(z - cycle.depth - tool.diameter / 2) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-x-wall":
    protectedProbeMove(cycle, x, y, z);
    if (cycle.updateToolWear) {
      error(localize("Tool wear not currently supported on probing-x-wall operation."));
    }
    writeBlock("o<probing-x-wall> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-y-wall":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-y-wall> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-x-channel":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-x-channel> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-y-channel":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-y-channel> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-x-channel-with-island":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-x-channel-with-island> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(-cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-y-channel-with-island":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-y-channel-with-island> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(-cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-circular-boss":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-circular-boss> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-circular-partial-boss":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-circular-partial-boss> call",
      "[" + xyzFormat.format(cycle.partialCircleAngleA) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleB) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleC) + "]",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-circular-hole":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-xy-circular-hole> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-xy-circular-hole-with-island":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-circular-hole-with-island> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(-cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-circular-partial-hole":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-xy-circular-partial-hole> call",
      "[" + xyzFormat.format(cycle.partialCircleAngleA) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleB) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleC) + "]",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-xy-circular-partial-hole-with-island":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-circular-partial-hole-with-island> call",
      "[" + xyzFormat.format(cycle.partialCircleAngleA) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleB) + "]",
      "[" + xyzFormat.format(cycle.partialCircleAngleC) + "]",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(-cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-rectangular-boss":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-rectangular-boss> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.width2) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-rectangular-hole":
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-xy-rectangular-hole> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.width2) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle));
    break;
  case "probing-xy-rectangular-hole-with-island":
    protectedProbeMove(cycle, x, y, z);
    writeBlock("o<probing-xy-rectangular-hole-with-island> call",
      "[" + xyzFormat.format(cycle.width1) + "]",
      "[" + xyzFormat.format(cycle.width2) + "]",
      "[" + xyzFormat.format(z - cycle.depth) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + xyzFormat.format(-cycle.probeClearance) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.wrongSizeAction == "stop-message" ? xyzFormat.format(cycle.toleranceSize ? cycle.toleranceSize : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-inner-corner":
    var cornerX = x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
    var cornerY = y + approach(cycle.approach2) * (cycle.probeClearance + tool.diameter / 2);
    var cornerI = 0;
    var cornerJ = 0;
    if (cycle.probeSpacing !== undefined) {
      cornerI = cycle.probeSpacing;
      cornerJ = cycle.probeSpacing;
    }
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-xy-inner-corner> call",
      "[" + xyzFormat.format(cornerX) + "]",
      "[" + xyzFormat.format(cornerY) + "]",
      "[" + xyzFormat.format(cornerI) + "]",
      "[" + xyzFormat.format(cornerJ) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.angleAskewAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.angleAskewAction == "stop-message" ? xyzFormat.format(cycle.toleranceAngle ? cycle.toleranceAngle : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  case "probing-xy-outer-corner":
    var cornerX = x + approach(cycle.approach1) * (cycle.probeClearance + tool.diameter / 2);
    var cornerY = y + approach(cycle.approach2) * (cycle.probeClearance + tool.diameter / 2);
    var cornerI = 0;
    var cornerJ = 0;
    if (cycle.probeSpacing !== undefined) {
      cornerI = cycle.probeSpacing;
      cornerJ = cycle.probeSpacing;
    }
    protectedProbeMove(cycle, x, y, z - cycle.depth);
    writeBlock("o<probing-xy-outer-corner> call",
      "[" + xyzFormat.format(cornerX) + "]",
      "[" + xyzFormat.format(cornerY) + "]",
      "[" + xyzFormat.format(cornerI) + "]",
      "[" + xyzFormat.format(cornerJ) + "]",
      "[" + xyzFormat.format(cycle.probeOvertravel) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.outOfPositionAction == "stop-message" ? xyzFormat.format(cycle.tolerancePosition ? cycle.tolerancePosition : 0) : 0) + "]",
      "[" + (cycle.angleAskewAction == "stop-message" ? 1 : 0) + "]",
      "[" + (cycle.angleAskewAction == "stop-message" ? xyzFormat.format(cycle.toleranceAngle ? cycle.toleranceAngle : 0) : 0) + "]",
      getProbingArguments(cycle),
      "[" + xyzFormat.format(cycle.feedrate) + "]");
    break;
  default:
    cycleNotSupported();
  }
}

function approach(value) {
  validate((value == "positive") || (value == "negative"), "Invalid approach.");
  return (value == "positive") ? 1 : -1;
}

function protectedProbeMove(_cycle, x, y, z) {
  var _x = xOutput.format(x);
  var _y = yOutput.format(y);
  var _z = zOutput.format(z);

  var _cmdX = xyzFormat.format(x);
  var _cmdY = xyzFormat.format(y);
  var _cmdZ = xyzFormat.format(z);

  var current = getCurrentPosition();
  var _currentX = xyzFormat.format(current.x);
  var _currentY = xyzFormat.format(current.y);
  var _currentZ = xyzFormat.format(current.z);

  var _f = feedFormat.format(cycle.feedrate);
  feedOutput.reset();

  if (_z && xyzFormat.getResultingValue(z) >= xyzFormat.getResultingValue(current.z)) {
    writeBlock("o<protected-move> call", "[" + _currentX + "]", "[" + _currentY + "]", "[" + _cmdZ + "]", "[" + _f + "]");
  }
  if (_x || _y) {
    writeBlock("o<protected-move> call", "[" + _cmdX + "]", "[" + _cmdY + "]", "[" + _currentZ + "]", "[" + _f + "]");
  }
  if (_z && xyzFormat.getResultingValue(z) < xyzFormat.getResultingValue(current.z)) {
    writeBlock("o<protected-move> call", "[" + _cmdX + "]", "[" + _cmdY + "]", "[" + _cmdZ + "]", "[" + _f + "]");
  }
}

function getProbingArguments(cycle) {
  return [
    ("[" + (currentSection.strategy == "probe" ? 1 : 0) + "]"),
    ("[" + (currentSection.strategy == "probe" ? (currentSection.probeWorkOffset ? currentSection.probeWorkOffset : 1) : -1) + "]"),
    ("[" + (cycle.printResults ? 1 : 0) + "]")
  ];
}

function onCycleEnd() {
  if (isProbeOperation()) {
    gMotionModal.reset();
  } else {
    if (!cycleExpanded) {
      writeBlock(gCycleModal.format(80));
      gMotionModal.reset();
    }
  }
}

var mapCommand = {
  COMMAND_END                     : 2,
  COMMAND_SPINDLE_CLOCKWISE       : 3,
  COMMAND_SPINDLE_COUNTERCLOCKWISE: 4,
  COMMAND_STOP_SPINDLE            : 5,
  COMMAND_ORIENTATE_SPINDLE       : 19,
};

function onCommand(command) {
  switch (command) {
  case COMMAND_COOLANT_OFF:
    setCoolant(COOLANT_OFF);
    return;
  case COMMAND_COOLANT_ON:
    setCoolant(tool.coolant);
    return;
  case COMMAND_STOP:
    writeBlock(mFormat.format(0));
    forceSpindleSpeed = true;
    forceCoolant = true;
    return;
  case COMMAND_OPTIONAL_STOP:
    writeBlock(mFormat.format(1));
    forceSpindleSpeed = true;
    forceCoolant = true;
    return;
  case COMMAND_START_SPINDLE:
    forceSpindleSpeed = false;
    writeBlock(sOutput.format(spindleSpeed), mFormat.format(tool.clockwise ? 3 : 4));
    return;
  case COMMAND_LOAD_TOOL:
    setTCP(false);
    disableLengthCompensation(false);
    onCommand(COMMAND_STOP_SPINDLE);
    var saveSafePositionMethod = getProperty("safePositionMethod");
    setProperty("safePositionMethod", "G53");
    writeRetract(X, Y);
    setProperty("safePositionMethod", saveSafePositionMethod);
    if (getProperty("showToolNumberPopup")) {
      writeBlock(mFormat.format(700), "T" + toolFormat.format(tool.number));
    }
    if (!machineConfiguration.getToolChanger()) {
      writeBlock(mFormat.format(0)); // force stop for manual tool change
    }
    writeToolBlock("T" + toolFormat.format(tool.number), mFormat.format(6));
    writeComment(tool.comment);
    return;
  case COMMAND_LOCK_MULTI_AXIS:
    if (machineConfiguration.isMultiAxisConfiguration()) {
      // writeBlock(fourthAxisClamp.format(25)); // lock 4th axis
      if (machineConfiguration.getNumberOfAxes() > 4) {
        // writeBlock(fifthAxisClamp.format(35)); // lock 5th axis
      }
    }
    return;
  case COMMAND_UNLOCK_MULTI_AXIS:
    if (machineConfiguration.isMultiAxisConfiguration()) {
      // writeBlock(fourthAxisClamp.format(26)); // unlock 4th axis
      if (machineConfiguration.getNumberOfAxes() > 4) {
        // writeBlock(fifthAxisClamp.format(36)); // unlock 5th axis
      }
    }
    return;
  case COMMAND_BREAK_CONTROL:
    return;
  case COMMAND_TOOL_MEASURE:
    return;
  case COMMAND_PROBE_ON:
    return;
  case COMMAND_PROBE_OFF:
    return;
  }

  var stringId = getCommandStringId(command);
  var mcode = mapCommand[stringId];
  if (mcode != undefined) {
    writeBlock(mFormat.format(mcode));
  } else {
    onUnsupportedCommand(command);
  }
}

function onSectionEnd() {
  if (currentSection.isMultiAxis() || tcp.isSupportedByOperation) {
    setTCP(false);
    disableLengthCompensation(false);
    writeBlock(gFeedModeModal.format(94)); // inverse time feed off
  }
  writeBlock(gPlaneModal.format(17));
  if (!isLastSection()) {
    if (getNextSection().getTool().coolant != tool.coolant) {
      setCoolant(COOLANT_OFF);
    }
    if (tool.breakControl && isToolChangeNeeded(getNextSection(), getProperty("toolAsName") ? "description" : "number")) {
      onCommand(COMMAND_BREAK_CONTROL);
    }
  }

  if (isProbeOperation()) {
    writeBlock("o<probe-off> call");
  }
  forceAny();
}

function onClose() {
  optionalSection = false;
  setCoolant(COOLANT_OFF);

  setTCP(false);
  writeRetract(Z);

  if (getSetting("retract.homeXY.onProgramEnd", false)) {
    writeRetract(settings.retract.homeXY.onProgramEnd);
  }

  forceWorkPlane();
  unwindABC(new Vector(0, 0, 0));
  setWorkPlane(new Vector(0, 0, 0)); // reset working plane

  onImpliedCommand(COMMAND_END);
  onImpliedCommand(COMMAND_STOP_SPINDLE);
  writeBlock(mFormat.format(30)); // stop program, spindle stop, coolant off
  writeln("(AXIS,stop)"); // disable LinuxCNC visualization
  writeln("%");
}

// >>>>> INCLUDED FROM include_files/commonFunctions.cpi
// internal variables, do not change
var receivedMachineConfiguration;
var tcp = {isSupportedByControl:getSetting("supportsTCP", true), isSupportedByMachine:false, isSupportedByOperation:false};
var state = {
  retractedX              : false, // specifies that the machine has been retracted in X
  retractedY              : false, // specifies that the machine has been retracted in Y
  retractedZ              : false, // specifies that the machine has been retracted in Z
  tcpIsActive             : false, // specifies that TCP is currently active
  twpIsActive             : false, // specifies that TWP is currently active
  lengthCompensationActive: !getSetting("outputToolLengthCompensation", true), // specifies that tool length compensation is active
  mainState               : true // specifies the current context of the state (true = main, false = optional)
};
var validateLengthCompensation = getSetting("outputToolLengthCompensation", true); // disable validation when outputToolLengthCompensation is disabled
var multiAxisFeedrate;
var sequenceNumber;
var optionalSection = false;
var currentWorkOffset;
var forceSpindleSpeed = false;
var operationNeedsSafeStart = false; // used to convert blocks to optional for safeStartAllOperations

function activateMachine() {
  // disable unsupported rotary axes output
  if (!machineConfiguration.isMachineCoordinate(0) && (typeof aOutput != "undefined")) {
    aOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(1) && (typeof bOutput != "undefined")) {
    bOutput.disable();
  }
  if (!machineConfiguration.isMachineCoordinate(2) && (typeof cOutput != "undefined")) {
    cOutput.disable();
  }

  // setup usage of useTiltedWorkplane
  settings.workPlaneMethod.useTiltedWorkplane = getProperty("useTiltedWorkplane") != undefined ? getProperty("useTiltedWorkplane") :
    getSetting("workPlaneMethod.useTiltedWorkplane", false);
  settings.workPlaneMethod.useABCPrepositioning = getSetting("workPlaneMethod.useABCPrepositioning", true);

  if (!machineConfiguration.isMultiAxisConfiguration()) {
    return; // don't need to modify any settings for 3-axis machines
  }

  // identify if any of the rotary axes has TCP enabled
  var axes = [machineConfiguration.getAxisU(), machineConfiguration.getAxisV(), machineConfiguration.getAxisW()];
  tcp.isSupportedByMachine = axes.some(function(axis) {return axis.isEnabled() && axis.isTCPEnabled();}); // true if TCP is enabled on any rotary axis
  if (tcp.isSupportedByMachine) {
    bufferRotaryMoves = false; // disable bufferRotaryMoves if TCP is enabled on any rotary axis
  }

  // save multi-axis feedrate settings from machine configuration
  var mode = machineConfiguration.getMultiAxisFeedrateMode();
  var type = mode == FEED_INVERSE_TIME ? machineConfiguration.getMultiAxisFeedrateInverseTimeUnits() :
    (mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateDPMType() : DPM_STANDARD);
  multiAxisFeedrate = {
    mode     : mode,
    maximum  : machineConfiguration.getMultiAxisFeedrateMaximum(),
    type     : type,
    tolerance: mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateOutputTolerance() : 0,
    bpwRatio : mode == FEED_DPM ? machineConfiguration.getMultiAxisFeedrateBpwRatio() : 1
  };

  // setup of retract/reconfigure  TAG: Only needed until post kernel supports these machine config settings
  if (receivedMachineConfiguration && machineConfiguration.performRewinds()) {
    safeRetractDistance = machineConfiguration.getSafeRetractDistance();
    safePlungeFeed = machineConfiguration.getSafePlungeFeedrate();
    safeRetractFeed = machineConfiguration.getSafeRetractFeedrate();
  }
  if (typeof safeRetractDistance == "number" && getProperty("safeRetractDistance") != undefined && getProperty("safeRetractDistance") != 0) {
    safeRetractDistance = getProperty("safeRetractDistance");
  }

  if (revision >= 50294) {
    activateAutoPolarMode({tolerance:tolerance / 2, optimizeType:OPTIMIZE_AXIS, expandCycles:getSetting("polarCycleExpandMode", EXPAND_ALL)});
  }

  if (machineConfiguration.isHeadConfiguration() && getSetting("workPlaneMethod.compensateToolLength", false)) {
    for (var i = 0; i < getNumberOfSections(); ++i) {
      var section = getSection(i);
      if (section.isMultiAxis()) {
        machineConfiguration.setToolLength(getBodyLength(section.getTool())); // define the tool length for head adjustments
        section.optimizeMachineAnglesByMachine(machineConfiguration, OPTIMIZE_AXIS);
      }
    }
  } else {
    optimizeMachineAngles2(OPTIMIZE_AXIS);
  }
}

function getBodyLength(tool) {
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (tool.number == section.getTool().number) {
      if (section.hasParameter("operation:tool_assemblyGaugeLength")) { // For Fusion
        return section.getParameter("operation:tool_assemblyGaugeLength", tool.bodyLength + tool.holderLength);
      } else { // Legacy products
        return section.getParameter("operation:tool_overallLength", tool.bodyLength + tool.holderLength);
      }
    }
  }
  return tool.bodyLength + tool.holderLength;
}

function getFeed(f) {
  if (getProperty("useG95")) {
    return feedOutput.format(f / spindleSpeed); // use feed value
  }
  if (typeof activeMovements != "undefined" && activeMovements) {
    var feedContext = activeMovements[movement];
    if (feedContext != undefined) {
      if (!feedFormat.areDifferent(feedContext.feed, f)) {
        if (feedContext.id == currentFeedId) {
          return ""; // nothing has changed
        }
        forceFeed();
        currentFeedId = feedContext.id;
        return settings.parametricFeeds.feedOutputVariable + (settings.parametricFeeds.firstFeedParameter + feedContext.id);
      }
    }
    currentFeedId = undefined; // force parametric feed next time
  }
  return feedOutput.format(f); // use feed value
}

function validateCommonParameters() {
  validateToolData();
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (getSection(0).workOffset == 0 && section.workOffset > 0) {
      if (!(typeof wcsDefinitions != "undefined" && wcsDefinitions.useZeroOffset)) {
        error(localize("Using multiple work offsets is not possible if the initial work offset is 0."));
      }
    }
    if (section.isMultiAxis()) {
      if (!section.isOptimizedForMachine() &&
        (!getSetting("workPlaneMethod.useTiltedWorkplane", false) || !getSetting("supportsToolVectorOutput", false))) {
        error(localize("This postprocessor requires a machine configuration for 5-axis simultaneous toolpath."));
      }
      if (machineConfiguration.getMultiAxisFeedrateMode() == FEED_INVERSE_TIME && !getSetting("supportsInverseTimeFeed", true)) {
        error(localize("This postprocessor does not support inverse time feedrates."));
      }
      if (getSetting("supportsToolVectorOutput", false) && !tcp.isSupportedByControl) {
        error(localize("Incompatible postprocessor settings detected." + EOL +
        "Setting 'supportsToolVectorOutput' requires setting 'supportsTCP' to be enabled as well."));
      }
    }
  }
  if (!tcp.isSupportedByControl && tcp.isSupportedByMachine) {
    error(localize("The machine configuration has TCP enabled which is not supported by this postprocessor."));
  }
  if (getProperty("safePositionMethod") == "clearanceHeight") {
    var msg = "-Attention- Property 'Safe Retracts' is set to 'Clearance Height'." + EOL +
      "Ensure the clearance height will clear the part and or fixtures." + EOL +
      "Raise the Z-axis to a safe height before starting the program.";
    warning(msg);
    writeComment(msg);
  }
}

function validateToolData() {
  var _default = 99999;
  var _maximumSpindleRPM = machineConfiguration.getMaximumSpindleSpeed() > 0 ? machineConfiguration.getMaximumSpindleSpeed() :
    settings.maximumSpindleRPM == undefined ? _default : settings.maximumSpindleRPM;
  var _maximumToolNumber = machineConfiguration.isReceived() && machineConfiguration.getNumberOfTools() > 0 ? machineConfiguration.getNumberOfTools() :
    settings.maximumToolNumber == undefined ? _default : settings.maximumToolNumber;
  var _maximumToolLengthOffset = settings.maximumToolLengthOffset == undefined ? _default : settings.maximumToolLengthOffset;
  var _maximumToolDiameterOffset = settings.maximumToolDiameterOffset == undefined ? _default : settings.maximumToolDiameterOffset;

  var header = ["Detected maximum values are out of range.", "Maximum values:"];
  var warnings = {
    toolNumber    : {msg:"Tool number value exceeds the maximum value for tool: " + EOL, max:" Tool number: " + _maximumToolNumber, values:[]},
    lengthOffset  : {msg:"Tool length offset value exceeds the maximum value for tool: " + EOL, max:" Tool length offset: " + _maximumToolLengthOffset, values:[]},
    diameterOffset: {msg:"Tool diameter offset value exceeds the maximum value for tool: " + EOL, max:" Tool diameter offset: " + _maximumToolDiameterOffset, values:[]},
    spindleSpeed  : {msg:"Spindle speed exceeds the maximum value for operation: " + EOL, max:" Spindle speed: " + _maximumSpindleRPM, values:[]}
  };

  var toolIds = [];
  for (var i = 0; i < getNumberOfSections(); ++i) {
    var section = getSection(i);
    if (toolIds.indexOf(section.getTool().getToolId()) === -1) { // loops only through sections which have a different tool ID
      var toolNumber = section.getTool().number;
      var lengthOffset = section.getTool().lengthOffset;
      var diameterOffset = section.getTool().diameterOffset;
      var comment = section.getParameter("operation-comment", "");

      if (toolNumber > _maximumToolNumber && !getProperty("toolAsName")) {
        warnings.toolNumber.values.push(SP + toolNumber + EOL);
      }
      if (lengthOffset > _maximumToolLengthOffset) {
        warnings.lengthOffset.values.push(SP + "Tool " + toolNumber + " (" + comment + "," + " Length offset: " + lengthOffset + ")" + EOL);
      }
      if (diameterOffset > _maximumToolDiameterOffset) {
        warnings.diameterOffset.values.push(SP + "Tool " + toolNumber + " (" + comment + "," + " Diameter offset: " + diameterOffset + ")" + EOL);
      }
      toolIds.push(section.getTool().getToolId());
    }
    // loop through all sections regardless of tool id for idenitfying spindle speeds

    // identify if movement ramp is used in current toolpath, use ramp spindle speed for comparisons
    var ramp = section.getMovements() & ((1 << MOVEMENT_RAMP) | (1 << MOVEMENT_RAMP_ZIG_ZAG) | (1 << MOVEMENT_RAMP_PROFILE) | (1 << MOVEMENT_RAMP_HELIX));
    var _sectionSpindleSpeed = Math.max(section.getTool().spindleRPM, ramp ? section.getTool().rampingSpindleRPM : 0, 0);
    if (_sectionSpindleSpeed > _maximumSpindleRPM) {
      warnings.spindleSpeed.values.push(SP + section.getParameter("operation-comment", "") + " (" + _sectionSpindleSpeed + " RPM" + ")" + EOL);
    }
  }

  // sort lists by tool number
  warnings.toolNumber.values.sort(function(a, b) {return a - b;});
  warnings.lengthOffset.values.sort(function(a, b) {return a.localeCompare(b);});
  warnings.diameterOffset.values.sort(function(a, b) {return a.localeCompare(b);});

  var warningMessages = [];
  for (var key in warnings) {
    if (warnings[key].values != "") {
      header.push(warnings[key].max); // add affected max values to the header
      warningMessages.push(warnings[key].msg + warnings[key].values.join(""));
    }
  }
  if (warningMessages.length != 0) {
    warningMessages.unshift(header.join(EOL) + EOL);
    warning(warningMessages.join(EOL));
  }
}

function forceFeed() {
  currentFeedId = undefined;
  feedOutput.reset();
}

/** Force output of X, Y, and Z. */
function forceXYZ() {
  xOutput.reset();
  yOutput.reset();
  zOutput.reset();
}

/** Force output of A, B, and C. */
function forceABC() {
  aOutput.reset();
  bOutput.reset();
  cOutput.reset();
}

/** Force output of X, Y, Z, A, B, C, and F on next output. */
function forceAny() {
  forceXYZ();
  forceABC();
  forceFeed();
}

/**
  Writes the specified block.
*/
function writeBlock() {
  var text = formatWords(arguments);
  if (!text) {
    return;
  }
  var prefix = getSetting("sequenceNumberPrefix", "N");
  var suffix = getSetting("writeBlockSuffix", "");
  if ((optionalSection || skipBlocks) && !getSetting("supportsOptionalBlocks", true)) {
    error(localize("Optional blocks are not supported by this post."));
  }
  if (getProperty("showSequenceNumbers") == "true") {
    if (sequenceNumber == undefined || sequenceNumber >= settings.maximumSequenceNumber) {
      sequenceNumber = getProperty("sequenceNumberStart");
    }
    if (optionalSection || skipBlocks) {
      writeWords2("/", prefix + sequenceNumber, text + suffix);
    } else {
      writeWords2(prefix + sequenceNumber, text + suffix);
    }
    sequenceNumber += getProperty("sequenceNumberIncrement");
  } else {
    if (optionalSection || skipBlocks) {
      writeWords2("/", text + suffix);
    } else {
      writeWords(text + suffix);
    }
  }
}

validate(settings.comments, "Setting 'comments' is required but not defined.");
function formatComment(text) {
  var prefix = settings.comments.prefix;
  var suffix = settings.comments.suffix;
  var _permittedCommentChars = settings.comments.permittedCommentChars == undefined ? "" : settings.comments.permittedCommentChars;
  switch (settings.comments.outputFormat) {
  case "upperCase":
    text = text.toUpperCase();
    _permittedCommentChars = _permittedCommentChars.toUpperCase();
    break;
  case "lowerCase":
    text = text.toLowerCase();
    _permittedCommentChars = _permittedCommentChars.toLowerCase();
    break;
  case "ignoreCase":
    _permittedCommentChars = _permittedCommentChars.toUpperCase() + _permittedCommentChars.toLowerCase();
    break;
  default:
    error(localize("Unsupported option specified for setting 'comments.outputFormat'."));
  }
  if (_permittedCommentChars != "") {
    text = filterText(String(text), _permittedCommentChars);
  }
  text = String(text).substring(0, settings.comments.maximumLineLength - prefix.length - suffix.length);
  return text != "" ? prefix + text + suffix : "";
}

/**
  Output a comment.
*/
function writeComment(text) {
  if (!text) {
    return;
  }
  var comments = String(text).split(/\r?\n/);
  for (comment in comments) {
    var _comment = formatComment(comments[comment]);
    if (_comment) {
      if (getSetting("comments.showSequenceNumbers", false)) {
        writeBlock(_comment);
      } else {
        writeln(_comment);
      }
    }
  }
}

function onComment(text) {
  writeComment(text);
}

/**
  Writes the specified block - used for tool changes only.
*/
function writeToolBlock() {
  var show = getProperty("showSequenceNumbers");
  setProperty("showSequenceNumbers", (show == "true" || show == "toolChange") ? "true" : "false");
  writeBlock(arguments);
  setProperty("showSequenceNumbers", show);
  machineSimulation({/*x:toPreciseUnit(200, MM), y:toPreciseUnit(200, MM), coordinates:MACHINE,*/ mode:TOOLCHANGE}); // move machineSimulation to a tool change position
}

var skipBlocks = false;
var initialState = JSON.parse(JSON.stringify(state)); // save initial state
var optionalState = JSON.parse(JSON.stringify(state));
var saveCurrentSectionId = undefined;
function writeStartBlocks(isRequired, code) {
  var saveSkipBlocks = skipBlocks;
  var saveMainState = state; // save main state

  if (!isRequired) {
    if (!getProperty("safeStartAllOperations", false)) {
      return; // when safeStartAllOperations is disabled, dont output code and return
    }
    if (saveCurrentSectionId != getCurrentSectionId()) {
      saveCurrentSectionId = getCurrentSectionId();
      forceModals(); // force all modal variables when entering a new section
      optionalState = Object.create(initialState); // reset optionalState to initialState when entering a new section
    }
    skipBlocks = true; // if values are not required, but safeStartAllOperations is enabled - write following blocks as optional
    state = optionalState; // set state to optionalState if skipBlocks is true
    state.mainState = false;
  }
  code(); // writes out the code which is passed to this function as an argument

  state = saveMainState; // restore main state
  skipBlocks = saveSkipBlocks; // restore skipBlocks value
}

var pendingRadiusCompensation = -1;
function onRadiusCompensation() {
  pendingRadiusCompensation = radiusCompensation;
  if (pendingRadiusCompensation >= 0 && !getSetting("supportsRadiusCompensation", true)) {
    error(localize("Radius compensation mode is not supported."));
    return;
  }
}

function onPassThrough(text) {
  var commands = String(text).split(",");
  for (text in commands) {
    writeBlock(commands[text]);
  }
}

function forceModals() {
  if (arguments.length == 0) { // reset all modal variables listed below
    var modals = [
      "gMotionModal",
      "gPlaneModal",
      "gAbsIncModal",
      "gFeedModeModal",
      "feedOutput"
    ];
    if (operationNeedsSafeStart && (typeof currentSection != "undefined" && currentSection.isMultiAxis())) {
      modals.push("fourthAxisClamp", "fifthAxisClamp", "sixthAxisClamp");
    }
    for (var i = 0; i < modals.length; ++i) {
      if (typeof this[modals[i]] != "undefined") {
        this[modals[i]].reset();
      }
    }
  } else {
    for (var i in arguments) {
      arguments[i].reset(); // only reset the modal variable passed to this function
    }
  }
}

/** Helper function to be able to use a default value for settings which do not exist. */
function getSetting(setting, defaultValue) {
  var result = defaultValue;
  var keys = setting.split(".");
  var obj = settings;
  for (var i in keys) {
    if (obj[keys[i]] != undefined) { // setting does exist
      result = obj[keys[i]];
      if (typeof [keys[i]] === "object") {
        obj = obj[keys[i]];
        continue;
      }
    } else { // setting does not exist, use default value
      if (defaultValue != undefined) {
        result = defaultValue;
      } else {
        error("Setting '" + keys[i] + "' has no default value and/or does not exist.");
        return undefined;
      }
    }
  }
  return result;
}

function getForwardDirection(_section) {
  var forward = undefined;
  var _optimizeType = settings.workPlaneMethod && settings.workPlaneMethod.optimizeType;
  if (_section.isMultiAxis()) {
    forward = _section.workPlane.forward;
  } else if (!getSetting("workPlaneMethod.useTiltedWorkplane", false) && machineConfiguration.isMultiAxisConfiguration()) {
    if (_optimizeType == undefined) {
      var saveRotation = getRotation();
      getWorkPlaneMachineABC(_section, true);
      forward = getRotation().forward;
      setRotation(saveRotation); // reset rotation
    } else {
      var abc = getWorkPlaneMachineABC(_section, false);
      var forceAdjustment = settings.workPlaneMethod.optimizeType == OPTIMIZE_TABLES || settings.workPlaneMethod.optimizeType == OPTIMIZE_BOTH;
      forward = machineConfiguration.getOptimizedDirection(_section.workPlane.forward, abc, false, forceAdjustment);
    }
  } else {
    forward = getRotation().forward;
  }
  return forward;
}

function getRetractParameters() {
  var _arguments = typeof arguments[0] === "object" ? arguments[0].axes : arguments;
  var singleLine = arguments[0].singleLine == undefined ? true : arguments[0].singleLine;
  var words = []; // store all retracted axes in an array
  var retractAxes = new Array(false, false, false);
  var method = getProperty("safePositionMethod", "undefined");
  if (method == "clearanceHeight") {
    if (!is3D()) {
      error(localize("Safe retract option 'Clearance Height' is only supported when all operations are along the setup Z-axis."));
    }
    return undefined;
  }
  validate(settings.retract, "Setting 'retract' is required but not defined.");
  validate(_arguments.length != 0, "No axis specified for getRetractParameters().");
  for (i in _arguments) {
    retractAxes[_arguments[i]] = true;
  }
  if ((retractAxes[0] || retractAxes[1]) && !state.retractedZ) { // retract Z first before moving to X/Y home
    error(localize("Retracting in X/Y is not possible without being retracted in Z."));
    return undefined;
  }
  // special conditions
  if (retractAxes[0] || retractAxes[1]) {
    method = getSetting("retract.methodXY", method);
  }
  if (retractAxes[2]) {
    method = getSetting("retract.methodZ", method);
  }
  // define home positions
  var useZeroValues = (settings.retract.useZeroValues && settings.retract.useZeroValues.indexOf(method) != -1);
  var _xHome = machineConfiguration.hasHomePositionX() && !useZeroValues ? machineConfiguration.getHomePositionX() : toPreciseUnit(0, MM);
  var _yHome = machineConfiguration.hasHomePositionY() && !useZeroValues ? machineConfiguration.getHomePositionY() : toPreciseUnit(0, MM);
  var _zHome = machineConfiguration.getRetractPlane() != 0 && !useZeroValues ? machineConfiguration.getRetractPlane() : toPreciseUnit(0, MM);
  for (var i = 0; i < _arguments.length; ++i) {
    switch (_arguments[i]) {
    case X:
      if (!state.retractedX) {
        words.push("X" + xyzFormat.format(_xHome));
        xOutput.reset();
        state.retractedX = true;
      }
      break;
    case Y:
      if (!state.retractedY) {
        words.push("Y" + xyzFormat.format(_yHome));
        yOutput.reset();
        state.retractedY = true;
      }
      break;
    case Z:
      if (!state.retractedZ) {
        words.push("Z" + xyzFormat.format(_zHome));
        zOutput.reset();
        state.retractedZ = true;
      }
      break;
    default:
      error(localize("Unsupported axis specified for getRetractParameters()."));
      return undefined;
    }
  }
  return {
    method     : method,
    retractAxes: retractAxes,
    words      : words,
    positions  : {
      x: retractAxes[0] ? _xHome : undefined,
      y: retractAxes[1] ? _yHome : undefined,
      z: retractAxes[2] ? _zHome : undefined},
    singleLine: singleLine};
}

/** Returns true when subprogram logic does exist into the post. */
function subprogramsAreSupported() {
  return typeof subprogramState != "undefined";
}

// Start of machine simulation connection move support
var debugSimulation = false; // enable to output debug information for connection move support in the NC program
var TCPON = "TCP ON";
var TCPOFF = "TCP OFF";
var TWPON = "TWP ON";
var TWPOFF = "TWP OFF";
var TOOLCHANGE = "TOOL CHANGE";
var RETRACTTOOLAXIS = "RETRACT TOOLAXIS";
var WORK = "WORK CS";
var MACHINE = "MACHINE CS";
var MIN = "MIN";
var MAX = "MAX";
var WARNING_NON_RANGE = [0, 1, 2];
var isTwpOn;
var isTcpOn;
/**
 * Helper function for connection moves in machine simulation.
 * @param {Object} parameters An object containing the desired options for machine simulation.
 * @note Available properties are:
 * @param {Number} x X axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} y Y axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} z Z axis position, alternatively use MIN or MAX to move to the axis limit
 * @param {Number} a A axis position (in radians)
 * @param {Number} b B axis position (in radians)
 * @param {Number} c C axis position (in radians)
 * @param {Number} feed desired feedrate, automatically set to high/current feedrate if not specified
 * @param {String} mode mode TCPON | TCPOFF | TWPON | TWPOFF | TOOLCHANGE | RETRACTTOOLAXIS
 * @param {String} coordinates WORK | MACHINE - if undefined, work coordinates will be used by default
 * @param {Number} eulerAngles the calculated Euler angles for the workplane
 * @example
  machineSimulation({a:abc.x, b:abc.y, c:abc.z, coordinates:MACHINE});
  machineSimulation({x:toPreciseUnit(200, MM), y:toPreciseUnit(200, MM), coordinates:MACHINE, mode:TOOLCHANGE});
*/
function machineSimulation(parameters) {
  if (revision < 50198 || skipBlocks || (getSimulationStreamPath() == "" && !debugSimulation)) {
    return; // return when post kernel revision is lower than 50198 or when skipBlocks is enabled
  }
  getAxisLimit = function(axis, limit) {
    validate(limit == MIN || limit == MAX, subst(localize("Invalid argument \"%1\" passed to the machineSimulation function."), limit));
    var range = axis.getRange();
    if (range.isNonRange()) {
      var axisLetters = ["X", "Y", "Z"];
      var warningMessage = subst(localize("An attempt was made to move the \"%1\" axis to its MIN/MAX limits during machine simulation, but its range is set to \"unlimited\"." + EOL +
        "A limited range must be set for the \"%1\" axis in the machine definition, or these motions will not be shown in machine simulation."), axisLetters[axis.getCoordinate()]);
      warningOnce(warningMessage, WARNING_NON_RANGE[axis.getCoordinate()]);
      return undefined;
    }
    return limit == MIN ? range.minimum : range.maximum;
  };
  var x = (isNaN(parameters.x) && parameters.x) ? getAxisLimit(machineConfiguration.getAxisX(), parameters.x) : parameters.x;
  var y = (isNaN(parameters.y) && parameters.y) ? getAxisLimit(machineConfiguration.getAxisY(), parameters.y) : parameters.y;
  var z = (isNaN(parameters.z) && parameters.z) ? getAxisLimit(machineConfiguration.getAxisZ(), parameters.z) : parameters.z;
  var rotaryAxesErrorMessage = localize("Invalid argument for rotary axes passed to the machineSimulation function. Only numerical values are supported.");
  var a = (isNaN(parameters.a) && parameters.a) ? error(rotaryAxesErrorMessage) : parameters.a;
  var b = (isNaN(parameters.b) && parameters.b) ? error(rotaryAxesErrorMessage) : parameters.b;
  var c = (isNaN(parameters.c) && parameters.c) ? error(rotaryAxesErrorMessage) : parameters.c;
  var coordinates = parameters.coordinates;
  var eulerAngles = parameters.eulerAngles;
  var feed = parameters.feed;
  if (feed === undefined && typeof gMotionModal !== "undefined") {
    feed = gMotionModal.getCurrent() !== 0;
  }
  var mode = parameters.mode;
  var performToolChange = mode == TOOLCHANGE;
  if (mode !== undefined && ![TCPON, TCPOFF, TWPON, TWPOFF, TOOLCHANGE, RETRACTTOOLAXIS].includes(mode)) {
    error(subst("Mode '%1' is not supported.", mode));
  }

  // mode takes precedence over TCP/TWP states
  var enableTCP = isTcpOn;
  var enableTWP = isTwpOn;
  if (mode === TCPON || mode === TCPOFF) {
    enableTCP = mode === TCPON;
  } else if (mode === TWPON || mode === TWPOFF) {
    enableTWP = mode === TWPON;
  } else {
    enableTCP = typeof state !== "undefined" && state.tcpIsActive;
    enableTWP = typeof state !== "undefined" && state.twpIsActive;
  }
  var disableTCP = !enableTCP;
  var disableTWP = !enableTWP;
  if (disableTWP) {
    simulation.setTWPModeOff();
    isTwpOn = false;
  }
  if (disableTCP) {
    simulation.setTCPModeOff();
    isTcpOn = false;
  }
  if (enableTCP) {
    simulation.setTCPModeOn();
    isTcpOn = true;
  }
  if (enableTWP) {
    if (settings.workPlaneMethod.eulerConvention == undefined) {
      simulation.setTWPModeAlignToCurrentPose();
    } else if (eulerAngles) {
      simulation.setTWPModeByEulerAngles(settings.workPlaneMethod.eulerConvention, eulerAngles.x, eulerAngles.y, eulerAngles.z);
    }
    isTwpOn = true;
  }
  if (mode == RETRACTTOOLAXIS) {
    simulation.retractAlongToolAxisToLimit();
  }

  if (debugSimulation) {
    writeln("  DEBUG" + JSON.stringify(parameters));
    writeln("  DEBUG" + JSON.stringify({isTwpOn:isTwpOn, isTcpOn:isTcpOn, feed:feed}));
  }

  if (x !== undefined || y !== undefined || z !== undefined || a !== undefined || b !== undefined || c !== undefined) {
    if (x !== undefined) {simulation.setTargetX(x);}
    if (y !== undefined) {simulation.setTargetY(y);}
    if (z !== undefined) {simulation.setTargetZ(z);}
    if (a !== undefined) {simulation.setTargetA(a);}
    if (b !== undefined) {simulation.setTargetB(b);}
    if (c !== undefined) {simulation.setTargetC(c);}

    if (feed != undefined && feed) {
      simulation.setMotionToLinear();
      simulation.setFeedrate(typeof feed == "number" ? feed : feedOutput.getCurrent() == 0 ? highFeedrate : feedOutput.getCurrent());
    } else {
      simulation.setMotionToRapid();
    }

    if (coordinates != undefined && coordinates == MACHINE) {
      simulation.moveToTargetInMachineCoords();
    } else {
      simulation.moveToTargetInWorkCoords();
    }
  }
  if (performToolChange) {
    simulation.performToolChangeCycle();
    simulation.moveToTargetInMachineCoords();
  }
}
// <<<<< INCLUDED FROM include_files/commonFunctions.cpi
// >>>>> INCLUDED FROM include_files/defineWorkPlane.cpi
validate(settings.workPlaneMethod, "Setting 'workPlaneMethod' is required but not defined.");
function defineWorkPlane(_section, _setWorkPlane) {
  var abc = new Vector(0, 0, 0);
  if (settings.workPlaneMethod.forceMultiAxisIndexing || !is3D() || machineConfiguration.isMultiAxisConfiguration()) {
    if (isPolarModeActive()) {
      abc = getCurrentDirection();
    } else if (_section.isMultiAxis()) {
      forceWorkPlane();
      cancelTransformation();
      abc = _section.isOptimizedForMachine() ? _section.getInitialToolAxisABC() : _section.getGlobalInitialToolAxis();
    } else if (settings.workPlaneMethod.useTiltedWorkplane && settings.workPlaneMethod.eulerConvention != undefined) {
      if (settings.workPlaneMethod.eulerCalculationMethod == "machine" && machineConfiguration.isMultiAxisConfiguration()) {
        abc = machineConfiguration.getOrientation(getWorkPlaneMachineABC(_section, true)).getEuler2(settings.workPlaneMethod.eulerConvention);
      } else {
        abc = _section.workPlane.getEuler2(settings.workPlaneMethod.eulerConvention);
      }
    } else {
      abc = getWorkPlaneMachineABC(_section, true);
    }

    if (_setWorkPlane) {
      if (_section.isMultiAxis() || isPolarModeActive()) { // 4-5x simultaneous operations
        cancelWorkPlane();
        if (_section.isOptimizedForMachine()) {
          positionABC(abc, true);
        } else {
          setCurrentDirection(abc);
        }
      } else { // 3x and/or 3+2x operations
        setWorkPlane(abc);
      }
    }
  } else {
    var remaining = _section.workPlane;
    if (!isSameDirection(remaining.forward, new Vector(0, 0, 1))) {
      error(localize("Tool orientation is not supported."));
      return abc;
    }
    setRotation(remaining);
  }
  tcp.isSupportedByOperation = isTCPSupportedByOperation(_section);
  return abc;
}

function isTCPSupportedByOperation(_section) {
  var _tcp = _section.getOptimizedTCPMode() == OPTIMIZE_NONE;
  if (!_section.isMultiAxis() && (settings.workPlaneMethod.useTiltedWorkplane ||
    (machineConfiguration.isMultiAxisConfiguration() && settings.workPlaneMethod.optimizeType != undefined ?
      getWorkPlaneMachineABC(_section, false).isZero() : isSameDirection(machineConfiguration.getSpindleAxis(), getForwardDirection(_section))) ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_HEADS ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_TABLES ||
    settings.workPlaneMethod.optimizeType == OPTIMIZE_BOTH)) {
    _tcp = false;
  }
  return _tcp;
}
// <<<<< INCLUDED FROM include_files/defineWorkPlane.cpi
// >>>>> INCLUDED FROM include_files/getWorkPlaneMachineABC.cpi
validate(settings.machineAngles, "Setting 'machineAngles' is required but not defined.");
function getWorkPlaneMachineABC(_section, rotate) {
  var currentABC = isFirstSection() ? new Vector(0, 0, 0) : getCurrentABC();
  var abc = _section.getABCByPreference(machineConfiguration, _section.workPlane, currentABC, settings.machineAngles.controllingAxis, settings.machineAngles.type, settings.machineAngles.options);
  if (!isSameDirection(machineConfiguration.getDirection(abc), _section.workPlane.forward)) {
    error(localize("Orientation not supported."));
  }
  if (rotate) {
    if (settings.workPlaneMethod.optimizeType == undefined || settings.workPlaneMethod.useTiltedWorkplane) { // legacy
      var useTCP = false;
      var R = machineConfiguration.getRemainingOrientation(abc, _section.workPlane);
      setRotation(useTCP ? _section.workPlane : R);
    } else {
      if (!_section.isOptimizedForMachine()) {
        machineConfiguration.setToolLength(getSetting("workPlaneMethod.compensateToolLength", false) ? getBodyLength(_section.getTool()) : 0); // define the tool length for head adjustments
        _section.optimize3DPositionsByMachine(machineConfiguration, abc, settings.workPlaneMethod.optimizeType);
      }
    }
  }
  return abc;
}
// <<<<< INCLUDED FROM include_files/getWorkPlaneMachineABC.cpi
// >>>>> INCLUDED FROM include_files/positionABC.cpi
function positionABC(abc, force) {
  if (!machineConfiguration.isMultiAxisConfiguration()) {
    error("Function 'positionABC' can only be used with multi-axis machine configurations.");
  }
  if (typeof unwindABC == "function") {
    unwindABC(abc);
  }
  if (force) {
    forceABC();
  }
  var a = aOutput.format(abc.x);
  var b = bOutput.format(abc.y);
  var c = cOutput.format(abc.z);
  if (a || b || c) {
    writeRetract(Z);
    if (getSetting("retract.homeXY.onIndexing", false)) {
      writeRetract(settings.retract.homeXY.onIndexing);
    }
    onCommand(COMMAND_UNLOCK_MULTI_AXIS);
    gMotionModal.reset();
    writeBlock(gMotionModal.format(0), a, b, c);
    setCurrentABC(abc); // required for machine simulation
    machineSimulation({a:abc.x, b:abc.y, c:abc.z, coordinates:MACHINE});
  }
}
// <<<<< INCLUDED FROM include_files/positionABC.cpi
// >>>>> INCLUDED FROM include_files/unwindABC.cpi
function unwindABC(abc) {
  if (settings.unwind == undefined || machineConfiguration.isHeadConfiguration()) {
    return;
  }
  if (settings.unwind.method != 1 && settings.unwind.method != 2) {
    error(localize("Unsupported unwindABC method."));
    return;
  }

  var axes = new Array(machineConfiguration.getAxisU(), machineConfiguration.getAxisV(), machineConfiguration.getAxisW());
  var currentDirection = getCurrentDirection();
  for (var i in axes) {
    if (axes[i].isEnabled() && axes[i].isCyclic() && (settings.unwind.useAngle != "prefix" || settings.unwind.anglePrefix[axes[i].getCoordinate] != "")) {
      var j = axes[i].getCoordinate();

      // only use the active axis in calculations
      var tempABC = new Vector(0, 0, 0);
      tempABC.setCoordinate(j, abc.getCoordinate(j));
      var tempCurrent = new Vector(0, 0, 0); // only use the active axis in calculations
      tempCurrent.setCoordinate(j, currentDirection.getCoordinate(j));
      var orientation = machineConfiguration.getOrientation(tempCurrent);

      // get closest angle without respecting 'reset' flag
      // and distance from previous angle to closest abc
      var nearestABC = machineConfiguration.getABCByPreference(orientation, tempABC, ABC, PREFER_PREFERENCE, ENABLE_WCS);
      var distanceABC = abcFormat.getResultingValue(Math.abs(Vector.diff(getCurrentDirection(), abc).getCoordinate(j)));

      // calculate distance from calculated abc to closest abc
      // include move to origin for G28 moves
      var distanceOrigin = 0;
      if (settings.unwind.method == 2) {
        distanceOrigin = abcFormat.getResultingValue(Math.abs(Vector.diff(nearestABC, abc).getCoordinate(j)));
      } else { // closest angle
        distanceOrigin = abcFormat.getResultingValue(Math.abs(getCurrentDirection().getCoordinate(j))) % 360; // calculate distance for unwinding axis
        distanceOrigin = (distanceOrigin > 180) ? 360 - distanceOrigin : distanceOrigin; // take shortest route to 0
        distanceOrigin += abcFormat.getResultingValue(Math.abs(abc.getCoordinate(j))); // add distance from 0 to new position
      }

      // determine if the axis needs to be rewound and rewind it if required
      var revolutions = distanceABC / 360;
      var angle = settings.unwind.method == 2 ? nearestABC.getCoordinate(j) : 0;
      if (distanceABC > distanceOrigin && (settings.unwind.method == 2 || (revolutions > 1))) { // G28 method will move rotary, so make sure move is greater than 360 degrees
        writeRetract(Z);
        if (getSetting("retract.homeXY.onIndexing", false)) {
          writeRetract(settings.retract.homeXY.onIndexing);
        }
        onCommand(COMMAND_UNLOCK_MULTI_AXIS);
        var outputs = [aOutput, bOutput, cOutput];
        outputs[j].reset();
        writeBlock(
          settings.unwind.codes,
          settings.unwind.workOffsetCode ? settings.unwind.workOffsetCode + currentWorkOffset : "",
          settings.unwind.useAngle == "true" ? outputs[j].format(angle) :
            (settings.unwind.useAngle == "prefix" ? settings.unwind.anglePrefix[j] + abcFormat.format(angle) : "")
        );
        if (settings.unwind.resetG90) {
          gAbsIncModal.reset();
          writeBlock(gAbsIncModal.format(90));
        }
        outputs[j].reset();

        // set the current rotary axis angle from the unwind block
        currentDirection.setCoordinate(j, angle);
        setCurrentDirection(currentDirection);
      }
    }
  }
}
// <<<<< INCLUDED FROM include_files/unwindABC.cpi
// >>>>> INCLUDED FROM include_files/writeToolCall.cpi
function writeToolCall(tool, insertToolCall) {
  if (!isFirstSection()) {
    writeStartBlocks(!getProperty("safeStartAllOperations") && insertToolCall, function () {
      writeRetract(Z); // write optional Z retract before tool change if safeStartAllOperations is enabled
    });
  }
  writeStartBlocks(insertToolCall, function () {
    writeRetract(Z);
    if (getSetting("retract.homeXY.onToolChange", false)) {
      writeRetract(settings.retract.homeXY.onToolChange);
    }
    if (!isFirstSection() && insertToolCall) {
      if (typeof forceWorkPlane == "function") {
        forceWorkPlane();
      }
      onCommand(COMMAND_COOLANT_OFF); // turn off coolant on tool change
      if (typeof disableLengthCompensation == "function") {
        disableLengthCompensation(false);
      }
    }

    if (tool.manualToolChange) {
      onCommand(COMMAND_STOP);
      writeComment("MANUAL TOOL CHANGE TO T" + toolFormat.format(tool.number));
    } else {
      if (!isFirstSection() && getProperty("optionalStop") && insertToolCall) {
        onCommand(COMMAND_OPTIONAL_STOP);
      }
      onCommand(COMMAND_LOAD_TOOL);
    }
  });
  if (typeof forceModals == "function" && (insertToolCall || getProperty("safeStartAllOperations"))) {
    forceModals();
  }
}
// <<<<< INCLUDED FROM include_files/writeToolCall.cpi
// >>>>> INCLUDED FROM include_files/startSpindle.cpi
function startSpindle(tool, insertToolCall) {
  if (tool.type != TOOL_PROBE) {
    var spindleSpeedIsRequired = insertToolCall || forceSpindleSpeed || isFirstSection() ||
      rpmFormat.areDifferent(spindleSpeed, sOutput.getCurrent()) ||
      (tool.clockwise != getPreviousSection().getTool().clockwise);

    writeStartBlocks(spindleSpeedIsRequired, function () {
      if (spindleSpeedIsRequired || operationNeedsSafeStart) {
        onCommand(COMMAND_START_SPINDLE);
      }
    });
  }
}
// <<<<< INCLUDED FROM include_files/startSpindle.cpi
// >>>>> INCLUDED FROM include_files/parametricFeeds.cpi
properties.useParametricFeed = {
  title      : "Parametric feed",
  description: "Specifies that the feedrates should be output using parameters.",
  group      : "preferences",
  type       : "boolean",
  value      : false,
  scope      : "post"
};
var activeMovements;
var currentFeedId;
validate(settings.parametricFeeds, "Setting 'parametricFeeds' is required but not defined.");
function initializeParametricFeeds(insertToolCall) {
  if (getProperty("useParametricFeed") && getParameter("operation-strategy") != "drill" && !currentSection.hasAnyCycle()) {
    if (!insertToolCall && activeMovements && (getCurrentSectionId() > 0) &&
      ((getPreviousSection().getPatternId() == currentSection.getPatternId()) && (currentSection.getPatternId() != 0))) {
      return; // use the current feeds
    }
  } else {
    activeMovements = undefined;
    return;
  }

  activeMovements = new Array();
  var movements = currentSection.getMovements();

  var id = 0;
  var activeFeeds = new Array();
  if (hasParameter("operation:tool_feedCutting")) {
    if (movements & ((1 << MOVEMENT_CUTTING) | (1 << MOVEMENT_LINK_TRANSITION) | (1 << MOVEMENT_EXTENDED))) {
      var feedContext = new FeedContext(id, localize("Cutting"), getParameter("operation:tool_feedCutting"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_CUTTING] = feedContext;
      if (!hasParameter("operation:tool_feedTransition")) {
        activeMovements[MOVEMENT_LINK_TRANSITION] = feedContext;
      }
      activeMovements[MOVEMENT_EXTENDED] = feedContext;
    }
    ++id;
    if (movements & (1 << MOVEMENT_PREDRILL)) {
      feedContext = new FeedContext(id, localize("Predrilling"), getParameter("operation:tool_feedCutting"));
      activeMovements[MOVEMENT_PREDRILL] = feedContext;
      activeFeeds.push(feedContext);
    }
    ++id;
  }
  if (hasParameter("operation:finishFeedrate")) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize("Finish"), getParameter("operation:finishFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  } else if (hasParameter("operation:tool_feedCutting")) {
    if (movements & (1 << MOVEMENT_FINISH_CUTTING)) {
      var feedContext = new FeedContext(id, localize("Finish"), getParameter("operation:tool_feedCutting"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_FINISH_CUTTING] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedEntry")) {
    if (movements & (1 << MOVEMENT_LEAD_IN)) {
      var feedContext = new FeedContext(id, localize("Entry"), getParameter("operation:tool_feedEntry"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_IN] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedExit")) {
    if (movements & (1 << MOVEMENT_LEAD_OUT)) {
      var feedContext = new FeedContext(id, localize("Exit"), getParameter("operation:tool_feedExit"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LEAD_OUT] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:noEngagementFeedrate")) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize("Direct"), getParameter("operation:noEngagementFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  } else if (hasParameter("operation:tool_feedCutting") &&
             hasParameter("operation:tool_feedEntry") &&
             hasParameter("operation:tool_feedExit")) {
    if (movements & (1 << MOVEMENT_LINK_DIRECT)) {
      var feedContext = new FeedContext(id, localize("Direct"), Math.max(getParameter("operation:tool_feedCutting"), getParameter("operation:tool_feedEntry"), getParameter("operation:tool_feedExit")));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_DIRECT] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:reducedFeedrate")) {
    if (movements & (1 << MOVEMENT_REDUCED)) {
      var feedContext = new FeedContext(id, localize("Reduced"), getParameter("operation:reducedFeedrate"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_REDUCED] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedRamp")) {
    if (movements & ((1 << MOVEMENT_RAMP) | (1 << MOVEMENT_RAMP_HELIX) | (1 << MOVEMENT_RAMP_PROFILE) | (1 << MOVEMENT_RAMP_ZIG_ZAG))) {
      var feedContext = new FeedContext(id, localize("Ramping"), getParameter("operation:tool_feedRamp"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_RAMP] = feedContext;
      activeMovements[MOVEMENT_RAMP_HELIX] = feedContext;
      activeMovements[MOVEMENT_RAMP_PROFILE] = feedContext;
      activeMovements[MOVEMENT_RAMP_ZIG_ZAG] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedPlunge")) {
    if (movements & (1 << MOVEMENT_PLUNGE)) {
      var feedContext = new FeedContext(id, localize("Plunge"), getParameter("operation:tool_feedPlunge"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_PLUNGE] = feedContext;
    }
    ++id;
  }
  if (true) { // high feed
    if ((movements & (1 << MOVEMENT_HIGH_FEED)) || (highFeedMapping != HIGH_FEED_NO_MAPPING)) {
      var feed;
      if (hasParameter("operation:highFeedrateMode") && getParameter("operation:highFeedrateMode") != "disabled") {
        feed = getParameter("operation:highFeedrate");
      } else {
        feed = this.highFeedrate;
      }
      var feedContext = new FeedContext(id, localize("High Feed"), feed);
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_HIGH_FEED] = feedContext;
      activeMovements[MOVEMENT_RAPID] = feedContext;
    }
    ++id;
  }
  if (hasParameter("operation:tool_feedTransition")) {
    if (movements & (1 << MOVEMENT_LINK_TRANSITION)) {
      var feedContext = new FeedContext(id, localize("Transition"), getParameter("operation:tool_feedTransition"));
      activeFeeds.push(feedContext);
      activeMovements[MOVEMENT_LINK_TRANSITION] = feedContext;
    }
    ++id;
  }

  for (var i = 0; i < activeFeeds.length; ++i) {
    var feedContext = activeFeeds[i];
    var feedDescription = typeof formatComment == "function" ? formatComment(feedContext.description) : feedContext.description;
    writeBlock(settings.parametricFeeds.feedAssignmentVariable + (settings.parametricFeeds.firstFeedParameter + feedContext.id) + "=" + feedFormat.format(feedContext.feed) + SP + feedDescription);
  }
}

function FeedContext(id, description, feed) {
  this.id = id;
  this.description = description;
  this.feed = feed;
}
// <<<<< INCLUDED FROM include_files/parametricFeeds.cpi
// >>>>> INCLUDED FROM include_files/coolant.cpi
var currentCoolantMode = COOLANT_OFF;
var coolantOff = undefined;
var isOptionalCoolant = false;
var forceCoolant = false;

function setCoolant(coolant) {
  var coolantCodes = getCoolantCodes(coolant);
  if (Array.isArray(coolantCodes)) {
    writeStartBlocks(!isOptionalCoolant, function () {
      if (settings.coolant.singleLineCoolant) {
        writeBlock(coolantCodes.join(getWordSeparator()));
      } else {
        for (var c in coolantCodes) {
          writeBlock(coolantCodes[c]);
        }
      }
    });
    return undefined;
  }
  return coolantCodes;
}

function getCoolantCodes(coolant, format) {
  if (!getProperty("useCoolant", true)) {
    return undefined; // coolant output is disabled by property if it exists
  }
  isOptionalCoolant = false;
  if (typeof operationNeedsSafeStart == "undefined") {
    operationNeedsSafeStart = false;
  }
  var multipleCoolantBlocks = new Array(); // create a formatted array to be passed into the outputted line
  var coolants = settings.coolant.coolants;
  if (!coolants) {
    error(localize("Coolants have not been defined."));
  }
  if (tool.type && tool.type == TOOL_PROBE) { // avoid coolant output for probing
    coolant = COOLANT_OFF;
  }
  if (coolant == currentCoolantMode) {
    if (operationNeedsSafeStart && coolant != COOLANT_OFF) {
      isOptionalCoolant = true;
    } else if (!forceCoolant || coolant == COOLANT_OFF) {
      return undefined; // coolant is already active
    }
  }
  if ((coolant != COOLANT_OFF) && (currentCoolantMode != COOLANT_OFF) && (coolantOff != undefined) && !forceCoolant && !isOptionalCoolant) {
    if (Array.isArray(coolantOff)) {
      for (var i in coolantOff) {
        multipleCoolantBlocks.push(coolantOff[i]);
      }
    } else {
      multipleCoolantBlocks.push(coolantOff);
    }
  }
  forceCoolant = false;

  var m;
  var coolantCodes = {};
  for (var c in coolants) { // find required coolant codes into the coolants array
    if (coolants[c].id == coolant) {
      coolantCodes.on = coolants[c].on;
      if (coolants[c].off != undefined) {
        coolantCodes.off = coolants[c].off;
        break;
      } else {
        for (var i in coolants) {
          if (coolants[i].id == COOLANT_OFF) {
            coolantCodes.off = coolants[i].off;
            break;
          }
        }
      }
    }
  }
  if (coolant == COOLANT_OFF) {
    m = !coolantOff ? coolantCodes.off : coolantOff; // use the default coolant off command when an 'off' value is not specified
  } else {
    coolantOff = coolantCodes.off;
    m = coolantCodes.on;
  }

  if (!m) {
    onUnsupportedCoolant(coolant);
    m = 9;
  } else {
    if (Array.isArray(m)) {
      for (var i in m) {
        multipleCoolantBlocks.push(m[i]);
      }
    } else {
      multipleCoolantBlocks.push(m);
    }
    currentCoolantMode = coolant;
    for (var i in multipleCoolantBlocks) {
      if (typeof multipleCoolantBlocks[i] == "number") {
        multipleCoolantBlocks[i] = mFormat.format(multipleCoolantBlocks[i]);
      }
    }
    if (format == undefined || format) {
      return multipleCoolantBlocks; // return the single formatted coolant value
    } else {
      return m; // return unformatted coolant value
    }
  }
  return undefined;
}
// <<<<< INCLUDED FROM include_files/coolant.cpi
// >>>>> INCLUDED FROM include_files/writeProgramHeader.cpi
properties.writeMachine = {
  title      : "Write machine",
  description: "Output the machine settings in the header of the program.",
  group      : "formats",
  type       : "boolean",
  value      : true,
  scope      : "post"
};
properties.writeTools = {
  title      : "Write tool list",
  description: "Output a tool list in the header of the program.",
  group      : "formats",
  type       : "boolean",
  value      : true,
  scope      : "post"
};
function writeProgramHeader() {
  // dump machine configuration
  var vendor = machineConfiguration.getVendor();
  var model = machineConfiguration.getModel();
  var mDescription = machineConfiguration.getDescription();
  if (getProperty("writeMachine") && (vendor || model || mDescription)) {
    writeComment(localize("Machine"));
    if (vendor) {
      writeComment("  " + localize("vendor") + ": " + vendor);
    }
    if (model) {
      writeComment("  " + localize("model") + ": " + model);
    }
    if (mDescription) {
      writeComment("  " + localize("description") + ": " + mDescription);
    }
  }

  // dump tool information
  if (getProperty("writeTools")) {
    if (false) { // set to true to use the post kernel version of the tool list
      writeToolTable(TOOL_NUMBER_COL);
    } else {
      var zRanges = {};
      if (is3D()) {
        var numberOfSections = getNumberOfSections();
        for (var i = 0; i < numberOfSections; ++i) {
          var section = getSection(i);
          var zRange = section.getGlobalZRange();
          var tool = section.getTool();
          if (zRanges[tool.number]) {
            zRanges[tool.number].expandToRange(zRange);
          } else {
            zRanges[tool.number] = zRange;
          }
        }
      }
      var tools = getToolTable();
      if (tools.getNumberOfTools() > 0) {
        for (var i = 0; i < tools.getNumberOfTools(); ++i) {
          var tool = tools.getTool(i);
          var comment = (getProperty("toolAsName") ? "\"" + tool.description.toUpperCase() + "\"" : "T" + toolFormat.format(tool.number)) + " " +
          "D=" + xyzFormat.format(tool.diameter) + " " +
          localize("CR") + "=" + xyzFormat.format(tool.cornerRadius);
          if ((tool.taperAngle > 0) && (tool.taperAngle < Math.PI)) {
            comment += " " + localize("TAPER") + "=" + taperFormat.format(tool.taperAngle) + localize("deg");
          }
          if (zRanges[tool.number]) {
            comment += " - " + localize("ZMIN") + "=" + xyzFormat.format(zRanges[tool.number].getMinimum());
          }
          comment += " - " + getToolTypeName(tool.type);
          writeComment(comment);
        }
      }
    }
  }
}
// <<<<< INCLUDED FROM include_files/writeProgramHeader.cpi

// >>>>> INCLUDED FROM include_files/onRapid_fanuc.cpi
function onRapid(_x, _y, _z) {
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      error(localize("Radius compensation mode cannot be changed at rapid traversal."));
      return;
    }
    writeBlock(gMotionModal.format(0), x, y, z);
    forceFeed();
  }
}
// <<<<< INCLUDED FROM include_files/onRapid_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onLinear_fanuc.cpi
function onLinear(_x, _y, _z, feed) {
  if (pendingRadiusCompensation >= 0) {
    xOutput.reset();
    yOutput.reset();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var f = getFeed(feed);
  if (x || y || z) {
    if (pendingRadiusCompensation >= 0) {
      pendingRadiusCompensation = -1;
      var d = getSetting("outputToolDiameterOffset", true) ? diameterOffsetFormat.format(tool.diameterOffset) : "";
      writeBlock(gPlaneModal.format(17));
      switch (radiusCompensation) {
      case RADIUS_COMPENSATION_LEFT:
        writeBlock(gMotionModal.format(1), gFormat.format(41), x, y, z, d, f);
        break;
      case RADIUS_COMPENSATION_RIGHT:
        writeBlock(gMotionModal.format(1), gFormat.format(42), x, y, z, d, f);
        break;
      default:
        writeBlock(gMotionModal.format(1), gFormat.format(40), x, y, z, f);
      }
    } else {
      writeBlock(gMotionModal.format(1), x, y, z, f);
    }
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gMotionModal.format(1), f);
    }
  }
}
// <<<<< INCLUDED FROM include_files/onLinear_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onRapid5D_fanuc.cpi
function onRapid5D(_x, _y, _z, _a, _b, _c) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation mode cannot be changed at rapid traversal."));
    return;
  }
  if (!currentSection.isOptimizedForMachine()) {
    forceXYZ();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = currentSection.isOptimizedForMachine() ? aOutput.format(_a) : toolVectorOutputI.format(_a);
  var b = currentSection.isOptimizedForMachine() ? bOutput.format(_b) : toolVectorOutputJ.format(_b);
  var c = currentSection.isOptimizedForMachine() ? cOutput.format(_c) : toolVectorOutputK.format(_c);

  if (x || y || z || a || b || c) {
    writeBlock(gMotionModal.format(0), x, y, z, a, b, c);
    forceFeed();
  }
}
// <<<<< INCLUDED FROM include_files/onRapid5D_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onLinear5D_fanuc.cpi
function onLinear5D(_x, _y, _z, _a, _b, _c, feed, feedMode) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation cannot be activated/deactivated for 5-axis move."));
    return;
  }
  if (!currentSection.isOptimizedForMachine()) {
    forceXYZ();
  }
  var x = xOutput.format(_x);
  var y = yOutput.format(_y);
  var z = zOutput.format(_z);
  var a = currentSection.isOptimizedForMachine() ? aOutput.format(_a) : toolVectorOutputI.format(_a);
  var b = currentSection.isOptimizedForMachine() ? bOutput.format(_b) : toolVectorOutputJ.format(_b);
  var c = currentSection.isOptimizedForMachine() ? cOutput.format(_c) : toolVectorOutputK.format(_c);
  if (feedMode == FEED_INVERSE_TIME) {
    forceFeed();
  }
  var f = feedMode == FEED_INVERSE_TIME ? inverseTimeOutput.format(feed) : getFeed(feed);
  var fMode = feedMode == FEED_INVERSE_TIME ? 93 : getProperty("useG95") ? 95 : 94;

  if (x || y || z || a || b || c) {
    writeBlock(gFeedModeModal.format(fMode), gMotionModal.format(1), x, y, z, a, b, c, f);
  } else if (f) {
    if (getNextRecord().isMotion()) { // try not to output feed without motion
      forceFeed(); // force feed on next line
    } else {
      writeBlock(gFeedModeModal.format(fMode), gMotionModal.format(1), f);
    }
  }
}
// <<<<< INCLUDED FROM include_files/onLinear5D_fanuc.cpi
// >>>>> INCLUDED FROM include_files/onCircular_fanuc.cpi
function onCircular(clockwise, cx, cy, cz, x, y, z, feed) {
  if (pendingRadiusCompensation >= 0) {
    error(localize("Radius compensation cannot be activated/deactivated for a circular move."));
    return;
  }

  var start = getCurrentPosition();

  if (isFullCircle()) {
    if (getProperty("useRadius") || isHelical()) { // radius mode does not support full arcs
      linearize(tolerance);
      return;
    }
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x), jOutput.format(cy - start.y), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), iOutput.format(cx - start.x), kOutput.format(cz - start.z), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), jOutput.format(cy - start.y), kOutput.format(cz - start.z), getFeed(feed));
      break;
    default:
      linearize(tolerance);
    }
  } else if (!getProperty("useRadius")) {
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x), jOutput.format(cy - start.y), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), iOutput.format(cx - start.x), kOutput.format(cz - start.z), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), jOutput.format(cy - start.y), kOutput.format(cz - start.z), getFeed(feed));
      break;
    default:
      if (getProperty("allow3DArcs")) {
        // make sure maximumCircularSweep is well below 360deg
        // we could use G02.4 or G03.4 - direction is calculated
        var ip = getPositionU(0.5);
        writeBlock(gMotionModal.format(clockwise ? 2.4 : 3.4), xOutput.format(ip.x), yOutput.format(ip.y), zOutput.format(ip.z), getFeed(feed));
        writeBlock(xOutput.format(x), yOutput.format(y), zOutput.format(z));
      } else {
        linearize(tolerance);
      }
    }
  } else { // use radius mode
    var r = getCircularRadius();
    if (toDeg(getCircularSweep()) > (180 + 1e-9)) {
      r = -r; // allow up to <360 deg arcs
    }
    switch (getCircularPlane()) {
    case PLANE_XY:
      writeBlock(gPlaneModal.format(17), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    case PLANE_ZX:
      writeBlock(gPlaneModal.format(18), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    case PLANE_YZ:
      writeBlock(gPlaneModal.format(19), gMotionModal.format(clockwise ? 2 : 3), xOutput.format(x), yOutput.format(y), zOutput.format(z), "R" + rFormat.format(r), getFeed(feed));
      break;
    default:
      if (getProperty("allow3DArcs")) {
        // make sure maximumCircularSweep is well below 360deg
        // we could use G02.4 or G03.4 - direction is calculated
        var ip = getPositionU(0.5);
        writeBlock(gMotionModal.format(clockwise ? 2.4 : 3.4), xOutput.format(ip.x), yOutput.format(ip.y), zOutput.format(ip.z), getFeed(feed));
        writeBlock(xOutput.format(x), yOutput.format(y), zOutput.format(z));
      } else {
        linearize(tolerance);
      }
    }
  }
}
// <<<<< INCLUDED FROM include_files/onCircular_fanuc.cpi
// >>>>> INCLUDED FROM include_files/writeRetract_fanuc.cpi
function writeRetract() {
  var retract = getRetractParameters.apply(this, arguments);
  if (retract && retract.words.length > 0) {
    if (typeof cancelWCSRotation == "function" && getSetting("retract.cancelRotationOnRetracting", false)) { // cancel rotation before retracting
      cancelWCSRotation();
    }
    if (typeof disableLengthCompensation == "function" && getSetting("allowCancelTCPBeforeRetracting", false) && state.tcpIsActive) {
      disableLengthCompensation(); // cancel TCP before retracting
    }
    for (var i in retract.words) {
      var words = retract.singleLine ? retract.words : retract.words[i];
      switch (retract.method) {
      case "G28":
        forceModals(gMotionModal, gAbsIncModal);
        writeBlock(gFormat.format(28), gAbsIncModal.format(91), words);
        writeBlock(gAbsIncModal.format(90));
        break;
      case "G30":
        forceModals(gMotionModal, gAbsIncModal);
        writeBlock(gFormat.format(30), gAbsIncModal.format(91), words);
        writeBlock(gAbsIncModal.format(90));
        break;
      case "G53":
        forceModals(gMotionModal);
        writeBlock(gAbsIncModal.format(90), gFormat.format(53), gMotionModal.format(0), words);
        break;
      default:
        if (typeof writeRetractCustom == "function") {
          writeRetractCustom(retract);
          return;
        } else {
          error(subst(localize("Unsupported safe position method '%1'"), retract.method));
        }
      }
      machineSimulation({
        x          : retract.singleLine || words.indexOf("X") != -1 ? retract.positions.x : undefined,
        y          : retract.singleLine || words.indexOf("Y") != -1 ? retract.positions.y : undefined,
        z          : retract.singleLine || words.indexOf("Z") != -1 ? retract.positions.z : undefined,
        coordinates: MACHINE
      });
      if (retract.singleLine) {
        break;
      }
    }
  }
}
// <<<<< INCLUDED FROM include_files/writeRetract_fanuc.cpi
// >>>>> INCLUDED FROM include_files/rewind.cpi
function onMoveToSafeRetractPosition() {
  if (!getSetting("allowCancelTCPBeforeRetracting", false)) {
    writeRetract(Z);
  }
  if (state.tcpIsActive) { // cancel TCP so that tool doesn't follow rotaries
    if (typeof setTCP == "function") {
      setTCP(false);
    } else {
      disableLengthCompensation(false);
    }
  }
  writeRetract(Z);
  if (getSetting("retract.homeXY.onIndexing", false)) {
    writeRetract(settings.retract.homeXY.onIndexing);
  }
}

/** Rotate axes to new position above reentry position */
function onRotateAxes(_x, _y, _z, _a, _b, _c) {
  // position rotary axes
  xOutput.disable();
  yOutput.disable();
  zOutput.disable();
  if (typeof unwindABC == "function") {
    unwindABC(new Vector(_a, _b, _c), false);
  }
  onRapid5D(_x, _y, _z, _a, _b, _c);
  setCurrentABC(new Vector(_a, _b, _c));
  machineSimulation({a:_a, b:_b, c:_c, coordinates:MACHINE});
  xOutput.enable();
  yOutput.enable();
  zOutput.enable();
  forceXYZ();
}

/** Return from safe position after indexing rotaries. */
function onReturnFromSafeRetractPosition(_x, _y, _z) {
  if (!machineConfiguration.isHeadConfiguration()) {
    writeInitialPositioning(new Vector(_x, _y, _z), true);
    if (highFeedMapping != HIGH_FEED_NO_MAPPING) {
      onLinear5D(_x, _y, _z, getCurrentDirection().x, getCurrentDirection().y, getCurrentDirection().z, highFeedrate);
    } else {
      onRapid5D(_x, _y, _z, getCurrentDirection().x, getCurrentDirection().y, getCurrentDirection().z);
    }
    machineSimulation({x:_x, y:_y, z:_z, a:getCurrentDirection().x, b:getCurrentDirection().y, c:getCurrentDirection().z});
  } else {
    if (tcp.isSupportedByOperation) {
      if (typeof setTCP == "function") {
        setTCP(true);
      } else {
        writeBlock(getOffsetCode(), hFormat.format(tool.lengthOffset));
      }
    }
    forceXYZ();
    xOutput.reset();
    yOutput.reset();
    zOutput.disable();
    if (highFeedMapping != HIGH_FEED_NO_MAPPING) {
      onLinear(_x, _y, _z, highFeedrate);
    } else {
      onRapid(_x, _y, _z);
    }
    machineSimulation({x:_x, y:_y});
    zOutput.enable();
    invokeOnRapid(_x, _y, _z);
  }
}
// <<<<< INCLUDED FROM include_files/rewind.cpi

properties.writeTools.value = false;
properties.writeMachine.value = false;

// Entry point for the TCM Clinic system
//
// This module imports all of the major feature modules required by the
// application.  Importing a module causes it to execute any side
// effects (such as attaching functions to the `window` object or
// registering event listeners) at load time.  Having a single entry
// point simplifies the script loading in `system.html` and enables
// bundlers or module systems to perform static analysis.

// Initialize Firebase (and expose helpers on `window.firebase`).  This
// import must occur before any module that depends on Firebase.  The
// Firebase initialization module also re-exports certain helpers for
// tree-shakable imports, but here we rely on its side effects on
// `window`.
import './firebase_init.js';

// Import the chat module.  The chat module exposes `initChat` and
// `destroyChat` functions on its module exports and also attaches a
// global `ChatModule` object on `window` for backwards compatibility.
// Importing it here ensures that its event listeners and DOM
// scaffolding code are ready when the user logs in.
import './chat_module.js';

// Import the schedule management module.  This module attaches
// numerous helper functions to the `window` object (prefixed with
// `schedule*`) and also exports those functions for modular
// consumption.  Importing it here makes sure the calendar and
// scheduling functionality is registered.
import './schedule_management.js';

// Import the core system logic.  The legacy `system.js` script
// contains a large collection of functions and side effects wrapped
// within immediately invoked function expressions (IIFEs).  Importing
// it as a module runs its initialization code while keeping its
// top‑level declarations scoped to the module.  The file itself
// attaches necessary functions and variables to the global `window`
// object where required.
import './system.js';

// No additional code is needed here.  All initialization and event
// binding is performed within the imported modules.  Keeping this file
// minimal makes it easier to reason about application startup and
// future refactoring.
// Entry point for your TCM Clinic application.
// This module ties together all of the managers and exposes them on the
// global window object so that you can continue to use inline onclick
// handlers in your HTML or gradually migrate to a more modern framework.

import * as FirebaseConfig from './firebase/config.js';
import * as Auth from './firebase/auth.js';
import PatientManager, { calculateAge, generatePatientNumber } from './managers/PatientManager.js';
import AppointmentManager from './managers/AppointmentManager.js';
import ConsultationManager from './managers/ConsultationManager.js';
import HerbManager from './managers/herbManager.js';
import BillManager from './managers/billManager.js';

// Instantiate managers once and reuse throughout the app.
const patientManager = new PatientManager();
const appointmentManager = new AppointmentManager();
const consultationManager = new ConsultationManager();
const herbManager = new HerbManager();
const billManager = new BillManager();

// Expose firebase services and managers on the window object.
// This preserves backwards compatibility with inline onclick handlers.
window.firebase = FirebaseConfig;
window.auth = Auth;
window.patientManager = patientManager;
window.appointmentManager = appointmentManager;
window.consultationManager = consultationManager;
window.herbManager = herbManager;
window.billManager = billManager;

// Expose some helper functions directly on window for convenience.
window.calculateAge = calculateAge;
window.generatePatientNumber = generatePatientNumber;

// Example: you can subscribe to auth changes here and update your UI accordingly.
Auth.onAuthChange((user) => {
  console.log('Auth state changed:', user);
});
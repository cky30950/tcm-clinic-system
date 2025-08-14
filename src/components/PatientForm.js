// Patient form related utilities and UI helpers.
// This module doesn't interact with Firestore directly; instead it
// encapsulates common operations on HTML form fields related to a patient.

import { calculateAge } from '../managers/PatientManager.js';

/**
 * Update an age input field based on a birth date input.  Whenever the user
 * chooses a birth date, call this function to automatically compute and fill
 * in the age.
 * @param {string} birthDateInputId – id of the input type="date"
 * @param {string} ageInputId – id of the input element where the calculated age should appear
 */
export function updateAgeField(birthDateInputId, ageInputId) {
  const birthDateInput = document.getElementById(birthDateInputId);
  const ageInput = document.getElementById(ageInputId);
  if (!birthDateInput || !ageInput) return;
  const birthDate = birthDateInput.value;
  ageInput.value = birthDate ? calculateAge(birthDate) : '';
}

/**
 * Clear all fields in a patient form by specifying their input element ids.
 * Useful when resetting the form after saving.
 * @param {Array<string>} fieldIds
 */
export function clearPatientForm(fieldIds) {
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
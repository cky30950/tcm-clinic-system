// PatientManager encapsulates CRUD operations and related helpers
// for managing patient data.  It uses Firestore via the helper
// functions defined in src/firebase/firestore.js.

import {
  getCollection,
  setDocument,
  updateDocument,
  deleteDocument
} from '../firebase/firestore.js';

/**
 * Calculates a patient's age from their birth date.
 * @param {string} birthDate – ISO date string (YYYY‑MM‑DD)
 * @returns {number}
 */
export function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Generates a formatted patient number based on existing numbers stored
 * in Firestore.  Patient numbers are prefixed with "P" and padded
 * to six digits (e.g. P000123).
 */
export async function generatePatientNumber() {
  const patients = await getCollection('patients');
  const existingNumbers = patients
    .map(p => p.patientNumber)
    .filter(num => num && num.startsWith('P'))
    .map(num => parseInt(num.substring(1)))
    .filter(num => !isNaN(num));
  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const newNumber = maxNumber + 1;
  return `P${newNumber.toString().padStart(6, '0')}`;
}

export default class PatientManager {
  constructor() {
    this.collectionName = 'patients';
  }

  /**
   * Load all patients.
   */
  async getPatients() {
    return getCollection(this.collectionName);
  }

  /**
   * Create a new patient record.  Automatically assigns a patient number if not provided.
   * @param {Object} patient
   */
  async addPatient(patient) {
    if (!patient.patientNumber) {
      patient.patientNumber = await generatePatientNumber();
    }
    // Use timestamp as id if none supplied
    const id = patient.id || String(Date.now());
    await setDocument(this.collectionName, id, patient);
    return id;
  }

  /**
   * Update an existing patient.
   * @param {string} id
   * @param {Object} data
   */
  async updatePatient(id, data) {
    return updateDocument(this.collectionName, id, data);
  }

  /**
   * Delete a patient and all associated data if necessary.
   * @param {string} id
   */
  async deletePatient(id) {
    return deleteDocument(this.collectionName, id);
  }
}
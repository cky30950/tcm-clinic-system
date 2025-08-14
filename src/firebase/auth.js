// Authentication helper functions.
// This module wraps the Firebase Auth API to expose convenient
// login, logout and auth state change helpers.

import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './config.js';

/**
 * Sign in a user using email and password.  Returns a Firebase UserCredential.
 * @param {string} email
 * @param {string} password
 */
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Create a new user with email and password.  Returns a Firebase UserCredential.
 * Useful if you wish to allow user self‑registration.
 * @param {string} email
 * @param {string} password
 */
export async function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Signs out the current authenticated user.
 */
export async function logout() {
  return signOut(auth);
}

/**
 * Subscribe to auth state changes.  The provided callback will be invoked
 * whenever the user's authentication state changes (login/logout).
 * @param {function} callback
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
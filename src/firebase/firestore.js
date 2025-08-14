// Firestore helper functions.
// This module provides convenient wrappers around Firestore
// for common CRUD operations.  Use these helpers from your managers
// to avoid duplicating code across the application.

import {
  db,
  collection as _collection,
  getDocs as _getDocs,
  doc as _doc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  query as _query,
  where as _where,
  orderBy as _orderBy,
  limit as _limit
} from './config.js';
import { getDoc as _getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Fetch all documents from a Firestore collection.
 * @param {string} collectionName
 * @returns {Promise<Array<Object>>}
 */
export async function getCollection(collectionName) {
  const snap = await _getDocs(_collection(db, collectionName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get a single document by id.
 * @param {string} collectionName
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getDocument(collectionName, id) {
  const documentRef = _doc(db, collectionName, id);
  const snap = await _getDoc(documentRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create or overwrite a document by id.
 * @param {string} collectionName
 * @param {string} id
 * @param {Object} data
 */
export async function setDocument(collectionName, id, data) {
  return _setDoc(_doc(db, collectionName, id), data);
}

/**
 * Update a document's fields.
 * @param {string} collectionName
 * @param {string} id
 * @param {Object} data
 */
export async function updateDocument(collectionName, id, data) {
  return _updateDoc(_doc(db, collectionName, id), data);
}

/**
 * Delete a document.
 * @param {string} collectionName
 * @param {string} id
 */
export async function deleteDocument(collectionName, id) {
  return _deleteDoc(_doc(db, collectionName, id));
}

/**
 * Run a query on a collection.
 * @param {string} collectionName
 * @param {Array} conditions – array of [field, operator, value] tuples
 * @param {Object} options – { orderBy: [field, direction], limit: number }
 */
export async function queryCollection(collectionName, conditions = [], options = {}) {
  let q = _query(_collection(db, collectionName));
  for (const [field, op, value] of conditions) {
    q = _query(q, _where(field, op, value));
  }
  if (options.orderBy) {
    q = _query(q, _orderBy(...options.orderBy));
  }
  if (options.limit) {
    q = _query(q, _limit(options.limit));
  }
  const snap = await _getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
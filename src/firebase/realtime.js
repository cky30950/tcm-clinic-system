// Realtime Database helper functions.
// These helpers wrap common operations on the Firebase Realtime Database.

import {
  rtdb,
  ref as _ref,
  set as _set,
  get as _get,
  child as _child,
  push as _push,
  update as _update,
  remove as _remove,
  onValue as _onValue,
  off as _off
} from './config.js';

/**
 * Write a value to the specified path.
 * @param {string} path
 * @param {*} value
 */
export async function setData(path, value) {
  return _set(_ref(rtdb, path), value);
}

/**
 * Read data from a path.  Returns the stored value or null if none exists.
 * @param {string} path
 */
export async function getData(path) {
  const snap = await _get(_ref(rtdb, path));
  return snap.exists() ? snap.val() : null;
}

/**
 * Push a new child node under the given path and set its value.
 * Returns the generated key.
 * @param {string} path
 * @param {*} value
 */
export async function pushData(path, value) {
  const nodeRef = _push(_ref(rtdb, path));
  await _set(nodeRef, value);
  return nodeRef.key;
}

/**
 * Update specific fields at a path.
 * @param {string} path
 * @param {Object} value
 */
export async function updateData(path, value) {
  return _update(_ref(rtdb, path), value);
}

/**
 * Remove the data stored at a path.
 * @param {string} path
 */
export async function removeData(path) {
  return _remove(_ref(rtdb, path));
}

/**
 * Subscribe to changes at a path.  The callback will receive the new value
 * whenever the data changes.  Returns a function that unsubscribes the listener.
 * @param {string} path
 * @param {function} callback
 */
export function subscribe(path, callback) {
  const nodeRef = _ref(rtdb, path);
  const handler = (snap) => {
    callback(snap.val());
  };
  _onValue(nodeRef, handler);
  return () => _off(nodeRef, 'value', handler);
}
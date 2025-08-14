// ConsultationManager encapsulates operations around clinical consultations,
// such as loading a consultation for editing and formatting consultation dates.

import {
  getCollection,
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument
} from '../firebase/firestore.js';

export function parseConsultationDate(dateInput) {
  if (!dateInput) return null;
  try {
    // Firebase Timestamp
    if (dateInput.seconds) {
      return new Date(dateInput.seconds * 1000);
    }
    // String
    if (typeof dateInput === 'string') {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) return d;
    }
    // Date object
    if (dateInput instanceof Date) {
      return dateInput;
    }
    // Number (timestamp)
    if (typeof dateInput === 'number') {
      return new Date(dateInput);
    }
    return null;
  } catch (e) {
    console.error('parseConsultationDate error:', e, dateInput);
    return null;
  }
}

export function formatConsultationDate(dateInput) {
  const date = parseConsultationDate(dateInput);
  if (!date || isNaN(date.getTime())) {
    return '日期未知';
  }
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function formatConsultationDateTime(dateInput) {
  const date = parseConsultationDate(dateInput);
  if (!date || isNaN(date.getTime())) {
    return '時間未知';
  }
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default class ConsultationManager {
  constructor() {
    this.collectionName = 'consultations';
  }

  async getConsultations() {
    return getCollection(this.collectionName);
  }

  async getConsultation(id) {
    return getDocument(this.collectionName, id);
  }

  async addConsultation(data) {
    const id = data.id || String(Date.now());
    await setDocument(this.collectionName, id, data);
    return id;
  }

  async updateConsultation(id, data) {
    return updateDocument(this.collectionName, id, data);
  }

  async deleteConsultation(id) {
    return deleteDocument(this.collectionName, id);
  }
}
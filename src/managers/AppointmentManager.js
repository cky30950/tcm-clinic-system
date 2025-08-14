// AppointmentManager encapsulates operations related to appointment booking
// and day‑of appointment management.  It uses the Realtime Database for
// storing appointment records.

import {
  setData,
  getData,
  updateData,
  removeData,
  subscribe
} from '../firebase/realtime.js';

/**
 * Helper to compute the start of the current day (local time).
 */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default class AppointmentManager {
  constructor() {
    this.basePath = 'appointments';
    this._subscription = null;
  }

  /**
   * Retrieve all appointment records from the realtime database.
   */
  async getAppointments() {
    const data = await getData(this.basePath);
    if (!data) return [];
    return Object.keys(data).map(key => {
      return { id: key, ...data[key] };
    });
  }

  /**
   * Create a new appointment.  Accepts an appointment object with
   * at minimum patientId, appointmentTime, appointmentDoctor and status.
   * Returns the generated id.
   * @param {Object} appointment
   */
  async addAppointment(appointment) {
    const id = appointment.id || String(Date.now());
    await setData(`${this.basePath}/${id}`, appointment);
    return id;
  }

  /**
   * Update an existing appointment record.
   * @param {string} id
   * @param {Object} data
   */
  async updateAppointment(id, data) {
    return updateData(`${this.basePath}/${id}`, data);
  }

  /**
   * Remove an appointment.
   * @param {string} id
   */
  async deleteAppointment(id) {
    return removeData(`${this.basePath}/${id}`);
  }

  /**
   * Clear appointments whose appointmentTime is earlier than today.
   */
  async clearOldAppointments() {
    const all = await this.getAppointments();
    const cutoff = startOfToday();
    for (const apt of all) {
      const aptTime = new Date(apt.appointmentTime);
      if (isNaN(aptTime.getTime()) || aptTime < cutoff) {
        await this.deleteAppointment(apt.id);
      }
    }
  }

  /**
   * Subscribe to appointment changes in realtime.  The callback will
   * receive an array of all current appointment objects each time a
   * change occurs.  Returns an unsubscribe function.
   * @param {function} callback
   */
  subscribe(callback) {
    if (this._subscription) {
      this._subscription(); // unsubscribe previous
    }
    this._subscription = subscribe(this.basePath, async (value) => {
      const list = [];
      if (value) {
        for (const key of Object.keys(value)) {
          list.push({ id: key, ...value[key] });
        }
      }
      callback(list);
    });
    return this._subscription;
  }
}
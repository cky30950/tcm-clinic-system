// Appointment list UI helpers.
// This module provides functions that generate HTML for displaying
// appointment data in a table.  It does not perform any DOM manipulation itself.

/**
 * Given an appointment and patient, return a HTML string for a table row
 * describing the appointment.  You can modify this template to suit your design.
 * @param {Object} appointment
 * @param {Object} patient
 * @param {number} index
 */
export function createAppointmentRow(appointment, patient, index) {
  const doctorName = appointment.doctorName || appointment.appointmentDoctor;
  return `
    <tr class="hover:bg-gray-50">
      <td class="px-4 py-3 text-sm text-gray-900 font-medium">${index + 1}</td>
      <td class="px-4 py-3 text-sm font-medium text-gray-900">
        ${patient.name}
        <div class="text-xs text-gray-500">${patient.patientNumber || ''}</div>
      </td>
      <td class="px-4 py-3 text-sm text-gray-900">
        <div class="font-medium text-blue-600">${doctorName}</div>
      </td>
      <td class="px-4 py-3 text-sm text-gray-900">
        ${new Date(appointment.appointmentTime).toLocaleString('zh-TW', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </td>
      <td class="px-4 py-3 text-sm text-gray-900">
        <div class="max-w-xs truncate" title="${appointment.chiefComplaint || '無'}">
          ${appointment.chiefComplaint || '無'}
        </div>
      </td>
    </tr>
  `;
}
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ROLE_PERMISSIONS = {
    '診所管理': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'billingManagement', 'userManagement', 'financialReports', 'systemManagement', 'accountSecurity'],
    '醫師': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'billingManagement', 'personalSettings', 'personalStatistics', 'accountSecurity'],
    '護理師': ['patientManagement', 'consultationSystem', 'medicalRecordManagement', 'herbLibrary', 'acupointLibrary', 'templateLibrary', 'scheduleManagement', 'accountSecurity'],
    '用戶': ['patientManagement', 'consultationSystem', 'templateLibrary', 'accountSecurity']
}

def derive_allowed_sections(position: str, email: str = ""):
    pos = (position or "").strip()
    email_l = (email or "").strip().lower()
    allowed = list(ROLE_PERMISSIONS.get(pos, []))
    if pos == '診所管理' or ('管理' in pos) or email_l == 'admin@clinic.com':
        if 'userManagement' not in allowed:
            allowed.append('userManagement')
    return allowed

@app.route("/api/access/sections", methods=["POST"])
def access_sections():
    data = request.get_json(silent=True) or {}
    position = data.get("position") or ""
    email = data.get("email") or ""
    allowed = derive_allowed_sections(position, email)
    return jsonify({"allowedSections": allowed})

@app.route("/api/search/herbs", methods=["GET"])
def search_herbs():
    query = request.args.get("query", "").strip()
    return jsonify({"query": query, "results": []})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


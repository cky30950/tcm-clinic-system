from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:8000", "http://localhost:8000", "https://cky30950.github.io"]}}, supports_credentials=True)

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

@app.route("/api/compute/global-usage", methods=["POST"])
def compute_global_usage():
    data = request.get_json(silent=True) or {}
    consultations = data.get("consultations") or []
    usage = {}
    for cons in consultations:
        pres = str(cons.get("prescription") or "")
        lines = pres.split("\n")
        for raw in lines:
            line = raw.strip()
            if not line:
                continue
            name = None
            i = 0
            while i < len(line) and not line[i].isdigit() and line[i] not in "(). ":
                i += 1
            name = line[:i].strip() or line.split()[0] if line.split() else ""
            if not name:
                continue
            usage[name] = usage.get(name, 0) + 1
    return jsonify({"usageCounts": usage})

def _format_record_line(c):
    date_obj = None
    d = c.get("date")
    if isinstance(d, dict) and "seconds" in d:
        import datetime
        date_obj = datetime.datetime.fromtimestamp(d["seconds"])
    elif d:
        from datetime import datetime
        try:
            date_obj = datetime.fromisoformat(str(d))
        except Exception:
            date_obj = None
    if not date_obj:
        created = c.get("createdAt")
        if isinstance(created, dict) and "seconds" in created:
            import datetime
            date_obj = datetime.datetime.fromtimestamp(created["seconds"])
        elif created:
            from datetime import datetime
            try:
                date_obj = datetime.fromisoformat(str(created))
            except Exception:
                date_obj = None
    date_str = ""
    if date_obj:
        date_str = f"{date_obj.year}-{str(date_obj.month).zfill(2)}-{str(date_obj.day).zfill(2)}"
    def flat(v):
        return str(v or "").replace("\n", " ").strip()
    symptoms = flat(c.get("symptoms"))
    history = flat(c.get("currentHistory"))
    tongue = flat(c.get("tongue"))
    pulse = flat(c.get("pulse"))
    parts = []
    if symptoms:
        parts.append(symptoms)
    if history:
        parts.append(history)
    special = [v for v in [tongue, pulse] if v]
    if special:
        parts.append(f"({('，').join(special)})")
    content = " ".join(parts).strip()
    s = f"{date_str} {content}".strip()
    return s

@app.route("/api/records/format-lines", methods=["POST"])
def format_past_records_lines():
    data = request.get_json(silent=True) or {}
    records = data.get("records") or []
    lines = [_format_record_line(c or {}) for c in records]
    return jsonify({"lines": lines})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

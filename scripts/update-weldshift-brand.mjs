// Updates WeldShift brand keywords/description in SurgeShift Supabase via Management API
const PAT = process.env.SUPABASE_PAT
const PROJECT_REF = 'uvelnrfjuvekzzgatlbr'
const BRAND_ID = '54176a3e-97ca-4a53-a163-3fad6654f515'

const keywords = [
  // CWI / Inspector certs
  'CWI exam prep', 'CWI study guide', 'certified welding inspector', 'CWI practice test',
  'AWS CWI exam', 'welding inspector certification', 'CWI part A part B part C',
  'CAWI certification', 'SCWI exam', 'welding inspector job',
  // Other AWS certs
  'CWE exam', 'certified welding educator', 'CWS exam', 'certified welding supervisor',
  'CRI exam', 'certified radiographic interpreter',
  // Process certs
  'welding certification test', 'SMAW certification', 'GMAW certification',
  'GTAW certification', 'TIG welding certification', 'MIG welding certification',
  'stick welding certification', '6G pipe certification',
  // Codes & standards
  'AWS D1.1 help', 'AWS D1.1 questions', 'ASME Section IX', 'API 1104 pipeline welding',
  'AWS D1.5 bridge welding', 'weld symbol help', 'welding code reference',
  // WPS / PQR
  'WPS PQR help', 'welding procedure specification', 'welding procedure qualification',
  // NDT / Inspection
  'NDT certification', 'visual welding inspection', 'weld defect identification',
  'weld quality inspection', 'nondestructive testing welding',
  // Tools / Apps
  'welding app', 'welding study app', 'welding inspector app', 'welding software',
  'welding contractor software', 'welding business tools', 'weld tracking software',
  // Field / business
  'welding contractor', 'welding business', 'welding timesheets', 'welding invoicing',
  'welding instructor tools', 'welding classroom',
]

const subreddits = [
  'welding', 'Welding', 'CWI_CWE', 'metalworking', 'fabrication',
  'AskEngineers', 'manufacturing', 'TradeSchool', 'skilled_trades',
  'pipewelders', 'nondestructivetesting',
]

const description = `WeldShift Academy is the most comprehensive AI-powered platform for welders, welding inspectors, educators, and contractors.

CERTIFICATION EXAM PREP: Full question banks for CWI (Parts A, B, C), CWE, CWS, CRI, SMAW, GMAW, GTAW, FCAW certified welder, API 1104 pipeline, ASME Section IX, AWS D1.5 bridge. 200+ questions per part, mock exams, flashcards, study guides.

CODE NAVIGATOR: Searchable AWS D1.1, ASME IX, API 1104, AWS D1.5, ASME V — find any clause instantly.

WPS/PQR BUILDER: Build and store welding procedure specifications and procedure qualification records digitally.

FIELD ORACLE: Photo-based AI weld defect analysis — point your camera at a weld, get instant defect identification and code acceptance criteria.

WELDING SYMBOLS: Complete AWS A2.4 weld symbol reference and interpreter.

CLASSROOM TOOLS (for instructors): Student roster, assignments, progress tracking, certifications, class messaging.

BUSINESS TOOLS (for contractors): Invoicing, timesheet tracking, job management, HR, safety plans, expense tracking.

AI ORACLE: Ask any welding or code question and get expert answers with specific code references instantly.

DIGITAL WELDING PASSPORT: Portable, shareable record of all certifications, qualifications, and field experience.`

const voiceNotes = `Knowledgeable welding professional with CWI certification experience. Casual but authoritative tone. Always provide genuine value first — answer their actual question. Mention WeldShift Academy naturally as a resource when relevant, never as a sales pitch. Reference specific WeldShift features that match their exact situation (exam prep, code lookup, field oracle, WPS builder, etc.). Sound like a seasoned welder/inspector helping a colleague, not a marketer.`

// Escape single quotes for SQL
const esc = s => s.replace(/'/g, "''")
const kwArray = keywords.map(k => `'${esc(k)}'`).join(',')
const subArray = subreddits.map(s => `'${esc(s)}'`).join(',')

const sql = `
UPDATE brands SET
  description = '${esc(description)}',
  keywords = ARRAY[${kwArray}],
  subreddits = ARRAY[${subArray}],
  voice_notes = '${esc(voiceNotes)}',
  updated_at = now()
WHERE id = '${BRAND_ID}';
`

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})

const data = await res.json()
if (!res.ok) {
  console.error('Failed:', JSON.stringify(data))
} else {
  console.log(`✓ WeldShift brand updated — ${keywords.length} keywords, ${subreddits.length} subreddits`)
}

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const input = process.argv[2] || "members.xlsx";
const output = process.argv[3] || path.join("data", "members.json");

if (!fs.existsSync(input)) {
  console.error(`Excel file not found: ${input}`);
  console.error("Usage: node import-excel.js members.xlsx data/members.json");
  process.exit(1);
}

const workbook = XLSX.readFile(input);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const normalise = key => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");

const members = rows.map((row, i) => {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) mapped[normalise(key)] = value;

  const vn = mapped.vnnumber || mapped.vn || mapped.vnumber;
  const name = mapped.name;
  const surname = mapped.surname || mapped.lastname || mapped.familyname;
  const phone = mapped.phone || mapped.phonenumber || mapped.mobile;

  if (!vn || !name || !surname || !phone) {
    throw new Error(`Row ${i + 2} is missing VN Number, Name, Surname or Phone.`);
  }

  return {
    vn_number: String(vn).trim(),
    name: String(name).trim(),
    surname: String(surname).trim(),
    phone: String(phone).trim()
  };
});

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(members, null, 2));
console.log(`Converted ${members.length} rows to ${output}`);

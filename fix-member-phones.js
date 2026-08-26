const fs = require("fs");

const file = "./data/members.json";
const members = JSON.parse(fs.readFileSync(file, "utf8"));

const usedPhones = new Set();
const duplicatePhones = [];
const missingPhones = [];

for (const member of members) {
  const phone = String(member.phone || "").trim();

  if (!phone) {
    missingPhones.push(member);
    continue;
  }

  if (usedPhones.has(phone)) {
    duplicatePhones.push(member);
    continue;
  }

  usedPhones.add(phone);
}

let placeholderNumber = 0;

function getPlaceholderPhone() {
  while (true) {
    const phone = String(placeholderNumber).padStart(10, "0");
    placeholderNumber++;

    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
}

// Missing phone numbers
for (const member of missingPhones) {
  member.phone = getPlaceholderPhone();
}

// Duplicate phone numbers
for (const member of duplicatePhones) {
  member.phone = getPlaceholderPhone();
}

fs.writeFileSync(
  file,
  JSON.stringify(members, null, 2) + "\n",
  "utf8"
);

console.log("=================================");
console.log("MEMBER PHONE CLEANUP COMPLETE");
console.log("=================================");
console.log("Total members:", members.length);
console.log("Missing phones replaced:", missingPhones.length);
console.log("Duplicate phones replaced:", duplicatePhones.length);
console.log(
  "Total placeholders:",
  missingPhones.length + duplicatePhones.length
);
console.log("=================================");
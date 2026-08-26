require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  vn_number: { type: String, unique: true, required: true, index: true, trim: true },
  name: { type: String, required: true, trim: true },
  surname: { type: String, required: true, trim: true },
  phone: { type: String, unique: true, required: true, index: true, trim: true },
  password: { type: String, default: "1234" },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  join_date: { type: Date, default: Date.now }
}, { collection: "members" });

const Member = mongoose.model("Member", memberSchema);

async function seed() {
  if (!process.env.MONGO_URL) throw new Error("MONGO_URL is missing from .env");

  const file = path.join(__dirname, "..", "data", "members.json");
  const members = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!Array.isArray(members) || !members.length) {
    throw new Error("data/members.json must contain a non-empty array.");
  }

  await mongoose.connect(process.env.MONGO_URL);

  let count = 0;
  for (const raw of members) {
    count++;
    const member = {
      vn_number: String(raw.vn_number).trim(),
      name: String(raw.name).trim(),
      surname: String(raw.surname).trim(),
      phone: String(raw.phone).trim(),
      password: raw.password ? String(raw.password) : "1234",
      status: raw.status || "Active",
      join_date: raw.join_date ? new Date(raw.join_date) : new Date()
    };

    if (!member.vn_number || !member.name || !member.surname || !member.phone) {
      throw new Error(`Invalid member at ${count}: vn_number, name, surname and phone are required.`);
    }

    await Member.updateOne(
      { vn_number: member.vn_number },
      { $set: member, $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );

    console.log(`${count}/${members.length} ${member.vn_number} imported`);
  }

  console.log(`Completed: ${members.length} members imported/updated.`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

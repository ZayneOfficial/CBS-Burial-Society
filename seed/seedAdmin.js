require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true }
}, { collection: "admins", timestamps: true });

const Admin = mongoose.model("Admin", adminSchema);

async function seed() {
  if (!process.env.MONGO_URL) throw new Error("MONGO_URL is missing from .env");

  await mongoose.connect(process.env.MONGO_URL);
  const password = await bcrypt.hash("admin123", 10);

  await Admin.updateOne(
    { email: "admin@society.com" },
    { $set: { email: "admin@society.com", password, name: "Society Administrator" } },
    { upsert: true }
  );

  console.log("Admin seeded: admin@society.com / admin123");
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

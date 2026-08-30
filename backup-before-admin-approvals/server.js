require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true }
}, { collection: "admins", timestamps: true });

const memberSchema = new mongoose.Schema({
  vn_number: { type: String, unique: true, required: true, index: true, trim: true },
  name: { type: String, required: true, trim: true },
  surname: { type: String, required: true, trim: true },
  phone: { type: String, unique: true, required: true, index: true, trim: true },
  password: { type: String, default: "1234" },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  join_date: { type: Date, default: Date.now }
}, { collection: "members" });

const funeralSchema = new mongoose.Schema({
  deceased_name: { type: String, required: true, trim: true },
  funeral_date: { type: Date, required: true },
  contribution_amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["Open", "Closed"], default: "Open" },
  created_at: { type: Date, default: Date.now }
}, { collection: "funerals" });

const paymentSchema = new mongoose.Schema({
  funeral_id: { type: mongoose.Schema.Types.ObjectId, ref: "Funeral", required: true, index: true },
  funeral_deceased_name: { type: String, required: true },
  funeral_date: { type: Date, required: true },
  contribution_amount: { type: Number, required: true },
  member_id: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  vn_number: { type: String, required: true, index: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ["PAID", "NOT PAID"], default: "NOT PAID", index: true },
  payment_date: { type: Date, default: null },
  amount_paid: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { collection: "funeral_payments" });

paymentSchema.index({ funeral_id: 1, vn_number: 1 });
paymentSchema.index({ funeral_id: 1, status: 1 });
paymentSchema.index({ vn_number: 1 });

const Admin = mongoose.model("Admin", adminSchema);
const Member = mongoose.model("Member", memberSchema);
const helperSchema = new mongoose.Schema({
  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true,
    unique: true
  },
  vn_number: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  surname: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active"
  }
}, {
  collection: "helpers",
  timestamps: true
});

const Helper = mongoose.model("Helper", helperSchema);
const paymentChangeRequestSchema = new mongoose.Schema({
  payment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FuneralPayment",
    required: true,
    index: true
  },

  funeral_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Funeral",
    required: true,
    index: true
  },

  member_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Member",
    required: true
  },

  vn_number: {
    type: String,
    required: true,
    index: true,
    trim: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  surname: {
    type: String,
    required: true,
    trim: true
  },

  old_status: {
    type: String,
    enum: ["PAID", "NOT PAID"],
    required: true
  },

  new_status: {
    type: String,
    enum: ["PAID", "NOT PAID"],
    required: true
  },

  helper_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Helper",
    required: true
  },

  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING",
    index: true
  },

  submitted_at: {
    type: Date,
    default: Date.now
  },

  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null
  },

  approved_at: {
    type: Date,
    default: null
  }
}, {
  collection: "payment_change_requests"
});

const PaymentChangeRequest =
  mongoose.model(
    "PaymentChangeRequest",
    paymentChangeRequestSchema
  );
const Funeral = mongoose.model("Funeral", funeralSchema);
const FuneralPayment = mongoose.model("FuneralPayment", paymentSchema);

function publicMember(member) {
  return {
    member_id: member._id,
    vn_number: member.vn_number,
    name: member.name,
    surname: member.surname,
    phone: member.phone,
    status: member.status,
    join_date: member.join_date
  };
}

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 });
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password, vn_number, phone, full_name, helper_password } = req.body;
    

    if (email && password) {
      const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });
      if (!admin || !(await bcrypt.compare(String(password), admin.password))) {
        return res.status(401).json({ message: "Invalid admin email or password." });
      }
      return res.json({
        role: "admin",
        admin: { name: admin.name, email: admin.email }
      });
    }

    // Helper login: existing member VN + full name + shared helper password
if (vn_number && full_name && helper_password) {
  const member = await Member.findOne({
    vn_number: String(vn_number).trim()
  });

  if (!member) {
    return res.status(401).json({
      message: "Invalid VN Number or full name."
    });
  }

  const submittedName = String(full_name)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  const memberName = `${member.name} ${member.surname}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (submittedName !== memberName) {
    return res.status(401).json({
      message: "Invalid VN Number or full name."
    });
  }

  if (String(helper_password) !== String(process.env.HELPER_PASSWORD || "")) {
    return res.status(401).json({
      message: "Invalid helper password."
    });
  }

  if (member.status !== "Active") {
    return res.status(403).json({
      message: "This member account is inactive."
    });
  }

  let helper = await Helper.findOne({
    member_id: member._id
  });

  if (!helper) {
    helper = await Helper.create({
      member_id: member._id,
      vn_number: member.vn_number,
      name: member.name,
      surname: member.surname,
      status: "Active"
    });
  }

  if (helper.status !== "Active") {
    return res.status(403).json({
      message: "This helper account is inactive."
    });
  }

  return res.json({
    role: "helper",
    helper: {
      helper_id: helper._id,
      member_id: member._id,
      vn_number: member.vn_number,
      name: member.name,
      surname: member.surname
    }
  });
}

    if (vn_number && req.body.full_name) {
  const fullName = String(req.body.full_name)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  const member = await Member.findOne({
    vn_number: String(vn_number).trim()
  });

  if (!member) {
    return res.status(401).json({ message: "Invalid VN Number or full name." });
  }

  const memberFullName = `${member.name} ${member.surname}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (memberFullName !== fullName) {
    return res.status(401).json({ message: "Invalid VN Number or full name." });
  }

  return res.json({
    role: "member",
    member: publicMember(member)
  });
}

return res.status(400).json({
  message: "Provide admin email/password or member VN/full name."
});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/members", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 50);
    const search = String(req.query.search || "").trim();
    const query = search
      ? {
          $or: [
            { vn_number: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { surname: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    const [members, total] = await Promise.all([
      Member.find(query).sort({ vn_number: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Member.countDocuments(query)
    ]);

    res.json({ members, page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load members." });
  }
});

app.post("/api/members", async (req, res) => {
  try {
    const { vn_number, name, surname, phone, password, status, join_date } = req.body;
    if (!vn_number || !name || !surname || !phone) {
      return res.status(400).json({ message: "VN Number, name, surname and phone are required." });
    }
    const member = await Member.create({
      vn_number: String(vn_number).trim(),
      name: String(name).trim(),
      surname: String(surname).trim(),
      phone: String(phone).trim(),
      password: password ? String(password) : "1234",
      status: status === "Inactive" ? "Inactive" : "Active",
      join_date: join_date ? new Date(join_date) : new Date()
    });
    res.status(201).json({ member });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.code === 11000 ? "VN Number or phone already exists." : "Could not add member." });
  }
});

app.get("/api/members/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid member ID." });
    }

    const member = await Member.findById(req.params.id).lean();

    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    res.json({ member });
  } catch (err) {
    console.error("Get member error:", err);
    res.status(500).json({ message: "Could not load member." });
  }
});

app.delete("/api/members/:id", async (req, res) => {
  try {
    await Member.findByIdAndDelete(req.params.id);
    res.json({ message: "Member deleted." });
  } catch (err) {
    res.status(400).json({ message: "Could not delete member." });
  }
});

app.put("/api/members/:id", async (req, res) => {
  try {
    const memberId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: "Invalid member ID." });
    }

    const member = await Member.findById(memberId);

    if (!member) {
      return res.status(404).json({ message: "Member not found." });
    }

    const {
      name,
      surname,
      phone,
      status,
      join_date
    } = req.body;

    if (!name || !surname || !phone) {
      return res.status(400).json({
        message: "Name, surname and phone are required."
      });
    }

    const cleanName = String(name).trim();
    const cleanSurname = String(surname).trim();
    const cleanPhone = String(phone).trim();

    // Prevent the phone number from belonging to another member.
    const phoneOwner = await Member.findOne({
      phone: cleanPhone,
      _id: { $ne: member._id }
    }).select("_id vn_number");

    if (phoneOwner) {
      return res.status(409).json({
        message: `Phone number already belongs to ${phoneOwner.vn_number}.`
      });
    }

    const cleanStatus =
      status === "Inactive" ? "Inactive" : "Active";

    let cleanJoinDate = member.join_date;

    if (join_date) {
      const parsedDate = new Date(join_date);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: "Invalid join date."
        });
      }

      cleanJoinDate = parsedDate;
    }

    // IMPORTANT:
    // VN number is intentionally NOT editable because it is the
    // primary identifier used throughout the system.
    member.name = cleanName;
    member.surname = cleanSurname;
    member.phone = cleanPhone;
    member.status = cleanStatus;
    member.join_date = cleanJoinDate;

    await member.save();

    // Keep the denormalized member information in funeral_payments
    // synchronized.
    const paymentUpdate = await FuneralPayment.updateMany(
      { member_id: member._id },
      {
        $set: {
          vn_number: member.vn_number,
          name: member.name,
          surname: member.surname,
          phone: member.phone
        }
      }
    );

    res.json({
      message: "Member updated successfully.",
      member: publicMember(member),
      payments_updated: paymentUpdate.modifiedCount
    });

  } catch (err) {
    console.error("Edit member error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "That phone number is already in use."
      });
    }

    res.status(500).json({
      message: "Could not update member."
    });
  }
});

app.get("/api/funerals", async (req, res) => {
  try {
    const funerals = await Funeral.find().sort({ funeral_date: -1, created_at: -1 }).lean();
    res.json({ funerals });
  } catch (err) {
    res.status(500).json({ message: "Could not load funerals." });
  }
});

app.put("/api/funerals/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid funeral ID." });
    }

    const funeral = await Funeral.findById(req.params.id);
    if (!funeral) return res.status(404).json({ message: "Funeral not found." });

    const deceased_name = String(req.body.deceased_name || "").trim();
    const funeral_date = req.body.funeral_date;
    const contribution_amount = Number(req.body.contribution_amount);

    if (!deceased_name || !funeral_date || !Number.isFinite(contribution_amount) || contribution_amount < 0) {
      return res.status(400).json({ message: "Deceased name, funeral date and valid amount are required." });
    }

    const parsedDate = new Date(funeral_date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid funeral date." });
    }

    funeral.deceased_name = deceased_name;
    funeral.funeral_date = parsedDate;
    funeral.contribution_amount = contribution_amount;
    await funeral.save();

    // Keep denormalized funeral details synchronized in all payment records.
    const paymentUpdate = await FuneralPayment.updateMany(
      { funeral_id: funeral._id },
      [
        {
          $set: {
            funeral_deceased_name: funeral.deceased_name,
            funeral_date: funeral.funeral_date,
            contribution_amount: funeral.contribution_amount,
            amount_paid: {
              $cond: [
                { $eq: ["$status", "PAID"] },
                funeral.contribution_amount,
                "$amount_paid"
              ]
            }
          }
        }
      ]
    );

    res.json({
      message: "Funeral updated successfully.",
      funeral,
      payments_updated: paymentUpdate.modifiedCount
    });
  } catch (err) {
    console.error("Edit funeral error:", err);
    res.status(500).json({ message: "Could not update funeral." });
  }
});

app.delete("/api/funerals/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid funeral ID." });
    }

    const funeral = await Funeral.findById(req.params.id).lean();
    if (!funeral) return res.status(404).json({ message: "Funeral not found." });

    // Delete the payment records belonging only to this funeral, then the funeral itself.
    const paymentDelete = await FuneralPayment.deleteMany({ funeral_id: funeral._id });
    await Funeral.findByIdAndDelete(funeral._id);

    res.json({
      message: "Funeral and its payment records deleted.",
      payments_deleted: paymentDelete.deletedCount
    });
  } catch (err) {
    console.error("Delete funeral error:", err);
    res.status(500).json({ message: "Could not delete funeral." });
  }
});

app.post("/api/funerals", async (req, res) => {
  try {
    const deceased_name = String(req.body.deceased_name || "").trim();
    const funeral_date = req.body.funeral_date;
    const contribution_amount = Number(req.body.contribution_amount);

    if (!deceased_name || !funeral_date || !Number.isFinite(contribution_amount) || contribution_amount < 0) {
      return res.status(400).json({ message: "Deceased name, funeral date and valid amount are required." });
    }

    const funeral = await Funeral.create({
      deceased_name,
      funeral_date: new Date(funeral_date),
      contribution_amount,
      status: "Open"
    });

    const activeMembers = await Member.find({ status: "Active" })
      .select("_id vn_number name surname phone")
      .lean();

    const payments = activeMembers.map(member => ({
      funeral_id: funeral._id,
      funeral_deceased_name: funeral.deceased_name,
      funeral_date: funeral.funeral_date,
      contribution_amount: funeral.contribution_amount,
      member_id: member._id,
      vn_number: member.vn_number,
      name: member.name,
      surname: member.surname,
      phone: member.phone,
      status: "NOT PAID",
      payment_date: null,
      amount_paid: 0,
      created_at: new Date()
    }));

    if (payments.length) await FuneralPayment.insertMany(payments, { ordered: false });

    res.status(201).json({
      funeral,
      payments_created: payments.length
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Could not create funeral.", error: err.message });
  }
});

app.get("/api/payments/:funeralId", async (req, res) => {
  try {
    const funeralId = new mongoose.Types.ObjectId(req.params.funeralId);
    const status = req.query.status;
    const search = String(req.query.search || "").trim();

    const query = { funeral_id: funeralId };
    if (status === "PAID" || status === "NOT PAID") query.status = status;

    if (search) {
      query.$or = [
        { vn_number: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { surname: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const payments = await FuneralPayment.find(query)
      .sort({ vn_number: 1 })
      .lean();

    const allForSummary = await FuneralPayment.find({ funeral_id: funeralId })
      .select("status amount_paid contribution_amount")
      .lean();

    const paid = allForSummary.filter(p => p.status === "PAID");
    const collected = paid.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

    res.json({
      payments,
      summary: {
        total: allForSummary.length,
        paid: paid.length,
        notPaid: allForSummary.length - paid.length,
        collected
      }
    });
  } catch (err) {
    res.status(400).json({ message: "Invalid funeral ID or could not load payments." });
  }
});

app.put("/api/payments/:id/toggle", async (req, res) => {
  try {
    const payment = await FuneralPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found." });

    if (payment.status === "PAID") {
      payment.status = "NOT PAID";
      payment.payment_date = null;
      payment.amount_paid = 0;
    } else {
      payment.status = "PAID";
      payment.payment_date = new Date();
      payment.amount_paid = Number(payment.contribution_amount || 0);
    }

    await payment.save();
    res.json({ payment });
  } catch (err) {
    res.status(400).json({ message: "Could not toggle payment." });
  }
});

app.post("/api/payment-change-requests", async (req, res) => {
  try {
    const {
      payment_id,
      new_status,
      helper_id
    } = req.body;

    if (!payment_id || !new_status || !helper_id) {
      return res.status(400).json({
        message: "Payment, status and helper are required."
      });
    }

    if (!["PAID", "NOT PAID"].includes(new_status)) {
      return res.status(400).json({
        message: "Invalid payment status."
      });
    }

    const helper = await Helper.findById(helper_id);

    if (!helper || helper.status !== "Active") {
      return res.status(403).json({
        message: "Helper account is not active."
      });
    }

    const payment =
      await FuneralPayment.findById(payment_id);

    if (!payment) {
      return res.status(404).json({
        message: "Payment record not found."
      });
    }

    // Prevent unnecessary changes
    if (payment.status === new_status) {
      return res.status(400).json({
        message: `Payment is already ${new_status}.`
      });
    }

    // Do not allow multiple pending requests
    const existing =
      await PaymentChangeRequest.findOne({
        payment_id: payment._id,
        status: "PENDING"
      });

    if (existing) {
      return res.status(409).json({
        message:
          "This payment already has a pending change awaiting admin approval."
      });
    }

    const request =
      await PaymentChangeRequest.create({
        payment_id: payment._id,
        funeral_id: payment.funeral_id,
        member_id: payment.member_id,
        vn_number: payment.vn_number,
        name: payment.name,
        surname: payment.surname,
        old_status: payment.status,
        new_status,
        helper_id: helper._id,
        status: "PENDING"
      });

    res.status(201).json({
      message:
        "Payment change submitted for admin approval.",
      request
    });

  } catch (err) {
    console.error(err);

    res.status(400).json({
      message:
        "Could not submit payment change.",
      error: err.message
    });
  }
});

app.get("/api/member-payments/:vn", async (req, res) => {
  try {
    const vn = String(req.params.vn).trim();
    const member = await Member.findOne({ vn_number: vn }).lean();
    if (!member) return res.status(404).json({ message: "Member not found." });

    const payments = await FuneralPayment.find({ vn_number: vn })
      .sort({ funeral_date: -1 })
      .lean();

    res.json({ member: publicMember(member), payments });
  } catch (err) {
    res.status(500).json({ message: "Could not load member payments." });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });

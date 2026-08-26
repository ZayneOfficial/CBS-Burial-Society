# Burial Society Management System

A complete low-end-mobile-friendly Burial Society Management System built with:

- Node.js
- Express
- Mongoose
- MongoDB Atlas
- bcryptjs
- dotenv
- cors
- Pure HTML/CSS/Vanilla JavaScript
- jsPDF + AutoTable CDN for PDF export

## 1. Requirements

Install Node.js 18+ and have a MongoDB Atlas database.

## 2. Install

```bash
npm install
```

Copy `.env.example` to `.env` and set your MongoDB Atlas connection:

```env
MONGO_URL=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/burial_society?retryWrites=true&w=majority
PORT=3000
```

## 3. Create the admin

The admin is NOT hardcoded into the application. It is created by the seed script and the password is bcrypt-hashed.

```bash
node seed/seedAdmin.js
```

Credentials:

- Email: `admin@society.com`
- Password: `admin123`

Quick test fallback is also available from the login page:

- VN Number: `admin`
- Phone: `admin123`

## 4. Import the 500 existing members via VS Code

Open `data/members.json`.

Replace the three example records with your 500 members:

```json
[
  {
    "vn_number": "VN001",
    "name": "John",
    "surname": "Ndlovu",
    "phone": "0711111111"
  }
]
```

Then run:

```bash
node seed/seedMembers.js
```

The script uses `updateOne(..., { upsert: true })`, so existing VN numbers are updated rather than duplicated. It prints progress such as:

```text
1/500 VN001 imported
2/500 VN002 imported
...
500/500 VN500 imported
```

### Excel option

If your 500 users are in Excel with columns:

- VN Number
- Name
- Surname
- Phone

Install dependencies and run:

```bash
node import-excel.js members.xlsx data/members.json
node seed/seedMembers.js
```

The Excel converter is included as `import-excel.js`.

## 5. Run locally

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## 6. Funeral/payment workflow

When an admin creates a funeral:

1. The server finds every Active member.
2. It builds one payment document per Active member.
3. It uses `insertMany` to create all payment records at once.
4. Each payment contains denormalized member details:
   - VN number
   - name
   - surname
   - phone
5. It also copies funeral details:
   - deceased name
   - funeral date
   - contribution amount

Payment queries therefore require no `populate()`.

## 7. Payment indexes

The `funeral_payments` collection has indexes for:

- `{ funeral_id: 1, vn_number: 1 }`
- `{ funeral_id: 1, status: 1 }`
- `{ vn_number: 1 }`

## 8. Admin dashboard

The admin dashboard includes:

- Total members
- Paid count
- Not paid count
- Total collected
- Member search
- 50-member pagination
- Add member
- Delete member
- Funeral creation
- Automatic payment generation
- Payment filtering
- Live payment search
- One-click PAID / NOT PAID toggling
- Single-member WhatsApp reminder
- WhatsApp ALL NOT PAID
- PDF ALL
- PDF PAID ONLY
- PDF NOT PAID ONLY
- CSV/Excel-compatible export

PDF status values use:

- `✅ PAID`
- `❌ NOT PAID`

## 9. Member dashboard

Members log in with:

- VN Number
- Phone

They can see only their own:

- VN number
- Name and surname
- Phone
- Join date
- Status
- Funeral contribution history

The member contribution history is queried directly with `vn_number`.

## 10. Render deployment

Create a new Web Service on Render.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Add environment variable:

```text
MONGO_URL=your MongoDB Atlas connection string
```

You can also set `PORT`, although Render provides it automatically.

Before deployment, make sure your MongoDB Atlas Network Access allows the Render service to connect.

## 11. Important security note

This starter implementation follows the requested localStorage session model. For a production society with sensitive member information, add server-side authentication/session or JWT middleware to protect all admin APIs and member-specific APIs, plus HTTPS and stronger member credentials.

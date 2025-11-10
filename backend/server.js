// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bbms';
const SECRET = process.env.JWT_SECRET || 'supersecretkey';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  role: String, // 'admin', 'donor', 'recipient'
  email: String,
  bloodType: String,
  donationHistory: [{ bloodType: String, units: Number, date: String }],
  requestHistory: [{ bloodType: String, units: Number, date: String }],
  isVolunteer: Boolean,
  location: { lat: Number, lng: Number }
});

const requestSchema = new mongoose.Schema({
  bloodType: String,
  units: Number,
  requestor: String,
  date: String
});

const inventorySchema = new mongoose.Schema({
  bloodType: String,
  units: Number
});

const notificationSchema = new mongoose.Schema({
  message: String,
  date: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Request = mongoose.model('Request', requestSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const Notification = mongoose.model('Notification', notificationSchema);

// Helpers
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Middleware
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send("Unauthorized");
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).send("Invalid token");
  }
}

// --- Auth ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email, role, bloodType, isVolunteer, location } = req.body;
    if (!username || !password || !email || !role) return res.status(400).send("Missing fields");
    if (await User.findOne({ username })) return res.status(409).send("Username exists");
    const hash = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hash, email, role, bloodType, isVolunteer, location });
    if (role === "donor") newUser.donationHistory = [];
    if (role === "recipient") newUser.requestHistory = [];
    await newUser.save();
    res.sendStatus(201);
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).lean();
    if (!user) return res.status(401).send("User not found");
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Wrong password");
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, SECRET, { expiresIn: "2d" });
    return res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

// --- User Profile ---
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    res.json(user);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.put('/api/me', auth, async (req, res) => {
  try {
    const updates = req.body;
    await User.findByIdAndUpdate(req.user.id, updates);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Users (Admin) ---
app.get('/api/users', auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");
    const users = await User.find().lean();
    res.json(users);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Inventory ---
app.get('/api/inventory', async (req, res) => {
  try {
    let inventory = await Inventory.find().lean();
    if (inventory.length === 0) {
      // Initialize inventory if empty
      inventory = await Promise.all(BLOOD_TYPES.map(async bt => {
        const inv = new Inventory({ bloodType: bt, units: 10 });
        await inv.save();
        return inv.toObject();
      }));
    }
    res.json(inventory);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.put('/api/inventory', auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");
    const { bloodType, units } = req.body;
    await Inventory.findOneAndUpdate({ bloodType }, { units }, { upsert: true });
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Blood Requests ---
app.get('/api/requests', auth, async (req, res) => {
  try {
    const requests = await Request.find().lean();
    res.json(requests);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.post('/api/requests', auth, async (req, res) => {
  try {
    const { bloodType, units } = req.body;
    const date = new Date().toISOString().split("T")[0];
    const newReq = new Request({ bloodType, units, requestor: req.user.username, date });
    await newReq.save();
    await User.updateOne({ username: req.user.username }, { $push: { requestHistory: { bloodType, units, date } } });
    res.sendStatus(201);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.delete('/api/requests/:id', auth, async (req, res) => {
  try {
    await Request.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Donation (Donor fulfills request) ---
app.post('/api/donate', auth, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await Request.findById(requestId);
    if (!request) return res.status(404).send("Request not found");
    const inv = await Inventory.findOne({ bloodType: request.bloodType });
    if (inv) {
      inv.units = Math.max(0, inv.units - request.units);
      await inv.save();
    }
    await User.updateOne({ username: req.user.username }, { $push: { donationHistory: { bloodType: request.bloodType, units: request.units, date: new Date().toISOString().split("T")[0] } } });
    await request.deleteOne();
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Volunteers ---
app.get('/api/volunteers', async (req, res) => {
  try {
    const volunteers = await User.find({ isVolunteer: true }).lean();
    res.json(volunteers);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Notifications ---
app.get('/api/notifications', async (req, res) => {
  try {
    const notes = await Notification.find().sort({ date: -1 }).lean();
    res.json(notes);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.post('/api/notifications', auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).send("Forbidden");
    const { message } = req.body;
    await new Notification({ message }).save();
    res.sendStatus(201);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// --- Google Map Data (users with location) ---
app.get('/api/locations', async (req, res) => {
  try {
    const users = await User.find({ location: { $exists: true } }, { username: 1, role: 1, isVolunteer: 1, location: 1, bloodType: 1 }).lean();
    res.json(users);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Start server
app.listen(PORT, () => console.log(`BBMS backend listening on port ${PORT}`));
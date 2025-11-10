// src/App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { useJsApiLoader, GoogleMap, Marker } from "@react-google-maps/api";
import api from "./api";
import { useAuth } from "./AuthContext";

// --- Constants ---
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const containerStyle = { width: "100%", height: "400px" };
const defaultCenter = { lat: 26.1445, lng: 91.7362 };

// --- Re-usable components (simplified) ---

function Home() {
  return (
    <div>
      <h2>Welcome to the Blood Bank Management System</h2>
      <p>Manage blood donations, requests, inventory, volunteers, and locations efficiently.</p>
    </div>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Login failed: check credentials");
    }
  };
  return (
    <div>
      <h3>Login</h3>
      <form onSubmit={handleSubmit}>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} /><br />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><br />
        <button type="submit">Login</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("donor");
  const [email, setEmail] = useState("");
  const [bloodType, setBloodType] = useState(BLOOD_TYPES[0]);
  const [isVolunteer, setIsVolunteer] = useState(false);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");

  const handleLocation = () => {
    navigator.geolocation.getCurrentPosition(pos => {
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, () => alert("Location access denied!"));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username || !password || !email) { setError("All fields required"); return; }
    const newUser = { username, password, role, email, isVolunteer, location, bloodType };
    try {
      await register(newUser);
      navigate("/login");
    } catch (err) {
      setError(err?.body || "Registration failed");
    }
  };

  return (
    <div>
      <h3>Register</h3>
      <form onSubmit={handleRegister}>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} /><br />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /><br />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><br />
        <label>Role:
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="donor">Donor</option>
            <option value="recipient">Recipient</option>
            <option value="admin">Admin</option>
          </select>
        </label><br />
        {role === "donor" && (
          <label>Blood Type:
            <select value={bloodType} onChange={e => setBloodType(e.target.value)}>
              {BLOOD_TYPES.map(bt => <option key={bt}>{bt}</option>)}
            </select>
          </label>
        )}<br />
        <label>
          <input type="checkbox" checked={isVolunteer} onChange={e => setIsVolunteer(e.target.checked)} /> Register as Volunteer
        </label><br />
        <button type="button" onClick={handleLocation}>Set My Location</button>
        {location && <span> Lat: {location.lat.toFixed(4)}, Lng: {location.lng.toFixed(4)}</span>}<br />
        <button type="submit">Register</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

function GoogleMapComponent({ users = [], roleFilter = "" }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY || ""
  });

  const filteredUsers = (users || []).filter(u =>
    !u.location ? false :
      roleFilter === "" ? true :
      roleFilter === "volunteer" ? u.isVolunteer && u.location :
      u.role === roleFilter && u.location
  );

  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={defaultCenter} zoom={7}>
      {filteredUsers.map((user, idx) => (
        <Marker
          key={idx}
          position={user.location}
          label={user.isVolunteer ? "V" : user.role === "donor" ? "D" : user.role === "recipient" ? "R" : "A"}
          title={`${user.username} (${user.role}${user.isVolunteer ? ", Volunteer" : ""})`}
        />
      ))}
    </GoogleMap>
  );
}

function MapPage({ locations }) {
  const [roleFilter, setRoleFilter] = useState("");
  return (
    <div>
      <h3>Map of Donors, Recipients, Volunteers</h3>
      <label>
        Show:
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All</option>
          <option value="volunteer">Volunteers</option>
          <option value="donor">Donors</option>
          <option value="recipient">Recipients</option>
        </select>
      </label>
      <GoogleMapComponent users={locations} roleFilter={roleFilter} />
      <p>Legend: D = Donor, R = Recipient, V = Volunteer, A = Admin</p>
    </div>
  );
}

function Dashboard() {
  const { currentUser, updateProfile } = useAuth();
  const [inventory, setInventory] = useState({});
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        const [invRes, reqRes, notRes, locRes] = await Promise.all([
          api.getInventory(),
          api.getRequests(),
          api.getNotifications(),
          api.getLocations()
        ]);
        if (!mounted) return;
        const invObj = Array.isArray(invRes) ? invRes.reduce((acc, i) => ({ ...acc, [i.bloodType]: i.units }), {}) : {};
        setInventory(invObj);
        setRequests(reqRes || []);
        setNotifications((notRes || []).map(n => n.message || n));
        setLocations(locRes || []);
      } catch (err) {
        console.error("Failed to load", err);
      }
    }
    loadAll();
    // load users if admin
    async function loadUsersIfAdmin() {
      if (currentUser && currentUser.role === "admin") {
        try {
          const u = await api.getUsers();
          setUsers(u || []);
        } catch (err) {
          console.warn("Could not fetch users", err);
        }
      }
    }
    loadUsersIfAdmin();
    return () => { mounted = false; };
  }, [currentUser]);

  if (!currentUser) return <Navigate to="/login" />;

  const handleUpdateInventory = async (type, units) => {
    try {
      await api.updateInventory(type, Number(units));
      const invData = await api.getInventory();
      const invObj = invData.reduce((acc, i) => ({ ...acc, [i.bloodType]: i.units }), {});
      setInventory(invObj);
    } catch (err) {
      alert("Update failed");
    }
  };

  const handleRequest = async (bloodType, units) => {
    try {
      await api.createRequest(bloodType, Number(units));
      const reqs = await api.getRequests();
      setRequests(reqs);
      setNotifications(n => [`Blood request for ${units} unit(s) of ${bloodType} submitted.`, ...n]);
      alert("Request submitted");
    } catch (err) {
      alert("Request failed");
    }
  };

  const handleDonate = async (requestId) => {
    try {
      await api.donateRequest(requestId);
      const invData = await api.getInventory();
      const invObj = invData.reduce((acc, i) => ({ ...acc, [i.bloodType]: i.units }), {});
      setInventory(invObj);
      const reqs = await api.getRequests();
      setRequests(reqs);
      setNotifications(n => [`Donation submitted`, ...n]);
      alert("Donation recorded");
    } catch (err) {
      alert("Donation failed");
    }
  };

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Welcome, {currentUser.username}! Role: {currentUser.role}{currentUser.isVolunteer && " (Volunteer)"}</p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 300 }}>
          <h4>Inventory</h4>
          <table border="1"><thead><tr><th>Type</th><th>Units</th></tr></thead>
            <tbody>
              {Object.entries(inventory).map(([t, u]) => <tr key={t}><td>{t}</td><td>{u}</td></tr>)}
            </tbody>
          </table>
          {currentUser.role === "admin" && (
            <InventoryEditor onUpdate={handleUpdateInventory} />
          )}
        </div>

        <div style={{ minWidth: 300 }}>
          <h4>Requests</h4>
          <ul>
            {requests.length === 0 ? <li>No requests</li> : requests.map(r =>
              <li key={r._id || `${r.requestor}-${r.date}-${r.bloodType}`}>
                {r.units} units of {r.bloodType} by {r.requestor} on {r.date}
                {currentUser.role === "donor" && currentUser.bloodType === r.bloodType && <button style={{ marginLeft: 8 }} onClick={() => handleDonate(r._id)}>Donate</button>}
              </li>
            )}
          </ul>
          {currentUser.role === "recipient" && <RequestForm onRequest={handleRequest} />}
        </div>

        <div style={{ minWidth: 300 }}>
          <h4>Notifications</h4>
          <ul>{notifications.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>

        <div style={{ minWidth: 300 }}>
          <h4>Map Locations</h4>
          <MapPreview locations={locations} />
        </div>
      </div>

      <h4>Your Profile</h4>
      <ProfileEditor user={currentUser} onSave={updateProfile} />
    </div>
  );
}

function InventoryEditor({ onUpdate }) {
  const [type, setType] = useState("");
  const [units, setUnits] = useState("");
  return (
    <div>
      <select value={type} onChange={e => setType(e.target.value)}>
        <option value="">Select type</option>
        {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
      </select>
      <input type="number" min="0" value={units} onChange={e => setUnits(e.target.value)} placeholder="Units" style={{ width: 80, marginLeft: 8 }} />
      <button onClick={() => { if (type && units !== "") { onUpdate(type, units); setType(""); setUnits(""); } }}>Update</button>
    </div>
  );
}

function RequestForm({ onRequest }) {
  const [bloodType, setBloodType] = useState(BLOOD_TYPES[0]);
  const [units, setUnits] = useState(1);
  return (
    <div>
      <h5>Request Blood</h5>
      <select value={bloodType} onChange={e => setBloodType(e.target.value)}>
        {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
      </select>
      <input type="number" min="1" value={units} onChange={e => setUnits(e.target.value)} style={{ width: 60, marginLeft: 8 }} />
      <button onClick={() => onRequest(bloodType, units)} style={{ marginLeft: 8 }}>Submit Request</button>
    </div>
  );
}

function MapPreview({ locations }) {
  return (
    <div>
      <div style={{ height: 250 }}>
        <GoogleMapComponent users={locations} roleFilter="" />
      </div>
      <p>Legend: D = Donor, R = Recipient, V = Volunteer, A = Admin</p>
    </div>
  );
}

function ProfileEditor({ user, onSave }) {
  const [edit, setEdit] = useState(false);
  const [email, setEmail] = useState(user.email || "");
  const [isVolunteer, setIsVolunteer] = useState(user.isVolunteer || false);
  const [location, setLocation] = useState(user.location || null);

  useEffect(() => {
    setEmail(user.email || "");
    setIsVolunteer(user.isVolunteer || false);
    setLocation(user.location || null);
  }, [user]);

  const handleLocation = () => {
    navigator.geolocation.getCurrentPosition(pos => {
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, () => alert("Location access denied!"));
  };

  const handleSave = async () => {
    await onSave({ ...user, email, isVolunteer, location });
    setEdit(false);
    alert("Profile updated");
  };

  return (
    <div>
      <p>Username: {user.username}</p>
      <p>Role: {user.role}{isVolunteer && " (Volunteer)"}</p>
      {edit ? (
        <>
          <input value={email} onChange={e => setEmail(e.target.value)} /><br />
          <label><input type="checkbox" checked={isVolunteer} onChange={e => setIsVolunteer(e.target.checked)} /> Volunteer</label><br />
          <button type="button" onClick={handleLocation}>Set My Location</button>
          {location && <span> Lat: {location.lat.toFixed(4)}, Lng: {location.lng.toFixed(4)}</span>}<br />
          <button onClick={handleSave}>Save</button>
        </>
      ) : (
        <>
          <p>Email: {user.email}</p>
          <p>Volunteer: {user.isVolunteer ? "Yes" : "No"}</p>
          <p>Location: {user.location ? `Lat: ${user.location.lat.toFixed(4)}, Lng: ${user.location.lng.toFixed(4)}` : "Not set"}</p>
          <button onClick={() => setEdit(true)}>Edit Profile</button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const { currentUser, logout } = useAuth();

  return (
    <Router>
      <nav style={{ marginBottom: 20 }}>
        <Link to="/">Home</Link>{" | "}
        <Link to="/map">Map</Link>{" | "}
        {!currentUser && <Link to="/login">Login</Link>}
        {!currentUser && <Link to="/register">Register</Link>}
        {currentUser && <Link to="/dashboard">Dashboard</Link>}
        {currentUser && <button style={{ marginLeft: 10 }} onClick={logout}>Logout</button>}
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage locations={[]} />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}
// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config();
// const fs = require("fs");
// const http = require("http");
// const cron = require("node-cron");

// const connectDB = require("./config/db");
// const authRoutes = require("./routes/authRoutes");
// const { Donation } = require("./models/Donation");

// const app = express();

// // Serve static assets
// app.use("/assets", express.static(path.join(__dirname, "../assets")));
// app.use("/public", express.static(path.join(__dirname, "public")));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // Middleware
// app.use(express.json());
// app.use(cors({ origin: "*" }));

// // Routes
// app.use("/api", authRoutes);

// // Reset password page route
// app.get("/reset-password/:token", (req, res) => {
//   const filePath = path.join(__dirname, "views", "resetPassword.html");
//   fs.readFile(filePath, "utf8", (err, html) => {
//     if (err) {
//       res.status(500).send("Error loading reset password page");
//       return;
//     }
//     res.send(html);
//   });
// });

// // CRON job: Automatically mark expired medicines
// cron.schedule("0 0 * * *", async () => {
//   try {
//     const expiredMedicines = await Donation.find({
//       expiryDate: { $lte: new Date() },
//     });

//     for (const medicine of expiredMedicines) {
//       medicine.status = "expired";
//       await medicine.save();
//     }

//   } catch (err) {
//   }
// });

// // Start server
// const PORT = process.env.PORT || 8080;

// connectDB()
//   .then(() => {
//     app.listen(PORT, "0.0.0.0", () =>
//       console.log(`Server running on port ${PORT}`)
//     );
//   })
//   .catch((err) => console.error("Server failed to start", err));

const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const fs = require("fs");
const cron = require("node-cron");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const { Donation } = require("./models/Donation");

const app = express();

// Serve static assets
app.use("/assets", express.static(path.join(__dirname, "../assets")));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware
app.use(express.json());

// Fix CORS for Render + Local development
const allowedOrigins = [
  "http://localhost:8081",
  "http://192.168.0.101:8081",
  "https://medshareserver.onrender.com", // your backend
  "exp://", // React Native dev
];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Health check / test route
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ MedShare backend is live and working!" });
});

// Routes
app.use("/api", authRoutes);

// Reset password page route
app.get("/reset-password/:token", (req, res) => {
  const filePath = path.join(__dirname, "views", "resetPassword.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) {
      res.status(500).send("Error loading reset password page");
      return;
    }
    res.send(html);
  });
});

// CRON job: Automatically mark expired medicines
cron.schedule("0 0 * * *", async () => {
  try {
    const expiredMedicines = await Donation.find({
      expiryDate: { $lte: new Date() },
    });

    for (const medicine of expiredMedicines) {
      medicine.status = "expired";
      await medicine.save();
    }
  } catch (err) {
    console.error("Cron job error:", err);
  }
});

// Port fix (Render uses process.env.PORT)
const PORT = process.env.PORT || 8080;

// Start server after DB connects
connectDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`Server running on port ${PORT}`)
    );
  })
  .catch((err) => console.error("Server failed to start:", err));

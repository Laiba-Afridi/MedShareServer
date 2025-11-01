const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  prescriptionImage: { type: String, required: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Donation", required: true },
  medicineName: { type: String, required: true },
  donorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  requestDate: { type: Date, default: Date.now },
  rejectReason: { type: String },
  strength: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Request", requestSchema);

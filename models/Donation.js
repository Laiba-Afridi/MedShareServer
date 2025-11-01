const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema({
  donorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  medicineName: { type: String, required: true },
  quantity: { type: String, required: true },
  medicineForm: { type: String, required: true },
  strength: { type: String, required: true },
  manufacturingDate: { type: Date, required: true },
  expiryDate: { type: Date, required: true },
  donorName: { type: String, required: true },
  donorPhoneNumber: { type: String, required: true },
  donorAddress: { type: String, required: true },
  images: [String],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Donation", donationSchema);

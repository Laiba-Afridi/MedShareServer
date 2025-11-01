const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({

  fullName: {
    type: String,
    required: [true, "Full name is required"],
    match: [/^[A-Za-z ]+$/, "Invalid full name format"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    lowercase: true, 
    validate: {
      validator: function (email) {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);
      },
      message: "Invalid email format",
    },
  },  
  
  contactNumber: {
    type: String,
    required: [true, "Contact number is required"],
    match: [/^(?:\+92|0)[0-9]{10}$/, "Invalid Pakistani contact number format"],
  },

  address: {
    type: String,
    required: [true, "Address is required"],
    minlength: [5, "Address must be at least 5 characters long"],
    maxlength: [200, "Address cannot exceed 200 characters"],
    trim: true,
  },
  
  role: {
    type: String,
    enum: ["Donate A Medicine", "Need A Medicine"],
    required: true,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters long"],
    validate: {
      validator: function (password) {
        return /^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/.test(password);
      },
      message: "Password must include letters, numbers, and a special character",
    },
  },

  resetPasswordToken: String,
  resetPasswordExpires: Date,

});

// Hash Password Before Saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);
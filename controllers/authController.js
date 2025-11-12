const crypto = require('crypto');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const Donation = require('../models/Donation');
const path = require('path');

const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.BACKEND_URL;

//Register User Function
const registerUser = async (req, res) => {
  try {
    let {fullName, email, contactNumber, role, address, password, acceptTerms} =
      req.body;

    if (!acceptTerms) {
      return res
        .status(400)
        .json({message: 'Please accept the Terms & Conditions.'});
    }

    // Trim the values to remove extra spaces
    fullName = fullName.trim();
    email = email.trim();
    role = role.trim();
    password = password.trim();
    contactNumber = contactNumber.trim();
    address = address ? address.trim() : '';

    //define helper functions ABOVE your main validation section
    const gibberishPatterns = [
      /(.)\1{3,}/, // same char repeated 4+ times
      /^[a-z]{8,}$/i, // long sequence of letters only
      /^[^a-zA-Z0-9]+$/, // only symbols
    ];

    const isGibberish = text => {
      const hasVowel = /[aeiouAEIOU]/.test(text);
      const matchesBadPattern = gibberishPatterns.some(r => r.test(text));
      return !hasVowel || matchesBadPattern;
    };

    const addressStructureRegex =
      /(\d+|house|road|street|block|sector|phase|town|colony|apartment|village)/i;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^((\+92)?(03)[0-9]{9})$/;
    const passwordRegex =
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({message: 'Invalid email format. Please enter a valid email'});
    }

    if (!phoneRegex.test(contactNumber)) {
      return res.status(400).json({
        message:
          'Invalid phone number or missing digits (must be exactly 11 digits)',
      });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters & include a letter, number & symbol',
      });
    }

    //Anti-Gibberish Checks — place these AFTER other regexes, BEFORE saving user
    if (isGibberish(fullName) || fullName.length < 3) {
      return res.status(400).json({
        message:
          'Please enter a valid full name (no random characters or gibberish).',
      });
    }

    if (!address || address.length < 5 || isGibberish(address)) {
      return res.status(400).json({
        message:
          'Please enter a valid address (use real words, not random letters).',
      });
    }

    if (!addressStructureRegex.test(address)) {
      return res.status(400).json({
        message:
          'Please enter a proper home address (include street, house number, or known location).',
      });
    }

    // Check if this email is already used, regardless of role
    const existingEmail = await User.findOne({email});

    if (existingEmail) {
      if (existingEmail.role === role) {
        return res
          .status(400)
          .json({message: 'User already registered with this role.'});
      } else {
        return res.status(400).json({
          message:
            'This email is already registered with another role. Please use a different email.',
        });
      }
    }

    const newUser = await User.create({
      fullName,
      email,
      contactNumber,
      role,
      address,
      password,
    });
    const token = jwt.sign({id: newUser._id}, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({
      message: 'Registration successful!',
      user: {id: newUser._id, fullName, email, contactNumber, role, address},
      token,
    });
  } catch (error) {
    res.status(500).json({message: 'Server error, please try again later.'});
  }
};

//Login User Function
const loginUser = async (req, res) => {
  try {
    const {fullName, password, role} = req.body;

    if (!fullName || !password || !role) {
      return res
        .status(400)
        .json({message: 'Enter full name, password & role.'});
    }

    const trimmedFullName = fullName.trim();
    const trimmedPassword = password.trim();
    const trimmedRole = role.trim();

    const user = await User.findOne({
      fullName: trimmedFullName,
      role: trimmedRole,
    });

    if (!user) {
      return res.status(400).json({message: 'User not found.'});
    }

    const isMatch = await bcrypt.compare(trimmedPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({message: 'Incorrect password.'});
    }

    const jwtSecret = process.env.JWT_SECRET || 'fallbackSecret';
    const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(200).json({
      message: 'Login successful!',
      token,
      redirectTo:
        role === 'Donate A Medicine' ? 'DonorHomeScreen' : 'ReceiverHomeScreen',
    });
  } catch (error) {
    res.status(500).json({message: 'Login failed. Try again later.'});
  }
};

//Logout User Function
const logoutUser = async (req, res) => {
  try {
    req.session = null;
    res.clearCookie('token');

    return res.status(200).json({message: 'Logout successful!'});
  } catch (error) {
    return res.status(500).json({message: 'Server error during logout.'});
  }
};

// Forgot User Function
const forgotPassword = async (req, res) => {
  try {
    const {email} = req.body;
    const user = await User.findOne({email});

    if (!user) {
      return res.status(400).json({message: 'User not found.'});
    }

    // Generate token here
    const token = crypto.randomBytes(20).toString('hex');

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // Expires in 15 mins
    await user.save();

    const emailLink = `${BACKEND_URL}/reset-password/${token}`;

    //  Send email with link
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: 'medshare.userhelp@gmail.com',
        pass: 'zzyp bvcx hkyl awgi',
      },
    });

    const mailOptions = {
      to: email,
      from: '"MedShare" <medshare.userhelp@gmail.com>',
      subject: 'Password Reset Request',
      html: `
        <p>Dear User,</p>
        <p>Click the link below to reset your password:</p>
        <a href="${emailLink}" style="color: blue; text-decoration: underline;">
      Reset Your Password
    </a>
        <p>This link will expire in 15 minutes.</p>
        <p>If you didn’t request this, you can ignore this email.</p>
        <p>MedShare Support Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({message: 'Reset link sent to email.'});
  } catch (error) {
    console.log("Email send error:", error);
    res.status(500).json({message: 'Server error.'});
  }
};


//Reset Password Function

const resetPassword = async (req, res) => {
  try {
    console.log('Reset Password Request:', req.body);

    const {token, newPassword} = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({message: 'Missing token or new password.'});
    }

    const user = await User.findOne({
      resetPasswordToken: token.trim(),
      resetPasswordExpires: {$gt: Date.now()},
    });

    if (!user) {
      return res.status(400).json({message: 'Invalid or expired token.'});
    }

    // Ensure the password matches the required format
    const passwordRegex =
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      console.log('Password Format Invalid');
      return res.status(400).json({
        message:
          'Password must contain at least 8 characters, one letter, one number, and one special character.',
      });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({message: 'Password reset successful.'});
  } catch (error) {
    res.status(500).json({message: 'Server error.'});
  }
};

// Middleware to verify password
const verifyPassword = async (req, res) => {
  const {password} = req.body;
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({valid: false, message: 'User not found'});

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.json({valid: false, message: 'Incorrect password'});

    res.json({valid: true});
  } catch (error) {
    res.status(500).json({valid: false, message: 'Internal server error'});
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const Request = require('../models/Request');
    const Notification = require('../models/Notification');
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({message: 'User not found.'});
    }

    if (user.role === 'Donate A Medicine') {
      for (const donation of donations) {
        // Each donation may have multiple images
        if (donation.images && donation.images.length > 0) {
          for (const imgPath of donation.images) {
            const fullPath = path.join(__dirname, '..', imgPath);
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath); // Delete image file
              } catch (err) {
                c
              }
            }
          }
        }
      }
      await Donation.deleteMany({donorId: userId});
      await Request.deleteMany({donorId: userId});
      await Notification.deleteMany({donorId: userId});
    } else if (user.role === 'Receive A Medicine') {
      await Request.deleteMany({receiverId: userId});
      await Notification.deleteMany({receiverId: userId});
    }

    await User.findByIdAndDelete(userId);

    res
      .status(200)
      .json({message: 'Account and related data deleted successfully.'});
  } catch (error) {
    res.status(500).json({message: 'Server error during account deletion.'});
  }
};


// Get current user info
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({message: 'User not found'});
    res.json({user});
  } catch (error) {
    res.status(500).json({message: 'Server error'});
  }
};

// Update user info
const updateProfile = async (req, res) => {
  try {
    const {fullName, email, contactNumber, password, address} = req.body;

    const updateData = {fullName, email, contactNumber, address};

    if (password && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!updatedUser) {
      return res.status(404).json({message: 'User not found'});
    }

    res.json({message: 'Profile updated', user: updatedUser});
  } catch (error) {
    res.status(500).json({message: 'Failed to update profile'});
  }
};

function parseFlexibleDate(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;

  const normalized = dateStr.trim().replace(/[\.\s/]+/g, '-');
  const parts = normalized.split('-').map(p => p.padStart(2, '0'));

  if (parts.length === 3) {
    // DD-MM-YYYY or YYYY-MM-DD
    if (parts[0].length === 4)
      return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`); // YYYY-MM-DD
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // DD-MM-YYYY
  } else if (parts.length === 2) {
    // MM-YYYY or YYYY-MM
    if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}`); // YYYY-MM
    return new Date(`${parts[1]}-${parts[0]}`); // MM-YYYY
  }

  return null;
}

// const submitDonation = async (req, res) => {
//   try {
//     const {
//       medicineName,
//       quantity,
//       medicineForm,
//       strength,
//       manufacturingDate,
//       expiryDate,
//       donorName,
//       donorPhoneNumber,
//       donorAddress,
//     } = req.body;

//     // const imagePaths = req.files.map(file => 'uploads/' + file.filename);
//     // const imagePaths = req.files.map(file => `${BACKEND_URL}/uploads/${file.filename}`);
// const imagePaths = req.files.map(file => `${process.env.BACKEND_URL}/uploads/${file.filename}`);


//     const parsedManufacturingDate = parseFlexibleDate(manufacturingDate);
//     const parsedExpiryDate = parseFlexibleDate(expiryDate);

//     if (parsedExpiryDate) {
//       const twoWeeksLater = new Date();
//       twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
//       if (parsedExpiryDate <= twoWeeksLater) {
//         return res.status(400).json({
//           message: 'We do not accept medicines expiring within 2 weeks.',
//         });
//       }
//     }

//     const newDonation = new Donation({
//       medicineName,
//       quantity,
//       medicineForm,
//       strength,
//       manufacturingDate: parsedManufacturingDate,
//       expiryDate: parsedExpiryDate,
//       donorName,
//       donorPhoneNumber,
//       donorAddress,
//       donorId: req.user._id,
//       images: imagePaths,
//     });

//     await newDonation.save();

//     res.status(201).json({message: 'Donation submitted successfully!'});
//   } catch (error) {
//     res.status(500).json({message: 'Server error'});
//   }
// };
const path = require('path');

const submitDonation = async (req, res) => {
  try {
    const {
      medicineName,
      quantity,
      medicineForm,
      strength,
      manufacturingDate,
      expiryDate,
      donorName,
      donorPhoneNumber,
      donorAddress,
    } = req.body;

    // Make sure BACKEND_URL is set correctly in your environment variables
    // Example: https://your-app.onrender.com
    
    const backendUrl = process.env.BACKEND_URL || 'https://medshareserver.onrender.com';

const imagePaths = req.files.map(file => `${backendUrl}/uploads/${file.filename}`);


    const parsedManufacturingDate = parseFlexibleDate(manufacturingDate);
    const parsedExpiryDate = parseFlexibleDate(expiryDate);

    if (parsedExpiryDate) {
      const twoWeeksLater = new Date();
      twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
      if (parsedExpiryDate <= twoWeeksLater) {
        return res.status(400).json({
          message: 'We do not accept medicines expiring within 2 weeks.',
        });
      }
    }

    const newDonation = new Donation({
      medicineName,
      quantity,
      medicineForm,
      strength,
      manufacturingDate: parsedManufacturingDate,
      expiryDate: parsedExpiryDate,
      donorName,
      donorPhoneNumber,
      donorAddress,
      donorId: req.user._id,
      images: imagePaths, // Store full URLs
    });

    await newDonation.save();

    res.status(201).json({ message: 'Donation submitted successfully!', donation: newDonation });
  } catch (error) {
    console.error('Submit Donation Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// Get current user profile
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'fullName contactNumber email role address',
    );
    if (!user) {
      return res.status(404).json({message: 'User not found'});
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({message: 'Server error'});
  }
};

const getDonations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all donations by this donor
    let donations = await Donation.find({donorId: userId}).sort({
      donationDate: -1,
    });

    // Find all approved requests (i.e., already donated medicines)
    const Request = require('../models/Request');
    const approvedRequests = await Request.find({status: 'approved'}).select(
      'medicineId',
    );
    const approvedMedicineIds = approvedRequests.map(r =>
      r.medicineId.toString(),
    );

    // Filter out medicines that have been approved (already donated)
    donations = donations.filter(
      d => !approvedMedicineIds.includes(d._id.toString()),
    );

    // Send back only those not donated yet (active or expired)
    res.status(200).json(donations);
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({message: 'Server error, unable to fetch donations.'});
  }
};

// Get all donations (for receiver side)
const getAllDonations = async (req, res) => {
  try {
    const today = new Date();
    let donations = await Donation.find({
      expiryDate: {$gte: today},
    }).populate('donorId', 'donorName donorPhoneNumber donorAddress');

    const Request = require('../models/Request');

    const approvedRequests = await Request.find({status: 'approved'}).select(
      'medicineId',
    );

    const approvedMedicineIds = approvedRequests.map(r =>
      r.medicineId.toString(),
    );

    donations = donations.filter(
      d => !approvedMedicineIds.includes(d._id.toString()),
    );

    res.json({success: true, donations});
  } catch (error) {
    res.status(500).json({success: false, message: 'Server error'});
  }
};

// Check for any new (unviewed) requests for donor
const checkNewRequests = async (req, res) => {
  try {
    if (req.user.role !== 'Donate A Medicine') {
      return res.status(403).json({message: 'Access denied. Donor only.'});
    }

    const donorId = req.user._id;
    const newRequests = await Request.find({
      donorId,
      viewedByDonor: {$ne: true},
    });

    res.json({
      hasNewRequests: newRequests.length > 0,
      count: newRequests.length,
    });
  } catch (err) {
    res.status(500).json({message: 'Server error checking requests.'});
  }
};

// Mark donor requests as viewed
const markRequestsViewed = async (req, res) => {
  try {
    const donorId = req.user._id;
    await Request.updateMany(
      {donorId, viewedByDonor: {$ne: true}},
      {$set: {viewedByDonor: true}},
    );
    res.json({message: 'Requests marked as viewed.'});
  } catch (err) {
    res.status(500).json({message: 'Server error updating viewed status.'});
  }
};

// Get all requests for a logged-in user (Donor or Receiver)
const Request = require('../models/Request');

const getRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    let requests;

    if (role === 'donor') {
      requests = await Request.find({donorId: userId})
        .populate('receiverId', 'fullName contactNumber address')
        .sort({createdAt: -1});
    } else if (role === 'receiver') {
      requests = await Request.find({receiverId: userId})
        .populate('donorId', 'fullName contactNumber address')
        .sort({createdAt: -1});
    } else {
      return res.status(400).json({message: 'Invalid user role'});
    }

    res.json({success: true, requests});
  } catch (err) {
    res
      .status(500)
      .json({success: false, message: 'Server error fetching requests'});
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  logoutUser,
  verifyPassword,
  deleteAccount,
  updateProfile,
  getProfile,
  submitDonation,
  getDonations,
  getMe,
  getAllDonations,
  checkNewRequests,
  markRequestsViewed,
  getRequests,
};

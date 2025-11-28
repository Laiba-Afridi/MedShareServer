const express = require('express');
const multer = require('multer');
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  logoutUser,
  verifyPassword,
  deleteAccount,
  getProfile,
  updateProfile,
  submitDonation,
  getDonations,
  getMe,
  getAllDonations,
  checkNewRequests,
  markRequestsViewed,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Request = require('../models/Request');
const Notification = require('../models/Notification');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// ---------------------- CLOUDINARY CONFIG ----------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------------------- MULTER MEMORY STORAGE ----------------------
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// ---------------------- ROUTES ----------------------

// Register, login, password
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logoutUser);
router.post('/verify-password', authenticate, verifyPassword);

// Profile
router.get('/profile', authenticate, getProfile);
router.patch('/profile', authenticate, updateProfile);
router.delete('/delete-account', authenticate, deleteAccount);
router.get('/me', authenticate, getMe);

// ---------------------- DONOR ROUTES ----------------------
// Donor donation upload (multiple images)
router.post('/donate', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Donation images required.' });
    }

    const uploadedImages = [];

    for (const file of req.files) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'medshare/donations' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      uploadedImages.push(result.secure_url);
    }

    // Map URLs for submitDonation controller
    req.files = uploadedImages.map(url => ({ path: url }));
    await submitDonation(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error uploading donation images.' });
  }
});

// Get donations
router.get('/donations', authenticate, getDonations);
router.get('/all-donations', async (req, res) => {
  try {
    await getAllDonations(req, res);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error fetching donations' });
  }
});

// ---------------------- RECEIVER ROUTES ----------------------
router.post(
  '/request-medicine',
  authenticate,
  upload.single('prescription'),
  async (req, res) => {
    try {
      const { medicineId, medicineName, strength, donorId } = req.body;
      const receiverId = req.user._id;

      if (!req.file) {
        return res.status(400).json({ message: 'Prescription image required.' });
      }

      // Upload prescription to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'medshare/requests' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      const prescriptionUrl = result.secure_url;

      // BULK or SINGLE request
      if (Array.isArray(medicineId)) {
        if (!Array.isArray(medicineName) || !Array.isArray(donorId)) {
          return res.status(400).json({ message: 'Invalid bulk request data.' });
        }

        const createdRequests = [];

        for (let i = 0; i < medicineId.length; i++) {
          const newReq = await Request.create({
            prescriptionImage: prescriptionUrl,
            medicineId: medicineId[i],
            medicineName: medicineName[i],
            donorId: Array.isArray(donorId) ? donorId[i] : donorId,
            strength: Array.isArray(strength) ? strength[i] : strength,
            receiverId,
          });

          await Notification.create({
            userId: donorId[i],
            message: `A receiver has requested your medicine "${medicineName[i]}${strength ? ` (${strength[i]})` : ''}".`,
            type: 'medicine_request',
            meta: { requestId: newReq._id },
          });

          createdRequests.push(newReq);
        }

        return res.status(201).json({
          message: 'Bulk request submitted successfully.',
          requests: createdRequests,
        });
      }

      // SINGLE request
      const newRequest = await Request.create({
        prescriptionImage: prescriptionUrl,
        medicineId,
        medicineName,
        strength,
        donorId,
        receiverId,
      });

      await Notification.create({
        userId: donorId,
        message: `A receiver has requested your medicine "${medicineName}${strength ? ` (${strength})` : ''}".`,
        type: 'medicine_request',
        meta: { requestId: newRequest._id },
      });

      res.status(201).json({
        message: 'Request submitted successfully.',
        request: newRequest,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  },
);

// Get receiver requests
router.get('/receiver-requests', authenticate, async (req, res) => {
  try {
    const receiverId = req.user._id;

    const requests = await Request.aggregate([
      { $match: { receiverId } },
      {
        $addFields: {
          sortOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'pending'] }, then: 1 },
                { case: { $eq: ['$status', 'approved'] }, then: 2 },
                { case: { $eq: ['$status', 'rejected'] }, then: 3 },
              ],
              default: 4,
            },
          },
        },
      },
      { $sort: { sortOrder: 1, createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'donorId',
          foreignField: '_id',
          as: 'donorId',
        },
      },
      { $unwind: { path: '$donorId', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          prescriptionImage: 1,
          medicineId: 1,
          medicineName: 1,
          donorId: { fullName: 1, contactNumber: 1, address: 1 },
          status: 1,
          createdAt: 1,
          rejectReason: 1,
        },
      },
    ]);

    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching requests.' });
  }
});

// Donor approval requests
router.get('/donor-requests', authenticate, async (req, res) => {
  try {
    const donorId = req.user._id;
    const requests = await Request.find({ donorId })
      .populate({
        path: 'receiverId',
        select: 'fullName contactNumber address',
        match: { _id: { $ne: null } },
      })
      .sort({ createdAt: -1 });

    const validRequests = requests.filter(r => r.receiverId !== null);
    res.json({ requests: validRequests });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching donor requests' });
  }
});

// Notifications
router.get('/notifications', authenticate, async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10);
  res.json({ notifications });
});

router.patch('/notifications/read', authenticate, async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ message: 'Notifications marked as read' });
});

// Update approval status
router.put('/update-request/:id', authenticate, async (req, res) => {
  try {
    const donorId = req.user._id;
    const { status, reason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const request = await Request.findOne({ _id: req.params.id, donorId });
    if (!request) return res.status(404).json({ message: 'Request not found or unauthorized' });

    request.status = status;
    if (status === 'rejected') request.rejectReason = reason || 'No reason provided';
    await request.save();

    const receiverId = request.receiverId;
    const message =
      status === 'approved'
        ? `Your request for "${request.medicineName}" has been approved!`
        : `Your request for "${request.medicineName}" has been rejected.`;

    await Notification.create({
      userId: receiverId,
      message,
      type: 'request_update',
      meta: { requestId: request._id, status },
    });

    res.json({ message: 'Request updated successfully', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error updating request' });
  }
});

// Cascade delete receiver requests if receiver deletes account
User.watch().on('change', async change => {
  try {
    if (change.operationType === 'delete') {
      const deletedUserId = change.documentKey._id;
      await Request.deleteMany({ receiverId: deletedUserId });
    }
  } catch (err) {}
});

module.exports = router;

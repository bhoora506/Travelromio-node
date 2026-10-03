'use strict';

/**
 * src/middleware/uploadTrip.js
 *
 * Multer middleware for trip image uploads.
 *
 * Laravel contract:
 *   field: 'image'
 *   mimes: jpeg, png, jpg, webp
 *   max:   5120 KB (5 MB)
 *   stored in disk('public') -> 'trips/' directory
 *
 * Node equivalent:
 *   Stored at public/storage/trips/{random_hex}{ext}
 *   DB stores relative path: "trips/{filename}"
 *   URL served as: APP_URL/storage/trips/{filename}
 *
 * NOTE: Multer validates MIME type from the HTTP Content-Type reported by
 * the client. It does NOT inspect magic bytes. This is documented as a
 * known deviation from Laravel's server-side image validation.
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../public/storage/trips');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

const fileFilter = (req, file, cb) => {
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, JPG, and WEBP are allowed.'), false);
  }
};

const uploadTrip = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: fileFilter
});

module.exports = uploadTrip;

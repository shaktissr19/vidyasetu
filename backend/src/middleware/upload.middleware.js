const multer = require('multer');
const path   = require('path');

const ALLOWED_MIME = {
  'video/mp4': true, 'video/webm': true,
  'application/pdf': true,
  'image/jpeg': true, 'image/png': true, 'image/webp': true,
};

const MAX_SIZE_MB = parseInt(process.env.CONTENT_MAX_SIZE_MB || '500');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME[file.mimetype]) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type ${file.mimetype} not allowed`), { status: 400 }), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

module.exports = {
  uploadSingle:   (field) => upload.single(field),
  uploadMultiple: (field, max = 10) => upload.array(field, max),
};

import multer from 'multer';

// Mirrors smart-duka-backend's src/middlewares/upload.js exactly — same
// 5MB/image-only limits, not loosened.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

export default upload;

const fs = require('fs');
const path = require('path');
const multer = require('multer');

function deleteUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  fs.unlink(file.path, () => {});
}

function deleteUploadedFiles(files) {
  if (!Array.isArray(files)) {
    return;
  }

  files.forEach((file) => {
    if (file?.path) {
      fs.unlink(file.path, () => {});
    }
  });
}

function deleteStoredUpload(uploadPath) {
  if (typeof uploadPath !== 'string' || !uploadPath.startsWith('/uploads/')) {
    return;
  }

  const normalizedRelativePath = uploadPath.replace(/^\/uploads\//, '');
  const absolutePath = path.join(__dirname, '..', 'uploads', normalizedRelativePath);
  const uploadsRoot = path.join(__dirname, '..', 'uploads');

  if (!absolutePath.startsWith(uploadsRoot)) {
    return;
  }

  fs.unlink(absolutePath, () => {});
}

function getUploadedFilesByField(req, fieldName) {
  if (req?.files && !Array.isArray(req.files)) {
    return Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
  }

  return [];
}

function createImageUpload({
  folder,
  field,
  foldersByField,
  fields,
  maxCount = 1,
  maxFileSize = 5 * 1024 * 1024,
  invalidTypeMessage = 'File must be an image.',
} = {}) {
  const uploadRoot = path.join(__dirname, '..', 'uploads');
  const upload = multer({
    storage: multer.diskStorage({
      destination(_req, file, callback) {
        const folderName = foldersByField?.[file.fieldname] || folder;
        const destinationDir = path.join(uploadRoot, folderName);
        fs.mkdirSync(destinationDir, { recursive: true });
        callback(null, destinationDir);
      },
      filename(_req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
        callback(null, uniqueName);
      },
    }),
    limits: {
      fileSize: maxFileSize,
      files: Array.isArray(fields)
        ? fields.reduce((total, item) => total + (item.maxCount || 1), 0)
        : maxCount,
    },
    fileFilter(_req, file, callback) {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        callback(new Error(invalidTypeMessage));
        return;
      }

      callback(null, true);
    },
  });

  const receive = Array.isArray(fields) ? upload.fields(fields) : upload.single(field);

  return (req, res, next) => {
    receive(req, res, (error) => {
      if (!error) {
        return next();
      }

      return res.status(400).json({
        message: error.message,
      });
    });
  };
}

module.exports = {
  createImageUpload,
  deleteUploadedFile,
  deleteUploadedFiles,
  deleteStoredUpload,
  getUploadedFilesByField,
};

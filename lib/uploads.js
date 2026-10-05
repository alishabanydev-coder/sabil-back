const fs = require('fs');
const path = require('path');

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

module.exports = {
  deleteUploadedFile,
  deleteUploadedFiles,
  deleteStoredUpload,
  getUploadedFilesByField,
};

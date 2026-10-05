const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const Catalogue = require('../../models/catalogue.model');
const {
  authenticateAdmin,
  requireSuperAdmin,
} = require('../../middleware/adminAuth');
const {
  deleteUploadedFiles,
  deleteStoredUpload,
  getUploadedFilesByField,
} = require('../../lib/uploads');
const {
  normalizeProjectAsset,
  normalizeProjectCharacterImagePath,
} = require('../../lib/mediaPaths');

const projectThumbnailUploadDir = path.join(__dirname, '..', '..', 'uploads', 'project-thumbnails');

const projectThumbnailUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdirSync(projectThumbnailUploadDir, { recursive: true });
      callback(null, projectThumbnailUploadDir);
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

      callback(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 25,
  },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Project thumbnail must be an image file.'));
      return;
    }

    callback(null, true);
  },
});

function uploadProjectThumbnail(req, res, next) {
  projectThumbnailUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'characterImages', maxCount: 24 },
  ])(req, res, (error) => {
    if (!error) {
      return next();
    }

    return res.status(400).json({
      message: error.message,
    });
  });
}
function parseProjectCharactersField(rawCharacters, uploadedCharacterFiles) {
  if (rawCharacters === undefined || rawCharacters === null || rawCharacters === '') {
    if (Array.isArray(uploadedCharacterFiles) && uploadedCharacterFiles.length > 0) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Characters payload is required when character images are uploaded.',
      };
    }

    return {
      ok: true,
      characters: [],
      usedImageFileIndices: [],
      message: '',
    };
  }

  let parsedCharacters;
  if (typeof rawCharacters === 'string') {
    try {
      parsedCharacters = JSON.parse(rawCharacters);
    } catch {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Invalid characters payload.',
      };
    }
  } else if (Array.isArray(rawCharacters)) {
    parsedCharacters = rawCharacters;
  } else {
    return {
      ok: false,
      characters: [],
      usedImageFileIndices: [],
      message: 'Invalid characters payload.',
    };
  }

  if (!Array.isArray(parsedCharacters)) {
    return {
      ok: false,
      characters: [],
      usedImageFileIndices: [],
      message: 'Characters must be an array.',
    };
  }

  const normalizedCharacters = [];
  const usedImageFileIndices = [];

  for (const item of parsedCharacters) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: 'Each character must have a name.',
      };
    }

    let image = '';
    if (Number.isInteger(item?.imageFileIndex)) {
      const uploadedFile = uploadedCharacterFiles[item.imageFileIndex];
      if (uploadedFile?.filename) {
        image = `/uploads/project-thumbnails/${uploadedFile.filename}`;
        usedImageFileIndices.push(item.imageFileIndex);
      } else {
        return {
          ok: false,
          characters: [],
          usedImageFileIndices: [],
          message: `Character "${name}" image file index is invalid.`,
        };
      }
    }

    if (!image && typeof item?.image === 'string') {
      image = normalizeProjectCharacterImagePath(item.image);
    }

    if (!image) {
      return {
        ok: false,
        characters: [],
        usedImageFileIndices: [],
        message: `Character "${name}" must have an image.`,
      };
    }

    normalizedCharacters.push({
      name,
      image,
    });
  }

  return {
    ok: true,
    characters: normalizedCharacters,
    usedImageFileIndices,
    message: '',
  };
}
const router = express.Router();

router.get(
  '/projects',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const projects = await Project.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      projects: projects.map((project) =>
        normalizeProjectAsset(project.toObject())
      ),
    });
  }
);

router.post(
  '/projects',
  authenticateAdmin,
  requireSuperAdmin,
  uploadProjectThumbnail,
  async (req, res) => {
    const { name, description, characters } = req.body || {};
    const thumbnailFile = getUploadedFilesByField(req, 'thumbnail')[0];
    const uploadedCharacterFiles = getUploadedFilesByField(req, 'characterImages');
    const uploadedProjectFiles = [thumbnailFile, ...uploadedCharacterFiles].filter(
      Boolean
    );
    const parsedCharacters = parseProjectCharactersField(
      characters,
      uploadedCharacterFiles
    );
    const unusedUploadedCharacterFiles = uploadedCharacterFiles.filter(
      (_file, index) => !parsedCharacters.usedImageFileIndices?.includes(index)
    );

    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      !name.trim() ||
      !description.trim() ||
      !thumbnailFile ||
      !parsedCharacters.ok
    ) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message:
          parsedCharacters.ok
            ? 'Project name, thumbnail, and description are required.'
            : parsedCharacters.message,
      });
    }

    const nextThumbnail = `/uploads/project-thumbnails/${thumbnailFile.filename}`;

    try {
      const project = await Project.create({
        name: name.trim(),
        thumbnail: nextThumbnail,
        description: description.trim(),
        characters: parsedCharacters.characters,
      });
      deleteUploadedFiles(unusedUploadedCharacterFiles);

      return res.status(201).json({
        project: normalizeProjectAsset(project.toObject()),
      });
    } catch (error) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/projects/:id',
  authenticateAdmin,
  requireSuperAdmin,
  uploadProjectThumbnail,
  async (req, res) => {
    const { id } = req.params;
    const thumbnailFile = getUploadedFilesByField(req, 'thumbnail')[0];
    const uploadedCharacterFiles = getUploadedFilesByField(req, 'characterImages');
    const uploadedProjectFiles = [thumbnailFile, ...uploadedCharacterFiles].filter(
      Boolean
    );

    if (!mongoose.Types.ObjectId.isValid(id)) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const updates = {};
    const { name, description, characters } = req.body || {};

    if (typeof name === 'string') {
      updates.name = name.trim();
    }

    if (typeof description === 'string') {
      updates.description = description.trim();
    }

    if (thumbnailFile) {
      updates.thumbnail = `/uploads/project-thumbnails/${thumbnailFile.filename}`;
    }

    if (characters !== undefined) {
      const parsedCharacters = parseProjectCharactersField(
        characters,
        uploadedCharacterFiles
      );
      const unusedUploadedCharacterFiles = uploadedCharacterFiles.filter(
        (_file, index) => !parsedCharacters.usedImageFileIndices?.includes(index)
      );
      if (!parsedCharacters.ok) {
        deleteUploadedFiles(uploadedProjectFiles);

        return res.status(400).json({
          message: parsedCharacters.message,
        });
      }

      updates.characters = parsedCharacters.characters;
      deleteUploadedFiles(unusedUploadedCharacterFiles);
    }

    try {
      const project = await Project.findById(id);

      if (!project) {
        deleteUploadedFiles(uploadedProjectFiles);

        return res.status(404).json({
          message: 'Project not found.',
        });
      }

      const previousThumbnail = project.thumbnail;
      const previousCharacterImages = Array.isArray(project.characters)
        ? project.characters.map((item) => item.image)
        : [];
      Object.assign(project, updates);
      await project.save();

      if (thumbnailFile && previousThumbnail !== project.thumbnail) {
        deleteStoredUpload(previousThumbnail);
      }

      const nextCharacterImages = Array.isArray(project.characters)
        ? project.characters.map((item) => item.image)
        : [];

      previousCharacterImages.forEach((imagePath) => {
        if (!nextCharacterImages.includes(imagePath)) {
          deleteStoredUpload(imagePath);
        }
      });

      return res.status(200).json({
        project: normalizeProjectAsset(project.toObject()),
      });
    } catch (error) {
      deleteUploadedFiles(uploadedProjectFiles);

      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.delete(
  '/projects/:id',
  authenticateAdmin,
  requireSuperAdmin,
  async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid project id.',
      });
    }

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({
        message: 'Project not found.',
      });
    }

    const [videos, catalogues] = await Promise.all([
      Video.find({ projectId: id }),
      Catalogue.find({ projectId: id }),
    ]);

    await Promise.all([
      Video.deleteMany({ projectId: id }),
      Catalogue.deleteMany({ projectId: id }),
    ]);
    await project.deleteOne();

    videos.forEach((video) => {
      deleteStoredUpload(video.thumbnail);
    });
    catalogues.forEach((catalogue) => {
      deleteStoredUpload(catalogue.image);
    });
    deleteStoredUpload(project.thumbnail);
    if (Array.isArray(project.characters)) {
      project.characters.forEach((character) => {
        deleteStoredUpload(character.image);
      });
    }

    return res.status(200).json({
      message: 'Project and related content deleted.',
    });
  }
);

module.exports = router;


const express = require('express');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  createImageUpload,
  deleteUploadedFiles,
  getUploadedFilesByField,
} = require('../../lib/uploads');
const {
  parseDonationProjectId,
  parseDonationScalarFields,
  parseFaqField,
  parseSectionsField,
  parseStaffField,
  parseStepsField,
  parseUpdateRefsField,
  slugifyDonationTitle,
  normalizeStoredAssetPath,
  validateDonationScalars,
} = require('./donation.validation');
const {
  assertUpdateRefsExist,
  createDonationProject,
  deleteDonationProject,
  getDonationProject,
  getDonationProjectDocument,
  getPublicDonationProject,
  listDonationProjects,
  listPublicDonationProjects,
  saveDonationProjectDocument,
} = require('./donation.service');

const router = express.Router();

const uploadDonationAssets = createImageUpload({
  foldersByField: {
    poster: 'donation-posters',
    sectionImages: 'donation-section-images',
    staffPhotos: 'donation-staff-photos',
  },
  fields: [
    { name: 'poster', maxCount: 1 },
    { name: 'sectionImages', maxCount: 48 },
    { name: 'staffPhotos', maxCount: 48 },
  ],
  maxFileSize: 8 * 1024 * 1024,
  invalidTypeMessage: 'Donation images must be image files.',
});

function reject(res, message) {
  return res.status(400).json({ message });
}

function collectUploadedFiles(req) {
  const posterFile = getUploadedFilesByField(req, 'poster')[0];
  const uploadedSectionImages = getUploadedFilesByField(req, 'sectionImages');
  const uploadedStaffPhotos = getUploadedFilesByField(req, 'staffPhotos');
  return {
    posterFile,
    uploadedSectionImages,
    uploadedStaffPhotos,
    uploadedFiles: [posterFile, ...uploadedSectionImages, ...uploadedStaffPhotos].filter(Boolean),
  };
}

function discardUnusedStaffPhotos(uploadedStaffPhotos, usedPhotoFileIndices = []) {
  deleteUploadedFiles(
    uploadedStaffPhotos.filter((_file, index) => !usedPhotoFileIndices.includes(index))
  );
}

async function readDonationBody(req, uploadedSectionImages, uploadedStaffPhotos, partial) {
  const parsedSections = partial.sections
    ? parseSectionsField(req.body?.sections, uploadedSectionImages)
    : null;
  if (parsedSections && !parsedSections.ok) {
    return parsedSections;
  }

  const parsedFaq = partial.faq ? parseFaqField(req.body?.faq) : null;
  if (parsedFaq && !parsedFaq.ok) {
    return parsedFaq;
  }

  const parsedSteps = partial.steps ? parseStepsField(req.body?.steps) : null;
  if (parsedSteps && !parsedSteps.ok) {
    return parsedSteps;
  }

  const parsedStaff = partial.staff
    ? parseStaffField(req.body?.staff, uploadedStaffPhotos)
    : null;
  if (parsedStaff && !parsedStaff.ok) {
    return parsedStaff;
  }

  const parsedUpdateRefs = partial.updateRefs ? parseUpdateRefsField(req.body?.updateRefs) : null;
  if (parsedUpdateRefs && !parsedUpdateRefs.ok) {
    return parsedUpdateRefs;
  }

  if (parsedUpdateRefs?.ok) {
    await assertUpdateRefsExist(parsedUpdateRefs.updateRefs);
  }

  return {
    ok: true,
    parsedSections,
    parsedFaq,
    parsedSteps,
    parsedStaff,
    parsedUpdateRefs,
  };
}

router.get('/public/donation-projects', async (_req, res) => {
  const donationProjects = await listPublicDonationProjects();
  return res.status(200).json({ donationProjects });
});

router.get('/public/donation-projects/:slugOrId', async (req, res) => {
  const donationProject = await getPublicDonationProject(req.params.slugOrId);
  return res.status(200).json({ donationProject });
});

router.get(
  '/donation-projects',
  authenticateAdmin,
  requireTabPermission('donation', 'read'),
  async (_req, res) => {
    const donationProjects = await listDonationProjects();
    return res.status(200).json({ donationProjects });
  }
);

router.get(
  '/donation-projects/:id',
  authenticateAdmin,
  requireTabPermission('donation', 'read'),
  async (req, res) => {
    const parsedId = parseDonationProjectId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const donationProject = await getDonationProject(parsedId.value);
    return res.status(200).json({ donationProject });
  }
);

router.post(
  '/donation-projects',
  authenticateAdmin,
  requireTabPermission('donation', 'create'),
  uploadDonationAssets,
  async (req, res, next) => {
    const files = collectUploadedFiles(req);
    const fields = parseDonationScalarFields(req.body);
    const scalarError = validateDonationScalars(fields, {
      requirePosterPath: files.posterFile,
    });

    if (scalarError || !files.posterFile) {
      deleteUploadedFiles(files.uploadedFiles);
      return reject(res, scalarError || 'Poster image is required.');
    }

    try {
      const parsed = await readDonationBody(req, files.uploadedSectionImages, files.uploadedStaffPhotos, {
        sections: true,
        faq: true,
        steps: true,
        staff: true,
        updateRefs: true,
      });

      if (!parsed.ok) {
        deleteUploadedFiles(files.uploadedFiles);
        return reject(res, parsed.message);
      }

      discardUnusedStaffPhotos(
        files.uploadedStaffPhotos,
        parsed.parsedStaff.usedPhotoFileIndices
      );

      const donationProject = await createDonationProject({
        title: fields.title,
        slug: fields.slug,
        poster: `/uploads/donation-posters/${files.posterFile.filename}`,
        videoUrl: fields.videoUrl,
        shortDescription: fields.shortDescription,
        goalAmount: fields.goalAmount,
        raisedAmount: fields.raisedAmount,
        donorCount: fields.donorCount,
        currency: fields.currency,
        sections: parsed.parsedSections.sections,
        faq: parsed.parsedFaq.faq,
        steps: parsed.parsedSteps.steps,
        staff: parsed.parsedStaff.staff,
        startDate: fields.startDate,
        endDate: fields.endDate,
        status: fields.status,
        projectId: fields.projectId,
        updateRefs: parsed.parsedUpdateRefs.updateRefs,
        showOnDonationPage: fields.showOnDonationPage,
        listOrder: fields.listOrder,
      });

      return res.status(201).json({ donationProject });
    } catch (error) {
      deleteUploadedFiles(files.uploadedFiles);
      return next(error);
    }
  }
);

router.patch(
  '/donation-projects/:id',
  authenticateAdmin,
  requireTabPermission('donation', 'update'),
  uploadDonationAssets,
  async (req, res, next) => {
    const parsedId = parseDonationProjectId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    const files = collectUploadedFiles(req);

    try {
      const existing = await getDonationProjectDocument(parsedId.value);
      const fields = parseDonationScalarFields({
        ...existing.toObject(),
        ...req.body,
        slug:
          req.body?.slug !== undefined
            ? req.body.slug
            : existing.slug || slugifyDonationTitle(req.body?.title || existing.title),
      });
      const scalarError = validateDonationScalars(fields, {
        requirePosterPath: files.posterFile || existing.poster,
      });

      if (scalarError) {
        deleteUploadedFiles(files.uploadedFiles);
        return reject(res, scalarError);
      }

      const parsed = await readDonationBody(
        req,
        files.uploadedSectionImages,
        files.uploadedStaffPhotos,
        {
          sections: req.body?.sections !== undefined,
          faq: req.body?.faq !== undefined,
          steps: req.body?.steps !== undefined,
          staff: req.body?.staff !== undefined,
          updateRefs: req.body?.updateRefs !== undefined,
        }
      );

      if (!parsed.ok) {
        deleteUploadedFiles(files.uploadedFiles);
        return reject(res, parsed.message);
      }

      discardUnusedStaffPhotos(
        files.uploadedStaffPhotos,
        parsed.parsedStaff?.usedPhotoFileIndices
      );

      existing.title = fields.title;
      existing.slug = fields.slug;
      existing.videoUrl = fields.videoUrl;
      existing.shortDescription = fields.shortDescription;
      existing.goalAmount = fields.goalAmount;
      existing.raisedAmount = fields.raisedAmount;
      existing.donorCount = fields.donorCount;
      existing.currency = fields.currency;
      existing.startDate = fields.startDate;
      existing.endDate = fields.endDate;
      existing.status = fields.status;
      existing.projectId = fields.projectId;
      existing.showOnDonationPage = fields.showOnDonationPage;
      existing.listOrder = fields.listOrder;

      if (files.posterFile) {
        existing.poster = `/uploads/donation-posters/${files.posterFile.filename}`;
      } else if (typeof req.body?.existingPoster === 'string') {
        const normalizedPoster = normalizeStoredAssetPath(req.body.existingPoster);
        if (normalizedPoster) {
          existing.poster = normalizedPoster;
        }
      }

      if (parsed.parsedSections?.ok) {
        existing.sections = parsed.parsedSections.sections;
      }
      if (parsed.parsedFaq?.ok) {
        existing.faq = parsed.parsedFaq.faq;
      }
      if (parsed.parsedSteps?.ok) {
        existing.steps = parsed.parsedSteps.steps;
      }
      if (parsed.parsedStaff?.ok) {
        existing.staff = parsed.parsedStaff.staff;
      }
      if (parsed.parsedUpdateRefs?.ok) {
        existing.updateRefs = parsed.parsedUpdateRefs.updateRefs;
      }

      const donationProject = await saveDonationProjectDocument(existing);
      return res.status(200).json({ donationProject });
    } catch (error) {
      deleteUploadedFiles(files.uploadedFiles);
      return next(error);
    }
  }
);

router.delete(
  '/donation-projects/:id',
  authenticateAdmin,
  requireTabPermission('donation', 'delete'),
  async (req, res) => {
    const parsedId = parseDonationProjectId(req.params.id);
    if (!parsedId.ok) {
      return reject(res, parsedId.message);
    }

    await deleteDonationProject(parsedId.value);
    return res.status(200).json({ message: 'Donation project deleted.' });
  }
);

module.exports = router;

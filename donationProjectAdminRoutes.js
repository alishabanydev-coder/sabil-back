const fs = require('fs');
const path = require('path');
const multer = require('multer');

function createDonationProjectAdminRoutes({
  router,
  mongoose,
  DonationProject,
  Blog,
  ProjectBreakDown,
  authenticateAdmin,
  requireTabPermission,
  deleteUploadedFiles,
  deleteUploadedFile,
  getUploadedFilesByField,
}) {
  const donationPosterUploadDir = path.join(
    __dirname,
    'uploads',
    'donation-posters'
  );
  const donationSectionImageUploadDir = path.join(
    __dirname,
    'uploads',
    'donation-section-images'
  );

  const donationUpload = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        const destinationDir =
          file.fieldname === 'poster'
            ? donationPosterUploadDir
            : donationSectionImageUploadDir;

        fs.mkdirSync(destinationDir, { recursive: true });
        callback(null, destinationDir);
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
      fileSize: 8 * 1024 * 1024,
    },
    fileFilter(_req, file, callback) {
      if (!file.mimetype.startsWith('image/')) {
        callback(new Error('Donation images must be image files.'));
        return;
      }

      callback(null, true);
    },
  });

  function uploadDonationAssets(req, res, next) {
    donationUpload.fields([
      { name: 'poster', maxCount: 1 },
      { name: 'sectionImages', maxCount: 48 },
    ])(req, res, (error) => {
      if (!error) {
        return next();
      }

      return res.status(400).json({
        message: error.message,
      });
    });
  }

  function slugifyDonationTitle(title) {
    const slug = String(title || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180);

    return slug || `donation-${Date.now()}`;
  }

  function normalizeStoredAssetPath(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
      return '';
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed);
        return parsed.pathname.startsWith('/uploads/')
          ? parsed.pathname
          : trimmed;
      } catch {
        return trimmed;
      }
    }

    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  function normalizeDonationProjectRecord(project) {
    if (!project) {
      return project;
    }

    const plain =
      typeof project.toObject === 'function' ? project.toObject() : project;

    return {
      ...plain,
      poster: normalizeStoredAssetPath(plain.poster),
      donorCount: Number(plain.donorCount ?? 0),
      sections: Array.isArray(plain.sections)
        ? plain.sections.map((section) => ({
            ...section,
            images: Array.isArray(section.images)
              ? section.images
                  .map((image) => normalizeStoredAssetPath(image))
                  .filter(Boolean)
              : [],
          }))
        : [],
    };
  }

  function parseJsonField(rawValue, fieldName) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return { ok: true, value: [] };
    }

    if (typeof rawValue === 'string') {
      try {
        return { ok: true, value: JSON.parse(rawValue) };
      } catch {
        return { ok: false, message: `Invalid ${fieldName} payload.` };
      }
    }

    return { ok: true, value: rawValue };
  }

  function parseSectionsField(rawSections, uploadedSectionImages) {
    const parsed = parseJsonField(rawSections, 'sections');
    if (!parsed.ok) {
      return parsed;
    }

    if (!Array.isArray(parsed.value)) {
      return { ok: false, message: 'Sections must be an array.' };
    }

    const usedImageFileIndices = [];
    const sections = [];

    for (const item of parsed.value) {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      if (!id) {
        return { ok: false, message: 'Each section requires an id.' };
      }

      const images = [];
      const rawImages = Array.isArray(item?.images) ? item.images : [];

      for (const imageItem of rawImages) {
        if (typeof imageItem === 'string') {
          const normalized = normalizeStoredAssetPath(imageItem);
          if (normalized) {
            images.push(normalized);
          }
          continue;
        }

        if (
          imageItem &&
          typeof imageItem === 'object' &&
          Number.isInteger(imageItem.imageFileIndex)
        ) {
          const uploadedFile =
            uploadedSectionImages[imageItem.imageFileIndex] || null;

          if (!uploadedFile) {
            return {
              ok: false,
              message: 'Section image upload is missing for one or more sections.',
            };
          }

          usedImageFileIndices.push(imageItem.imageFileIndex);
          images.push(
            `/uploads/donation-section-images/${uploadedFile.filename}`
          );
        }
      }

      sections.push({
        id,
        header:
          typeof item?.header === 'string' && item.header.trim()
            ? item.header.trim()
            : null,
        text:
          typeof item?.text === 'string' && item.text.trim()
            ? item.text.trim()
            : null,
        images,
        order:
          typeof item?.order === 'number' && item.order >= 0 ? item.order : 0,
      });
    }

    return {
      ok: true,
      sections,
      usedImageFileIndices,
    };
  }

  function parseFaqField(rawFaq) {
    const parsed = parseJsonField(rawFaq, 'faq');
    if (!parsed.ok) {
      return parsed;
    }

    if (!Array.isArray(parsed.value)) {
      return { ok: false, message: 'FAQ must be an array.' };
    }

    const faq = parsed.value.map((item, index) => {
      const header = typeof item?.header === 'string' ? item.header.trim() : '';
      const summary = typeof item?.summary === 'string' ? item.summary.trim() : '';

      if (!header) {
        throw new Error(`FAQ item ${index + 1} requires a header.`);
      }

      return {
        header,
        summary: summary || '-',
        order:
          typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
      };
    });

    return { ok: true, faq };
  }

  async function parseUpdateRefsField(rawUpdateRefs) {
    const parsed = parseJsonField(rawUpdateRefs, 'updateRefs');
    if (!parsed.ok) {
      return parsed;
    }

    if (!Array.isArray(parsed.value)) {
      return { ok: false, message: 'updateRefs must be an array.' };
    }

    const updateRefs = [];

    for (const [index, item] of parsed.value.entries()) {
      const refType = item?.refType;
      const refId = item?.refId;

      if (refType !== 'Blog' && refType !== 'BreakDown') {
        return {
          ok: false,
          message: `Update ref ${index + 1} has an invalid refType.`,
        };
      }

      if (!mongoose.Types.ObjectId.isValid(refId)) {
        return {
          ok: false,
          message: `Update ref ${index + 1} has an invalid refId.`,
        };
      }

      const model = refType === 'Blog' ? Blog : ProjectBreakDown;
      const exists = await model.exists({ _id: refId });

      if (!exists) {
        return {
          ok: false,
          message: `${refType} reference was not found for update ref ${index + 1}.`,
        };
      }

      updateRefs.push({
        refType,
        refId,
        order:
          typeof item?.order === 'number' && item.order >= 0 ? item.order : index,
      });
    }

    return { ok: true, updateRefs };
  }

  function parseDonationScalarFields(body = {}) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const shortDescription =
      typeof body.shortDescription === 'string'
        ? body.shortDescription.trim()
        : '';
    const goalAmount = Number(body.goalAmount);
    const raisedAmount =
      body.raisedAmount === undefined || body.raisedAmount === ''
        ? 0
        : Number(body.raisedAmount);
    const donorCount =
      body.donorCount === undefined || body.donorCount === ''
        ? 0
        : Number(body.donorCount);
    const currency = body.currency === 'INR' ? 'INR' : 'USD';
    const status =
      body.status === 'finished' || body.status === 'paused'
        ? body.status
        : 'ongoing';
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate =
      body.endDate === undefined || body.endDate === null || body.endDate === ''
        ? null
        : new Date(body.endDate);
    const projectId =
      body.projectId &&
      mongoose.Types.ObjectId.isValid(String(body.projectId))
        ? body.projectId
        : null;
    const showOnDonationPage = (() => {
      const value = body.showOnDonationPage;

      if (value === undefined || value === null || value === "") {
        return true;
      }

      if (value === false || value === "false" || value === "0") {
        return false;
      }

      return true;
    })();
    const listOrderRaw = body.listOrder;
    const listOrder =
      listOrderRaw === undefined || listOrderRaw === null || listOrderRaw === ''
        ? null
        : Number(listOrderRaw);
    const videoUrl =
      typeof body.videoUrl === 'string' && body.videoUrl.trim()
        ? body.videoUrl.trim()
        : null;
    const slug =
      typeof body.slug === 'string' && body.slug.trim()
        ? body.slug.trim().toLowerCase()
        : slugifyDonationTitle(title);

    return {
      title,
      slug,
      shortDescription,
      goalAmount,
      raisedAmount,
      donorCount,
      currency,
      status,
      startDate,
      endDate,
      projectId,
      showOnDonationPage,
      listOrder,
      videoUrl,
    };
  }

  function validateDonationScalars(fields, { requirePosterPath }) {
    if (!fields.title) {
      return 'Title is required.';
    }

    if (!Number.isFinite(fields.goalAmount) || fields.goalAmount < 0) {
      return 'Goal amount must be a valid non-negative number.';
    }

    if (!Number.isFinite(fields.raisedAmount) || fields.raisedAmount < 0) {
      return 'Raised amount must be a valid non-negative number.';
    }

    if (!Number.isFinite(fields.donorCount) || fields.donorCount < 0) {
      return 'Donor count must be a valid non-negative number.';
    }

    if (!Number.isInteger(fields.donorCount)) {
      return 'Donor count must be a whole number.';
    }

    if (!fields.startDate || Number.isNaN(fields.startDate.getTime())) {
      return 'Start date is required.';
    }

    if (
      fields.endDate &&
      (Number.isNaN(fields.endDate.getTime()) ||
        fields.endDate.getTime() < fields.startDate.getTime())
    ) {
      return 'End date must be after the start date.';
    }

    if (
      fields.listOrder !== null &&
      (!Number.isInteger(fields.listOrder) || fields.listOrder < 1)
    ) {
      return 'listOrder must be a positive integer when provided.';
    }

    if (!requirePosterPath) {
      return 'Poster image is required.';
    }

    return '';
  }

  router.get('/public/donation-projects', async (_req, res) => {
    const projects = await DonationProject.find({ showOnDonationPage: true })
      .sort({ listOrder: 1, createdAt: -1 })
      .select(
        'title slug poster shortDescription goalAmount raisedAmount donorCount currency status listOrder'
      )
      .lean();

    return res.status(200).json({
      donationProjects: projects.map(normalizeDonationProjectRecord),
    });
  });

  router.get('/public/donation-projects/:slugOrId', async (req, res) => {
    const { slugOrId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(slugOrId)
      ? { _id: slugOrId }
      : { slug: String(slugOrId).trim().toLowerCase() };

    const project = await DonationProject.findOne({
      ...query,
      showOnDonationPage: true,
    }).lean();

    if (!project) {
      return res.status(404).json({
        message: 'Donation project not found.',
      });
    }

    const updateRefs = Array.isArray(project.updateRefs) ? project.updateRefs : [];
    const sortedRefs = updateRefs
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const updates = [];

    for (const ref of sortedRefs) {
      if (ref.refType === 'Blog') {
        const blog = await Blog.findById(ref.refId).lean();
        if (!blog) {
          continue;
        }

        updates.push({
          id: blog._id.toString(),
          refType: 'Blog',
          order: ref.order ?? 0,
          title: blog.title,
          subHeader: blog.subHeader ?? '',
          content: blog.content,
          createdAt: blog.createdAt,
          authorName: 'Sabeel Media Cast',
          authorAvatar: '/avatar1.png',
          images: Array.isArray(blog.image)
            ? blog.image.map((image) => normalizeStoredAssetPath(image)).filter(Boolean)
            : [],
          videoUrl: blog.videoUrl ?? '',
        });
        continue;
      }

      const breakdown = await ProjectBreakDown.findById(ref.refId).lean();
      if (!breakdown) {
        continue;
      }

      updates.push({
        id: breakdown._id.toString(),
        refType: 'BreakDown',
        order: ref.order ?? 0,
        title: breakdown.title,
        content: breakdown.content,
        createdAt: breakdown.createdAt,
        authorName: 'Sabeel Media Cast',
        authorAvatar: '/avatar1.png',
        images: breakdown.thumbnail
          ? [normalizeStoredAssetPath(breakdown.thumbnail)].filter(Boolean)
          : [],
        videoUrl: breakdown.videoUrl ?? '',
      });
    }

    return res.status(200).json({
      donationProject: {
        ...normalizeDonationProjectRecord(project),
        updates,
      },
    });
  });

  router.get(
    '/donation-projects',
    authenticateAdmin,
    requireTabPermission('donation', 'read'),
    async (_req, res) => {
      const projects = await DonationProject.find({})
        .sort({ listOrder: 1, createdAt: -1 })
        .lean();

      return res.status(200).json({
        donationProjects: projects.map(normalizeDonationProjectRecord),
      });
    }
  );

  router.get(
    '/donation-projects/:id',
    authenticateAdmin,
    requireTabPermission('donation', 'read'),
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid donation project id.',
        });
      }

      const project = await DonationProject.findById(id).lean();

      if (!project) {
        return res.status(404).json({
          message: 'Donation project not found.',
        });
      }

      return res.status(200).json({
        donationProject: normalizeDonationProjectRecord(project),
      });
    }
  );

  router.post(
    '/donation-projects',
    authenticateAdmin,
    requireTabPermission('donation', 'create'),
    uploadDonationAssets,
    async (req, res) => {
      const posterFile = getUploadedFilesByField(req, 'poster')[0];
      const uploadedSectionImages = getUploadedFilesByField(
        req,
        'sectionImages'
      );
      const uploadedFiles = [posterFile, ...uploadedSectionImages].filter(
        Boolean
      );
      const fields = parseDonationScalarFields(req.body);
      const scalarError = validateDonationScalars(fields, {
        requirePosterPath: posterFile,
      });

      if (scalarError || !posterFile) {
        deleteUploadedFiles(uploadedFiles);

        return res.status(400).json({
          message: scalarError || 'Poster image is required.',
        });
      }

      let parsedSections;
      let parsedFaq;
      let parsedUpdateRefs;

      try {
        parsedSections = parseSectionsField(
          req.body?.sections,
          uploadedSectionImages
        );
        if (!parsedSections.ok) {
          deleteUploadedFiles(uploadedFiles);
          return res.status(400).json({ message: parsedSections.message });
        }

        parsedFaq = parseFaqField(req.body?.faq);
        if (!parsedFaq.ok) {
          deleteUploadedFiles(uploadedFiles);
          return res.status(400).json({ message: parsedFaq.message });
        }

        parsedUpdateRefs = await parseUpdateRefsField(req.body?.updateRefs);
        if (!parsedUpdateRefs.ok) {
          deleteUploadedFiles(uploadedFiles);
          return res.status(400).json({ message: parsedUpdateRefs.message });
        }
      } catch (error) {
        deleteUploadedFiles(uploadedFiles);

        return res.status(400).json({
          message: error.message,
        });
      }

      try {
        const project = await DonationProject.create({
          title: fields.title,
          slug: fields.slug,
          poster: `/uploads/donation-posters/${posterFile.filename}`,
          videoUrl: fields.videoUrl,
          shortDescription: fields.shortDescription,
          goalAmount: fields.goalAmount,
          raisedAmount: fields.raisedAmount,
          donorCount: fields.donorCount,
          currency: fields.currency,
          sections: parsedSections.sections,
          faq: parsedFaq.faq,
          startDate: fields.startDate,
          endDate: fields.endDate,
          status: fields.status,
          projectId: fields.projectId,
          updateRefs: parsedUpdateRefs.updateRefs,
          showOnDonationPage: fields.showOnDonationPage,
          listOrder: fields.listOrder,
        });

        return res.status(201).json({
          donationProject: normalizeDonationProjectRecord(project.toObject()),
        });
      } catch (error) {
        deleteUploadedFiles(uploadedFiles);

        if (error?.code === 11000) {
          return res.status(409).json({
            message: 'A donation project with this slug already exists.',
          });
        }

        return res.status(400).json({
          message: error.message,
        });
      }
    }
  );

  router.patch(
    '/donation-projects/:id',
    authenticateAdmin,
    requireTabPermission('donation', 'update'),
    uploadDonationAssets,
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid donation project id.',
        });
      }

      const project = await DonationProject.findById(id);

      if (!project) {
        return res.status(404).json({
          message: 'Donation project not found.',
        });
      }

      const posterFile = getUploadedFilesByField(req, 'poster')[0];
      const uploadedSectionImages = getUploadedFilesByField(
        req,
        'sectionImages'
      );
      const uploadedFiles = [posterFile, ...uploadedSectionImages].filter(
        Boolean
      );
      const fields = parseDonationScalarFields({
        ...project.toObject(),
        ...req.body,
        slug:
          req.body?.slug !== undefined
            ? req.body.slug
            : project.slug || slugifyDonationTitle(req.body?.title || project.title),
      });
      const scalarError = validateDonationScalars(fields, {
        requirePosterPath: posterFile || project.poster,
      });

      if (scalarError) {
        deleteUploadedFiles(uploadedFiles);

        return res.status(400).json({
          message: scalarError,
        });
      }

      let parsedSections;
      let parsedFaq;
      let parsedUpdateRefs;

      try {
        if (req.body?.sections !== undefined) {
          parsedSections = parseSectionsField(
            req.body.sections,
            uploadedSectionImages
          );
          if (!parsedSections.ok) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({ message: parsedSections.message });
          }
        }

        if (req.body?.faq !== undefined) {
          parsedFaq = parseFaqField(req.body.faq);
          if (!parsedFaq.ok) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({ message: parsedFaq.message });
          }
        }

        if (req.body?.updateRefs !== undefined) {
          parsedUpdateRefs = await parseUpdateRefsField(req.body.updateRefs);
          if (!parsedUpdateRefs.ok) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({ message: parsedUpdateRefs.message });
          }
        }
      } catch (error) {
        deleteUploadedFiles(uploadedFiles);

        return res.status(400).json({
          message: error.message,
        });
      }

      try {
        project.title = fields.title;
        project.slug = fields.slug;
        project.videoUrl = fields.videoUrl;
        project.shortDescription = fields.shortDescription;
        project.goalAmount = fields.goalAmount;
        project.raisedAmount = fields.raisedAmount;
        project.donorCount = fields.donorCount;
        project.currency = fields.currency;
        project.startDate = fields.startDate;
        project.endDate = fields.endDate;
        project.status = fields.status;
        project.projectId = fields.projectId;
        project.showOnDonationPage = fields.showOnDonationPage;
        project.listOrder = fields.listOrder;

        if (posterFile) {
          project.poster = `/uploads/donation-posters/${posterFile.filename}`;
        } else if (typeof req.body?.existingPoster === 'string') {
          const normalizedPoster = normalizeStoredAssetPath(
            req.body.existingPoster
          );
          if (normalizedPoster) {
            project.poster = normalizedPoster;
          }
        }

        if (parsedSections?.ok) {
          project.sections = parsedSections.sections;
        }

        if (parsedFaq?.ok) {
          project.faq = parsedFaq.faq;
        }

        if (parsedUpdateRefs?.ok) {
          project.updateRefs = parsedUpdateRefs.updateRefs;
        }

        await project.save();

        return res.status(200).json({
          donationProject: normalizeDonationProjectRecord(project.toObject()),
        });
      } catch (error) {
        deleteUploadedFiles(uploadedFiles);

        if (error?.code === 11000) {
          return res.status(409).json({
            message: 'A donation project with this slug already exists.',
          });
        }

        return res.status(400).json({
          message: error.message,
        });
      }
    }
  );

  router.delete(
    '/donation-projects/:id',
    authenticateAdmin,
    requireTabPermission('donation', 'delete'),
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid donation project id.',
        });
      }

      const project = await DonationProject.findById(id);

      if (!project) {
        return res.status(404).json({
          message: 'Donation project not found.',
        });
      }

      await project.deleteOne();

      return res.status(200).json({
        message: 'Donation project deleted.',
      });
    }
  );
}

module.exports = {
  createDonationProjectAdminRoutes,
};

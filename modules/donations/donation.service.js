const mongoose = require('mongoose');
const DonationProject = require('../../models/donationProject.model');
const Blog = require('../../models/blog.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const { fail } = require('../../lib/httpError');
const { normalizeStoredAssetPath } = require('./donation.validation');

function normalizeDonationProjectRecord(project) {
  if (!project) {
    return project;
  }

  const plain = typeof project.toObject === 'function' ? project.toObject() : project;

  return {
    ...plain,
    poster: normalizeStoredAssetPath(plain.poster),
    donorCount: Number(plain.donorCount ?? 0),
    sections: Array.isArray(plain.sections)
      ? plain.sections.map((section) => ({
          ...section,
          images: Array.isArray(section.images)
            ? section.images.map((image) => normalizeStoredAssetPath(image)).filter(Boolean)
            : [],
        }))
      : [],
    steps: Array.isArray(plain.steps) ? plain.steps : [],
    staff: Array.isArray(plain.staff)
      ? plain.staff.map((member) => ({
          ...member,
          photo: member.photo ? normalizeStoredAssetPath(member.photo) : null,
        }))
      : [],
  };
}

async function assertUpdateRefsExist(updateRefs) {
  for (const [index, item] of updateRefs.entries()) {
    const model = item.refType === 'Blog' ? Blog : ProjectBreakDown;
    const exists = await model.exists({ _id: item.refId });
    if (!exists) {
      throw fail(400, `${item.refType} reference was not found for update ref ${index + 1}.`);
    }
  }
}

async function saveDonationProject(project) {
  try {
    await project.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw fail(409, 'A donation project with this slug already exists.');
    }
    throw error;
  }
}

async function listPublicDonationProjects() {
  const projects = await DonationProject.find({ showOnDonationPage: true })
    .sort({ listOrder: 1, createdAt: -1 })
    .select(
      'title slug poster shortDescription goalAmount raisedAmount donorCount currency status listOrder'
    )
    .lean();

  return projects.map(normalizeDonationProjectRecord);
}

async function getPublicDonationProject(slugOrId) {
  const query = mongoose.Types.ObjectId.isValid(slugOrId)
    ? { _id: slugOrId }
    : { slug: String(slugOrId).trim().toLowerCase() };

  const project = await DonationProject.findOne({
    ...query,
    showOnDonationPage: true,
  }).lean();

  if (!project) {
    throw fail(404, 'Donation project not found.');
  }

  const updateRefs = Array.isArray(project.updateRefs) ? project.updateRefs : [];
  const sortedRefs = updateRefs.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
        authorAvatar: '/avatar1.webp',
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
      authorAvatar: '/avatar1.webp',
      images: breakdown.thumbnail
        ? [normalizeStoredAssetPath(breakdown.thumbnail)].filter(Boolean)
        : [],
      videoUrl: breakdown.videoUrl ?? '',
    });
  }

  return {
    ...normalizeDonationProjectRecord(project),
    updates,
  };
}

async function listDonationProjects() {
  const projects = await DonationProject.find({}).sort({ listOrder: 1, createdAt: -1 }).lean();
  return projects.map(normalizeDonationProjectRecord);
}

async function getDonationProject(id) {
  const project = await DonationProject.findById(id).lean();
  if (!project) {
    throw fail(404, 'Donation project not found.');
  }

  return normalizeDonationProjectRecord(project);
}

async function createDonationProject(payload) {
  try {
    const project = await DonationProject.create(payload);
    return normalizeDonationProjectRecord(project.toObject());
  } catch (error) {
    if (error?.code === 11000) {
      throw fail(409, 'A donation project with this slug already exists.');
    }
    throw error;
  }
}

async function getDonationProjectDocument(id) {
  const project = await DonationProject.findById(id);
  if (!project) {
    throw fail(404, 'Donation project not found.');
  }

  return project;
}

async function saveDonationProjectDocument(project) {
  await saveDonationProject(project);
  return normalizeDonationProjectRecord(project.toObject());
}

async function deleteDonationProject(id) {
  const project = await DonationProject.findById(id);
  if (!project) {
    throw fail(404, 'Donation project not found.');
  }

  await project.deleteOne();
}

module.exports = {
  assertUpdateRefsExist,
  listPublicDonationProjects,
  getPublicDonationProject,
  listDonationProjects,
  getDonationProject,
  createDonationProject,
  getDonationProjectDocument,
  saveDonationProjectDocument,
  deleteDonationProject,
};

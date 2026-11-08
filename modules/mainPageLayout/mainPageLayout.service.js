const Catalogue = require('../../models/catalogue.model');
const Banner = require('../../models/banner.model');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const Blog = require('../../models/blog.model');
const Comment = require('../../models/comment.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const {
  normalizeBlogImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const { isVideoPublished, keepPublishedVideoIdsInOrder } = require('../../lib/videos');
const { fail } = require('../../lib/httpError');

const SECTIONS = {
  banner: 'banner',
  projects: 'projects',
  catalogues: 'catalogues',
  breakdown: 'breakdown',
  video: 'video',
  comment: 'comment',
  blog: 'blog',
};

function normalizeMainPageLayoutItem(section, item) {
  if (!item) {
    return null;
  }

  if (section === SECTIONS.banner) {
    return {
      ...item,
      name: item.title,
    };
  }

  if (section === SECTIONS.projects) {
    return normalizeProjectAsset({
      ...item,
      title: item.name,
    });
  }

  if (section === SECTIONS.catalogues) {
    return {
      ...item,
      showInHomepage: item.isActive === true,
      homepageOrder: Number.isInteger(item.order) && item.order > 0 ? item.order : null,
    };
  }

  if (section === SECTIONS.breakdown) {
    const directThumbnail = normalizeProjectThumbnailPath(item.thumbnail);
    const projectThumbnail =
      typeof item.projectId === 'object' &&
      item.projectId &&
      typeof item.projectId.thumbnail === 'string'
        ? normalizeProjectThumbnailPath(item.projectId.thumbnail)
        : '';

    return {
      ...item,
      thumbnail: directThumbnail || projectThumbnail,
    };
  }

  if (section === SECTIONS.video) {
    return {
      ...item,
      thumbnail: normalizeProjectThumbnailPath(item.thumbnail),
      isPublished: item.isPublished !== false,
    };
  }

  if (section === SECTIONS.blog) {
    const firstImage =
      Array.isArray(item.image) && typeof item.image[0] === 'string'
        ? normalizeBlogImagePath(item.image[0]) || ''
        : '';

    return {
      ...item,
      images: firstImage,
      image: Array.isArray(item.image)
        ? item.image.map((imagePath) => normalizeBlogImagePath(imagePath)).filter(Boolean)
        : [],
    };
  }

  return item;
}

function sortByHomepageOrder(firstItem, secondItem) {
  const firstOrder =
    Number.isInteger(firstItem.homepageOrder) && firstItem.homepageOrder > 0
      ? firstItem.homepageOrder
      : Number.MAX_SAFE_INTEGER;
  const secondOrder =
    Number.isInteger(secondItem.homepageOrder) && secondItem.homepageOrder > 0
      ? secondItem.homepageOrder
      : Number.MAX_SAFE_INTEGER;
  return firstOrder - secondOrder;
}

function getMainPageLayoutModel(section) {
  if (section === SECTIONS.banner) return Banner;
  if (section === SECTIONS.projects) return Project;
  if (section === SECTIONS.catalogues) return Catalogue;
  if (section === SECTIONS.breakdown) return ProjectBreakDown;
  if (section === SECTIONS.video) return Video;
  if (section === SECTIONS.comment) return Comment;
  if (section === SECTIONS.blog) return Blog;
  return null;
}

async function getMainPageLayoutItems(section) {
  if (section === SECTIONS.banner) {
    const items = await Banner.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      updatedAt: -1,
    });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  if (section === SECTIONS.projects) {
    const items = await Project.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  if (section === SECTIONS.catalogues) {
    const items = await Catalogue.find({}).sort({
      isActive: -1,
      order: 1,
      createdAt: -1,
    });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  if (section === SECTIONS.breakdown) {
    const items = await ProjectBreakDown.find({})
      .populate('projectId', 'thumbnail')
      .sort({
        showInHomepage: -1,
        homepageOrder: 1,
        createdAt: -1,
      });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  if (section === SECTIONS.video) {
    const items = await Video.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  if (section === SECTIONS.comment) {
    const items = await Comment.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => item.toObject());
  }

  if (section === SECTIONS.blog) {
    const items = await Blog.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => normalizeMainPageLayoutItem(section, item.toObject()));
  }

  return null;
}

async function listAdminMainPageLayout(section) {
  return getMainPageLayoutItems(section);
}

async function listPublicMainPageLayout(section) {
  const items = await getMainPageLayoutItems(section);
  const visibleItems = items
    .filter((item) => item && item.showInHomepage === true && item.isPublished !== false)
    .sort(sortByHomepageOrder);

  if (section !== SECTIONS.projects) {
    return visibleItems;
  }

  const catalogueItems = await getMainPageLayoutItems(SECTIONS.catalogues);
  const visibleCatalogues = Array.isArray(catalogueItems)
    ? catalogueItems
        .filter((item) => item && item.showInHomepage === true)
        .sort(sortByHomepageOrder)
    : [];
  const cataloguesByProjectId = visibleCatalogues.reduce((accumulator, catalogueItem) => {
    const projectId =
      typeof catalogueItem.projectId === 'string'
        ? catalogueItem.projectId
        : typeof catalogueItem.projectId === 'object' && catalogueItem.projectId
          ? catalogueItem.projectId._id || catalogueItem.projectId.id
          : '';

    if (!projectId) {
      return accumulator;
    }

    if (!Array.isArray(accumulator[projectId])) {
      accumulator[projectId] = [];
    }

    accumulator[projectId].push(catalogueItem);
    return accumulator;
  }, {});

  return visibleItems.map((projectItem) => ({
    ...projectItem,
    catalogues: cataloguesByProjectId[projectItem._id] || [],
  }));
}

async function reorderCatalogues(projectId, orderedIds) {
  if (orderedIds.length > 0) {
    const existingItemsCount = await Catalogue.countDocuments({
      projectId,
      _id: { $in: orderedIds },
    });

    if (existingItemsCount !== orderedIds.length) {
      throw fail(404, 'One or more items were not found.');
    }
  }

  await Catalogue.updateMany(
    {
      projectId,
      isActive: true,
      _id: { $nin: orderedIds },
    },
    {
      $set: {
        isActive: false,
        order: 0,
      },
    }
  );

  if (orderedIds.length > 0) {
    await Catalogue.bulkWrite(
      orderedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id, projectId },
          update: {
            $set: {
              isActive: true,
              order: index + 1,
            },
          },
        },
      }))
    );
  }

  return getMainPageLayoutItems(SECTIONS.catalogues);
}

async function reorderMainPageLayout(section, orderedIds) {
  const model = getMainPageLayoutModel(section);
  if (!model) {
    throw fail(
      400,
      'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.'
    );
  }

  if (orderedIds.length > 0) {
    const existingItemsCount = await model.countDocuments({
      _id: { $in: orderedIds },
    });

    if (existingItemsCount !== orderedIds.length) {
      throw fail(404, 'One or more items were not found.');
    }
  }

  const homepageOrderedIds =
    section === SECTIONS.video ? await keepPublishedVideoIdsInOrder(orderedIds) : orderedIds;

  await model.updateMany(
    {
      showInHomepage: true,
      _id: { $nin: homepageOrderedIds },
    },
    {
      $set: {
        showInHomepage: false,
        homepageOrder: null,
      },
    }
  );

  if (homepageOrderedIds.length > 0) {
    await model.bulkWrite(
      homepageOrderedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              showInHomepage: true,
              homepageOrder: index + 1,
            },
          },
        },
      }))
    );
  }

  return getMainPageLayoutItems(section);
}

async function updateCatalogueLayoutItem(id, updates) {
  const catalogueUpdates = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'showInHomepage')) {
    catalogueUpdates.isActive = updates.showInHomepage;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'homepageOrder')) {
    catalogueUpdates.order = updates.homepageOrder === null ? 0 : updates.homepageOrder;
  }

  const item = await Catalogue.findByIdAndUpdate(id, catalogueUpdates, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!item) {
    throw fail(404, 'Item not found.');
  }

  return normalizeMainPageLayoutItem(SECTIONS.catalogues, item.toObject());
}

async function updateMainPageLayoutItem(section, id, updates) {
  const model = getMainPageLayoutModel(section);
  if (!model) {
    throw fail(
      400,
      'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.'
    );
  }

  if (section === SECTIONS.video) {
    const existingVideo = await Video.findById(id).select('isPublished');
    if (!existingVideo) {
      throw fail(404, 'Item not found.');
    }

    const isEnablingHomepage = updates.showInHomepage === true;
    const isSettingOrder = Number.isInteger(updates.homepageOrder);
    if (!isVideoPublished(existingVideo) && (isEnablingHomepage || isSettingOrder)) {
      throw fail(400, 'Unpublished videos cannot be added to Watch Us.');
    }
  }

  const item = await model.findByIdAndUpdate(id, updates, {
    returnDocument: 'after',
    runValidators: true,
  });

  if (!item) {
    throw fail(404, 'Item not found.');
  }

  let normalizedItem = item.toObject();
  if (section === SECTIONS.breakdown) {
    const itemWithProject = await ProjectBreakDown.findById(item._id).populate(
      'projectId',
      'thumbnail'
    );
    normalizedItem = itemWithProject ? itemWithProject.toObject() : normalizedItem;
  }

  return normalizeMainPageLayoutItem(section, normalizedItem);
}

module.exports = {
  listAdminMainPageLayout,
  listPublicMainPageLayout,
  reorderCatalogues,
  reorderMainPageLayout,
  updateCatalogueLayoutItem,
  updateMainPageLayoutItem,
};

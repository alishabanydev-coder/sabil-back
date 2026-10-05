const express = require('express');
const mongoose = require('mongoose');
const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const Blog = require('../../models/blog.model');
const Comment = require('../../models/comment.model');
const Banner = require('../../models/banner.model');
const ProjectBreakDown = require('../../models/projectBreakDown.model');
const Catalogue = require('../../models/catalogue.model');
const {
  authenticateAdmin,
  requireTabPermission,
} = require('../../middleware/adminAuth');
const {
  normalizeBlogImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const {
  parseOptionalBoolean,
  parseOptionalHomepageOrder,
} = require('../../lib/parse');
const {
  isVideoPublished,
  keepPublishedVideoIdsInOrder,
} = require('../../lib/videos');

const MAIN_PAGE_LAYOUT_SECTIONS = {
  banner: 'banner',
  projects: 'projects',
  catalogues: 'catalogues',
  breakdown: 'breakdown',
  video: 'video',
  comment: 'comment',
  blog: 'blog',
};

function normalizeMainPageLayoutSection(section) {
  return typeof section === 'string' ? section.trim().toLowerCase() : '';
}
function normalizeMainPageLayoutItem(section, item) {
  if (!item) {
    return null;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    return {
      ...item,
      name: item.title,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    return normalizeProjectAsset({
      ...item,
      title: item.name,
    });
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    return {
      ...item,
      showInHomepage: item.isActive === true,
      homepageOrder:
        Number.isInteger(item.order) && item.order > 0 ? item.order : null,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
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

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
    return {
      ...item,
      thumbnail: normalizeProjectThumbnailPath(item.thumbnail),
      isPublished: item.isPublished !== false,
    };
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    const firstImage =
      Array.isArray(item.image) && typeof item.image[0] === 'string'
        ? normalizeBlogImagePath(item.image[0]) || ''
        : '';

    return {
      ...item,
      images: firstImage,
      image: Array.isArray(item.image)
        ? item.image
            .map((imagePath) => normalizeBlogImagePath(imagePath))
            .filter(Boolean)
        : [],
    };
  }

  return item;
}

async function getMainPageLayoutItems(section) {
  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    const items = await Banner.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      updatedAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    const items = await Project.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    const items = await Catalogue.find({}).sort({
      isActive: -1,
      order: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
    const items = await ProjectBreakDown.find({})
      .populate('projectId', 'thumbnail')
      .sort({
        showInHomepage: -1,
        homepageOrder: 1,
        createdAt: -1,
      });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
    const items = await Video.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.comment) {
    const items = await Comment.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) => item.toObject());
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    const items = await Blog.find({}).sort({
      showInHomepage: -1,
      homepageOrder: 1,
      createdAt: -1,
    });
    return items.map((item) =>
      normalizeMainPageLayoutItem(section, item.toObject())
    );
  }

  return null;
}

function getMainPageLayoutModel(section) {
  if (section === MAIN_PAGE_LAYOUT_SECTIONS.banner) {
    return Banner;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
    return Project;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
    return Catalogue;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
    return ProjectBreakDown;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
    return Video;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.comment) {
    return Comment;
  }

  if (section === MAIN_PAGE_LAYOUT_SECTIONS.blog) {
    return Blog;
  }

  return null;
}
const router = express.Router();

router.get(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'read'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const items = await getMainPageLayoutItems(section);

    if (!items) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    return res.status(200).json(items);
  }
);

router.get(
  '/public/main-page-layout/:section',
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const items = await getMainPageLayoutItems(section);

    if (!items) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    const visibleItems = items
      .filter(
        (item) =>
          item &&
          item.showInHomepage === true &&
          item.isPublished !== false
      )
      .sort((firstItem, secondItem) => {
        const firstOrder =
          Number.isInteger(firstItem.homepageOrder) && firstItem.homepageOrder > 0
            ? firstItem.homepageOrder
            : Number.MAX_SAFE_INTEGER;
        const secondOrder =
          Number.isInteger(secondItem.homepageOrder) && secondItem.homepageOrder > 0
            ? secondItem.homepageOrder
            : Number.MAX_SAFE_INTEGER;
        return firstOrder - secondOrder;
      });

    if (section === MAIN_PAGE_LAYOUT_SECTIONS.projects) {
      const catalogueItems = await getMainPageLayoutItems(
        MAIN_PAGE_LAYOUT_SECTIONS.catalogues
      );
      const visibleCatalogues = Array.isArray(catalogueItems)
        ? catalogueItems
            .filter((item) => item && item.showInHomepage === true)
            .sort((firstItem, secondItem) => {
              const firstOrder =
                Number.isInteger(firstItem.homepageOrder) && firstItem.homepageOrder > 0
                  ? firstItem.homepageOrder
                  : Number.MAX_SAFE_INTEGER;
              const secondOrder =
                Number.isInteger(secondItem.homepageOrder) && secondItem.homepageOrder > 0
                  ? secondItem.homepageOrder
                  : Number.MAX_SAFE_INTEGER;
              return firstOrder - secondOrder;
            })
        : [];

      const cataloguesByProjectId = visibleCatalogues.reduce(
        (accumulator, catalogueItem) => {
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
        },
        {}
      );

      const projectsWithCatalogues = visibleItems.map((projectItem) => ({
        ...projectItem,
        catalogues: cataloguesByProjectId[projectItem._id] || [],
      }));

      return res.status(200).json(projectsWithCatalogues);
    }

    return res.status(200).json(visibleItems);
  }
);

router.put(
  '/main-page-layout/:section',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
      const orderedIds = req.body?.orderedIds;
      const projectId = req.body?.projectId;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({
          message: 'orderedIds must be an array of item ids.',
        });
      }

      if (typeof projectId !== 'string' || !mongoose.Types.ObjectId.isValid(projectId)) {
        return res.status(400).json({
          message: 'projectId must be a valid project id.',
        });
      }

      const hasInvalidId = orderedIds.some(
        (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
      );
      if (hasInvalidId) {
        return res.status(400).json({
          message: 'orderedIds must contain valid item ids.',
        });
      }

      const uniqueIds = new Set(orderedIds);
      if (uniqueIds.size !== orderedIds.length) {
        return res.status(400).json({
          message: 'orderedIds must not contain duplicates.',
        });
      }

      try {
        if (orderedIds.length > 0) {
          const existingItemsCount = await Catalogue.countDocuments({
            projectId,
            _id: { $in: orderedIds },
          });

          if (existingItemsCount !== orderedIds.length) {
            return res.status(404).json({
              message: 'One or more items were not found.',
            });
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

        const items = await getMainPageLayoutItems(section);

        return res.status(200).json({
          items,
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }

    const model = getMainPageLayoutModel(section);

    if (!model) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    const orderedIds = req.body?.orderedIds;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({
        message: 'orderedIds must be an array of item ids.',
      });
    }

    const hasInvalidId = orderedIds.some(
      (id) => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)
    );
    if (hasInvalidId) {
      return res.status(400).json({
        message: 'orderedIds must contain valid item ids.',
      });
    }

    const uniqueIds = new Set(orderedIds);
    if (uniqueIds.size !== orderedIds.length) {
      return res.status(400).json({
        message: 'orderedIds must not contain duplicates.',
      });
    }

    try {
      if (orderedIds.length > 0) {
        const existingItemsCount = await model.countDocuments({
          _id: { $in: orderedIds },
        });

        if (existingItemsCount !== orderedIds.length) {
          return res.status(404).json({
            message: 'One or more items were not found.',
          });
        }
      }

      const homepageOrderedIds =
        section === MAIN_PAGE_LAYOUT_SECTIONS.video
          ? await keepPublishedVideoIdsInOrder(orderedIds)
          : orderedIds;

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

      const items = await getMainPageLayoutItems(section);

      return res.status(200).json({
        items,
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

router.patch(
  '/main-page-layout/:section/:id',
  authenticateAdmin,
  requireTabPermission('mainPageLayout', 'update'),
  async (req, res) => {
    const section = normalizeMainPageLayoutSection(req.params.section);
    const { id } = req.params;
    if (section === MAIN_PAGE_LAYOUT_SECTIONS.catalogues) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: 'Invalid item id.',
        });
      }

      const { showInHomepage, homepageOrder } = req.body || {};
      const updates = {};

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'showInHomepage')) {
        const parsedShowInHomepage = parseOptionalBoolean(showInHomepage);
        if (parsedShowInHomepage === undefined) {
          return res.status(400).json({
            message: 'showInHomepage must be a boolean.',
          });
        }
        updates.showInHomepage = parsedShowInHomepage;
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'homepageOrder')) {
        const parsedHomepageOrder = parseOptionalHomepageOrder(homepageOrder);
        if (parsedHomepageOrder === undefined) {
          return res.status(400).json({
            message: 'homepageOrder must be a positive integer or null.',
          });
        }
        updates.homepageOrder = parsedHomepageOrder;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          message: 'Nothing to update.',
        });
      }

      if (updates.showInHomepage === false) {
        updates.homepageOrder = null;
      }

      const catalogueUpdates = {};
      if (Object.prototype.hasOwnProperty.call(updates, 'showInHomepage')) {
        catalogueUpdates.isActive = updates.showInHomepage;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'homepageOrder')) {
        catalogueUpdates.order =
          updates.homepageOrder === null ? 0 : updates.homepageOrder;
      }

      try {
        const item = await Catalogue.findByIdAndUpdate(id, catalogueUpdates, {
          returnDocument: 'after',
          runValidators: true,
        });

        if (!item) {
          return res.status(404).json({
            message: 'Item not found.',
          });
        }

        return res.status(200).json({
          item: normalizeMainPageLayoutItem(section, item.toObject()),
        });
      } catch (error) {
        return res.status(400).json({
          message: error.message,
        });
      }
    }

    const model = getMainPageLayoutModel(section);

    if (!model) {
      return res.status(400).json({
        message:
          'Invalid main page layout section. Use one of: banner, projects, catalogues, breakdown, video, comment, blog.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'Invalid item id.',
      });
    }

    const { showInHomepage, homepageOrder } = req.body || {};
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'showInHomepage')) {
      const parsedShowInHomepage = parseOptionalBoolean(showInHomepage);
      if (parsedShowInHomepage === undefined) {
        return res.status(400).json({
          message: 'showInHomepage must be a boolean.',
        });
      }
      updates.showInHomepage = parsedShowInHomepage;
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'homepageOrder')) {
      const parsedHomepageOrder = parseOptionalHomepageOrder(homepageOrder);
      if (parsedHomepageOrder === undefined) {
        return res.status(400).json({
          message: 'homepageOrder must be a positive integer or null.',
        });
      }
      updates.homepageOrder = parsedHomepageOrder;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: 'Nothing to update.',
      });
    }

    if (updates.showInHomepage === false) {
      updates.homepageOrder = null;
    }

    try {
      if (section === MAIN_PAGE_LAYOUT_SECTIONS.video) {
        const existingVideo = await Video.findById(id).select('isPublished');
        if (!existingVideo) {
          return res.status(404).json({
            message: 'Item not found.',
          });
        }

        const isEnablingHomepage = updates.showInHomepage === true;
        const isSettingOrder = Number.isInteger(updates.homepageOrder);
        if (
          !isVideoPublished(existingVideo) &&
          (isEnablingHomepage || isSettingOrder)
        ) {
          return res.status(400).json({
            message: 'Unpublished videos cannot be added to Watch Us.',
          });
        }
      }

      const item = await model.findByIdAndUpdate(id, updates, {
        returnDocument: 'after',
        runValidators: true,
      });

      if (!item) {
        return res.status(404).json({
          message: 'Item not found.',
        });
      }

      let normalizedItem = item.toObject();
      if (section === MAIN_PAGE_LAYOUT_SECTIONS.breakdown) {
        const itemWithProject = await ProjectBreakDown.findById(item._id).populate(
          'projectId',
          'thumbnail'
        );
        normalizedItem = itemWithProject ? itemWithProject.toObject() : normalizedItem;
      }

      return res.status(200).json({
        item: normalizeMainPageLayoutItem(section, normalizedItem),
      });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
);

module.exports = router;


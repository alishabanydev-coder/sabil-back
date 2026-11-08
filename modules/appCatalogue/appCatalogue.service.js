const Project = require('../../models/project.model');
const Video = require('../../models/video.model');
const AppCatalogueConfig = require('../../models/appCatalogueConfig.model');
const { deleteStoredUpload } = require('../../lib/uploads');
const {
  normalizeAppCatalogueHomeImagePath,
  normalizeProjectAsset,
  normalizeProjectThumbnailPath,
} = require('../../lib/mediaPaths');
const {
  isVideoPublished,
  keepPublishedVideoIdsInOrder,
  publishedVideoQuery,
} = require('../../lib/videos');
const { fail } = require('../../lib/httpError');

async function getOrCreateAppCatalogueConfig() {
  return AppCatalogueConfig.findOneAndUpdate(
    { singletonKey: 'main' },
    { $setOnInsert: { singletonKey: 'main' } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
}

function toObjectIdString(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return value._id?.toString?.() || value.id?.toString?.() || value.toString?.() || '';
  }

  return '';
}

function uniqueObjectIdStrings(values) {
  const result = [];
  const seen = new Set();

  for (const value of values) {
    const normalizedValue = toObjectIdString(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    result.push(normalizedValue);
  }

  return result;
}

async function keepExistingIdsInOrder(model, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const existingDocs = await model.find({ _id: { $in: ids } }).select('_id');
  const existingIdSet = new Set(existingDocs.map((doc) => doc._id.toString()));

  return ids.filter((id) => existingIdSet.has(id));
}

function sortDocumentsByIdOrder(documents, orderedIds) {
  const indexById = new Map(orderedIds.map((id, index) => [id, index]));

  return [...documents].sort((firstItem, secondItem) => {
    const firstId = toObjectIdString(firstItem?._id);
    const secondId = toObjectIdString(secondItem?._id);
    const firstOrder = indexById.has(firstId) ? indexById.get(firstId) : Number.MAX_SAFE_INTEGER;
    const secondOrder = indexById.has(secondId) ? indexById.get(secondId) : Number.MAX_SAFE_INTEGER;

    return firstOrder - secondOrder;
  });
}

function shuffleArray(items) {
  const clonedItems = [...items];

  for (let index = clonedItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = clonedItems[index];
    clonedItems[index] = clonedItems[randomIndex];
    clonedItems[randomIndex] = temp;
  }

  return clonedItems;
}

function normalizeAppCatalogueVideo(video) {
  if (!video || typeof video !== 'object') {
    return null;
  }

  return {
    ...video,
    thumbnail: normalizeProjectThumbnailPath(video.thumbnail),
    isPublished: video.isPublished !== false,
  };
}

async function getOrderedNormalizedVideos(videoIds) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return [];
  }

  const videosRaw = await Video.find({ _id: { $in: videoIds } });
  return sortDocumentsByIdOrder(
    videosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
    videoIds
  ).filter(Boolean);
}

function buildProjectNavigationButtons(homeImage, selectedProjects) {
  return [
    {
      type: 'home',
      id: 'home',
      title: 'Home',
      image: homeImage,
    },
    ...selectedProjects.map((project) => ({
      type: 'project',
      id: project._id.toString(),
      projectId: project._id.toString(),
      title: project.name,
      image: project.thumbnail,
    })),
  ];
}

async function getAdminNavigation() {
  const config = await getOrCreateAppCatalogueConfig();
  const storedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);
  const selectedProjectIds = await keepExistingIdsInOrder(Project, storedProjectIds);
  const [selectedProjectsRaw, availableProjectsRaw] = await Promise.all([
    selectedProjectIds.length > 0
      ? Project.find({ _id: { $in: selectedProjectIds } })
      : Promise.resolve([]),
    Project.find({}).sort({ createdAt: -1 }),
  ]);
  const selectedProjects = sortDocumentsByIdOrder(
    selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
    selectedProjectIds
  );
  const availableProjects = availableProjectsRaw.map((item) => normalizeProjectAsset(item.toObject()));
  const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.webp';

  return {
    homeImage,
    selectedProjectIds,
    selectedProjects,
    availableProjects,
    navigationButtons: buildProjectNavigationButtons(homeImage, selectedProjects),
  };
}

async function updateAdminNavigation({ projectIds, hasHomeImage, homeImage, uploadedFile }) {
  const homeImageFromBody = hasHomeImage ? normalizeAppCatalogueHomeImagePath(homeImage) : '';
  if (hasHomeImage && !homeImageFromBody) {
    throw fail(400, 'homeImage is invalid.');
  }

  const existingProjectIds = await keepExistingIdsInOrder(Project, projectIds);
  const config = await getOrCreateAppCatalogueConfig();
  const previousHomeImage = normalizeAppCatalogueHomeImagePath(config.homeImage);
  const nextHomeImage = uploadedFile?.filename
    ? `/uploads/app-catalogue/${uploadedFile.filename}`
    : homeImageFromBody || previousHomeImage || '/home.webp';

  config.navigationProjectIds = existingProjectIds;
  config.homeImage = nextHomeImage;
  await config.save();

  if (
    uploadedFile?.filename &&
    previousHomeImage &&
    previousHomeImage !== nextHomeImage &&
    previousHomeImage.startsWith('/uploads/app-catalogue/')
  ) {
    deleteStoredUpload(previousHomeImage);
  }

  const selectedProjectsRaw =
    existingProjectIds.length > 0 ? await Project.find({ _id: { $in: existingProjectIds } }) : [];
  const selectedProjects = sortDocumentsByIdOrder(
    selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
    existingProjectIds
  );

  return {
    homeImage: nextHomeImage,
    selectedProjectIds: existingProjectIds,
    selectedProjects,
    navigationButtons: buildProjectNavigationButtons(nextHomeImage, selectedProjects),
  };
}

async function getAdminHomeVideos() {
  const config = await getOrCreateAppCatalogueConfig();
  const storedManualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
  const manualVideoIds = await keepPublishedVideoIdsInOrder(storedManualVideoIds);
  const [availableVideosRaw, manualVideosRaw] = await Promise.all([
    Video.find({}).sort({ season: 1, episode: 1, createdAt: -1 }),
    manualVideoIds.length > 0
      ? Video.find(publishedVideoQuery({ _id: { $in: manualVideoIds } }))
      : [],
  ]);
  const availableVideos = availableVideosRaw
    .map((item) => normalizeAppCatalogueVideo(item.toObject()))
    .filter(Boolean);
  const manualVideos = sortDocumentsByIdOrder(
    manualVideosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
    manualVideoIds
  ).filter(Boolean);

  return {
    mode: config.homeVideosMode || 'random',
    manualVideoIds,
    manualVideos,
    availableVideos,
  };
}

async function updateAdminHomeVideos({ hasMode, mode, hasManualVideoIds, manualVideoIds }) {
  const existingManualVideoIds = hasManualVideoIds
    ? await keepPublishedVideoIdsInOrder(manualVideoIds)
    : [];
  const config = await getOrCreateAppCatalogueConfig();

  if (hasMode) {
    config.homeVideosMode = mode;
  }

  if (hasManualVideoIds) {
    config.manualHomeVideoIds = existingManualVideoIds;
  }

  await config.save();

  const finalMode = config.homeVideosMode || 'random';
  const finalManualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
  const manualVideosRaw =
    finalManualVideoIds.length > 0 ? await Video.find({ _id: { $in: finalManualVideoIds } }) : [];
  const manualVideos = sortDocumentsByIdOrder(
    manualVideosRaw.map((item) => normalizeAppCatalogueVideo(item.toObject())),
    finalManualVideoIds
  ).filter(Boolean);

  return {
    mode: finalMode,
    manualVideoIds: finalManualVideoIds,
    manualVideos,
  };
}

async function getAdminSuggestedVideos() {
  const config = await getOrCreateAppCatalogueConfig();
  const storedSuggestedVideoIds = uniqueObjectIdStrings(config.suggestedVideoIds || []);
  const videoIds = await keepPublishedVideoIdsInOrder(storedSuggestedVideoIds);
  const [availableVideosRaw, suggestedVideos] = await Promise.all([
    Video.find({}).sort({ season: 1, episode: 1, createdAt: -1 }),
    getOrderedNormalizedVideos(videoIds),
  ]);

  return {
    videoIds,
    videos: suggestedVideos,
    availableVideos: availableVideosRaw
      .map((item) => normalizeAppCatalogueVideo(item.toObject()))
      .filter(Boolean),
  };
}

async function updateAdminSuggestedVideos(videoIdsInput) {
  const videoIds = await keepPublishedVideoIdsInOrder(videoIdsInput);
  const config = await getOrCreateAppCatalogueConfig();
  config.suggestedVideoIds = videoIds;
  await config.save();

  return {
    videoIds,
    videos: await getOrderedNormalizedVideos(videoIds),
  };
}

async function getAdminFeaturedVideos(projectId) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw fail(404, 'Project not found.');
  }

  const storedFeaturedVideoIds = uniqueObjectIdStrings(project.featuredVideoIds || []);
  const [channelVideosRaw, existingFeaturedIds] = await Promise.all([
    Video.find({ projectId }).sort({ season: 1, episode: 1, createdAt: -1 }),
    keepPublishedVideoIdsInOrder(storedFeaturedVideoIds),
  ]);
  const availableVideos = channelVideosRaw
    .map((item) => normalizeAppCatalogueVideo(item.toObject()))
    .filter(Boolean);
  const availableIdSet = new Set(availableVideos.map((video) => String(video._id)));
  const videoIds = existingFeaturedIds.filter((id) => availableIdSet.has(id));

  return {
    projectId,
    videoIds,
    videos: await getOrderedNormalizedVideos(videoIds),
    availableVideos,
  };
}

async function updateAdminFeaturedVideos(projectId, requestedVideoIds) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw fail(404, 'Project not found.');
  }

  const channelVideos = await Video.find(
    publishedVideoQuery({
      _id: { $in: requestedVideoIds },
      projectId,
    })
  ).select('_id');
  const allowedIdSet = new Set(channelVideos.map((video) => video._id.toString()));
  const videoIds = requestedVideoIds.filter((id) => allowedIdSet.has(id));
  project.featuredVideoIds = videoIds;
  await project.save();

  return {
    projectId,
    videoIds,
    videos: await getOrderedNormalizedVideos(videoIds),
  };
}

async function getPublicNavigation() {
  const config = await getOrCreateAppCatalogueConfig();
  const selectedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);
  const selectedProjectsRaw =
    selectedProjectIds.length > 0 ? await Project.find({ _id: { $in: selectedProjectIds } }) : [];
  const selectedProjects = sortDocumentsByIdOrder(
    selectedProjectsRaw.map((item) => normalizeProjectAsset(item.toObject())),
    selectedProjectIds
  );
  const homeImage = normalizeAppCatalogueHomeImagePath(config.homeImage) || '/home.webp';

  return {
    buttons: buildProjectNavigationButtons(homeImage, selectedProjects),
    updatedAt: config.updatedAt,
  };
}

async function getPublicHomeVideos() {
  const config = await getOrCreateAppCatalogueConfig();
  const mode = config.homeVideosMode || 'random';
  const manualVideoIds = uniqueObjectIdStrings(config.manualHomeVideoIds || []);
  const videosRaw =
    mode === 'manual'
      ? manualVideoIds.length > 0
        ? await Video.find(publishedVideoQuery({ _id: { $in: manualVideoIds } }))
        : []
      : await Video.find(publishedVideoQuery()).sort({ createdAt: -1 });
  const orderedVideos =
    mode === 'manual' ? sortDocumentsByIdOrder(videosRaw, manualVideoIds) : shuffleArray(videosRaw);

  return {
    mode,
    videos: orderedVideos
      .map((item) => normalizeAppCatalogueVideo(item.toObject()))
      .filter(Boolean),
  };
}

async function getPublicSuggestedVideos() {
  const config = await getOrCreateAppCatalogueConfig();
  const storedSuggestedVideoIds = uniqueObjectIdStrings(config.suggestedVideoIds || []);
  const videoIds = await keepExistingIdsInOrder(Video, storedSuggestedVideoIds);
  const videos = (await getOrderedNormalizedVideos(videoIds)).filter((video) =>
    isVideoPublished(video)
  );

  return {
    videoIds: videos.map((video) => String(video._id)),
    videos,
  };
}

async function getPublicFeaturedVideos() {
  const config = await getOrCreateAppCatalogueConfig();
  const selectedProjectIds = uniqueObjectIdStrings(config.navigationProjectIds || []);
  const projects =
    selectedProjectIds.length > 0
      ? await Project.find({ _id: { $in: selectedProjectIds } }).select('_id featuredVideoIds')
      : [];
  const featuredByProjectId = {};

  await Promise.all(
    projects.map(async (project) => {
      const projectId = project._id.toString();
      const storedFeaturedVideoIds = uniqueObjectIdStrings(project.featuredVideoIds || []);
      const existingIds = await keepExistingIdsInOrder(Video, storedFeaturedVideoIds);
      const videos = (await getOrderedNormalizedVideos(existingIds)).filter(
        (video) => String(video.projectId) === projectId && isVideoPublished(video)
      );

      featuredByProjectId[projectId] = {
        videoIds: videos.map((video) => String(video._id)),
        videos,
      };
    })
  );

  return { featuredByProjectId };
}

async function getPublicProjectFeaturedVideos(projectId) {
  const project = await Project.findById(projectId).select('_id featuredVideoIds');
  if (!project) {
    throw fail(404, 'Project not found.');
  }

  const storedFeaturedVideoIds = uniqueObjectIdStrings(project.featuredVideoIds || []);
  const existingIds = await keepExistingIdsInOrder(Video, storedFeaturedVideoIds);
  const videos = (await getOrderedNormalizedVideos(existingIds)).filter(
    (video) => String(video.projectId) === projectId && isVideoPublished(video)
  );

  return {
    projectId,
    videoIds: videos.map((video) => String(video._id)),
    videos,
  };
}

module.exports = {
  getAdminNavigation,
  updateAdminNavigation,
  getAdminHomeVideos,
  updateAdminHomeVideos,
  getAdminSuggestedVideos,
  updateAdminSuggestedVideos,
  getAdminFeaturedVideos,
  updateAdminFeaturedVideos,
  getPublicNavigation,
  getPublicHomeVideos,
  getPublicSuggestedVideos,
  getPublicFeaturedVideos,
  getPublicProjectFeaturedVideos,
};

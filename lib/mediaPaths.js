function normalizeBlogImagePath(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return null;
  }

  const trimmedPath = imagePath.trim();
  if (trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith('/uploads/')) {
    return trimmedPath;
  }

  try {
    const parsedUrl = new URL(trimmedPath);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return parsedUrl.pathname;
    }

    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return trimmedPath;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeProjectThumbnailPath(thumbnailPath) {
  if (typeof thumbnailPath !== 'string' || !thumbnailPath.trim()) {
    return '';
  }

  const trimmedPath = thumbnailPath.trim();
  if (trimmedPath.startsWith('/uploads/')) {
    return trimmedPath;
  }

  try {
    const parsedUrl = new URL(trimmedPath);
    if (parsedUrl.pathname.startsWith('/uploads/')) {
      return parsedUrl.pathname;
    }
  } catch {
    return '';
  }

  return '';
}

function normalizePublicProjectThumbnailPath(thumbnailPath) {
  if (typeof thumbnailPath !== 'string' || !thumbnailPath.trim()) {
    return '';
  }

  const trimmedPath = thumbnailPath.trim();
  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath;
  }

  const uploadsPath = normalizeProjectThumbnailPath(trimmedPath);
  if (uploadsPath) {
    return uploadsPath;
  }

  if (trimmedPath.startsWith('/')) {
    return trimmedPath;
  }

  return '';
}

function normalizeProjectCharacterImagePath(imagePath) {
  return normalizeProjectThumbnailPath(imagePath);
}

function normalizeCatalogueImagePath(imagePath) {
  return normalizeBlogImagePath(imagePath);
}

function normalizeAppCatalogueHomeImagePath(imagePath) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return '';
  }

  const trimmedPath = imagePath.trim();
  if (trimmedPath.startsWith('/')) {
    return trimmedPath;
  }

  if (trimmedPath.startsWith('http://') || trimmedPath.startsWith('https://')) {
    return trimmedPath;
  }

  return '';
}

function normalizeProjectCharacters(characters) {
  if (!Array.isArray(characters)) {
    return [];
  }

  return characters
    .map((item) => {
      const baseCharacter =
        item && typeof item === 'object' && !Array.isArray(item) ? item : {};

      return {
        ...baseCharacter,
        name: typeof item?.name === 'string' ? item.name.trim() : '',
        image: normalizeProjectCharacterImagePath(item?.image),
      };
    })
    .filter((item) => item.name && item.image);
}

function normalizeProjectAsset(project) {
  if (!project || typeof project !== 'object') {
    return project;
  }

  return {
    ...project,
    thumbnail: normalizeProjectThumbnailPath(project.thumbnail),
    characters: normalizeProjectCharacters(project.characters),
  };
}

module.exports = {
  normalizeBlogImagePath,
  normalizeProjectThumbnailPath,
  normalizePublicProjectThumbnailPath,
  normalizeProjectCharacterImagePath,
  normalizeCatalogueImagePath,
  normalizeAppCatalogueHomeImagePath,
  normalizeProjectCharacters,
  normalizeProjectAsset,
};

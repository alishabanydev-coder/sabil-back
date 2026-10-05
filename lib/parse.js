function parseOptionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true') {
      return true;
    }
    if (normalizedValue === 'false') {
      return false;
    }
  }

  return undefined;
}

function parseOptionalHomepageOrder(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return undefined;
  }

  return parsedValue;
}

function parseOptionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return undefined;
  }

  return parsedValue;
}

module.exports = {
  parseOptionalBoolean,
  parseOptionalHomepageOrder,
  parseOptionalNonNegativeInteger,
};

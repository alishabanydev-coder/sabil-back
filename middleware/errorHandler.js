function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const message =
    statusCode === 500 ? 'Something went wrong.' : error.message || 'Request failed.';

  return res.status(statusCode).json({ message });
}

module.exports = errorHandler;

const mongoose = require('mongoose');

const connectDatabase = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error('MongoDB connection string is required.');
  }

  await mongoose.connect(mongoUri, {
    autoIndex: false,
  });

  return mongoose.connection;
};

module.exports = {
  connectDatabase,
};

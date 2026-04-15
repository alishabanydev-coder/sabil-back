const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;

const startServer = async () => {
  try {
    const connection = await connectDatabase(MONGO_URI);
    console.log(`MongoDB connected: ${connection.name}`);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

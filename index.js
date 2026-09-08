const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { initAltcha } = require('./altchaSetup');
const { connectDatabase } = require('./config/database');

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const MONGO_URI = process.env.MONGO_URI;

const startServer = async () => {
  try {
    await initAltcha();
    const connection = await connectDatabase(MONGO_URI);
    console.log(`MongoDB connected: ${connection.name}`);

    app.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

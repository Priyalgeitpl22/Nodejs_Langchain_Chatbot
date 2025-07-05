import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connect, close, insertOrUpdateData, createTableIfNotExists, createEmbeddingTableIfNotExists, createCollectionTableIfNotExists } from './database/organisation_database.js';
import { createEmbeddingSelection } from './organisation_embedding_creation/embedding_generation.js';
import { getResponse } from './rag_folder/question_answer.js';
import { setTimeout as delay } from 'timers/promises';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
}));

// Initialize database tables on startup
const initializeDatabase = async () => {
  const pool = connect();
  try {
    console.log('Initializing database tables...');
    await createTableIfNotExists(pool);
    await createCollectionTableIfNotExists(pool);
    await createEmbeddingTableIfNotExists(pool);
    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    throw error;
  }
};

const logger = console;

app.post('/api/organisation_database', async (req, res) => {
  let { organisation_id, organisation_data } = req.body;

  if (!organisation_data) {
    return res.status(400).json({ message: 'Missing organisation data' });
  }

  const pool = connect();

  try {

    const organisationDataFromFrontend = JSON.stringify(organisation_data);

    const data = {
      organisation_id: organisation_id ? organisation_id.toString() : null, // ✅ allow null to trigger insert
      organisation_data: organisationDataFromFrontend,
      ai_embeddings_status: 'Pending',
      ai_embeddings_reason: 'Initial processing',
    };

    // 🔁 Insert or update, returns the correct org ID (serial)
    const resolvedOrganisationId = await insertOrUpdateData(pool, data);

    // 🧠 Generate embeddings
    await delay(2000);
    const embeddingStatus = await createEmbeddingSelection({
      ...data,
      organisation_id: resolvedOrganisationId.toString(), // stringified for embedding
    });

    // 🔄 Update record with final embedding status
    embeddingStatus.organisation_data = organisationDataFromFrontend;
    await insertOrUpdateData(pool, embeddingStatus);

    // ✅ Response with SERIAL (not UUID)
    res.json({
      organisation_id: resolvedOrganisationId,
      message: embeddingStatus.ai_embeddings_reason,
      status: embeddingStatus.ai_embeddings_status,
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error processing data', error: error.message });
  }
});

app.post('/api/organisation_chatbot', async (req, res) => {
  const { organisation_id, user_query, agents_available, available_agents } = req.body;

  if (!user_query) {
    return res.status(400).json({ message: 'Missing query' });
  }
  if (!organisation_id) {
    return res.status(400).json({ message: 'Missing Organisation ID' });
  }

  const data = {
    user_query,
    organisation_id: organisation_id.toString(),
    agents_available: agents_available || false,
    available_agents: available_agents || [],
  };

  try {
    await delay(2000); // Simulate 2-second delay
    const response = await getResponse(data);
    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error processing query', error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

// Start server after database initialization
const startServer = async () => {
  try {
    await initializeDatabase();
    const server = app.listen(PORT, () => logger.log(`Server running on port ${PORT}`));
    
    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('HTTP server closed.');
        try {
          const pool = connect();
          await close(pool);
          console.log('Database pool closed.');
          process.exit(0);
        } catch (error) {
          console.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
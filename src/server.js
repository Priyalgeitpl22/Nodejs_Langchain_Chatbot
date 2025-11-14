import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connect, insertOrUpdateData, createTableIfNotExists, createEmbeddingTableIfNotExists, createCollectionTableIfNotExists, updateLangchainCollectionsSchema } from './database/organisation_database.js';
import { createEmbeddingSelection } from './organisation_embedding_creation/embedding_generation.js';
import { getResponse } from './rag_folder/question_answer.js';
import { setTimeout as delay } from 'timers/promises';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { chatSummaryPrompt } from './organisation_prompts/prompts.js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o';
const OPENAI_TEMPERATURE = parseInt(process.env.OPENAI_TEMPERATURE || '0');

const chatModel = new ChatOpenAI({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_MODEL_NAME,
        temperature: OPENAI_TEMPERATURE,
      });

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
}));

const logger = console;

app.post('/api/organisation_database', async (req, res) => {
  let { organisation_id, organisation_data } = req.body;

  if (!organisation_data) {
    return res.status(400).json({ message: 'Missing organisation data' });
  }

  const pool = connect();

  try {
    await createTableIfNotExists(pool);
    await createCollectionTableIfNotExists(pool);
    await createEmbeddingTableIfNotExists(pool);
    await updateLangchainCollectionsSchema(pool);

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
  const { organisation_id, user_query, agents_available, available_agents, faqs, openAiKey } = req.body;

  if (!user_query) {
    return res.status(400).json({ message: 'Missing query' });
  }
  if (!organisation_id) {
    return res.status(400).json({ message: 'Missing Organisation ID' });
  }

  console.log('Received request with FAQs:', faqs ? faqs.length : 0, 'FAQs');
  console.log('API Key provided:', openAiKey ? 'Yes (dynamic)' : 'No (will use default)');

  const data = {
    user_query,
    organisation_id: organisation_id.toString(),
    agents_available: agents_available || false,
    available_agents: available_agents || [],
    faqs: faqs || [],
    openai_api_key: openAiKey || null,
  };

  try {
    await delay(2000); // Simulate 2-second delay
    const response = await getResponse(data);
    res.json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error processing query', error: error.message });
  }
});

// to create chat summary
app.post('/api/threadId/summary', async (req, res) => {
  try {
    const { messages } = req.body;
   

    if (!messages) {
      return res.status(400).json({ message: 'messages not found' });
    }

      const prompt = chatSummaryPrompt(messages);
      
      const result = await chatModel.call([new HumanMessage(prompt)]);
      let content = result.content;

    // Remove markdown code block wrapper if present
    if (content.startsWith('```json')) {
      content = content.replace(/```json\n?/, '').replace(/```$/, '');
    }

    // Parse the content as JSON
    const parsed = JSON.parse(content);
    console.log(parsed)

      return res.status(200).json({   data: parsed });
    
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Error in creating chat summary', err: err.message });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.log(`Server running on port ${PORT}`));

export default app;
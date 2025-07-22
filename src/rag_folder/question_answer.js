import { ChatOpenAI } from '@langchain/openai';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import dotenv from 'dotenv';
import { getSessionChatHistory } from '../memory_management/organisations_chat_history.js';
import { checkOrganisationInSession, connectToDatabase as connectHistoryDb } from '../database/organisation_retrieval_history.js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { getOrCreateCollection } from '../database/organisation_vector_database.js';
import { ACT_PROMPT } from '../organisation_prompts/prompts.js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o';
const OPENAI_TEMPERATURE = parseInt(process.env.OPENAI_TEMPERATURE || '0');
const DIMENSION = parseInt(process.env.DIMENSION || 768);

const chatBot = (temperature = 0.7) => {
  const chatModel = new ChatOpenAI({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL_NAME,
    temperature: OPENAI_TEMPERATURE,
  });
  const embeddingModel = new OpenAIEmbeddings({
    model: 'text-embedding-3-large',
    apiKey: OPENAI_API_KEY,
    dimensions: DIMENSION,
  });

  const vectorStoreRetriever = async (organisationId) => {
    const collectionName = `org-${organisationId}`; // Consistent naming
    const vectorStore = await getOrCreateCollection(collectionName, embeddingModel);

    return vectorStore.asRetriever({
      searchType: 'mmr',
      search_kwargs: { 
        filter: { organisation_id: organisationId },
        k: 4,
      },
    });
  };

  const getResponse = async (data) => {
    try {
      const historyDb = await connectHistoryDb();
      const chatHistory = await getSessionChatHistory(historyDb, data.organisation_id);
      const organisationId = data.organisation_id.replace(/-/g, '').padEnd(32, '0');

      if (!(await checkOrganisationInSession(historyDb, data.organisation_id))) {
        chatHistory.addMessage(new HumanMessage({ name: data.organisation_id, content: 'organisation_data' }));
        chatHistory.addMessage(new AIMessage({ name: data.organisation_id, content: 'organisation_data' }));
      }

      const retriever = await vectorStoreRetriever(data.organisation_id);
      console.log('Retriever:', retriever);
      console.log('Query:', data.user_query);
      const documents = retriever ? await retriever.getRelevantDocuments(data.user_query) : [];
      console.log('Retrieved Documents:', documents);

      // Search through provided FAQs for relevant matches
      let relevantFAQs = [];
      if (data.faqs && data.faqs.length > 0) {
        console.log('Searching through', data.faqs.length, 'FAQs');
        relevantFAQs = data.faqs.filter(faq => {
          const question = faq.question?.toLowerCase() || '';
          const answer = faq.answer?.toLowerCase() || '';
          const query = data.user_query.toLowerCase();
          
          // Check if query words appear in question or answer
          const queryWords = query.split(' ').filter(word => word.length > 2);
          return queryWords.some(word => 
            question.includes(word) || answer.includes(word)
          );
        });
        console.log('Found', relevantFAQs.length, 'relevant FAQs');
      }

      // Get agent information from request data
      const agentsAvailable = data.agents_available || false;
      const availableAgents = data.available_agents || [];
      
      console.log('Agent Status from request:', { agents_available: agentsAvailable, available_agents: availableAgents });
      
      // Create context with documents, FAQs, and agent information
      const documentContext = documents.map(doc => doc.pageContent).join('\n\n');
      const faqContext = relevantFAQs.length > 0 
        ? '\n\nRelevant FAQs:\n' + relevantFAQs.map(faq => 
            `Q: ${faq.question}\nA: ${faq.answer}`
          ).join('\n\n')
        : '';
      
      const fullContext = documentContext + faqContext;
      
      let agentInfo;
      if (agentsAvailable && availableAgents.length > 0) {
        const agentNames = availableAgents.map(agent => {
          // Handle different possible agent data structures
          if (typeof agent === 'string') return agent;
          if (agent && typeof agent === 'object') {
            return agent.agent_name || agent.name || agent.id || 'Unknown Agent';
          }
          return 'Unknown Agent';
        });
        agentInfo = `\n\nAgent Information: ${availableAgents.length} agent(s) available: ${agentNames.join(', ')}`;
      } else {
        agentInfo = '\n\nAgent Information: No agents currently available';
      }

      console.log('Agent Info being sent to AI:', agentInfo);
      console.log('FAQ context being sent to AI:', faqContext ? 'Yes' : 'No');

      let prompt;
      try {
        prompt = ChatPromptTemplate.fromMessages([
          ['system', ACT_PROMPT],
          ['human', '{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{question}'],
        ]);
        console.log('Prompt initialized successfully:', prompt);
      } catch (err) {
        console.error('Prompt parsing error:', err);
        throw new Error('Prompt initialization failed due to parsing error.');
      }
      

      const ragChain = prompt.pipe(chatModel).pipe(new JsonOutputParser());

      const chainWithHistory = new RunnableWithMessageHistory({
        runnable: ragChain,   
        getMessageHistory: async (sessionId) => ({
          async getMessages() {
            const history = await chatHistory.getMessages();
            const messages = history.map(msg => {
              if (msg && typeof msg === 'object' && msg.kwargs && msg.kwargs.content) {
                try {
                  const { content, name, additional_kwargs, response_metadata, tool_calls, invalid_tool_calls } = msg.kwargs;
                  if (msg.id && msg.id[2] === 'HumanMessage') {
                    return new HumanMessage({
                      content,
                      name,
                      additional_kwargs: additional_kwargs || {},
                      response_metadata: response_metadata || {},
                    });
                  } else if (msg.id && msg.id[2] === 'AIMessage') {
                    return new AIMessage({
                      content,
                      name,
                      tool_calls: tool_calls || [],
                      additional_kwargs: additional_kwargs || {},
                      response_metadata: response_metadata || {},
                      invalid_tool_calls: invalid_tool_calls || [],
                    });
                  }
                } catch (e) {
                  console.error('Error processing message:', msg, e);
                  return null;
                }
              }
              console.warn('Skipping invalid message:', msg);
              return null;
            }).filter(msg => msg !== null);
            return messages.length > 0 ? messages : [];
          },
          async addMessage(msg) {
            await chatHistory.addMessage(msg);
          },
        }),
        inputMessagesKey: 'question',
        historyMessagesKey: 'chat_history',
      });

      const generation = await chainWithHistory.invoke(
        {
          question: data.user_query,
          context: fullContext,
          agent_status: agentsAvailable,
        },
        { configurable: { sessionId: data.organisation_id } }
      );
      console.log('Generation:', generation);

      return {
        message: 'Query processed successfully',
        status: 200,
        question: data.user_query,
        answer: generation.answer,
        task_creation: generation.task_creation,
        connect_agent: generation.connect_agent || false,
      };
    } catch (error) {
      console.error('Error in getResponse:', error);
      return {
        message: 'Query failed, fallback response sent',
        status: 500,
        question: data.user_query,
        answer: "Sorry, this query does not proceed.",
        task_creation: false
      };
    }
  };

  return { getResponse };
};

export const { getResponse } = chatBot();
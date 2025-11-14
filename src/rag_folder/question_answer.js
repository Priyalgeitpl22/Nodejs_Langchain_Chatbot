// import { ChatOpenAI } from '@langchain/openai';
// import { RunnableWithMessageHistory } from '@langchain/core/runnables';
// import { ChatPromptTemplate } from '@langchain/core/prompts';
// import { JsonOutputParser } from '@langchain/core/output_parsers';
// import { HumanMessage, AIMessage } from '@langchain/core/messages';
// import dotenv from 'dotenv';
// import { getSessionChatHistory } from '../memory_management/organisations_chat_history.js';
// import { checkOrganisationInSession, connectToDatabase as connectHistoryDb } from '../database/organisation_retrieval_history.js';
// import { OpenAIEmbeddings } from '@langchain/openai';
// import { getOrCreateCollection } from '../database/organisation_vector_database.js';
// import { ACT_PROMPT } from '../organisation_prompts/prompts.js';

// dotenv.config();

// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o';
// const OPENAI_TEMPERATURE = parseInt(process.env.OPENAI_TEMPERATURE || '0');
// const DIMENSION = parseInt(process.env.DIMENSION || 768);

// const chatBot = (temperature = 0.7) => {
//   const chatModel = new ChatOpenAI({
//     apiKey: OPENAI_API_KEY,
//     model: OPENAI_MODEL_NAME,
//     temperature: OPENAI_TEMPERATURE,
//   });
//   const embeddingModel = new OpenAIEmbeddings({
//     model: 'text-embedding-3-large',
//     apiKey: OPENAI_API_KEY,
//     dimensions: DIMENSION,
//   });

//   const vectorStoreRetriever = async (organisationId) => {
//     const collectionName = `org-${organisationId}`; // Consistent naming
//     const vectorStore = await getOrCreateCollection(collectionName, embeddingModel);

//     return vectorStore.asRetriever({
//       searchType: 'mmr',
//       search_kwargs: { 
//         filter: { organisation_id: organisationId },
//         k: 4,
//       },
//     });
//   };

//   const getResponse = async (data) => {
//     try {
//       const historyDb = await connectHistoryDb();
//       const chatHistory = await getSessionChatHistory(historyDb, data.organisation_id);
//       const organisationId = data.organisation_id.replace(/-/g, '').padEnd(32, '0');

//       if (!(await checkOrganisationInSession(historyDb, data.organisation_id))) {
//         chatHistory.addMessage(new HumanMessage({ name: data.organisation_id, content: 'organisation_data' }));
//         chatHistory.addMessage(new AIMessage({ name: data.organisation_id, content: 'organisation_data' }));
//       }

//       const retriever = await vectorStoreRetriever(data.organisation_id);
//       console.log('Retriever:', retriever);
//       console.log('Query:', data.user_query);
//       const documents = retriever ? await retriever.getRelevantDocuments(data.user_query) : [];
//       console.log('Retrieved Documents:', documents);

//       // Search through provided FAQs for relevant matches
//       let relevantFAQs = [];
//       if (data.faqs && data.faqs.length > 0) {
//         console.log('Searching through', data.faqs.length, 'FAQs');
//         relevantFAQs = data.faqs.filter(faq => {
//           const question = faq.question?.toLowerCase() || '';
//           const answer = faq.answer?.toLowerCase() || '';
//           const query = data.user_query.toLowerCase();
          
//           // Check if query words appear in question or answer
//           const queryWords = query.split(' ').filter(word => word.length > 2);
//           return queryWords.some(word => 
//             question.includes(word) || answer.includes(word)
//           );
//         });
//         console.log('Found', relevantFAQs.length, 'relevant FAQs');
//       }

//       // Get agent information from request data
//       const agentsAvailable = data.agents_available || false;
//       const availableAgents = data.available_agents || [];
      
//       console.log('Agent Status from request:', { agents_available: agentsAvailable, available_agents: availableAgents });
      
//       // Create context with documents, FAQs, and agent information
//       const documentContext = documents.map(doc => doc.pageContent).join('\n\n');
//       const faqContext = relevantFAQs.length > 0 
//         ? '\n\nRelevant FAQs:\n' + relevantFAQs.map(faq => 
//             `Q: ${faq.question}\nA: ${faq.answer}`
//           ).join('\n\n')
//         : '';
      
//       const fullContext = documentContext + faqContext;
      
//       let agentInfo;
//       if (agentsAvailable && availableAgents.length > 0) {
//         const agentNames = availableAgents.map(agent => {
//           // Handle different possible agent data structures
//           if (typeof agent === 'string') return agent;
//           if (agent && typeof agent === 'object') {
//             return agent.agent_name || agent.name || agent.id || 'Unknown Agent';
//           }
//           return 'Unknown Agent';
//         });
//         agentInfo = `\n\nAgent Information: ${availableAgents.length} agent(s) available: ${agentNames.join(', ')}`;
//       } else {
//         agentInfo = '\n\nAgent Information: No agents currently available';
//       }

//       console.log('Agent Info being sent to AI:', agentInfo);
//       console.log('FAQ context being sent to AI:', faqContext ? 'Yes' : 'No');

//       let prompt;
//       try {
//         prompt = ChatPromptTemplate.fromMessages([
//           ['system', ACT_PROMPT],
//           ['human', '{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{question}'],
//         ]);
//         console.log('Prompt initialized successfully:', prompt);
//       } catch (err) {
//         console.error('Prompt parsing error:', err);
//         throw new Error('Prompt initialization failed due to parsing error.');
//       }
      

//       const ragChain = prompt.pipe(chatModel).pipe(new JsonOutputParser());

//       const chainWithHistory = new RunnableWithMessageHistory({
//         runnable: ragChain,   
//         getMessageHistory: async (sessionId) => ({
//           async getMessages() {
//             const history = await chatHistory.getMessages();
//             const messages = history.map(msg => {
//               if (msg && typeof msg === 'object' && msg.kwargs && msg.kwargs.content) {
//                 try {
//                   const { content, name, additional_kwargs, response_metadata, tool_calls, invalid_tool_calls } = msg.kwargs;
//                   if (msg.id && msg.id[2] === 'HumanMessage') {
//                     return new HumanMessage({
//                       content,
//                       name,
//                       additional_kwargs: additional_kwargs || {},
//                       response_metadata: response_metadata || {},
//                     });
//                   } else if (msg.id && msg.id[2] === 'AIMessage') {
//                     return new AIMessage({
//                       content,
//                       name,
//                       tool_calls: tool_calls || [],
//                       additional_kwargs: additional_kwargs || {},
//                       response_metadata: response_metadata || {},
//                       invalid_tool_calls: invalid_tool_calls || [],
//                     });
//                   }
//                 } catch (e) {
//                   console.error('Error processing message:', msg, e);
//                   return null;
//                 }
//               }
//               console.warn('Skipping invalid message:', msg);
//               return null;
//             }).filter(msg => msg !== null);
//             return messages.length > 0 ? messages : [];
//           },
//           async addMessage(msg) {
//             await chatHistory.addMessage(msg);
//           },
//         }),
//         inputMessagesKey: 'question',
//         historyMessagesKey: 'chat_history',
//       });

//       const generation = await chainWithHistory.invoke(
//         {
//           question: data.user_query,
//           context: fullContext,
//           agent_status: agentsAvailable,
//         },
//         { configurable: { sessionId: data.organisation_id } }
//       );
//       console.log('Generation:', generation);

//       return {
//         message: 'Query processed successfully',
//         status: 200,
//         question: data.user_query,
//         answer: generation.answer,
//         task_creation: generation.task_creation,
//         connect_agent: generation.connect_agent || false,
//       };
//     } catch (error) {
//       console.error('Error in getResponse:', error);
//       return {
//         message: 'Query failed, fallback response sent',
//         status: 500,
//         question: data.user_query,
//         answer: "Sorry, this query does not proceed.",
//         task_creation: false
//       };
//     }
//   };

//   return { getResponse };
// };

// export const { getResponse } = chatBot();

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import dotenv from 'dotenv';
import { StateGraph, START, END } from '@langchain/langgraph';
import { getSessionChatHistory } from '../memory_management/organisations_chat_history.js';
import { checkOrganisationInSession, connectToDatabase as connectHistoryDb } from '../database/organisation_retrieval_history.js';
import { OpenAIEmbeddings } from '@langchain/openai';
import { getOrCreateCollection } from '../database/organisation_vector_database.js';
import { ACT_PROMPT } from '../organisation_prompts/prompts.js';
import { extractToolConfiguration, saveToolConfiguration } from '../utils/toolConfiguration.js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4o';
const OPENAI_TEMPERATURE = parseInt(process.env.OPENAI_TEMPERATURE || '0');
const DIMENSION = parseInt(process.env.DIMENSION || 768);

// Define the state schema
const ChatBotState = {
  organisation_id: null,
  user_query: null,
  documents: [],
  faqs: [],
  dynamic_data: [],
  agents_available: false,
  available_agents: [],
  context: "",
  chat_history: [],
  answer: null,
  tool_calls:[],
  task_creation: false,
  tool_configuration: false,
  tool_config_data: null,
  connect_agent: false,
  openai_api_key: null,
  user_id: null,
  backend_api_url: null,
  auth_token: null,
};


// Function to get the appropriate API key with logging
const getApiKey = (dynamicKey) => {
  const apiKey = dynamicKey || OPENAI_API_KEY;
  const keySource = dynamicKey ? 'dynamic (from request)' : 'default (from environment)';
  const maskedKey = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'undefined';
  
  console.log(`🔑 Using OpenAI API key: ${maskedKey} (${keySource})`);
  return apiKey;
};

// Function to create chat model with dynamic API key
const createChatModel = (apiKey) => {
  const key = getApiKey(apiKey);
  return new ChatOpenAI({
    apiKey: key,
    model: OPENAI_MODEL_NAME,
    temperature: OPENAI_TEMPERATURE,
  });
};

// Function to create embedding model with dynamic API key
const createEmbeddingModel = (apiKey) => {
  const key = getApiKey(apiKey);
  return new OpenAIEmbeddings({
    model: 'text-embedding-3-large',
    apiKey: key,
    dimensions: DIMENSION,
  });
};

// Node: Initialize chat history
async function initializeChatHistory(state) {
  try {
    const historyDb = await connectHistoryDb();
    const chatHistory = await getSessionChatHistory(historyDb, state.organisation_id);
    const organisationId = state.organisation_id.replace(/-/g, '').padEnd(32, '0');

    if (!(await checkOrganisationInSession(historyDb, state.organisation_id))) {
      await chatHistory.addMessage(new HumanMessage({ name: state.organisation_id, content: 'organisation_data' }));
      await chatHistory.addMessage(new AIMessage({ name: state.organisation_id, content: 'organisation_data' }));
    }

    const historyMessages = await chatHistory.getMessages();
    const messages = historyMessages.map(msg => {
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

    return { chat_history: messages };
  } catch (error) {
    console.error('Error in initializeChatHistory:', error);
    return { chat_history: [] };
  }
}

// Node: Retrieve documents
async function retrieveDocuments(state) {
  try {
    const collectionName = `org-${state.organisation_id}`;
    const embeddingModel = createEmbeddingModel(state.openai_api_key);
    const vectorStore = await getOrCreateCollection(collectionName, embeddingModel);
    const retriever = vectorStore.asRetriever({
      searchType: 'mmr',
      search_kwargs: {
        filter: { organisation_id: state.organisation_id },
        k: 4,
      },
    });

    console.log('Retriever:', retriever);
    console.log('Query:', state.user_query);
    const documents = await retriever.getRelevantDocuments(state.user_query);
    console.log('Retrieved Documents:', documents);

    return { documents };
  } catch (error) {
    console.error('Error in retrieveDocuments:', error);
    return { documents: [] };
  }
}

// Node: Filter FAQs
async function filterFAQs(state) {
  let relevantFAQs = [];
  if (state.faqs && state.faqs.length > 0) {
    console.log('Searching through', state.faqs.length, 'FAQs');
    relevantFAQs = state.faqs.filter(faq => {
      const question = faq.question?.toLowerCase() || '';
      const answer = faq.answer?.toLowerCase() || '';
      const query = state.user_query.toLowerCase();
      const queryWords = query.split(' ').filter(word => word.length > 2);
      return queryWords.some(word => question.includes(word) || answer.includes(word));
    });
    console.log('Found', relevantFAQs.length, 'relevant FAQs');
  }
  return { faqs: relevantFAQs };
}

// Node: Create context
async function createContext(state) {
  const documentContext = state.documents.map(doc => doc.pageContent).join('\n\n');
  const faqContext = state.faqs.length > 0
    ? '\n\nRelevant FAQs:\n' + state.faqs.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join('\n\n')
    : '';

  let agentInfo;
  if (state.agents_available && state.available_agents.length > 0) {
    const agentNames = state.available_agents.map(agent => {
      if (typeof agent === 'string') return agent;
      if (agent && typeof agent === 'object') {
        return agent.agent_name || agent.name || agent.id || 'Unknown Agent';
      }
      return 'Unknown Agent';
    });
    agentInfo = `\n\nAgent Information: ${state.available_agents.length} agent(s) available: ${agentNames.join(', ')}`;
  } else {
    agentInfo = '\n\nAgent Information: No agents currently available';
  }

  console.log('Agent Info being sent to AI:', agentInfo);
  console.log('FAQ context being sent to AI:', faqContext ? 'Yes' : 'No');

  const fullContext = documentContext + faqContext + agentInfo;
  return { context: fullContext };
}

// Node: Check for tool configuration
async function checkToolConfiguration(state) {
  try {
    // Use AI to extract tool configuration from user query
    const toolConfig = await extractToolConfiguration(
      state.user_query,
      state.openai_api_key
    );

    if (toolConfig && toolConfig.hasToolConfig) {
      console.log('Tool configuration detected:', toolConfig);
      return {
        tool_configuration: true,
        tool_config_data: toolConfig,
      };
    }

    return {
      tool_configuration: false,
      tool_config_data: null,
    };
  } catch (error) {
    console.error('Error checking tool configuration:', error);
    return {
      tool_configuration: false,
      tool_config_data: null,
    };
  }
}

// Node: Process tool configuration
async function processToolConfiguration(state) {
  try {
    if (!state.tool_config_data || !state.tool_config_data.hasToolConfig) {
      return {
        answer: "I couldn't extract the tool configuration details. Please provide: what the tool does, the API URL, and authentication information.",
        tool_configuration: false,
      };
    }

    const toolConfig = state.tool_config_data;
    
    // Validate and save tool configuration
    const saveResult = await saveToolConfiguration(
      toolConfig,
      state.organisation_id,
      state.user_id,
      state.backend_api_url || process.env.BACKEND_API_URL || 'http://localhost:5003',
      state.auth_token
    );

    if (saveResult.success) {
      return {
        answer: `Great! I've successfully configured and saved your tool. The tool "${toolConfig.prompt}" is now set up to call ${toolConfig.url}. The API has been validated and saved to your configuration.`,
        tool_configuration: true,
      };
    } else {
      return {
        answer: `I encountered an issue while saving your tool configuration: ${saveResult.error}. Please check the API URL and authentication details, then try again.`,
        tool_configuration: false,
      };
    }
  } catch (error) {
    console.error('Error processing tool configuration:', error);
    return {
      answer: "Sorry, I encountered an error while processing your tool configuration. Please try again.",
      tool_configuration: false,
    };
  }
}

// Node: Generate response
async function generateResponse(state) {
  try {
    // If tool configuration is being processed, skip normal response generation
    if (state.tool_configuration && state.tool_config_data) {
      return {
        answer: state.answer || "Processing tool configuration...",
        task_creation: false,
        connect_agent: false,
      };
    }

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', ACT_PROMPT],
      ['human', '{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{question}'],
    ]);

    const chatModel = createChatModel(state.openai_api_key);
    const ragChain = prompt.pipe(chatModel).pipe(new JsonOutputParser());

    const historyDb = await connectHistoryDb();
    const chatHistory = await getSessionChatHistory(historyDb, state.organisation_id);

    const generation = await ragChain.invoke({
      question: state.user_query,
      context: state.context,
      chat_history: state.chat_history,
      agent_status: state.agents_available,
    });

    // Add new messages to history
    await chatHistory.addMessage(new HumanMessage({ content: state.user_query, name: state.organisation_id }));
    await chatHistory.addMessage(new AIMessage({ content: generation.answer, name: state.organisation_id }));

    console.log('Generation:', generation);

    return {
      answer: generation.answer,
      task_creation: generation.task_creation || false,
      tool_configuration: generation.tool_configuration || false,
      connect_agent: generation.connect_agent || false,
    };
  } catch (error) {
    console.error('Error in generateResponse:', error);
    return {
      answer: "Sorry, this query does not proceed.",
      task_creation: false,
      tool_configuration: false,
      connect_agent: false,
    };
  }
}

// Node: Format output
async function formatOutput(state) {
  return {
    message: state.answer ? 'Query processed successfully' : 'Query failed, fallback response sent',
    status: state.answer ? 200 : 500,
    question: state.user_query,
    answer: state.answer,
    task_creation: state.task_creation,
    tool_configuration: state.tool_configuration,
    connect_agent: state.connect_agent,
  };
}

// Conditional edge function to route based on tool configuration
function shouldProcessToolConfig(state) {
  return state.tool_configuration ? "processToolConfiguration" : "generateResponse";
}

// Create the graph
const graph = new StateGraph({ channels: ChatBotState })
  .addNode("initializeChatHistory", initializeChatHistory)
  .addNode("retrieveDocuments", retrieveDocuments)
  .addNode("filterFAQs", filterFAQs)
  .addNode("createContext", createContext)
  .addNode("checkToolConfiguration", checkToolConfiguration)
  .addNode("processToolConfiguration", processToolConfiguration)
  .addNode("generateResponse", generateResponse)
  .addNode("formatOutput", formatOutput)
  .addEdge(START, "initializeChatHistory")
  .addEdge("initializeChatHistory", "retrieveDocuments")
  .addEdge("retrieveDocuments", "filterFAQs")
  .addEdge("filterFAQs", "createContext")
  .addEdge("createContext", "checkToolConfiguration")
  .addConditionalEdges("checkToolConfiguration", shouldProcessToolConfig, {
    "processToolConfiguration": "processToolConfiguration",
    "generateResponse": "generateResponse",
  })
  .addEdge("processToolConfiguration", "formatOutput")
  .addEdge("generateResponse", "formatOutput")
  .addEdge("formatOutput", END);

// Compile the graph
const app = graph.compile();

// Main function to invoke the graph
const getResponse = async (data) => {
  try {
    console.log('🚀 Starting chat processing with API key:', data.openai_api_key ? 'dynamic' : 'default');
    console.log('Dynamic data:', data.dynamic_data);

    const result = await app.invoke({
      organisation_id: data.organisation_id,
      user_query: data.user_query,
      faqs: data.faqs || [],
      agents_available: data.agents_available || false,
      available_agents: data.available_agents || [],
      openai_api_key: data.openai_api_key || null,
      dynamic_data: data.dynamic_data || [],
      user_id: data.user_id || null,
      backend_api_url: data.backend_api_url || process.env.BACKEND_API_URL || null,
      auth_token: data.auth_token || null,
    });
    return result;
  } catch (error) {
    console.error('Error in getResponse:', error);
    return {
      message: 'Query failed, fallback response sent',
      status: 500,
      question: data.user_query,
      answer: "Sorry, this query does not proceed.",
      task_creation: false,
      tool_configuration: false,
      connect_agent: false,
    };
  }
};

export { getResponse };
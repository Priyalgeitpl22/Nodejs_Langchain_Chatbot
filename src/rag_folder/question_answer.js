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
  connect_agent: false,
  openai_api_key: null,
  route: null, // "api" or "rag"
};


// Function to get the appropriate API key
const getApiKey = (dynamicKey) => {
  return dynamicKey || OPENAI_API_KEY;
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
    console.log('📚 [initializeChatHistory] Starting chat history initialization for org:', state.organisation_id);
    const historyDb = await connectHistoryDb();
    const chatHistory = await getSessionChatHistory(state.organisation_id);

    if (!(await checkOrganisationInSession(historyDb, state.organisation_id))) {
      console.log('📚 [initializeChatHistory] New session detected, initializing with organisation_data');
      await chatHistory.addMessage(new HumanMessage({ name: state.organisation_id, content: 'organisation_data' }));
      await chatHistory.addMessage(new AIMessage({ name: state.organisation_id, content: 'organisation_data' }));
    }

    const historyMessages = await chatHistory.getMessages();
    console.log('📚 [initializeChatHistory] Loaded', historyMessages.length, 'messages from history');
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
          return null;
        }
      }
      return null;
    }).filter(msg => msg !== null);

    return { chat_history: messages };
  } catch (error) {
    console.error('Error in initializeChatHistory:', error);
    return { chat_history: [] };
  }
}

// Node: Retrieve documents (using dynamic_data)
async function retrieveDocuments(state) {
  try {
    console.log('🔍 [retrieveDocuments] Starting document retrieval for query:', state.user_query);
    let documents = [];
    
    // Skip document retrieval if dynamic_data has prompt and apiCurl (will use API route)
    const hasApiConfig = state.dynamic_data && state.dynamic_data.some(item => 
      typeof item === 'object' && item !== null && (item.prompt && item.apiCurl)
    );
    
    if (hasApiConfig) {
      console.log('🔍 [retrieveDocuments] API config detected, skipping vector store retrieval');
    } else {
      console.log('🔍 [retrieveDocuments] Using vector store retrieval');
      // Use vector store retrieval
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
      documents = await retriever.getRelevantDocuments(state.user_query);
      console.log('🔍 [retrieveDocuments] Retrieved', documents.length, 'documents from vector store');
    }
    
    return { documents };
  } catch (error) {
    console.error('Error in retrieveDocuments:', error);
    return { documents: [] };
  }
}

// Node: Filter FAQs
async function filterFAQs(state) {
  console.log('❓ [filterFAQs] Filtering FAQs, total FAQs:', state.faqs?.length || 0);
  let relevantFAQs = [];
  if (state.faqs && state.faqs.length > 0) {
    relevantFAQs = state.faqs.filter(faq => {
      const question = faq.question?.toLowerCase() || '';
      const answer = faq.answer?.toLowerCase() || '';
      const query = state.user_query.toLowerCase();
      const queryWords = query.split(' ').filter(word => word.length > 2);
      return queryWords.some(word => question.includes(word) || answer.includes(word));
    });
    console.log('❓ [filterFAQs] Found', relevantFAQs.length, 'relevant FAQs');
  }
  return { faqs: relevantFAQs };
}

// Node: Create context
async function createContext(state) {
  console.log('📝 [createContext] Creating context from documents and FAQs');
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

  const fullContext = documentContext + faqContext + agentInfo;
  console.log('📝 [createContext] Context created, length:', fullContext.length, 'characters');
  return { context: fullContext };
}

// Helper function to parse curl command
function parseCurl(curlString) {
  const result = {
    url: null,
    method: 'GET', // Default to GET if no method specified
    headers: {},
    body: null
  };

  try {
    // Normalize the curl string - handle multi-line and backslashes
    const normalizedCurl = curlString.replace(/\\\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Extract URL - handle various formats including GET requests without -X
    const urlPatterns = [
      /curl\s+(?:-X\s+\w+\s+)?['"]?([^\s'"]+https?:\/\/[^\s'"]+)['"]?/,
      /curl\s+['"]?([^\s'"]+https?:\/\/[^\s'"]+)['"]?/,
      /['"]?(https?:\/\/[^\s'"]+)['"]?/
    ];
    
    for (const pattern of urlPatterns) {
      const urlMatch = normalizedCurl.match(pattern);
      if (urlMatch && urlMatch[1] && urlMatch[1].startsWith('http')) {
        result.url = urlMatch[1].replace(/['"]/g, '');
        break;
      }
    }

    // Extract method - default to GET if not specified
    const methodMatch = normalizedCurl.match(/-X\s+(\w+)/i);
    if (methodMatch) {
      result.method = methodMatch[1].toUpperCase();
    }

    // Extract headers - handle both quoted and unquoted, including multi-line
    // Priority: quoted headers first (more reliable), then unquoted
    const headerPatterns = [
      /-H\s+['"]([^'"]+)['"]/g,  // Quoted headers: -H 'header: value'
      /--header\s+['"]([^'"]+)['"]/g,  // --header 'header: value'
      /-H\s+([^\s\\-]+)/g  // Unquoted headers (fallback)
    ];
    
    for (const pattern of headerPatterns) {
      const headerMatches = normalizedCurl.matchAll(pattern);
      for (const match of headerMatches) {
        const headerStr = match[1].replace(/['"]/g, '').trim();
        const colonIndex = headerStr.indexOf(':');
        if (colonIndex > 0) {
          const key = headerStr.substring(0, colonIndex).trim();
          const value = headerStr.substring(colonIndex + 1).trim();
          if (key && value) {
            // Preserve header exactly as provided (case-sensitive for some headers like Authorization)
            result.headers[key] = value;
          }
        }
      }
    }
    
    console.log('🔧 [parseCurl] Extracted headers count:', Object.keys(result.headers).length);
    if (result.headers['authorization'] || result.headers['Authorization']) {
      const authHeader = result.headers['authorization'] || result.headers['Authorization'];
      console.log('🔧 [parseCurl] Authorization header found:', authHeader.substring(0, 20) + '...');
    }

    // Extract body/data - handle various formats
    const dataPatterns = [
      /(?:-d|--data|--data-raw)\s+['"]([^'"]+)['"]/,
      /(?:-d|--data|--data-raw)\s+([^\s\\]+)/,
      /--data-binary\s+['"]([^'"]+)['"]/
    ];
    
    for (const pattern of dataPatterns) {
      const dataMatch = normalizedCurl.match(pattern);
      if (dataMatch) {
        const dataStr = dataMatch[1].replace(/['"]/g, '');
        try {
          result.body = JSON.parse(dataStr);
        } catch {
          result.body = dataStr;
        }
        break;
      }
    }

    // If no Content-Type header is set and we have a body, set default
    if (result.body && !result.headers['Content-Type'] && !result.headers['content-type']) {
      result.headers['Content-Type'] = 'application/json';
    }
  } catch (error) {
    console.error('Error parsing curl:', error);
  }

  return result;
}

// Node: Check API Trigger (MODEL ROUTER)
async function checkApiTrigger(state) {
  try {
    console.log('🔀 [checkApiTrigger] Starting router decision');
    let route = "rag"; // default route
    
    if (state.dynamic_data && state.dynamic_data.length > 0) {
      console.log('🔀 [checkApiTrigger] Checking dynamic_data for API config, items:', state.dynamic_data.length);
      // Find item with prompt and apiCurl
      const apiConfig = state.dynamic_data.find(item => 
        typeof item === 'object' && item !== null && item.prompt && item.apiCurl
      );
      
      if (apiConfig) {
        console.log('🔀 [checkApiTrigger] Found API config with prompt:', apiConfig.prompt);
        console.log('🔀 [checkApiTrigger] Using LLM to check if query matches prompt');
        // Use LLM to check if user query is related to the prompt
        const chatModel = createChatModel(state.openai_api_key);
        const checkPrompt = ChatPromptTemplate.fromMessages([
          ['system', 'You are a routing assistant. Determine if the user query is related to the given prompt/topic. Respond with only "yes" or "no".'],
          ['human', 'Prompt/Topic: {prompt}\n\nUser Query: {query}\n\nIs the user query related to the prompt? Respond with only "yes" or "no".']
        ]);
        
        const chain = checkPrompt.pipe(chatModel);
        const response = await chain.invoke({
          prompt: apiConfig.prompt,
          query: state.user_query
        });
        
        const isRelated = response.content?.toLowerCase().trim().startsWith('yes');
        console.log('🔀 [checkApiTrigger] LLM response:', response.content, '| Is related:', isRelated);
        
        if (isRelated) {
          route = "api";
          console.log('🔀 [checkApiTrigger] ✅ Routing to API path');
        } else {
          console.log('🔀 [checkApiTrigger] ❌ Query not related to prompt, routing to RAG path');
        }
      } else {
        console.log('🔀 [checkApiTrigger] No API config (prompt + apiCurl) found in dynamic_data');
      }
    } else {
      console.log('🔀 [checkApiTrigger] No dynamic_data provided');
    }
    
    console.log('🔀 [checkApiTrigger] Final route decision:', route);
    return { route };
  } catch (error) {
    console.error('Error in checkApiTrigger:', error);
    return { route: "rag" };
  }
}

// Node: Call External API
async function callExternalApi(state) {
  try {
    console.log('📡 [callExternalApi] Starting external API call');
    // Find API configuration from dynamic_data with prompt and apiCurl
    const apiConfig = state.dynamic_data.find(item => 
      typeof item === 'object' && item !== null && item.prompt && item.apiCurl
    );
    
    if (!apiConfig || !apiConfig.apiCurl) {
      throw new Error('No API configuration (apiCurl) found in dynamic_data');
    }
    
    console.log('📡 [callExternalApi] Parsing curl command');
    // Parse curl command
    const curlConfig = parseCurl(apiConfig.apiCurl);
    
    if (!curlConfig.url) {
      throw new Error('Could not extract URL from apiCurl');
    }
    
    console.log('📡 [callExternalApi] API URL:', curlConfig.url);
    console.log('📡 [callExternalApi] API Method:', curlConfig.method);
    console.log('📡 [callExternalApi] API Headers count:', Object.keys(curlConfig.headers).length);
    // Log headers but mask sensitive tokens
    const headersForLog = {};
    for (const [key, value] of Object.entries(curlConfig.headers)) {
      if (key.toLowerCase() === 'authorization' || key.toLowerCase().includes('token')) {
        headersForLog[key] = value.substring(0, 20) + '...' + value.substring(value.length - 10);
      } else {
        headersForLog[key] = value;
      }
    }
    console.log('📡 [callExternalApi] API Headers:', JSON.stringify(headersForLog));
    
    // Verify authorization header is present
    if (curlConfig.headers['authorization'] || curlConfig.headers['Authorization']) {
      console.log('📡 [callExternalApi] ✅ Authorization token found in headers');
    } else {
      console.log('📡 [callExternalApi] ⚠️ No authorization header found');
    }
    
    // Prepare request - only add body for POST, PUT, PATCH methods
    let requestBody = null;
    const methodsWithBody = ['POST', 'PUT', 'PATCH'];
    
    if (methodsWithBody.includes(curlConfig.method)) {
      requestBody = curlConfig.body || {};
      
      // If body is a string, try to parse it, otherwise use as template
      if (typeof requestBody === 'string') {
        try {
          requestBody = JSON.parse(requestBody);
        } catch {
          // If not JSON, use it as template and replace placeholders
          requestBody = {
            query: state.user_query,
            user_query: state.user_query,
            organisation_id: state.organisation_id,
            context: state.context,
            chat_history: state.chat_history,
          };
        }
      } else if (typeof requestBody === 'object') {
        // Merge user query and context into existing body
        requestBody = {
          ...requestBody,
          query: state.user_query,
          user_query: state.user_query,
          organisation_id: state.organisation_id,
          context: state.context,
          chat_history: state.chat_history,
        };
      } else {
        requestBody = {
          query: state.user_query,
          organisation_id: state.organisation_id,
          context: state.context,
          chat_history: state.chat_history,
        };
      }
      console.log('📡 [callExternalApi] Request body:', JSON.stringify(requestBody));
    } else {
      console.log('📡 [callExternalApi] GET request - no body will be sent');
    }
    
    console.log('📡 [callExternalApi] Making API request...');
    
    const response = await fetch(curlConfig.url, {
      method: curlConfig.method,
      headers: curlConfig.headers,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });
    
    console.log('📡 [callExternalApi] API response status:', response.status, response.statusText);
    
    if (!response.ok) {
      // Log the error but don't expose it to user - fall back to RAG
      console.error('📡 [callExternalApi] API call failed with status:', response.status, response.statusText);
      console.log('📡 [callExternalApi] Falling back to RAG response generation');
      
      // Fall back to RAG response generation
      return await generateResponse(state);
    }
    
    let apiResponse;
    try {
      const responseText = await response.text();
      if (responseText) {
        apiResponse = JSON.parse(responseText);
      } else {
        throw new Error('Empty response from API');
      }
    } catch (parseError) {
      console.error('📡 [callExternalApi] Failed to parse API response:', parseError);
      console.log('📡 [callExternalApi] Falling back to RAG response generation');
      // Fall back to RAG if response parsing fails
      return await generateResponse(state);
    }
    
    console.log('📡 [callExternalApi] API response received:', JSON.stringify(apiResponse).substring(0, 200) + '...');
    
    // Extract answer from API response - support multiple formats
    let answer = apiResponse.answer || apiResponse.response || apiResponse.data?.answer || apiResponse.message || apiResponse.text;
    
    // If no direct answer field, try to format the response
    if (!answer) {
      if (typeof apiResponse === 'string') {
        answer = apiResponse;
      } else if (Array.isArray(apiResponse)) {
        // If response is an array, format it nicely
        answer = `I found ${apiResponse.length} result(s). ${JSON.stringify(apiResponse).substring(0, 500)}`;
      } else {
        answer = JSON.stringify(apiResponse);
      }
    }
    
    // Validate that we got a meaningful answer
    if (!answer || answer.trim().length === 0) {
      console.log('📡 [callExternalApi] Empty or invalid answer from API, falling back to RAG');
      return await generateResponse(state);
    }
    
    const taskCreation = apiResponse.task_creation || false;
    const connectAgent = apiResponse.connect_agent || false;
    
    console.log('📡 [callExternalApi] Extracted answer length:', answer?.length || 0);
    console.log('📡 [callExternalApi] Task creation:', taskCreation, '| Connect agent:', connectAgent);
    
    // Update chat history
    console.log('📡 [callExternalApi] Updating chat history');
    const chatHistory = await getSessionChatHistory(state.organisation_id);
    await chatHistory.addMessage(new HumanMessage({ content: state.user_query, name: state.organisation_id }));
    await chatHistory.addMessage(new AIMessage({ content: answer, name: state.organisation_id }));
    
    console.log('📡 [callExternalApi] ✅ API call completed successfully');
    return {
      answer: answer,
      task_creation: taskCreation,
      connect_agent: connectAgent,
    };
  } catch (error) {
    // Catch any other errors (network, timeout, etc.) and fall back to RAG
    console.error('📡 [callExternalApi] Error occurred:', error.message);
    console.log('📡 [callExternalApi] Falling back to RAG response generation');
    
    // Fall back to RAG response generation instead of showing error
    try {
      return await generateResponse(state);
    } catch (ragError) {
      console.error('📡 [callExternalApi] RAG fallback also failed:', ragError);
      // Last resort - return a generic helpful message
      return {
        answer: "I'm having trouble accessing that information right now. Could you please rephrase your question?",
        task_creation: false,
        connect_agent: false,
      };
    }
  }
}

// Node: Generate response
async function generateResponse(state) {
  try {
    console.log('🤖 [generateResponse] Starting RAG response generation');
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', ACT_PROMPT],
      ['human', '{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{question}'],
    ]);

    const chatModel = createChatModel(state.openai_api_key);
    const ragChain = prompt.pipe(chatModel).pipe(new JsonOutputParser());

    const chatHistory = await getSessionChatHistory(state.organisation_id);

    console.log('🤖 [generateResponse] Invoking LLM with context length:', state.context.length);
    const generation = await ragChain.invoke({
      question: state.user_query,
      context: state.context,
      chat_history: state.chat_history,
      agent_status: state.agents_available,
    });

    console.log('🤖 [generateResponse] LLM generation received');
    console.log('🤖 [generateResponse] Answer length:', generation.answer?.length || 0);
    console.log('🤖 [generateResponse] Task creation:', generation.task_creation, '| Connect agent:', generation.connect_agent);

    // Add new messages to history
    console.log('🤖 [generateResponse] Updating chat history');
    await chatHistory.addMessage(new HumanMessage({ content: state.user_query, name: state.organisation_id }));
    await chatHistory.addMessage(new AIMessage({ content: generation.answer, name: state.organisation_id }));

    console.log('🤖 [generateResponse] ✅ RAG response generated successfully');
    return {
      answer: generation.answer,
      task_creation: generation.task_creation,
      connect_agent: generation.connect_agent || false,
    };
  } catch (error) {
    console.error('Error in generateResponse:', error);
    return {
      answer: "Sorry, this query does not proceed.",
      task_creation: false,
      connect_agent: false,
    };
  }
}

// Node: Format output
async function formatOutput(state) {
  console.log('📤 [formatOutput] Formatting final output');
  const output = {
    message: state.answer ? 'Query processed successfully' : 'Query failed, fallback response sent',
    status: state.answer ? 200 : 500,
    question: state.user_query,
    answer: state.answer,
    task_creation: state.task_creation,
    connect_agent: state.connect_agent,
  };
  console.log('📤 [formatOutput] Final output status:', output.status);
  console.log('📤 [formatOutput] Final output message:', output.message);
  return output;
}

// Router function for conditional edges
function routeDecision(state) {
  return state.route || "rag";
}

// Create the graph
const graph = new StateGraph({ channels: ChatBotState })
  .addNode("initializeChatHistory", initializeChatHistory)
  .addNode("retrieveDocuments", retrieveDocuments)
  .addNode("filterFAQs", filterFAQs)
  .addNode("createContext", createContext)
  .addNode("checkApiTrigger", checkApiTrigger)
  .addNode("callExternalApi", callExternalApi)
  .addNode("generateResponse", generateResponse)
  .addNode("formatOutput", formatOutput)
  .addEdge(START, "initializeChatHistory")
  .addEdge("initializeChatHistory", "retrieveDocuments")
  .addEdge("retrieveDocuments", "filterFAQs")
  .addEdge("filterFAQs", "createContext")
  .addEdge("createContext", "checkApiTrigger")
  .addConditionalEdges("checkApiTrigger", routeDecision, {
    "api": "callExternalApi",
    "rag": "generateResponse"
  })
  .addEdge("callExternalApi", "formatOutput")
  .addEdge("generateResponse", "formatOutput")
  .addEdge("formatOutput", END);

// Compile the graph
const app = graph.compile();

// Main function to invoke the graph
const getResponse = async (data) => {
  try {
    console.log('🚀 [getResponse] ========================================');
    console.log('🚀 [getResponse] Starting request processing');
    console.log('🚀 [getResponse] Organisation ID:', data.organisation_id);
    console.log('🚀 [getResponse] User Query:', data.user_query);
    console.log('🚀 [getResponse] FAQs count:', data.faqs?.length || 0);
    console.log('🚀 [getResponse] Agents available:', data.agents_available);
    console.log('🚀 [getResponse] Dynamic data items:', data.dynamic_data?.length || 0);
    if (data.dynamic_data && data.dynamic_data.length > 0) {
      console.log('🚀 [getResponse] Dynamic data:', JSON.stringify(data.dynamic_data).substring(0, 200) + '...');
    }
    console.log('🚀 [getResponse] ========================================');
    
    const result = await app.invoke({
      organisation_id: data.organisation_id,
      user_query: data.user_query,
      faqs: data.faqs || [],
      agents_available: data.agents_available || false,
      available_agents: data.available_agents || [],
      openai_api_key: data.openai_api_key || null,
      dynamic_data: data.dynamic_data || [],
    });
    
    console.log('🚀 [getResponse] ✅ Request processed successfully');
    console.log('🚀 [getResponse] Final status:', result.status);
    return result;
  } catch (error) {
    console.error('🚀 [getResponse] ❌ Error in getResponse:', error);
    return {
      message: 'Query failed, fallback response sent',
      status: 500,
      question: data.user_query,
      answer: "Sorry, this query does not proceed.",
      task_creation: false,
      connect_agent: false,
    };
  }
};

export { getResponse };
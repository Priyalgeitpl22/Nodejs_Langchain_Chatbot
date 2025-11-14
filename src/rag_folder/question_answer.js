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
    
    // Skip document retrieval if dynamic_data has prompt and apiCurl/apiUrl (will use API route)
    const hasApiConfig = state.dynamic_data && state.dynamic_data.some(item => 
      typeof item === 'object' && item !== null && (item.prompt && (item.apiCurl || item.apiUrl))
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

  let agentInfo = '';
  // Only include agent information if agents are actually available
  if (state.agents_available && state.available_agents.length > 0) {
    const agentNames = state.available_agents.map(agent => {
      if (typeof agent === 'string') return agent;
      if (agent && typeof agent === 'object') {
        return agent.agent_name || agent.name || agent.id || 'Unknown Agent';
      }
      return 'Unknown Agent';
    });
    agentInfo = `\n\nAgent Information: ${state.available_agents.length} agent(s) available: ${agentNames.join(', ')}`;
  }
  // If no agents available, don't add any agent info to context

  const fullContext = documentContext + faqContext + agentInfo;
  console.log('📝 [createContext] Context created, length:', fullContext.length, 'characters');
  return { context: fullContext };
}

// Helper function to analyze data structure and extract key information
function analyzeDataStructure(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { fields: [], hasNestedObjects: false };
  }

  // Sample first few items to understand structure
  const sampleSize = Math.min(3, items.length);
  const samples = items.slice(0, sampleSize);
  
  // Collect all unique keys from all items
  const allKeys = new Set();
  let hasNestedObjects = false;
  
  samples.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => {
        allKeys.add(key);
        // Check if value is an object (nested)
        if (item[key] && typeof item[key] === 'object' && !Array.isArray(item[key])) {
          hasNestedObjects = true;
        }
      });
    }
  });

  // Prioritize common identifier fields
  const priorityFields = ['name', 'title', 'firstname', 'lastname', 'email', 'id', 'emp_id', 'user_id'];
  const commonFields = ['status', 'type', 'category', 'role', 'designation', 'manager', 'description'];
  
  // Find the best identifier field
  let identifierField = null;
  for (const field of priorityFields) {
    if (allKeys.has(field)) {
      identifierField = field;
      break;
    }
  }
  
  // Collect other relevant fields (excluding nested objects and arrays)
  const relevantFields = [];
  allKeys.forEach(key => {
    if (key !== identifierField) {
      const sampleValue = samples[0]?.[key];
      // Include if it's a simple value (not object/array) or if it's a common field
      if (sampleValue !== null && sampleValue !== undefined) {
        if (typeof sampleValue !== 'object' || commonFields.includes(key)) {
          relevantFields.push(key);
        }
      }
    }
  });

  return {
    identifierField,
    relevantFields: relevantFields.slice(0, 5), // Limit to 5 most relevant fields
    hasNestedObjects,
    allKeys: Array.from(allKeys)
  };
}

// Helper function to format a single item based on its structure
function formatItem(item, index, structure) {
  if (typeof item !== 'object' || item === null) {
    return `${index + 1}. ${item}`;
  }

  let formatted = `${index + 1}. `;
  
  // Get identifier value
  let identifier = '';
  if (structure.identifierField) {
    const fieldValue = item[structure.identifierField];
    if (fieldValue) {
      if (typeof fieldValue === 'object' && fieldValue.name) {
        identifier = fieldValue.name;
      } else {
        identifier = String(fieldValue);
      }
    }
  }
  
  // If no identifier found, try to construct one from common fields
  if (!identifier) {
    if (item.firstname && item.lastname) {
      identifier = `${item.firstname} ${item.lastname}`.trim();
    } else if (item.name) {
      identifier = item.name;
    } else if (item.title) {
      identifier = item.title;
    } else if (item.email) {
      identifier = item.email;
    } else if (item.id) {
      identifier = `Item ${item.id}`;
    } else {
      identifier = `Item ${index + 1}`;
    }
  }
  
  formatted += identifier;
  
  // Add relevant fields
  structure.relevantFields.forEach(field => {
    const value = item[field];
    if (value !== null && value !== undefined && value !== '') {
      let displayValue = value;
      
      // Handle nested objects (like designation.name)
      if (typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          displayValue = value.name;
        } else if (value.title) {
          displayValue = value.title;
        } else {
          displayValue = JSON.stringify(value).substring(0, 30);
        }
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        displayValue = `${value.length} item(s)`;
      }
      // Handle long strings
      else if (typeof value === 'string' && value.length > 50) {
        displayValue = value.substring(0, 50) + '...';
      }
      
      formatted += ` - ${field}: ${displayValue}`;
    }
  });
  
  return formatted;
}

// Helper function to format object response in human-readable format
function formatObjectResponse(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return String(obj);
  }

  let response = '';
  const keys = Object.keys(obj);
  
  if (keys.length === 0) {
    return 'No information available.';
  }

  // If it's a simple object with just a few fields, format it naturally
  if (keys.length <= 5) {
    const parts = [];
    keys.forEach(key => {
      let value = obj[key];
      
      // Format the value appropriately
      if (value === null || value === undefined) {
        return; // Skip null/undefined
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          value = value.name;
        } else if (value.title) {
          value = value.title;
        } else {
          value = JSON.stringify(value).substring(0, 50);
        }
      } else if (Array.isArray(value)) {
        value = `${value.length} item(s)`;
      } else if (typeof value === 'string' && value.length > 100) {
        value = value.substring(0, 100) + '...';
      }
      
      const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      parts.push(`${fieldLabel}: ${value}`);
    });
    
    if (parts.length > 0) {
      response = parts.join('. ') + '.';
    }
  } else {
    // For complex objects, show key information
    const importantFields = ['name', 'title', 'id', 'status', 'message', 'description', 'result'];
    let foundImportant = false;
    
    importantFields.forEach(field => {
      if (obj[field] !== undefined && obj[field] !== null) {
        if (!foundImportant) {
          response = `Here's what I found:\n\n`;
          foundImportant = true;
        }
        const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let value = obj[field];
        if (typeof value === 'object' && value.name) {
          value = value.name;
        }
        response += `${fieldLabel}: ${value}\n`;
      }
    });
    
    if (!foundImportant) {
      response = 'I received the information successfully.';
    }
  }

  return response || 'Information retrieved successfully.';
}

// Helper function to format array response as a readable list
function formatArrayResponse(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    return 'I couldn\'t find any results for your query.';
  }

  const count = dataArray.length;
  
  // Analyze the data structure
  const structure = analyzeDataStructure(dataArray);
  console.log('📋 [formatArrayResponse] Data structure analysis:', {
    identifierField: structure.identifierField,
    relevantFields: structure.relevantFields,
    totalItems: count
  });

  // Create a more human-readable response
  let response = '';
  
  // Start with a natural introduction
  if (count === 1) {
    response = 'I found 1 result:\n\n';
  } else {
    response = `I found ${count} results. Here they are:\n\n`;
  }

  // Format each item in a conversational way
  dataArray.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      response += `${index + 1}. ${item}\n`;
      return;
    }

    // Get the main identifier
    let mainIdentifier = '';
    if (structure.identifierField) {
      const fieldValue = item[structure.identifierField];
      if (fieldValue) {
        if (typeof fieldValue === 'object' && fieldValue.name) {
          mainIdentifier = fieldValue.name;
        } else {
          mainIdentifier = String(fieldValue);
        }
      }
    }
    
    // Fallback identifier construction
    if (!mainIdentifier) {
      if (item.firstname && item.lastname) {
        mainIdentifier = `${item.firstname} ${item.lastname}`.trim();
      } else if (item.name) {
        mainIdentifier = item.name;
      } else if (item.title) {
        mainIdentifier = item.title;
      } else if (item.email) {
        mainIdentifier = item.email;
      } else if (item.id) {
        mainIdentifier = `Item #${item.id}`;
      } else {
        mainIdentifier = `Result ${index + 1}`;
      }
    }

    // Build a natural sentence for each item
    let itemText = `${index + 1}. ${mainIdentifier}`;
    const details = [];

    // Add relevant details in a natural way
    structure.relevantFields.forEach(field => {
      const value = item[field];
      if (value !== null && value !== undefined && value !== '') {
        let displayValue = value;
        
        // Handle nested objects
        if (typeof value === 'object' && !Array.isArray(value)) {
          if (value.name) {
            displayValue = value.name;
          } else if (value.title) {
            displayValue = value.title;
          } else {
            return; // Skip complex nested objects
          }
        }
        // Handle arrays
        else if (Array.isArray(value)) {
          if (value.length > 0) {
            displayValue = `${value.length} item(s)`;
          } else {
            return; // Skip empty arrays
          }
        }
        // Handle long strings
        else if (typeof value === 'string' && value.length > 50) {
          displayValue = value.substring(0, 50) + '...';
        }
        
        // Format field name in a human-readable way
        const fieldLabel = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        details.push(`${fieldLabel}: ${displayValue}`);
      }
    });

    // Combine details naturally
    if (details.length > 0) {
      if (details.length === 1) {
        itemText += ` (${details[0]})`;
      } else if (details.length <= 3) {
        itemText += ` - ${details.join(', ')}`;
      } else {
        itemText += ` - ${details.slice(0, 3).join(', ')} and ${details.length - 3} more`;
      }
    }

    response += itemText + '\n';
  });

  // Add a friendly closing if there are many results
  if (count > 10) {
    response += `\nThese are all ${count} results I found.`;
  }

  return response.trim();
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
      // Find item with prompt and either apiCurl or apiUrl
      const apiConfig = state.dynamic_data.find(item => 
        typeof item === 'object' && item !== null && item.prompt && (item.apiCurl || item.apiUrl)
      );
      
      if (apiConfig) {
        console.log('🔀 [checkApiTrigger] Found API config with prompt:', apiConfig.prompt);
        console.log('🔀 [checkApiTrigger] API type:', apiConfig.apiCurl ? 'curl' : 'simple URL');
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
        console.log('🔀 [checkApiTrigger] No API config (prompt + apiCurl/apiUrl) found in dynamic_data');
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
    // Find API configuration from dynamic_data with prompt and either apiCurl or apiUrl
    const apiConfig = state.dynamic_data.find(item => 
      typeof item === 'object' && item !== null && item.prompt && (item.apiCurl || item.apiUrl)
    );
    
    if (!apiConfig) {
      throw new Error('No API configuration (apiCurl or apiUrl) found in dynamic_data');
    }
    
    let apiUrl, apiMethod, apiHeaders, requestBody = null;
    
    // Handle simple URL (apiUrl)
    if (apiConfig.apiUrl) {
      console.log('📡 [callExternalApi] Using simple URL:', apiConfig.apiUrl);
      apiUrl = apiConfig.apiUrl;
      apiMethod = apiConfig.method || 'GET';
      apiHeaders = apiConfig.headers || { 'Accept': 'application/json' };
      
      // For POST/PUT/PATCH with simple URL, prepare body
      const methodsWithBody = ['POST', 'PUT', 'PATCH'];
      if (methodsWithBody.includes(apiMethod)) {
        requestBody = apiConfig.body || {
          query: state.user_query,
          user_query: state.user_query,
          organisation_id: state.organisation_id,
          context: state.context,
          chat_history: state.chat_history,
        };
      }
    } 
    // Handle curl command (apiCurl)
    else if (apiConfig.apiCurl) {
      console.log('📡 [callExternalApi] Parsing curl command');
      const curlConfig = parseCurl(apiConfig.apiCurl);
      
      if (!curlConfig.url) {
        throw new Error('Could not extract URL from apiCurl');
      }
      
      apiUrl = curlConfig.url;
      apiMethod = curlConfig.method;
      apiHeaders = curlConfig.headers;
      
      // Prepare request - only add body for POST, PUT, PATCH methods
      const methodsWithBody = ['POST', 'PUT', 'PATCH'];
      
      if (methodsWithBody.includes(apiMethod)) {
        requestBody = curlConfig.body || {};
        
        // If body is a string, try to parse it, otherwise use as template
        if (typeof requestBody === 'string') {
          try {
            requestBody = JSON.parse(requestBody);
          } catch {
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
    } else {
      throw new Error('No API configuration (apiCurl or apiUrl) found in dynamic_data');
    }
    
    console.log('📡 [callExternalApi] API URL:', apiUrl);
    console.log('📡 [callExternalApi] API Method:', apiMethod);
    console.log('📡 [callExternalApi] API Headers count:', Object.keys(apiHeaders).length);
    // Log headers but mask sensitive tokens
    const headersForLog = {};
    for (const [key, value] of Object.entries(apiHeaders)) {
      if (key.toLowerCase() === 'authorization' || key.toLowerCase().includes('token')) {
        headersForLog[key] = value.substring(0, 20) + '...' + value.substring(value.length - 10);
      } else {
        headersForLog[key] = value;
      }
    }
    console.log('📡 [callExternalApi] API Headers:', JSON.stringify(headersForLog));
    
    // Verify authorization header is present
    if (apiHeaders['authorization'] || apiHeaders['Authorization']) {
      console.log('📡 [callExternalApi] ✅ Authorization token found in headers');
    } else {
      console.log('📡 [callExternalApi] ⚠️ No authorization header found');
    }
    
    console.log('📡 [callExternalApi] Making API request...');
    
    const response = await fetch(apiUrl, {
      method: apiMethod,
      headers: apiHeaders,
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
    
    // Use LLM to analyze API response and answer the user's query
    console.log('📡 [callExternalApi] Using LLM to analyze API response and answer query');
    
    let answer;
    let nameParts = []; // Declare outside for use in validation
    try {
      // Pre-filter data for person queries to speed up LLM processing
      let dataToAnalyze = apiResponse;
      const queryLower = state.user_query.toLowerCase();
      const isPersonQuery = /who is|tell me about|what is.*in|about.*in/i.test(state.user_query);
      
      if (isPersonQuery && Array.isArray(apiResponse)) {
        // Extract name parts from query
        nameParts = queryLower
          .replace(/who is|tell me about|what is|about/gi, '')
          .replace(/in|at|the|golden|eagle/gi, '')
          .trim()
          .split(/\s+/)
          .filter(part => part.length > 2);
        
        if (nameParts.length > 0) {
          console.log('📡 [callExternalApi] Person query detected, searching for:', nameParts);
          // Search for matching items
          const matches = [];
          apiResponse.forEach(item => {
            const itemText = JSON.stringify(item).toLowerCase();
            const hasMatch = nameParts.some(part => itemText.includes(part));
            if (hasMatch) {
              matches.push(item);
            }
          });
          
          if (matches.length > 0) {
            console.log('📡 [callExternalApi] Found', matches.length, 'matching items, using those for LLM');
            dataToAnalyze = matches;
          } else {
            console.log('📡 [callExternalApi] No matches found, using all data');
          }
        }
      }
      
      const chatModel = createChatModel(state.openai_api_key);
      const analysisPrompt = ChatPromptTemplate.fromMessages([
        ['system', `You are a helpful assistant. Answer the user's query DIRECTLY and CONCISELY based on the API data provided.

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. If the query asks "who is [person name]", find that person and answer ONLY about them:
   - Format: "[Name] is [role/designation] at [company]. [Key details: status, manager, etc.]"
   - DO NOT list all employees or other people
   - DO NOT show a numbered list unless specifically asked for a list

2. If the query asks for a list/count, provide a summary:
   - "There are X employees" or list the requested items only
   - DO NOT list everything unless explicitly asked

3. Search through ALL provided data to find the answer
4. Check all fields: firstname, lastname, email, manager_name, hr_manager_name, user.firstname, user.lastname, designation, status
5. Names may appear in different formats - search for partial matches
6. Be conversational, concise, and natural
7. ONLY provide the specific answer requested - nothing more
8. DO NOT output formatted lists unless the query explicitly asks for a list`],
        ['human', `User Query: {query}

API Response Data:
{apiData}

Answer the user's query directly and concisely. If asking about a specific person, provide ONLY information about that person. Do NOT list all items.`]
      ]);
      
      // Prepare data for LLM - use filtered data if available
      let apiDataForLLM = JSON.stringify(dataToAnalyze);
      const maxLength = 50000; // Reasonable limit for performance
      
      if (apiDataForLLM.length > maxLength) {
        console.log('📡 [callExternalApi] Data is large (' + apiDataForLLM.length + ' chars), truncating');
        if (Array.isArray(dataToAnalyze)) {
          // If we have filtered matches, send all of them (up to limit)
          if (dataToAnalyze.length <= 50) {
            apiDataForLLM = JSON.stringify(dataToAnalyze);
          } else {
            // Send first 50 matches
            const sample = dataToAnalyze.slice(0, 50);
            apiDataForLLM = JSON.stringify({
              total_matches: dataToAnalyze.length,
              data: sample,
              note: `Showing ${sample.length} of ${dataToAnalyze.length} matches`
            });
          }
        } else {
          apiDataForLLM = apiDataForLLM.substring(0, maxLength);
        }
      } else {
        console.log('📡 [callExternalApi] Sending', Array.isArray(dataToAnalyze) ? dataToAnalyze.length + ' items' : 'data', 'to LLM');
      }
      
      const analysisChain = analysisPrompt.pipe(chatModel);
      const llmResponse = await analysisChain.invoke({
        query: state.user_query,
        apiData: apiDataForLLM
      });
      
      answer = llmResponse.content?.trim();
      console.log('📡 [callExternalApi] LLM generated answer:', answer?.substring(0, 100) + '...');
      
      // Validate LLM answer - reject if it looks like a full list
      if (!answer || answer.trim().length === 0) {
        console.log('📡 [callExternalApi] LLM returned empty answer, falling back to formatting');
        answer = formatArrayResponse(Array.isArray(apiResponse) ? apiResponse : (apiResponse.data || apiResponse.results || []));
      } else if (answer.includes('I found') && answer.includes('results') && answer.split('\n').length > 10) {
        // If LLM returned a full list, try to extract just the answer
        console.log('📡 [callExternalApi] LLM returned a list, extracting concise answer');
        // For person queries, try to find the person info in the response
        if (isPersonQuery) {
          const lines = answer.split('\n');
          const personLine = lines.find(line => 
            nameParts.some(part => line.toLowerCase().includes(part))
          );
          if (personLine) {
            answer = personLine.replace(/^\d+\.\s*/, '').trim();
          }
        }
      }
    } catch (llmError) {
      console.error('📡 [callExternalApi] Error using LLM to analyze response:', llmError);
      console.log('📡 [callExternalApi] Falling back to direct formatting');
      
      // Fallback to direct formatting if LLM fails
      answer = apiResponse.answer || apiResponse.response || apiResponse.data?.answer || apiResponse.message || apiResponse.text;
      
      if (!answer) {
        if (typeof apiResponse === 'string') {
          answer = apiResponse;
        } else if (Array.isArray(apiResponse)) {
          answer = formatArrayResponse(apiResponse);
        } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
          answer = formatArrayResponse(apiResponse.data);
        } else if (apiResponse.results && Array.isArray(apiResponse.results)) {
          answer = formatArrayResponse(apiResponse.results);
        } else {
          answer = formatObjectResponse(apiResponse);
        }
      } else if (Array.isArray(answer)) {
        answer = formatArrayResponse(answer);
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
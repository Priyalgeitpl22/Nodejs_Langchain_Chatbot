import axios from 'axios';

/**
 * Parse a curl command string and extract URL, method, headers, and body
 */
function parseCurl(curlCommand) {
  try {
    // Remove extra whitespace and newlines
    const cleaned = curlCommand.trim().replace(/\s+/g, ' ');
    
    // Extract URL (look for http:// or https://)
    const urlMatch = cleaned.match(/https?:\/\/[^\s'"]+/);
    if (!urlMatch) {
      return null;
    }
    const url = urlMatch[0];

    // Extract method (default to GET if not specified)
    let method = 'GET';
    if (cleaned.includes('-X POST') || cleaned.includes('--request POST')) {
      method = 'POST';
    } else if (cleaned.includes('-X PUT') || cleaned.includes('--request PUT')) {
      method = 'PUT';
    } else if (cleaned.includes('-X DELETE') || cleaned.includes('--request DELETE')) {
      method = 'DELETE';
    } else if (cleaned.includes('-X PATCH') || cleaned.includes('--request PATCH')) {
      method = 'PATCH';
    }

    // Extract headers
    const headers = {};
    const headerMatches = cleaned.matchAll(/-H\s+['"]([^'"]+)['"]|--header\s+['"]([^'"]+)['"]/g);
    for (const match of headerMatches) {
      const headerValue = match[1] || match[2];
      const [key, ...valueParts] = headerValue.split(':');
      if (key && valueParts.length > 0) {
        headers[key.trim()] = valueParts.join(':').trim();
      }
    }

    // Extract body data
    let body = undefined;
    const dataMatch = cleaned.match(/-d\s+['"]([^'"]+)['"]|--data\s+['"]([^'"]+)['"]|--data-raw\s+['"]([^'"]+)['"]/);
    if (dataMatch) {
      const dataString = dataMatch[1] || dataMatch[2] || dataMatch[3];
      try {
        body = JSON.parse(dataString);
      } catch {
        body = dataString;
      }
    }

    return { url, method, headers, body };
  } catch (error) {
    console.error('Error parsing curl command:', error);
    return null;
  }
}

/**
 * Construct curl command from URL, method, headers, and body
 */
function constructCurl(url, method = 'GET', headers = {}, body = null) {
  let curl = `curl -X ${method}`;
  
  // Add headers
  for (const [key, value] of Object.entries(headers)) {
    curl += ` -H "${key}: ${value}"`;
  }
  
  // Add body if present
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    curl += ` -d '${bodyStr}'`;
  }
  
  curl += ` "${url}"`;
  return curl;
}

/**
 * Extract tool configuration from user input using AI
 * This function uses OpenAI to extract structured information from natural language
 */
async function extractToolConfiguration(userInput, openaiApiKey) {
  const { ChatOpenAI } = await import('@langchain/openai');
  const { ChatPromptTemplate } = await import('@langchain/core/prompts');
  const { JsonOutputParser } = await import('@langchain/core/output_parsers');
  
  const extractionPrompt = `
You are a tool configuration extraction assistant. Extract tool configuration details from the user's input.

The user wants to configure a tool/API. Extract the following information:
1. **prompt**: A clear description of what this tool/API does (e.g., "Get pricing details for xyz product")
2. **url**: The API endpoint URL
3. **method**: HTTP method (GET, POST, PUT, DELETE, PATCH) - default to GET if not specified
4. **headers**: Any headers needed (especially Authorization tokens, API keys, etc.)
5. **body**: Request body if needed (for POST/PUT/PATCH requests)

User Input: {input}

Extract the information and return ONLY valid JSON in this format:
{{
  "hasToolConfig": true/false,
  "prompt": "description of what the tool does",
  "url": "https://api.example.com/endpoint",
  "method": "GET",
  "headers": {{
    "Authorization": "Bearer token_here",
    "Content-Type": "application/json"
  }},
  "body": null or the request body object
}}

If the user input does NOT contain tool configuration information, return:
{{
  "hasToolConfig": false
}}

Return ONLY the JSON, no additional text.
`;

  try {
    const chatModel = new ChatOpenAI({
      apiKey: openaiApiKey,
      model: 'gpt-4o',
      temperature: 0,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', extractionPrompt],
    ]);

    const chain = prompt.pipe(chatModel).pipe(new JsonOutputParser());
    const result = await chain.invoke({ input: userInput });

    return result;
  } catch (error) {
    console.error('Error extracting tool configuration:', error);
    return { hasToolConfig: false };
  }
}

/**
 * Validate API endpoint by making a test request
 */
async function validateApiEndpoint(parsedCurl) {
  try {
    // Validate URL format
    try {
      new URL(parsedCurl.url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Make a test request with timeout
    const config = {
      method: parsedCurl.method,
      url: parsedCurl.url,
      headers: {
        ...parsedCurl.headers,
        'User-Agent': 'ToolConfiguration-Validator/1.0',
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status < 500, // Accept any status < 500 as valid
    };

    if (parsedCurl.body && (parsedCurl.method === 'POST' || parsedCurl.method === 'PUT' || parsedCurl.method === 'PATCH')) {
      config.data = parsedCurl.body;
    }

    const response = await axios(config);
    
    // If we get a response (even if it's an error status), the endpoint is reachable
    return { valid: true };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { valid: false, error: 'Cannot reach API endpoint. Connection refused or host not found.' };
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return { valid: false, error: 'API endpoint request timed out.' };
    } else if (error.response) {
      // Got a response, so endpoint is reachable (even if it returned an error)
      return { valid: true };
    } else {
      return { valid: false, error: `API validation failed: ${error.message}` };
    }
  }
}

/**
 * Save tool configuration to database via backend API
 */
async function saveToolConfiguration(toolConfig, orgId, userId, backendApiUrl, authToken = null) {
  try {
    // Construct curl command from extracted data
    const curlCommand = constructCurl(
      toolConfig.url,
      toolConfig.method || 'GET',
      toolConfig.headers || {},
      toolConfig.body
    );

    // Validate the API endpoint
    const parsedCurl = parseCurl(curlCommand);
    if (!parsedCurl) {
      return { success: false, error: 'Failed to parse curl command' };
    }

    const validation = await validateApiEndpoint(parsedCurl);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Prepare request headers
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authorization if provided
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Save to database via backend API
    // The backend expects: { prompts: [{ prompt, apiCurl, orgId }] }
    // And it will use req.user.id for userId if authenticated
    const requestBody = {
      prompts: [{
        prompt: toolConfig.prompt,
        apiCurl: curlCommand,
        orgId: orgId,
        userId: userId, // Pass userId in body if backend supports it
      }],
    };

    const response = await axios.post(
      `${backendApiUrl}/api/dynamic-data/create`,
      requestBody,
      { headers }
    );

    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error saving tool configuration:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to save tool configuration';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export {
  parseCurl,
  constructCurl,
  extractToolConfiguration,
  validateApiEndpoint,
  saveToolConfiguration,
};


import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';

config(); // Load ANTHROPIC_API_KEY from .env

const CLAUDE_PROMPT = `You are a documentation converter that transforms JSDoc-style documentation into Lua code documentation.
Your task is to convert the provided JSON documentation into Lua code with type annotations.

Rules:
1. Use ---@type for type annotations
2. Use ---@param for function parameters
3. Use ---@return for return values
4. Generate table definitions for classes/interfaces
5. Convert enums into Lua tables with numeric values
6. Preserve all descriptions and comments
7. Follow LuaLS (Lua Language Server) annotation format

Input will be JSDoc JSON format. Output should be valid Lua code with annotations.

Example Input:
{
  "name": "Api",
  "description": "Main API",
  "type": "namespace",
  "fields": [
    {
      "name": "Version",
      "type": "integer",
      "description": "API version number"
    }
  ]
}

Example Output:
---Main API
---@class Api
Api = {
    ---@type integer API version number
    Version = nil
}

Now process the following documentation:
`;

async function main() {
    try {
        // Read all JSON files from docs/json
        const files = await fs.readdir('docs/json');
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        for (const file of jsonFiles) {
            const content = await fs.readFile(path.join('docs/json', file), 'utf-8');
            const docData = JSON.parse(content);

            // Here you would make the API call to Claude with CLAUDE_PROMPT + JSON.stringify(docData)
            // For now, we'll just write a placeholder
            const luaContent = `-- TODO: Replace with actual Claude API call
-- Input: ${JSON.stringify(docData, null, 2)}`;

            const outFile = path.join('docs/lua', file.replace('.json', '.lua'));
            await fs.mkdir('docs/lua', { recursive: true });
            await fs.writeFile(outFile, luaContent, 'utf-8');
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main(); 
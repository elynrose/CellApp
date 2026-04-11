/**
 * Tool-use helpers for cell text generation: instruction text + parsing model output.
 */

export const CELL_TOOLS_INSTRUCTION = `

## Tools (optional)
If you need external actions, output ONE OR MORE JSON tool calls in separate fenced blocks like:
\`\`\`json
{"tool":"tavily_search","args":{"query":"your search query","max_results":5}}
\`\`\`

Available tools (only those the user enabled for this card):
- tavily_search — args: query (string), max_results (optional number, default 5)
- send_email — args: to (email), subject (string), text (string), html (optional)
- telegram_send_message — args: chat_id (string, optional if user set default), text (string)
- twilio_send_sms — args: to (E.164 phone), body (string)

After tools run, you will receive TOOL RESULTS and must write the final answer for the user (no more tool blocks unless strictly needed).
`;

/**
 * Extract JSON objects from model output that look like tool calls.
 * @returns {{ tool: string, args: object }[]}
 */
export function parseToolCallsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(text)) !== null) {
    const raw = m[1].trim();
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && obj.tool) {
        out.push({ tool: String(obj.tool), args: obj.args && typeof obj.args === 'object' ? obj.args : {} });
      } else if (obj && typeof obj === 'object' && obj.action) {
        out.push({ tool: String(obj.action), args: obj });
      }
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * Map tool name to enabled flag on cell.enabledTools
 */
export function isToolAllowedForCell(cell, toolName) {
  const t = String(toolName || '').toLowerCase().replace(/-/g, '_');
  const map = {
    tavily_search: 'tavily',
    research: 'tavily',
    web_search: 'tavily',
    send_email: 'email',
    email: 'email',
    telegram_send_message: 'telegram',
    telegram: 'telegram',
    twilio_send_sms: 'twilioSms',
    sms: 'twilioSms',
    send_sms: 'twilioSms'
  };
  const key = map[t] || t;
  const en = cell?.enabledTools;
  if (!en || typeof en !== 'object') return false;
  return !!en[key];
}

export function cellWantsTools(cell) {
  return !!cell?.enableTools;
}

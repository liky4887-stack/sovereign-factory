// Kimi Connect RPC protocol — frame encoder/decoder + event-op parser.
//
// Request body framing (Connect over HTTP with JSON):
//   [1 byte flags=0x00][4 bytes big-endian length][JSON payload]
//
// Response is a stream of frames in the same format. Each frame's
// payload is a JSON "event op" — a chat mutation or a heartbeat.
//
// Events we care about:
//   {"op":"append","mask":"block.text.content","block":{"text":{"content":"..."}}}
//   {"op":"append","mask":"block.think.content","block":{"think":{"content":"..."}}}
//   {"eventOffset":N,"done":{}}
//   {"eventOffset":N,"heartbeat":{}}

export interface ConnectFrame {
  flags: number;
  payload: Buffer;
}

export function encodeConnectFrame(jsonString: string): Buffer {
  const payload = Buffer.from(jsonString, 'utf8');
  const header = Buffer.alloc(5);
  header.writeUInt8(0x00, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

export function decodeConnectFrames(buffer: Buffer): { frames: ConnectFrame[]; remainder: Buffer } {
  const frames: ConnectFrame[] = [];
  let offset = 0;
  while (offset + 5 <= buffer.length) {
    const flags = buffer.readUInt8(offset);
    const length = buffer.readUInt32BE(offset + 1);
    if (offset + 5 + length > buffer.length) break;
    const payload = buffer.subarray(offset + 5, offset + 5 + length);
    frames.push({ flags, payload });
    offset += 5 + length;
  }
  return { frames, remainder: buffer.subarray(offset) };
}

export interface KimiEventOp {
  op?: string;
  mask?: string;
  block?: any;
  chat?: any;
  message?: any;
  eventOffset?: number;
  done?: any;
  heartbeat?: any;
  [k: string]: any;
}

export function parseEventOp(payload: Buffer): KimiEventOp | null {
  try { return JSON.parse(payload.toString('utf8')); }
  catch { return null; }
}

export interface KimiStreamState {
  text: string;
  thinking: string;
  chatId: string | null;
  messageId: string | null;
  done: boolean;
}

export function newStreamState(): KimiStreamState {
  return { text: '', thinking: '', chatId: null, messageId: null, done: false };
}

export function applyEventOp(
  op: KimiEventOp,
  state: KimiStreamState,
): { deltaText: string; deltaThink: string } {
  const beforeText = state.text.length;
  const beforeThink = state.thinking.length;

  if (op.chat && typeof op.chat.id === 'string' && !state.chatId) {
    state.chatId = op.chat.id;
  }
  if (
    op.message &&
    op.message.role === 'assistant' &&
    typeof op.message.id === 'string' &&
    !state.messageId
  ) {
    state.messageId = op.message.id;
  }
  if (op.done) state.done = true;

  const b = op.block;
  if (b) {
    if (
      op.op === 'append' &&
      op.mask === 'block.text.content' &&
      b.text &&
      typeof b.text.content === 'string'
    ) {
      state.text += b.text.content;
    }
    if (
      op.op === 'set' &&
      op.mask === 'block.text' &&
      b.text &&
      typeof b.text.content === 'string'
    ) {
      state.text = b.text.content;
    }
    if (
      op.op === 'append' &&
      op.mask === 'block.think.content' &&
      b.think &&
      typeof b.think.content === 'string'
    ) {
      state.thinking += b.think.content;
    }
    if (
      op.op === 'set' &&
      op.mask === 'block.think' &&
      b.think &&
      typeof b.think.content === 'string'
    ) {
      state.thinking = b.think.content;
    }
  }

  return {
    deltaText: state.text.slice(beforeText),
    deltaThink: state.thinking.slice(beforeThink),
  };
}

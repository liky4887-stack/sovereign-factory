import { readFileSync, existsSync } from 'node:fs';
import { DeepSeekPowError } from '../models/DeepSeekErrors';

interface WasmMemoryLike { buffer: ArrayBuffer; }
interface WasmExports {
  memory: WasmMemoryLike;
  wasm_solve: (
    retPtr: number,
    chalPtr: number,
    chalLen: number,
    pfxPtr: number,
    pfxLen: number,
    difficulty: number,
  ) => void;
  __wbindgen_export_0: (size: number, align: number) => number;
  __wbindgen_add_to_stack_pointer: (delta: number) => number;
}
interface WasmInstanceLike { exports: unknown; }
interface WasmModuleLike { instance: WasmInstanceLike; module: unknown; }
interface WasmGlobal { instantiate(bytes: Uint8Array): Promise<WasmModuleLike>; }

function getWasm(): WasmGlobal {
  const g = globalThis as unknown as { WebAssembly?: WasmGlobal };
  if (!g.WebAssembly || typeof g.WebAssembly.instantiate !== 'function') {
    throw new DeepSeekPowError('WebAssembly not available in this runtime');
  }
  return g.WebAssembly;
}

export class PowSolver {
  private exports: WasmExports | null = null;
  private loading: Promise<WasmExports> | null = null;

  constructor(private readonly wasmPath: string) {}

  isReady(): boolean { return this.exports !== null; }
  wasmExists(): boolean { return existsSync(this.wasmPath); }
  getWasmPath(): string { return this.wasmPath; }

  private async load(): Promise<WasmExports> {
    if (this.exports) return this.exports;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (!existsSync(this.wasmPath)) throw new DeepSeekPowError('WASM not found at ' + this.wasmPath);
      const bytes = readFileSync(this.wasmPath);
      const wasm = getWasm();
      const result = await wasm.instantiate(bytes);
      const ex = result.instance.exports as WasmExports;
      if (!ex || typeof ex.wasm_solve !== 'function' || typeof ex.__wbindgen_export_0 !== 'function') {
        throw new DeepSeekPowError('WASM missing exports');
      }
      if (typeof ex.__wbindgen_add_to_stack_pointer !== 'function') {
        throw new DeepSeekPowError('WASM missing __wbindgen_add_to_stack_pointer');
      }
      this.exports = ex;
      return ex;
    })();
    try { return await this.loading; } finally { this.loading = null; }
  }

  async solve(challenge: string, salt: string, expireAt: number, difficulty: number): Promise<number> {
    const ex = await this.load();
    const prefix = salt + '_' + expireAt + '_';
    const chalBytes = Buffer.from(challenge, 'utf8');
    const pfxBytes = Buffer.from(prefix, 'utf8');

    // Allocate return area on the wasm stack (matches reference impl).
    const retPtr  = ex.__wbindgen_add_to_stack_pointer(-16);
    const chalPtr = ex.__wbindgen_export_0(Math.max(chalBytes.length, 1), 1);
    const pfxPtr  = ex.__wbindgen_export_0(Math.max(pfxBytes.length, 1), 1);

    new Uint8Array(ex.memory.buffer).set(chalBytes, chalPtr);
    new Uint8Array(ex.memory.buffer).set(pfxBytes,  pfxPtr);

    let status = -1;
    let nonce = 0;
    try {
      ex.wasm_solve(retPtr, chalPtr, chalBytes.length, pfxPtr, pfxBytes.length, difficulty);
      const dv = new DataView(ex.memory.buffer);
      status = dv.getInt32(retPtr + 0, true);
      nonce  = dv.getFloat64(retPtr + 8, true);
    } finally {
      // Always restore the stack pointer, even on throw.
      ex.__wbindgen_add_to_stack_pointer(16);
    }

    // Reference semantics: status 0 = failed to find nonce within difficulty.
    if (status === 0) {
      throw new DeepSeekPowError('wasm_solve returned status=0 (no nonce found within difficulty=' + difficulty + ')');
    }
    return Math.floor(nonce);
  }
}

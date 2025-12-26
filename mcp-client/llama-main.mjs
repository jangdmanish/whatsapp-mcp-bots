// main.mjs
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create worker that will run node-llama-cpp
const worker = new Worker(
  new URL("./llm-worker.mjs", import.meta.url),
  { type: "module" }
);

// Simple ID generator for matching responses to requests
let nextId = 1;
const pending = new Map();

/**
 * Send a prompt to the worker and get back a Promise with the reply.
 */
export default function askLlama(prompt) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: "prompt", id, prompt });
  });
}

// Handle messages from the worker
worker.on("message", (msg) => {
  if (msg.type === "result") {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.resolve(msg.text);
    }
  } else if (msg.type === "error") {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.reject(new Error(msg.error));
    } else {
      console.error("Worker error:", msg.error);
    }
  } else if (msg.type === "log") {
    console.log("[worker]", msg.message);
  }
});

worker.on("error", (err) => {
  console.error("Worker thread error:", err);
});

worker.on("exit", (code) => {
  console.log("Worker exited with code", code);
});

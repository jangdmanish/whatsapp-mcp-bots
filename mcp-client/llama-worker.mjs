// llama-worker.mjs
import { parentPort } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { InferenceClient } from "@huggingface/inference";
import { Infer } from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sessionPromise = null;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      parentPort?.postMessage({
        type: "log",
        message: "Initializing llama model in worker..."
      });

      const llama = await getLlama();
      const model = await llama.loadModel({
        modelPath: path.join(
          __dirname,
          "../models",
          "llama-3.2-1b-instruct-q8_0.gguf" // <-- change to your model file
        )
      });

      const context = await model.createContext();
      const session = new LlamaChatSession({
        contextSequence: context.getSequence()
      });

      parentPort?.postMessage({
        type: "log",
        message: "Model loaded and session ready."
      });

      return client;
    })().catch((err) => {
      // If init failed, allow retry on next call
      sessionPromise = null;
      throw err;
    });
  }

  return sessionPromise;
}

// Handle prompts from main thread
parentPort?.on("message", async (msg) => {
  if (msg.type !== "prompt") return;
  const { id, prompt } = msg;

  try {
    const session = await getSession();
    const answer = await session.prompt(prompt);
    parentPort?.postMessage({
      type: "result",
      id,
      text: answer
    });
  } catch (err) {
    parentPort?.postMessage({
      type: "error",
      id,
      error: String(err)
    });
  }
});

/**
 * Kokoro runs here, in its own thread, so making speech never holds up the game: votes, rolls
 * and every other message keep flowing while a line is being made. The model gets fewer threads
 * than the PC has cores, leaving room for the server and the browser windows.
 */
import { availableParallelism } from "node:os";
import { parentPort, workerData } from "node:worker_threads";
import { AutoTokenizer, StyleTextToSpeech2Model, env } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";

interface Job {
  id: number;
  text: string;
  voice: string;
  speed: number;
}

const { modelDir } = workerData as { modelDir: string };
env.localModelPath = modelDir;
env.allowRemoteModels = false;

const threads = Math.max(1, availableParallelism() - 2);
const ready = (async () => {
  const model = await StyleTextToSpeech2Model.from_pretrained("kokoro", { dtype: "q8", device: "cpu", session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 } });
  const tokenizer = await AutoTokenizer.from_pretrained("kokoro");
  return new KokoroTTS(model, tokenizer);
})();

ready.then(
  () => parentPort!.postMessage({ type: "ready", threads }),
  (err: Error) => parentPort!.postMessage({ type: "failed", message: err.message }),
);

parentPort!.on("message", async (job: Job) => {
  try {
    const tts = await ready;
    const started = performance.now();
    const audio = await tts.generate(job.text, { voice: job.voice as never, speed: job.speed });
    const wav = audio.toWav();
    const seconds = audio.audio.length / audio.sampling_rate;
    parentPort!.postMessage({ type: "done", id: job.id, wav, ms: performance.now() - started, seconds }, [wav]);
  } catch (err) {
    parentPort!.postMessage({ type: "error", id: job.id, message: (err as Error).message });
  }
});

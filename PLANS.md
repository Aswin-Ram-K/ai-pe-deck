# Plans — Aswin Ram Kalugasala Moorthy
**Compiled:** 2026-05-15
**Context:** Post-ECE-563 Spring semester. Summer ahead. Internship applications immediate; project work follows.

---

## Skill Inventory

### What exists (from the ai-pe-deck project + ECE background)

| Skill | Depth | Transfers to |
|---|---|---|
| JavaScript / React (no-build) | Strong | Local inference UIs, IoT dashboards |
| GLSL shaders / GPU-side computation | Strong | GPU memory model, compute vs. memory-bound reasoning for inference optimization |
| WebRTC / real-time architecture | Strong | IoT event pipelines, local inference serving |
| WebAudio / signal processing concepts | Solid | Quantization error reasoning, stability analysis |
| Clean systems design (single choke points, transport-independent layers) | Strong | ML inference serving, IoT firmware architecture |
| Debugging methodology (root cause over symptom) | Strong | Universally applicable |
| Express.js / Node backend | Solid | Local inference API servers |
| Git discipline (scoped, terse commits) | Strong | Open-source contribution readiness |
| Power electronics + AI/ML control theory | Academic | Domain context for AI deployment in physical systems |
| Control logic fundamentals | Academic | Background context |

### Gaps to close

| Gap | Priority | How |
|---|---|---|
| Python | Highest — blocks everything | Use it for every ML/IoT task this summer; no JS fallback |
| ML toolchain stack (llama.cpp, vLLM, quantization) | High | Items 5–9 below |
| CUDA / GPU compute beyond GLSL | Medium | Mental model first; CUDA later if needed |
| MQTT / embedded IoT protocols | Medium | Items 12–14 below |
| AI evaluation methodology | High | Items 1–3 below |

---

## Sprint — Internship Applications (Next 2 Days)

Get applications out now for summer internships. Target roles:
- AI/ML evaluation, red-teaming, deployment testing
- Local inference / edge ML optimization
- IoT / embedded ML

**Day 1**
- Build job data pipeline: scrape or pull from Indeed/Greenhouse/Lever APIs, normalize to JSON, store locally (SQLite is fine)
- Set up Claude API integration (Anthropic SDK, prompt caching on base resume + instructions, vary only JD per call) to score role match and tailor resume bullets per JD
- Draft base resume if not current

**Day 2**
- Run tailored applications through the pipeline — 10–15 applications, each genuinely tailored, not bulk-blasted
- Draft cover letter paragraph template (150 words, customized per role via Claude API)
- Set up a basic tracking table: company / role / date / status

**Target companies** (starting point — expand from the pipeline output):
- Anthropic, OpenAI, Scale AI (evals/red-teaming)
- METR (formerly ARC Evals), Apollo Research, UK AISI (AI safety / deployment testing)
- Hugging Face, Ollama, Together AI (local inference / optimization)
- Any startup in the local LLM / edge AI space

---

## Summer Plan

Three active clusters + one deferred. All tied by a single through-line:
> Local models running on your own hardware, evaluated rigorously, integrated with real-world sensor data, contributed back to the open-source ecosystem.

---

### Cluster 1 — AGI Deployment & Evaluation Testing

**1. Learn the evaluation frameworks properly**
EleutherAI `lm-evaluation-harness` is the standard. Run it locally, read the source, understand how tasks are defined, how few-shot prompting is standardized, how metrics are computed. Then look at HELM and OpenAI Evals. Goal: understand what a rigorous eval harness looks like so you can write one or contribute to one.

**2. Study the technical side of AI safety / alignment**
Not the philosophy — the engineering. RLHF, Constitutional AI, reward modeling, interpretability basics (circuits, superposition, SAE features). Sources: Anthropic's published work, Redwood Research papers, METR's public reports. This is the actual background for deployment testing roles.

**3. Build a red-teaming / adversarial testing mini-framework**
A structured test harness for a local model: capability elicitation probes, out-of-distribution inputs, adversarial prompts, behavioral edge cases. Document what the model does and doesn't do reliably. Open-source it. A public repo with rigorous methodology is a stronger signal than a resume line.

**4. Map the deployment testing ecosystem**
Who's doing this work: Anthropic (internal evals), Scale AI (data + red-teaming), METR, Apollo Research, Conjecture, UK AISI. What roles exist, what they require day-to-day, what the open problems are. One week of deliberate research here changes how you position every application and conversation.

---

### Cluster 2 — Local ML Inference & Training Optimization

**5. Run the full local inference stack, then go under the hood**
Start with Ollama or llama.cpp — get a model running locally. Then stop using the CLI and read the source. Understand the GGUF format, how quantization is applied at load time, how the KV cache works, how batching decisions affect throughput. Goal: be able to explain what happens between "model file on disk" and "token appears on screen."

**6. Deep dive on quantization**
INT4 / INT8 / FP16 tradeoffs, perplexity vs. speed vs. memory tradeoffs, GPTQ vs. AWQ vs. GGUF approaches, how calibration datasets affect output quality. One of the most active areas in local inference optimization — direct contribution paths exist in llama.cpp, MLX, and bitsandbytes.

**7. Fine-tune a model with LoRA / QLoRA on local hardware**
Pick a small base model (Phi-3 Mini, Gemma 2B, or Qwen2-1.5B), a dataset relevant to something you care about, run a LoRA fine-tune. Understand what's being trained (the adapter matrices), what rank controls, how gradient checkpointing reduces memory, what the tradeoffs are. Practical foundation for understanding training optimization.

**8. Understand inference serving architecture**
vLLM's PagedAttention, continuous batching, KV cache management. Read the original vLLM paper alongside the source. Goal: understand *why* it's 20× faster than naive serving — that framing makes every optimization decision intuitive rather than cargo-culted.

**9. GPU compute mental model**
You already have this partially from GLSL. Extend it: memory bandwidth limits, compute-bound vs. memory-bound operations, why attention is memory-bound and why FlashAttention matters, tensor parallelism basics. No CUDA required to internalize this — the reasoning transfers from your existing GPU shader work.

---

### Cluster 3 — Open Source Contributions

**10. Make one meaningful contribution to llama.cpp, MLX, or lm-evaluation-harness**
Not documentation. A bug fix, a new quantization test case, a new eval task, a performance improvement. These projects have active maintainers who give detailed PR feedback — the review process alone is worth more than most tutorials. Start with issues tagged `good first issue` or `help wanted`.

**11. Build and open-source one small tool that fills a real gap**
While using local inference tools, friction points will emerge that don't have clean solutions yet. Build the thing: a structured benchmark runner, a quantization quality comparison tool, a local eval harness for a specific domain. Small, well-documented, solves a real problem. The embedded + ML world is still small enough that useful tools get noticed.

---

### Cluster 4 — IoT Connected Living

**12. Set up a proper home lab**
Raspberry Pi as hub, ESP32 nodes with sensors (temperature, humidity, motion, air quality). MQTT as the message bus, Home Assistant or a custom dashboard on top. ESPHome makes ESP32 firmware fast to iterate. Get the physical layer running before building anything on top of it.

**13. Run local inference on IoT data**
A small quantized model (or ONNX) running locally that does something useful with sensor data — anomaly detection, pattern recognition, natural language querying of home state. Edge inference on constrained hardware, real sensor inputs, local-only. This is where all three clusters converge: local ML optimization + real hardware + open-source tooling.

**14. Build the real-time web dashboard**
WebSocket or SSE from the MQTT broker to the browser. No-build React + Express — your existing architecture from the deck maps directly here. Full stack visible layer: sensors → edge processing → local ML → real-time web UI. This becomes the demo artifact that ties the whole summer together.

---

### General Progression

**15. Write publicly about what you're building — consistently**
One post per project milestone, not per project completion. The local inference stack, quantization experiments, IoT setup, eval framework. The AGI deployment and local ML communities are active on Substack, GitHub discussions, and Hugging Face forums. Consistent public writing in a niche is how you become a recognizable name before you have credentials. It also forces you to understand things well enough to explain them, which is the fastest way to learn.

---

## Deferred — Research Paper

**Topic direction:** AI on hardware — local ML inference and training optimization on constrained/edge devices. Intersection of the local inference stack (Cluster 2) and IoT hardware (Cluster 4).

**Not planned yet.** Pick this up after the summer projects have given you original observations and experimental data to write from. The systematic paper reading program (one paper per week, structured notes in a personal knowledge base) runs in parallel all summer and feeds this when the time comes.

---

## Sequencing

```
Days 1–2    Internship sprint (applications out)
Week 1–2    Python foundation + run local inference stack (item 5)
Week 2–4    Quantization deep dive (item 6) + home lab physical setup (item 12)
Month 2     Fine-tuning (item 7) + inference serving architecture (item 8) + first open-source contribution (item 10)
Month 2–3   Red-teaming framework (item 3) + IoT inference integration (item 13)
Month 3     Dashboard (item 14) + second contribution or own tool (item 11)
Ongoing     Paper reading, public writing (items 4, 15), ecosystem mapping (item 4)
Deferred    Research paper — after summer projects generate material
```

---

## Notes

- Python is the single highest-priority gap. Use it for every task this summer. No JS fallback.
- The GPU mental model from GLSL is a real advantage in the inference optimization space — don't undersell it.
- The deployment testing and local inference communities overlap heavily with open-source. Contributions and public writing compound into both.
- IoT dashboard (item 14) is the visible, demo-able artifact that ties the whole summer together for portfolio and interview purposes.

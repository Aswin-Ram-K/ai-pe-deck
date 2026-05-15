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

---

## Hardware Projects

---

### Project A — Headless Signal Hacking Box

A headless open-source Linux device packed with every radio protocol needed for signal research and security work. Paired with a custom LineageOS Android phone as the remote control and display surface.

#### Base platform
**Raspberry Pi 5 8GB** — $80
- Built-in 802.11ac Wi-Fi + BT 5.0 (Infineon CYW43455)
- PCIe M.2 slot (NVMe boot drive via M.2 HAT+)
- 40-pin GPIO (backward-compatible with all Pi 4 HATs)
- USB gadget mode (Raspberry Pi OS Trixie+): Pi appears as USB Ethernet adapter to the phone over a single USB-C cable
- 4x USB ports (2x USB 3.0 + 2x USB 2.0); powered USB hub recommended for HackRF + Alfa + Proxmark3

Fallback SBC if compute-heavy GNU Radio DSP is the priority: **Orange Pi 5 Plus (RK3588)** — 8-core including 4x Cortex-A76, better raw DSP headroom, Wi-Fi 6 on some variants, but smaller community.

#### Radio module stack

| Protocol | Hardware | Interface | Cost |
|---|---|---|---|
| Sub-GHz ISM TX/RX (300–928 MHz) | CC1101 SPI module | SPI + 2x GPIO | ~$8 |
| Wideband SDR TX/RX (100 kHz–6 GHz) | HackRF Pro | USB | $400 |
| NFC read/write (13.56 MHz) | Waveshare PN532 NFC HAT | I2C (leaves SPI free for CC1101) | ~$15 |
| 125 kHz RFID (read/write/clone/emulate) | Proxmark3 Easy V3 + Iceman firmware | USB | ~$50 |
| IR TX/RX | TSAL6200 LED + TSOP38238 receiver, GPIO-driven, LIRC | 2x GPIO | <$5 |
| Wi-Fi monitor mode + injection | Alfa AWUS036ACM (MT7612U — in kernel since 4.19, zero driver friction) | USB 3.0 | ~$40 |
| BLE hacking | Built-in Pi 5 BT 5.0 + BlueZ + bettercap | Onboard | $0 |

**Total estimated hardware cost: ~$600–620 USD** (not including case, power supply, NVMe, USB hub)

#### Hardware notes
- **HackRF Pro vs HackRF One:** Pro extends lower bound from 1 MHz to 100 kHz (covers LF/MF/HF), adds TCXO (1 PPM), USB-C, improved dynamic range. $60 premium is worth it.
- **LimeSDR Mini 2.0 ($399) as alternative to HackRF Pro:** Full-duplex simultaneous TX+RX (HackRF is half-duplex only), 12-bit ADC, 40 MHz bandwidth, open-source FPGA (Lattice ECP5 via yosys/nextpnr). Caps at 3.5 GHz — misses 5 GHz Wi-Fi and upper cellular bands. Choose LimeSDR if simultaneous TX+RX experiments are planned; HackRF Pro if frequency coverage breadth matters more.
- **CC1101 vs YARD Stick One:** YARD Stick One uses the same CC1111 chipset (CC1101 + 8051 MCU). No advantage over a bare CC1101 SPI module on a Pi — skip it.
- **Alfa AWUS036ACM vs AWUS036ACH:** ACM uses MT7612U (in-kernel, zero maintenance). ACH uses Realtek RTL8812AU (requires external driver build on every kernel upgrade). Use ACM unless you specifically need ACH's marginally stronger signal.
- **PN532 HAT wiring:** Use I2C mode (I0=0, I1=0 jumper) to leave SPI free for the CC1101. Both coexist cleanly on the 40-pin header.

#### Android (LineageOS) pairing architecture
**Primary — USB-C gadget mode (recommended):**
Pi appears as USB Ethernet adapter (CDC-ECM) over a single USB-C cable. SSH from Termux on the phone immediately. Bettercap REST API (`:8083`) and Kismet web UI (`:2501`) accessible directly in Chrome on the phone — no app install needed. Termux + tmux = full terminal access with persistent sessions.

**Secondary — phone hotspot:**
Android phone creates hotspot; Pi connects as Wi-Fi client. Pi's built-in Wi-Fi handles the backhaul; Alfa AWUS036ACM handles monitor mode on a separate interface. No conflict. Cable-free field operation.

**Long-term:** BLE GATT server on Pi (Python `bleak` or BlueZ) + custom LineageOS app for a dedicated gesture/tap control UI. Also connects with the EMG band (Project B) as a physical control layer.

#### Software stack
**OS:** Kali Linux ARM headless. Prepackaged toolchain:
- Wi-Fi/BLE: `bettercap` (REST API), `aircrack-ng`, `kismet`, `hostapd`
- SDR: `gnuradio` + `gr-osmosdr`, Universal Radio Hacker (`urh`), `SDR++` (headless server mode), `rfcat`
- NFC/RFID: `libnfc` + `nfc-tools`, `mfoc`/`mfcuk` (MIFARE Classic attacks), `pm3` (Proxmark3 Iceman CLI)
- Sub-GHz: `cc1101-driver` kernel module (github: `28757B2/cc1101-driver`) or `picc1101`
- IR: `LIRC`, `irsend`, `irrecord`
- Control interface: bettercap REST + Kismet web + custom Flask/FastAPI dashboard served to phone browser

#### Long-term build path
Prototype with Pi 5 + USB/HAT modules. After the full radio stack is validated, move to a **CM5 + custom KiCad carrier board** for a compact final device. Use the official CM4 IO Board open-source KiCad files (pip.raspberrypi.com) as the starting template.

---

### Project B — Open-Source EMG Gesture Tracker

A wearable forearm + bicep band that captures muscle electrical signals to detect finger movements and arm gestures, translating them into computer HID commands over BLE.

#### Why Myo failed — design constraints for this build
The Myo's 200 Hz sampling rate discarded most of EMG's useful band (20–500 Hz). Its 8-bit ADC was too coarse for fine gesture discrimination. No electrode impedance feedback meant sweat, arm hair, and band rotation silently degraded SNR. These are the structural problems to solve.

#### Recommended architecture

**Analog front-end:**
- **Forearm band:** ADS1299-4 (Texas Instruments) — 4 simultaneous 24-bit differential channels, 250–16,000 SPS, PGA gain 1–24×, SPI interface. Same chip in OpenBCI. ~$40/chip.
- **Bicep band:** ADS1292R (TI) — 2-channel, 24-bit. Smaller, cheaper, sufficient for bicep/triceps. ~$17/chip.

**MCU:** nRF52840 — specifically the **Seeed XIAO nRF52840** at $10. Wins over ESP32 for two reasons:
1. BLE 5.0 with native HID-over-GATT: band appears as a standard Bluetooth keyboard/mouse to any OS, no driver or host software needed for deployment
2. 40–50× lower BLE current draw than ESP32 — viable for days of use on a 150 mAh LiPo

**IMU:** LSM6DSL (6-axis, 16-bit) on each band for orientation correction and arm motion fusion with EMG.

**Electrodes:** PCB ENIG gold pads as dry electrodes (the CleverHand approach). Design the forearm PCB so the gold-plated exposed pads are the electrodes; elastic silicone band provides the compression contact against skin.
- 8 pads (4 differential pairs) equally spaced at 45° circumference, proximal third of forearm — Ninapro placement standard
- 20 mm inter-electrode spacing within each pair, 10 mm pad diameter
- Bicep band: 2 pads on biceps brachii belly, 2 pads on triceps (2 differential pairs, ADS1292R)
- Dry electrode impedance: 50–500 kΩ vs. gel's 1–5 kΩ. Research shows only ~0.8% classification accuracy difference.

#### Signal chain
```
Dry electrodes
  → ADS1299-4 (24-bit ADC, 2 kHz SPS, SPI DRDY interrupt)
  → nRF52840 (64 MHz Cortex-M4F)
    → 20–500 Hz IIR bandpass (2nd-order Butterworth)
    → 50/60 Hz IIR notch (biquad, Q=35)
    → 200 ms window, 50% overlap
    → Feature extraction: MAV + ZC + SSC + WL per channel (16-dim for 4-ch)
    → LDA classifier (16 features × 8 gesture classes)
  → BLE 5.0 HID-over-GATT → OS-native keyboard/mouse events
```
**Latency:** <50 ms from muscle activation to HID event (on-device LDA).
**Classification accuracy:** ~96–97% for 8 gesture classes (personalized LDA, single session). ~90–94% cross-session without recalibration.

#### BOM estimate

| Item | Cost |
|---|---|
| Forearm band (ADS1299-4 + XIAO nRF52840 + LSM6DSL + passives + LiPo + PCB) | ~$104 |
| Bicep band (ADS1292R + XIAO nRF52840 + LSM6DSL + passives + LiPo + PCB) | ~$58 |
| Stencil + solder paste + misc | ~$35 |
| **Total first prototype** | **~$197–$220** |

Shared MCU architecture (one nRF52840 drives both ADS chips via two SPI chip-selects) reduces cost to ~$155.

#### Development sequence
**Weeks 1–2:** 2× BioAmp EXG Pill ($25 each, open-source single-channel AFE) + Arduino Nano 33 BLE Sense (nRF52840-based). Validate signal chain with wet Ag/AgCl electrodes. Confirm clean 20–500 Hz EMG before touching custom PCB.

**Weeks 3–4:** 4× BioAmp EXG Pill → nRF52840 SAADC, 4-channel capture. Train first LDA classifier with scikit-learn. Get first gesture → keypress via host Python (bleak + scikit-learn + pynput).

**Weeks 5–6:** Design custom PCB in KiCad — ADS1299-4 + nRF52840 + ENIG electrode pads on segmented PCB tiles. Send to JLCPCB. Iterate on dry electrode contact geometry.

**Weeks 7–8:** Add BLE HID-over-GATT (nRF Connect SDK / Zephyr HIDS service). Add ADS1292R bicep band. Fuse arm + finger gesture classification. Add LSM6DSL IMU. Collect multi-session data; address session drift with adaptive LDA or per-session recalibration (~2 min of labeled gesture recording).

#### Host-side development stack (Python)
```python
bleak          # BLE GATT notifications from nRF52840
numpy          # 200ms windowed MAV/ZC/SSC/WL feature extraction
scikit-learn   # LDA/SVM classifier (train offline, serialize to C header)
pynput         # emit keyboard/mouse HID events
tensorflow-lite # optional CNN (higher accuracy, more compute)
```
Training data: use **Ninapro DB5** (ninaweb.hevs.ch) — 8-channel sEMG, 52 subjects, 53 gesture classes, pre-labeled — as initialization before collecting your own data.

#### Key repos
| Repo | Purpose |
|---|---|
| `codeberg.org/psylink/psylink` | Reference end-to-end: INA128 AFE + nRF52840 + bleak + pynput + TFLite |
| `github.com/Aightech/CleverHand-hardware` | Best open-source EMG PCB: ADS1293/ADS1298 + modular ENIG electrode tiles — fork as PCB starting point |
| `github.com/ultimaterobotics/uMyo` | Production-grade single-node reference: nRF52832 + AD8293G160, multi-node BLE sync |
| `github.com/upsidedownlabs/BioAmp-EXG-Pill` | Early prototyping AFE — beginner-friendly, open hardware |
| `github.com/OpenBCI/OpenBCI_Cyton_Library` | ADS1299 SPI driver reference code |
| `github.com/nktsb/EMG-gesture-recognition` | Feature extraction + LDA implementation in Python, directly portable |

---

### How Projects A and B connect

The EMG band is a BLE HID device. The Pi hacking box is a Linux server with BLE. The natural long-term integration: EMG band pairs to Pi over BLE → gestures trigger radio operations (NFC scan, sub-GHz replay, bettercap probe) → LineageOS phone shows output. The band becomes the physical control layer for the hacking box, and the phone becomes the display. Three devices forming one system — all open-source.

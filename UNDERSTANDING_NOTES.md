# AI in Power Electronics — Understanding Notes

**Paper:** Zhao, Blaabjerg & Wang (2021). *An Overview of Artificial Intelligence Applications for Power Electronics.* IEEE TPEL 36(4): 4633–4658.
**Presenter:** Aswin Ram Kalugasala Moorthy · ECE-563 Smart Grid · Spring 2026
**Purpose:** A plain-English companion to SPEAKER_SCRIPT.md. For every slide: what I'm actually saying, why it matters, and the most likely questions + how I'd answer them.

---

## How to use this file

Read it end-to-end once during rehearsal. Then re-read only the Q&A sections. The goal isn't to memorize — it's to be able to *think from first principles* under a question, instead of pattern-matching the slide text.

A physics/engineering audience asks questions in three flavors:
1. **"Explain this term"** — usually a definition or a short technical chain.
2. **"Why is this true?"** — asks for mechanism or evidence.
3. **"What about the edge case?"** — asks where the argument breaks.

Each slide's Q&A section below is grouped that way.

---

## Global framing — the thesis of the whole talk

The paper is a **map**, not a new algorithm. It surveys how AI has been applied in three phases of a power-electronic converter's life:
- **Design** — figuring out what circuit to build
- **Control** — running the converter in real time
- **Maintenance** — monitoring the converter's health over years of operation

Each phase has its own tooling, pacing, and open problems. Control dominates the literature (78% of papers). I argue maintenance is where the next five years actually matter, because of a structural data advantage.

**The one uncomfortable question the whole talk orbits:** *Can a neural network convince a functional-safety auditor not to light up a substation?* The answer is "not yet" — and that's why this is interesting.

---

## Slide 1 — Opening thesis

### What I'm saying in plain English
I'm about to walk you through a 2021 review paper by three researchers at Aalborg University. They looked at 500+ papers on AI applied to power electronics and organized them into a taxonomy. I'll explain that taxonomy, show you examples, then end by telling you three things I think the paper got wrong or under-weighted.

### Why it matters
The opening sets up a *promise* — "I'll tell you three things I disagree with." This is Chekhov's gun. It pays off on slide 11. The audience remembers being promised a critical take, so they pay attention through the setup.

### Q&A anticipations
- **"Why this paper?"** → It's the most comprehensive map of the intersection of AI and power electronics from a reliability-focused lab. 29 years of citations backing it up. It carries weight.
- **"What does 'light up a substation' mean?"** → If a grid-connected inverter makes an unsafe switching decision (wrong voltage, bad timing, unexpected current spike), it can cause cascading failures in the upstream grid — tripped breakers, arc faults, damaged transformers. That's substation-scale damage, potentially measured in millions of dollars and blackouts.

---

## Slide 2 — Why this matters

### What I'm saying in plain English
Every piece of modern power infrastructure — EV chargers, solar inverters, data-center power supplies, grid-tied storage — runs on **power-electronic converters**. Think of these as circuits that transform electricity between voltage levels, frequencies, or DC/AC forms. They're the traffic cops of the grid.

The converters are getting faster because of new semiconductor materials:
- **Silicon (Si)** — what everything ran on until ~2015. Switches ON/OFF at 20,000 times per second (20 kHz).
- **Silicon Carbide (SiC)** — harder material, higher bandgap (3.26 eV vs 1.12 for Si). Switches at 200-300 kHz.
- **Gallium Nitride (GaN)** — even harder, 3.4 eV. Switches past 1 MHz (1 million times per second).
- **Diamond** — the holy grail at 5.5 eV. Still lab-only.

**Bandgap** is the energy needed to free an electron in the material. Higher bandgap = can withstand higher voltages and temperatures, switch faster, waste less energy as heat.

The problem: the faster the switches, the harder it is to control them manually. A human engineer tuning a PI controller loop for a megahertz-switching GaN converter is trying to adjust something that changes 1,000,000 times per second. The gap between human reaction time (~200 ms) and the control loop (~1 µs) is six orders of magnitude. That's why AI-based control becomes necessary: the hardware outran the humans.

### Why it matters
This slide justifies the whole talk. If converters were still slow silicon, classical control would be fine. They're not. AI isn't a luxury here; it's a consequence of a physics upgrade.

### Q&A anticipations
- **"What's a PI controller?"** → Proportional-Integral. Two simple math terms. "Proportional" means react based on how far off you are from your target. "Integral" means react based on how long you've been off. You tune two gains, K_p and K_i. It's 100 years old and still runs most industrial processes.
- **"Why does the bandgap matter beyond switching speed?"** → Higher bandgap also means the semiconductor can operate at higher voltage (thinner devices for same breakdown voltage) and higher temperature (fewer cooling requirements). All three compound into better power density — more watts per kg and per liter.
- **"How does a higher switching frequency help?"** → Smaller passive components. If you're switching at 1 MHz instead of 20 kHz, you need inductors and capacitors 50× smaller. That shrinks the converter, which matters enormously for EV chargers, solar microinverters, and data-center PSUs.
- **"What's an IGBT?"** → Insulated-Gate Bipolar Transistor. The workhorse silicon power switch since the late 80s. Used in most industrial drives, solar inverters, train traction inverters. Slow (20-50 kHz) but robust and cheap.

---

## Slide 3 — The paper itself

### What I'm saying in plain English
Brief meta-slide. It's a review, not an experiment. 500+ papers surveyed, organized into a table. I use the metaphor that review papers are either "tourist maps" (pretty, useless) or "surveyor's plats" (every fence post marked). This one is the latter — detailed and rigorous.

### Why it matters
Gives the audience confidence that the taxonomy is real and comprehensive. Signals I've read the paper carefully and thought about what's missing ("the shape of the silence").

### Q&A anticipations
- **"What's a surveyor's plat?"** → A formal legal map drawn by a land surveyor showing exact property boundaries. Every fence post, every corner, every elevation marked. That's the precision level of this paper.

---

## Slide 4 — The 3 × 4 taxonomy

### What I'm saying in plain English
The paper's spine is a grid: 3 rows × 4 columns.

**Rows (lifecycle phases):**
- Design
- Control
- Maintenance

**Columns (AI tool categories):**
- Expert systems (encoded rules)
- Fuzzy logic (reasoning with vague sets)
- Metaheuristics (evolutionary-style search)
- Machine learning (neural nets, SVMs, RL)

Every one of the 500+ papers in the field fits into exactly one cell. The paper counts papers per cell and shows bars on the right:
- **Control = 78%**
- **Maintenance = 12%**
- **Design = 10%**

My sarcastic take: 78% in control is a *confession* — we don't know how to design or maintain things with AI, but we're great at making them do backflips. Control dominates because its problem is clean: you have sensor data, you have a plant model, and "tracking error" is a crisp objective function. You can benchmark it, publish a clearly-better-than-last-year plot, and get cited.

Design and maintenance don't have a clean tracking error. That's why they're under-represented — not because they're unimportant, but because they're harder to formulate as AI tasks.

### Why it matters
The 78/12/10 split is the number you'll remember. I plant the 12% seed here so I can fire it on slide 11 when I predict maintenance grows to 30% by 2030.

### Q&A anticipations
- **"What's tracking error?"** → The gap between where your controller wants the system to be (the setpoint) and where it actually is. If I tell a motor "spin at 3000 RPM" and it spins at 2990, tracking error is 10 RPM. Control engineers love it because you can square it, integrate it, optimize against it — it's a scalar objective.
- **"Why do these categories overlap?"** → They do, in practice. A neural network trained with a genetic algorithm is both ML (column 4) and metaheuristic (column 3). The paper forces a single-cell categorization for counting purposes; in real deployment, systems are hybrid.

---

## Slide 5 — Four tools, four regimes

### What I'm saying in plain English

**Expert systems** — you sit down with a senior engineer, extract their if-then rules, encode them in software. Explainable, auditable, beloved by lawyers. The weakness: the engineer has to be able to articulate the rule. If their judgment is tacit (learned by doing, not by reasoning), expert systems can't capture it.

**Fuzzy logic** — lets you reason about "somewhat high current" as a first-class concept. Instead of binary TRUE/FALSE, you have membership functions (e.g., 0.7 "high", 0.3 "medium"). Great when sensors are noisy or definitions are vague. Invented 1965. Still shipping quietly in millions of motor drives.

**Metaheuristics** — gradient-free search. When you can't take a derivative of your cost function (because it's discontinuous, or you're switching between topologies mid-search), you need methods that just *try stuff and remember what works*. Three main flavors:
- **Genetic Algorithm (GA):** evolution-inspired. Keep a population of candidate designs. Breed the best. Mutate randomly. Repeat.
- **Particle Swarm Optimization (PSO):** flocking-inspired. Candidates move toward the best-performing peer. Converges fast, sometimes on local optima.
- **Simulated Annealing (SA):** metallurgy-inspired. High temperature = lots of random jumps. Cool slowly. Ends at a global optimum with non-trivial probability.

**Machine learning** — the fastest-growing category. SVMs, CNNs, LSTMs, reinforcement learning. The current wave. Everyone has heard of it; few understand what it's actually solving.

**The Wolpert quip:** the No Free Lunch theorem (1997) formally proves that averaged over *every possible problem*, every algorithm is exactly as bad as every other. So committing to one tool for everything isn't metaphorically wrong; it's mathematically wrong. You have to pick the tool for the problem.

### Why it matters
Sets up the vocabulary for slides 6-10. Lands the philosophical point: you can't substitute judgment with a fashionable method.

### Q&A anticipations
- **"What does 'gradient-free' mean?"** → A gradient is the derivative of your objective function with respect to your parameters. If you have it, you can do gradient descent (roll downhill). If the objective is discontinuous — like "what if we changed the converter topology from buck to boost" — there's no smooth derivative. So you need methods that search without gradients. GA, PSO, SA are three.
- **"What's a membership function in fuzzy logic?"** → A mapping from a value to a degree of membership in a linguistic set. "Current = 7 amps" might be 0.4 "medium", 0.6 "high". Those numbers are used directly in the controller's reasoning.
- **"Why is 'tacit judgment' a real problem?"** → Michael Polanyi's phrase: "we know more than we can tell." Expert engineers often make good decisions they can't fully explain. Asking them to write down their rules creates incomplete rule sets that perform worse than the engineer's intuition. This is why expert systems plateaued in the 80s.

---

## Slide 6 — Design phase (HEAVY JARGON SLIDE — read carefully)

### What I'm saying in plain English

The problem: I want to design a **DC-DC converter for a 350 kW EV charger**.

Let's unpack that. A 350 kW charger (like the fast ones at Electrify America or Tesla V4 Supercharger) takes power from the grid's 3-phase 480V AC, converts it to DC, and delivers up to 350,000 watts to an EV battery. At 800V battery voltage that's 437 amps. The *DC-DC* stage is the final step: it matches the charger's internal DC rail to whatever DC voltage the car's battery actually wants (400V or 800V depending on make).

To build this DC-DC stage, I have a shelf of topology options:

- **Buck** — steps voltage *down*. Simplest DC-DC topology. 1 switch, 1 diode, 1 inductor, 1 cap.
- **Boost** — steps voltage *up*. Dual of buck.
- **Interleaved** — multiple buck (or boost) stages running in parallel, phase-shifted. Smooths out the ripple current, reduces capacitor stress.
- **Resonant** — uses an LC tank operating at resonance to achieve *soft switching* (switches turn off when current is naturally zero). Huge efficiency gains at high frequency.
- **Multi-level** — instead of 1 switch pair, use multiple stacked pairs. Distributes voltage across them, enabling higher system voltages with smaller individual devices.

Each topology has its own set of **magnetics** (inductors, transformers — they store energy magnetically), **caps** (capacitors — store energy electrostatically, filter ripple), and **semiconductors** (the switches). For every topology, you pick the values of each component. Inductor in nanohenries, capacitor in microfarads, switch current rating in amps. The space of (topology × component values) is *combinatorial* — grows exponentially.

Classical flow: an engineer sits at their desk, picks 10 candidate designs in a day, simulates each for 10 minutes, picks the one that meets spec. Done by Friday.

AI-augmented flow: a GA or PSO runs overnight. It simulates 10,000 candidates by cycling through topologies and component values. No gradients required — perfect, because "switch topology from buck to resonant" has no smooth derivative; it's a step change.

The output is not a winner. It's a **Pareto front**: a curve in multi-objective space showing the tradeoff between, say, efficiency and cost. You can't be at the top of both; improving one always costs the other. The engineer picks a point on the curve based on the project's priorities.

**DNN surrogates** — the newer move. SPICE (the circuit simulator everyone uses) takes seconds to run a single converter simulation. With 10,000 candidates, that's 2.7 hours of compute. Instead, you train a **deep neural network** on a corpus of SPICE outputs (maybe 100,000 precomputed simulations). The trained net takes a design and predicts the simulation output in *microseconds* — a million times faster. You run the GA's search loop using the DNN surrogate instead of SPICE. Get 10,000 candidates evaluated in seconds.

The Stark quip: "Training a neural net to approximate SPICE a million times faster is a species of hubris I fully endorse." The engineer says "this simulator is slow." The ML person says "hold my beer, I'll just learn a function approximation." It usually works. When it doesn't, *the magic smoke comes out of something expensive* — "magic smoke" is EE slang for the smoke that escapes a component when it burns up.

### Why it matters
Design is 10% of the literature but where metaheuristics are the most natural fit. GA/PSO plus DNN surrogates is an emerging pattern you'll see more of in the next five years.

### Q&A anticipations
- **"What does 'soft switching' mean in a resonant converter?"** → Normal (hard) switching: you turn the transistor ON while current is flowing. The transistor resists the flow briefly — that's voltage × current dissipated as heat. At high switching frequencies, this loss dominates. Soft switching means you time the transition to happen when current is naturally zero (the LC tank is resonating and current is passing through zero). No V×I loss because one term is zero. Enables higher frequencies with less heat.
- **"Why is the DC-DC cost surface non-convex?"** → Because it has multiple local optima. A buck design with small inductor and large capacitor can be good; so can a buck with large inductor and small cap. They're two peaks with a valley between. Plus switching between topologies (buck → boost) creates discontinuities — straight cliffs in the cost landscape. Gradient descent gets stuck; global search methods do not.
- **"What's a Pareto front?"** → In multi-objective optimization, you can't maximize everything. If you're optimizing efficiency AND cost, there's a curve of designs where you can't improve one without hurting the other. That's the Pareto front (named after Vilfredo Pareto, who studied wealth distribution). Points inside the front are dominated — something on the front beats them in both objectives.
- **"How is the DNN surrogate trained?"** → You run SPICE on, say, 100,000 random converter designs. Each design is an input vector (topology code + component values), each simulation output is a target (efficiency, thermal peak, ripple, etc.). Train a feedforward net on these input→output pairs. Now given a new design, the net infers what SPICE *would have* said, without running SPICE. It's interpolation plus a learned prior on design physics.
- **"When does the DNN surrogate fail?"** → When the design is far from the training distribution. If it was trained on buck and boost topologies, and you ask about a novel resonant topology, the net extrapolates — and extrapolation in neural nets is notoriously unreliable. That's when magic smoke happens: the net says "95% efficient" and the real hardware says "short-circuit fault."
- **"What's the difference between GA and PSO?"** → Both are population-based global search. GA models the population as evolving organisms — crossover (combine two parents' parameters), mutation (random jitter), selection (keep the best). PSO models the population as a swarm of birds — each bird knows its own best-so-far position and the swarm's best-so-far, and moves toward both. GA is usually better at exploration (escaping local optima). PSO is usually faster to converge on a good solution.

---

## Slide 7 — Control phase (peak slide)

### What I'm saying in plain English

Control is the heart of the field — 78% of the 500 papers. Three distinct tiers of AI control:

**Bottom tier — fuzzy controllers.** Boring, deployed, mature. They handle **nonlinearities** — things the linear PI model can't capture — like **saturation** (magnetic cores hitting their ferromagnetic limit) and **deadtime** (the tiny delay you intentionally insert between turning one switch off and the other on, to prevent shoot-through faults). Fuzzy controllers live gracefully with these; PI doesn't.

**Middle tier — neural-net controllers.** Instead of hand-tuning a PI controller, you let a neural network learn the plant's *inverse*. "Plant" in control-theory-speak is the thing being controlled (the converter). The plant takes control inputs (duty cycle, switching pattern) and outputs behavior (voltage, current). The *inverse* goes the other way: given desired behavior, output the control inputs that produce it. Training data is input/output pairs from simulation or from operating the real converter.

The key middle-tier unlock: **Neural-Net-Approximated Model Predictive Control (NN-MPC)**.

Model Predictive Control is a sledgehammer: at every control time step (say every microsecond), it solves an *online optimization problem*. It looks at the current state, predicts N steps into the future under different control actions, picks the control action that minimizes a cost over that horizon, applies the first step, then re-solves on the next tick. Brilliant on paper. Impossible in practice at converter-scale switching frequencies because solving an optimization in 1 microsecond requires more compute than your microcontroller has.

Solution: run MPC *offline* against a simulator. Collect the input-output behavior (state → optimal control). Train a neural network to imitate that. Deploy the net. It predicts what MPC would have said, in *microseconds*. Near-MPC performance without the online optimization. The Stark quip: "Train a neural net to lie about what MPC would have said, fast enough to matter."

Historical note: **MPC** was invented at Shell in the 1970s for oil refineries, not power electronics. Refineries have slow chemical processes and big mainframes — perfect for MPC. Power electronics didn't inherit MPC until the 2000s, when microcontrollers got fast enough. And now ML is "taking credit" for what MPC did forty years ago.

**Top tier — reinforcement learning.** The research frontier. Multi-objective optimization *in one shot*: efficiency, **THD** (Total Harmonic Distortion — how clean the AC output waveform is; grid code typically requires THD < 5%), thermal margin, device lifetime — all balanced by a single RL agent.

The analogy: **AlphaGo for power**. DeepMind's AlphaGo trained for 40 days on 300,000 Go games (simulated). An RL agent for a grid inverter is structurally similar: simulator-generated trial-and-error plus a reward function. The disanalogy is scale:
- **AlphaGo** → 40 days to train, seconds to move
- **TD3 agent for inverter** (a modern RL algorithm) → ~72 hours to train, ~156 microseconds to inference
- **Inverter switching budget** → 40 microseconds between interrupts

The 156 µs inference is **4× longer than the physics budget**. You cannot run a standard RL policy inside the switching loop. You have to distill it (train a smaller net to imitate the RL policy) or run it at a slower cascade level (not every switching tick, but every "slow control" tick at 1 kHz).

And the big unsolved problem: **certification**. How do you convince an IEC 61508 functional-safety auditor that an RL policy on a grid-connected inverter won't do something dangerous? No certification body today has a procedure for proving black-box safety. Every major inverter OEM — Schneider Electric, Fronius, SMA, ABB, Siemens — is blocked on this.

### Why it matters
This is the slide where the audience feels the real tension between research and deployment. Control is mature in the middle tier, broken at the top. The answer isn't "more compute" — the answer is regulatory, and that hasn't been written yet.

### Q&A anticipations
- **"What's a duty cycle?"** → The fraction of each switching period that the transistor is ON. 50% duty cycle = ON for half the time. Duty cycle directly controls the output voltage in most converter topologies. It's the main "knob" the controller turns.
- **"What's deadtime?"** → In a half-bridge (two transistors stacked vertically, driving a load from the middle node), you must never have both ON simultaneously — that would short-circuit the supply through them. So you insert a deliberate OFF period between them, usually 100-500 nanoseconds. Controllers compensate for the resulting dead-time distortion.
- **"What's magnetic saturation?"** → A ferromagnetic core (inductor or transformer core) can only store a finite amount of magnetic flux before the atoms align fully. Beyond that, the inductance collapses toward that of air. In a converter, hitting saturation means your current spikes uncontrollably. Linear PI controllers don't model this — they assume the inductor is always ideal. Fuzzy rules can handle it by watching for the onset.
- **"What's THD specifically?"** → Total Harmonic Distortion. If your ideal output is a pure 60 Hz sine wave, any harmonic energy at 120, 180, 240 Hz etc. is distortion. THD = RMS of harmonic energy divided by RMS of fundamental, expressed as a percent. Grid code requires <5% typically. For a 50 kW residential solar inverter feeding the grid, distorting beyond that can cause equipment damage downstream.
- **"What's a TD3 agent?"** → Twin Delayed Deep Deterministic policy gradient. An actor-critic RL algorithm. Twin because it uses two Q-networks to reduce overestimation bias; delayed because the policy network updates less frequently than the Q-networks for stability. Introduced in Fujimoto et al. 2018. Common choice for continuous control tasks.
- **"Why can't you just put a bigger processor on the inverter?"** → Cost + complexity + EMI. An inverter's control board runs on a $10 microcontroller partly because the part has to be cheap (inverters are commodity hardware in huge fleets) and partly because a full GPU generates too much EMI near the switching circuits. The microcontroller is hardened against 100+ V/ns switching transients; a GPU would crash. And putting a GPU on every 50 kW inverter would blow the cost model.
- **"What's IEC 61508 certification like?"** → Roughly: you document a Hazard & Risk Analysis, assign a SIL (Safety Integrity Level) from 1 (low) to 4 (high), then demonstrate that your system meets the SIL's failure rate targets through testing, formal verification, and traceable development processes. For software: every line of code has to be traceable to a requirement, and every requirement to a hazard. A neural network's weights don't map cleanly to "requirements."

---

## Slide 8 — Maintenance (the bet, planted)

### What I'm saying in plain English

Maintenance is where ML has the cleanest value proposition. And it's where I bet the next five years actually matter.

Classical approach: **model-based condition monitoring**. You write down a physics model of how an IGBT degrades (based on fatigue theory), run the model, compare predicted to measured. Deviations mean degradation. The dominant degradation modes:
- **Bond-wire fatigue** — tiny aluminum wires connecting the silicon die to the package break due to thermal cycling (expand/contract on every switching cycle).
- **Solder-layer cracking** — the solder joining the die to the substrate develops microcracks over thousands of thermal cycles.

Both follow **Coffin-Manson** fatigue law — a 1950s equation derived from aircraft-engine fatigue research. Yes, 1950s equations are still predicting 2026 SiC module deaths. That's partly because the physics genuinely is that general, and partly because the field hasn't invested in replacing the model.

**Data-driven approach:** flip the problem.
- Instrument a fleet of modules (install temperature sensors, current sensors, vibration sensors, gate-voltage monitors).
- Run them to failure in a lab.
- Label the data: "this voltage signature → bond-wire fault, 500 cycles before death."
- Train a **CNN** (Convolutional Neural Network) on the current/voltage waveforms to classify the fault mode.
- Train **LSTM**s (Long Short-Term Memory recurrent nets) on junction-temperature time series to predict the *degradation trajectory*.

For **Remaining Useful Life (RUL)** prediction, the state-of-the-art is a hybrid **Gaussian Process + neural net**: the net predicts a point estimate ("this module dies in 847 hours"), the GP wraps it with an uncertainty band ("±142 hours, 95% confidence"). A shift planner needs the band, not just the point — they schedule the truck roll inside the window.

**The Stark line:** classical prognostics asks "is it broken?" — a binary yes/no. Data-driven prognostics asks "how long does it have, and how sure are you?" — a distribution over futures. That's not a wrong question vs right question. It's a different era's question.

**The flywheel.** Modern IGBT and SiC modules (Infineon EasyPACK, Wolfspeed XM3) ship with embedded junction-temperature sensors and DC-link telemetry. Every deployed module generates data. More sensors → more data → better models → next-gen modules ship with better targeting. Classical condition-monitoring research isn't in an arms race with itself; the ML side *is*. Structural compounding beats methodological cleverness.

### Why it matters
This sets up the 12% → 30% bet on slide 11. The flywheel isn't choice-driven — regulators requiring telemetry on grid-connected equipment is *forcing* sensor density to climb. The field tips.

### Q&A anticipations
- **"What's a junction-temperature sensor inside a module?"** → A tiny thermistor or optical sensor bonded to the silicon die itself (not the package exterior). Reports T_j ≈ 150 °C rather than T_case ≈ 80 °C. Die temperature is what drives degradation, so direct measurement vs estimation from case temp is a huge accuracy gain.
- **"How does thermal cycling cause bond-wire fatigue?"** → Silicon and aluminum (the bond wire) have different coefficients of thermal expansion. As the die heats and cools on every switching cycle, the wire flexes. After 10^6 to 10^9 cycles (depending on ΔT), the wire develops metal fatigue cracks and eventually breaks. Same physics as airframe fatigue.
- **"What is a Gaussian Process, briefly?"** → A non-parametric Bayesian regression method. You model your function as a sample from a Gaussian distribution over functions. Given training data, you update to a posterior that gives both a mean prediction AND variance (uncertainty) at any test point. The uncertainty grows in regions far from training data. That's exactly what RUL needs.
- **"What if the LSTM misses a rare fault mode?"** → Then you've trained on a biased dataset (survivorship bias — see slide 10). The classical physics model would *also* miss it, but at least the physics model gives you a prior on what *could* happen. That's why the next-gen approach is hybrid physics+data (slide 10's Problem 4): use physics as a regularizer on the ML.

---

## Slide 9 — Reframe (the corrective slide)

### What I'm saying in plain English

Short transitional slide. The paper's Section 2 groups AI differently than Section 1 — not by method (expert/fuzzy/metaheuristic/ML) but by **task**:
- Optimization
- Classification
- Regression
- Data-structure exploration

The point: **pick the task first, then the toolkit**. Most bad papers in the field go the other way — start from a cool method and bend the problem to fit. The paper's Section 2 is the adult correction. I argue it should have been Section 1.

### Why it matters
Gives the audience a practical heuristic: when they evaluate a new AI-in-PE paper, ask "what task is this solving?" first.

### Q&A anticipations
- **"Isn't classification just a special case of regression?"** → In principle, yes (classification is regression with cross-entropy loss on a simplex output). In practice they're posed differently, have different loss landscapes, and different canonical datasets. The paper treats them as distinct because they call for different tools.

---

## Slide 10 — Four open problems

### What I'm saying in plain English

Four honest open problems in the field.

**1. Data scarcity.** You can't train on a fault mode that hasn't happened yet. If your fleet has never experienced a gate-oxide breakdown in the field, you can't train a classifier to detect it. This is *survivorship bias with higher stakes*. Most survey papers quietly avoid rare-event detection because the training data simply doesn't exist.

**2. Interpretability.** A neural-net controller on a grid-connected inverter has to pass IEC 61508. No certification body has a procedure for certifying a neural net. Post-hoc explanation methods exist — **LIME** (Local Interpretable Model-agnostic Explanations) and **SHAP** (SHapley Additive exPlanations) — but they're *after-the-fact explanations*, not formal proofs. Certification bodies don't accept "here's why the net probably did the right thing" as a proof of safety. Right now there is **zero** globally-accepted SIL-2 procedure for neural controllers in safety-critical inverters.

**3. Real-time constraints.** The controller runs on a microcontroller with a few MIPS between switching interrupts. Not a server GPU. A 200 MB transformer is beautiful and irrelevant if you can't inference in 2 microseconds. GPT-2 has 117 million parameters — just storing the weights in the microcontroller's RAM is impossible. **Model distillation** — training a smaller net to imitate a bigger one — isn't a research topic here; it's a survival constraint.

**4. Hybrid physics-plus-data.** The holy grail. Combine the interpretability and generalization of a physics model with the flexibility of data-driven learning. **Physics-Informed Neural Networks (PINNs)** try to do this by adding the PDE (partial differential equation) as a loss term during training. Named, famous, unsolved at production scale. Like fusion: always twenty years away, always the right idea.

**The umbrella quip:** Data scarcity is the *crash-proof-plane* problem (Wald's WWII bomber analogy — you can't put armor where the surviving planes got hit; put it where the lost planes got hit). Interpretability is the *black-box-elevator* problem (you don't get to install a learned elevator in a skyscraper without a certificate). Real-time is the *two-microsecond* problem. Hybrid is the *unicorn* problem. These aren't weaknesses in the paper. They're the four hills the whole field is trying to climb.

### Why it matters
Every technical audience wants to know where the field is stuck. Naming the stuck places honestly builds credibility and sets up the critical-take slide.

### Q&A anticipations
- **"What are LIME and SHAP exactly?"** → Both are post-hoc local explanation methods for black-box models. Given a prediction, they tell you which input features most influenced it. LIME fits a simple linear model around the prediction point. SHAP uses Shapley values from cooperative game theory to assign each feature a contribution. Both are useful for debugging and human-facing explanations. Neither produces a safety-case proof.
- **"What does 'SIL-2 certification' mean concretely?"** → SIL is a scale of failure-rate targets. SIL-2 means the probability of dangerous failure per hour is between 10^-7 and 10^-6. That's roughly one dangerous failure per 100 to 1000 years of operation. To certify at SIL-2, you need extensive documentation, testing, fault injection, and often formal verification of software. Neural nets are hard to formally verify because their weights aren't tied to requirements.
- **"What's a PINN, under the hood?"** → A feedforward neural net where the loss function has two parts: (1) fit the training data, and (2) satisfy a known physical PDE (e.g., Maxwell's equations, heat equation). Gradient descent balances both. The net learns to be consistent with physics even in regions where training data is sparse. In principle it generalizes better. In practice, the loss landscape is nasty and training is unstable at production scales.
- **"What counts as a 'rare fault' that can't be trained?"** → A gate oxide breakdown (a dielectric failure inside the transistor) might happen once in 10^9 operating hours. You'd need thousands of converters operating for decades to observe one. No fleet has that scale + time. So you can't train a classifier for it. Physics models *can* predict it from first principles (electric field > breakdown strength), but only approximately.
- **"Why is a transformer 200 MB and still too slow?"** → Transformers have quadratic attention cost in sequence length. Even at modest sequence lengths, the matrix multiplications involve tens of millions of ops. A $10 microcontroller can do ~1 million floating-point ops per millisecond. Inferencing a transformer takes seconds on that chip — multiple switching cycles. Completely incompatible with the control loop.

---

## Slide 11 — Critical take (payoff slide)

### What I'm saying in plain English

Three things I argue the paper misses or under-weights.

**1. Temporal blind spot.** The paper is from 2021. In ML dog years, that's the Pleistocene. ChatGPT didn't exist. Chronos (Amazon), TimeGPT (Nixtla), TimesFM (Google) — all 2024 foundation models for time-series forecasting. Transformer-based HDL code generation — 2024. Control-pretrained backbones — emerging now. The paper's 3×4 matrix has a **fifth column** now, and the paper doesn't know.

**2. Sim-to-real.** Most RL and NN controllers in the literature are simulator-trained. Simulators smooth over the real-world nonidealities that bite on silicon:
- **Deadtime** (the forced off-gap we discussed on slide 7)
- **Parasitic inductance** (unintended inductance from circuit board traces, on the order of nanohenries, causing ringing)
- **Current-sensor bandwidth** (real current sensors have limited frequency response; simulators often assume ideal)
- **EMI** (electromagnetic interference coupling control signals into measurement signals)

Robotics has spent a decade on **sim-to-real**: domain randomization (train across many simulator variants), dynamics randomization, procedural environment generation. Power electronics has barely started. The rigorous sim-to-real chapter for PE doesn't exist in the literature yet.

**3. The 78/12/10 bet.** Control dominates today because its problem is clean. Maintenance is *structural* — sensor cost is dropping, fleet size is growing, regulators are starting to *require* telemetry on grid-connected equipment. The flywheel isn't a choice; it's thermodynamic. **My prediction: redo this survey in 2030 and maintenance is 30% of the field, not 12%.** I'll take the bet publicly.

### Why it matters
This is the Chekhov's gun from slide 1 firing. The audience remembers being promised a critical take. Deliver the three with conviction. The 30% bet is the line they walk out with.

### Q&A anticipations
- **"Chronos / TimeGPT / TimesFM — what are they exactly?"** → Transformer-based foundation models for time-series forecasting. Pretrained on massive datasets of time-series from diverse domains (finance, weather, IoT, energy). Given a new time-series, they forecast without task-specific training — zero-shot or few-shot. Amazon's Chronos (2024), Nixtla's TimeGPT (2023-2024), Google's TimesFM (2024). All deployable today.
- **"What's domain randomization?"** → A sim-to-real technique. During training in simulation, you randomize physical parameters (mass, friction, actuator delay, sensor noise) across a wide range. The RL policy learns to be robust to that variation, so when deployed on real hardware it's already seen enough weirdness that the real-world nonidealities fall within its training distribution.
- **"Why don't inverter OEMs just fund sim-to-real research themselves?"** → Some do (ABB, Siemens). But they're primarily hardware companies; their internal ML teams are small. The academic community has been slow to pick up sim-to-real for PE because the problem requires both deep control-theory expertise and deep ML expertise, and that intersection is thin.
- **"Aren't you just predicting the flywheel will continue?"** → Yes — but the flywheel has structural drivers. Sensor prices drop monotonically (Moore's law for MEMS). Fleet sizes grow with electrification. Regulatory telemetry requirements are tightening (EU AI Act, NERC CIP). Any one driver might plateau; the stack keeping all three driving simultaneously is what makes me confident. If all three reverse, I'd retract the bet.

---

## Slide 12 — Closing takeaways

### What I'm saying in plain English

Three lines.
1. AI in power electronics is **here**. Deployed. Not speculative.
2. **Task first, tool second.** The rest is just which hammer.
3. The open problems aren't a sign the field is broken — **they're the reason it's interesting**.

### Why it matters
The closer. What they walk out of the room thinking. Keep it short. Don't over-explain.

### Q&A anticipations
- Usually none — this slide is the exit cue. Any question at this point should be redirected to the Q&A slide that follows.

---

## Slide 13 — Q&A

### Strategy
The script has prepared answers for:
- Foundation models for PE
- IEC 61508 certification timeline
- The 30% maintenance bet
- Dismissive / hostile questions

If something lands that I haven't pre-answered, the hostile-question move is the universal escape: **"Yeah, tell me more about what you mean."** It buys 15 seconds and usually the questioner does the work of articulating their own objection.

### Deeper follow-ups the script doesn't cover

- **"What would change your mind on the 30% maintenance bet?"** → If sensor cost stopped dropping (e.g., a semiconductor supply crisis) or if regulators pulled back on telemetry requirements. Both are unlikely but observable.
- **"Which of the four open problems is most actionable for a master's student today?"** → Real-time constraints. The sim-to-real gap and hybrid physics+data are multi-year research programs. Certification is a regulatory bottleneck, not a technical one (mostly). Model distillation is a thesis you can write in 12 months with today's tools.
- **"What's the single biggest cognitive error in this field right now?"** → Confusing simulator performance with real-world performance. Most published RL-for-inverter papers show compelling simulator benchmarks. The ones that show hardware-in-the-loop results are rare and usually disappointing. The field is optimistic about capabilities it hasn't actually demonstrated on silicon.
- **"Is there an equivalent to the 'bitter lesson' in power electronics?"** → Richard Sutton's 2019 "Bitter Lesson" in AI: general methods that leverage compute beat domain-specific methods that leverage expert insight. For power electronics: probably not yet. The physics constraints (real-time, EMI, certification) are tight enough that compute alone doesn't break them. But as RL + foundation models mature and microcontroller compute grows, it might flip by 2035.

---

## Closing note

The audience remembers two things:
1. **78-12-10** (the publication split) — and your 30% bet that 12 becomes 30.
2. **The substation line** — "light up a substation" as the cost of an RL policy going wrong.

Everything else is in service of those two anchors. If the talk had 30 seconds, you'd deliver those two lines and stop.

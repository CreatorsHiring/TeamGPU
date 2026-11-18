# TeamGPU

### P2P GPU Sharing Infrastructure

**TeamGPU** is a peer-to-peer GPU sharing infrastructure designed to make GPU compute accessible to developers by allowing them to share computational resources across their local network.

Instead of every developer needing a powerful GPU to run local LLMs, TeamGPU allows teammates to connect to a machine with available GPU resources and use its compute remotely.

Have an idle GPU? Share it with your team.

Have a low-end laptop? Use your teammate's GPU.

---

## Installation

Install TeamGPU globally using npm:

```bash
npm install -g @teamgpu/cli
```

## Getting Started

After installation, launch TeamGPU:

```bash
teamgpu
```

On the first launch, TeamGPU will ask you to choose how you want to use it:

- **Host** — Share your machine's GPU compute with other teammates.
- **Client** — Connect to another machine and use its available GPU compute.

---

## Choosing Your Mode

### 1. Host Mode

Choose **Host** if your machine has a GPU and you want to share its compute resources with other developers on your network.

TeamGPU is currently designed for **GPU compute sharing over a Local Area Network (LAN)**. Its purpose is to make underutilized GPUs accessible to teammates instead of leaving valuable compute resources idle.

For example, imagine a development team where one member has a powerful GPU-equipped laptop, but they're primarily working on frontend development and aren't actively using their GPU. Other team members with low-end laptops could connect to that machine and utilize its GPU for running local LLM workloads.

#### Host Requirements

- A machine with a compatible GPU
- [Ollama](https://ollama.com/) installed
- The required LLM models downloaded locally through Ollama
- TeamGPU installed

The Host runs the inference workload locally and makes it accessible to connected clients over the network.

**Your GPU becomes shared compute for your team.**

---

### 2. Client Mode

Choose **Client** if you want to use GPU compute from another machine running TeamGPU in Host mode.

Clients do not need their own dedicated GPU or Ollama installation. They can connect to an available host on the local network and use its compute resources to run LLM workloads.

This makes TeamGPU useful for developers working on low-end laptops, machines without dedicated GPUs, or systems that cannot run larger models locally.

#### How it works

1. Launch TeamGPU.
2. Choose Client mode.
3. Discover or connect to an available Host on your network.
4. Connect and start using the remote compute resources.

Your prompts are processed by the Host machine, which runs the model using its own hardware.

---

## Switching Between Host and Client

Your selected Client preference is saved, so TeamGPU can take you back to Client mode when you launch it again.

But you're not locked into that choice.

If you initially choose Client and later want to share your GPU with your team, you can switch modes at any time.

### Switch from Client to Host

1. Launch TeamGPU.
2. Open the Client interface.
3. Type:

```text
/settings
```

4. Open the settings page.
5. Choose Host mode to start sharing your machine's compute resources.

Host mode is temporary and does not overwrite your saved Client preference. When you launch TeamGPU again, it will return to your preferred Client mode.

---

## Why TeamGPU?

GPU hardware is expensive, yet within development teams, computational resources often go unused.

At the same time, developers with low-end hardware struggle to run local AI models, experiment with LLMs, and build AI-powered applications.

TeamGPU aims to bridge that gap by connecting machines and making GPU compute shareable.

Instead of every developer purchasing expensive hardware, teams can make better use of the GPUs they already own.

### The Idea

- **Share GPUs:** Make unused GPU resources available to teammates.
- **Access Remote Compute:** Run LLM workloads using another machine's GPU.
- **Lower Hardware Barriers:** Give developers without powerful GPUs access to compute.
- **Peer-to-Peer Infrastructure:** Connect machines directly within a local network.

---

## Current Capabilities

TeamGPU currently focuses on **LLM inference over LAN**.

The current implementation is designed for devices connected to the same local network, such as the same Wi-Fi or LAN.

| Role    | Responsibilities                                                            |
| ------- | --------------------------------------------------------------------------- |
| Host    | Runs Ollama, models, and inference workloads                                |
| Client  | Connects to a Host and sends inference requests                             |
| TeamGPU | Handles machine discovery, connectivity, and remote inference communication |

---

## The Vision

LAN-based GPU sharing is the beginning.

Our long-term vision is to build a decentralized GPU compute infrastructure where developers can access GPU resources beyond their local network.

We envision a future where:

- GPU owners can share their unused compute resources.
- Developers can access remote GPU compute on demand.
- AI engineers can run workloads on distributed GPU infrastructure.
- Developers can use GPU compute for inference, fine-tuning, training, and other compute-intensive workloads.

**Our goal is to make GPU compute more accessible, efficient, and collaborative.**

---

**TeamGPU — Share Compute. Build Without Limits.**

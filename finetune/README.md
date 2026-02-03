## Fine-tuning `openai/gpt-oss-20b` for G.R.E.T.E.L.

This repository can run `openai/gpt-oss-20b` via LM Studio / OpenAI-compatible endpoints. Fine-tuning is possible, and Unsloth provides a workflow that can:
- QLoRA fine-tune `gpt-oss-20b` on ~14GB VRAM (NVIDIA/CUDA)
- Export/merge the adapter back into a 16-bit model and export to llama.cpp / GGUF
- Use Harmony-compatible chat formatting during training/inference for best results

### Practical constraint (important)
Unsloth training is CUDA-focused. On Windows with an AMD GPU (like RX 9070 XT), the most reliable route is:
- Use Unsloth’s Colab notebook to fine-tune
- Export the merged model (or adapter)
- Run the result locally (LM Studio / llama.cpp)

### What to fine-tune for in G.R.E.T.E.L.
Your app benefits most from instruction-tuning on examples that:
- Produce a single JSON object with fields your UI expects (`text`, `schedule`, `priorities`, `isPlanDraft`, etc.)
- Respect “Key Facts” constraints (non-negotiables) and interview answers
- Avoid overlaps and keep chronological consistency

To preserve reasoning capability, Unsloth notes you should keep a mixture of reasoning and non-reasoning examples (their suggestion: ~75% reasoning / ~25% direct answers).

### Dataset format
The easiest format to keep compatible with both the Unsloth notebook and Harmony-style conversation encoding is JSONL with:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

For G.R.E.T.E.L., the assistant message should usually be the final JSON string (optionally wrapped in a ```json code fence).

### Recommended inference settings (from Unsloth guide)
For `gpt-oss`:
- temperature = 1.0
- top_p = 1.0
- top_k = 0
- minimum context: 16384
- max context: 131072

`gpt-oss` also supports a “reasoning effort” knob (low/medium/high). Higher reasoning effort improves accuracy but increases latency.

### Step-by-step: Fine-tune with Unsloth (SFT / QLoRA)
1) Create training samples
- Put one JSON file per example under `finetune/samples/` (see `finetune/samples/example.schedule-draft.json`).

2) Export to JSONL
- Run:

```bash
node scripts/export-finetune-jsonl.js --in finetune/samples --out finetune/out/train.jsonl
```

3) Train in Colab (recommended)
- Open Unsloth’s `gpt-oss-20b` fine-tuning notebook.
- Upload `finetune/out/train.jsonl` to Colab.
- Load it with `datasets.load_dataset("json", data_files=..., split="train")`.
- Use Unsloth’s Harmony encoding utilities if the notebook supports it (preferred for `gpt-oss`), otherwise use their provided chat template fixes.

4) Export the fine-tuned model for local inference
Unsloth supports merging a QLoRA adapter back into a 16-bit checkpoint:

```python
model.save_pretrained_merged(save_directory, tokenizer)
```

Then export/convert to llama.cpp / GGUF as shown in Unsloth’s instructions.

5) Run in G.R.E.T.E.L.
- Load the exported model into LM Studio and start the local server.
- In this repo, point `LM_STUDIO_BASE_URL` to your local server and set `LM_STUDIO_MODEL` to the exact model identifier LM Studio expects (or leave blank if you prefer “active model” behavior).

### If you want the most impact with the least data
Start with 50–200 high-quality examples that cover:
- Daily Kick-off draft schedule creation
- Schedule conflict resolution (lunch/meetings, event ops blocks)
- Editing schedule items (move, add, delete) while preserving constraints
- “Hello” / casual chat behavior without leaking thinking traces


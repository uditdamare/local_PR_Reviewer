# Local Ollama performance notes

Observations from running the GitLab MR reviewer against `qwen2.5-coder:7b`
on a laptop with an NVIDIA RTX 3050 (4GB VRAM, ~3.2GB free) and an AMD Radeon
integrated GPU.

## Low GPU utilization (~15-20%) does not mean the GPU has headroom

Two separate reasons for this, seen while reviewing a 19-file MR:

1. **Token generation is inherently sequential and tiny per step.**
   Decoding runs with `batch=1` — one token at a time, autoregressively.
   Each step does a small amount of compute per layer, so the GPU finishes
   its slice almost instantly and then sits idle waiting for the next step.
   Low utilization is expected during decode, not a sign of spare capacity.

2. **Only part of the model fits in VRAM.** With ~3.2GB free VRAM and a
   ~4.9GB Q4-quantized 7B model, Ollama only offloaded 12 of 28 layers to
   the GPU; the rest ran on CPU. For *every token*, computation has to
   relay: GPU computes its 12 layers → hands off activations to CPU → CPU
   computes its 16 layers (the slow part — a 6-core Ryzen laptop CPU doing
   7B-parameter matmuls) → back to GPU for the final layers. The GPU's low
   utilization is it waiting its turn in that relay; the CPU segment is the
   actual bottleneck.

Net effect: generation ran at **~5.3 tokens/sec**, and it's CPU-bound, not
GPU-bound. Increasing GPU utilization isn't the lever — either fit the
whole model in VRAM (smaller quantization, or a GPU with more free memory)
or use a smaller model that fits entirely in the ~3.2GB free VRAM so nothing
falls back to CPU.

## Small context window causes silent prompt truncation

The 7B model's context window is sized down from available VRAM
(`n_ctx=4096` observed in the `ollama serve` log). A 19-file MR produced a
~9,663-token prompt, which llama-server truncated to 2,050 tokens with no
error — just a warning in the server log:

```
level=WARN ... msg="truncating input prompt" limit=2050 prompt=9663 keep=4 new=2050
```

A "no findings" result under truncation doesn't mean the MR is clean — it
means most of the diff was silently invisible to the model. This is why the
reviewer now batches diffs into multiple LLM calls that each fit the
context budget (`REVIEW_BATCH_MAX_DIFF_CHARS` in
[`.env.example`](../.env.example)) instead of sending one giant prompt.

## Why an LLM alone can't be trusted for "no syntax errors"

Even with focused input (no truncation, no unrelated files), the LLM
missed an obvious commented-out closing brace (`-}` → `+// }`) across
multiple runs, at both 0.5B and 7B model sizes — and sometimes hallucinated
unrelated findings instead. Structural/syntax correctness is now checked
deterministically via the TypeScript parser
([`syntax-check.ts`](../src/utils/syntax-check.ts)), independent of model
quality, and merged into the review findings alongside whatever the LLM
reports.

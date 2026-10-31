# Ranking

The revised challenge plan makes ranking optional. No backend-built classical baseline is required
for public playback or the expanded feature release. Inference availability must not gate viewing.

Versioned model metadata and ranker protocol exist. No classical/CNN/Siamese model runs yet.
The ML researcher owns model development/training/evaluation and supplies the inference package.
Backend work is loading/adapting that package, inference parity, resource limits and reliable serving.
Follow `docs/model_handoff.md`; serving accepts only reviewed immutable weights and pinned inference code.
Keep uncalibrated candidate scores distinct from calibrated probabilities with referenced evidence.

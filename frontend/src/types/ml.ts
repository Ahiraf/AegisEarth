// ML integration point.
//
// The team has NOT defined what the model predicts, what it takes as input,
// or what it returns. So this file deliberately contains no result type:
// inventing one now would bake in guesses (classes, confidence scores, ...).
//
// When the model contract exists, add a new member to this union, e.g.
//   | { status: 'ready'; result: ... }
// and render it inside components/MlAnalysisPanel.tsx. Nothing else changes.

export type MlPanelState = { status: 'not-connected' };

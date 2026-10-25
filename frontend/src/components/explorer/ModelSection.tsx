import type { MlPanelState } from '../../types/ml';
import { Reveal } from '../Reveal';
import { SectionHeader } from '../SectionHeader';

type ModelSectionProps = {
  state: MlPanelState;
};

// The place where optional ML output will appear later. Nothing runs here today.
// When the model contract exists, render its result for the new MlPanelState member.
export function ModelSection({ state }: ModelSectionProps) {
  return (
    <Reveal id="model">
      <SectionHeader eyebrow="Analysis" title="Model analysis" />
      <div className="mcard">
        <p className="status-line">
          <span className="status-dot" aria-hidden="true" />
          {state.status === 'not-connected' ? 'ML analysis is not connected yet.' : 'ML analysis is connected.'}
        </p>
      </div>
    </Reveal>
  );
}

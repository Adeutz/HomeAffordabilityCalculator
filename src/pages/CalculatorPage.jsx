import { useInputs } from '../state/InputsContext.jsx';
import InputsPanel from '../components/InputsPanel.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';
import CalculatorHealthLights from '../components/CalculatorHealthLights.jsx';
import ShareButton from '../components/ShareButton.jsx';
import ExportPdfButton from '../components/ExportPdfButton.jsx';
import SaveScenarioButton from '../components/SaveScenarioButton.jsx';
import CalculatorModeSwitch from '../components/CalculatorModeSwitch.jsx';
import { useCalculatorScenario } from '../hooks/useCalculatorScenario.js';

export default function CalculatorPage() {
  const { inputs, update } = useInputs();
  const scenario = useCalculatorScenario();
  const isTargetMode = inputs.calculatorMode === 'target';

  return (
    <div>
      <div className="page-title">
        <h1>
          {isTargetMode
            ? 'Can I afford this house?'
            : 'How much house can I afford?'}
        </h1>
        <span className="subtitle">
          {isTargetMode
            ? "Enter the price you want to pay — we'll show what to change to make it work."
            : 'Drag the sliders to see what changes. Everything saves automatically.'}
        </span>
      </div>

      <CalculatorModeSwitch
        mode={inputs.calculatorMode}
        onChange={(mode) => update({ calculatorMode: mode })}
      />

      <div className="row page-toolbar mb-16">
        <ShareButton inputs={inputs} />
        <ExportPdfButton targetSelector="#calculator-pdf-target" filename="affordability.pdf" />
        <SaveScenarioButton />
      </div>

      <CalculatorHealthLights healthLevels={scenario.healthLevels} />

      <div id="calculator-pdf-target" className="grid grid-calculator">
        <InputsPanel />
        <ResultsPanel scenario={scenario} />
      </div>
    </div>
  );
}

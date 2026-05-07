import { useInputs } from '../state/InputsContext.jsx';
import InputsPanel from '../components/InputsPanel.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';
import ShareButton from '../components/ShareButton.jsx';
import ExportPdfButton from '../components/ExportPdfButton.jsx';
import SaveScenarioButton from '../components/SaveScenarioButton.jsx';

export default function CalculatorPage() {
  const { inputs } = useInputs();

  return (
    <div>
      <div className="page-title">
        <h1>How much house can I afford?</h1>
        <span className="subtitle">
          Drag the sliders to see what changes. Everything saves automatically.
        </span>
      </div>

      <div className="row mb-16">
        <ShareButton inputs={inputs} />
        <ExportPdfButton targetSelector="#calculator-pdf-target" filename="affordability.pdf" />
        <SaveScenarioButton />
      </div>

      <div id="calculator-pdf-target" className="grid grid-calculator">
        <InputsPanel />
        <ResultsPanel />
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './ui.jsx';

// Subtle Web Audio Click Synthesis for 3D tactile feedback
function playBeep(freq = 520, duration = 0.04, type = 'sine', muted = false) {
  if (muted) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

export default function CalculatorModal({ isOpen, onClose }) {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('pos_calc_history') || '[]');
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeKey, setActiveKey] = useState(null);
  const activeTimerRef = useRef(null);

  // Sync history to session
  useEffect(() => {
    try {
      sessionStorage.setItem('pos_calc_history', JSON.stringify(history.slice(0, 20)));
    } catch {}
  }, [history]);

  // Flash active key state for 3D depression effect
  const flashKey = useCallback((keyName) => {
    setActiveKey(keyName);
    clearTimeout(activeTimerRef.current);
    activeTimerRef.current = setTimeout(() => setActiveKey(null), 120);
  }, []);

  const inputDigit = useCallback((digit) => {
    playBeep(digit === '0' || digit === '00' ? 440 : 520, 0.04, 'sine', !soundEnabled);
    flashKey(digit);
    if (waitingForOperand) {
      setDisplay(String(digit));
      setWaitingForOperand(false);
    } else {
      if (digit === '00') {
        if (display === '0') return;
        setDisplay(display + '00');
      } else {
        setDisplay(display === '0' ? String(digit) : display + digit);
      }
    }
  }, [display, waitingForOperand, soundEnabled, flashKey]);

  const inputDecimal = useCallback(() => {
    playBeep(600, 0.04, 'sine', !soundEnabled);
    flashKey('.');
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
      setWaitingForOperand(false);
    }
  }, [display, waitingForOperand, soundEnabled, flashKey]);

  const clearAll = useCallback(() => {
    playBeep(320, 0.06, 'triangle', !soundEnabled);
    flashKey('AC');
    setDisplay('0');
    setPrevVal(null);
    setOperator(null);
    setWaitingForOperand(false);
    setExpression('');
  }, [soundEnabled, flashKey]);

  const backspace = useCallback(() => {
    playBeep(380, 0.04, 'sine', !soundEnabled);
    flashKey('back');
    if (waitingForOperand) return;
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  }, [display, waitingForOperand, soundEnabled, flashKey]);

  const toggleSign = useCallback(() => {
    playBeep(480, 0.04, 'sine', !soundEnabled);
    flashKey('±');
    const val = parseFloat(display);
    if (val !== 0) {
      setDisplay(String(-val));
    }
  }, [display, soundEnabled, flashKey]);

  const inputPercent = useCallback(() => {
    playBeep(560, 0.04, 'sine', !soundEnabled);
    flashKey('%');
    const cur = parseFloat(display);
    if (isNaN(cur)) return;
    let res;
    if (prevVal !== null && operator) {
      res = (prevVal * cur) / 100;
    } else {
      res = cur / 100;
    }
    setDisplay(String(res));
  }, [display, prevVal, operator, soundEnabled, flashKey]);

  // Quick cash additions for cashiers (+1,000, +5,000, etc.)
  const addQuickCash = useCallback((amount) => {
    playBeep(700, 0.05, 'sine', !soundEnabled);
    flashKey(`+${amount}`);
    const cur = parseFloat(display) || 0;
    const next = cur + amount;
    setDisplay(String(next));
    setWaitingForOperand(false);
  }, [display, soundEnabled, flashKey]);

  const performOp = useCallback((nextOp) => {
    playBeep(580, 0.05, 'sine', !soundEnabled);
    flashKey(nextOp);
    const inputValue = parseFloat(display);

    if (prevVal === null) {
      setPrevVal(inputValue);
      setExpression(`${formatNumber(inputValue)} ${nextOp}`);
    } else if (operator) {
      const currentVal = prevVal || 0;
      let result = currentVal;
      switch (operator) {
        case '+': result = currentVal + inputValue; break;
        case '−':
        case '-': result = currentVal - inputValue; break;
        case '×':
        case '*': result = currentVal * inputValue; break;
        case '÷':
        case '/':
          result = inputValue === 0 ? 'Error' : currentVal / inputValue;
          break;
        default: break;
      }

      if (result === 'Error') {
        setDisplay('Error');
        setPrevVal(null);
        setOperator(null);
        setWaitingForOperand(true);
        setExpression('');
        return;
      }

      setPrevVal(result);
      setDisplay(String(result));
      setExpression(`${formatNumber(result)} ${nextOp}`);
    }

    setWaitingForOperand(true);
    setOperator(nextOp);
  }, [display, prevVal, operator, soundEnabled, flashKey]);

  const calculateEquals = useCallback(() => {
    playBeep(680, 0.08, 'triangle', !soundEnabled);
    flashKey('=');
    if (operator === null || prevVal === null) return;

    const inputValue = parseFloat(display);
    let result = prevVal;

    switch (operator) {
      case '+': result = prevVal + inputValue; break;
      case '−':
      case '-': result = prevVal - inputValue; break;
      case '×':
      case '*': result = prevVal * inputValue; break;
      case '÷':
      case '/':
        result = inputValue === 0 ? 'Error' : prevVal / inputValue;
        break;
      default: break;
    }

    const fullExpr = `${formatNumber(prevVal)} ${operator} ${formatNumber(inputValue)} =`;

    if (result === 'Error') {
      setDisplay('Error');
    } else {
      const rounded = Math.round(result * 10000000) / 10000000;
      setDisplay(String(rounded));
      setHistory(h => [{ expr: fullExpr, result: formatNumber(rounded), time: new Date().toLocaleTimeString('en-GB') }, ...h]);
    }

    setExpression(fullExpr);
    setPrevVal(null);
    setOperator(null);
    setWaitingForOperand(true);
  }, [operator, prevVal, display, soundEnabled, flashKey]);

  // Copy result to clipboard
  const copyResult = () => {
    navigator.clipboard.writeText(display).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        inputDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        inputDecimal();
      } else if (e.key === '+' || e.key === '-') {
        e.preventDefault();
        performOp(e.key === '-' ? '−' : '+');
      } else if (e.key === '*') {
        e.preventDefault();
        performOp('×');
      } else if (e.key === '/') {
        e.preventDefault();
        performOp('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculateEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        clearAll();
      } else if (e.key === '%') {
        e.preventDefault();
        inputPercent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, inputDigit, inputDecimal, performOp, calculateEquals, backspace, clearAll, inputPercent, onClose]);

  if (!isOpen) return null;

  const formattedDisplay = formatDisplay(display);

  return (
    <div className="calc-modal-backdrop" onClick={onClose}>
      <div className="calc-3d-container" onClick={(e) => e.stopPropagation()}>
        {/* 3D Top Status Bar */}
        <div className="calc-top-header">
          <div className="calc-title-box">
            <span className="calc-3d-badge">
              <Icon name="calculator" size={15} />
              <b>3D POS Calc</b>
            </span>
            <span className="calc-sub-hint desktop-only">ကီးဘုတ်ဖြင့်လည်း ရိုက်နိုင်ပါသည်</span>
          </div>

          <div className="calc-header-controls">
            <button
              type="button"
              className={`calc-tool-btn ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory(!showHistory)}
              title="မှတ်တမ်း ကြည့်မည်"
            >
              <Icon name="clock" size={16} />
              {history.length > 0 && <span className="calc-history-badge">{history.length}</span>}
            </button>

            <button
              type="button"
              className={`calc-tool-btn ${soundEnabled ? 'active' : ''}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'အသံ ပိတ်မည်' : 'အသံ ဖွင့်မည်'}
            >
              <Icon name={soundEnabled ? 'volume' : 'volumeMute'} size={16} />
            </button>

            <button
              type="button"
              className="calc-close-btn"
              onClick={onClose}
              title="ပိတ်မည်"
              aria-label="Close Calculator"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Dynamic Display Area (LCD Bezel look) */}
        <div className="calc-lcd-screen">
          <div className="calc-expression-line">
            {expression || '\u00A0'}
          </div>

          <div className="calc-main-display">
            <span className="calc-digits" title={display}>
              {formattedDisplay}
            </span>

            <button
              type="button"
              className={`calc-copy-pill ${copied ? 'copied' : ''}`}
              onClick={copyResult}
              title="အဖြေ ကူးယူမည်"
            >
              <Icon name="copy" size={13} />
              <span>{copied ? 'ကူးပြီး!' : 'ကူးယူ'}</span>
            </button>
          </div>
        </div>

        {/* Quick Kyat Amounts Bar (Cashier Friendly) */}
        <div className="calc-quick-bar">
          <button type="button" className="calc-quick-chip" onClick={() => addQuickCash(1000)}>+1,000</button>
          <button type="button" className="calc-quick-chip" onClick={() => addQuickCash(5000)}>+5,000</button>
          <button type="button" className="calc-quick-chip" onClick={() => addQuickCash(10000)}>+10,000</button>
          <button type="button" className="calc-quick-chip" onClick={() => addQuickCash(50000)}>+50,000</button>
        </div>

        {/* Calculation History Overlay Drawer */}
        {showHistory && (
          <div className="calc-history-drawer">
            <div className="calc-history-head">
              <strong>လတ်တလော တွက်ချက်မှုများ</strong>
              <button
                type="button"
                className="link-btn small"
                onClick={() => setHistory([])}
              >
                ရှင်းမည်
              </button>
            </div>
            {history.length === 0 ? (
              <div className="calc-history-empty">မှတ်တမ်း မရှိသေးပါ</div>
            ) : (
              <div className="calc-history-list">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="calc-history-item"
                    onClick={() => {
                      setDisplay(h.result.replace(/,/g, ''));
                      setWaitingForOperand(true);
                      setShowHistory(false);
                    }}
                  >
                    <div className="chi-expr">{h.expr}</div>
                    <div className="chi-res">{h.result} Ks</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3D Modern Tactile Keypad */}
        <div className="calc-3d-keypad">
          {/* Row 1: Clear, Backspace, Percent, Divide */}
          <button
            type="button"
            className={`key-3d func ${activeKey === 'AC' ? 'pressed' : ''}`}
            onClick={clearAll}
          >
            <span>AC</span>
          </button>
          <button
            type="button"
            className={`key-3d func ${activeKey === 'back' ? 'pressed' : ''}`}
            onClick={backspace}
            title="နောက်ပြန်ဖျက်"
          >
            <span>⌫</span>
          </button>
          <button
            type="button"
            className={`key-3d func ${activeKey === '%' ? 'pressed' : ''}`}
            onClick={inputPercent}
          >
            <span>%</span>
          </button>
          <button
            type="button"
            className={`key-3d op ${activeKey === '÷' || operator === '÷' ? 'pressed op-active' : ''}`}
            onClick={() => performOp('÷')}
          >
            <span>÷</span>
          </button>

          {/* Row 2: 7, 8, 9, Multiply */}
          <button
            type="button"
            className={`key-3d num ${activeKey === '7' ? 'pressed' : ''}`}
            onClick={() => inputDigit('7')}
          >
            <span>7</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '8' ? 'pressed' : ''}`}
            onClick={() => inputDigit('8')}
          >
            <span>8</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '9' ? 'pressed' : ''}`}
            onClick={() => inputDigit('9')}
          >
            <span>9</span>
          </button>
          <button
            type="button"
            className={`key-3d op ${activeKey === '×' || operator === '×' ? 'pressed op-active' : ''}`}
            onClick={() => performOp('×')}
          >
            <span>×</span>
          </button>

          {/* Row 3: 4, 5, 6, Subtract */}
          <button
            type="button"
            className={`key-3d num ${activeKey === '4' ? 'pressed' : ''}`}
            onClick={() => inputDigit('4')}
          >
            <span>4</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '5' ? 'pressed' : ''}`}
            onClick={() => inputDigit('5')}
          >
            <span>5</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '6' ? 'pressed' : ''}`}
            onClick={() => inputDigit('6')}
          >
            <span>6</span>
          </button>
          <button
            type="button"
            className={`key-3d op ${activeKey === '−' || operator === '−' ? 'pressed op-active' : ''}`}
            onClick={() => performOp('−')}
          >
            <span>−</span>
          </button>

          {/* Row 4: 1, 2, 3, Add */}
          <button
            type="button"
            className={`key-3d num ${activeKey === '1' ? 'pressed' : ''}`}
            onClick={() => inputDigit('1')}
          >
            <span>1</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '2' ? 'pressed' : ''}`}
            onClick={() => inputDigit('2')}
          >
            <span>2</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '3' ? 'pressed' : ''}`}
            onClick={() => inputDigit('3')}
          >
            <span>3</span>
          </button>
          <button
            type="button"
            className={`key-3d op ${activeKey === '+' || operator === '+' ? 'pressed op-active' : ''}`}
            onClick={() => performOp('+')}
          >
            <span>+</span>
          </button>

          {/* Row 5: 0, 00 (Kyat Friendly), Decimal, Equals */}
          <button
            type="button"
            className={`key-3d num ${activeKey === '0' ? 'pressed' : ''}`}
            onClick={() => inputDigit('0')}
          >
            <span>0</span>
          </button>
          <button
            type="button"
            className={`key-3d num subtle ${activeKey === '00' ? 'pressed' : ''}`}
            onClick={() => inputDigit('00')}
          >
            <span>00</span>
          </button>
          <button
            type="button"
            className={`key-3d num ${activeKey === '.' ? 'pressed' : ''}`}
            onClick={inputDecimal}
          >
            <span>.</span>
          </button>
          <button
            type="button"
            className={`key-3d equals ${activeKey === '=' ? 'pressed' : ''}`}
            onClick={calculateEquals}
          >
            <span>=</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to format numeric display with commas while typing
function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toLocaleString();
}

function formatDisplay(rawStr) {
  if (rawStr === 'Error') return 'Error';
  const parts = rawStr.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInt = (parseFloat(integerPart) || 0).toLocaleString();
  if (decimalPart !== undefined) {
    return `${integerPart === '-0' ? '-0' : formattedInt}.${decimalPart}`;
  }
  return integerPart === '-0' ? '-0' : formattedInt;
}

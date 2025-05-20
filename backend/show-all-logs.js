// Script to set unlimited console output
process.stdout.columns = Infinity;
process.stdout.rows = Infinity;

// Override console methods to prevent truncation
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

// Function to ensure full output without truncation
function fullOutput(originalFn) {
  return function(...args) {
    const stringArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    });
    originalFn.apply(console, stringArgs);
  };
}

// Replace console methods with our non-truncating versions
console.log = fullOutput(originalConsoleLog);
console.info = fullOutput(originalConsoleInfo);
console.warn = fullOutput(originalConsoleWarn);
console.error = fullOutput(originalConsoleError);
console.debug = fullOutput(originalConsoleDebug);

console.log('Console configured for unlimited log output');

// Export a function to configure logs
export function configureFullLogs() {
  console.log('Full logs configured');
  return true;
}

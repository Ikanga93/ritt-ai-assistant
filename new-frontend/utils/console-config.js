// Configure console to show unlimited log output
export function configureConsoleForFullLogs() {
  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalConsoleDebug = console.debug;

  // Function to ensure full output without truncation
  function fullOutput(originalFn) {
    return function(...args) {
      // Process each argument to ensure full display
      const processedArgs = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            // For objects, ensure full depth and array length
            return JSON.parse(JSON.stringify(arg, null, 2));
          } catch (e) {
            return arg;
          }
        }
        return arg;
      });
      
      // Call the original function with processed arguments
      originalFn.apply(console, processedArgs);
    };
  }

  // Replace console methods with our non-truncating versions
  console.log = fullOutput(originalConsoleLog);
  console.info = fullOutput(originalConsoleInfo);
  console.warn = fullOutput(originalConsoleWarn);
  console.error = fullOutput(originalConsoleError);
  console.debug = fullOutput(originalConsoleDebug);

  // Set console depth to maximum
  console.dir.defaultOptions = { depth: null };
  
  console.log('Console configured for unlimited log output');
}

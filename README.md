# VLE Auto Completer

Chrome extension to automate VLE course completion using direct API calls.

## Features

- Auto-detect number of modules
- Skip assessment modules
- Real progress tracking
- Direct API integration
- Clean and modern UI

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Usage

1. Navigate to any VLE course page
2. Click the extension icon in the toolbar
3. Click "Start" to begin auto-completion
4. Monitor progress in the extension panel

## Code Review

### Architecture

The extension consists of two main components:
- `manifest.json`: Extension configuration and permissions
- `content.js`: Core business logic and UI implementation

### Key Components

1. **Module Detection**
```javascript
const detectModuleCount = () => {
    let count = 0;
    while (document.querySelector(`.auto_${count}`)) {
        count++;
    }
    return count;
};
```
Dynamically detects total module count by scanning DOM elements.

2. **Progress Tracking**
```javascript
const initializeProgress = () => {
    CONFIG.MAX_MODULES = detectModuleCount();
    completedModules.clear();
    // ... track completed modules
};
```
Maintains accurate progress state using Set data structure.

3. **API Integration**
```javascript
const callProgressAPI = async (dataId) => {
    // Multiple position variants for compatibility
    const POSITION_VARIANTS = ['300', '594', '99999'];
    // ... smart retry logic with different positions
};
```
Robust API calling with retry mechanism and multiple position variants.

4. **UI Components**
```javascript
const createPanel = () => {
    // Modern UI with progress bar
    // Real-time updates
    // Clean animations
};
```
Responsive panel with live progress updates.

### Security Considerations

1. **CSRF Protection**
- Automatically extracts and includes CSRF token
- Validates all API responses
- Uses secure cookie handling

2. **Error Handling**
- Graceful fallbacks for API failures
- Clear error messaging
- Network error recovery

3. **Data Validation**
- Sanitizes all API inputs
- Validates server responses
- Prevents XSS via proper DOM manipulation

### Performance Optimizations

1. **Network**
- Minimal API calls
- Smart retry mechanism
- Efficient progress tracking

2. **DOM Operations**
- Cached selectors
- Batched updates
- Efficient event handling

3. **Memory Management**
- Proper cleanup on completion
- Minimal state storage
- Event listener cleanup

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main extension logic

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change. 
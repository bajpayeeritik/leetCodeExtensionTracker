# Coding Platform Session Tracker Chrome Extension

A Chrome extension that tracks session lifecycle events on coding platform pages like LeetCode, GeeksforGeeks, and HackerRank. The extension monitors user activity, tracks time accurately, and reports events to a backend service.

## Features

### 🎯 Session Lifecycle Detection
- **Session Start**: Automatically detects when arriving on a problem page
- **In-Progress Signals**: Tracks code edits, submissions, and user activity
- **Submission Outcomes**: Monitors for accepted solutions, wrong answers, runtime errors
- **Session End**: Detects navigation away, tab closure, or explicit stop

### ⏱️ Accurate Time Tracking
- **Start Timestamp**: Records when session begins
- **Active Focus Time**: Pauses when tab/window loses focus
- **Idle Detection**: Excludes time when no keyboard/mouse activity for N seconds
- **Duration Calculations**: Total active duration and wall-clock duration

### 📊 Backend Reporting
- **ProblemDetected**: When arriving on a problem page
- **ProblemSessionStarted**: Session initialization
- **ProblemProgress**: Periodic heartbeats and progress updates
- **ProblemSubmitted**: Code submission attempts
- **ProblemSessionEnded**: Session completion with full metrics

## Supported Platforms

- **LeetCode** (`leetcode.com/problems/*`)
- **GeeksforGeeks** (`geeksforgeeks.org/problems/*`)
- **HackerRank** (`hackerrank.com/challenges/*`)

## Installation

### Method 1: Load Unpacked Extension (Development)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension should now appear in your extensions list

### Method 2: Build and Install

1. Clone the repository
2. Run `npm install` (if you have package.json dependencies)
3. Build the extension if needed
4. Follow Method 1 steps

## Configuration

### Backend Setup

1. **API Key**: Set your backend API key in the extension settings
2. **Backend URL**: Configure your backend endpoint (default: `https://your-backend-api.com/api`)
3. **Idle Threshold**: Set idle timeout in milliseconds (default: 30 seconds)

### Settings Access

- Click the extension icon in your Chrome toolbar
- Navigate to the "Settings" section
- Enter your API key and backend URL
- Click "Save Settings"

## Usage

### Automatic Tracking

Once installed and configured, the extension automatically:

1. **Detects** when you visit a supported coding platform
2. **Starts** tracking your session when you arrive at a problem page
3. **Monitors** your activity (typing, mouse movement, scrolling)
4. **Tracks** code submissions and results
5. **Reports** all events to your backend service

### Manual Controls

- **End Session**: Manually end the current session
- **Pause Session**: Temporarily pause tracking
- **Export Data**: Download session data as JSON
- **Clear Events**: Remove stored event history

### Session Status

The extension shows real-time status:
- 🟢 **Active**: Session is running and tracking
- 🟡 **Paused**: Session is paused (tab not focused)
- 🔴 **No Session**: Not on a supported platform

## Backend API Integration

### Event Endpoint

```
POST /api/events
```

### Request Headers

```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
X-Event-Type: EVENT_TYPE
```

### Event Types

#### ProblemSessionStarted
```json
{
  "eventType": "ProblemSessionStarted",
  "data": {
    "sessionId": "session_1234567890_abc123",
    "platform": "leetcode",
    "problemId": "two-sum",
    "timestamp": 1640995200000
  }
}
```

#### ProblemProgress
```json
{
  "eventType": "ProblemProgress",
  "data": {
    "sessionId": "session_1234567890_abc123",
    "event": "heartbeat",
    "timestamp": 1640995230000,
    "activeTime": 30000,
    "wallClockTime": 30000
  }
}
```

#### ProblemSubmitted
```json
{
  "eventType": "ProblemSubmitted",
  "data": {
    "sessionId": "session_1234567890_abc123",
    "action": "Submit",
    "timestamp": 1640995260000,
    "activeTime": 60000
  }
}
```

#### ProblemSessionEnded
```json
{
  "eventType": "ProblemSessionEnded",
  "data": {
    "sessionId": "session_1234567890_abc123",
    "platform": "leetcode",
    "problemId": "two-sum",
    "startTime": 1640995200000,
    "endTime": 1640995500000,
    "totalActiveTime": 300000,
    "totalWallClockTime": 300000,
    "events": [...]
  }
}
```

## Architecture

### Content Script (`content.js`)
- Runs on supported platform pages
- Detects user activity and platform-specific events
- Manages session lifecycle and timing
- Sends events to background script

### Background Script (`background.js`)
- Service worker for extension management
- Handles backend communication
- Manages tab lifecycle and session state
- Implements retry logic and offline queuing

### Popup Interface (`popup.html/js/css`)
- User interface for extension settings
- Real-time session status display
- Event history and data export
- Configuration management

## Development

### File Structure

```
├── manifest.json          # Extension configuration
├── content.js            # Content script for page monitoring
├── background.js         # Background service worker
├── popup.html           # Extension popup interface
├── popup.css            # Popup styling
├── popup.js             # Popup functionality
├── icons/               # Extension icons
└── README.md            # This file
```

### Key Classes

- **SessionTracker**: Main session tracking logic
- **BackgroundManager**: Backend communication and state management
- **PopupManager**: User interface management

### Event Flow

1. User visits coding platform → Content script detects platform
2. Session starts → ProblemSessionStarted event sent
3. User activity → Heartbeat and progress events
4. Code submission → ProblemSubmitted event
5. Session ends → ProblemSessionEnded event with full metrics

## Troubleshooting

### Common Issues

1. **Extension not working**: Check if it's enabled and has proper permissions
2. **Events not sending**: Verify API key and backend URL in settings
3. **Session not starting**: Ensure you're on a supported platform page
4. **Time tracking inaccurate**: Check idle threshold settings

### Debug Mode

- Open Chrome DevTools on any page
- Check Console for extension logs
- Look for "Session Event:" messages
- Verify background script is running in Extensions page

### Permissions

The extension requires:
- `storage`: Save settings and event data
- `tabs`: Monitor tab lifecycle
- `activeTab`: Access current tab information
- `scripting`: Inject content scripts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check the troubleshooting section
- Review the code comments for implementation details

---

**Note**: This extension is designed for educational and productivity purposes. Ensure compliance with platform terms of service and respect user privacy when implementing backend services.

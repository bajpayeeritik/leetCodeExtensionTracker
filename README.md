# Session Tracker Extension

A Chrome extension that tracks coding session lifecycle events on platforms like LeetCode, GeeksforGeeks, and HackerRank. The extension provides comprehensive session monitoring with offline resilience and detailed analytics.

## ✨ Features

### 🎯 **Session Tracking**
- **Automatic Detection**: Detects when you're working on coding problems
- **Real-time Monitoring**: Tracks active time, keystrokes, runs, and submissions
- **Platform Support**: Works with LeetCode, GeeksforGeeks, and HackerRank
- **Focus Awareness**: Pauses tracking when tab loses focus or becomes idle

### 🔧 **Settings & Configuration**
- **Backend Configuration**: Configurable backend URL and API key
- **User Management**: Unique user ID for session tracking
- **Behavior Tuning**: Adjustable idle threshold and heartbeat intervals
- **Persistent Storage**: Settings saved using Chrome sync storage

### 🚀 **Resilience & Reliability**
- **Offline Queue**: Events queued when backend is unavailable
- **Retry Logic**: Exponential backoff with jitter for failed requests
- **Data Persistence**: Local storage for events and retry queue
- **Network Monitoring**: Automatic detection of online/offline status

### 📊 **Analytics & Insights**
- **Session Metrics**: Active time, wall clock time, and counters
- **Event Logging**: Comprehensive event tracking and history
- **Export Functionality**: Data export for analysis and backup
- **Real-time Status**: Live session status in popup

## 🏗️ Architecture

### **Manifest V3 Compliance**
- Service worker background script
- Content scripts with precise URL matching
- Proper host permissions for security

### **Message Flow**
```
Content Script → Background Script → Backend API
     ↓              ↓              ↓
  DOM Events → Session State → Data Storage
```

### **Storage Strategy**
- **Chrome Storage Sync**: Settings and user preferences
- **Chrome Storage Local**: Events, retry queue, and session data
- **Memory**: Active session state and counters

## 📁 File Structure

```
extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker background script
├── content.js            # Content script for problem pages
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── popup.css             # Popup styling
├── options.html          # Settings page
├── options.js            # Settings management
├── mock-server.js        # Node.js mock server for testing
├── icons/                # Extension icons
└── README.md             # This file
```

## 🚀 Installation & Setup

### **1. Load Extension**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the extension folder
4. The extension icon should appear in your toolbar

### **2. Configure Settings**
1. Click the extension icon to open the popup
2. Click "Settings" to open the options page
3. Configure:
   - **Backend URL**: `http://localhost:8082` (for local testing)
   - **User ID**: Your unique identifier
   - **Idle Threshold**: Time before session becomes idle (default: 60s)
   - **Heartbeat Interval**: Progress update frequency (default: 30s)
4. Click "Save Settings"

### **3. Test Backend Connection**
1. In the options page, click "Test Backend Connection"
2. Ensure your backend is running and accessible
3. Verify the connection test passes

## 🧪 Testing with Mock Server

### **Start Mock Server**
```bash
cd extension
node mock-server.js
```

The server will start on `http://localhost:8082` and provide:
- **Health Check**: `GET /api/health`
- **Statistics**: `GET /api/stats`
- **Problem Detection**: `POST /api/v1/problems/detect`
- **Event Processing**: `POST /api/v1/problems/events`

### **Test Extension**
1. Start the mock server
2. Load the extension in Chrome
3. Navigate to a LeetCode problem page
4. Check the mock server console for incoming requests
5. Verify events are being processed correctly

## 🔌 Backend Integration

### **Required Endpoints**

#### **Problem Detection**
```
POST /api/v1/problems/detect
Content-Type: application/json
Authorization: Bearer {apiKey} (optional)

{
  "userId": "user123",
  "platform": "leetcode",
  "problemTitle": "Two Sum",
  "problemUrl": "https://leetcode.com/problems/two-sum"
}
```

#### **Event Processing**
```
POST /api/v1/problems/events
Content-Type: application/json
Authorization: Bearer {apiKey} (optional)

{
  "eventType": "ProblemSessionStarted",
  "data": {
    "userId": "user123",
    "platform": "leetcode",
    "problemId": "problem_123",
    "problemTitle": "Two Sum",
    "expectedTime": 1800
  },
  "timestamp": 1640995200000
}
```

### **Event Types**
- `ProblemSessionStarted`: Session begins
- `ProblemProgress`: Heartbeat and progress updates
- `ProblemSubmitted`: Code submission events
- `ProblemSessionEnded`: Session completion

## 🎨 Platform-Specific Features

### **LeetCode**
- **Title Extraction**: Multiple selector fallbacks for robust detection
- **Button Monitoring**: Run and Submit button tracking
- **Verdict Detection**: Success/error message monitoring

### **GeeksforGeeks**
- **Title Detection**: Entry title extraction
- **Action Tracking**: Run and Submit button monitoring
- **Result Monitoring**: Success/error message detection

### **HackerRank**
- **Challenge Detection**: Challenge page identification
- **Code Actions**: Run Code and Submit Code tracking
- **Result Analysis**: Result panel monitoring

## 🔧 Configuration Options

### **Settings Storage**
- **Backend URL**: Your Spring Boot microservice endpoint
- **API Key**: Optional authorization token
- **User ID**: Unique identifier for session tracking
- **Idle Threshold**: Seconds before session becomes idle
- **Heartbeat Interval**: Seconds between progress updates

### **Default Values**
```javascript
{
  backendUrl: 'http://localhost:8082',
  apiKey: '',
  userId: '',
  idleThreshold: 60,        // 60 seconds
  heartbeatInterval: 30     // 30 seconds
}
```

## 📊 Monitoring & Debugging

### **Extension Console**
- Open DevTools on any page with the extension
- Check console for session events and errors
- Monitor message passing between content and background scripts

### **Background Script Logs**
- Go to `chrome://extensions/`
- Find your extension and click "service worker"
- View console logs for background script activity

### **Storage Inspection**
- Use Chrome DevTools → Application → Storage
- Inspect Chrome Storage Local and Sync
- Check events, retry queue, and settings

### **Network Monitoring**
- Open DevTools → Network tab
- Filter by your backend domain
- Monitor API requests and responses

## 🚨 Troubleshooting

### **Common Issues**

#### **Extension Not Working**
1. Check if content script is injected (DevTools console)
2. Verify manifest.json permissions
3. Ensure target URLs match content script patterns
4. Check background script service worker status

#### **Backend Connection Fails**
1. Verify backend URL in settings
2. Check if backend is running and accessible
3. Test with mock server first
4. Verify CORS configuration on backend

#### **Events Not Being Sent**
1. Check user ID configuration
2. Verify backend endpoint URLs
3. Monitor retry queue in storage
4. Check network connectivity

#### **Session Tracking Issues**
1. Verify platform detection logic
2. Check DOM selectors for target elements
3. Monitor mutation observer activity
4. Verify event listener attachment

### **Debug Mode**
Enable detailed logging by setting in background script:
```javascript
const DEBUG = true;
```

## 🔒 Security Considerations

### **Data Privacy**
- No code or solutions are captured
- Only metadata and session metrics are tracked
- User ID is configurable and not auto-generated
- All data is stored locally first

### **Permissions**
- **Storage**: For settings and session data
- **Tabs**: For session management
- **Active Tab**: For current tab information
- **Scripting**: For content script injection

### **Host Permissions**
- Limited to coding platform domains
- Local development support (localhost:8082)
- Production API endpoints configurable

## 🚀 Performance Optimization

### **Efficient Monitoring**
- Debounced mutation observer
- Configurable heartbeat intervals
- Smart idle detection
- Minimal DOM querying

### **Memory Management**
- Limited event history (100 events)
- Automatic cleanup of old data
- Efficient retry queue management
- Session state cleanup on completion

## 📈 Future Enhancements

### **Planned Features**
- **Analytics Dashboard**: Session history and insights
- **Goal Setting**: Time targets and progress tracking
- **Team Collaboration**: Shared session data
- **Advanced Metrics**: Code complexity analysis

### **Platform Expansion**
- **CodeForces**: Competitive programming support
- **AtCoder**: Japanese competitive platform
- **Custom Platforms**: Configurable platform definitions

## 🤝 Contributing

### **Development Setup**
1. Clone the repository
2. Load extension in Chrome developer mode
3. Make changes to source files
4. Test with mock server
5. Reload extension to see changes

### **Testing Checklist**
- [ ] Extension loads without errors
- [ ] Settings are saved and loaded correctly
- [ ] Content script injects on target pages
- [ ] Session tracking starts automatically
- [ ] Events are sent to backend
- [ ] Offline queue works correctly
- [ ] Retry logic functions properly
- [ ] Popup displays current session status

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Chrome Extension APIs for robust extension development
- LeetCode, GeeksforGeeks, and HackerRank for coding platforms
- Spring Boot community for backend integration patterns
- Open source community for development tools and libraries

---

**Happy Coding! 🚀**

For issues and questions, please check the troubleshooting section or create an issue in the repository.

# PDFSpark Memory Monitoring Dashboard

This dashboard provides real-time memory monitoring and diagnostic tools for the PDFSpark backend application.

## Accessing the Dashboard

The dashboard is available at:

```
http://your-server-url/admin/memory
```

In development mode, you can access it directly without an API key. In production, you must provide an admin API key either:

1. Via query parameter: `/admin/memory?key=YOUR_API_KEY`
2. Via the X-API-Key header
3. By entering the key in the dashboard's authentication modal

## Features

- **Real-time Memory Monitoring**: View current memory usage, heap statistics, and system information
- **Memory Trend Analysis**: Track memory usage over time to identify leaks and patterns
- **Memory Leak Detection**: Automatic detection of potential memory leaks with probability assessment
- **Garbage Collection Controls**: Trigger standard, aggressive, or emergency garbage collection
- **Storage Statistics**: Monitor in-memory data store usage
- **Anomaly Detection**: Identify unusual memory patterns

## Using the Dashboard

The dashboard is organized into four main tabs:

1. **Dashboard**: Overview of current memory status, leak probability, and system information
2. **Memory Trends**: Detailed charts and analysis of memory usage over time
3. **Actions**: Controls for triggering garbage collection and memory history tracking
4. **Advanced**: Raw diagnostic data for detailed troubleshooting

### Memory Status Indicators

The dashboard uses color-coded indicators to show memory status:

- **Green**: Normal memory usage
- **Yellow**: Elevated memory usage (warning)
- **Orange**: High memory usage (critical)
- **Red**: Extremely high memory usage (emergency)

### Memory Recovery Actions

When memory issues are detected, you can use the Actions tab to trigger recovery:

1. **Run Garbage Collection**: Standard V8 garbage collection
2. **Aggressive Cleanup**: More thorough cleanup that releases references to cached data
3. **Emergency Cleanup**: Most aggressive cleanup that attempts to free all non-essential memory

### Memory History Tracking

For more detailed analysis, you can enable memory history tracking:

1. Click "Start Memory History Tracking" in the Actions tab
2. The system will begin collecting detailed memory metrics over time
3. View the results in the Memory Trends tab
4. Stop tracking when no longer needed to reduce overhead

## Security

- In production, the dashboard requires an admin API key
- Dashboard access should be restricted to authorized personnel only
- The memory dashboard is not meant to be publicly accessible
// Runtime configuration for the Smart Digital Notice Board static frontend.
// In development or local Raspberry Pi deployment, configure apiBaseUrl to point to the backend.
// Leave as empty string to use relative path (same host/proxy) or standalone offline mode.
window.APP_CONFIG = {
  apiBaseUrl: window.location.port === '5000' ? window.location.origin : 'http://127.0.0.1:5000'
};

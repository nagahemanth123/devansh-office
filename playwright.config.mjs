import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', ...devices['Desktop Chrome'] },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Same as `python3 -m http.server 4173`, with a deeper accept queue: the default of 5 resets connections when workers load pages at once.
    command: `python3 -c "import http.server as h; h.ThreadingHTTPServer.request_queue_size = 128; h.test(HandlerClass=h.SimpleHTTPRequestHandler, port=4173)"`,
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
  },
});

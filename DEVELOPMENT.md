# Thrumshift development notes

## Testing Web Bluetooth on a phone over HTTPS

Web Bluetooth requires a secure context. `http://localhost` is acceptable only on the same device as the browser, so opening the development computer's plain HTTP LAN address from a phone does not enable Web Bluetooth.

For temporary hardware testing, a Cloudflare Quick Tunnel can expose the local Vite development server at a trusted HTTPS URL. This is a development aid, not deployment configuration.

### Prerequisites

- Node and npm dependencies installed as described in `README.md`
- `cloudflared` installed on the development computer (`brew install cloudflared` on macOS)
- The phone and heart-rate monitor available for testing

### Start the tunnel

In terminal A, run:

```sh
cloudflared tunnel --url http://127.0.0.1:5173
```

Copy the generated hostname, without `https://` or a trailing path. It resembles:

```text
random-words.trycloudflare.com
```

Keep the tunnel running. Quick Tunnel hostnames are temporary and normally change each time the tunnel starts.

### Start the development server

In terminal B, replace the example hostname with the one printed by `cloudflared`:

```sh
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=random-words.trycloudflare.com \
  npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Using the environment variable keeps the temporary hostname out of `vite.config.ts`. Do not set `server.allowedHosts` to `true`, and do not commit a random Quick Tunnel hostname.

Open the full `https://random-words.trycloudflare.com` URL in Android Chrome. The development diagnostics should be present, the insecure-context message should be absent, and “Choose heart-rate monitor” should be enabled after selecting Web Bluetooth.

`npm run preview` intentionally has no diagnostics or connection controls. Production builds exclude the development harness.

### Troubleshooting

If Vite reports that the tunnel host is not allowed:

1. Confirm the environment variable contains only the exact current hostname.
2. Restart Vite after setting the variable; an already-running process does not receive it.
3. Keep both the tunnel origin and Vite bound explicitly to `127.0.0.1`.
4. Check for stale servers with `lsof -nP -iTCP:5173 -sTCP:LISTEN`. Stop old Vite processes from their original terminals.
5. If the tunnel was restarted, update the environment variable for its new hostname and restart Vite again.

If the page loads but Web Bluetooth remains unavailable, confirm the phone URL begins with `https://`, use Chrome on Android, and ensure the monitor is not already connected to another phone, computer, or fitness application.

### Security and cleanup

A Quick Tunnel URL is publicly reachable while it is running. Do not share it or expose secrets through the development server. Stop both Vite and `cloudflared` with `Ctrl+C` when testing is complete.

No tunnel credentials, hostnames, certificates, or provider configuration belong in the repository.

## Phase 3 hardware observations

Observed during Phase 3 review on July 11, 2026:

- A Moofit HR6 connected successfully in desktop Chrome `148.0.7778.216` (arm64).
- The complete desktop Chrome checklist passed: connection, live BPM, intentional disconnect, retry without duplicate notifications, and chooser cancellation/denial behavior.
- RR data was received; observed notifications contained either one or two RR intervals.
- An HTTP LAN-IP test on the phone correctly reported the secure-context requirement.
- The complete HTTPS mobile Chrome checklist passed on a Pixel 7a running Android 16 (`CP1A.260505.005`, API 36) in Chrome `150.0.7871.63` (64-bit): monitor connection, live BPM and RR display, intentional disconnect, retry without duplicate notifications, and chooser cancellation/denial behavior.
- Brave Mobile did not discover the HR6 and returned the adapter's “No heart-rate monitor was selected” error. Brave is not a supported target; Chrome on Android remains primary.

The monitor firmware version and exact notification cadence were not recorded and must not be inferred. The fuller Android hardware acceptance record required by Phase 10A remains a later release gate.

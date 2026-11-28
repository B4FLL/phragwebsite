# Local server for the Playwright checks: like `python3 -m http.server 8000`, but with a longer
# connection queue. The built-in one queues only 5 waiting connections and drops the rest when a
# page opens many at once (map tiles, scripts), so a test can randomly time out waiting for the map.
#
# Run from the project root:  python3 tests/serve.py
import functools
import http.server
import os


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
handler.log_message = lambda *args: None  # keep the terminal quiet
print("Serving the project at http://localhost:8000 (Ctrl+C to stop)")
Server(("", 8000), handler).serve_forever()

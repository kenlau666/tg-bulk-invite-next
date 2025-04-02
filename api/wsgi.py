import sys

from index import app, cleanup_session

if __name__ == "__main__":
    try:
        # Configure Flask for better request handling
        app.config["PROPAGATE_EXCEPTIONS"] = True  # Make sure exceptions are propagated
        app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max upload

        # Run the Flask app with a longer timeout
        app.run(port=5328, debug=True, threaded=True, request_handler=None)
    except Exception as e:
        print(f"Error running Flask app: {str(e)}", file=sys.stderr)
    finally:
        # Clean up all sessions when the app is shutting down
        for session_id in list(session_event_loops.keys()):
            cleanup_session(session_id)
        main_loop.close()

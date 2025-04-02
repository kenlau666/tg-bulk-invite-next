import sys

from index import clean_up_app, run_app

if __name__ == "__main__":
    try:
        # Configure Flask for better request handling
        run_app.config["PROPAGATE_EXCEPTIONS"] = (
            True  # Make sure exceptions are propagated
        )
        run_app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max upload

        # Run the Flask app with a longer timeout
        run_app.run(port=5328, debug=True, threaded=True, request_handler=None)
    except Exception as e:
        print(f"Error running Flask app: {str(e)}", file=sys.stderr)
    finally:
        # Clean up all sessions when the app is shutting down
        clean_up_app()

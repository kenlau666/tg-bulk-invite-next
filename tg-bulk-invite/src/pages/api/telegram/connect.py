from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
import random

app = Flask(__name__)

# Store active clients (in production, use a proper database)
active_clients = {}

@app.route('/connect', methods=['POST'])
async def connect():
    data = request.json
    api_id = data.get('apiId')
    api_hash = data.get('apiHash')
    phone = data.get('phoneNumber')
    code = data.get('code')
    session_id = data.get('sessionId')

    try:
        if code and session_id in active_clients:
            client = active_clients[session_id]['client']
            await client.sign_in(phone, code)
            session_str = client.session.save()
            return jsonify({
                'success': True,
                'message': 'Successfully connected!',
                'session': session_str
            })

        client = TelegramClient(StringSession(), int(api_id), api_hash)
        
        # Use start() instead of connect()
        await client.start(phone=phone, code_callback=lambda: code if code else None)

        if not await client.is_user_authorized():
            session_id = str(random.randint(10000, 99999))
            active_clients[session_id] = {
                'client': client,
                'phone': phone
            }
            return jsonify({
                'success': True,
                'message': 'Please enter the verification code sent to your phone',
                'sessionId': session_id
            })

        return jsonify({
            'success': True,
            'message': 'Already authorized'
        })

    except Exception as e:
        print(f"Connection error: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500 
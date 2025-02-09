from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
import random
from telethon.tl.functions.contacts import AddContactRequest
from telethon.tl.functions.messages import AddChatUserRequest
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.types import InputPeerChannel, InputPeerChat
import asyncio
from functools import wraps

app = Flask(__name__)

# Store active clients (in production, use a proper database)
active_clients = {}

# Create and set a single event loop for the application
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

def async_route(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        return loop.run_until_complete(f(*args, **kwargs))
    return wrapped

@app.route("/api/python")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route('/api/connect', methods=['POST'])
@async_route
async def connect():
    data = request.json
    api_id = data.get('apiId')
    api_hash = data.get('apiHash')
    phone = data.get('phoneNumber')
    session_id = data.get('sessionId')
    code = data.get('code')

    try:
        # If we have a session_id and code, use the existing client
        if session_id and code and session_id in active_clients:
            client = active_clients[session_id]['client']
            try:
                await client.sign_in(phone=active_clients[session_id]['phone'], code=code)
                
                if await client.is_user_authorized():
                    return jsonify({
                        'success': True,
                        'message': 'Successfully authenticated'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'message': 'Invalid code'
                    }), 400
            except Exception as e:
                if "UPDATE_APP_TO_LOGIN" in str(e):
                    return jsonify({
                        'success': False,
                        'message': 'This phone number is not supported. Please try a different phone number.'
                    }), 400
                raise e

        # Initial connection
        client = TelegramClient(StringSession(), int(api_id), api_hash)
        
        # Define code callback that will raise an exception to handle it later
        async def code_callback():
            session_id = str(random.randint(10000, 99999))
            active_clients[session_id] = {
                'client': client,
                'phone': phone
            }
            raise CodeRequiredException(session_id)

        try:
            await client.start(phone=phone, code_callback=code_callback)
            
            # If we get here, user is already authorized
            return jsonify({
                'success': True,
                'message': 'Already authorized'
            })

        except Exception as e:
            if "UPDATE_APP_TO_LOGIN" in str(e):
                return jsonify({
                    'success': False,
                    'message': 'This phone number is not supported. Please try a different phone number.'
                }), 400
            elif isinstance(e, CodeRequiredException):
                return jsonify({
                    'success': True,
                    'message': 'A verification code has been sent to your phone. Please enter the verification code.',
                    'sessionId': e.session_id
                })
            raise e

    except Exception as e:
        print(f"Connection error: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

# Custom exception to handle code request
class CodeRequiredException(Exception):
    def __init__(self, session_id):
        self.session_id = session_id

@app.route('/api/getParticipants', methods=['POST'])
@async_route
async def get_participants():
    data = request.json
    source_groups = data.get('sourceGroups')
    target_group = data.get('targetGroup')
    session_id = data.get('sessionId')

    try:
        if session_id not in active_clients:
            return jsonify({
                'success': False,
                'message': 'No active session found'
            }), 400

        client = active_clients[session_id]['client']
        all_participants = []
        invited_count = 0
        skipped_count = 0

        # Store already processed users to avoid duplicates
        if 'processed_users' not in active_clients[session_id]:
            active_clients[session_id]['processed_users'] = set()
        processed_users = active_clients[session_id]['processed_users']

        # Get target group participants
        target_participants = await client.get_participants(target_group)
        target_member_ids = {p.id for p in target_participants}

        # Get target input entity and determine group type
        target_entity = await client.get_input_entity(target_group)
        is_channel = isinstance(target_entity, InputPeerChannel)

        # Process source groups
        for group_link in source_groups:
            try:
                participants = await client.get_participants(group_link)
                print(f"Found {len(participants)} participants in {group_link}")

                for participant in participants:
                    if participant.id in target_member_ids:
                        print(f"{participant.first_name or 'User'} is already in target group")
                        skipped_count += 1
                        continue

                    if participant.id in processed_users:
                        print(f"{participant.first_name or 'User'} was already processed before")
                        skipped_count += 1
                        continue

                    try:
                        # Add to contacts if not already added
                        try:
                            await client(AddContactRequest(
                                id=participant.id,
                                first_name=participant.first_name,
                                last_name=participant.last_name,
                                phone=participant.phone
                            ))
                            print(f"Added {participant.first_name or 'User'} to contacts")
                        except Exception as e:
                            print(f"Failed to add {participant.first_name or 'User'} to contacts: {str(e)}")

                        # Add user based on group type
                        if is_channel:
                            # For supergroups and channels
                            await client(InviteToChannelRequest(
                                channel=target_entity,
                                users=[participant]
                            ))
                            print(f"Invited {participant.first_name or 'User'} to channel/supergroup")
                        else:
                            # For regular groups
                            await client(AddChatUserRequest(
                                chat_id=target_entity.chat_id,  # For InputPeerChat, we use chat_id
                                user_id=participant,
                                fwd_limit=300
                            ))
                            print(f"Added {participant.first_name or 'User'} to regular group")
                        
                        # Mark as processed
                        processed_users.add(participant.id)
                        invited_count += 1

                        # Random delay between 1-3 minutes
                        delay = random.randint(60, 180)
                        print(f"Waiting {delay} seconds before inviting {participant.first_name or 'User'}")
                        await asyncio.sleep(delay)
                        
                    except Exception as e:
                        print(f"Failed to process {participant.first_name or 'User'}: {str(e)}")

                    all_participants.append(participant)

            except Exception as e:
                print(f"Error getting participants from {group_link}: {str(e)}")

        return jsonify({
            'success': True,
            'message': f'Processed {len(all_participants)} participants: {invited_count} invited, {skipped_count} skipped',
            'participants': [{
                'id': p.id, 
                'firstName': p.first_name,
                'status': 'invited' if p.id in processed_users else 
                         'skipped' if p.id in target_member_ids else 'pending'
            } for p in all_participants],
            'stats': {
                'total': len(all_participants),
                'invited': invited_count,
                'skipped': skipped_count
            }
        })

    except Exception as e:
        print(f"Error getting participants: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    try:
        app.run(port=5328)
    finally:
        loop.close() 
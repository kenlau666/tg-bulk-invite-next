from flask import Flask, request, jsonify
from telethon import TelegramClient
from telethon.sessions import StringSession
import random
from telethon.tl.functions.contacts import AddContactRequest
from telethon.tl.functions.messages import AddChatUserRequest, GetHistoryRequest
from telethon.tl.functions.channels import InviteToChannelRequest, GetFullChannelRequest
from telethon.tl.types import InputPeerChannel, InputPeerChat, ChannelParticipantsSearch
import asyncio
from functools import wraps
import sys
from threading import Thread
import time
from telethon.errors import ChatAdminRequiredError
from threading import Thread


app = Flask(__name__)

# Store active clients and their tasks
active_clients = {}
active_tasks = {}

# Add this global variable to store background tasks
background_tasks = {}

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

@app.route('/api/stop', methods=['POST'])
@async_route
async def stop_process():
    data = request.json
    session_id = data.get('sessionId')
    
    if session_id in active_tasks and not active_tasks[session_id].done():
        active_tasks[session_id].cancel()
        try:
            await active_tasks[session_id]
        except asyncio.CancelledError:
            pass
        return jsonify({
            'success': True,
            'message': 'Process stopped'
        })
    
    return jsonify({
        'success': False,
        'message': 'No active process found'
    }), 400

@app.route('/api/getParticipants', methods=['POST'])
@async_route
async def get_participants():
    data = request.json
    source_groups = data.get('sourceGroups')
    target_group = data.get('targetGroup')
    session_id = data.get('sessionId')
    previously_invited = data.get('previouslyInvited', [])
    max_per_group = data.get('maxPerGroup', 0)
    delay_range = data.get('delayRange', {'min': 60, 'max': 60})
    
    # Ensure maxMessages is at least 1, default to 3000
    max_messages = max(1, data.get('maxMessages', 3000))

    try:
        if session_id not in active_clients:
            return jsonify({
                'success': False,
                'message': 'No active session found'
            }), 400

        client = active_clients[session_id]['client']
        eligible_participants = []
        
        # Get target group info
        target_entity = await client.get_input_entity(target_group)
        is_channel = isinstance(target_entity, InputPeerChannel)
        target_participants = await client.get_participants(target_group)
        target_member_ids = {p.id for p in target_participants}

        # Store target entity in active_clients
        active_clients[session_id]['target_entity'] = target_entity
        active_clients[session_id]['is_channel'] = is_channel
        active_clients[session_id]['delay_range'] = delay_range

        previously_invited_to_target = {
            invite['id'] for invite in previously_invited 
            if invite['groupId'] == target_group
        }

        for group_link in source_groups:
            try:
                # Get group info first
                group_entity = await client.get_input_entity(group_link)
                
                try:
                    # Try to get full channel info
                    full_channel = await client(GetFullChannelRequest(channel=group_entity))
                    total_participants = full_channel.full_chat.participants_count
                    
                    # Try to get participants directly first
                    participants = await client.get_participants(group_link)
                    
                    # If we can't get all participants, use message history
                    if len(participants) < total_participants:
                        seen_senders = set()
                        message_participants = []
                        
                        # Get messages and process them with the max_messages limit
                        messages = await client.get_messages(group_entity, limit=max_messages)
                        for message in messages:                            
                            if message.sender_id and message.sender_id not in seen_senders:
                                try:
                                    sender = await client.get_entity(message.sender_id)
                                    message_participants.append(sender)
                                    seen_senders.add(message.sender_id)
                                except Exception as e:
                                    print(f"Error getting sender info: {str(e)}", file=sys.stderr)
                                    continue
                        
                        # Combine participants from both methods
                        participants.extend(message_participants)

                    # First check eligibility for all participants
                    group_eligible_participants = []
                    for participant in participants:
                        if (participant.id not in target_member_ids and 
                            participant.id not in previously_invited_to_target):
                            group_eligible_participants.append({
                                'id': participant.id,
                                'firstName': participant.first_name,
                                'lastName': participant.last_name,
                                'username': participant.username,
                                'phone': participant.phone,
                                'status': 'pending'
                            })

                    # Then apply max per group limit if set
                    if max_per_group > 0:
                        group_eligible_participants = group_eligible_participants[:max_per_group]

                    # Add to overall eligible participants
                    eligible_participants.extend(group_eligible_participants)

                except ChatAdminRequiredError:
                    print(f"Admin rights required to get full participant list for {group_link}", file=sys.stderr)
                    # Continue with message history approach
                    seen_senders = set()
                    participants = []
                    
                    messages = await client.get_messages(group_entity, limit=max_messages)
                    for message in messages:                            
                        if message.sender_id and message.sender_id not in seen_senders:
                            try:
                                sender = await client.get_entity(message.sender_id)
                                participants.append(sender)
                                seen_senders.add(message.sender_id)
                            except Exception as e:
                                print(f"Error getting sender info: {str(e)}", file=sys.stderr)
                                continue

                    # First check eligibility for all participants
                    group_eligible_participants = []
                    for participant in participants:
                        if (participant.id not in target_member_ids and 
                            participant.id not in previously_invited_to_target):
                            group_eligible_participants.append({
                                'id': participant.id,
                                'firstName': participant.first_name,
                                'lastName': participant.last_name,
                                'username': participant.username,
                                'phone': participant.phone,
                                'status': 'pending'
                            })

                    # Then apply max per group limit if set
                    if max_per_group > 0:
                        group_eligible_participants = group_eligible_participants[:max_per_group]

                    # Add to overall eligible participants
                    eligible_participants.extend(group_eligible_participants)

            except Exception as e:
                print(f"Error getting participants from {group_link}: {str(e)}", file=sys.stderr)
                continue

        # Store eligible participants for background invite
        active_clients[session_id]['eligible_participants'] = eligible_participants

        return jsonify({
            'success': True,
            'message': f'Found {len(eligible_participants)} eligible participants',
            'participants': eligible_participants
        })

    except Exception as e:
        print(f"Error getting participants: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/inviteParticipant', methods=['POST'])
@async_route
async def invite_participant():
    data = request.json
    session_id = data.get('sessionId')
    participant = data.get('participant')

    try:
        if session_id not in active_clients:
            return jsonify({
                'success': False,
                'message': 'No active session found'
            }), 400

        client = active_clients[session_id]['client']
        target_entity = active_clients[session_id]['target_entity']
        is_channel = active_clients[session_id]['is_channel']

        try:
            # Add to contacts
            await client(AddContactRequest(
                id=participant['id'],
                first_name=participant['firstName'] or '',
                last_name=participant['lastName'] or '',
                phone=participant['phone'] or '',
                add_phone_privacy_exception=False
            ))

            # delay = 61
            # await asyncio.sleep(delay)

            # Invite to group
            if is_channel:
                await client(InviteToChannelRequest(
                    channel=target_entity,
                    users=[participant['id']]
                ))
            else:
                await client(AddChatUserRequest(
                    chat_id=target_entity.chat_id,
                    user_id=participant['id'],
                    fwd_limit=300
                ))

            return jsonify({
                'success': True,
                'message': 'Successfully invited participant'
            })

        except Exception as e:
            print(f"Failed to process {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': str(e)
            }), 500

    except Exception as e:
        print(f"Error inviting participant: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

def run_background_invite(session_id, participants, delay_range, client, target_entity, is_channel):
    async def _invite_participants():
        for participant in participants:
            try:
                # Add to contacts
                await client(AddContactRequest(
                    id=participant['id'],
                    first_name=participant['firstName'] or '',
                    last_name=participant['lastName'] or '',
                    phone=participant['phone'] or '',
                    add_phone_privacy_exception=False
                ))

                # Invite to group with retry mechanism
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        if is_channel:
                            await client(InviteToChannelRequest(
                                channel=target_entity,
                                users=[participant['id']]
                            ))
                        else:
                            await client(AddChatUserRequest(
                                chat_id=target_entity.chat_id,
                                user_id=participant['id'],
                                fwd_limit=300
                            ))
                        break  # If successful, break retry loop
                    except Exception as e:
                        if attempt == max_retries - 1:  # Last attempt
                            raise e
                        await asyncio.sleep(30)  # Wait 30 seconds before retry

                # Random delay between invites
                delay_seconds = random.randint(delay_range['min'], delay_range['max'])
                await asyncio.sleep(delay_seconds)

            except Exception as e:
                print(f"Failed to process {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
                await asyncio.sleep(60)  # Wait a minute before next participant on error
                continue

    try:
        loop.run_until_complete(_invite_participants())
    except Exception as e:
        print(f"Background task error: {str(e)}", file=sys.stderr)
    finally:
        loop.close()
        if session_id in background_tasks:
            del background_tasks[session_id]
            
@app.route('/api/startBackgroundInvite', methods=['POST'])
@async_route
async def start_background_invite():
    data = request.json
    session_id = data.get('sessionId')
    delay_range = data.get('delayRange', {'min': 60, 'max': 60})
    participants = data.get('participants')

    if session_id not in active_clients:
        return jsonify({
            'success': False,
            'message': 'No active session found'
        }), 400

    client = active_clients[session_id]['client']
    target_entity = active_clients[session_id]['target_entity']
    is_channel = active_clients[session_id]['is_channel']

    if not participants:
        return jsonify({
            'success': False,
            'message': 'No participants to invite'
        }), 400

    try:
        # Cancel existing background task if any
        if session_id in background_tasks:
            background_tasks[session_id].join(timeout=1)
            del background_tasks[session_id]

        # Start new background thread
        thread = Thread(
            target=run_background_invite,
            args=(session_id, participants, delay_range, client, target_entity, is_channel)
        )
        thread.daemon = True  # Make thread daemon so it won't prevent server shutdown
        thread.start()
        
        # Store the thread
        background_tasks[session_id] = thread

        return jsonify({
            'success': True,
            'message': f'Background invite process started for {len(participants)} participants'
        })

    except Exception as e:
        print(f"Error starting background invite: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    try:
        app.run(port=5328, debug=True)
    finally:
        loop.close() 
import threading
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
import concurrent.futures
from telethon.errors import ChatAdminRequiredError

app = Flask(__name__)

# Store active clients and their tasks
active_clients = {}
active_tasks = {}

# Store background tasks
background_tasks = {}

# Store event loops and threads for each session
session_event_loops = {}
session_threads = {}

# Create and set a single event loop for the application
main_loop = asyncio.new_event_loop()
asyncio.set_event_loop(main_loop)

def start_background_loop(loop: asyncio.AbstractEventLoop, session_id: str) -> None:
    """Start a background loop for a specific session"""
    try:
        asyncio.set_event_loop(loop)
        loop.run_forever()
    except Exception as e:
        print(f"Error in background loop for session {session_id}: {str(e)}", file=sys.stderr)
    finally:
        print(f"Background loop for session {session_id} has stopped", file=sys.stderr)

def create_session_thread(session_id: str) -> None:
    """Create a new thread with its own event loop for a session"""
    if session_id in session_threads and session_threads[session_id].is_alive():
        print(f"Thread for session {session_id} already exists", file=sys.stderr)
        return
        
    # Create a new event loop for this session
    loop = asyncio.new_event_loop()
    session_event_loops[session_id] = loop
    
    # Create and start a thread for this session
    thread = Thread(target=start_background_loop, args=(loop, session_id), daemon=True)
    session_threads[session_id] = thread
    thread.start()
    
    print(f"Created new thread and event loop for session {session_id}", file=sys.stderr)

def cleanup_session(session_id: str) -> None:
    """Clean up resources for a session"""
    try:
        # Stop the event loop
        if session_id in session_event_loops:
            loop = session_event_loops[session_id]
            loop.call_soon_threadsafe(loop.stop)
            print(f"Stopped event loop for session {session_id}", file=sys.stderr)
            del session_event_loops[session_id]
        
        # Remove thread reference
        if session_id in session_threads:
            print(f"Removed thread reference for session {session_id}", file=sys.stderr)
            del session_threads[session_id]
            
        # Clean up client
        if session_id in active_clients:
            print(f"Removed client reference for session {session_id}", file=sys.stderr)
            del active_clients[session_id]
            
        # Clean up background task
        if session_id in background_tasks:
            print(f"Removed background task reference for session {session_id}", file=sys.stderr)
            del background_tasks[session_id]
    except Exception as e:
        print(f"Error cleaning up session {session_id}: {str(e)}", file=sys.stderr)

def async_route(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        return main_loop.run_until_complete(f(*args, **kwargs))
    return wrapped

@app.route("/api/python")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/api/python/async")
@async_route
async def hello_world():
    return "<p>Hello, World! async</p>"

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
            # We need to run this in the session's event loop
            if session_id not in session_event_loops:
                return jsonify({
                    'success': False,
                    'message': 'Session expired or invalid'
                }), 400
                
            loop = session_event_loops[session_id]
            client = active_clients[session_id]['client']
            
            # Create a future to run sign_in in the session's event loop
            print("sign_in_future", file=sys.stderr)
            sign_in_future = asyncio.run_coroutine_threadsafe(
                client.sign_in(phone=active_clients[session_id]['phone'], code=code),
                loop
            )
            
            try:
                # Wait for the result without timeout
                sign_in_future.result()
                
                # Check if authorized
                is_authorized_future = asyncio.run_coroutine_threadsafe(
                    client.is_user_authorized(),
                    loop
                )
                is_authorized = is_authorized_future.result()
                
                if is_authorized:
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
                return jsonify({
                    'success': False,
                    'message': f'Authentication error: {str(e)}'
                }), 400

        # Initial connection - create a new session ID
        session_id = str(random.randint(10000, 99999))
        
        # Create a new thread and event loop for this session
        create_session_thread(session_id)
        
        # We need to create and start the client in the session's thread
        # First, create a Future to store the result
        result_future = asyncio.Future(loop=main_loop)
        
        # Define the async function to run in the session's event loop
        async def _create_and_start():
            try:
                # Create the client with the session's event loop
                client = TelegramClient(StringSession(), int(api_id), api_hash)
                
                # Store the client
                active_clients[session_id] = {
                    'client': client,
                    'phone': phone
                }
                
                # Define code callback
                async def code_callback():
                    print("code_callback", file=sys.stderr)
                    raise CodeRequiredException(session_id)
                
                # Start the client
                print("start_client", file=sys.stderr)
                await client.start(phone=phone, code_callback=code_callback)
                
                # If we get here, user is already authorized
                return {'success': True, 'already_authorized': True}
            except CodeRequiredException:
                # Code required
                return {'success': True, 'already_authorized': False, 'code_required': True}
            except Exception as e:
                # Other error
                print(f"Error in _create_and_start: {str(e)}", file=sys.stderr)
                return {'success': False, 'error': str(e)}
        
        # Get the session's event loop
        loop = session_event_loops[session_id]
        
        # Run the coroutine in the session's event loop using run_coroutine_threadsafe
        # This follows the pattern in asyncio_loop_in_thread.py
        print("Running _create_and_start in session thread", file=sys.stderr)
        future = asyncio.run_coroutine_threadsafe(_create_and_start(), loop)
        
        try:
            # Wait for the result without timeout
            print("Waiting for future result", file=sys.stderr)
            result = future.result()
            print(f"Got result: {result}", file=sys.stderr)
            
            if not result['success']:
                error = result.get('error', 'Unknown error')
                if "UPDATE_APP_TO_LOGIN" in error:
                    return jsonify({
                        'success': False,
                        'message': 'This phone number is not supported. Please try a different phone number.'
                    }), 400
                return jsonify({
                    'success': False,
                    'message': error
                }), 500
            
            if result.get('already_authorized', False):
                # User is already authorized
                return jsonify({
                    'success': True,
                    'message': 'Already authorized',
                    'sessionId': session_id
                })
            else:
                # Code required
                return jsonify({
                    'success': True,
                    'message': 'A verification code has been sent to your phone. Please enter the verification code.',
                    'sessionId': session_id
                })
        except Exception as e:
            error_str = str(e)
            print(f"Error getting future result: {error_str}", file=sys.stderr)
            # Clean up if there was an error
            cleanup_session(session_id)
            return jsonify({
                'success': False,
                'message': f'Connection error: {error_str}'
            }), 500

    except Exception as e:
        print(f"Connection error: {str(e)}")
        # Clean up if there was an error
        if session_id and session_id not in active_clients:
            cleanup_session(session_id)
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
    
    if session_id in background_tasks:
        try:
            background_tasks[session_id].cancel()
            del background_tasks[session_id]
            return jsonify({
                'success': True,
                'message': 'Background process stopped'
            })
        except Exception as e:
            print(f"Error stopping background task: {str(e)}", file=sys.stderr)
            return jsonify({
                'success': False,
                'message': f'Error stopping background task: {str(e)}'
            }), 500
    
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
    max_messages = max(1, data.get('maxMessages', 3000))
    only_recently_active = data.get('onlyRecentlyActive', True)

    try:
        if session_id not in active_clients:
            return jsonify({
                'success': False,
                'message': 'No active session found'
            }), 400

        client = active_clients[session_id]['client']
        
        # Make sure we have an event loop for this session
        if session_id not in session_event_loops:
            create_session_thread(session_id)
        
        # Get the session's event loop
        loop = session_event_loops[session_id]
        
        # Define the async function to run in the session's event loop
        async def _get_participants():
            try:
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

                # Create a task for each source group
                async def process_group(group_link):
                    try:
                        print("process group", file=sys.stderr)
                        group_eligible_participants = []
                        
                        # Get group info first
                        group_entity = await client.get_input_entity(group_link)
                        print("get_input_entity", file=sys.stderr)

                        try:
                            # Try to get full channel info
                            print("GetFullChannelRequest", file=sys.stderr)
                            full_channel = await client(GetFullChannelRequest(channel=group_entity))
                            total_participants = full_channel.full_chat.participants_count
                            
                            # Try to get participants directly first
                            print("get_participants", file=sys.stderr)

                            participants = await client.get_participants(group_link, limit=max_per_group)
                            print(len(participants), file=sys.stderr)
                            # If we can't get all participants, use message history
                            if len(participants) < total_participants and len(participants) < 99:
                                participants = []
                                seen_senders = set()
                                message_participants = []
                                
                                # Get messages and process them with the max_messages limit
                                messages = await client.get_messages(group_entity, limit=max_messages)
                                
                                # Create tasks for getting sender entities
                                sender_tasks = []
                                for message in messages:
                                    if message.sender_id and message.sender_id not in seen_senders:
                                        seen_senders.add(message.sender_id)
                                        sender_tasks.append(asyncio.create_task(
                                            _get_sender_entity(message.sender_id)
                                        ))
                                
                                # Gather all sender entities
                                sender_results = await asyncio.gather(*sender_tasks, return_exceptions=True)
                                for result in sender_results:
                                    if not isinstance(result, Exception) and result is not None:
                                        message_participants.append(result)
                                
                                # Combine participants from both methods
                                participants.extend(message_participants)

                            if max_per_group > 0 and len(participants) > max_per_group:
                                participants = participants[:max_per_group]

                            for participant in participants:
                                # Check eligibility criteria
                                if process_participant(participant, target_member_ids, previously_invited_to_target, only_recently_active):
                                    group_eligible_participants.append(participant_to_dict(participant))
                            return group_eligible_participants

                        except ChatAdminRequiredError:
                            print(f"Admin rights required to get full participant list for {group_link}", file=sys.stderr)
                            # Continue with message history approach
                            seen_senders = set()
                            participants = []
                            
                            messages = await client.get_messages(group_entity, limit=max_messages)
                            
                            # Create tasks for getting sender entities
                            sender_tasks = []
                            for message in messages:
                                if message.sender_id and message.sender_id not in seen_senders:
                                    seen_senders.add(message.sender_id)
                                    sender_tasks.append(asyncio.create_task(
                                        _get_sender_entity(message.sender_id)
                                    ))
                            
                            # Gather all sender entities
                            sender_results = await asyncio.gather(*sender_tasks, return_exceptions=True)
                            for result in sender_results:
                                if not isinstance(result, Exception) and result is not None:
                                    participants.append(result)

                            # Process participants
                            for participant in participants:
                                # Check eligibility criteria
                                if process_participant(participant, target_member_ids, previously_invited_to_target, only_recently_active):
                                    group_eligible_participants.append(participant_to_dict(participant))

                            return group_eligible_participants

                    except Exception as e:
                        print(f"Error getting participants from {group_link}: {str(e)}", file=sys.stderr)
                        return []
                
                # Helper function to get a sender entity
                async def _get_sender_entity(sender_id):
                    try:
                        return await client.get_entity(sender_id)
                    except Exception as e:
                        print(f"Error getting sender info: {str(e)}", file=sys.stderr)
                        return None
                
                # Create tasks for each source group
                group_tasks = [asyncio.create_task(process_group(group_link)) for group_link in source_groups]
                # Gather results from all groups
                group_results = await asyncio.gather(*group_tasks, return_exceptions=True)
                
                # Combine eligible participants from all groups
                for result in group_results:
                    if not isinstance(result, Exception) and result:
                        eligible_participants.extend(result)

                # Store eligible participants for background invite
                active_clients[session_id]['eligible_participants'] = eligible_participants

                return {
                    'success': True,
                    'message': f'Found {len(eligible_participants)} eligible participants',
                    'participants': eligible_participants
                }
            except Exception as e:
                print(f"Error in _get_participants: {str(e)}", file=sys.stderr)
                return {
                    'success': False,
                    'message': str(e)
                }
        
        # Helper functions for participant processing
        def process_participant(participant, target_member_ids, previously_invited_to_target, only_recently_active):
            # Check if user was recently active
            is_recently_active = True
            if only_recently_active:
                try:
                    # Get user's status
                    user_status = participant.status
                    # Check if user was online recently (within last 7 days)
                    import datetime
                    now = datetime.datetime.now(datetime.timezone.utc)
                    if hasattr(user_status, 'was_online'):
                        # Calculate days since last online
                        days_since_online = (now - user_status.was_online).days
                        is_recently_active = days_since_online <= 7
                    elif hasattr(user_status, 'expires'):
                        # User is online or was recently
                        is_recently_active = True
                    else:
                        # Unknown status, default to include
                        is_recently_active = True
                except Exception as e:
                    print(f"Error checking user status: {str(e)}", file=sys.stderr)
                    return False

            return (participant.id not in target_member_ids and 
                    participant.id not in previously_invited_to_target and
                    (not only_recently_active or is_recently_active))
        
        def participant_to_dict(participant):
            # Add status info to the participant data
            status_text = "Unknown"
            try:
                import datetime
                if hasattr(participant.status, 'was_online'):
                    status_text = f"Last seen {(datetime.datetime.now(datetime.timezone.utc) - participant.status.was_online).days} days ago"
                elif hasattr(participant.status, 'expires'):
                    status_text = "Online recently"
                else:
                    status_text = str(participant.status)
                      
                return {
                    'id': participant.id,
                    'firstName': participant.first_name,
                    'lastName': participant.last_name,
                    'username': participant.username,
                    'phone': participant.phone,
                    'status': 'pending',
                    'lastSeen': status_text
                }
            
            except:
                pass

        
        # Run the async function in the session's event loop
        future = asyncio.run_coroutine_threadsafe(_get_participants(), loop)
        
        # Wait for the result
        result = future.result()
        
        if not result['success']:
            return jsonify({
                'success': False,
                'message': result['message']
            }), 500
        
        return jsonify(result)

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
        
        # Make sure we have an event loop for this session
        if session_id not in session_event_loops:
            create_session_thread(session_id)
        
        # Get the session's event loop
        loop = session_event_loops[session_id]
        
        # Define the async function to run in the session's event loop
        async def _invite_participant():
            try:
                # Add to contacts
                await client(AddContactRequest(
                    id=participant['id'],
                    first_name=participant['firstName'] or '',
                    last_name=participant['lastName'] or '',
                    phone=participant['phone'] or '',
                    add_phone_privacy_exception=False
                ))

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
                return {
                    'success': True,
                    'message': f"Successfully invited {participant['firstName'] or 'User'}"
                }
            except Exception as e:
                print(f"Error processing {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
                return {
                    'success': False,
                    'message': str(e)
                }
        
        # Run the coroutine in the session's event loop
        future = asyncio.run_coroutine_threadsafe(_invite_participant(), loop)
        
        # Wait for the result without timeout
        result = future.result()
        return jsonify(result)

    except Exception as e:
        print(f"Error inviting participant: {str(e)}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/inviteByPhoneNumbers', methods=['POST'])
@async_route
async def invite_by_phone_numbers():
    data = request.json
    session_id = data.get('sessionId')
    phone_numbers = data.get('phoneNumbers', [])
    target_group = data.get('targetGroup')
    delay_range = data.get('delayRange', {'min': 60, 'max': 60})
    interactive = data.get('interactive', False)  # New parameter for interactive mode

    if session_id not in active_clients:
        return jsonify({
            'success': False,
            'message': 'No active session found'
        }), 400

    client = active_clients[session_id]['client']
    
    # Make sure we have an event loop for this session
    if session_id not in session_event_loops:
        create_session_thread(session_id)
    
    # Get the session's event loop
    loop = session_event_loops[session_id]
    
    # Define the async function to run in the session's event loop
    async def _invite_by_phone_numbers():
        try:
            # Get target group info
            target_entity = await client.get_input_entity(target_group)
            is_channel = isinstance(target_entity, InputPeerChannel)
            
            # Store target entity in active_clients
            active_clients[session_id]['target_entity'] = target_entity
            active_clients[session_id]['is_channel'] = is_channel
            active_clients[session_id]['delay_range'] = delay_range

            # Process phone numbers in batches to avoid overwhelming the API
            participants = []
            batch_size = 10  # Process 10 phone numbers at a time
            
            # Helper function to process a single phone number
            async def process_phone(phone):
                try:
                    # Clean the phone number
                    phone = phone.strip()
                    if not phone:
                        return None
                        
                    # Try to get user by phone
                    try:
                        from telethon.tl.functions.contacts import ImportContactsRequest
                        from telethon.tl.types import InputPhoneContact
                        
                        result = await client(ImportContactsRequest([
                            InputPhoneContact(
                                client_id=0,
                                phone=phone,
                                first_name="User",
                                last_name=""
                            )
                        ]))
                        if result.users:
                            user = result.users[0]
                            return {
                                'id': user.id,
                                'firstName': user.first_name,
                                'lastName': user.last_name,
                                'username': user.username,
                                'phone': phone,
                                'status': 'pending'
                            }
                        else:
                            # Return with just the phone number for later processing
                            return {
                                'id': None,
                                'firstName': None,
                                'lastName': None,
                                'username': None,
                                'phone': phone,
                                'status': 'pending'
                            }
                    except Exception as e:
                        print(f"Error importing contact for phone {phone}: {str(e)}", file=sys.stderr)
                        # Return with just the phone number
                        return {
                            'id': None,
                            'firstName': None,
                            'lastName': None,
                            'username': None,
                            'phone': phone,
                            'status': 'pending'
                        }
                except Exception as e:
                    print(f"Error processing phone number {phone}: {str(e)}", file=sys.stderr)
                    return None
            
            # Process phone numbers in batches
            for i in range(0, len(phone_numbers), batch_size):
                batch = phone_numbers[i:i+batch_size]
                
                # Create tasks for each phone number in the batch
                tasks = [asyncio.create_task(process_phone(phone)) for phone in batch]
                
                # Gather results from all tasks
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Add valid participants to the list
                for result in results:
                    if not isinstance(result, Exception) and result is not None:
                        participants.append(result)
                
                # Add a small delay between batches
                if i + batch_size < len(phone_numbers):
                    await asyncio.sleep(2)

            # If interactive mode, just return the participants without starting background process
            if interactive:
                return {
                    'success': True,
                    'message': f'Processed {len(participants)} phone numbers',
                    'participants': participants
                }
            
            # Otherwise start background invite process
            if participants:
                future = run_background_invite(session_id, participants, delay_range, client, target_entity, is_channel)
                background_tasks[session_id] = future

            return {
                'success': True,
                'message': f'Started invite process for {len(participants)} phone numbers',
                'participants': participants
            }
        except Exception as e:
            print(f"Error in _invite_by_phone_numbers: {str(e)}", file=sys.stderr)
            return {
                'success': False,
                'message': str(e)
            }
    
    # Run the async function in the session's event loop
    future = asyncio.run_coroutine_threadsafe(_invite_by_phone_numbers(), loop)
    
    # Wait for the result
    result = future.result()
    
    if not result['success']:
        return jsonify({
            'success': False,
            'message': result['message']
        }), 500
    
    return jsonify(result)

def run_background_invite(session_id, participants, delay_range, client, target_entity, is_channel):
    print(f"Running background invite for session {session_id}", file=sys.stderr)
    
    # Check if we have an event loop for this session
    if session_id not in session_event_loops:
        print(f"No event loop found for session {session_id}", file=sys.stderr)
        raise ValueError(f"No event loop found for session {session_id}")
    
    # Get the event loop for this session
    session_loop = session_event_loops[session_id]
    print(f"Using event loop for session {session_id}: {session_loop}", file=sys.stderr)
    
    # Create a future to track completion
    result_future = concurrent.futures.Future()
    
    # Define the async function to run in the session's event loop
    async def _invite_participants():
        print(f"Inviting participants in session {session_id}", file=sys.stderr)
        try:
            # Process participants in batches to avoid overwhelming the API
            batch_size = 5  # Process 5 participants at a time
            for i in range(0, len(participants), batch_size):
                batch = participants[i:i+batch_size]
                
                # Create tasks for each participant in the batch
                tasks = []
                for participant in batch:
                    task = asyncio.create_task(_process_participant(participant))
                    tasks.append(task)
                
                # Wait for all tasks in the batch to complete
                await asyncio.gather(*tasks, return_exceptions=True)
                
                # Add a small delay between batches
                await asyncio.sleep(5)
        finally:
            # Clean up when done
            if session_id in background_tasks:
                del background_tasks[session_id]
                print(f"Background task for session {session_id} completed", file=sys.stderr)
            
            # Clean up session resources when background invite is finished
            cleanup_session(session_id)
            
            # Set the result in the future
            result_future.set_result(True)
    
    # Helper function to process a single participant
    async def _process_participant(participant):
        try:
            # For phone-only participants, try to import contact first
            if participant.get('id') is None and participant.get('phone'):
                try:
                    # Import contact
                    from telethon.tl.functions.contacts import ImportContactsRequest
                    from telethon.tl.types import InputPhoneContact
                    
                    result = await client(ImportContactsRequest([
                        InputPhoneContact(
                            client_id=0,
                            phone=participant['phone'],
                            first_name=participant.get('firstName') or 'User',
                            last_name=participant.get('lastName') or ''
                        )
                    ]))
                    
                    if result.users:
                        # Update participant with user info
                        user = result.users[0]
                        participant['id'] = user.id
                        participant['firstName'] = user.first_name
                        participant['lastName'] = user.last_name
                        participant['username'] = user.username
                        print(f"Successfully imported contact: {participant['phone']}", file=sys.stderr)
                    else:
                        print(f"No user found for phone: {participant['phone']}", file=sys.stderr)
                        return
                except Exception as e:
                    print(f"Error importing contact {participant['phone']}: {str(e)}", file=sys.stderr)
                    return

            # Skip if we still don't have an ID
            if participant.get('id') is None:
                print(f"Skipping participant with no ID: {participant.get('phone')}", file=sys.stderr)
                return

            # Add to contacts with retry mechanism
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    await client(AddContactRequest(
                        id=participant['id'],
                        first_name=participant['firstName'] or '',
                        last_name=participant['lastName'] or '',
                        phone=participant['phone'] or '',
                        add_phone_privacy_exception=False
                    ))
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        print(f"Failed to add contact {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
                    await asyncio.sleep(30)

            # Invite to group with retry mechanism
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
                    print(f"Successfully invited {participant['firstName'] or 'User'}", file=sys.stderr)
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        print(f"Failed to invite {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
                        await asyncio.sleep(60)  # Longer wait on final failure
                    else:
                        await asyncio.sleep(30)  # Wait between retries

            # Random delay between invites
            delay_seconds = random.randint(delay_range['min'], delay_range['max'])
            await asyncio.sleep(delay_seconds)

        except Exception as e:
            print(f"Error processing {participant['firstName'] or 'User'}: {str(e)}", file=sys.stderr)
            await asyncio.sleep(60)
    
    # Run the async function in the session's event loop
    def start_invite_process():
        try:
            # Set the event loop for this thread
            asyncio.set_event_loop(session_loop)
            
            # Create and run the task
            task = session_loop.create_task(_invite_participants())
        except Exception as e:
            print(f"Error starting invite process: {str(e)}", file=sys.stderr)
            result_future.set_exception(e)
    
    # Schedule the function to run in the session's thread
    session_loop.call_soon_threadsafe(start_invite_process)
    
    return result_future

@app.route('/api/startBackgroundInvite', methods=['POST'])
@async_route
async def start_background_invite():
    data = request.json
    session_id = data.get('sessionId')
    delay_range = data.get('delayRange', {'min': 60, 'max': 60})
    participants = data.get('participants')
    
    print(f"startBackgroundInvite called for session {session_id} with {len(participants) if participants else 0} participants", file=sys.stderr)

    if session_id not in active_clients:
        print(f"No active session found for session {session_id}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': 'No active session found'
        }), 400
        
    print(f"Active client found for session {session_id}", file=sys.stderr)
        
    if session_id not in session_event_loops:
        print(f"No event loop found for session {session_id}", file=sys.stderr)
        # Create a new thread and event loop for this session
        create_session_thread(session_id)
        print(f"Created new event loop for session {session_id}: {session_event_loops[session_id]}", file=sys.stderr)

    client = active_clients[session_id]['client']
    target_entity = active_clients[session_id].get('target_entity')
    is_channel = active_clients[session_id].get('is_channel')
    
    print(f"Client: {client}, Target entity: {target_entity}, Is channel: {is_channel}", file=sys.stderr)

    if not target_entity:
        print(f"No target entity found for session {session_id}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': 'No target group selected'
        }), 400

    if not participants:
        print(f"No participants to invite for session {session_id}", file=sys.stderr)
        return jsonify({
            'success': False,
            'message': 'No participants to invite'
        }), 400

    try:
        print(f"About to start background invite for session {session_id}", file=sys.stderr)
        # Cancel existing background task if any
        if session_id in background_tasks:
            print(f"Found existing background task for session {session_id}", file=sys.stderr)
            try:
                background_tasks[session_id].cancel()
                print(f"Previous background task for session {session_id} cancelled", file=sys.stderr)
            except Exception as e:
                print(f"Error cancelling previous task: {str(e)}", file=sys.stderr)
            del background_tasks[session_id]

        # Start new background task
        print(f"Calling run_background_invite for session {session_id}", file=sys.stderr)
        future = run_background_invite(session_id, participants, delay_range, client, target_entity, is_channel)
        print(f"Background task created for session {session_id}: {future}", file=sys.stderr)
        background_tasks[session_id] = future
        print(f"Background task stored in background_tasks for session {session_id}", file=sys.stderr)

        return jsonify({
            'success': True,
            'message': f'Background invite process started for {len(participants)} participants'
        })

    except Exception as e:
        print(f"Error starting background invite for session {session_id}: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

if __name__ == '__main__':
    try:
        # Configure Flask for better request handling
        app.config['PROPAGATE_EXCEPTIONS'] = True  # Make sure exceptions are propagated
        app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload
        
        # Run the Flask app with a longer timeout
        app.run(port=5328, debug=True, threaded=True, request_handler=None)
    except Exception as e:
        print(f"Error running Flask app: {str(e)}", file=sys.stderr)
    finally:
        # Clean up all sessions when the app is shutting down
        for session_id in list(session_event_loops.keys()):
            cleanup_session(session_id)
        main_loop.close() 